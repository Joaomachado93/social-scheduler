# TikTok App Audit Submission

Materials for upgrading the **Memes do Camões / Social Scheduler** TikTok app from **Sandbox** to **Production** (audited). Once approved, the publisher (already implemented in `backend/src/services/publishers/tiktok.ts`) will receive `PUBLIC_TO_EVERYONE` in `creator_info.query` and posts will go up public automatically — no code changes required.

Submission portal: <https://developers.tiktok.com> → app `sbawf2p4h1dweb4p0o` → **Submit for review**.

---

## 1. App description (long — paste in "App description" field)

Single-tenant content syndication tool used by the page operator of **Memes do Camões** (@memesdocamoes2 on TikTok). The application automates cross-posting of the operator's own Instagram Reels to their own TikTok account and YouTube Shorts channel.

The user owns and operates all source and destination accounts: `memesdocamoes_` on Instagram, `memesdocamoes2` on TikTok, "Memes do Camões" on YouTube. No third-party content is involved.

**How it works:**

1. Once per night (3 AM Europe/Lisbon), the backend reads the publicly available Instagram profile feed of `memesdocamoes_` (no login, no Instagram OAuth, no Graph API) to discover new Reels posted in the previous 48 hours.
2. Each new Reel is downloaded to private Cloudflare R2 storage.
3. A row is inserted into a Postgres database scheduling the publication between 8 AM and 10 PM in Europe/Lisbon, spaced two hours apart.
4. A 1-minute publish cron then calls the TikTok Content Posting API (`/v2/post/publish/video/init/`) for each due item using the OAuth tokens previously obtained from the user's login.
5. Captions and hashtags from the original Instagram Reel are carried over verbatim.

Production URL: <https://joaomachado93.github.io/social-scheduler>
Backend: <https://social-scheduler-backend-e3c1.onrender.com>
Source: <https://github.com/Joaomachado93/social-scheduler>

---

## 2. Scope justifications (paste in each scope field)

### `user.info.basic`
Required to identify which TikTok account authorized the app. We persist `open_id` and `display_name` against the user's record in our database so we can:
- Display the connected account in the management UI
- Verify ownership before each publish attempt
- Refresh tokens against the correct account

### `video.upload`
Fallback path. If the user's account configuration disallows Direct Post (e.g. age-restricted region), we upload the video to the user's Drafts/inbox so they can finalize it themselves in the TikTok app.

### `video.publish`
Primary path. Direct Post the user's own previously-published Instagram Reel to their own TikTok account with the original caption preserved. No third-party content is ever published.

---

## 3. Privacy Policy

Deploy at a public URL (suggested: `https://joaomachado93.github.io/social-scheduler/privacy.html` — a static page in the `frontend/public/` folder works). Paste the URL in the "Privacy policy URL" field.

**Template content:**

> # Privacy Policy — Social Scheduler
>
> Last updated: 2026-06-06
>
> The Social Scheduler is a single-tenant tool operated solely by the owner of the **Memes do Camões** content brand (@memesdocamoes2). It is used to cross-post the operator's own original content from Instagram to TikTok and YouTube.
>
> ## Data we store
> For each connected TikTok account:
> - `open_id` (TikTok's account identifier)
> - `display_name` (the account's public display name)
> - OAuth `access_token` (used to call the Content Posting API on behalf of the user)
> - OAuth `refresh_token` (used to renew the access token before expiry)
> - Token expiry timestamp
>
> Storage: PostgreSQL database hosted on Neon (EU region), encrypted at rest by the managed provider. Tokens are used exclusively for publishing on behalf of the same user who authorized them.
>
> ## Video content
> Videos uploaded for publication are stored temporarily on a private Cloudflare R2 bucket. Files are deleted automatically once all target platforms have confirmed successful publication.
>
> ## Sharing
> No data is shared with third parties. No analytics, advertising, or tracking SDKs are included in the application.
>
> ## Data deletion
> To request deletion of an account and associated data, open an issue at <https://github.com/Joaomachado93/social-scheduler/issues> or disconnect the account via the in-app `/video/platforms` page, which triggers immediate removal of stored credentials.
>
> ## Contact
> joao.machado@gomadevelopment.pt

---

## 4. Terms of Service

Same approach — deploy at a public URL and paste it in the "Terms of service URL" field.

**Template content:**

> # Terms of Service — Social Scheduler
>
> Last updated: 2026-06-06
>
> By connecting a TikTok account through this application, the operator authorizes the application to upload and publish content to that account on their behalf.
>
> Access can be revoked at any time:
> - From the in-app `/video/platforms` page (disconnect)
> - From <https://www.tiktok.com/setting/connected-apps> (revoke at TikTok)
>
> The tool is provided "as-is" with no warranty of availability or correctness. The operator is not responsible for downtime, missed scheduled posts, or downstream platform policy changes that affect publishing.

---

## 5. Demo video — recording script (3-5 minutes)

Record a screen capture on the deployed instance demonstrating the full flow. Narrate briefly that the operator is syndicating their own content.

**Steps to record:**

1. Open <https://joaomachado93.github.io/social-scheduler> → login as the operator
2. Navigate to **/video/platforms** — show the YouTube + TikTok cards already connected (Memes do Camões / Memesdocamoes 🐿️)
3. Navigate to **/video/create** — drag-drop a short MP4 (use a recent test clip), choose a `scheduledAt` 2 minutes in the future, tick both YouTube + TikTok, submit
4. Open **/video/posts** — show the new card with status `scheduled`
5. Wait ~1 minute, refresh, show the status transition: `scheduled` → `processing` → `published`
6. Switch to the TikTok mobile app → @memesdocamoes2 profile → show the new post
7. Switch to YouTube channel → Shorts tab → show the new short
8. Briefly narrate that this is the operator's own Instagram Reel being syndicated to their own accounts

Export as MP4, ≤ 100 MB, upload during portal submission.

---

## 6. App icon + screenshots

- **Icon**: 1024×1024 PNG. Use the Memes do Camões IG profile picture or a simple wordmark.
- **Screenshots**: 2-5 captures of `/video/platforms`, `/video/create`, `/video/posts`. PNG/JPG, ≤ 5 MB each.

---

## 7. Submission checklist

- [ ] Privacy policy URL deployed and reachable
- [ ] Terms of service URL deployed and reachable
- [ ] App icon 1024×1024 ready
- [ ] 2-5 in-app screenshots ready
- [ ] Demo video MP4 < 100 MB ready
- [ ] App description (section 1) pasted in form
- [ ] Each scope justification (section 2) pasted in the respective field
- [ ] Confirm callback URL in portal matches Render: `https://social-scheduler-backend-e3c1.onrender.com/api/video/tiktok/callback`
- [ ] Submit → TikTok reviews in 3-14 days

---

## 8. After approval

When the app becomes "Approved" in the portal:

1. The same `client_key` / `client_secret` (`sbawf2p4h1dweb4p0o` / current secret) keep working — sandbox upgrades to production seamlessly.
2. `creator_info.query` will start returning `PUBLIC_TO_EVERYONE` in the allowed `privacy_level_options` for the connected account.
3. The publisher logic in `backend/src/services/publishers/tiktok.ts` already prefers `SELF_ONLY` only as a fallback — once `PUBLIC_TO_EVERYONE` is available it will use it.
4. No code changes, no redeploy. Posts simply start going public on the next cron tick.

If you also created a separate "Production" app (`aw56xidqgs09fruz`) that's still in Draft, you can delete it from the portal once the audited Sandbox is approved — keeping two parallel apps adds noise.
