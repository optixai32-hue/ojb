/**
 * Meta AI watermark remover — PNG LOGO overlay.
 *
 * Uses a pre-generated "Nelth-AI" PNG logo to cover the Meta AI watermark.
 * This works on Vercel because it doesn't rely on SVG text rendering
 * (which requires librsvg, not available in Vercel's serverless environment).
 *
 * The PNG logo is loaded from public/nelth-ai-logo.png and resized
 * to match the watermark area, then composited over it.
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";

const WM_WIDTH_FRAC = 0.22;
const WM_HEIGHT_FRAC = 0.10;
const WM_INSET_X = 0.003;
const WM_INSET_Y = 0.003;

// Path to the pre-generated Nelth-AI logo
const LOGO_PATH = path.join(process.cwd(), "public", "nelth-ai-logo.png");

// Cache the logo buffer
let logoBuffer: Buffer | null = null;

function getLogoBuffer(): Buffer | null {
  if (logoBuffer) return logoBuffer;
  try {
    logoBuffer = fs.readFileSync(LOGO_PATH);
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

  // Compute watermark area
  const wmW = Math.round(w * WM_WIDTH_FRAC);
  const wmH = Math.round(h * WM_HEIGHT_FRAC);
  const wmX = Math.max(0, w - wmW - Math.round(w * WM_INSET_X));
  const wmY = Math.max(0, h - wmH - Math.round(h * WM_INSET_Y));

  // Load the pre-generated logo
  const logo = getLogoBuffer();
  if (!logo) {
    // Fallback: if logo file is missing, use a solid dark rectangle
    const overlay = await sharp({
      create: {
        width: wmW,
        height: wmH,
        channels: 4,
        background: { r: 10, g: 10, b: 15, alpha: 1 }
      }
    }).png().toBuffer();

    return sharp(inputBuf)
      .composite([{ input: overlay, top: wmY, left: wmX, blend: "over" }])
      .toFormat(meta_format(inputBuf), { quality: 95 })
      .toBuffer();
  }

  // Resize the logo to fit the watermark area (preserve aspect ratio, cover)
  const resizedLogo = await sharp(logo)
    .resize({
      width: wmW,
      height: wmH,
      fit: "cover",
      position: "center",
    })
    .png()
    .toBuffer();

  // Composite the logo over the watermark
  return sharp(inputBuf)
    .composite([{ input: resizedLogo, top: wmY, left: wmX, blend: "over" }])
    .toFormat(meta_format(inputBuf), { quality: 95 })
    .toBuffer();
}

function meta_format(buf: Buffer): keyof sharp.FormatEnum {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.length >= 8 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return "png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("ascii") === "RIFF" && buf.slice(8, 12).toString("ascii") === "WEBP") return "webp";
  return "png";
}

export function hasWatermarkModel(): boolean { return true; }
export async function preloadWatermarkModel(): Promise<void> {}
