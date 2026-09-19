/**
 * Meta AI watermark remover — solid dark rectangle cover.
 *
 * Creates a dark rectangle using sharp.create() (native, works on Vercel)
 * and composites it over the Meta AI watermark area.
 * No SVG, no base64, no file system — pure sharp.
 */

import sharp from "sharp";

const WM_WIDTH_FRAC = 0.24;
const WM_HEIGHT_FRAC = 0.10;
const WM_INSET_X = 0.003;
const WM_INSET_Y = 0.003;

export async function removeMetaWatermark(
  imageBuffer: Buffer | ArrayBuffer,
): Promise<Buffer> {
  const inputBuf = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
  const src = sharp(inputBuf);
  const meta = await src.metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 64 || h < 64) return src.png().toBuffer();

  const wmW = Math.round(w * WM_WIDTH_FRAC);
  const wmH = Math.round(h * WM_HEIGHT_FRAC);
  const wmX = Math.max(0, w - wmW - Math.round(w * WM_INSET_X));
  const wmY = Math.max(0, h - wmH - Math.round(h * WM_INSET_Y));

  // Create a solid dark rectangle using sharp.create() — works on Vercel
  const overlay = await sharp({
    create: {
      width: wmW,
      height: wmH,
      channels: 4,
      background: { r: 12, g: 12, b: 18, alpha: 255 }
    }
  }).png().toBuffer();

  return sharp(inputBuf)
    .composite([{ input: overlay, top: wmY, left: wmX, blend: "over" }])
    .toFormat(meta_format(inputBuf), { quality: 95 })
    .toBuffer();
}

function meta_format(buf: Buffer): keyof sharp.FormatEnum {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  return "png";
}

export function hasWatermarkModel(): boolean { return true; }
export async function preloadWatermarkModel(): Promise<void> {}
