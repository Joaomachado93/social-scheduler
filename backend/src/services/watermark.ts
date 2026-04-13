import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { config } from '../config.js';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';

export async function watermarkImage(inputPath: string, outputPath: string): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });

  const logoPath = config.paths.watermark;
  if (!existsSync(logoPath)) {
    throw new Error(`Watermark logo not found at ${logoPath}`);
  }

  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const width = metadata.width || 800;
  const height = metadata.height || 600;

  const logoSize = Math.round(Math.min(width, height) * config.watermark.scale);

  const logo = await sharp(logoPath)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .ensureAlpha()
    .toBuffer();

  // Apply opacity to logo
  const logoWithOpacity = await sharp(logo)
    .ensureAlpha()
    .composite([{
      input: Buffer.from(
        Array(logoSize * logoSize * 4).fill(0).map((_, i) =>
          i % 4 === 3 ? Math.round(255 * config.watermark.opacity) : 255
        )
      ),
      raw: { width: logoSize, height: logoSize, channels: 4 },
      blend: 'dest-in',
    }])
    .toBuffer();

  await sharp(inputPath)
    .composite([{
      input: logoWithOpacity,
      gravity: config.watermark.position as any,
    }])
    .toFile(outputPath);
}

export function watermarkVideo(inputPath: string, outputPath: string): Promise<void> {
  mkdirSync(dirname(outputPath), { recursive: true });

  const logoPath = config.paths.watermark;
  if (!existsSync(logoPath)) {
    throw new Error(`Watermark logo not found at ${logoPath}`);
  }

  const { opacity, margin, scale } = config.watermark;

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .input(logoPath)
      .complexFilter([
        `[1:v]scale=-1:ih*${scale}[logo]`,
        `[logo]format=rgba,colorchannelmixer=aa=${opacity}[logot]`,
        `[0:v][logot]overlay=W-w-${margin}:H-h-${margin}[out]`,
      ])
      .outputOptions(['-map', '[out]', '-map', '0:a?', '-c:a', 'copy'])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}
