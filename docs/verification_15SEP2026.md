# Viewer verification — 15SEP2026

## What the images show

Both PNG files are browser screenshots of this application. They show an actual
complex STFT of the built-in reference phrase. No image-generation model, image
compositing, private recording, or temporary spectral fixture was used.

The waveform is synthesized by `demo_clip()` in `backend/reference_backend.py`.
It contains four three-note chords, staggered plucked attacks, and percussion.
The noise generator uses seed 15. The same samples supply the spectrogram,
waveform envelope, and audio stream.

## Capture parameters

| Parameter | Value |
| --- | --- |
| Input | `reference_phrase` |
| Input duration | 12 seconds |
| Sample rate | 48,000 Hz |
| Channel selection | Left and right, arithmetic mono mix |
| FFT window | 2048 samples, 42.67 ms |
| Window function | Periodic Hann |
| Hop | 512 samples, 10.67 ms |
| Frequency axis | Logarithmic, 20–24,000 Hz |
| Gamma / brightness | 1 / 1 |
| Magnitude floor | −80 dB |
| Overview time range | 0–12 seconds |
| Detail time range | 3–6 seconds |
| Browser viewport | 1600 × 1050 |

Start both services using the README commands. Open the reference phrase. The
default view reproduces the overview settings. Set Time start to 3 and Time end
to 6, then select Apply time window to reproduce the detail view.

## Verification results

- `python -m unittest discover -s backend -v`: 8 tests passed.
- `npm run lint`: passed with no warnings or errors.
- `npm run build`: passed, including TypeScript compilation.
- Browser rendered a nonempty 2D spectrogram with no unexpected console errors.
- Selecting 3–6 seconds changed the displayed spectrum and its time-axis labels.
- Selecting a 4096-sample FFT preserved the 3–6 second visible time range.
- Playback reached 12 seconds and the audio element reported normal completion.
- Blocking the file-list request displayed the service-unavailable message.
- Removing that block and selecting Retry connection restored the audio list.

The Python environment used Python 3.13.3, NumPy 2.5.3, and SoundFile 0.13.1.
The frontend used its committed lockfile and Next.js 16.1.4. The capture used
agent-browser 0.37.1 on the Mac Mini M4. Build output included a Node.js
`module.register()` deprecation notice; compilation completed successfully.

## Scientific checks and limits

The tests use analytically defined tones, silence, an impulse, and opposite-phase
stereo channels. They check frequency location, amplitude, phase, linear amplitude
scaling, impulse timing, channel cancellation, and transport layout.

This verification establishes a working short-clip viewer and reference STFT
service. It does not establish source-separation quality, inverse reconstruction,
Laplacian residual reconstruction, performance on long recordings, or equivalence
to the original absent analysis backend.
