import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import { randomUUID } from 'crypto';
import { config } from '../config.js';
import { getFromR2 } from './storage.js';

let cachedLogo: Buffer | null = null;

async function getLogoBuffer(): Promise<Buffer> {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = await getFromR2(config.r2.logoKey);
    return cachedLogo;
  } catch {
    throw new Error(`Watermark logo not found in R2 at key "${config.r2.logoKey}". Upload one via /api/settings/logo.`);
  }
}

export function clearLogoCache() {
  cachedLogo = null;
}

export async function watermarkImageBuffer(input: Buffer): Promise<Buffer> {
  const logoBuffer = await getLogoBuffer();

  const image = sharp(input);
  const metadata = await image.metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;

  const logoSize = Math.round(Math.min(width, height) * config.watermark.scale);

  const { data: logo, info: logoInfo } = await sharp(logoBuffer)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const lw = logoInfo.width;
  const lh = logoInfo.height;
  const maskBuf = Buffer.alloc(lw * lh * 4);
  const a = Math.round(255 * config.watermark.opacity);
  for (let i = 0; i < maskBuf.length; i += 4) {
    maskBuf[i] = 255;
    maskBuf[i + 1] = 255;
    maskBuf[i + 2] = 255;
    maskBuf[i + 3] = a;
  }

  const logoWithOpacity = await sharp(logo, { raw: { width: lw, height: lh, channels: 4 } })
    .composite([{
      input: maskBuf,
      raw: { width: lw, height: lh, channels: 4 },
      blend: 'dest-in',
    }])
    .png()
    .toBuffer();

  return await sharp(input)
    .composite([{
      input: logoWithOpacity,
      gravity: config.watermark.position as any,
    }])
    .toBuffer();
}

export async function watermarkVideoBuffer(input: Buffer, ext: string): Promise<Buffer> {
  const logoBuffer = await getLogoBuffer();
  const { opacity, margin, scale } = config.watermark;

  const id = randomUUID();
  const inputPath = resolve(tmpdir(), `${id}-in${ext}`);
  const logoPath = resolve(tmpdir(), `${id}-logo.png`);
  const outputPath = resolve(tmpdir(), `${id}-out${ext}`);

  await writeFile(inputPath, input);
  await writeFile(logoPath, logoBuffer);

  try {
    await new Promise<void>((res, rej) => {
      ffmpeg(inputPath)
        .input(logoPath)
        .complexFilter([
          `[1:v]scale=-1:ih*${scale}[logo]`,
          `[logo]format=rgba,colorchannelmixer=aa=${opacity}[logot]`,
          `[0:v][logot]overlay=W-w-${margin}:H-h-${margin}[out]`,
        ])
        .outputOptions(['-map', '[out]', '-map', '0:a?', '-c:a', 'copy'])
        .output(outputPath)
        .on('end', () => res())
        .on('error', (err) => rej(err))
        .run();
    });

    return await readFile(outputPath);
  } finally {
    await Promise.allSettled([unlink(inputPath), unlink(logoPath), unlink(outputPath)]);
  }
}
