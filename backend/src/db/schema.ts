import { pgTable, serial, text, integer, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: false }).notNull().defaultNow(),
});

export const platformAccounts = pgTable('platform_accounts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  platform: text('platform', { enum: ['facebook', 'instagram', 'youtube'] }).notNull(),
  accountName: text('account_name'),
  accountId: text('account_id').notNull(),
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  tokenExpires: timestamp('token_expires', { mode: 'string', withTimezone: false }),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: false }).notNull().defaultNow(),
});

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  caption: text('caption'),
  scheduledAt: timestamp('scheduled_at', { mode: 'string', withTimezone: false }).notNull(),
  status: text('status', {
    enum: ['draft', 'scheduled', 'processing', 'published', 'partial', 'failed'],
  }).notNull().default('draft'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { mode: 'string', withTimezone: false }).notNull().defaultNow(),
});

export const postPlatforms = pgTable('post_platforms', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').notNull().references(() => posts.id),
  platformAccountId: integer('platform_account_id').notNull().references(() => platformAccounts.id),
  status: text('status', {
    enum: ['pending', 'publishing', 'published', 'failed'],
  }).notNull().default('pending'),
  platformPostId: text('platform_post_id'),
  errorMessage: text('error_message'),
  publishedAt: timestamp('published_at', { mode: 'string', withTimezone: false }),
});

export const media = pgTable('media', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id),
  originalKey: text('original_key').notNull(),
  watermarkedKey: text('watermarked_key'),
  mediaType: text('media_type', { enum: ['image', 'video'] }).notNull(),
  mimeType: text('mime_type').notNull(),
  fileSize: integer('file_size'),
  sortOrder: integer('sort_order').default(0),
  processingStatus: text('processing_status', {
    enum: ['pending', 'processing', 'done', 'failed'],
  }).default('pending'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: false }).notNull().defaultNow(),
});

export const publishLogs = pgTable('publish_logs', {
  id: serial('id').primaryKey(),
  postId: integer('post_id').references(() => posts.id),
  platform: text('platform'),
  level: text('level').default('info'),
  message: text('message').notNull(),
  details: text('details'),
  createdAt: timestamp('created_at', { mode: 'string', withTimezone: false }).notNull().defaultNow(),
});
