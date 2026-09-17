/**
 * Meta AI watermark remover — server-side, using sharp.
 *
 * Uses a "clean source fill" approach:
 *   1. Extract a clean strip from ABOVE the watermark (not including it)
 *   2. Stretch it to cover the watermark area
 *   3. Apply moderate blur to blend textures
 *   4. Composite with a feathered mask
 *
 * This works for semi-transparent watermarks because we REPLACE the
 * watermark pixels entirely with clean content from the same image,
 * rather than blurring the watermark area (which leaves a ghost).
 */

import sharp from "sharp";

// Watermark dimensions — generous to FULLY cover the "Meta AI" text + icon + margin
const WATERMARK_WIDTH_FRAC = 0.15;   // 15% of image width (very generous)
const WATERMARK_HEIGHT_FRAC = 0.10;  // 10% of image height
const WATERMARK_INSET_X = 0.002;      // 0.2% inset from right edge
const WATERMARK_INSET_Y = 0.003;      // 0.3% inset from bottom edge
const FEATHER = 0.35;                 // feather for blending edges

/**
 * Remove the Meta AI watermark from an image buffer.
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

  // Compute watermark region
  const wmW = Math.round(w * WATERMARK_WIDTH_FRAC);
  const wmH = Math.round(h * WATERMARK_HEIGHT_FRAC);
  const insetX = Math.round(w * WATERMARK_INSET_X);
  const insetY = Math.round(h * WATERMARK_INSET_Y);
  const wmX = Math.max(0, w - wmW - insetX);
  const wmY = Math.max(0, h - wmH - insetY);

  // Source region: extract from ABOVE the watermark (clean pixels)
  const srcStripH = Math.max(wmH, Math.round(h * 0.05));
  const srcY = Math.max(0, wmY - srcStripH);

  if (srcY < 1) {
    return src.png().toBuffer();
  }

  // 1. Compute the local average color from the border AROUND the watermark
  //    (not including the watermark itself). This is the color the replacement
  //    should match so it blends with the surrounding content.
  const borderStrip = await sharp(inputBuf)
    .extract({
      left: Math.max(0, wmX - 3),
      top: Math.max(0, wmY - 3),
      width: Math.min(wmW + 6, w - Math.max(0, wmX - 3)),
      height: Math.min(wmH + 6, h - Math.max(0, wmY - 3)),
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sample only the outer ring (3px border) for the average color
  let avgR = 0, avgG = 0, avgB = 0, count = 0;
  const bW = borderStrip.info.width;
  const bH = borderStrip.info.height;
  const bCh = borderStrip.info.channels;
  for (let y = 0; y < bH; y++) {
    for (let x = 0; x < bW; x++) {
      if (y < 3 || y >= bH - 3 || x < 3 || x >= bW - 3) {
        const idx = (y * bW + x) * bCh;
        avgR += borderStrip.data[idx];
        avgG += borderStrip.data[idx + 1];
        avgB += borderStrip.data[idx + 2];
        count++;
      }
    }
  }
  avgR = count > 0 ? Math.round(avgR / count) : 128;
  avgG = count > 0 ? Math.round(avgG / count) : 128;
  avgB = count > 0 ? Math.round(avgB / count) : 128;

  // 2. Create a solid color fill matching the local average + slight noise
  //    Use a solid color + heavy blur to create a smooth gradient
  const solidSvg = `<svg width="${wmW}" height="${wmH}">
    <defs>
      <filter id="n">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0"/>
        <feComposite in2="SourceGraphic" operator="atop"/>
      </filter>
    </defs>
    <rect width="${wmW}" height="${wmH}" fill="rgb(${avgR},${avgG},${avgB})"/>
    <rect width="${wmW}" height="${wmH}" fill="rgb(${avgR},${avgG},${avgB})" filter="url(#n)"/>
  </svg>`;

  const solidPatch = await sharp(Buffer.from(solidSvg))
    .blur(5)
    .toBuffer();

  // 3. Composite with overscan + feathered edges for seamless blending
  const overscanX = Math.round(wmW * 0.1);
  const overscanY = Math.round(wmH * 0.1);
  const compX = Math.max(0, wmX - overscanX);
  const compY = Math.max(0, wmY - overscanY);

  // Create the feathered mask for the overscan region
  const fullW = wmW + overscanX * 2;
  const fullH = wmH + overscanY * 2;
  const featherX = Math.max(8, Math.round(fullW * 0.25));
  const featherY = Math.max(8, Math.round(fullH * 0.25));
  const maskPng = await createFeatherMaskPng(fullW, fullH, featherX, featherY);

  // Create the full-size solid fill with noise
  const fullSolidSvg = `<svg width="${fullW}" height="${fullH}">
    <defs>
      <filter id="n">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.08 0"/>
        <feComposite in2="SourceGraphic" operator="atop"/>
      </filter>
    </defs>
    <rect width="${fullW}" height="${fullH}" fill="rgb(${avgR},${avgG},${avgB})"/>
    <rect width="${fullW}" height="${fullH}" fill="rgb(${avgR},${avgG},${avgB})" filter="url(#n)"/>
  </svg>`;

  const fullSolid = await sharp(Buffer.from(fullSolidSvg))
    .blur(8)
    .toBuffer();

  // Apply the feathered alpha mask
  const solidMeta = await sharp(fullSolid).metadata();
  const patchWithAlpha =
    solidMeta.channels === 4
      ? await sharp(fullSolid).removeAlpha().joinChannel(maskPng).png().toBuffer()
      : await sharp(fullSolid).joinChannel(maskPng).png().toBuffer();

  // Composite over the original
  return sharp(inputBuf)
    .composite([
      {
        input: patchWithAlpha,
        top: compY,
        left: compX,
        blend: "over",
      },
    ])
    .toFormat(meta_format(inputBuf), { quality: 92 })
    .toBuffer();
}

/** Composite a patch over the original image with a feathered alpha mask. */
async function compositeWithMask(
  originalBuf: Buffer,
  patchBuf: Buffer,
  patchX: number,
  patchY: number,
  patchW: number,
  patchH: number,
): Promise<Buffer> {
  const featherX = Math.max(4, Math.round(patchW * FEATHER));
  const featherY = Math.max(4, Math.round(patchH * FEATHER));
  const maskPng = await createFeatherMaskPng(patchW, patchH, featherX, featherY);

  const patchMeta = await sharp(patchBuf).metadata();
  const patchWithAlpha =
    patchMeta.channels === 4
      ? await sharp(patchBuf).removeAlpha().joinChannel(maskPng).png().toBuffer()
      : await sharp(patchBuf).joinChannel(maskPng).png().toBuffer();

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

/** Detect the format of the input buffer. */
function meta_format(buf: Buffer): keyof sharp.FormatEnum {
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
  return "png";
}

/** Create a feathered alpha mask as a single-channel PNG. */
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

  const maskRaw = await sharp(Buffer.from(svg))
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let singleChannel: Buffer;
  if (maskRaw.info.channels === 1) {
    singleChannel = maskRaw.data;
  } else {
    singleChannel = Buffer.alloc(maskRaw.data.length / maskRaw.info.channels);
    for (let i = 0; i < singleChannel.length; i++) {
      singleChannel[i] = maskRaw.data[i * maskRaw.info.channels];
    }
  }

  return sharp(singleChannel, {
    raw: { width: w, height: h, channels: 1 },
  }).png().toBuffer();
}

export function hasWatermarkModel(): boolean {
  return true;
}

export async function preloadWatermarkModel(): Promise<void> {
  // No-op
}
