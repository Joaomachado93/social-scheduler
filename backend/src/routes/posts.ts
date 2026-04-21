import { FastifyInstance } from 'fastify';
import { db } from '../db/index.js';
import { posts, postPlatforms, media, platformAccounts } from '../db/schema.js';
import { eq, and, desc, gte, lte, sql, inArray } from 'drizzle-orm';
import { publishLogs } from '../db/schema.js';
import { authGuard, JwtPayload } from '../middleware/auth.js';

export async function postRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authGuard);

  // List posts
  app.get('/api/posts', async (request) => {
    const user = (request as any).user as JwtPayload;
    const query = request.query as { status?: string; from?: string; to?: string };

    let result = db.select().from(posts)
      .where(eq(posts.userId, user.userId))
      .orderBy(desc(posts.scheduledAt))
      .all();

    if (query.status) {
      result = result.filter(p => p.status === query.status);
    }
    if (query.from) {
      result = result.filter(p => p.scheduledAt >= query.from!);
    }
    if (query.to) {
      result = result.filter(p => p.scheduledAt <= query.to!);
    }

    return result;
  });

  // Get single post with platforms and media
  app.get('/api/posts/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const post = db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .get();

    if (!post) return reply.status(404).send({ error: 'Post not found' });

    const platforms = db.select({
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
      .where(eq(postPlatforms.postId, postId)).all();

    const mediaFiles = db.select().from(media)
      .where(eq(media.postId, postId)).all();

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

    const post = db.insert(posts).values({
      userId: user.userId,
      caption: body.caption,
      scheduledAt: body.scheduledAt,
      status,
    }).returning().get();

    // Link platforms
    if (body.platformAccountIds?.length) {
      for (const accountId of body.platformAccountIds) {
        db.insert(postPlatforms).values({
          postId: post.id,
          platformAccountId: accountId,
        }).run();
      }
    }

    // Link media
    if (body.mediaIds?.length) {
      for (let i = 0; i < body.mediaIds.length; i++) {
        db.update(media)
          .set({ postId: post.id, sortOrder: i })
          .where(eq(media.id, body.mediaIds[i]))
          .run();
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

    const existing = db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .get();

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

    db.update(posts).set(updates).where(eq(posts.id, postId)).run();

    // Update platform links
    if (body.platformAccountIds) {
      db.delete(postPlatforms).where(eq(postPlatforms.postId, postId)).run();
      for (const accountId of body.platformAccountIds) {
        db.insert(postPlatforms).values({
          postId,
          platformAccountId: accountId,
        }).run();
      }
    }

    // Update media links
    if (body.mediaIds) {
      // Unlink old media
      db.update(media).set({ postId: null }).where(eq(media.postId, postId)).run();
      for (let i = 0; i < body.mediaIds.length; i++) {
        db.update(media)
          .set({ postId, sortOrder: i })
          .where(eq(media.id, body.mediaIds[i]))
          .run();
      }
    }

    return db.select().from(posts).where(eq(posts.id, postId)).get();
  });

  // Delete post
  app.delete('/api/posts/:id', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const existing = db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .get();

    if (!existing) return reply.status(404).send({ error: 'Post not found' });

    // Cascade: delete post_platforms, unlink media
    db.delete(postPlatforms).where(eq(postPlatforms.postId, postId)).run();
    db.update(media).set({ postId: null }).where(eq(media.postId, postId)).run();
    db.delete(posts).where(eq(posts.id, postId)).run();

    return { success: true };
  });

  // Publish now
  app.post('/api/posts/:id/publish-now', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const post = db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .get();

    if (!post) return reply.status(404).send({ error: 'Post not found' });
    if (!['scheduled', 'failed'].includes(post.status)) {
      return reply.status(400).send({ error: 'Post cannot be published in current state' });
    }

    // Import and publish
    const { publishPost } = await import('../services/scheduler.js');
    await publishPost(post);

    return db.select().from(posts).where(eq(posts.id, postId)).get();
  });

  // Duplicate post — clones caption, platform links, and media links as a new draft
  // scheduled +1h from now. Returns the new post row.
  app.post('/api/posts/:id/duplicate', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    const source = db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .get();

    if (!source) return reply.status(404).send({ error: 'Post not found' });

    const newScheduledAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const clone = db.insert(posts).values({
      userId: user.userId,
      caption: source.caption,
      scheduledAt: newScheduledAt,
      status: 'draft',
    }).returning().get();

    // Clone platform links (status resets to 'pending')
    const sourcePlatforms = db.select().from(postPlatforms)
      .where(eq(postPlatforms.postId, postId)).all();
    for (const pp of sourcePlatforms) {
      db.insert(postPlatforms).values({
        postId: clone.id,
        platformAccountId: pp.platformAccountId,
      }).run();
    }

    return clone;
  });

  // Get publish logs for a post
  app.get('/api/posts/:id/logs', async (request, reply) => {
    const user = (request as any).user as JwtPayload;
    const { id } = request.params as { id: string };
    const postId = parseInt(id);

    // Verify ownership
    const post = db.select().from(posts)
      .where(and(eq(posts.id, postId), eq(posts.userId, user.userId)))
      .get();

    if (!post) return reply.status(404).send({ error: 'Post not found' });

    return db.select().from(publishLogs)
      .where(eq(publishLogs.postId, postId))
      .orderBy(desc(publishLogs.createdAt))
      .all();
  });
}
