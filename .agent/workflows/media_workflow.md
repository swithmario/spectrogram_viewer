---
description: Workflow for Film, Media, Immich, and Resolve automation projects
---

# Film & Media Project Workflow

Use this workflow for projects involving extensive large file management, video transcoding, Immich integrations, or DaVinci Resolve scripting.

## 1. Directory Structure Setup
Create a structure optimized for separating code from heavy assets.

1. Create the project root directory (if not exists).
2. Inside the project:
   - `scripts/`: Python automation scripts.
   - `input/` : Place for landing raw files (ensure gitignored).
   - `proxies/`: Place for generated proxies (ensure gitignored).
   - `db/`: Local database files (SQLite/JSON) for metadata.

## 2. Dependency Management
Create a `requirements.txt` aiming for Apple Silicon optimization where applicable.
- `ffmpeg-python`: For wrapping FFmpeg.
- `requests`: For Immich API.
- `numpy`: For heavy metadata processing.
- `opencv-python`: For image analysis (ensure headless if server-side).

## 3. Core Component Scaffolding

### A. Immich Wrapper / Album Project
If this is for Immich/Album organization:
1. Create `immich_client.py` stub to handle authentication and API connection.
2. Create `deduplication.py` stub for "Identify duplicates" logic (hashing/perceptual hash).
3. Create `album_manager.py` stub for efficient sorting.

### B. DaVinci Resolve Automation
If this is for Color Grading/Resolve:
1. Ensure Python 3.6/3.10 is installed (Resolve constraint dependent).
2. Create `resolve_script.py` stub importing the Resolve API (`DaVinciResolveScript` object).
3. Note: Resolve scripts usually need to run *from* the Resolve Console (or configured external env).

## 4. Mac Specific Optimizations
- Use `fdupes` or APFS cloning (`cp -c`) for creating volume-efficient generic mirrors/aliases if needed.
- Ensure FFmpeg is installed with hardware acceleration (`h264_videotoolbox` / `hevc_videotoolbox`) for transcoding tasks.

## 5. Verification
- Test script execution on a dummy folder of images/videos.
- Verify API connection to local or remote Immich instance.
