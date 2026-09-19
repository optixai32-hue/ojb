/**
 * Meta AI watermark remover — TEXT COVER approach.
 *
 * Covers the Meta AI watermark with a styled "Nelth-AI" text overlay.
 * Fully opaque background ensures Meta AI is completely hidden.
 */

import sharp from "sharp";

const WM_WIDTH_FRAC = 0.26;
const WM_HEIGHT_FRAC = 0.11;
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

  const fontSize = Math.round(h * 0.045);
  const padX = Math.round(fontSize * 0.8);
  const padY = Math.round(fontSize * 0.4);
  const textW = wmW + padX * 2;
  const textH = wmH + padY * 2;
  const textX = Math.max(0, wmX - padX);
  const textY = Math.max(0, wmY - padY);

  // SVG with FULLY OPAQUE dark background + "Nelth-AI" text
  const svg = `<svg width="${textW}" height="${textH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.5"/>
    </filter>
  </defs>
  <rect width="${textW}" height="${textH}" rx="${Math.round(textH * 0.15)}" ry="${Math.round(textH * 0.15)}" fill="rgb(15,15,20)"/>
  <text x="50%" y="50%"
    dominant-baseline="central"
    text-anchor="middle"
    font-family="'Helvetica Neue', Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="800"
    fill="rgba(255,255,255,0.95)"
    filter="url(#blur)"
    letter-spacing="${Math.round(fontSize * 0.02)}"
  >Nelth-AI</text>
</svg>`;

  const textOverlay = await sharp(Buffer.from(svg, "utf-8"))
    .blur(0.8)
    .png()
    .toBuffer();

  return sharp(inputBuf)
    .composite([{ input: textOverlay, top: textY, left: textX, blend: "over" }])
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
