# Project Setup

This file documents the project layout, setup steps, required environment variables, and external service onboarding.

Setup first: install `Node.js 20+`, `Python 3.11`, `Blender`, and `FFmpeg`; create `frontend/.env.local` from `.env.local.example` and `backend/.env` from `.env.example`; if using sponsor tooling, set up `Auth0` app credentials in `frontend/.env.local`, put a Mixamo rig file at `backend/assets/mixamo_template.blend`, and optionally install `mediapipe` for real pose extraction instead of fallback preview.

## Setup .env files
```
Update incoming 
```

Backend commands:
```powershell
cd src\backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
To deactivate: ```deactivate```

Frontend commands:
```powershell
cd src\frontend
npm install
npm run dev
```
Then open `http://localhost:3000`.

Run both `backend` and `frontend` at the same time.

### Expected workflow:

- run backend on `:8000`
- run frontend on `:3000`
- open the frontend in browser
- upload a video there
- frontend sends the file to backend
- backend processes it
- frontend updates to show progress, preview state, and export actions




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

## Optional Auth0 Setup

1. Visit the Auth0 dashboard at `https://manage.auth0.com/`.
2. Create a `Regular Web Application`.
3. Add `http://localhost:3000/auth/callback` to `Allowed Callback URLs`.
4. Add `http://localhost:3000` to `Allowed Logout URLs`.
5. Copy the `Domain`, `Client ID`, and `Client Secret` into `frontend/.env.local`.

Auth0 references:

- [Create Applications](https://auth0.com/docs/get-started/create-apps)
- [Next.js Quickstart](https://auth0.com/docs/quickstart/webapp/nextjs/interactive)

Also set up Environment Files for both frontend and backend.

## Execution Notes

- If OpenCV or MediaPipe is unavailable, the backend automatically falls back to a synthetic dance preview so the UI still functions.
- Real FBX export requires Blender plus `backend/assets/mixamo_template.blend`.
- The export script expects a Mixamo-style armature with the default prefix `mixamorig:`.
