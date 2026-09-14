"""Local reference service for the public spectrogram viewer.

Run from the repository root: python backend/reference_backend.py --demo
Only the demo and files supplied with --audio-file are served.
"""

import argparse
import base64
import io
import json
import math
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import soundfile as sf

FFT_SIZES = (512, 1024, 2048, 4096, 8192)
MAX_TEXTURE_SIZE = 8192
MAX_CELLS = 8_000_000


@dataclass
class AudioClip:
    name: str
    samples: np.ndarray  # samples x channels, full scale = 1
    sample_rate: int

    @property
    def duration(self):
        return len(self.samples) / self.sample_rate

    def mix(self, channels):
        if not channels or any(i < 0 or i >= self.samples.shape[1] for i in channels):
            raise ValueError("Select at least one valid channel.")
        return self.samples[:, channels].mean(axis=1)


def demo_clip():
    """Synthesize a repeatable 12 s musical phrase; no recording is used."""
    sr = 48000
    samples = np.zeros((12 * sr, 2), dtype=np.float64)
    rng = np.random.default_rng(15)
    chords = ((130.81, 164.81, 196.00), (110.00, 130.81, 164.81),
              (87.31, 110.00, 130.81), (98.00, 123.47, 146.83))
    for bar, chord in enumerate(chords):
        for note, fundamental in enumerate(chord):
            start = int((bar * 3 + note * 0.18 + 0.08) * sr)
            count = min(int(2.75 * sr), len(samples) - start)
            t = np.arange(count) / sr
            envelope = (1 - np.exp(-t * 80)) * np.exp(-t * 1.25)
            tone = sum(np.sin(2 * np.pi * fundamental * h * t + h * 0.27)
                       / h ** 1.35 for h in range(1, 28))
            pan = note / 2
            samples[start:start + count] += (tone * envelope)[:, None] * np.array([1 - .45 * pan, .55 + .45 * pan]) * .19
        for beat in range(6):
            start = int((bar * 3 + beat * .5) * sr)
            count = min(int(.22 * sr), len(samples) - start)
            t = np.arange(count) / sr
            hit = rng.normal(size=count) * np.exp(-t * 65) * .045
            if beat % 2 == 0:
                hit += np.sin(2 * np.pi * (52 * t + 1.8 * (1 - np.exp(-t * 45)))) * np.exp(-t * 23) * .28
            samples[start:start + count] += hit[:, None]
    samples *= .85 / np.max(np.abs(samples))
    return AudioClip("Reference phrase · chords, plucks and percussion", samples.astype(np.float32), sr)


def complex_stft(signal, n_fft):
    """Centered periodic-Hann STFT, 75% overlap, one-sided peak amplitude.

    The first frame is centered at sample zero. Interior FFT bins are doubled.
    DC and Nyquist are not doubled. A bin-centered, unit-amplitude cosine has
    magnitude one away from the padded edges. Phase is relative to each frame.
    """
    if n_fft not in FFT_SIZES:
        raise ValueError("Unsupported FFT window size.")
    hop = n_fft // 4
    count = (len(signal) + hop - 1) // hop + 1
    bins = n_fft // 2 + 1
    if count > MAX_TEXTURE_SIZE or count * bins > MAX_CELLS:
        raise ValueError("This view exceeds the reference service texture limit. Use a shorter clip or a larger FFT window.")
    padding = count * hop - len(signal) + n_fft // 2
    padded = np.pad(signal, (n_fft // 2, padding))
    window = .5 - .5 * np.cos(2 * np.pi * np.arange(n_fft) / n_fft)
    frames = np.lib.stride_tricks.sliding_window_view(padded, n_fft)[::hop][:count]
    spectrum = np.empty((bins, count), dtype=np.complex64)
    for start in range(0, count, 128):
        block = np.fft.rfft(frames[start:start + 128] * window, axis=1) / window.sum()
        block[:, 1:-1] *= 2
        spectrum[:, start:start + len(block)] = block.T
    return spectrum, hop


def spectrum_payload(clip, channels, n_fft):
    spectrum, hop = complex_stft(clip.mix(channels), n_fft)
    encode = lambda x: base64.b64encode(np.asarray(x, dtype="<f4").tobytes(order="C")).decode("ascii")
    return {"real_b64": encode(spectrum.real), "imag_b64": encode(spectrum.imag),
            "shape": list(spectrum.shape), "time_step": hop / clip.sample_rate,
            "time_start": 0, "frequency_step": clip.sample_rate / n_fft,
            "duration": clip.duration, "sample_rate": clip.sample_rate}


def waveform_payload(clip, channels):
    signal = clip.mix(channels)
    hop = max(1, math.ceil(len(signal) / 1600))
    starts = np.arange(0, len(signal), hop)
    return {"times": (starts / clip.sample_rate).tolist(),
            "mins": np.minimum.reduceat(signal, starts).tolist(),
            "maxs": np.maximum.reduceat(signal, starts).tolist(),
            "duration": clip.duration}


def wav_bytes(clip, channels):
    output = io.BytesIO()
    # Playback and analysis use the same arithmetic channel mix.
    sf.write(output, clip.mix(channels), clip.sample_rate, format="WAV", subtype="PCM_16")
    return output.getvalue()


class ReferenceServer(ThreadingHTTPServer):
    def __init__(self, address, clips):
        self.clips = clips
        super().__init__(address, ReferenceHandler)


class ReferenceHandler(BaseHTTPRequestHandler):
    def respond(self, data, status=200, content_type="application/json", extra=None):
        body = data if isinstance(data, bytes) else json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin", "")
        parsed = urlparse(origin)
        if parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        try:
            if parsed.path == "/files":
                return self.respond([{"path": key, "name": clip.name, "duration": clip.duration, "sr": clip.sample_rate}
                                     for key, clip in self.server.clips.items()])
            clip = self.server.clips.get(params.get("file_path", [""])[0])
            if clip is None:
                return self.respond({"error": "File not registered. Pass it to --audio-file when starting the service."}, 404)
            count = clip.samples.shape[1]
            channel_arg = params.get("channels", [""])[0]
            channels = sorted(set(map(int, channel_arg.split(",")))) if channel_arg else list(range(count))
            clip.mix(channels)  # Validate before any endpoint uses the selection.
            if parsed.path == "/audio-info":
                labels = ["Left", "Right"] if count == 2 else [f"Channel {i + 1}" for i in range(count)]
                return self.respond({"sample_rate": clip.sample_rate, "channels": {
                    "count": count, "labels": labels, "format": "PCM", "subtype": "FLOAT"}})
            if parsed.path == "/pyramid-info":
                return self.respond({"duration": clip.duration, "level_info": [
                    {"M": n, "T_samples": n, "T_seconds": n / clip.sample_rate,
                     "n_freq_bins": n // 2 + 1, "description": "Periodic Hann STFT"} for n in FFT_SIZES]})
            if parsed.path == "/spectrogram":
                start = float(params.get("t_start", ["0"])[0])
                end = float(params.get("t_end", [str(clip.duration)])[0])
                if start != 0 or not math.isclose(end, clip.duration):
                    raise ValueError("The reference service supplies the full clip. The viewer selects the visible time window.")
                return self.respond(spectrum_payload(clip, channels, int(params.get("M", ["2048"])[0])))
            if parsed.path == "/waveform":
                return self.respond(waveform_payload(clip, channels))
            if parsed.path == "/audio-stream":
                data = wav_bytes(clip, channels)
                headers = {"Accept-Ranges": "bytes"}
                range_header = self.headers.get("Range")
                if range_header:
                    import re
                    match = re.fullmatch(r"bytes=(\d*)-(\d*)", range_header)
                    if not match or not any(match.groups()):
                        return self.respond(b"", 416, extra={"Content-Range": f"bytes */{len(data)}"})
                    first, last = match.groups()
                    start = int(first) if first else max(0, len(data) - int(last))
                    end = min(int(last), len(data) - 1) if first and last else len(data) - 1
                    if start > end or start >= len(data):
                        return self.respond(b"", 416, extra={"Content-Range": f"bytes */{len(data)}"})
                    headers["Content-Range"] = f"bytes {start}-{end}/{len(data)}"
                    return self.respond(data[start:end + 1], 206, "audio/wav", headers)
                return self.respond(data, content_type="audio/wav", extra=headers)
            self.respond({"error": "Unknown endpoint."}, 404)
        except (ValueError, OverflowError) as error:
            self.respond({"error": str(error)}, 400)
        except (BrokenPipeError, ConnectionResetError):
            pass  # A cancelled browser request must not stop the local service.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="Include the built-in reference phrase.")
    parser.add_argument("--audio-file", type=Path, action="append", default=[], help="Explicit local audio input, at most 60 seconds per clip.")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    clips = {"reference_phrase": demo_clip()} if args.demo else {}
    for i, path in enumerate(args.audio_file):
        info = sf.info(path)
        if info.duration > 60 or info.frames * info.channels > 24_000_000 or info.frames == 0:
            parser.error(f"{path.name}: supply a nonempty clip of at most 60 seconds and 24 million channel samples.")
        samples, sr = sf.read(path, dtype="float32", always_2d=True)
        if not np.isfinite(samples).all():
            parser.error(f"{path.name}: the input contains non-finite samples.")
        clips[f"local_{i}"] = AudioClip(path.name, samples, sr)
    if not clips:
        parser.error("Select --demo or supply --audio-file.")
    server = ReferenceServer(("127.0.0.1", args.port), clips)
    print(f"Reference service: http://127.0.0.1:{args.port} ({len(clips)} clips)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
