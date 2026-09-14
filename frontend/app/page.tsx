'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import SpectrogramViewer from '../components/SpectrogramViewer';
import { API_BASE } from '../lib/api';

interface AudioFile {
  path: string;
  name: string;
  duration: number;
  sr: number;
}

export default function Home() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<AudioFile | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${API_BASE}/files`, { signal: controller.signal })
      .then(response => { setFiles(response.data); setStatus('ready'); })
      .catch(() => { if (!controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [attempt]);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {!selectedFile ? (
        <div className="max-w-5xl mx-auto p-8 md:p-12">
          <h1 className="text-4xl font-bold mb-4">Spectrogram Viewer</h1>
          <p className="text-gray-300 mb-2">Explore sound in two dimensions: time and frequency.</p>
          <p className="text-gray-400 mb-10">Colour shows FFT phase. Brightness shows magnitude. Change the visible time range and the FFT window independently.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {files.map(file => (
              <button key={file.path} onClick={() => setSelectedFile(file)} className="p-6 text-left bg-gray-900 rounded-xl border border-gray-700 hover:border-cyan-400 focus-visible:outline-cyan-400">
                <h2 className="text-lg font-semibold text-cyan-300 mb-3">{file.name}</h2>
                <p className="text-sm text-gray-400">{file.duration.toFixed(1)} seconds · {(file.sr / 1000).toFixed(1)} kHz</p>
                <p className="text-sm mt-4">Open spectrogram →</p>
              </button>
            ))}
          </div>
          {status === 'loading' && <p role="status">Loading audio list…</p>}
          {status === 'error' && (
            <div role="alert" className="mt-8 p-6 rounded-xl border border-amber-900 bg-gray-900">
              <h2 className="font-semibold mb-3">The local analysis service is unavailable.</h2>
              <p className="text-gray-300 mb-4">Start the reference demo from the repository root:</p>
              <code className="block overflow-auto mb-4">python backend/reference_backend.py --demo</code>
              <button onClick={() => { setStatus('loading'); setAttempt(value => value + 1); }} className="px-4 py-2 bg-cyan-800 rounded">Retry connection</button>
            </div>
          )}
          {status === 'ready' && files.length === 0 && <p>No audio files are registered with the local service.</p>}
        </div>
      ) : (
        <div className="h-screen min-h-[800px] flex flex-col">
          <header className="flex flex-wrap items-center gap-5 px-6 py-3 border-b border-gray-800 bg-gray-950">
            <button onClick={() => setSelectedFile(null)} className="px-3 py-2 rounded bg-gray-800 hover:bg-gray-700">← Files</button>
            <div>
              <h1 className="text-sm font-semibold">Spectrogram Viewer <span className="text-gray-400 font-normal">/ {selectedFile.name}</span></h1>
              <p className="text-xs text-gray-400 mt-1">2D time–frequency view · colour = phase · brightness = magnitude</p>
            </div>
          </header>
          <div className="flex-1 min-h-0"><SpectrogramViewer key={selectedFile.path} filePath={selectedFile.path} /></div>
        </div>
      )}
    </main>
  );
}
