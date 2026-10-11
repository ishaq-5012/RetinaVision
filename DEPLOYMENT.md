# RetinaVision Render Deployment Guide

This guide walks you through deploying RetinaVision (frontend + backend) to Render.

## Prerequisites

1. **Render Account**: Sign up at [render.com](https://render.com)
2. **GitHub Repository**: This repo must be connected to Render
3. **Supabase Project**: Set up at [supabase.com](https://supabase.com)
   - Get your `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. **Groq API Key**: Get from [console.groq.com](https://console.groq.com)

---

## Option 1: Deploy via Render Dashboard (Recommended)

### Step 1: Connect GitHub to Render

1. Go to [render.com](https://render.com) and log in
2. Click **New +** → **Web Service**
3. Select **GitHub** and authorize
4. Search for and select `RetinaVision` repo
5. Click **Connect**

### Step 2: Create Backend Service

1. Name: `retinavision-backend`
2. Environment: **Python 3**
3. Build Command:
   ```bash
   pip install -r backend/requirements.txt
   ```
4. Start Command:
   ```bash
   uvicorn backend.main:app --host 0.0.0.0 --port $PORT
   ```
5. Plan: **Standard** (recommended)
6. Root Directory: (leave blank)

**Add Environment Variables:**
- `AI_API_PORT` = `8000`
- `GROQ_API_KEY` = `your_groq_api_key_here`
- `GROQ_VISION_MODEL` = `qwen/qwen3.8-27b`

Click **Create Web Service**. Note the backend URL (e.g., `https://retinavision-backend.onrender.com`)

### Step 3: Create Frontend Service

1. Go back to Render dashboard
2. Click **New +** → **Static Site**
3. Name: `retinavision-frontend`
4. Build Command:
   ```bash
   npm install && npm run build
   ```
5. Publish Directory: `dist`
6. Root Directory: (leave blank)

**Add Environment Variables:**
- `VITE_SUPABASE_URL` = `https://your-project-ref.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `your-anon-key`
- `VITE_API_URL` = `https://retinavision-backend.onrender.com`

Click **Create Static Site**

---

## Option 2: Deploy via `render.yaml` (Infrastructure as Code)

### Step 1: Configure Services in `render.yaml`

The `render.yaml` file in the repo root already contains configuration for both services.

### Step 2: Connect to Render

1. Go to [render.com](https://render.com)
2. Click **Dashboard** → **New +** → **Blueprint**
3. Select your GitHub repository
4. Render will auto-detect `render.yaml` and configure both services
5. Review the services and fill in environment variables:
   - **Frontend**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
   - **Backend**: `GROQ_API_KEY`

Click **Deploy**

---

## Step 3: Configure Environment Variables

After deployment, add secret environment variables:

### Backend Service
1. Go to backend service dashboard
2. **Environment** tab
3. Add:
   - `GROQ_API_KEY` = (your Groq API key)

### Frontend Service
1. Go to frontend service dashboard
2. **Environment** tab
3. Add:
   - `VITE_SUPABASE_URL` = (your Supabase project URL)
   - `VITE_SUPABASE_ANON_KEY` = (your Supabase anon key)
   - `VITE_API_URL` = `https://retinavision-backend.onrender.com`

---

## Step 4: Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com)
2. Create a new project or use existing
3. In **Settings** → **API**, copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_ANON_KEY`

---

## Step 5: Verify Deployment

### Check Backend Health
```bash
curl https://retinavision-backend.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "app": "CardioVisionAI",
  "engines": { ... }
}
```

### Check Frontend
Visit `https://retinavision-frontend.onrender.com` in your browser

### Test Upload Endpoint
```bash
curl -X POST https://retinavision-backend.onrender.com/api/upload \
  -F "file=@path/to/retina.jpg"
```

---

## Cost Breakdown

| Service | Plan | Cost |
|---------|------|------|
| Frontend (Static Site) | Free/Pro | $0 - $7/month |
| Backend (Web Service) | Standard | $7 - $49/month |
| **Total** | | **$7 - $56/month** |

---

## Troubleshooting

### Backend fails to start
1. Check **Logs** tab in Render dashboard
2. Verify `GROQ_API_KEY` is set
3. Ensure Python 3.11+ is specified
4. Run locally first: `cd backend && uvicorn main:app --reload`

### Frontend shows blank page
1. Check browser console for CORS errors
2. Verify `VITE_API_URL` points to correct backend
3. Confirm `VITE_SUPABASE_URL` and key are correct
4. Check Render build logs

### API calls fail (CORS)
The backend has CORS enabled for all origins. If issues persist:
1. Check backend logs: `curl https://retinavision-backend.onrender.com/`
2. Verify frontend environment variables
3. Test direct API call: `curl https://retinavision-backend.onrender.com/api/health`

### Model training or uploads slow
- Backend free tier goes to sleep after 15 min inactivity
- Upgrade to **Standard** plan for persistent service
- For large uploads, increase timeout in frontend API client

---

## Redeployment & Updates

### Manual Redeploy
1. Push changes to GitHub
2. Render auto-detects and redeploys (if auto-deploy is enabled)
3. To manually trigger: Dashboard → Service → **Redeploy**

### Manual Trigger
```bash
# Option 1: Push a commit
git push origin main

# Option 2: Use Render API
curl -X POST https://api.render.com/v1/services/{service-id}/deploys \
  -H "Authorization: Bearer $RENDER_API_KEY"
```

---

## Next Steps

1. **Set up authentication**: Supabase has built-in Auth (see `src/hooks/useAuth.tsx`)
2. **Train the model**: Place dataset in `backend/dataset/`, then:
   ```bash
   python -m ai_engine.training.train --data-dir backend/dataset --epochs 60
   ```
3. **Monitor**: Use Render's Monitoring tab for uptime and performance metrics
4. **Custom domain**: Add domain in **Settings** → **Custom Domain**

---

## Support

- **Render Docs**: https://render.com/docs
- **FastAPI Docs**: https://fastapi.tiangolo.com
- **React/Vite Docs**: https://vitejs.dev
- **Supabase Docs**: https://supabase.com/docs

