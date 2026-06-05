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
import { listRecentVideosByUsername, downloadAndStoreInR2 } from '../services/importers/instagram.js';
import { uploadToR2 } from '../services/storage.js';

function makeEdge(opts: {
  id?: string;
  shortcode?: string;
  is_video: boolean;
  video_url?: string;
  display_url?: string;
  caption?: string;
  taken_at_timestamp: number; // seconds
}) {
  const captionEdges = opts.caption ? [{ node: { text: opts.caption } }] : [];
  return {
    node: {
      id: opts.id,
      shortcode: opts.shortcode,
      is_video: opts.is_video,
      video_url: opts.video_url,
      display_url: opts.display_url,
      taken_at_timestamp: opts.taken_at_timestamp,
      edge_media_to_caption: { edges: captionEdges },
    },
  };
}

describe('Instagram importer (public profile scrape)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listRecentVideosByUsername', () => {
    it('returns only videos posted since the cutoff, with proper headers', async () => {
      const now = Date.now();
      const recentSec = Math.floor((now - 60 * 60_000) / 1000);   // 1h ago
      const oldSec = Math.floor((now - 72 * 3_600_000) / 1000);   // 72h ago
      const sinceIso = new Date(now - 48 * 3_600_000).toISOString();

      vi.mocked(axios.get).mockResolvedValueOnce({
        data: {
          data: {
            user: {
              edge_owner_to_timeline_media: {
                edges: [
                  makeEdge({ id: '1', shortcode: 'A', is_video: true,  video_url: 'https://ig/a.mp4', display_url: 'https://ig/a.jpg', caption: 'cap A', taken_at_timestamp: recentSec }),
                  makeEdge({ id: '2', shortcode: 'B', is_video: false, taken_at_timestamp: recentSec }), // photo — skip
                  makeEdge({ id: '3', shortcode: 'C', is_video: true,  video_url: 'https://ig/c.mp4', taken_at_timestamp: oldSec }), // too old — skip
                  makeEdge({ id: '4', shortcode: 'D', is_video: true,  taken_at_timestamp: recentSec }), // no video_url — skip
                  makeEdge({ id: '5', shortcode: 'E', is_video: true,  video_url: 'https://ig/e.mp4', taken_at_timestamp: recentSec }),
                ],
              },
            },
          },
        },
      } as any);

      const items = await listRecentVideosByUsername({ username: 'joaomachado93', sinceIso });

      expect(items.map((i) => i.id)).toEqual(['1', '5']);
      expect(items[0].caption).toBe('cap A');
      expect(items[0].permalink).toBe('https://www.instagram.com/p/A/');
      expect(items[0].mediaType).toBe('REELS');

      const call = vi.mocked(axios.get).mock.calls[0];
      expect(call[0]).toContain('username=joaomachado93');
      expect((call[1] as any).headers['X-IG-App-ID']).toBe('936619743392459');
      expect((call[1] as any).headers['User-Agent']).toContain('Mozilla');
    });

    it('returns empty array when profile has no media', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: { data: { user: { edge_owner_to_timeline_media: { edges: [] } } } },
      } as any);
      const items = await listRecentVideosByUsername({ username: 'empty', sinceIso: new Date().toISOString() });
      expect(items).toEqual([]);
    });

    it('handles missing user payload gracefully (returns empty)', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({ data: { data: { user: null } } } as any);
      const items = await listRecentVideosByUsername({ username: 'gone', sinceIso: new Date().toISOString() });
      expect(items).toEqual([]);
    });
  });

  describe('downloadAndStoreInR2', () => {
    it('streams IG CDN bytes into R2 with a user-scoped key', async () => {
      const bytes = Buffer.alloc(2048, 0x42);
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        headers: { 'content-type': 'video/mp4' },
      } as any);

      const result = await downloadAndStoreInR2({
        mediaUrl: 'https://ig-cdn/v.mp4',
        userId: 7,
        igMediaId: '12345678',
      });

      expect(result.mimeType).toBe('video/mp4');
      expect(result.size).toBe(2048);
      expect(result.key).toMatch(/^users\/7\/instagram\/12345678-.*\.mp4$/);

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

    it('sanitizes unsafe characters from igMediaId in the storage key', async () => {
      vi.mocked(axios.get).mockResolvedValueOnce({
        data: new ArrayBuffer(8),
        headers: { 'content-type': 'video/mp4' },
      } as any);

      const result = await downloadAndStoreInR2({
        mediaUrl: 'https://ig-cdn/v.mp4',
        userId: 1,
        igMediaId: 'ab/cd ef?gh',
      });
      // Slashes, spaces, query chars stripped before the random UUID.
      expect(result.key).toMatch(/^users\/1\/instagram\/abcdefgh-.*\.mp4$/);
    });
  });
});
