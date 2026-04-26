# Project Setup

This file covers project structure, local setup, environment variables, and required external tools.

## Requirements

Install:

- Node.js 20+
- Python 3.11
- [Blender](https://www.blender.org/download/)
- [FFmpeg](https://ffmpeg.org/download.html)
- MediaPipe (optional, for backup pose extraction)

---

## Environment Files

Create these files:

```text
frontend/.env.local
backend/.env
```

From:

```text
frontend/.env.local.example
backend/.env.example
```

### Required Minimum

### frontend/.env.local

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

### backend/.env

```env
BLENDER_EXECUTABLE=C:\Program Files\Blender Foundation\Blender 4.4\blender.exe
FFMPEG_EXECUTABLE=ffmpeg
```

---

## Backend Setup

```powershell
cd src\backend

python -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Deactivate:

```powershell
deactivate
```

Backend runs on:

```text
http://localhost:8000
```

---

## Frontend Setup

```powershell
cd src\frontend

npm install
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

---

## Run Order

Run both frontend and backend at the same time.

### Expected Workflow

1. Start backend on port 8000
2. Start frontend on port 3000
3. Open browser at localhost:3000
4. Upload a video
5. Frontend sends video to backend
6. Backend processes motion + export pipeline
7. Frontend shows preview, progress, and FBX export actions

---
