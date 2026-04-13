import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const platformAccounts = sqliteTable('platform_accounts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  platform: text('platform', { enum: ['facebook', 'instagram', 'youtube'] }).notNull(),
  accountName: text('account_name'),
  accountId: text('account_id').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpires: text('token_expires'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().references(() => users.id),
  caption: text('caption'),
  scheduledAt: text('scheduled_at').notNull(),
  status: text('status', {
    enum: ['draft', 'scheduled', 'processing', 'published', 'partial', 'failed'],
  }).notNull().default('draft'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

export const postPlatforms = sqliteTable('post_platforms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').notNull().references(() => posts.id),
  platformAccountId: integer('platform_account_id').notNull().references(() => platformAccounts.id),
  status: text('status', {
    enum: ['pending', 'publishing', 'published', 'failed'],
  }).notNull().default('pending'),
  platformPostId: text('platform_post_id'),
  errorMessage: text('error_message'),
  publishedAt: text('published_at'),
});

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').references(() => posts.id),
  originalPath: text('original_path').notNull(),
  watermarkedPath: text('watermarked_path'),
  mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size'),
  sortOrder: integer('sort_order').default(0),
  processingStatus: text('processing_status', {
    enum: ['pending', 'processing', 'done', 'failed'],
  }).default('pending'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export const publishLogs = sqliteTable('publish_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  postId: integer('post_id').references(() => posts.id),
  platform: text('platform'),
  level: text('level').default('info'),
  message: text('message').notNull(),
  details: text('details'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});
