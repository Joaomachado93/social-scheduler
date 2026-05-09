import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { posts, postPlatforms, media, platformAccounts, publishLogs } from '../db/schema.js';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { authGuard, JwtPayload } from '../middleware/auth.js';

export async function postRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authGuard);

  // List posts
  app.get('/api/posts', async (request) => {
    const user = (request as any).user as JwtPayload;
    const query = request.query as { status?: string; from?: string; to?: string };

    const conditions = [eq(posts.userId, user.userId)];
    if (query.status) conditions.push(eq(posts.status, query.status as any));
    if (query.from) conditions.push(gte(posts.scheduledAt, query.from));
    if (query.to) conditions.push(lte(posts.scheduledAt, query.to));

    return await db.select().from(posts)
      .where(and(...conditions))
      .orderBy(desc(posts.scheduledAt));
  });

  // Get single post with platforms and media
  app.get('/api/posts/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const postRows = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .limit(1);
    const post = postRows[0];

    if (!post) return reply.status(404).send({ error: 'Post not found' });

    const platforms = await db.select({
      id: postPlatforms.id,
      postId: postPlatforms.postId,
      platformAccountId: postPlatforms.platformAccountId,
      status: postPlatforms.status,
      platformPostId: postPlatforms.platformPostId,
      errorMessage: postPlatforms.errorMessage,
      publishedAt: postPlatforms.publishedAt,
      platform: platformAccounts.platform,
      accountName: platformAccounts.accountName,
    }).from(postPlatforms)
      .innerJoin(platformAccounts, eq(postPlatforms.platformAccountId, platformAccounts.id))
      .where(eq(postPlatforms.postId, postId));

    const mediaFiles = await db.select().from(media)
      .where(eq(media.postId, postId));

    return { ...post, platforms, media: mediaFiles };
  });

  // Create post
  app.post('/api/posts', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const body = request.body as {
      caption: string;
      scheduledAt: string;
      platformAccountIds: number[];
      mediaIds: number[];
      status?: 'scheduled' | 'draft';
    };

    const status = body.status === 'draft' ? 'draft' : 'scheduled';

    const inserted = await db.insert(posts).values({
      userId: user.userId,
      caption: body.caption,
      scheduledAt: body.scheduledAt,
      status,
    }).returning();
    const post = inserted[0];

    if (body.platformAccountIds?.length) {
      for (const accountId of body.platformAccountIds) {
        await db.insert(postPlatforms).values({
          postId: post.id,
          platformAccountId: accountId,
        });
      }
    }

    if (body.mediaIds?.length) {
      for (let i = 0; i < body.mediaIds.length; i++) {
        await db.update(media)
          .set({ postId: post.id, sortOrder: i })
          .where(eq(media.id, body.mediaIds[i]));
      }
    }

    return post;
  });

  // Update post
  app.put('/api/posts/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);
    const body = request.body as {
      caption?: string;
      scheduledAt?: string;
      platformAccountIds?: number[];
      mediaIds?: number[];
      status?: 'scheduled' | 'draft';
    };

    const existingRows = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .limit(1);
    const existing = existingRows[0];

    if (!existing) return reply.status(404).send({ error: 'Post not found' });
    if (!['draft', 'scheduled'].includes(existing.status)) {
      return reply.status(400).send({ error: 'Cannot edit a post that is already processing or published' });
    }

    const updates: any = { updatedAt: new Date().toISOString() };
    if (body.caption !== undefined) updates.caption = body.caption;
    if (body.scheduledAt !== undefined) updates.scheduledAt = body.scheduledAt;
    if (body.status && ['draft', 'scheduled'].includes(body.status)) {
      updates.status = body.status;
    }

    await db.update(posts).set(updates).where(eq(posts.id, postId));

    if (body.platformAccountIds) {
      await db.delete(postPlatforms).where(eq(postPlatforms.postId, postId));
      for (const accountId of body.platformAccountIds) {
        await db.insert(postPlatforms).values({
          postId,
          platformAccountId: accountId,
        });
      }
    }

    if (body.mediaIds) {
      await db.update(media).set({ postId: null }).where(eq(media.postId, postId));
      for (let i = 0; i < body.mediaIds.length; i++) {
        await db.update(media)
          .set({ postId, sortOrder: i })
          .where(eq(media.id, body.mediaIds[i]));
      }
    }

    const updatedRows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    return updatedRows[0];
  });

  // Delete post
  app.delete('/api/posts/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const existingRows = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .limit(1);

    if (existingRows.length === 0) return reply.status(404).send({ error: 'Post not found' });

    await db.delete(postPlatforms).where(eq(postPlatforms.postId, postId));
    await db.update(media).set({ postId: null }).where(eq(media.postId, postId));
    await db.delete(posts).where(eq(posts.id, postId));

    return { success: true };
  });

  // Publish now
  app.post('/api/posts/:id/publish-now', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const postRows = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .limit(1);
    const post = postRows[0];

    if (!post) return reply.status(404).send({ error: 'Post not found' });
    if (!['scheduled', 'failed'].includes(post.status)) {
      return reply.status(400).send({ error: 'Post cannot be published in current state' });
    }

    const { publishPost } = await import('../services/scheduler.js');
    await publishPost(post);

    const updatedRows = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    return updatedRows[0];
  });

  // Duplicate post
  app.post('/api/posts/:id/duplicate', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const sourceRows = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .limit(1);
    const source = sourceRows[0];

    if (!source) return reply.status(404).send({ error: 'Post not found' });

    const newScheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const cloneInserted = await db.insert(posts).values({
      userId: user.userId,
      caption: source.caption,
      scheduledAt: newScheduledAt,
      status: 'draft',
    }).returning();
    const clone = cloneInserted[0];

    const sourcePlatforms = await db.select().from(postPlatforms)
      .where(eq(postPlatforms.postId, postId));
    for (const pp of sourcePlatforms) {
      await db.insert(postPlatforms).values({
        postId: clone.id,
        platformAccountId: pp.platformAccountId,
      });
    }

    return clone;
  });

  // Get publish logs for a post
  app.get('/api/posts/:id/logs', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const ownerRows = await db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .limit(1);

    if (ownerRows.length === 0) return reply.status(404).send({ error: 'Post not found' });

    return await db.select().from(publishLogs)
      .where(eq(publishLogs.postId, postId))
      .orderBy(desc(publishLogs.createdAt));
  });
}
