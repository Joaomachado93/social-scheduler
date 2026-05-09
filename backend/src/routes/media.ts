import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { media } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { config } from '../config.js';
import { authGuard, JwtPayload } from '../middleware/auth.js';
import { watermarkImageBuffer, watermarkVideoBuffer, clearLogoCache } from '../services/watermark.js';
import { uploadToR2, deleteFromR2, getPublicUrl } from '../services/storage.js';
import sharp from 'sharp';

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_TYPES = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

export async function mediaRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } });

  app.addHook('onRequest', authGuard);

  app.post('/api/media/upload', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file provided' });

    const ext = extname(file.filename).toLowerCase();
    const isImage = IMAGE_TYPES.includes(ext);
    const isVideo = VIDEO_TYPES.includes(ext);

    if (!isImage && !isVideo) {
      return reply.status(400).send({ error: 'Unsupported file type' });
    }

    const id = randomUUID();
    const originalKey = `original/${id}${ext}`;
    const watermarkedKey = `watermarked/${id}${ext}`;

    const buffer = await file.toBuffer();

    await uploadToR2(originalKey, buffer, file.mimetype);

    const inserted = await db.insert(media).values({
      userId: user.userId,
      originalKey,
      watermarkedKey,
      mediaType: isImage ? 'image' : 'video',
      mimeType: file.mimetype,
      fileSize: buffer.length,
      processingStatus: 'processing',
    }).returning();
    const record = inserted[0];

    processWatermark(record.id, buffer, watermarkedKey, file.mimetype, isImage, ext);

    return {
      id: record.id,
      mediaType: isImage ? 'image' : 'video',
      processingStatus: 'processing',
    };
  });

  app.get('/api/media/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const rows = await db.select().from(media)
      .where(and(eq(media.id, parseInt(id, 10)), eq(media.userId, user.userId)))
      .limit(1);
    const record = rows[0];
    if (!record) return reply.status(404).send({ error: 'Media not found' });
    return record;
  });

  // Redirect to public R2 URL — used by Instagram fetch and frontend preview.
  // R2 URLs are technically public, but we still gate on ownership so the
  // redirect chain doesn't leak the existence of other users' media ids.
  app.get('/api/media/:id/file/:type', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id, type } = request.params as { id: string; type: 'original' | 'watermarked' };
    const rows = await db.select().from(media)
      .where(and(eq(media.id, parseInt(id, 10)), eq(media.userId, user.userId)))
      .limit(1);
    const record = rows[0];
    if (!record) return reply.status(404).send({ error: 'Media not found' });

    const key = type === 'watermarked' && record.watermarkedKey
      ? record.watermarkedKey
      : record.originalKey;

    return reply.redirect(getPublicUrl(key));
  });

  app.delete('/api/media/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const rows = await db.select().from(media)
      .where(and(eq(media.id, parseInt(id, 10)), eq(media.userId, user.userId)))
      .limit(1);
    const record = rows[0];
    if (!record) return reply.status(404).send({ error: 'Media not found' });

    try { await deleteFromR2(record.originalKey); } catch {}
    try { if (record.watermarkedKey) await deleteFromR2(record.watermarkedKey); } catch {}

    await db.delete(media).where(eq(media.id, parseInt(id, 10)));
    return { success: true };
  });

  app.get('/api/settings/logo', async () => {
    try {
      // Fetching public URL is cheap; existence is implied by previous upload + R2 listing not implemented
      return { hasLogo: true, url: getPublicUrl(config.r2.logoKey) };
    } catch {
      return { hasLogo: false };
    }
  });

  app.get('/api/settings/logo/file', async (_request, reply) => {
    try {
      return reply.redirect(getPublicUrl(config.r2.logoKey));
    } catch {
      return reply.status(404).send({ error: 'No logo uploaded' });
    }
  });

  app.post('/api/settings/logo', async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.status(400).send({ error: 'No file provided' });

    const ext = extname(file.filename).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      return reply.status(400).send({ error: 'Logo must be an image (PNG, JPG, WEBP)' });
    }

    const buffer = await file.toBuffer();
    const png = await sharp(buffer).png().toBuffer();

    await uploadToR2(config.r2.logoKey, png, 'image/png');
    clearLogoCache();

    return { success: true, message: 'Logo updated' };
  });

  app.delete('/api/settings/logo', async () => {
    try { await deleteFromR2(config.r2.logoKey); } catch {}
    clearLogoCache();
    return { success: true };
  });
}

async function processWatermark(
  mediaId: number,
  originalBuffer: Buffer,
  watermarkedKey: string,
  mimeType: string,
  isImage: boolean,
  ext: string,
) {
  try {
    const watermarked = isImage
      ? await watermarkImageBuffer(originalBuffer)
      : await watermarkVideoBuffer(originalBuffer, ext);

    await uploadToR2(watermarkedKey, watermarked, mimeType);
    await db.update(media).set({ processingStatus: 'done' }).where(eq(media.id, mediaId));
  } catch (err) {
    console.error('Watermark processing failed:', err);
    await db.update(media).set({ processingStatus: 'failed' }).where(eq(media.id, mediaId));
  }
}
