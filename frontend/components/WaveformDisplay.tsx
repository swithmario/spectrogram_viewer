'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { API_BASE } from '../lib/api';

interface WaveformData {
    duration: number;
    sample_rate: number;
    num_points: number;
    times: number[];
    mins: number[];
    maxs: number[];
}

interface WaveformDisplayProps {
    filePath: string;
    channels?: number[];
    currentTime?: number;
    onSeek?: (time: number) => void;
    selection?: { start: number; end: number } | null;
    onSelectionChange?: (selection: { start: number; end: number } | null) => void;
}

export default function WaveformDisplay({
    filePath,
    channels,
    currentTime = 0,
    onSeek,
    selection,
    onSelectionChange
}: WaveformDisplayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState<number | null>(null);

    // Fetch waveform data
    useEffect(() => {
        const fetchWaveform = async () => {
            try {
                const params: Record<string, unknown> = { file_path: filePath, num_points: 4000 };
                if (channels && channels.length > 0) {
                    params.channels = channels.join(',');
                }
                const response = await axios.get(`${API_BASE}/waveform`, { params });
                setWaveformData(response.data);
            } catch (e) {
                console.error('Failed to fetch waveform', e);
            }
        };
        fetchWaveform();
    }, [filePath, channels]);

    // Draw waveform
    const drawWaveform = useCallback(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !waveformData) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const width = rect.width;
        const height = rect.height;
        const midY = height / 2;

        // Clear
        ctx.fillStyle = '#0a0a0f';
        ctx.fillRect(0, 0, width, height);

        // Draw selection if exists
        if (selection) {
            const startX = (selection.start / waveformData.duration) * width;
            const endX = (selection.end / waveformData.duration) * width;
            ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
            ctx.fillRect(startX, 0, endX - startX, height);

            // Selection borders
            ctx.strokeStyle = 'rgba(34, 211, 238, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(startX, 0);
            ctx.lineTo(startX, height);
            ctx.moveTo(endX, 0);
            ctx.lineTo(endX, height);
            ctx.stroke();
        }

        // Draw waveform
        const { mins, maxs, duration } = waveformData;
        const pointsPerPixel = mins.length / width;

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#06b6d4');
        gradient.addColorStop(0.5, '#0ea5e9');
        gradient.addColorStop(1, '#06b6d4');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(0, midY);

        // Draw upper half
        for (let x = 0; x < width; x++) {
            const idx = Math.floor(x * pointsPerPixel);
            if (idx < maxs.length) {
                const y = midY - (maxs[idx] * midY * 0.9);
                ctx.lineTo(x, y);
            }
        }

        // Draw lower half (reverse)
        for (let x = width - 1; x >= 0; x--) {
            const idx = Math.floor(x * pointsPerPixel);
            if (idx < mins.length) {
                const y = midY - (mins[idx] * midY * 0.9);
                ctx.lineTo(x, y);
            }
        }

        ctx.closePath();
        ctx.fill();

        // Draw center line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(width, midY);
        ctx.stroke();

        // Draw playhead
        if (currentTime !== undefined && duration > 0) {
            const playheadX = (currentTime / duration) * width;
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(playheadX, 0);
            ctx.lineTo(playheadX, height);
            ctx.stroke();

            // Playhead head
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.moveTo(playheadX - 6, 0);
            ctx.lineTo(playheadX + 6, 0);
            ctx.lineTo(playheadX, 8);
            ctx.closePath();
            ctx.fill();
        }
    }, [waveformData, currentTime, selection]);

    // Redraw on data/time change
    useEffect(() => {
        drawWaveform();
    }, [drawWaveform]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => drawWaveform();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [drawWaveform]);

    // Mouse handlers for seeking and selection
    const getTimeFromX = (clientX: number): number => {
        const canvas = canvasRef.current;
        if (!canvas || !waveformData) return 0;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const ratio = Math.max(0, Math.min(1, x / rect.width));
        return ratio * waveformData.duration;
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.shiftKey && onSelectionChange) {
            // Start selection
            setIsDragging(true);
            setDragStart(getTimeFromX(e.clientX));
        } else if (onSeek) {
            // Seek
            onSeek(getTimeFromX(e.clientX));
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging && dragStart !== null && onSelectionChange) {
            const currentDragTime = getTimeFromX(e.clientX);
            onSelectionChange({
                start: Math.min(dragStart, currentDragTime),
                end: Math.max(dragStart, currentDragTime)
            });
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragStart(null);
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full h-24 bg-gray-900 rounded-lg overflow-hidden cursor-crosshair"
        >
            <canvas
                ref={canvasRef}
                className="w-full h-full"
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
            {/* Time labels */}
            {waveformData && (
                <div className="absolute bottom-1 left-0 right-0 flex justify-between px-2 text-xs text-gray-500 font-mono pointer-events-none">
                    <span>0:00</span>
                    <span>{formatTime(waveformData.duration / 2)}</span>
                    <span>{formatTime(waveformData.duration)}</span>
                </div>
            )}
            {/* Instructions */}
            <div className="absolute top-1 right-2 text-[10px] text-gray-600">
                Click to seek • Shift+drag to select
            </div>
        </div>
    );
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}
