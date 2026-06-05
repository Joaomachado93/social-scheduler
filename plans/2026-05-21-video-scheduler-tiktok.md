# Video Scheduler (YouTube + TikTok) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new "Video Scheduler" module to social-scheduler that lets the user schedule a single post and have it publish simultaneously to YouTube and TikTok, fully isolated from the existing Meta (Facebook / Instagram) code paths and UI.

**Architecture:** Extend the existing backend (Fastify + Drizzle + Postgres + R2) with a TikTok OAuth service, a TikTok publisher implementing the Content Posting API (init → chunked upload → poll status), and a `'tiktok'` case in the existing scheduler dispatch. Add a new isolated frontend section (`/video`) with its own platforms view and composer that only knows about YouTube + TikTok — the existing FB/IG Platforms / CreatePost / Dashboard pages remain untouched.

**Tech Stack:**
- Backend: Fastify 5, Drizzle ORM (PostgreSQL), node-cron, axios, R2 (S3-compatible storage), Vitest with `@electric-sql/pglite`
- Frontend: Vue 3 (Composition API, `<script setup>`), TypeScript, Vue Router, Pinia, Tailwind, Vitest + Vue Test Utils
- External: TikTok Content Posting API v2 (`open.tiktokapis.com/v2/post/publish/*`), TikTok Login Kit OAuth 2.0

---

## Open Questions (resolve before or during execution)

1. **Existing YouTube code — leave in place or migrate to new module?**
   The existing `backend/src/services/publishers/youtube.ts` and `backend/src/services/oauth/google.ts` are currently shared with the Meta-era dashboard. This plan **leaves them in place** and reuses them via the same Google OAuth scope set + the same publisher call. **Rationale:** YouTube does not belong to Meta, so reusing it does not violate the isolation rule. If the user later wants a hard fork (rename the files, move them under `backend/src/services/video/`, etc.), open a follow-up plan. Surface this question explicitly when the user reviews the plan.

2. ~~Owner-mode seeding for TikTok.~~ **Resolved:** Yes, mirror the YT pattern with `OWNER_TIKTOK_*` env vars and seed via `ownerSeed.ts`. Keeps parity for single-tenant deployments.

3. **Where the new "Video" section lives in the nav.**
   Plan adds a top-level route `/video` with its own sidebar entry. If the user wants it nested under an existing entry, adjust `frontend/src/layouts/MainLayout.vue` accordingly.

---

## File Structure

### New files (backend)

| Path | Responsibility |
|---|---|
| `backend/src/services/oauth/tiktok.ts` | Build TikTok authorize URL, exchange code → tokens, refresh token, fetch the connected user's `open_id` + display name. |
| `backend/src/services/publishers/tiktok.ts` | Implement the full Direct Post flow: init → chunked PUT to upload URL → poll publish status. Includes retry + token-refresh-on-401. |
| `backend/src/routes/video.ts` | Isolated routes for the Video module: `/api/video/platforms` (list YT + TikTok only), TikTok auth-url + callback, disconnect, post create/list/delete scoped to YT+TikTok platform accounts. **Does not touch any FB/IG code.** |
| `backend/src/db/migrations/0002_add_tiktok_platform.sql` | Drizzle migration adding `'tiktok'` to the `platform` text constraint on `platform_accounts`. |
| `backend/src/__tests__/tiktok-oauth.test.ts` | OAuth callback handler tests (success + bad state). |
| `backend/src/__tests__/tiktok-publisher.test.ts` | Publisher happy path + retry on 401 with mocked HTTP. |
| `backend/src/__tests__/video-routes.test.ts` | `/api/video/*` route contract tests, including isolation (FB/IG accounts must NOT appear in `/api/video/platforms`). |

### Modified files (backend)

| Path | Change |
|---|---|
| `backend/src/db/schema.ts` | Add `'tiktok'` to the `platform` enum of `platformAccounts`. |
| `backend/src/config.ts` | Add `tiktok: { clientKey, clientSecret, redirectUri }` block + optional `owner.tiktok` block. |
| `backend/src/services/scheduler.ts` | Add `case 'tiktok'` to the `switch (account.platform)` dispatch in `publishPost`. **No other changes.** |
| `backend/src/services/ownerSeed.ts` | Add TikTok owner-seed branch (only if Open Question 2 = yes). |
| `backend/src/app.ts` | Register the new `videoRoutes`. |
| `backend/.env.example` | Document new TikTok env vars. |

### New files (frontend)

| Path | Responsibility |
|---|---|
| `frontend/src/pages/video/VideoDashboardPage.vue` | Landing for the Video module — quick stats + CTAs. |
| `frontend/src/pages/video/VideoPlatformsPage.vue` | Connect / disconnect YouTube + TikTok (mirror of `PlatformsPage` but trimmed to those two). |
| `frontend/src/pages/video/VideoCreatePostPage.vue` | Composer that uploads a video, selects YT + TikTok, validates TikTok constraints client-side, and schedules a single post that targets both. |
| `frontend/src/pages/video/VideoPostsListPage.vue` | List of scheduled/published Video posts (filtered to YT+TikTok platforms). |
| `frontend/src/stores/videoPlatforms.ts` | Pinia store hitting `/api/video/*` endpoints. |
| `frontend/src/composables/useTikTokConstraints.ts` | Validates a `File` against TikTok rules (size, duration, container, aspect ratio). |
| `frontend/src/__tests__/useTikTokConstraints.test.ts` | Unit tests for constraint validator. |
| `frontend/src/__tests__/VideoCreatePostPage.test.ts` | Composer validation + submit contract test. |

### Modified files (frontend)

| Path | Change |
|---|---|
| `frontend/src/router/index.ts` | Add the `/video` route subtree. |
| `frontend/src/layouts/MainLayout.vue` | Add the "Video Scheduler" nav entry. |

### Untouched (isolation guarantee)

The following MUST NOT be modified by this plan. If a task here requires touching one of these, stop and flag it:

- `backend/src/services/publishers/facebook.ts`
- `backend/src/services/publishers/instagram.ts`
- `backend/src/services/oauth/meta.ts`
- Any FB/IG-specific route handler block in `backend/src/routes/platforms.ts`
- `frontend/src/pages/PlatformsPage.vue`
- `frontend/src/pages/CreatePostPage.vue`, `PostsListPage.vue`, `PostDetailPage.vue`, `DashboardPage.vue`, `CalendarPage.vue` (the existing dashboard for FB/IG/YT remains as-is)

---

## Phase 0 — TikTok Developer App Walkthrough

This is for the **human user**, not the agent. The agent's job is to produce a copy/pasteable checklist and verify the env file is populated before any code is run.

### Task 0.1: Create the TikTok Developer app

**No files. User-facing checklist:**

- [ ] **Step 1: Sign in to TikTok for Developers**
      Open <https://developers.tiktok.com/> → sign in with your TikTok account → accept developer terms if first time.

- [ ] **Step 2: Create an app**
      Top-right "Manage apps" → "Connect an app" → fill:
      - App name: `Social Scheduler (local)`
      - Category: `Productivity`
      - Description: `Self-hosted scheduler that uploads videos to my own TikTok channel.`

- [ ] **Step 3: Add the "Login Kit" product**
      In the app → "Products" → "+ Add products" → enable **Login Kit**.
      In Login Kit settings:
      - Redirect URI: `http://localhost:3001/api/video/tiktok/callback`
        (for production add a second URI matching your `APP_URL` — e.g. `https://yourdomain.com/api/video/tiktok/callback`)
        ⚠️ **Known TikTok quirk:** the dev portal sometimes rejects plain `http://` URIs even though `localhost` is normally an exception. If you hit a validation error here, switch to `https://localhost:3001/...` and run the backend behind a local self-signed cert (e.g. via `mkcert localhost`). Update `TIKTOK_REDIRECT_URI` to match.
      - Scopes: tick `user.info.basic`, `video.upload`, `video.publish`.

- [ ] **Step 4: Add the "Content Posting API" product**
      Same products screen → "+ Add products" → enable **Content Posting API**.
      Read the docs link it offers; the only setting that matters now is "Direct Post" — make sure it's selected (vs "Upload" which only sends drafts to the user's inbox).

- [ ] **Step 5: Find Client Key + Client Secret**
      In the app's "Basic information" panel, copy the **Client Key** and **Client Secret**.

- [ ] **Step 6: Add to `.env`**
      Append to `~/Desktop/social-scheduler/.env`:

      ```env
      TIKTOK_CLIENT_KEY=<paste>
      TIKTOK_CLIENT_SECRET=<paste>
      TIKTOK_REDIRECT_URI=http://localhost:3001/api/video/tiktok/callback
      ```

- [ ] **Step 7: Understand sandbox vs audited mode**
      Until you submit the app for review and it's **audited**, the Content Posting API runs in **sandbox**:
      - Only TikTok accounts you've added as "Target users" inside the app can authorize and post.
      - All posts go up as **private** (visible only to the posting account). To make them public you must publish them manually in the TikTok app **or** submit the app for audit.
      For this project, sandbox is the right starting point — we'll validate the whole flow against your own account first. Audit submission can be a later milestone.

- [ ] **Step 8: Add yourself as a target user**
      App → "Target users" → add your personal TikTok handle. **You must approve the invite inside the TikTok app** before authorize will succeed.

### Task 0.2: Verify the env

- [ ] **Step 1: Backend boots and reports TikTok as configured**

  ```bash
  cd ~/Desktop/social-scheduler && pnpm dev:backend
  curl -s http://localhost:3001/api/health
  ```

  Expected: server up. (We'll add a `tiktok.configured` flag to `/api/platforms/capabilities` in Phase 2 — for now just verify dotenv loaded; you can `grep TIKTOK ~/Desktop/social-scheduler/.env` and confirm both vars are non-empty.)

---

## Phase 1 — DB migration: add `'tiktok'` to platform enum

The schema uses `text('platform', { enum: [...] })`. **Implementation finding (2026-05-21):** in this project's Drizzle ORM v0.45 setup, `text(..., { enum })` compiles to a plain `text` column with **no CHECK constraint** at the DB level — the enum is a TypeScript-only annotation. Confirmed by inspecting `backend/src/db/migrations/0000_reflective_psylocke.sql` (`"platform" text NOT NULL` with no follow-up `ADD CONSTRAINT` for a check). Consequence: editing the schema's enum array requires **no SQL migration**. `pnpm db:generate` correctly reports "No schema changes". Steps 2–6 below are therefore a no-op; only Step 1 (and the override of Step 7) need to run.

### Task 1.1: Update the schema definition

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add `'tiktok'` to the enum**

  In `backend/src/db/schema.ts`, change:

  ```ts
  platform: text('platform', { enum: ['facebook', 'instagram', 'youtube'] }).notNull(),
  ```

  to:

  ```ts
  platform: text('platform', { enum: ['facebook', 'instagram', 'youtube', 'tiktok'] }).notNull(),
  ```

- [ ] **Step 2: Generate the Drizzle migration**

  Run: `cd ~/Desktop/social-scheduler/backend && pnpm db:generate`
  Expected: a new file appears under `src/db/migrations/0002_*.sql` containing `ALTER TABLE` statements to drop and re-add the platform check constraint with the new value.

- [ ] **Step 3: Rename it for clarity**

  Rename the generated file to `backend/src/db/migrations/0002_add_tiktok_platform.sql`. Update the matching entry in `backend/src/db/migrations/meta/_journal.json` (replace `tag` accordingly).

- [ ] **Step 4: Review the generated SQL**

  Open the file and confirm it does roughly:

  ```sql
  ALTER TABLE "platform_accounts" DROP CONSTRAINT IF EXISTS "platform_accounts_platform_check";
  ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_platform_check"
    CHECK ("platform" IN ('facebook','instagram','youtube','tiktok'));
  ```

  If drizzle-kit produced something different (e.g. wants to alter a TYPE — it shouldn't, this is `text` not `enum`), STOP and ask the user before proceeding.

- [ ] **Step 5: Apply locally**

  Run: `pnpm --filter backend db:migrate`
  Expected: `migration applied 0002_add_tiktok_platform.sql`.

- [ ] **Step 6: Verify**

  ```bash
  psql "$DATABASE_URL" -c "INSERT INTO platform_accounts (user_id, platform, account_id, access_token) VALUES (1, 'tiktok', 'test', 'test'); ROLLBACK;"
  ```

  (Use any existing `user_id`. Wrap in a transaction so it doesn't persist.) Expected: no constraint violation. If you don't have psql, instead run `pnpm --filter backend test -- tiktok-oauth` after Phase 2 lands and confirm the insert in `beforeEach` succeeds.

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/db/schema.ts backend/src/db/migrations/0002_add_tiktok_platform.sql backend/src/db/migrations/meta/
  git commit -m "feat(db): add 'tiktok' to platform_accounts enum"
  ```

---

## Phase 2 — TikTok OAuth service + callback route

### Task 2.1: Add TikTok config block

**Files:**
- Modify: `backend/src/config.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Add `tiktok` block to config**

  In `backend/src/config.ts`, add inside the exported `config` object (alongside `meta` and `google`):

  ```ts
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_REDIRECT_URI || 'http://localhost:3001/api/video/tiktok/callback',
  },
  ```

  And, if Open Question 2 = yes, in the `owner` block add:

  ```ts
  tiktok: {
    openId: process.env.OWNER_TIKTOK_OPEN_ID || '',
    accessToken: process.env.OWNER_TIKTOK_ACCESS_TOKEN || '',
    refreshToken: process.env.OWNER_TIKTOK_REFRESH_TOKEN || '',
    displayName: process.env.OWNER_TIKTOK_DISPLAY_NAME || '',
  },
  ```

- [ ] **Step 2: Mirror the additions in `.env.example`**

  Append:

  ```env
  # TikTok Content Posting API (developers.tiktok.com)
  TIKTOK_CLIENT_KEY=
  TIKTOK_CLIENT_SECRET=
  TIKTOK_REDIRECT_URI=http://localhost:3001/api/video/tiktok/callback

  # Optional: owner-mode TikTok seed
  OWNER_TIKTOK_OPEN_ID=
  OWNER_TIKTOK_ACCESS_TOKEN=
  OWNER_TIKTOK_REFRESH_TOKEN=
  OWNER_TIKTOK_DISPLAY_NAME=
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/config.ts backend/.env.example
  git commit -m "feat(config): add TikTok credentials block"
  ```

### Task 2.2: Implement the OAuth service (TDD)

**Files:**
- Create: `backend/src/services/oauth/tiktok.ts`
- Create: `backend/src/__tests__/tiktok-oauth.test.ts`

- [ ] **Step 1: Write failing test for `getTikTokAuthUrl`**

  In `backend/src/__tests__/tiktok-oauth.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import { getTikTokAuthUrl } from '../services/oauth/tiktok.js';

  describe('getTikTokAuthUrl', () => {
    beforeEach(() => {
      process.env.TIKTOK_CLIENT_KEY = 'CK_TEST';
      process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/video/tiktok/callback';
    });

    it('builds an authorize URL with the right scopes and state', () => {
      const url = new URL(getTikTokAuthUrl('STATE123'));
      expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
      expect(url.searchParams.get('client_key')).toBe('CK_TEST');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toBe('user.info.basic,video.upload,video.publish');
      expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3001/api/video/tiktok/callback');
      expect(url.searchParams.get('state')).toBe('STATE123');
    });
  });
  ```

- [ ] **Step 2: Run it and watch it fail**

  Run: `pnpm --filter backend test -- tiktok-oauth`
  Expected: `Cannot find module '../services/oauth/tiktok'`.

- [ ] **Step 3: Implement `getTikTokAuthUrl`**

  Create `backend/src/services/oauth/tiktok.ts`:

  ```ts
  import axios from 'axios';
  import { config } from '../../config.js';

  const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
  const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
  const USER_INFO_URL = 'https://open.tiktokapis.com/v2/user/info/';

  export function getTikTokAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_key: config.tiktok.clientKey,
      response_type: 'code',
      scope: 'user.info.basic,video.upload,video.publish',
      redirect_uri: config.tiktok.redirectUri,
      state,
    });
    return `${AUTHORIZE_URL}?${params.toString()}`;
  }
  ```

- [ ] **Step 4: Rerun, watch it pass**

  Run: `pnpm --filter backend test -- tiktok-oauth`
  Expected: 1 passed.

- [ ] **Step 5: Write failing test for `exchangeTikTokCode`**

  Append to the same test file:

  ```ts
  import { exchangeTikTokCode } from '../services/oauth/tiktok.js';
  import axios from 'axios';
  vi.mock('axios');

  describe('exchangeTikTokCode', () => {
    beforeEach(() => {
      process.env.TIKTOK_CLIENT_KEY = 'CK_TEST';
      process.env.TIKTOK_CLIENT_SECRET = 'CS_TEST';
      process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/video/tiktok/callback';
      vi.resetAllMocks();
    });

    it('exchanges a code for tokens and resolves the user identity', async () => {
      vi.mocked(axios.post).mockImplementation(async (url: string) => {
        if (url === 'https://open.tiktokapis.com/v2/oauth/token/') {
          return { data: { access_token: 'AT', refresh_token: 'RT', expires_in: 86400, open_id: 'OID' } } as any;
        }
        throw new Error(`Unexpected POST ${url}`);
      });
      vi.mocked(axios.get).mockImplementation(async (url: string) => {
        if (url.startsWith('https://open.tiktokapis.com/v2/user/info/')) {
          return { data: { data: { user: { open_id: 'OID', display_name: 'Joao' } } } } as any;
        }
        throw new Error(`Unexpected GET ${url}`);
      });

      const result = await exchangeTikTokCode('CODE123');
      expect(result.platform).toBe('tiktok');
      expect(result.accountId).toBe('OID');
      expect(result.accountName).toBe('Joao');
      expect(result.accessToken).toBe('AT');
      expect(result.refreshToken).toBe('RT');
      expect(result.tokenExpires).toBeTypeOf('string');
    });
  });
  ```

- [ ] **Step 6: Run, watch it fail**

  Run: `pnpm --filter backend test -- tiktok-oauth`
  Expected: `exchangeTikTokCode is not a function`.

- [ ] **Step 7: Implement `exchangeTikTokCode` + `refreshTikTokToken`**

  Append to `backend/src/services/oauth/tiktok.ts`:

  ```ts
  export type TikTokAccountInfo = {
    platform: 'tiktok';
    accountId: string;       // open_id
    accountName: string;
    accessToken: string;
    refreshToken: string;
    tokenExpires: string | null;
  };

  export async function exchangeTikTokCode(code: string): Promise<TikTokAccountInfo> {
    const tokenRes = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: config.tiktok.redirectUri,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const { access_token, refresh_token, expires_in, open_id } = tokenRes.data;
    if (!access_token) throw new Error('TikTok token exchange returned no access_token');

    const userRes = await axios.get(
      `${USER_INFO_URL}?fields=open_id,display_name`,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );
    const user = userRes.data?.data?.user;
    if (!user?.open_id) throw new Error('TikTok user info missing open_id');

    return {
      platform: 'tiktok',
      accountId: user.open_id,
      accountName: user.display_name || 'TikTok Account',
      accessToken: access_token,
      refreshToken: refresh_token || '',
      tokenExpires: expires_in
        ? new Date(Date.now() + Number(expires_in) * 1000).toISOString()
        : null,
    };
  }

  export async function refreshTikTokToken(refreshToken: string) {
    const res = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        client_key: config.tiktok.clientKey,
        client_secret: config.tiktok.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const { access_token, refresh_token, expires_in } = res.data;
    return {
      accessToken: access_token as string,
      refreshToken: (refresh_token as string) || refreshToken,
      tokenExpires: expires_in
        ? new Date(Date.now() + Number(expires_in) * 1000).toISOString()
        : null,
    };
  }
  ```

- [ ] **Step 8: Rerun, watch it pass**

  Run: `pnpm --filter backend test -- tiktok-oauth`
  Expected: 2 passed.

- [ ] **Step 9: Commit**

  ```bash
  git add backend/src/services/oauth/tiktok.ts backend/src/__tests__/tiktok-oauth.test.ts
  git commit -m "feat(oauth): add TikTok login-kit service"
  ```

### Task 2.3: Wire the auth-url + callback into the new video routes

**Files:**
- Create: `backend/src/routes/video.ts`
- Modify: `backend/src/app.ts`
- Create/extend: `backend/src/__tests__/video-routes.test.ts`

- [ ] **Step 1: Write failing route contract test**

  Create `backend/src/__tests__/video-routes.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach } from 'vitest';
  import { setupTestDb, teardownTestDb, getAuthToken } from './setup.js';
  import { buildApp } from '../app.js';
  import type { FastifyInstance } from 'fastify';
  import bcrypt from 'bcrypt';
  import { users, platformAccounts } from '../db/schema.js';

  describe('Video routes', () => {
    let app: FastifyInstance;
    let token: string;
    let userId: number;

    beforeEach(async () => {
      process.env.TIKTOK_CLIENT_KEY = 'CK_TEST';
      process.env.TIKTOK_CLIENT_SECRET = 'CS_TEST';
      process.env.TIKTOK_REDIRECT_URI = 'http://localhost:3001/api/video/tiktok/callback';

      const db = await setupTestDb();
      const u = await db.insert(users).values({
        email: 'v@t.com', passwordHash: bcrypt.hashSync('x', 10),
      }).returning();
      userId = u[0].id;
      token = getAuthToken(userId, 'v@t.com');

      // Seed one FB account that must NOT appear in /api/video/platforms
      await db.insert(platformAccounts).values({
        userId, platform: 'facebook', accountId: 'fb1', accessToken: 't',
      });
      // And one YouTube account that SHOULD appear
      await db.insert(platformAccounts).values({
        userId, platform: 'youtube', accountId: 'yt1', accessToken: 't',
      });

      app = await buildApp();
    });

    afterEach(async () => { await app.close(); await teardownTestDb(); });

    it('GET /api/video/platforms returns only youtube + tiktok accounts (no FB/IG)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/video/platforms',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].platform).toBe('youtube');
    });

    it('GET /api/video/tiktok/auth-url returns an authorize URL when configured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/video/tiktok/auth-url',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.url).toContain('https://www.tiktok.com/v2/auth/authorize/');
      expect(body.url).toContain('client_key=CK_TEST');
    });
  });
  ```

- [ ] **Step 2: Run, watch it fail (route does not exist)**

  Run: `pnpm --filter backend test -- video-routes`
  Expected: 404s.

- [ ] **Step 3: Implement `video.ts` routes**

  Create `backend/src/routes/video.ts`. Use `backend/src/routes/platforms.ts` as a structural reference — sign/verify state with the same JWT pattern. The handler `GET /api/video/platforms` must filter `platform IN ('youtube','tiktok')`. The callback must delete-then-insert by `(userId, 'tiktok', accountId)` like the existing google callback does.

  ```ts
  import { FastifyInstance } from 'fastify';
  import jwt from 'jsonwebtoken';
  import { db } from '../db/index.js';
  import { platformAccounts } from '../db/schema.js';
  import { eq, and, inArray } from 'drizzle-orm';
  import { authGuard, JwtPayload } from '../middleware/auth.js';
  import { getTikTokAuthUrl, exchangeTikTokCode } from '../services/oauth/tiktok.js';
  import { getGoogleAuthUrl } from '../services/oauth/google.js';
  import { config } from '../config.js';

  const VIDEO_PLATFORMS = ['youtube', 'tiktok'] as const;

  function signState(userId: number) {
    return jwt.sign({ userId }, config.jwtSecret, { expiresIn: '15m' });
  }
  function verifyState(state: string): { userId: number } {
    const p = jwt.verify(state, config.jwtSecret) as { userId: number };
    if (typeof p.userId !== 'number') throw new Error('Invalid OAuth state');
    return { userId: p.userId };
  }

  export async function videoRoutes(app: FastifyInstance) {
    // List YT + TikTok accounts only (isolation: FB/IG never returned here)
    app.get('/api/video/platforms', { preHandler: authGuard }, async (request) => {
      const user = (request as any).user as JwtPayload;
      const rows = await db.select().from(platformAccounts).where(and(
        eq(platformAccounts.userId, user.userId),
        inArray(platformAccounts.platform, VIDEO_PLATFORMS as unknown as string[]),
      ));
      return rows.map(a => ({
        id: a.id, platform: a.platform, accountName: a.accountName,
        accountId: a.accountId, createdAt: a.createdAt,
      }));
    });

    app.get('/api/video/capabilities', { preHandler: authGuard }, async () => ({
      youtube: { configured: !!config.google.clientId && !!config.google.clientSecret },
      tiktok: { configured: !!config.tiktok.clientKey && !!config.tiktok.clientSecret },
    }));

    // YouTube auth-url passthrough (reuses google.ts — no Meta touched)
    app.get('/api/video/youtube/auth-url', { preHandler: authGuard }, async (request, reply) => {
      const user = (request as any).user as JwtPayload;
      if (!config.google.clientId || !config.google.clientSecret) {
        return reply.status(503).send({ error: 'Google OAuth not configured' });
      }
      return { url: getGoogleAuthUrl(signState(user.userId)) };
    });

    // TikTok auth-url
    app.get('/api/video/tiktok/auth-url', { preHandler: authGuard }, async (request, reply) => {
      const user = (request as any).user as JwtPayload;
      if (!config.tiktok.clientKey || !config.tiktok.clientSecret) {
        return reply.status(503).send({ error: 'TikTok OAuth not configured' });
      }
      return { url: getTikTokAuthUrl(signState(user.userId)) };
    });

    // TikTok callback
    app.get('/api/video/tiktok/callback', async (request, reply) => {
      const { code, state } = request.query as { code: string; state: string };
      try {
        const { userId } = verifyState(state);
        const account = await exchangeTikTokCode(code);

        await db.delete(platformAccounts).where(and(
          eq(platformAccounts.userId, userId),
          eq(platformAccounts.platform, 'tiktok'),
          eq(platformAccounts.accountId, account.accountId),
        ));

        await db.insert(platformAccounts).values({
          userId,
          platform: 'tiktok',
          accountId: account.accountId,
          accountName: account.accountName,
          accessToken: account.accessToken,
          refreshToken: account.refreshToken,
          tokenExpires: account.tokenExpires,
        });

        return reply.redirect(`${config.appUrl}/video/platforms?connected=tiktok`);
      } catch (err: any) {
        console.error('TikTok OAuth error:', err.message);
        return reply.redirect(`${config.appUrl}/video/platforms?error=tiktok_auth_failed`);
      }
    });

    // Disconnect — scoped to video platforms only (defence in depth)
    app.delete('/api/video/platforms/:id', { preHandler: authGuard }, async (request, reply) => {
      const user = (request as any).user as JwtPayload;
      const { id } = request.params as { id: string };
      const rows = await db.select().from(platformAccounts).where(and(
        eq(platformAccounts.id, parseInt(id, 10)),
        eq(platformAccounts.userId, user.userId),
        inArray(platformAccounts.platform, VIDEO_PLATFORMS as unknown as string[]),
      )).limit(1);
      if (rows.length === 0) return reply.status(404).send({ error: 'Account not found' });
      await db.delete(platformAccounts).where(eq(platformAccounts.id, parseInt(id, 10)));
      return { success: true };
    });
  }
  ```

- [ ] **Step 4: Register the routes in `app.ts`**

  In `backend/src/app.ts`, add the import + registration alongside the existing `platformRoutes`:

  ```ts
  import { videoRoutes } from './routes/video.js';
  // ...
  await app.register(videoRoutes);
  ```

- [ ] **Step 5: Rerun, watch tests pass**

  Run: `pnpm --filter backend test -- video-routes`
  Expected: 2 passed.

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/routes/video.ts backend/src/app.ts backend/src/__tests__/video-routes.test.ts
  git commit -m "feat(video): isolated /api/video routes with TikTok OAuth callback"
  ```

---

## Phase 3 — TikTok publisher (init → upload → poll)

The flow per TikTok docs:
1. **Init**: `POST /v2/post/publish/video/init/` with `source_info.video_size` + `chunk_size` + `total_chunk_count`, plus `post_info.title`. Returns `publish_id` + `upload_url`.
2. **Upload**: PUT each chunk to `upload_url` with `Content-Range: bytes <start>-<end>/<total>` and `Content-Type: video/mp4`. Last chunk completes the upload.
3. **Poll**: `POST /v2/post/publish/status/fetch/` with `publish_id` every ~5s until `status === 'PUBLISH_COMPLETE'` (or `FAILED`).

We download the watermarked MP4 from R2 first (same pattern `youtube.ts` uses), then run the three-step flow. Use a single 10 MB chunk for files ≤ 64 MB and split into 10 MB chunks otherwise (TikTok currently mandates 5–64 MB chunks and a final chunk that may be smaller).

### Task 3.1: Publisher happy path (TDD)

**Files:**
- Create: `backend/src/services/publishers/tiktok.ts`
- Create: `backend/src/__tests__/tiktok-publisher.test.ts`

- [ ] **Step 1: Write failing happy-path test**

  In `backend/src/__tests__/tiktok-publisher.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest';
  import axios from 'axios';
  vi.mock('axios');
  import { publishToTikTok } from '../services/publishers/tiktok.js';

  describe('publishToTikTok', () => {
    beforeEach(() => {
      vi.resetAllMocks();
      process.env.TIKTOK_CLIENT_KEY = 'CK';
      process.env.TIKTOK_CLIENT_SECRET = 'CS';
    });

    it('inits, uploads a single chunk, polls until PUBLISH_COMPLETE, returns publish_id', async () => {
      const videoBytes = Buffer.alloc(1024 * 1024, 0xab); // 1 MB

      vi.mocked(axios.get).mockResolvedValueOnce({ data: videoBytes.buffer.slice(0, videoBytes.length) } as any);

      vi.mocked(axios.post).mockImplementation(async (url: string, body: any) => {
        if (url.endsWith('/v2/post/publish/video/init/')) {
          return { data: { data: { publish_id: 'PUB123', upload_url: 'https://upload.tiktok/UPL' } } } as any;
        }
        if (url.endsWith('/v2/post/publish/status/fetch/')) {
          return { data: { data: { status: 'PUBLISH_COMPLETE' } } } as any;
        }
        throw new Error('unexpected POST ' + url);
      });

      vi.mocked(axios.put).mockResolvedValueOnce({ status: 201 } as any);

      const result = await publishToTikTok({
        platformAccountId: 1,
        accessToken: 'AT',
        refreshToken: 'RT',
        title: 'My title',
        description: 'My desc',
        mediaFiles: [{ id: 1, mediaType: 'video', mimeType: 'video/mp4', publicUrl: 'https://r2/v.mp4' }],
      });

      expect(result).toBe('PUB123');
      expect(axios.put).toHaveBeenCalledTimes(1);
      const putCall = vi.mocked(axios.put).mock.calls[0];
      expect(putCall[0]).toBe('https://upload.tiktok/UPL');
      expect((putCall[2] as any).headers['Content-Range']).toBe('bytes 0-1048575/1048576');
    });
  });
  ```

- [ ] **Step 2: Run, watch it fail**

  Run: `pnpm --filter backend test -- tiktok-publisher`
  Expected: `Cannot find module`.

- [ ] **Step 3: Implement `publishToTikTok` (single-chunk path)**

  Create `backend/src/services/publishers/tiktok.ts`:

  ```ts
  import axios from 'axios';
  import { db } from '../../db/index.js';
  import { platformAccounts, publishLogs } from '../../db/schema.js';
  import { eq } from 'drizzle-orm';
  import { refreshTikTokToken } from '../oauth/tiktok.js';
  import type { PublisherMedia } from './instagram.js';

  const INIT_URL = 'https://open.tiktokapis.com/v2/post/publish/video/init/';
  const STATUS_URL = 'https://open.tiktokapis.com/v2/post/publish/status/fetch/';

  const POLL_INTERVAL_MS = 5000;
  const POLL_TIMEOUT_MS = 5 * 60_000;
  const MIN_CHUNK_SIZE = 5 * 1024 * 1024;     // 5 MB
  const TARGET_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB
  const SINGLE_CHUNK_MAX = 64 * 1024 * 1024;  // 64 MB

  export type PublishToTikTokArgs = {
    platformAccountId: number;
    accessToken: string;
    refreshToken: string | null;
    title: string;
    description: string;
    mediaFiles: PublisherMedia[];
  };

  export async function publishToTikTok(args: PublishToTikTokArgs): Promise<string> {
    const videos = args.mediaFiles.filter(m => m.mediaType === 'video');
    if (videos.length === 0) throw new Error('TikTok requires at least one video');
    const video = videos[0];

    // 1. Download bytes from R2
    const dl = await axios.get<ArrayBuffer>(video.publicUrl, { responseType: 'arraybuffer' });
    const bytes = Buffer.from(dl.data);
    const totalSize = bytes.length;

    // Chunk plan
    const chunkSize = totalSize <= SINGLE_CHUNK_MAX
      ? totalSize
      : Math.max(MIN_CHUNK_SIZE, TARGET_CHUNK_SIZE);
    const totalChunkCount = Math.ceil(totalSize / chunkSize);

    // 2. Init (with one auto-refresh retry on 401)
    let token = args.accessToken;
    const tryInit = async () => axios.post(INIT_URL, {
      post_info: {
        title: args.title || 'Untitled',
        privacy_level: 'SELF_ONLY', // sandbox-safe default; flip to PUBLIC_TO_EVERYONE post-audit
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: totalSize,
        chunk_size: chunkSize,
        total_chunk_count: totalChunkCount,
      },
    }, { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });

    let initRes;
    try {
      initRes = await tryInit();
    } catch (err: any) {
      if (err?.response?.status === 401 && args.refreshToken) {
        const refreshed = await refreshTikTokToken(args.refreshToken);
        token = refreshed.accessToken;
        await db.update(platformAccounts).set({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpires: refreshed.tokenExpires,
        }).where(eq(platformAccounts.id, args.platformAccountId));
        initRes = await tryInit();
      } else {
        throw err;
      }
    }

    const publishId = initRes.data?.data?.publish_id;
    const uploadUrl = initRes.data?.data?.upload_url;
    if (!publishId || !uploadUrl) throw new Error('TikTok init returned no publish_id/upload_url');

    // 3. Upload chunks
    for (let i = 0; i < totalChunkCount; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, totalSize) - 1;
      const chunk = bytes.subarray(start, end + 1);
      await axios.put(uploadUrl, chunk, {
        headers: {
          'Content-Type': video.mimeType || 'video/mp4',
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
    }

    // 4. Poll
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const st = await axios.post(STATUS_URL,
        { publish_id: publishId },
        { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } },
      );
      const status = st.data?.data?.status;
      if (status === 'PUBLISH_COMPLETE') return publishId;
      if (status === 'FAILED') {
        throw new Error(`TikTok publish FAILED: ${JSON.stringify(st.data?.data?.fail_reason || st.data)}`);
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }
    throw new Error('TikTok publish polling timed out');
  }
  ```

- [ ] **Step 4: Rerun, watch it pass**

  Run: `pnpm --filter backend test -- tiktok-publisher`
  Expected: 1 passed.

- [ ] **Step 5: Add a failing-status test**

  Append:

  ```ts
  it('throws when status fetch returns FAILED', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: Buffer.alloc(1024).buffer } as any);
    vi.mocked(axios.put).mockResolvedValueOnce({ status: 201 } as any);
    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      if (url.endsWith('/init/')) return { data: { data: { publish_id: 'P', upload_url: 'U' } } } as any;
      return { data: { data: { status: 'FAILED', fail_reason: 'bad_codec' } } } as any;
    });
    await expect(publishToTikTok({
      platformAccountId: 1, accessToken: 'AT', refreshToken: 'RT',
      title: 't', description: 'd',
      mediaFiles: [{ id: 1, mediaType: 'video', mimeType: 'video/mp4', publicUrl: 'https://r2/v.mp4' }],
    })).rejects.toThrow(/FAILED/);
  });
  ```

- [ ] **Step 6: Run, expect pass**

  Run: `pnpm --filter backend test -- tiktok-publisher`
  Expected: 2 passed.

- [ ] **Step 7: Add a 401-then-refresh test**

  Append:

  ```ts
  it('refreshes token on 401 from init and retries', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({ data: Buffer.alloc(1024).buffer } as any);
    vi.mocked(axios.put).mockResolvedValueOnce({ status: 201 } as any);

    let initCalls = 0;
    vi.mocked(axios.post).mockImplementation(async (url: string) => {
      if (url.endsWith('/init/')) {
        initCalls++;
        if (initCalls === 1) {
          const err: any = new Error('unauthorized');
          err.response = { status: 401 };
          throw err;
        }
        return { data: { data: { publish_id: 'P', upload_url: 'U' } } } as any;
      }
      if (url.endsWith('/oauth/token/')) {
        return { data: { access_token: 'NEW', refresh_token: 'RT2', expires_in: 86400 } } as any;
      }
      return { data: { data: { status: 'PUBLISH_COMPLETE' } } } as any;
    });

    // platformAccounts update is a no-op against pglite-less test — stub via setupTestDb in real run
    const id = await publishToTikTok({
      platformAccountId: 999, accessToken: 'OLD', refreshToken: 'RT',
      title: 't', description: 'd',
      mediaFiles: [{ id: 1, mediaType: 'video', mimeType: 'video/mp4', publicUrl: 'https://r2/v.mp4' }],
    });
    expect(id).toBe('P');
    expect(initCalls).toBe(2);
  });
  ```

  Note: this test triggers a DB update in the publisher. If your `__tests__/setup.ts` doesn't auto-initialize the DB on import, wrap the `db.update(platformAccounts)` call in publisher with a try/catch that logs but doesn't throw — preferred — OR call `setupTestDb()` in the `beforeEach` of this describe.

- [ ] **Step 8: Run, expect 3 passed**

  Run: `pnpm --filter backend test -- tiktok-publisher`

- [ ] **Step 9: Commit**

  ```bash
  git add backend/src/services/publishers/tiktok.ts backend/src/__tests__/tiktok-publisher.test.ts
  git commit -m "feat(publishers): add TikTok Direct Post publisher"
  ```

---

## Phase 4 — Scheduler dispatch

### Task 4.1: Add `case 'tiktok'` to publishPost

**Files:**
- Modify: `backend/src/services/scheduler.ts`

- [ ] **Step 1: Write failing test that scheduler picks the TikTok publisher**

  Create `backend/src/__tests__/scheduler-tiktok.test.ts`:

  ```ts
  import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
  import { setupTestDb, teardownTestDb } from './setup.js';
  import { users, platformAccounts, posts, postPlatforms, media } from '../db/schema.js';
  import bcrypt from 'bcrypt';
  import { publishPost } from '../services/scheduler.js';

  vi.mock('../services/publishers/tiktok.js', () => ({
    publishToTikTok: vi.fn().mockResolvedValue('TT_PUBLISH_ID'),
  }));

  describe('scheduler dispatch for tiktok', () => {
    let db: any; let postId: number;
    beforeEach(async () => {
      db = await setupTestDb();
      const u = await db.insert(users).values({ email: 'x@t', passwordHash: bcrypt.hashSync('p',10) }).returning();
      const pa = await db.insert(platformAccounts).values({
        userId: u[0].id, platform: 'tiktok', accountId: 'OID', accessToken: 'AT', refreshToken: 'RT',
      }).returning();
      const mRow = await db.insert(media).values({
        userId: u[0].id, originalKey: 'k', mediaType: 'video', mimeType: 'video/mp4', processingStatus: 'done', watermarkedKey: 'wk',
      }).returning();
      const p = await db.insert(posts).values({
        userId: u[0].id, caption: 'hello', scheduledAt: new Date().toISOString(), status: 'processing',
      }).returning();
      postId = p[0].id;
      await db.update(media).set({ postId }).where(/* eq */ undefined as any);
      await db.insert(postPlatforms).values({ postId, platformAccountId: pa[0].id });
    });
    afterEach(async () => { await teardownTestDb(); });

    it('dispatches to publishToTikTok and marks the leg published', async () => {
      const { publishToTikTok } = await import('../services/publishers/tiktok.js');
      await publishPost({ id: postId, caption: 'hello', scheduledAt: new Date().toISOString() });
      expect(publishToTikTok).toHaveBeenCalledOnce();
    });
  });
  ```

  Note: the `media.postId` update is sketched — implement the proper `eq` import / value when typing. Use the existing `posts.test.ts` as a copy-paste reference.

- [ ] **Step 2: Run, watch it fail with "Unknown platform: tiktok"**

- [ ] **Step 3: Add the dispatch case**

  In `backend/src/services/scheduler.ts`, add the import:

  ```ts
  import { publishToTikTok } from './publishers/tiktok.js';
  ```

  And inside `publishPost`'s `switch (account.platform)`:

  ```ts
  case 'tiktok':
    platformPostId = await publishToTikTok({
      platformAccountId: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      title: post.caption?.split('\n')[0] || 'Untitled',
      description: post.caption || '',
      mediaFiles: publisherMedia,
    });
    break;
  ```

- [ ] **Step 4: Run, watch it pass**

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/services/scheduler.ts backend/src/__tests__/scheduler-tiktok.test.ts
  git commit -m "feat(scheduler): dispatch TikTok publishes"
  ```

---

## Phase 5 — Frontend: isolated Video module

### Task 5.1: New router subtree + nav entry

**Files:**
- Modify: `frontend/src/router/index.ts`
- Modify: `frontend/src/layouts/MainLayout.vue`

- [ ] **Step 1: Add routes**

  In `frontend/src/router/index.ts`, append inside the authed `children` array:

  ```ts
  {
    path: 'video',
    name: 'video-dashboard',
    component: () => import('../pages/video/VideoDashboardPage.vue'),
  },
  {
    path: 'video/platforms',
    name: 'video-platforms',
    component: () => import('../pages/video/VideoPlatformsPage.vue'),
  },
  {
    path: 'video/create',
    name: 'video-create',
    component: () => import('../pages/video/VideoCreatePostPage.vue'),
  },
  {
    path: 'video/posts',
    name: 'video-posts',
    component: () => import('../pages/video/VideoPostsListPage.vue'),
  },
  ```

- [ ] **Step 2: Add a nav entry**

  In `frontend/src/layouts/MainLayout.vue`, add a `RouterLink` to `name: 'video-dashboard'` labeled `Video Scheduler`. Place it as a separate group from the FB/IG dashboard to make the isolation visually obvious.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/router/index.ts frontend/src/layouts/MainLayout.vue
  git commit -m "feat(frontend): wire /video router subtree"
  ```

### Task 5.2: TikTok constraints composable (TDD)

**Files:**
- Create: `frontend/src/composables/useTikTokConstraints.ts`
- Create: `frontend/src/__tests__/useTikTokConstraints.test.ts`

- [ ] **Step 1: Write failing tests**

  ```ts
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
  ```

- [ ] **Step 2: Run, watch it fail**

- [ ] **Step 3: Implement**

  ```ts
  // frontend/src/composables/useTikTokConstraints.ts
  const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
  const MAX_BYTES = 4 * 1024 ** 3;

  export function validateForTikTok(file: File): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!ALLOWED_TYPES.includes(file.type)) errors.push('container');
    if (file.size > MAX_BYTES) errors.push('size');
    return { ok: errors.length === 0, errors };
  }
  ```

  > Duration + aspect-ratio checks need decoding the video — defer to a follow-up unless the user wants strict client-side enforcement. The publisher will surface server-side rejections via the `publish_logs` row.

- [ ] **Step 4: Rerun, expect pass**

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/composables/useTikTokConstraints.ts frontend/src/__tests__/useTikTokConstraints.test.ts
  git commit -m "feat(frontend): tiktok client-side constraint validator"
  ```

### Task 5.3: Pinia store for video platforms

**Files:**
- Create: `frontend/src/stores/videoPlatforms.ts`

- [ ] **Step 1: Implement the store**

  Pattern: mirror `frontend/src/stores/platforms.ts` (the existing FB/IG store) but hit `/api/video/*` endpoints and only know about YT + TikTok.

  ```ts
  import { defineStore } from 'pinia';
  import axios from 'axios';

  type Account = { id: number; platform: 'youtube' | 'tiktok'; accountName: string | null; accountId: string; createdAt: string };

  export const useVideoPlatformsStore = defineStore('videoPlatforms', {
    state: () => ({
      accounts: [] as Account[],
      capabilities: { youtube: { configured: false }, tiktok: { configured: false } },
    }),
    actions: {
      async fetchAccounts() {
        const { data } = await axios.get<Account[]>('/api/video/platforms');
        this.accounts = data;
      },
      async fetchCapabilities() {
        const { data } = await axios.get('/api/video/capabilities');
        this.capabilities = data;
      },
      async getAuthUrl(platform: 'youtube' | 'tiktok') {
        const { data } = await axios.get<{ url: string }>(`/api/video/${platform}/auth-url`);
        return data.url;
      },
      async disconnect(id: number) {
        await axios.delete(`/api/video/platforms/${id}`);
        this.accounts = this.accounts.filter(a => a.id !== id);
      },
    },
  });
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add frontend/src/stores/videoPlatforms.ts
  git commit -m "feat(frontend): videoPlatforms pinia store"
  ```

### Task 5.4: Platforms page

**Files:**
- Create: `frontend/src/pages/video/VideoPlatformsPage.vue`

- [ ] **Step 1: Implement**

  Pattern: copy `frontend/src/pages/PlatformsPage.vue` but:
  - trim the `platforms` array to just `youtube` and `tiktok` entries
  - use `useVideoPlatformsStore` instead of `usePlatformsStore`
  - read `route.query.connected` for the success toast (set by the callback redirect we added in Phase 2)

  No FB/IG code, no `meta.configured` checks.

- [ ] **Step 2: Smoke test in the browser**

  Run: `pnpm dev` from the repo root → visit <http://localhost:5173/video/platforms>.
  Expected: page shows YouTube and TikTok cards, with "Connect" buttons that 503 cleanly if env is missing.

- [ ] **Step 3: Commit**

  ```bash
  git add frontend/src/pages/video/VideoPlatformsPage.vue
  git commit -m "feat(frontend): /video/platforms page"
  ```

### Task 5.5: Composer that targets YT + TikTok simultaneously

**Files:**
- Create: `frontend/src/pages/video/VideoCreatePostPage.vue`
- Create: `frontend/src/pages/video/VideoDashboardPage.vue` (thin landing — list active accounts + CTA to composer)
- Create: `frontend/src/pages/video/VideoPostsListPage.vue` (filtered list)
- Create: `frontend/src/__tests__/VideoCreatePostPage.test.ts`

- [ ] **Step 1: Write a failing component test**

  ```ts
  import { describe, it, expect, vi } from 'vitest';
  import { mount } from '@vue/test-utils';
  import { createTestingPinia } from '@pinia/testing';
  import VideoCreatePostPage from '../pages/video/VideoCreatePostPage.vue';

  describe('VideoCreatePostPage', () => {
    it('disables submit while no video file is selected', async () => {
      const wrapper = mount(VideoCreatePostPage, {
        global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
      });
      const btn = wrapper.get('button[data-test="submit"]');
      expect(btn.attributes('disabled')).toBeDefined();
    });
  });
  ```

- [ ] **Step 2: Run, watch it fail**

- [ ] **Step 3: Implement `VideoCreatePostPage.vue`**

  Mirror `frontend/src/pages/CreatePostPage.vue` for the upload + scheduling mechanics, but:
  - Accept exactly one video file
  - Run `validateForTikTok(file)` on selection; show inline errors
  - Show two platform tickboxes (YouTube, TikTok) populated from `videoPlatformsStore.accounts`
  - Require at least one selected, default both selected
  - Submit: POST `/api/posts` with `platformAccountIds` = the selected video accounts, just like the existing composer does

  The backend `posts` routes already handle multi-platform posts — no new endpoint needed.

- [ ] **Step 4: Rerun the unit test, expect pass**

- [ ] **Step 5: Implement Dashboard and PostsList pages**

  These are thin: Dashboard = list connected video accounts + CTA buttons; PostsList = fetch `/api/posts` then filter to posts whose `postPlatforms.account.platform IN (youtube,tiktok)` client-side (or add a `?scope=video` query param to the backend later).

- [ ] **Step 6: Manual smoke**

  Run `pnpm dev` → /video → connect YouTube (existing flow) → connect TikTok (sandbox flow) → upload a 10-second test MP4 → schedule for "in 2 minutes" → wait for scheduler tick.
  Expected: post moves through `scheduled` → `processing` → `published`; appears in YouTube channel as a video; appears in TikTok inbox/private feed as a private video (sandbox mode).

- [ ] **Step 7: Commit**

  ```bash
  git add frontend/src/pages/video/ frontend/src/__tests__/VideoCreatePostPage.test.ts
  git commit -m "feat(frontend): /video composer + dashboard + posts list"
  ```

---

## Phase 6 — Test pass and coverage check

- [ ] **Step 1: Backend full test**

  Run: `pnpm --filter backend test`
  Expected: all green, including the new `tiktok-oauth`, `tiktok-publisher`, `video-routes`, `scheduler-tiktok` suites.

- [ ] **Step 2: Frontend full test**

  Run: `pnpm --filter frontend test`
  Expected: all green, including `useTikTokConstraints` + `VideoCreatePostPage`.

- [ ] **Step 3: Build the whole repo**

  Run: `pnpm build`
  Expected: backend `tsc` + migrations copy succeed; frontend `vue-tsc` + Vite build succeed.

- [ ] **Step 4: Commit any incidental fixes**

---

## Phase 7 — Manual end-to-end smoke checklist

Run against your **sandbox** TikTok app + a real YouTube channel. Use a 10–30 second 1080×1920 (9:16) MP4 to avoid duration/aspect surprises.

- [ ] Backend boots cleanly with all four env blocks populated (Meta, Google, TikTok, R2)
- [ ] `/api/video/capabilities` returns `youtube.configured = true` and `tiktok.configured = true`
- [ ] Visit `/video/platforms` → "Connect TikTok" → TikTok authorize page → grant → redirect lands on `/video/platforms?connected=tiktok` with the account row visible
- [ ] Same flow for YouTube — accounts list shows both
- [ ] Visit `/video/create` → pick a 10s 9:16 MP4 → both YT + TikTok ticked → schedule 2 minutes ahead → submit
- [ ] Scheduler tick (within 1 min of `scheduledAt`) flips status to `processing` then `published`
- [ ] YouTube: video appears on the channel (public, since YT does not have sandbox)
- [ ] TikTok: video appears in the connected account's profile as a **private** post (sandbox)
- [ ] `publish_logs` rows exist for each platform with `level=info` and the platform post id
- [ ] FB/IG flow at `/platforms` and `/posts/create` still works unchanged (no regression in the Meta side of the app)
- [ ] Disconnect TikTok from `/video/platforms` removes the row and re-shows the Connect button

---

## Definition of Done

- All seven phases checked off
- `pnpm test` green at the repo root (backend + frontend)
- `pnpm build` green
- Phase 7 smoke checklist complete with screenshots/notes in `STATUS.md` (or a new section if the file feels stale)
- No file under "Untouched (isolation guarantee)" has been modified in `git log feat/video-scheduler..master -- <those paths>`
- A short paragraph in `STATUS.md` or `README.md` explaining the sandbox-vs-audit submission step the user will need to take to publish to TikTok publicly

---

## Phase 8 — Instagram → YT Shorts + TikTok Auto-Sync (backend-only)

**Goal:** Add a fully automated background job that periodically pulls the user's own Instagram videos / Reels and schedules them to publish on YouTube Shorts + TikTok. No frontend, no manual picking — the user just connects IG, YT, TikTok once via the existing UI and the rest happens automatically.

**Why isolated from Meta code:** This phase reads the existing IG token from `platform_accounts` (shared infrastructure) but does NOT modify `services/oauth/meta.ts`, `services/publishers/instagram.ts`, `services/publishers/facebook.ts`, or any FB/IG-facing UI. A new read-only importer service lives under `services/importers/` — keeping the Meta subsystem frozen as required.

### Architecture

```
cron tick (every 6h)
  → instagramAutoSync.run()
    → for each user with IG + YT + TikTok connected:
      → importer.listRecentVideos(userId)              [Graph API /me/media]
      → filter: media_type ∈ {VIDEO, REELS}, not already in instagram_imports
      → for each new video:
        → importer.downloadToR2(media_url)             [stream IG CDN → R2]
        → DB tx:
          - insert posts(scheduledAt = next slot)
          - insert media(postId, originalKey)
          - insert postPlatforms x2 (YT + TikTok)
          - insert instagram_imports(igMediaId UNIQUE)
existing publish cron (every 1m) takes over from here
```

### Defaults (configurable via env)

| Env var | Default | Purpose |
|---|---|---|
| `IG_AUTOSYNC_ENABLED` | `false` | Master switch. Set `true` to activate. |
| `IG_AUTOSYNC_CRON` | `0 */6 * * *` | When to run the sync job (every 6h on the hour). |
| `IG_AUTOSYNC_LOOKBACK_HOURS` | `48` | Only consider IG media posted in this window. Prevents huge backfill on first activation. |
| `IG_AUTOSYNC_SPACING_HOURS` | `24` | Minimum spacing between scheduled publishes for the same user. |
| `IG_AUTOSYNC_MIN_DELAY_MINUTES` | `60` | Earliest a newly imported video may be scheduled (gives the user time to override/cancel). |

### New files

| Path | Responsibility |
|---|---|
| `backend/src/services/importers/instagram.ts` | Read-only IG Graph API client: `listRecentVideos(token, igUserId, sinceIso)`, `downloadAndStoreInR2(mediaUrl, userId)`. |
| `backend/src/services/jobs/instagramAutoSync.ts` | Orchestrator. Exposes `runInstagramAutoSync()` for cron and tests. |
| `backend/src/db/migrations/0002_instagram_imports.sql` | Migration creating `instagram_imports` table. |
| `backend/src/__tests__/instagram-importer.test.ts` | Tests for IG list + download (mocked axios). |
| `backend/src/__tests__/instagram-auto-sync.test.ts` | Tests: skips already-imported, requires YT+TikTok, computes scheduling slots, no-op if IG disconnected. |

### Modified files

| Path | Change |
|---|---|
| `backend/src/db/schema.ts` | Add `instagramImports` table. |
| `backend/src/config.ts` | Add `instagramAutoSync: { enabled, cron, lookbackHours, spacingHours, minDelayMinutes }`. |
| `backend/src/services/scheduler.ts` | Register a new `cron.schedule(config.instagramAutoSync.cron, runInstagramAutoSync)` block. **Do not touch the existing 1-minute publish cron logic.** |
| `backend/.env.example` | Document the 5 new env vars. |

### Untouched (re-confirm isolation)

The following MUST NOT be modified by this phase. If a task requires touching one of these, stop and flag it:

- `backend/src/services/oauth/meta.ts`
- `backend/src/services/publishers/instagram.ts`
- `backend/src/services/publishers/facebook.ts`
- Any FB/IG-specific route handler in `backend/src/routes/platforms.ts`
- All FB/IG-facing frontend pages
- Any frontend file under `frontend/src/pages/video/` (no UI for this phase)

### Tasks

- [ ] **Step 1: DB schema + migration**
  - Add `instagramImports` table to `schema.ts`:
    - `id` serial PK
    - `userId` integer FK users.id NOT NULL
    - `igMediaId` text NOT NULL
    - `igPermalink` text
    - `postId` integer FK posts.id NOT NULL
    - `importedAt` timestamp NOT NULL default now
    - UNIQUE (`userId`, `igMediaId`)
  - Write `0002_instagram_imports.sql` matching the schema diff
  - Update `meta/_journal.json` with the new entry

- [ ] **Step 2: Config + env vars**
  - Add `instagramAutoSync` block to `config.ts`
  - Document the 5 env vars in `.env.example`

- [ ] **Step 3: Importer service**
  - `listRecentVideos({ igUserId, token, sinceIso }): Promise<IgMediaItem[]>` — Graph API call filtering to VIDEO/REELS, paginates if needed
  - `downloadAndStoreInR2({ mediaUrl, mimeType, userId }): Promise<{ key: string; size: number }>` — stream IG CDN → R2

- [ ] **Step 4: Auto-sync orchestrator**
  - `runInstagramAutoSync()`:
    - For each user that has IG, YT, AND TikTok connected
    - Compute `sinceIso` from `lookbackHours`
    - Fetch IG media list; filter out items in `instagram_imports`
    - Compute scheduling slot per item: `max(now + minDelay, lastScheduledForUser + spacing)`
    - For each item, run in a single DB transaction:
      - Download to R2
      - Insert posts row (caption = IG caption, scheduledAt = slot, status='scheduled')
      - Insert media row (originalKey, processingStatus='done' to skip watermarking)
      - Insert postPlatforms for YT + TikTok
      - Insert instagram_imports row
    - Log a summary line (count imported, count skipped, errors)

- [ ] **Step 5: Cron registration**
  - In `services/scheduler.ts`, after the existing 1-minute and 3am cron, add:
    ```ts
    if (config.instagramAutoSync.enabled) {
      cron.schedule(config.instagramAutoSync.cron, runInstagramAutoSync);
      console.log(`Instagram auto-sync enabled (${config.instagramAutoSync.cron})`);
    }
    ```

- [ ] **Step 6: Tests**
  - `instagram-importer.test.ts`: list returns only VIDEO+REELS, downloads land in R2 with correct key prefix
  - `instagram-auto-sync.test.ts`:
    - skips users missing any of IG / YT / TikTok
    - skips media already in instagram_imports
    - spaces multiple items 24h apart
    - earliest slot honors `minDelayMinutes`
    - copies IG caption verbatim into post.caption
    - creates exactly 2 postPlatforms rows (YT + TikTok) per imported media

- [ ] **Step 7: Run full test suite**
  - `pnpm --filter backend test` must stay green (existing 30 + the new ones)

### Open Questions

1. **Watermark on auto-imported videos?** — Phase 8 defaults to skipping watermark (`processingStatus='done'`, no `watermarkedKey`), because the original IG video already represents the user's branded content. If you want the company logo composited on top for the YT/TikTok upload, flip a flag and reuse `services/watermark.ts`.
2. **Caption translation YT vs TikTok?** — YT title is the first line of the caption (existing scheduler behavior); TikTok also takes first line as title. IG captions often include `\n` + hashtags — same behavior is reused without modification.
3. **Multi-user vs owner-mode?** — The orchestrator iterates all users that have IG+YT+TikTok connected. For single-tenant owner-mode deployments, this is effectively a single iteration. No special-casing needed.

