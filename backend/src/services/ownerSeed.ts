import { db } from '../db/index.js';
import { platformAccounts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { config } from '../config.js';

type Platform = 'facebook' | 'instagram' | 'youtube';

interface SeedSpec {
  platform: Platform;
  accountId: string;
  accountName: string;
  accessToken: string;
  refreshToken?: string;
}

function specsFromEnv(): SeedSpec[] {
  const out: SeedSpec[] = [];
  const o = config.owner;

  if (o.facebook.pageId && o.facebook.pageToken) {
    out.push({
      platform: 'facebook',
      accountId: o.facebook.pageId,
      accountName: o.facebook.pageName || `FB Page ${o.facebook.pageId}`,
      accessToken: o.facebook.pageToken,
    });
  }
  if (o.instagram.businessId && o.instagram.token) {
    out.push({
      platform: 'instagram',
      accountId: o.instagram.businessId,
      accountName: o.instagram.businessName || `IG @${o.instagram.businessId}`,
      accessToken: o.instagram.token,
    });
  }
  if (o.youtube.channelId && o.youtube.accessToken) {
    out.push({
      platform: 'youtube',
      accountId: o.youtube.channelId,
      accountName: o.youtube.channelName || `YT ${o.youtube.channelId}`,
      accessToken: o.youtube.accessToken,
      refreshToken: o.youtube.refreshToken || undefined,
    });
  }
  return out;
}

export function ownerSeedConfigured(): boolean {
  return specsFromEnv().length > 0;
}

/**
 * Ensure every owner-configured platform exists in this user's
 * platform_accounts. Idempotent — runs on every login/register but only
 * inserts what's missing. If env vars get rotated, the row's accessToken
 * is also refreshed so future requests use the new credential.
 */
export async function seedOwnerPlatformsForUser(userId: number): Promise<void> {
  const specs = specsFromEnv();
  if (specs.length === 0) return;

  for (const spec of specs) {
    const existing = await db.select().from(platformAccounts)
      .where(and(
        eq(platformAccounts.userId, userId),
        eq(platformAccounts.platform, spec.platform),
        eq(platformAccounts.accountId, spec.accountId),
      ))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(platformAccounts).values({
        userId,
        platform: spec.platform,
        accountId: spec.accountId,
        accountName: spec.accountName,
        accessToken: spec.accessToken,
        refreshToken: spec.refreshToken ?? null,
      });
    } else {
      // Refresh credentials if env was rotated; leave display fields as-is
      // unless empty.
      const row = existing[0];
      const needsUpdate =
        row.accessToken !== spec.accessToken ||
        (spec.refreshToken && row.refreshToken !== spec.refreshToken);
      if (needsUpdate) {
        await db.update(platformAccounts)
          .set({
            accessToken: spec.accessToken,
            refreshToken: spec.refreshToken ?? row.refreshToken,
          })
          .where(eq(platformAccounts.id, row.id));
      }
    }
  }
}
