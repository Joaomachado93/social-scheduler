import { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { pipeline } from 'stream/promises';
import { createWriteStream, mkdirSync, unlinkSync, existsSync } from 'fs';
import { resolve, extname } from 'path';
import { randomUUID } from 'crypto';
import { db } from '../db/index.js';
import { media } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { authGuard } from '../middleware/auth.js';
import { watermarkImage, watermarkVideo } from '../services/watermark.js';

const IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_TYPES = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

export async function mediaRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB

  app.addHook('onRequest', authGuard);

  app.post('/api/media/upload', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file provided' });
    }

    const ext = extname(file.filename).toLowerCase();
    const isImage = IMAGE_TYPES.includes(ext);
    const isVideo = VIDEO_TYPES.includes(ext);

    if (!isImage && !isVideo) {
      return reply.status(400).send({ error: 'Unsupported file type' });
    }

    const id = randomUUID();
    const originalDir = resolve(config.paths.uploads, 'original');
    const watermarkedDir = resolve(config.paths.uploads, 'watermarked');
    mkdirSync(originalDir, { recursive: true });
    mkdirSync(watermarkedDir, { recursive: true });

    const originalPath = resolve(originalDir, `${id}${ext}`);
    const watermarkedPath = resolve(watermarkedDir, `${id}${ext}`);

    // Save original file
    await pipeline(file.file, createWriteStream(originalPath));

    // Insert media record
    const record = db.insert(media).values({
      originalPath,
      watermarkedPath,
      mediaType: isImage ? 'image' : 'video',
      mimeType: file.mimetype,
      processingStatus: 'processing',
    }).returning().get();

    // Process watermark async
    processWatermark(record.id, originalPath, watermarkedPath, isImage);

    return {
      id: record.id,
      mediaType: isImage ? 'image' : 'video',
      processingStatus: 'processing',
    };
  });

  app.get('/api/media/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = db.select().from(media).where(eq(media.id, parseInt(id))).get();
    if (!record) return reply.status(404).send({ error: 'Media not found' });
    return record;
  });

  app.get('/api/media/:id/file/:type', async (request, reply) => {
    const { id, type } = request.params as { id: string; type: 'original' | 'watermarked' };
    const record = db.select().from(media).where(eq(media.id, parseInt(id))).get();
    if (!record) return reply.status(404).send({ error: 'Media not found' });

    const filePath = type === 'watermarked' && record.watermarkedPath
      ? record.watermarkedPath
      : record.originalPath;

    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'File not found' });
    }

    return reply.sendFile(filePath);
  });

  app.delete('/api/media/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const record = db.select().from(media).where(eq(media.id, parseInt(id))).get();
    if (!record) return reply.status(404).send({ error: 'Media not found' });

    // Delete files
    try { if (existsSync(record.originalPath)) unlinkSync(record.originalPath); } catch {}
    try { if (record.watermarkedPath && existsSync(record.watermarkedPath)) unlinkSync(record.watermarkedPath); } catch {}

    db.delete(media).where(eq(media.id, parseInt(id))).run();
    return { success: true };
  });
}

async function processWatermark(mediaId: number, originalPath: string, watermarkedPath: string, isImage: boolean) {
  try {
    if (isImage) {
      await watermarkImage(originalPath, watermarkedPath);
    } else {
      await watermarkVideo(originalPath, watermarkedPath);
    }
    db.update(media).set({ processingStatus: 'done' }).where(eq(media.id, mediaId)).run();
  } catch (err) {
    console.error('Watermark processing failed:', err);
    db.update(media).set({ processingStatus: 'failed' }).where(eq(media.id, mediaId)).run();
  }
}
