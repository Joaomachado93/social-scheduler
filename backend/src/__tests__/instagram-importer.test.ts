import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('axios');
vi.mock('../services/storage.js', () => ({
  uploadToR2: vi.fn().mockResolvedValue(undefined),
  getR2Client: vi.fn(),
  deleteFromR2: vi.fn(),
  getFromR2: vi.fn(),
  getPublicUrl: vi.fn((key: string) => `https://r2/${key}`),
}));

import axios from 'axios';
import { listRecentVideos, downloadAndStoreInR2 } from '../services/importers/instagram.js';
import { uploadToR2 } from '../services/storage.js';

describe('Instagram importer', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listRecentVideos', () => {
    it('returns only VIDEO and REELS posted since the cutoff', async () => {
      const now = Date.now();
      const recent = new Date(now - 60 * 60_000).toISOString();      // 1h ago
      const old = new Date(now - 72 * 3_600_000).toISOString();      // 72h ago
      const sinceIso = new Date(now - 48 * 3_600_000).toISOString(); // 48h ago

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          data: [
            { id: 'A', media_type: 'VIDEO', media_url: 'https://ig/a.mp4', timestamp: recent, caption: 'A' },
            { id: 'B', media_type: 'IMAGE', media_url: 'https://ig/b.jpg', timestamp: recent, caption: 'B' },
            { id: 'C', media_type: 'REELS', media_url: 'https://ig/c.mp4', timestamp: recent, caption: 'C' },
            { id: 'D', media_type: 'VIDEO', media_url: 'https://ig/d.mp4', timestamp: old,    caption: 'D' },
            { id: 'E', media_type: 'CAROUSEL_ALBUM', media_url: null, timestamp: recent },
            { id: 'F', media_type: 'VIDEO', media_url: null, timestamp: recent }, // no URL — skip
          ],
        },
      } as any);

      const items = await listRecentVideos({
        igUserId: 'ig-123',
        accessToken: 'TOKEN',
        sinceIso,
      });

      expect(items.map((i) => i.id)).toEqual(['A', 'C']);
      expect(items[0].mediaType).toBe('VIDEO');
      expect(items[1].mediaType).toBe('REELS');
    });

    it('hits the Graph API media endpoint with the right params', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: { data: [] } } as any);
      await listRecentVideos({ igUserId: 'ig-XYZ', accessToken: 'TOK', sinceIso: new Date().toISOString() });

      const call = vi.mocked(axios.get).mock.calls[0];
      expect(call[0]).toBe('https://graph.facebook.com/v19.0/ig-XYZ/media');
      expect((call[1] as any).params.access_token).toBe('TOK');
      expect((call[1] as any).params.fields).toContain('media_url');
    });
  });

  describe('downloadAndStoreInR2', () => {
    it('streams the IG CDN bytes into R2 with a user-scoped key', async () => {
      const bytes = Buffer.alloc(2048, 0x42);
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        headers: { 'content-type': 'video/mp4' },
      } as any);

      const result = await downloadAndStoreInR2({
        mediaUrl: 'https://ig-cdn/v.mp4',
        userId: 7,
        igMediaId: 'igmedia42',
      });

      expect(result.mimeType).toBe('video/mp4');
      expect(result.size).toBe(2048);
      expect(result.key).toMatch(/^users\/7\/instagram\/igmedia42-.*\.mp4$/);

      expect(uploadToR2).toHaveBeenCalledTimes(1);
      const uploadArgs = vi.mocked(uploadToR2).mock.calls[0];
      expect(uploadArgs[0]).toBe(result.key);
      expect(uploadArgs[2]).toBe('video/mp4');
    });

    it('picks a .mov extension when IG serves quicktime', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: new ArrayBuffer(16),
        headers: { 'content-type': 'video/quicktime; charset=utf-8' },
      } as any);

      const result = await downloadAndStoreInR2({
        mediaUrl: 'https://ig-cdn/v.mov',
        userId: 1,
        igMediaId: 'm',
      });
      expect(result.key.endsWith('.mov')).toBe(true);
      expect(result.mimeType).toBe('video/quicktime');
    });
  });
});
