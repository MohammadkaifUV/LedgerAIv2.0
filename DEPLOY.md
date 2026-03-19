# LedgerAI Deployment Guide

## Architecture

| Service        | Platform | URL (after deploy)            |
|----------------|----------|-------------------------------|
| `frontend-web` | Vercel   | `https://ledgerai.vercel.app` |
| `backend`      | Railway  | `https://backend-xxx.railway.app` |
| `ml-service`   | Railway  | `https://ml-service-xxx.railway.app` |

---

## Prerequisites

- Vercel CLI: `npm install -g vercel`
- Railway CLI: `npm install -g @railway/cli`
- A [Vercel account](https://vercel.com/signup) (free)
- A [Railway account](https://railway.app) (free tier available)

---

## Step 1 — Deploy ML Service to Railway (do this first)

The backend needs the ML service URL, so deploy it first.

```bash
cd ml-service
railway login          # opens browser to log in
railway link           # link to existing project OR create new one → name it "ledgerai-ml"
railway up             # builds using the Dockerfile and deploys
```

Once deployed, generate and get the public URL:
```bash
railway domain         # generates a public URL, e.g. https://ledgerai-ml-production.up.railway.app
```

**No environment variables needed** for the ML service — it's self-contained.

---

## Step 2 — Deploy Backend to Railway

```bash
cd backend
railway login          # already logged in if you did Step 1
railway init           # create a new project → name it "ledgerai-backend"
railway up             # deploys using railway.toml (node server.js)
```

Set environment variables in Railway dashboard (or via CLI):
```bash
railway variables set SUPABASE_URL=your_supabase_url
railway variables set SUPABASE_ANON_KEY=your_supabase_anon_key
railway variables set SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
railway variables set OPENROUTER_API_KEY=your_openrouter_api_key
railway variables set LLM_MODEL=google/gemini-2.5-flash
railway variables set NODE_ENV=production

# 👇 Critical: point backend to the ML service URL from Step 1
railway variables set ML_SERVICE_URL=https://ledgerai-ml-xxx.railway.app

# Set ALLOWED_ORIGINS after you know your Vercel URL (update after Step 3)
railway variables set ALLOWED_ORIGINS=https://your-app.vercel.app
```

Get the backend public URL:
```bash
railway domain         # e.g. https://ledgerai-backend-xxx.railway.app
```

---

## Step 3 — Deploy Frontend to Vercel

```bash
cd ..                  # go back to project root (LedgerAI v2.0/)
vercel login           # opens browser to log in
vercel                 # first deploy — follow the prompts:
                       #   Set up and deploy? → Y
                       #   Which scope? → your account
                       #   Link to existing project? → N
                       #   Project name? → ledgerai
                       #   Directory? → ./ (root, vercel.json handles the rest)
```

Set environment variables in Vercel dashboard or via CLI:
```bash
vercel env add VITE_SUPABASE_URL         # paste your Supabase URL
vercel env add VITE_SUPABASE_ANON_KEY    # paste your Supabase anon key
vercel env add VITE_API_BASE_URL         # paste backend Railway URL from Step 2
                                         # e.g. https://ledgerai-backend-xxx.railway.app
```

Then redeploy to pick up the env vars:
```bash
vercel --prod
```

---

## Step 4 — Update CORS on Backend

Now that you have your Vercel URL, update the backend ALLOWED_ORIGINS:

```bash
cd backend
railway variables set ALLOWED_ORIGINS=https://ledgerai.vercel.app
railway up             # redeploy to apply
```

---

## Environment Variable Summary

### `backend` (Railway)
| Variable | Value |
|---|---|
| `SUPABASE_URL` | From Supabase dashboard |
| `SUPABASE_ANON_KEY` | From Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase dashboard |
| `OPENROUTER_API_KEY` | From openrouter.ai/keys |
| `LLM_MODEL` | `google/gemini-2.5-flash` |
| `ML_SERVICE_URL` | Railway URL of ml-service |
| `ALLOWED_ORIGINS` | Your Vercel frontend URL |
| `NODE_ENV` | `production` |

### `ml-service` (Railway)
None — fully self-contained.

### `frontend-web` (Vercel)
| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | From Supabase dashboard |
| `VITE_SUPABASE_ANON_KEY` | From Supabase dashboard |
| `VITE_API_BASE_URL` | Railway URL of backend |

---

## Subsequent Deploys

```bash
# Frontend
vercel --prod

# Backend
cd backend && railway up

# ML Service
cd ml-service && railway up
```
