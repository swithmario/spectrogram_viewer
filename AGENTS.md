# Spectrogram Viewer

## Purpose and current state

This public repository displays a 2D complex spectrogram. Time runs horizontally.
Frequency runs vertically. FFT phase controls RGB hue. Magnitude controls brightness.
The frontend and short-clip reference service run locally. The original long-audio
backend is absent. Do not claim source separation or Laplacian reconstruction.

## Structure and architecture

- `frontend/app/page.tsx`: file list and visible service errors.
- `frontend/components/SpectrogramViewer.tsx`: WebGL shader, textures, axes, and controls.
- `frontend/components/window_controls.tsx`: explicit visible time range.
- `frontend/components/AudioPlayer.tsx` and `WaveformDisplay.tsx`: playback and waveform.
- `frontend/lib/api.ts`: configurable service address.
- `backend/reference_backend.py`: deterministic demo, local input registration, STFT, and HTTP service.
- `backend/test_reference_backend.py`: numerical and HTTP contract tests.
- `docs/`: screenshots from the running application and verification notes.

The backend sends frequency-by-time complex arrays as little-endian Float32.
The STFT uses a centered periodic Hann window and 75% overlap. Interior bins use
one-sided peak-amplitude scaling. DC and Nyquist do not receive the factor of two.
`time_step` and texture dimensions locate exact frame/bin centers in the shader.
Phase is relative to each frame. Selected channels are averaged before analysis
and playback. Preserve that shared source contract.

## Build, run, and test

Use Python 3.10+ and Node.js 20.9+.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt
.venv/bin/python backend/reference_backend.py --demo
# Second terminal:
cd frontend
npm ci
npm run dev -- --hostname 127.0.0.1
# Validation:
npm run lint
npm run build
# From the repository root:
.venv/bin/python -m unittest discover -s backend -v
```

Use `--audio-file PATH` for an explicit local input. The service binds to loopback.
Set `NEXT_PUBLIC_ANALYSIS_URL` before frontend start/build to change the service URL.

## Dependencies and vendors

Next.js, React, Three.js, React Three Fiber, Drei, Axios, NumPy, and SoundFile are
external dependencies. JavaScript versions are locked in `frontend/package-lock.json`.
There is no vendored source. Read `backend/requirements.txt` for Python requirements.

## Public boundary and constraints

- Keep this repository public. Do not import private source, recordings, caches, or datasets.
- Application screenshots must come from the running viewer. Retain the command and input provenance.
- The approved `docs/historical_multi_window_spectrogram.png` is a separate retained magnitude plot. Its source recording is unknown. Do not relabel it as a phase-colour application screenshot or a new execution.
- The built-in synthesized reference phrase is permitted for public examples.
- Keep environments and generated audio outside Git.
- Keep canonical source in the registered repository. SSD worktrees are temporary development locations.
- Use lowercase snake_case for new first-party files. Use DDMMMYYYY for dated reports.
- Note the Mac Mini M4 in commits made on that machine.
- macOS SSD sidecars (`._*`) must stay out of Git, TypeScript, and lint inputs.

## Limits and next work

The reference service accepts clips up to 60 seconds, 24 million channel samples,
8 million complex bins, and 8192 texels per axis. The full transform is transferred
for each FFT/channel change. There is no original long-recording cache or tiling.
Frequency navigation still uses linear frequency deltas when panning a logarithmic
view. Browser playback uses a mono mix. These are prototype limitations.

Next work: recover the original backend with verified provenance, or design bounded
time-frequency tile loading. Add independent numerical reference comparisons before
extending scientific claims. Review any private-to-public extraction separately.

`docs/multi_resolution_research.md` is the public research summary and historical
figure. The detailed experiment plan remains FS035 in private `future_scope_ideas`.
Recognition and waveform reconstruction have separate acceptance criteria.

## Documentation and Git identity

Use first person for personal decisions and experience in README prose. Use
direct technical language for software behaviour and instructions. Do not
describe the maintainer as "the owner". Preserve quoted source wording and
technical ownership terms.

Local commits must use `swithmario` and
`28229111+swithmario@users.noreply.github.com`. Verify both author and committer
before pushing. Histories were corrected on 15SEP2026; compare an older checkout
with the corrected remote before merging or pushing it. Record Mac Mini M4 in
commits made on this machine.
