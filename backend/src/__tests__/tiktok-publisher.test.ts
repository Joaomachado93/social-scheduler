import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
vi.mock('axios');
import { setupTestDb, teardownTestDb } from './setup.js';
import bcrypt from 'bcrypt';
import { users, platformAccounts } from '../db/schema.js';
import { publishToTikTok } from '../services/publishers/tiktok.js';

describe('publishToTikTok', () => {
  let seededAccountId: number;

  beforeEach(async () => {
    vi.resetAllMocks();
    process.env.TIKTOK_CLIENT_KEY = 'CK';
    process.env.TIKTOK_CLIENT_SECRET = 'CS';

    // Set up the DB so the 401-refresh case can write updated tokens
    const db = await setupTestDb();
    const u = await db.insert(users).values({
      email: 'p@t.com',
      passwordHash: bcrypt.hashSync('x', 10),
    }).returning();
    const pa = await db.insert(platformAccounts).values({
      userId: u[0].id,
      platform: 'tiktok',
      accountName: 'Test TikTok',
      accountId: 'tiktok-open-id-123',
      accessToken: 'OLD',
      refreshToken: 'RT',
    }).returning();
    seededAccountId = pa[0].id;
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it('inits, uploads a single chunk, polls until PUBLISH_COMPLETE, returns publish_id', async () => {
    const videoBytes = Buffer.alloc(1024 * 1024, 0xab); // 1 MB

    vi.mocked(axios.get).mockResolvedValueOnce({ data: videoBytes.buffer.slice(0, videoBytes.length) } as any);

    vi.mocked(axios.post).mockImplementation(async (url: string, body: any) => {
      if (url.endsWith('/v2/post/publish/creator_info/query/')) {
        return { data: { data: { privacy_level_options: ['SELF_ONLY', 'PUBLIC_TO_EVERYONE'] } } } as any;
      }
      if (url.endsWith('/v2/post/publish/video/init/')) {
        return { data: { data: { publish_id: 'PUB123', upload_url: 'https://upload.tiktok/UPL' } } } as any;
      }
      if (url.endsWith('/v2/post/publish/status/fetch/')) {
        return { data: { data: { status: 'PUBLISH_COMPLETE' } } } as any;
      }
      throw new Error('unexpected POST ' + url);
    });

    vi.mocked(axios.put).mockResolvedValueOnce({ status: 201 } as any);

    const result = await publishToTikTok({
      platformAccountId: seededAccountId,
      accessToken: 'AT',
      refreshToken: 'RT',
      title: 'My title',
      description: 'My desc',
      mediaFiles: [{ id: 1, mediaType: 'video', mimeType: 'video/mp4', publicUrl: 'https://r2/v.mp4' }],
    });

    expect(result).toBe('PUB123');
    expect(axios.put).toHaveBeenCalledTimes(1);
    const putCall = vi.mocked(axios.put).mock.calls[0];
    expect(putCall[0]).toBe('https://upload.tiktok/UPL');
    expect((putCall[2] as any).headers['Content-Range']).toBe('bytes 0-1048575/1048576');
  });

  it('throws when status fetch returns FAILED', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: Buffer.alloc(1024).buffer } as any);
    vi.mocked(axios.put).mockResolvedValueOnce({ status: 201 } as any);
    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      if (url.endsWith('/creator_info/query/')) return { data: { data: { privacy_level_options: ['SELF_ONLY'] } } } as any;
      if (url.endsWith('/init/')) return { data: { data: { publish_id: 'P', upload_url: 'U' } } } as any;
      return { data: { data: { status: 'FAILED', fail_reason: 'bad_codec' } } } as any;
    });
    await expect(publishToTikTok({
      platformAccountId: seededAccountId,
      accessToken: 'AT',
      refreshToken: 'RT',
      title: 't',
      description: 'd',
      mediaFiles: [{ id: 1, mediaType: 'video', mimeType: 'video/mp4', publicUrl: 'https://r2/v.mp4' }],
    })).rejects.toThrow(/FAILED/);
  });

  it('refreshes token on 401 from init and retries', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: Buffer.alloc(1024).buffer } as any);
    vi.mocked(axios.put).mockResolvedValueOnce({ status: 201 } as any);

    let initCalls = 0;
    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      if (url.endsWith('/creator_info/query/')) return { data: { data: { privacy_level_options: ['SELF_ONLY'] } } } as any;
      if (url.endsWith('/init/')) {
        initCalls++;
        if (initCalls === 1) {
          const err: any = new Error('unauthorized');
          err.response = { status: 401 };
          throw err;
        }
        return { data: { data: { publish_id: 'P', upload_url: 'U' } } } as any;
      }
      if (url.endsWith('/oauth/token/')) {
        return { data: { access_token: 'NEW', refresh_token: 'RT2', expires_in: 86400 } } as any;
      }
      return { data: { data: { status: 'PUBLISH_COMPLETE' } } } as any;
    });

    const id = await publishToTikTok({
      platformAccountId: seededAccountId,
      accessToken: 'OLD',
      refreshToken: 'RT',
      title: 't',
      description: 'd',
      mediaFiles: [{ id: 1, mediaType: 'video', mimeType: 'video/mp4', publicUrl: 'https://r2/v.mp4' }],
    });
    expect(id).toBe('P');
    expect(initCalls).toBe(2);
  });
});
