# Provisioning Neon + Cloudflare R2

Step-by-step to unblock the migration. Both services have generous free tiers — no credit card needed for Neon, R2 needs one but doesn't charge under the free limits.

---

## 1. Neon Postgres (DB)

**Goal:** get a `DATABASE_URL` like `postgresql://user:pass@host.neon.tech/db?sslmode=require`

1. Open https://neon.tech and **Sign up** with GitHub or email.
2. After login, click **Create Project**.
   - Project name: `social-scheduler`
   - Postgres version: **17** (default)
   - Region: pick closest to you (e.g. `Europe (Frankfurt)` or `Europe (London)`)
3. After it provisions, you land on the dashboard. Copy the **Connection string** shown in the "Connection Details" panel — it looks like:
   ```
   postgresql://neondb_owner:XXXX@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
   ```
4. **Send it to me** (paste in chat). I'll add it to `.env` and run the migration.

> **Free tier:** 0.5 GB storage, project sleeps when idle. Plenty for this app.

---

## 2. Cloudflare R2 (object storage)

**Goal:** provision a bucket + API token so the app can upload media. Need 6 values: account ID, access key ID, secret, bucket name, public URL, logo key.

### 2a. Enable R2

1. Go to https://dash.cloudflare.com → log in (sign up if needed; free, requires payment method but free tier is generous: 10 GB storage + 1M Class A ops/month).
2. In the left sidebar click **R2 Object Storage**.
3. If it's the first time, click **Purchase R2 Plan** → choose **Free Tier** → confirm. (Won't charge under limits.)

### 2b. Create the bucket

1. Click **Create bucket**.
2. Name: `social-scheduler` (must be globally unique-ish; if taken use `social-scheduler-joao` or similar)
3. Location: **Automatic** (or pick EU)
4. Click **Create bucket**.

### 2c. Enable public dev URL

1. Open the new bucket → **Settings** tab.
2. Under **Public access** → **R2.dev subdomain** → click **Allow Access** and confirm.
3. Copy the public URL — looks like `https://pub-xxxxxxxxxxxxxxxxxxxx.r2.dev`. **This is `R2_PUBLIC_URL`.**

> Production-grade setup uses a custom domain instead of `r2.dev`, but the dev subdomain is fine for now.

### 2d. Create an API token

1. From the R2 dashboard left sidebar (still inside R2 section), click **Manage R2 API Tokens** (top-right or in a "API" submenu — Cloudflare moves this around).
2. Click **Create API Token**.
3. Settings:
   - **Token name:** `social-scheduler-app`
   - **Permissions:** **Object Read & Write**
   - **Specify bucket:** select `social-scheduler` (or "Apply to all buckets" if you prefer)
   - **TTL:** Forever (or whatever)
4. Click **Create API Token**.
5. Copy the three values shown **once** (Cloudflare won't show them again):
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   - The page also shows your **Account ID** at the top of the R2 dashboard — that's `R2_ACCOUNT_ID`. (You can also find it in the URL: `dash.cloudflare.com/<account-id>/r2/...`)

### 2e. Upload the watermark logo

1. In the bucket (`social-scheduler`) → **Objects** tab → **Upload**.
2. Folder: type `watermark/` to put it in a folder.
3. File: upload your watermark PNG (transparent background recommended).
4. The full key after upload should be `watermark/logo.png` — that's `R2_LOGO_KEY`. If your filename is different (e.g. `watermark/my-logo.png`), use that exact path.

---

## 3. What to send me

When all set, paste these 7 values (one per line is fine — I'll handle the rest):

```
DATABASE_URL=postgresql://...
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=social-scheduler
R2_PUBLIC_URL=https://pub-xxxx.r2.dev
R2_LOGO_KEY=watermark/logo.png
```

I'll then:
1. Write them into `~/Desktop/social-scheduler/.env`
2. Run `pnpm --filter backend db:migrate` (creates schema in Neon)
3. Boot the app and smoke-test (create a post, upload media → R2 → verify public URL works)
4. Report back, ask if you want to commit + deploy

---

## Estimated time
- Neon: ~3 minutes
- R2 (including watermark upload): ~7 minutes
- Total: ~10 minutes
