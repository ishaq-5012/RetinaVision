# RetinaVision – Render Deployment Guide

`render.yaml` is a Render Blueprint that creates two free services:

| Service            | Type         | What it is                          |
| ------------------ | ------------ | ----------------------------------- |
| `cardiovision-api` | Python web   | FastAPI AI backend (`backend/`)     |
| `cardiovision`     | Static site  | React + Vite website (`dist/`)      |

## 1. Deploy the Blueprint

1. Sign in at [render.com](https://render.com) with GitHub.
2. **New → Blueprint** → select the `RetinaVision` repository → **Apply**.
3. Render asks for the values marked `sync: false`:

   | Key                      | Value                                                        |
   | ------------------------ | ------------------------------------------------------------ |
   | `GROQ_API_KEY`           | your key from [console.groq.com](https://console.groq.com)   |
   | `VITE_SUPABASE_URL`      | Supabase → Project Settings → API → Project URL              |
   | `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key        |
   | `VITE_API_URL`           | the backend URL, e.g. `https://cardiovision-api.onrender.com` |

   `VITE_*` values are baked in at build time: after changing one, run
   **Manual Deploy → Clear build cache & deploy** on the `cardiovision` site.

## 2. Configure Supabase

Supabase → **Authentication → URL Configuration**:

- **Site URL**: your website URL, e.g. `https://cardiovision.onrender.com`
- **Redirect URLs**: add the same URL.

## 3. Check it

- Backend: open `https://<api-url>/api/health` – should return JSON.
- Website: open the site URL, sign in, upload a scan.

## Notes

- **Free plan sleep**: the free backend sleeps after ~15 min idle; the first
  request afterwards takes ~1 minute.
- **Supabase pause**: free Supabase projects pause after ~7 days without use.
  Login then fails until you click **Restore project** in the Supabase dashboard.
- **Ephemeral disk**: files the backend writes under `uploads/` are lost on
  restart/redeploy. Scan results are stored in Supabase.
- `backend/Dockerfile` is an alternative for Docker-based hosts; Render's
  Blueprint uses the native Python runtime instead.
- TensorFlow is not installed in production (only needed for training, see
  `backend/requirements-training.txt`).

## Keeping Supabase awake

`.github/workflows/supabase-keepalive.yml` runs a small database query every
2 days so the free Supabase project never auto-pauses. It needs two repository
secrets in GitHub (**Settings → Secrets and variables → Actions**):
`SUPABASE_URL` and `SUPABASE_ANON_KEY`. If a run fails, GitHub emails you:
that means the project is paused and needs **Restore project**.

GitHub turns off scheduled workflows in repositories with no commits for 60
days; re-enable it from the **Actions** tab if that happens.
