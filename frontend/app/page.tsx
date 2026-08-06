'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import SpectrogramViewer from '../components/SpectrogramViewer';

interface AudioFile {
  path: string;
  name: string;
  duration: number;
  sr: number;
}

export default function Home() {
  const [files, setFiles] = useState<AudioFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    // Fetch file list
    axios.get('http://localhost:8000/files')
      .then(res => setFiles(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <main className="min-h-screen bg-black text-white selection:bg-blue-500 selection:text-white">
      {!selectedFile ? (
        <div className="container mx-auto p-12">
          <h1 className="text-5xl font-black mb-12 tracking-tight">
            Project <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">Chimera</span> Viewer
          </h1>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {files.map((f) => (
              <div
                key={f.path}
                onClick={() => setSelectedFile(f.path)}
                className="group p-6 bg-gray-900 rounded-2xl hover:bg-gray-800 cursor-pointer transition-all duration-300 border border-gray-800 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-lg">
                    ♫
                  </div>
                  <h2 className="text-lg font-bold truncate group-hover:text-blue-400 transition-colors">{f.name}</h2>
                </div>
                <div className="space-y-1 text-sm text-gray-400 font-mono">
                  <p>Duration: <span className="text-gray-300">{f.duration.toFixed(1)}s</span></p>
                  <p>Sample Rate: <span className="text-gray-300">{f.sr} Hz</span></p>
                </div>
              </div>
            ))}

            {files.length === 0 && (
              <div className="col-span-3 text-center py-20 text-gray-500">
                Scanning workspace for audio files...
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="fixed inset-0 w-full h-full flex flex-col">
          <header className="absolute top-0 left-0 w-full p-4 z-50 flex items-center justify-between pointer-events-none">
            <button
              onClick={() => setSelectedFile(null)}
              className="pointer-events-auto px-5 py-2.5 bg-black/50 hover:bg-black/80 text-white rounded-lg backdrop-blur-md border border-white/10 transition flex items-center gap-2 font-medium"
            >
              <span className="text-xl">←</span> Back
            </button>
          </header>
          <SpectrogramViewer filePath={selectedFile} />
        </div>
      )}
    </main>
  );
}
