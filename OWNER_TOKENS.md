# Owner Tokens — Personal-Use Setup

For personal use (publishing to **your own** Facebook Page, Instagram Business
account, and/or YouTube channel) you don't need to put every user through
OAuth. Generate long-lived tokens once and store them in Render env vars; the
app auto-seeds every login session with them.

When `OWNER_FB_*` / `OWNER_IG_*` / `OWNER_YT_*` env vars are present, the
backend skips the OAuth dance entirely:

- `POST /api/auth/register` and `POST /api/auth/login` call
  `seedOwnerPlatformsForUser(userId)`, which inserts a `platform_accounts`
  row pointing at the env-supplied token (idempotent — re-runs only update
  the `accessToken` / `refreshToken` if the env value changed).
- The Platforms page in the UI hides the "Conectar" buttons and shows the
  seeded accounts as "Pré-ligada (owner token)".

Each block is independent — set only the platforms you actually want
available.

---

## Facebook Page + Instagram Business

Both use the same long-lived **Page Access Token**. You need a Facebook Page
you administer, and (for IG) an Instagram Business account linked to that
Page.

### 1. Create a Meta App (one-time)

1. Go to https://developers.facebook.com/apps and click **Create App** →
   **Other** → **Business**.
2. Name it (e.g. `social-scheduler-personal`) → Create App.
3. Copy the **App ID** and **App Secret** from Settings → Basic.
4. Add the products:
   - **Facebook Login for Business**
   - **Instagram Graph API**

### 2. Get a long-lived Page Access Token

1. Go to https://developers.facebook.com/tools/explorer
2. Top-right: select your app from the **Meta App** dropdown.
3. **User or Page** dropdown → pick **Get Page Access Token** → select your Page.
4. Add permissions: `pages_manage_posts`, `pages_read_engagement`,
   `instagram_basic`, `instagram_content_publish`.
5. Click **Generate Access Token** and authorize.
6. The token in the box is **short-lived** (~1h). Click the **info (i)** icon
   next to the token → **Open in Access Token Tool** → **Extend Access
   Token**. You now have a ~60-day Page token. (Page tokens that come from
   long-lived user tokens are effectively permanent in practice; refresh
   every ~60 days to be safe.)

### 3. Get the Page ID and IG Business ID

In Graph API Explorer with your Page token:
- `me/accounts` → returns your Pages with `id` (= `OWNER_FB_PAGE_ID`)
- `<page-id>?fields=instagram_business_account` → returns `instagram_business_account.id` (= `OWNER_IG_BUSINESS_ID`)
- `me?fields=name` → page name (= `OWNER_FB_PAGE_NAME`)

### 4. Set env vars on Render

In Render dashboard → social-scheduler-backend → Environment:

```
OWNER_FB_PAGE_ID=12345...
OWNER_FB_PAGE_TOKEN=EAA...
OWNER_FB_PAGE_NAME=My Page

OWNER_IG_BUSINESS_ID=178xxxxxxx
OWNER_IG_BUSINESS_NAME=@my_handle
# OWNER_IG_TOKEN is optional — if unset, IG reuses OWNER_FB_PAGE_TOKEN
```

Save. Render auto-restarts.

---

## YouTube

YouTube uploads need a refresh token (access tokens expire fast). Use Google's
**OAuth Playground** to generate one without standing up a full OAuth app.

### 1. Create a Google Cloud project (one-time)

1. https://console.cloud.google.com → New Project (e.g. `social-scheduler-personal`).
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → Credentials** → **Create Credentials** → **OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: `https://developers.google.com/oauthplayground`
4. Copy the **Client ID** and **Client Secret**.

### 2. Generate a refresh token via OAuth Playground

1. Go to https://developers.google.com/oauthplayground
2. Top-right gear icon → check **Use your own OAuth credentials** → paste the
   Client ID + Client Secret.
3. Step 1 — left panel scope picker → search **YouTube Data API v3** → pick
   `https://www.googleapis.com/auth/youtube.upload` → click **Authorize APIs**.
4. Sign in with the Google account that owns the YouTube channel → Allow.
5. Step 2 — click **Exchange authorization code for tokens**.
6. Copy the **Refresh token** (you'll only see it once).
7. Optionally also copy the access token; it'll auto-refresh anyway.

### 3. Get the channel ID

In OAuth Playground after step 5:
- Step 3 → Request URI: `https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true`
- Send the request. Response contains `items[0].id` (= `OWNER_YT_CHANNEL_ID`)
  and `items[0].snippet.title` (= `OWNER_YT_CHANNEL_NAME`).

### 4. Set env vars on Render

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...

OWNER_YT_CHANNEL_ID=UCxxxxxx
OWNER_YT_CHANNEL_NAME=My Channel
OWNER_YT_REFRESH_TOKEN=1//0g...
# OWNER_YT_ACCESS_TOKEN optional — first publish refreshes it anyway
```

Save. `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are still required because
the publisher uses them when refreshing the access token.

---

## Verifying

1. Hard-refresh the live frontend.
2. Login (or register) — the seed runs on every session.
3. Go to **Platforms** — the configured accounts should appear with the badge
   "Pré-ligada (owner token)" instead of a Conectar button.
4. Create a post, select the seeded platform(s), schedule it for ~2 minutes
   in the future.
5. Wait for the cron to fire. Check the post detail page → "Histórico de
   Publicação" should show the platform's response (success with the remote
   post id, or the API error if anything is wrong with the token / scopes).

## Token rotation

- **Facebook Page tokens** issued via Graph API Explorer with the long-lived
  flow are good for ~60 days. Re-do the "Extend Access Token" step periodically
  and update `OWNER_FB_PAGE_TOKEN` in Render env. The seed picks up the new
  value on the next login (and updates the existing `platform_accounts` row).
- **Google refresh tokens** don't expire as long as you keep using them.
  If unused for 6 months they're revoked — re-run the OAuth Playground flow.
