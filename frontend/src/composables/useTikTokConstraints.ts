const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_BYTES = 4 * 1024 ** 3;

export function validateForTikTok(file: File): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!ALLOWED_TYPES.includes(file.type)) errors.push('container');
  if (file.size > MAX_BYTES) errors.push('size');
  return { ok: errors.length === 0, errors };
}
