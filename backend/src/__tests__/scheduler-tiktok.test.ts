import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setupTestDb, teardownTestDb } from './setup.js';
import { users, platformAccounts, posts, postPlatforms, media } from '../db/schema.js';
import bcrypt from 'bcrypt';

vi.mock('../services/publishers/tiktok.js', () => ({
  publishToTikTok: vi.fn().mockResolvedValue('TT_PUBLISH_ID'),
}));

import { publishPost } from '../services/scheduler.js';
import { publishToTikTok } from '../services/publishers/tiktok.js';

describe('scheduler dispatch for tiktok', () => {
  let db: any;
  let postId: number;
  let accountId: number;

  beforeEach(async () => {
    db = await setupTestDb();
    const u = await db.insert(users).values({
      email: 'x@t.com',
      passwordHash: bcrypt.hashSync('p', 10),
    }).returning();

    const pa = await db.insert(platformAccounts).values({
      userId: u[0].id,
      platform: 'tiktok',
      accountId: 'OID',
      accessToken: 'AT',
      refreshToken: 'RT',
    }).returning();
    accountId = pa[0].id;

    const p = await db.insert(posts).values({
      userId: u[0].id,
      caption: 'hello world\nMore description',
      scheduledAt: new Date().toISOString(),
      status: 'processing',
    }).returning();
    postId = p[0].id;

    await db.insert(media).values({
      userId: u[0].id,
      postId,
      originalKey: 'orig/v.mp4',
      watermarkedKey: 'wm/v.mp4',
      mediaType: 'video',
      mimeType: 'video/mp4',
      processingStatus: 'done',
    });

    await db.insert(postPlatforms).values({
      postId,
      platformAccountId: accountId,
    });
  });

  afterEach(async () => {
    vi.resetAllMocks();
    await teardownTestDb();
  });

  it('dispatches to publishToTikTok and marks the leg published', async () => {
    await publishPost({ id: postId, caption: 'hello world\nMore description', scheduledAt: new Date().toISOString() });

    expect(publishToTikTok).toHaveBeenCalledOnce();
    const callArg = (publishToTikTok as any).mock.calls[0][0];
    expect(callArg.platformAccountId).toBe(accountId);
    expect(callArg.accessToken).toBe('AT');
    expect(callArg.refreshToken).toBe('RT');
    expect(callArg.title).toBe('hello world'); // first line of caption
    expect(callArg.description).toBe('hello world\nMore description');
    expect(callArg.mediaFiles).toHaveLength(1);
    expect(callArg.mediaFiles[0].mediaType).toBe('video');

    // Verify the leg row was marked published
    const legs = await db.select().from(postPlatforms);
    expect(legs[0].status).toBe('published');
    expect(legs[0].platformPostId).toBe('TT_PUBLISH_ID');
  });
});
