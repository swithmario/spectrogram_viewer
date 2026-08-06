'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface AudioPlayerProps {
    filePath: string;
    channels?: number[];
    onTimeUpdate?: (time: number) => void;
    onDurationChange?: (duration: number) => void;
    selection?: { start: number; end: number } | null;
    isLooping?: boolean;
    externalDuration?: number;
}

export default function AudioPlayer({
    filePath,
    channels,
    onTimeUpdate,
    onDurationChange,
    selection,
    isLooping = false,
    externalDuration
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(0.8);

    // Sync external duration if internal is missing
    useEffect(() => {
        if (externalDuration && externalDuration > 0 && (duration === 0 || !Number.isFinite(duration))) {
            setDuration(externalDuration);
        }
    }, [externalDuration, duration]);

    // Create audio URL from file path, including channel selection if provided
    const audioUrl = channels && channels.length > 0
        ? `http://localhost:8000/audio-stream?file_path=${encodeURIComponent(filePath)}&channels=${channels.join(',')}`
        : `http://localhost:8000/audio-stream?file_path=${encodeURIComponent(filePath)}`;

    // Handle time update
    const handleTimeUpdate = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const time = audio.currentTime;
        setCurrentTime(time);
        onTimeUpdate?.(time);

        // Handle loop region
        if (isLooping && selection) {
            if (time >= selection.end) {
                audio.currentTime = selection.start;
            }
        }
    }, [onTimeUpdate, isLooping, selection]);

    // Handle duration loaded
    const handleDurationChange = useCallback(() => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(audio.duration)) return;
        setDuration(audio.duration);
        onDurationChange?.(audio.duration);
    }, [onDurationChange]);

    // Sync volume
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    // Play/Pause
    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio) return;

        if (isPlaying) {
            audio.pause();
        } else {
            // If looping and we have a selection, start from selection start
            if (isLooping && selection && (audio.currentTime < selection.start || audio.currentTime >= selection.end)) {
                audio.currentTime = selection.start;
            }
            audio.play().catch(e => console.debug("Play interrupted", e));
        }
        setIsPlaying(!isPlaying);
    };

    // Seek to position
    const seekTo = (time: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.currentTime = time;
        setCurrentTime(time);
    };

    // Expose seekTo and getCurrentTime for parent/siblings
    useEffect(() => {
        // @ts-expect-error - Adding method to window for parent access
        window.audioPlayerSeek = seekTo;
        // @ts-expect-error - Adding method to window for high-freq polling
        window.audioPlayerGetCurrentTime = () => audioRef.current?.currentTime || 0;
    }, []);

    const formatTime = (seconds: number) => {
        if (!Number.isFinite(seconds) || isNaN(seconds)) return "0:00";
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-4 bg-gray-800/50 p-3 rounded-lg">
            {/* Play/Pause Button */}
            <button
                onClick={togglePlay}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-cyan-600 hover:bg-cyan-500 transition-colors"
            >
                {isPlaying ? (
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" />
                        <rect x="14" y="4" width="4" height="16" />
                    </svg>
                ) : (
                    <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                        <polygon points="5,3 19,12 5,21" />
                    </svg>
                )}
            </button>

            {/* Time Display */}
            <div className="font-mono text-sm text-gray-300 min-w-[100px]">
                {formatTime(currentTime)} / {formatTime(duration)}
            </div>

            {/* Progress Bar */}
            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    seekTo(ratio * duration);
                }}
            >
                <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-100"
                    style={{ width: `${(currentTime / duration) * 100}%` }}
                />
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
                <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
            </div>

            {/* Loop Indicator */}
            {isLooping && selection && (
                <div className="px-2 py-1 bg-amber-600/30 text-amber-400 text-xs rounded font-mono">
                    🔁 {formatTime(selection.start)} → {formatTime(selection.end)}
                </div>
            )}

            {/* Hidden Audio Element - key forces remount when channels change */}
            <audio
                key={audioUrl}
                ref={audioRef}
                src={audioUrl}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleDurationChange}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
            />
        </div>
    );
}
