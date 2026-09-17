/**
 * Meta AI watermark remover — server-side, using sharp only.
 *
 * Removes the Meta AI sparkle watermark from the bottom-right corner of
 * generated images using a mirror+blur+feather technique:
 *   1. Extract a strip from just left of the watermark region
 *   2. Flip it horizontally (mirror)
 *   3. Resize to cover the watermark
 *   4. Blur slightly to blend with surrounding content
 *   5. Apply a feathered alpha mask (opaque center, transparent edges)
 *   6. Composite over the original image
 *
 * Uses only `sharp` (already in the project) — no native ML runtime.
 * Fast, reliable, produces good results for the small corner watermark.
 *
 * Inspired by the watermark-remover project
 * (https://github.com/youngkim0/watermark-remover) which uses MI-GAN
 * for browser-based inpainting. Here we use a simpler technique that
 * achieves the same visual result for the corner watermark case without
 * the overhead of loading a 27MB ONNX model.
 */

import sharp from "sharp";

// The Meta AI watermark sits in the bottom-right corner.
// It's a small sparkle icon, roughly 5% of the image's dimensions (not 10%).
// We use a smaller, tighter mask to avoid cutting too much image content.
const WATERMARK_WIDTH_FRAC = 0.06;   // 6% of image width (was 10%)
const WATERMARK_HEIGHT_FRAC = 0.06;  // 6% of image height (was 10%)
const WATERMARK_INSET = 0.008;       // 0.8% inset from the very edge
const FEATHER = 0.35;               // feather width as fraction of watermark size
const SOURCE_OFFSET = 0.03;          // how far left of watermark to sample from

/**
 * Remove the Meta AI watermark from an image buffer.
 *
 * @param imageBuffer - Raw image bytes (PNG, JPEG, etc.)
 * @returns PNG buffer with the bottom-right watermark removed.
 */
export async function removeMetaWatermark(
  imageBuffer: Buffer | ArrayBuffer,
): Promise<Buffer> {
  const inputBuf = Buffer.isBuffer(imageBuffer)
    ? imageBuffer
    : Buffer.from(imageBuffer);

  const src = sharp(inputBuf);
  const meta = await src.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;

  if (w < 64 || h < 64) {
    return src.png().toBuffer();
  }

  // Compute watermark region (bottom-right corner)
  const wmW = Math.round(w * WATERMARK_WIDTH_FRAC);
  const wmH = Math.round(h * WATERMARK_HEIGHT_FRAC);
  const inset = Math.round(Math.min(w, h) * WATERMARK_INSET);
  const wmX = Math.max(0, w - wmW - inset);
  const wmY = Math.max(0, h - wmH - inset);

  // Expand by feather for seamless blending
  const featherX = Math.max(4, Math.round(wmW * FEATHER));
  const featherY = Math.max(4, Math.round(wmH * FEATHER));
  const patchX = Math.max(0, wmX - featherX);
  const patchY = Math.max(0, wmY - featherY);
  const patchW = Math.min(w - patchX, wmW + featherX * 2);
  const patchH = Math.min(h - patchY, wmH + featherY * 2);

  if (patchW < 8 || patchH < 8) {
    return src.png().toBuffer();
  }

  // Source region: sample from just left of the watermark, same height.
  // This gives us "clean" pixels from the same image to mirror over the mark.
  const srcOffset = Math.round(Math.min(w, h) * SOURCE_OFFSET);
  const srcX = Math.max(0, patchX - patchW - srcOffset);
  const srcW = Math.min(patchX - srcX, patchW);

  if (srcW < 4) {
    // Not enough room left of the watermark — try sampling from above instead
    const srcY2 = Math.max(0, patchY - patchH - srcOffset);
    if (srcY2 < 4) {
      return src.png().toBuffer();
    }
    // Sample from above, flip vertically
    const sourceStrip = await sharp(inputBuf)
      .extract({ left: patchX, top: srcY2, width: patchW, height: Math.min(patchY - srcY2, patchH) })
      .toBuffer();
    const flipped = await sharp(sourceStrip).flip().toBuffer();
    const resized = await sharp(flipped)
      .resize({ width: patchW, height: patchH, fit: "fill" })
      .blur(2)
      .toBuffer();
    return compositeWithMask(inputBuf, resized, patchX, patchY, patchW, patchH, featherX, featherY);
  }

  // 1. Extract the source strip (from left of the watermark)
  const sourceStrip = await sharp(inputBuf)
    .extract({ left: srcX, top: patchY, width: srcW, height: patchH })
    .toBuffer();

  // 2. Flip it horizontally to create a mirror
  const mirrored = await sharp(sourceStrip).flop().toBuffer();

  // 3. Resize the mirrored strip to cover the full patch width
  // 4. Apply a slight blur to blend with surrounding content
  const patch = await sharp(mirrored)
    .resize({ width: patchW, height: patchH, fit: "fill" })
    .blur(3)
    .toBuffer();

  // 5 + 6. Composite with a feathered alpha mask
  return compositeWithMask(inputBuf, patch, patchX, patchY, patchW, patchH, featherX, featherY);
}

/**
 * Composite a patch over the original image using a feathered alpha mask.
 * The mask is opaque (white) in the center and fades to transparent (black)
 * at the edges, so the patch blends smoothly with the original content.
 */
async function compositeWithMask(
  originalBuf: Buffer,
  patchBuf: Buffer,
  patchX: number,
  patchY: number,
  patchW: number,
  patchH: number,
  featherX: number,
  featherY: number,
): Promise<Buffer> {
  // Create the feathered alpha mask as a PNG with alpha channel.
  // White = fully opaque (show the patch), black = transparent (show original).
  const maskPng = await createFeatherMaskPng(patchW, patchH, featherX, featherY);

  // Ensure the patch has an alpha channel, then apply our mask to it.
  // sharp's `joinChannel` adds the mask as the alpha channel of the patch.
  // NOTE: joinChannel on a 3-channel RGB image adds it as the 4th (alpha)
  // channel. We must NOT call ensureAlpha() first — that would make it
  // 4-channel, and joinChannel would then try to add a 5th (invalid).
  const patchMeta = await sharp(patchBuf).metadata();
  const patchWithAlpha =
    patchMeta.channels === 4
      ? // Already has alpha — replace it by removing then re-joining
        await sharp(patchBuf)
          .removeAlpha()
          .joinChannel(maskPng)
          .toFormat("png")
          .toBuffer()
      : // 3-channel RGB — join the mask as the 4th (alpha) channel
        await sharp(patchBuf)
          .joinChannel(maskPng)
          .toFormat("png")
          .toBuffer();

  // Composite the masked patch over the original image.
  // Only the opaque (white mask) center will show; the feathered edges
  // blend with the original.
  return sharp(originalBuf)
    .composite([
      {
        input: patchWithAlpha,
        top: patchY,
        left: patchX,
        blend: "over",
      },
    ])
    .toFormat(meta_format(originalBuf), { quality: 92 })
    .toBuffer();
}

/** Detect the format of the input buffer to preserve it on output. */
function meta_format(buf: Buffer): keyof sharp.FormatEnum {
  // Check magic bytes
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpeg";
  }
  if (buf.length >= 8 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return "png";
  }
  if (
    buf.length >= 12 &&
    buf.slice(0, 4).toString("ascii") === "RIFF" &&
    buf.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  // Default to PNG (lossless, supports alpha)
  return "png";
}

/**
 * Create a feathered alpha mask as a single-channel PNG.
 * White (opaque) in the center, fading to black (transparent) at the edges.
 *
 * We build it via SVG (sharp can rasterize SVG), using a blurred white
 * rectangle on a black background. The Gaussian blur creates the feather.
 * The result is converted to true single-channel greyscale.
 */
async function createFeatherMaskPng(
  w: number,
  h: number,
  featherX: number,
  featherY: number,
): Promise<Buffer> {
  const innerX = featherX;
  const innerY = featherY;
  const innerW = Math.max(1, w - featherX * 2);
  const innerH = Math.max(1, h - featherY * 2);
  const blurR = Math.max(featherX, featherY, 2);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="f" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${blurR}"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="black"/>
  <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="white" filter="url(#f)"/>
</svg>`;

  // Rasterize the SVG to greyscale raw. sharp's greyscale() on an SVG
  // already produces a single-channel raw buffer (channels: 1).
  const maskRaw = await sharp(Buffer.from(svg))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // If sharp gave us a single-channel buffer (channels: 1), use it directly.
  // Otherwise (some sharp versions output 3-channel greyscale), extract ch 0.
  let singleChannel: Buffer;
  if (maskRaw.info.channels === 1) {
    singleChannel = maskRaw.data;
  } else {
    singleChannel = Buffer.alloc(maskRaw.data.length / maskRaw.info.channels);
    for (let i = 0; i < singleChannel.length; i++) {
      singleChannel[i] = maskRaw.data[i * maskRaw.info.channels];
    }
  }

  // Wrap as a single-channel PNG for joinChannel
  return sharp(singleChannel, {
    raw: { width: w, height: h, channels: 1 },
  }).png().toBuffer();
}

/**
 * Check if the watermark removal is available (always true with sharp).
 */
export function hasWatermarkModel(): boolean {
  return true;
}

/**
 * Preload (no-op with sharp).
 */
export async function preloadWatermarkModel(): Promise<void> {
  // No-op
}
