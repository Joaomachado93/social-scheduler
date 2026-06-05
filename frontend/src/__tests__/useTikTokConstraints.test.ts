import { describe, it, expect } from 'vitest';
import { validateForTikTok } from '../composables/useTikTokConstraints.js';

describe('validateForTikTok', () => {
  it('rejects files larger than 4 GB', () => {
    const f = new File([new ArrayBuffer(1)], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(f, 'size', { value: 5 * 1024 ** 3 });
    const r = validateForTikTok(f);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('size');
  });

  it('rejects non-mp4/mov/webm containers', () => {
    const f = new File([new ArrayBuffer(1)], 'a.mkv', { type: 'video/x-matroska' });
    const r = validateForTikTok(f);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('container');
  });

  it('accepts a 100 MB mp4', () => {
    const f = new File([new ArrayBuffer(1)], 'a.mp4', { type: 'video/mp4' });
    Object.defineProperty(f, 'size', { value: 100 * 1024 * 1024 });
    const r = validateForTikTok(f);
    expect(r.ok).toBe(true);
  });
});
