"""Scientific and HTTP contract checks for the reference viewer service."""

import base64
import json
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import numpy as np

from reference_backend import AudioClip, ReferenceServer, complex_stft, demo_clip, spectrum_payload


class TransformTests(unittest.TestCase):
    def test_frequency_amplitude_and_phase(self):
        sr, n, bin_index, phase = 48000, 2048, 32, .73
        t = np.arange(sr) / sr
        signal = .25 * np.cos(2 * np.pi * (sr * bin_index / n) * t + phase)
        z, hop = complex_stft(signal, n)
        centers = np.arange(z.shape[1]) * hop
        interior = z[:, (centers >= n // 2) & (centers + n // 2 <= len(signal))]
        self.assertTrue(np.all(np.argmax(np.abs(interior), axis=0) == bin_index))
        np.testing.assert_allclose(np.abs(interior[bin_index]), .25, atol=1e-6)
        # This bin advances by an integer number of cycles at each frame hop.
        np.testing.assert_allclose(np.angle(interior[bin_index]), phase, atol=1e-6)
        self.assertEqual(hop, n // 4)

    def test_silence_and_amplitude_scaling(self):
        silent, _ = complex_stft(np.zeros(4096), 1024)
        self.assertTrue(np.isfinite(silent).all())
        self.assertEqual(np.max(np.abs(silent)), 0)
        signal = np.random.default_rng(2).normal(size=4096)
        full, _ = complex_stft(signal, 1024)
        half, _ = complex_stft(signal * .5, 1024)
        np.testing.assert_allclose(half, full * .5, atol=1e-7)

    def test_channel_mix_and_wire_layout(self):
        x = np.sin(2 * np.pi * np.arange(4096) / 32).astype(np.float32)
        clip = AudioClip("phase test", np.stack((x, -x), axis=1), 48000)
        payload = spectrum_payload(clip, [0, 1], 1024)
        real = np.frombuffer(base64.b64decode(payload["real_b64"]), dtype="<f4").reshape(payload["shape"])
        self.assertEqual(np.max(np.abs(real)), 0)
        self.assertGreater(np.max(np.abs(complex_stft(clip.mix([0]), 1024)[0])), .9)
        with self.assertRaises(ValueError):
            clip.mix([2])

    def test_demo_is_deterministic(self):
        np.testing.assert_array_equal(demo_clip().samples, demo_clip().samples)

    def test_impulse_time(self):
        signal = np.zeros(8192)
        signal[4096] = 1
        spectrum, hop = complex_stft(signal, 1024)
        self.assertEqual(np.argmax(np.abs(spectrum).sum(axis=0)) * hop, 4096)


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ReferenceServer(("127.0.0.1", 0), {"demo": demo_clip()})
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_catalog_metadata_and_spectrum(self):
        with urlopen(self.url + "/files") as response:
            self.assertEqual(json.load(response)[0]["path"], "demo")
        with urlopen(self.url + "/spectrogram?file_path=demo&M=2048") as response:
            payload = json.load(response)
        self.assertEqual(payload["shape"][0], 1025)
        self.assertEqual(len(base64.b64decode(payload["real_b64"])), np.prod(payload["shape"]) * 4)

    def test_unknown_file_and_invalid_channels(self):
        for query, status in [("/audio-stream?file_path=/etc/passwd", 404),
                              ("/waveform?file_path=demo&channels=20", 400)]:
            with self.assertRaises(HTTPError) as error:
                urlopen(self.url + query)
            self.assertEqual(error.exception.code, status)

    def test_playback_byte_range(self):
        req = Request(self.url + "/audio-stream?file_path=demo", headers={"Range": "bytes=0-43"})
        with urlopen(req) as response:
            self.assertEqual(response.status, 206)
            data = response.read()
            self.assertEqual(len(data), 44)
            self.assertEqual(data[:4], b"RIFF")


if __name__ == "__main__":
    unittest.main()
