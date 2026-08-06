# Audio/Spectrogram Analysis Tool

<!-- repository-status:start -->
## Repository status

This repository is private.

- The current state is **partial application**.
- The repository contains a Next.js spectrogram and waveform interface.
- The frontend passed a production build in the previous audit.
- The README previously described a FastAPI backend, but the backend source is not in this repository.
- Publication decision: **Add the backend or document the repository as a frontend before publication.**
<!-- repository-status:end -->


A full-stack application for visualizing and analyzing audio files, featuring a Laplacian Pyramid-based spectrogram viewer.

## Quick Start

The easiest way to run the application is using the provided helper script:

```bash
./run.sh
```

This will start both the Python backend (FastAPI) and the Next.js frontend.
- Frontend: [http://localhost:3000](http://localhost:3000)
- Backend: [http://localhost:8000](http://localhost:8000)

## Manual Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- `ffmpeg` (recommended for audio processing libraries)

### Backend

1. Activate virtual environment:
   ```bash
   source .venv/bin/activate
   ```
2. Run the server:
   ```bash
   uvicorn backend.main:app --reload
   ```

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies (if needed):
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## Repository boundary

The repository contains the backend and frontend source. Audio files, spectral
caches, Python environments, Node dependencies, Next.js builds, and generated
output remain local.
