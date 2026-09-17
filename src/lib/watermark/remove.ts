/**
 * Meta AI watermark remover — server-side, using sharp only.
 *
 * Removes the Meta AI sparkle watermark from the bottom-right corner of
 * generated images using content-aware fill: extracts a region from just
 * left of the watermark, mirrors it, blurs slightly, and composites it
 * over the watermark with a feathered gradient mask for seamless blending.
 *
 * This approach uses only `sharp` (already in the project) — no native
 * ML runtime required. It's fast, reliable, and produces good results
 * for the small corner watermark.
 *
 * The watermark-remover project (https://github.com/youngkim0/watermark-remover)
 * uses the MI-GAN ONNX model for browser-based inpainting. Here we use a
 * simpler mirror+blur technique that achieves the same visual result for
 * the corner watermark case, without the overhead of loading a 27MB model.
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";

// The Meta AI watermark sits in the bottom-right corner.
// It's a small sparkle icon, roughly 6-9% of the image's dimensions.
const WATERMARK_WIDTH_FRAC = 0.095; // 9.5% of image width
const WATERMARK_HEIGHT_FRAC = 0.095; // 9.5% of image height
const WATERMARK_INSET = 0.012; // 1.2% inset from the very edge
const FEATHER = 0.3; // feather width as fraction of watermark size
const SOURCE_OFFSET = 0.02; // how far left of the watermark to sample from

/**
 * Remove the Meta AI watermark from an image buffer.
 *
 * @param imageBuffer - Raw image bytes (PNG, JPEG, etc.)
 * @returns PNG buffer with the bottom-right watermark removed.
 */
export async function removeMetaWatermark(
  imageBuffer: Buffer | ArrayBuffer,
): Promise<Buffer> {
  const src = sharp(Buffer.from(imageBuffer));
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
  const featherX = Math.round(wmW * FEATHER);
  const featherY = Math.round(wmH * FEATHER);
  const patchX = Math.max(0, wmX - featherX);
  const patchY = Math.max(0, wmY - featherY);
  const patchW = Math.min(w - patchX, wmW + featherX * 2);
  const patchH = Math.min(h - patchY, wmH + featherY * 2);

  // Source region: sample from just left of the watermark, same height
  const srcOffset = Math.round(Math.min(w, h) * SOURCE_OFFSET);
  const srcX = Math.max(0, patchX - patchW - srcOffset);
  const srcW = Math.min(patchX - srcX, patchW);

  if (srcW < 4 || patchH < 4) {
    // Not enough room for the mirror fill — return original
    return src.png().toBuffer();
  }

  // 1. Extract the source strip (from left of the watermark)
  const sourceStrip = await sharp(Buffer.from(imageBuffer))
    .extract({ left: srcX, top: patchY, width: srcW, height: patchH })
    .toBuffer();

  // 2. Flip it horizontally to create a mirror
  const mirrored = await sharp(sourceStrip)
    .flop()
    .toBuffer();

  // 3. Resize the mirrored strip to cover the full patch width
  const resizedMirror = await sharp(mirrored)
    .resize({ width: patchW, height: patchH, fit: "fill" })
    .toBuffer();

  // 4. Apply a slight blur to blend with surrounding content
  const blurred = await sharp(resizedMirror)
    .blur(2)
    .toBuffer();

  // 5. Create a gradient mask for feathered edges:
  //    - fully opaque in the center (over the watermark)
  //    - fades to transparent at the edges (to blend with original)
  const mask = await createFeatherMask(patchW, patchH, featherX, featherY);

  // 6. Composite the blurred mirror over the watermark using the mask
  const patched = await sharp(blurred)
    .ensureAlpha()
    .joinChannel(mask)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const patchedImage = sharp(patched.data, {
    raw: { width: patched.info.width, height: patched.info.height, channels: 4 },
  }).png();

  // 7. Composite the patch onto the original image
  const result = await sharp(Buffer.from(imageBuffer))
    .composite([
      {
        input: await patchedImage.toBuffer(),
        top: patchY,
        left: patchX,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();

  return result;
}

/**
 * Create a feathered alpha mask (white = opaque in center, fading to black
 * at the edges). Used for compositing the mirror patch smoothly.
 */
async function createFeatherMask(
  w: number,
  h: number,
  featherX: number,
  featherY: number,
): Promise<Buffer> {
  // Create a white rectangle with feathered edges using SVG
  const innerX = featherX;
  const innerY = featherY;
  const innerW = Math.max(1, w - featherX * 2);
  const innerH = Math.max(1, h - featherY * 2);
  const blurR = Math.max(featherX, featherY);

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="feather" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${blurR}"/>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="black"/>
  <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" fill="white" filter="url(#feather)"/>
</svg>`;

  const mask = await sharp(Buffer.from(svg))
    .resize(w, h)
    .greyscale()
    .raw()
    .toBuffer();

  return mask;
}

/**
 * Check if the watermark model/data is available.
 * With the sharp-based approach, this is always true.
 */
export function hasWatermarkModel(): boolean {
  return true;
}

// Optional: keep the MI-GAN model path for reference, but we don't use it
// in the sharp-based approach.
const MI_GAN_MODEL_PATH = path.join(
  process.cwd(),
  "data",
  "models",
  "migan_pipeline_v2.onnx",
);

/**
 * Preload the model (no-op in the sharp-based approach).
 * Kept for API compatibility.
 */
export async function preloadWatermarkModel(): Promise<void> {
  // No-op — sharp doesn't need preloading
  if (fs.existsSync(MI_GAN_MODEL_PATH)) {
    // Model file exists but we use the sharp approach for reliability
  }
}
