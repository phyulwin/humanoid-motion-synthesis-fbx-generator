# AI Humanoid Animator 

Turn any video into a reusable humanoid FBX animation clip

## Teammates
- Kelly Lwin (klwin@cpp.edu)

## Inspiration

## What it does

## How we built it

## Challenges we ran into

## Accomplishments that we're proud of

## What we learned

## What's next for AI Humanoid Animator

# File: kinetix-studio/README.md
# This file documents the project layout, setup steps, required environment variables, and external service onboarding.

# Kinetix Studio

Kinetix Studio is a hackathon MVP that turns a short dance video into a reviewable humanoid motion preview and prepares it for FBX export through Blender.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS, React Three Fiber
- Backend: FastAPI, Python, OpenCV, optional MediaPipe
- Export: Blender headless script with a Mixamo-compatible rig template
- Auth: Optional Auth0 login shell for sponsor alignment

## Folder Layout

- `frontend/`: judge-facing web dashboard
- `backend/`: API, job pipeline, preview data generation, and FBX export service
- `backend/storage/`: uploads, job metadata, preview assets, and exports

## Backend Setup

1. Install Python 3.11.
2. Copy `backend/.env.example` to `backend/.env`.
3. Create and activate a virtual environment.
4. Install dependencies with `pip install -r requirements.txt`.
5. Optional: install `mediapipe` separately on a supported Python version if you want live pose extraction instead of the synthetic fallback preview.
6. Start the API with `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`.

## Frontend Setup

1. Install Node.js 20 LTS or newer.
2. Copy `frontend/.env.local.example` to `frontend/.env.local`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

## Required Local Tools

- Blender: install from `https://www.blender.org/download/`
- FFmpeg: install from `https://ffmpeg.org/download.html`

## Mixamo Rig Preparation

1. Visit `https://www.mixamo.com/`.
2. Download a standard humanoid character in T-pose.
3. Import that FBX into Blender.
4. Save the Blender scene as `backend/assets/mixamo_template.blend`.
5. Keep the armature in the scene and do not rename the default Mixamo bones unless you also update `BLENDER_BONE_PREFIX`.

## Optional Auth0 Setup

1. Visit the Auth0 dashboard at `https://manage.auth0.com/`.
2. Create a `Regular Web Application`.
3. Add `http://localhost:3000/auth/callback` to `Allowed Callback URLs`.
4. Add `http://localhost:3000` to `Allowed Logout URLs`.
5. Copy the `Domain`, `Client ID`, and `Client Secret` into `frontend/.env.local`.

Auth0 references:

- [Create Applications](https://auth0.com/docs/get-started/create-apps)
- [Next.js Quickstart](https://auth0.com/docs/quickstart/webapp/nextjs/interactive)

## Environment Files

### `backend/.env`

```env
APP_NAME=Kinetix Studio API
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
CORS_ORIGINS=http://localhost:3000
STORAGE_ROOT=storage
FFMPEG_EXECUTABLE=ffmpeg
BLENDER_EXECUTABLE=
BLENDER_TEMPLATE_BLEND=assets/mixamo_template.blend
BLENDER_BONE_PREFIX=mixamorig:
DEFAULT_EXPORT_FPS=30
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
AUTH0_SECRET=
APP_BASE_URL=http://localhost:3000
AUTH0_DOMAIN=
AUTH0_CLIENT_ID=
AUTH0_CLIENT_SECRET=
AUTH0_AUDIENCE=
AUTH0_SCOPE=openid profile email
```

## Execution Notes

- If OpenCV or MediaPipe is unavailable, the backend automatically falls back to a synthetic dance preview so the UI still functions.
- Real FBX export requires Blender plus `backend/assets/mixamo_template.blend`.
- The export script expects a Mixamo-style armature with the default prefix `mixamorig:`.
