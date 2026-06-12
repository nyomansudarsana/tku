---
title: TKU Backend
emoji: 📦
colorFrom: yellow
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# TKU Backend

FastAPI backend for **Tech Kiosk Ubud** — inventory & sales management system.

## API

- Interactive docs: `https://<your-space>.hf.space/docs`
- Health check: `https://<your-space>.hf.space/health`

## Environment Variables

Set these in the Hugging Face Space **Settings → Variables and secrets**:

| Variable | Required | Description |
|---|---|---|
| `SECRET_KEY` | Yes | Random 64-char hex string — run `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | No | Defaults to `sqlite:////data/tku.db` (persistent storage) |
| `ALLOWED_ORIGINS` | Yes | Comma-separated frontend URLs, e.g. `https://your-app.vercel.app` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | Default: `480` (8 hours) |
| `DEBUG` | No | Default: `False` |
