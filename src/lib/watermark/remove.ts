/**
 * Meta AI watermark remover — PNG LOGO overlay (embedded base64).
 *
 * Uses a pre-generated "Nelth-AI" PNG logo embedded as base64
 * to cover the Meta AI watermark. This works on Vercel because
 * the logo is embedded directly in the code (no file system access needed).
 */

import sharp from "sharp";

const WM_WIDTH_FRAC = 0.22;
const WM_HEIGHT_FRAC = 0.10;
const WM_INSET_X = 0.003;
const WM_INSET_Y = 0.003;

// Pre-generated "Nelth-AI" logo as base64 PNG (dark bg + white bold text)
const LOGO_BASE64 = "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";

let logoBuffer: Buffer | null = null;

function getLogoBuffer(): Buffer | null {
  if (logoBuffer) return logoBuffer;
  try {
    logoBuffer = Buffer.from(LOGO_BASE64, "base64");
    return logoBuffer;
  } catch {
    return null;
  }
}

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

  const logo = getLogoBuffer();
  console.log("[watermark] logo loaded:", logo ? logo.length + " bytes" : "NULL");
  if (!logo) {
    // Fallback: solid dark rectangle
    const overlay = await sharp({
      create: { width: wmW, height: wmH, channels: 4, background: { r: 10, g: 10, b: 15, alpha: 1 } }
    }).png().toBuffer();
    console.log("[watermark] logo decoded, compositing...");
  return sharp(inputBuf)
      .composite([{ input: overlay, top: wmY, left: wmX, blend: "over" }])
      .toFormat(meta_format(inputBuf), { quality: 95 }).toBuffer();
  }

  const resizedLogo = await sharp(logo)
    .resize({ width: wmW, height: wmH, fit: "cover", position: "center" })
    .png().toBuffer();

  console.log("[watermark] logo decoded, compositing...");
  return sharp(inputBuf)
    .composite([{ input: resizedLogo, top: wmY, left: wmX, blend: "over" }])
    .toFormat(meta_format(inputBuf), { quality: 95 }).toBuffer();
}

function meta_format(buf: Buffer): keyof sharp.FormatEnum {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return "png";
}

export function hasWatermarkModel(): boolean { return true; }
export async function preloadWatermarkModel(): Promise<void> {}
// force deploy Sat Sep 19 07:30:48 UTC 2026
