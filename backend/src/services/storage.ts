import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { config } from '../config.js';

let cachedClient: S3Client | null = null;

export function getR2Client(): S3Client {
  if (!cachedClient) {
    if (!config.r2.accountId || !config.r2.accessKeyId || !config.r2.secretAccessKey) {
      throw new Error('R2 credentials missing — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    }
    cachedClient = new S3Client({
      region: 'auto',
      endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
  }
  return cachedClient;
}

export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array | Readable,
  contentType: string,
): Promise<void> {
  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
  }));
}

export async function getFromR2(key: string): Promise<Buffer> {
  const client = getR2Client();
  const res = await client.send(new GetObjectCommand({
    Bucket: config.r2.bucket,
    Key: key,
  }));
  if (!res.Body) throw new Error(`Object not found: ${key}`);
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as Readable) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function getPublicUrl(key: string): string {
  if (!config.r2.publicUrl) {
    throw new Error('R2_PUBLIC_URL is required to serve public media');
  }
  return `${config.r2.publicUrl}/${key}`;
}
