# TKU Deployment Guide

**Backend** → Hugging Face Spaces (Docker SDK)  
**Frontend** → Vercel (GitHub integration)  
**Database** → SQLite (persisted at `/data/tku.db` on HF Spaces)

---

## Prerequisites

- GitHub account
- [Hugging Face](https://huggingface.co) account
- [Vercel](https://vercel.com) account (free, sign in with GitHub)
- [Git](https://git-scm.com/download/win) installed (Windows)
- [VS Code](https://code.visualstudio.com) with the Git extension

---

## Step 1 — Push to GitHub

### 1.1 Create the GitHub repository

1. Go to https://github.com → **New repository**
2. Name: `tku` (or `tech-kiosk-ubud`)
3. Visibility: **Private** (recommended — the repo contains no secrets but has business logic)
4. Do NOT initialize with README (we already have one)
5. Click **Create repository**

### 1.2 Push the project from VS Code

Open VS Code in the `d:\TKU` folder. Then open the **Source Control** panel (`Ctrl+Shift+G`):

```
1. Click "Initialize Repository"
2. Stage all files (click the "+" next to "Changes")
3. Write commit message: "Initial commit"
4. Click the checkmark to commit
5. Click "Publish Branch"
6. Select the GitHub repo you just created
```

Or via terminal (PowerShell):

```powershell
cd D:\TKU
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR-USERNAME/tku.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Deploy Backend to Hugging Face Spaces

### 2.1 Create the Space

1. Go to https://huggingface.co/spaces → **Create new Space**
2. Space name: `tku-backend`
3. License: MIT (or your choice)
4. **SDK: Docker**
5. Hardware: **CPU Basic** (free)
6. Visibility: **Public** (required for free hardware) or **Private** (paid)
7. Click **Create Space**

Your Space URL will be: `https://huggingface.co/spaces/YOUR-USERNAME/tku-backend`

### 2.2 Configure environment variables

In the Space → **Settings → Variables and secrets**:

| Variable | Value | Sensitive? |
|---|---|---|
| `SECRET_KEY` | Run: `python -c "import secrets; print(secrets.token_hex(32))"` | Yes (secret) |
| `DATABASE_URL` | `sqlite:////data/tku.db` | No |
| `ALLOWED_ORIGINS` | `https://your-tku.vercel.app` (fill in after Vercel deploy) | No |
| `DEBUG` | `False` | No |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | No |

> **Important:** Add `DATABASE_URL` before first deployment. The `/data` path is HF's persistent storage.  
> **Important:** `SECRET_KEY` must be set as a **secret** (not a public variable) — it signs your JWTs.

### 2.3 Push backend files to the Space

The HF Space has its own git repo. Push the backend to it:

```powershell
# In PowerShell — one-time setup
cd D:\TKU\backend

git init
git remote add hf https://YOUR-USERNAME:YOUR-HF-TOKEN@huggingface.co/spaces/YOUR-USERNAME/tku-backend
git add .
git commit -m "Deploy backend"
git push hf main --force
```

**Getting your HF token:**  
huggingface.co → Profile → Settings → Access Tokens → New token → **Write** permission

The Space will auto-build from the `Dockerfile`. Watch the build logs in the Space's **Logs** tab.

### 2.4 Verify the deployment

Once the build goes green, visit:

```
https://YOUR-USERNAME-tku-backend.hf.space/health
# Should return: {"status": "ok"}

https://YOUR-USERNAME-tku-backend.hf.space/docs
# Should show the FastAPI Swagger UI
```

> **Note on HF free tier**: The Space goes to sleep after ~15 minutes of inactivity. First request after sleep takes ~30 seconds to wake up. This is normal for the free tier.

---

## Step 3 — Deploy Frontend to Vercel

### 3.1 Import the GitHub repo

1. Go to https://vercel.com → **Add New → Project**
2. Import your `tku` GitHub repository
3. **Root Directory**: set to `frontend`
4. Framework Preset: **Vite** (auto-detected)
5. Click **Deploy**

### 3.2 Set the environment variable

After the first deploy (or in Settings before deploying):

1. Vercel project → **Settings → Environment Variables**
2. Add:
   - Name: `VITE_API_BASE_URL`
   - Value: `https://YOUR-USERNAME-tku-backend.hf.space/api/v1`
   - Environments: Production, Preview, Development

3. **Redeploy**: Deployments → latest → **Redeploy**

### 3.3 Update CORS on the backend

Now that you have the Vercel URL (e.g. `https://tku-xyz.vercel.app`):

1. Go to HF Space → Settings → Variables
2. Update `ALLOWED_ORIGINS` to your Vercel URL
3. The Space will restart automatically

### 3.4 Verify the full stack

Open your Vercel URL in a browser. Log in with `admin` / `admin123`.

---

## Step 4 — Automate future deploys (optional)

After the initial push, you can automate backend redeploys via GitHub Actions.

### 4.1 Add GitHub Secrets

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret name | Value |
|---|---|
| `HF_TOKEN` | Your Hugging Face write-access token |
| `HF_SPACE` | `YOUR-USERNAME/tku-backend` |

### 4.2 How it works

The workflow at [.github/workflows/deploy-backend.yml](.github/workflows/deploy-backend.yml) automatically pushes any changes in the `backend/` folder to your HF Space whenever you push to `main`.

Vercel auto-deploys the frontend on every push (no extra setup needed once connected).

**Your daily workflow:**

```
Edit code in VS Code
→ git add, commit, push to GitHub
→ Vercel rebuilds frontend automatically
→ GitHub Actions pushes backend to HF Spaces automatically
```

---

## Troubleshooting

### "CORS error" in the browser

Check that `ALLOWED_ORIGINS` in the HF Space exactly matches your Vercel URL (no trailing slash).

### "502 Bad Gateway" from HF Space

The Space is waking up from sleep. Wait 30 seconds and try again.

### Login fails in production

1. Confirm `VITE_API_BASE_URL` is set in Vercel and includes `/api/v1`
2. Confirm `SECRET_KEY` is set as a secret in HF Spaces
3. Check CORS: `ALLOWED_ORIGINS` must match your frontend URL exactly

### Database is empty after deployment

The seed script runs only once (on first deploy when `/data/tku.db` doesn't exist). If you need to re-seed:
1. In HF Space → **Settings → Persistent Storage → Delete** the storage
2. Restart the Space — it will re-seed on startup

### Frontend shows blank page / 404 on refresh

Ensure `frontend/vercel.json` is committed to the repo. It adds the SPA rewrite rule.

---

## SQLite vs Supabase for production

| | SQLite on HF Spaces | Supabase (PostgreSQL) |
|---|---|---|
| Cost | Free | Free tier available |
| Concurrent writes | ~5–10 users OK | Scales to thousands |
| Setup | Already done | Requires schema migration |
| Data persistence | HF persistent storage (50 GB) | Supabase cloud |
| Backup | Manual / download | Automatic |
| Recommendation | **Good for demo / UAT** | Use for live production |

For the current demo and UAT phase, SQLite on HF Spaces is the right choice. Migrate to Supabase when the system goes live with real daily transactions.
