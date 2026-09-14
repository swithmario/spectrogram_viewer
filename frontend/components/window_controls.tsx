'use client';

import { useState } from 'react';

export default function WindowControls({ start, end, duration, onApply }: {
  start: number; end: number; duration: number;
  onApply: (window: { start: number; end: number }) => void;
}) {
  const [error, setError] = useState('');
  return (
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const first = Number(data.get('start'));
      const last = Number(data.get('end'));
      if (!Number.isFinite(first) || !Number.isFinite(last) || first < 0 || last > duration || last - first < .01) {
        setError('Choose a range of at least 0.01 seconds inside the clip.');
        return;
      }
      setError('');
      onApply({ start: first, end: last });
    }}>
      <label className="text-xs text-gray-400">Time start (s)
        <input name="start" type="number" required step="0.001" min="0" max={duration} defaultValue={Math.max(0, start).toFixed(3)} className="block mt-1 w-24 bg-gray-950 border border-gray-600 rounded px-2 py-1 text-white" />
      </label>
      <label className="text-xs text-gray-400">Time end (s)
        <input name="end" type="number" required step="0.001" min="0" max={duration} defaultValue={Math.min(duration, end).toFixed(3)} className="block mt-1 w-24 bg-gray-950 border border-gray-600 rounded px-2 py-1 text-white" />
      </label>
      <button className="px-3 py-1.5 bg-cyan-900 text-cyan-100 rounded text-xs" disabled={duration <= 0}>Apply time window</button>
      {error && <p role="alert" className="text-xs text-amber-300">{error}</p>}
    </form>
  );
}
