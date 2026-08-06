'use client';

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useThree, useFrame, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import axios from 'axios';
import { OrthographicCamera } from '@react-three/drei';
import WaveformDisplay from './WaveformDisplay';
import AudioPlayer from './AudioPlayer';

// Vertex Shader: Standard Quad
const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment Shader: Complex -> HSV with dB scaling and gamma control
const fragmentShader = `
uniform sampler2D uReal;
uniform sampler2D uImag;
uniform float uBrightness;
uniform float uGamma;
uniform float uDbFloor;  // Adjustable dB floor for dynamic range
uniform float uOffset;
uniform float uScale;
uniform float uFreqOffset;
uniform float uFreqScale;
uniform float uLogScale; // 0.0 = Linear, 1.0 = Log
varying vec2 vUv;

// HSV to RGB helper
vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    // Map UV x-coordinate (Time)
    float u = uOffset + vUv.x * uScale;
    
    // Map UV y-coordinate (Frequency)
    float v = 0.0;
    
    if (uLogScale > 0.5) {
        // Logarithmic Mapping
        float fStartNorm = uFreqOffset;
        float fEndNorm = uFreqOffset + uFreqScale;
        
        // Safe minimum to avoid log(0) - 20Hz / 22050Hz
        float minSafe = 20.0 / 22050.0; 
        
        float fStart = max(fStartNorm, minSafe);
        float fEnd = max(fEndNorm, minSafe);
        
        // F(y) = Start * (End / Start)^y
        float ratio = fEnd / fStart;
        v = fStart * pow(ratio, vUv.y);
    } else {
        // Linear Mapping
        v = uFreqOffset + vUv.y * uFreqScale;
    }

    // Bounds check
    if (u < 0.0 || u > 1.0 || v < 0.0 || v > 1.0) {
        gl_FragColor = vec4(0.012, 0.012, 0.02, 1.0); // Match background #030308
        return;
    }

    vec2 uv = vec2(u, v);
    
    // Nearest neighbor sampling is enforced by texture filter
    vec4 valReal = texture2D(uReal, uv);
    vec4 valImag = texture2D(uImag, uv);
    
    float real = valReal.r;
    float imag = valImag.r;
    
    // Magnitude and Phase
    float mag = sqrt(real * real + imag * imag);
    float phase = atan(imag, real);
    
    // Phase -> Hue
    float hue = (phase + 3.14159265) / (2.0 * 3.14159265);
    float sat = 0.85;
    
    // dB scaling for visibility
    float eps = 1e-10;
    float db = 20.0 * log(mag + eps) / log(10.0);
    float db_min = uDbFloor;  // Use adjustable floor
    float db_max = 0.0;       // 0 dB = max
    float val = clamp((db - db_min) / (db_max - db_min), 0.0, 1.0);
    
    // Apply gamma correction for intensity control
    val = pow(val, 1.0 / uGamma);
    
    // Apply brightness boost
    val = val * uBrightness;
    val = clamp(val, 0.0, 1.0);
    
    gl_FragColor = vec4(hsv2rgb(vec3(hue, sat, val)), 1.0);
}
`;

interface PyramidLevel {
    M: number;
    T_samples: number;
    T_seconds: number;
    n_freq_bins: number;
    description: string;
}

interface ChannelInfo {
    count: number;
    labels: string[];
    format: string;
    subtype: string;
    sample_rate?: number;
}

interface ViewerProps {
    filePath: string;
    M: number;
    timeStart: number; // View window start
    timeEnd: number;   // View window end
    duration: number;  // Full file duration
    freqStart: number; // Freq window start (Hz)
    freqEnd: number;   // Freq window end (Hz)
    maxFreq: number;   // Nyquist (half sample rate)
    locked: boolean;   // Whether view is locked to playhead
    gamma?: number;
    brightness?: number;
    dbFloor?: number;  // dB floor for dynamic range (-120 to -20)
    channels?: number[];  // Selected channel indices
    logScale?: boolean;
}

// Lifted loading state to parent
// Lifted loading state to parent

const SpectrogramPlane = ({ filePath, M, timeStart, timeEnd, duration, freqStart, freqEnd, maxFreq, locked, gamma = 1.0, brightness = 1.0, dbFloor = -80, channels, setLoading, logScale = false, currentTime }: ViewerProps & { setLoading: (l: boolean) => void, currentTime: number }) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.ShaderMaterial>(null);
    const { viewport } = useThree();

    // Data State
    const [textures, setTextures] = useState<{ real: THREE.Texture, imag: THREE.Texture } | null>(null);

    // Fetch Pyramid Data
    useEffect(() => {
        if (duration <= 0) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch FULL duration (0 to duration)
                // Add timestamp to force browser to ignore cache
                const params: Record<string, unknown> = {
                    file_path: filePath,
                    M,
                    t_start: 0,
                    t_end: duration,
                    _t: Date.now()
                };
                if (channels && channels.length > 0) {
                    params.channels = channels.join(',');
                }
                const response = await axios.get(`http://localhost:8000/spectrogram`, { params });

                const data = response.data;
                const width = data.shape[1];  // Time
                const height = data.shape[0]; // Freq

                // Decode Base64 to Float32Array
                const b64ToFloat32 = (b64: string) => {
                    const binary_string = window.atob(b64);
                    const len = binary_string.length;
                    const bytes = new Uint8Array(len);
                    for (let i = 0; i < len; i++) {
                        bytes[i] = binary_string.charCodeAt(i);
                    }
                    return new Float32Array(bytes.buffer);
                };

                const realData = b64ToFloat32(data.real_b64);
                const imagData = b64ToFloat32(data.imag_b64);

                // Create Textures with NEAREST filtering to prevent interpolation artifacts
                const realTex = new THREE.DataTexture(realData, width, height, THREE.RedFormat, THREE.FloatType);
                realTex.needsUpdate = true;
                realTex.magFilter = THREE.NearestFilter;
                realTex.minFilter = THREE.NearestFilter;

                const imagTex = new THREE.DataTexture(imagData, width, height, THREE.RedFormat, THREE.FloatType);
                imagTex.needsUpdate = true;
                imagTex.magFilter = THREE.NearestFilter;
                imagTex.minFilter = THREE.NearestFilter;

                setTextures({ real: realTex, imag: imagTex });

            } catch (e) {
                console.error("Fetch error", e);
            }
            setLoading(false);
        };

        fetchData();
    }, [filePath, M, channels, duration]);

    const uniforms = useMemo(() => ({
        uReal: { value: null },
        uImag: { value: null },
        uBrightness: { value: 1.0 },
        uGamma: { value: 1.0 },
        uDbFloor: { value: -80.0 },
        uOffset: { value: 0.0 },
        uScale: { value: 1.0 },
        uFreqOffset: { value: 0.0 },
        uFreqScale: { value: 1.0 },
        uLogScale: { value: 0.0 }
    }), []);

    // Update uniforms every frame/render
    useFrame(() => {
        if (materialRef.current && duration > 0 && maxFreq > 0) {
            // 1. Update Textures & Settings (Moved from useEffect for simplicity/robustness)
            if (textures) {
                materialRef.current.uniforms.uReal.value = textures.real;
                materialRef.current.uniforms.uImag.value = textures.imag;
            }
            materialRef.current.uniforms.uGamma.value = gamma;
            materialRef.current.uniforms.uBrightness.value = brightness;
            materialRef.current.uniforms.uDbFloor.value = dbFloor;
            materialRef.current.uniforms.uLogScale.value = logScale ? 1.0 : 0.0;

            let currentT = timeStart;

            // SMOOTH SYNC: Only use audio sync if LOCKED
            if (locked) {
                // Poll global time for 60fps smoothness, fallback to prop
                // @ts-expect-error - Custom global method
                const exactTime = window.audioPlayerGetCurrentTime?.() ?? currentTime;

                const windowSize = timeEnd - timeStart;
                currentT = exactTime - windowSize / 2;
            }
            // ELSE: Use 'timeStart' from props (Static in Free Mode)

            // Calculate UV offset and scale for Time
            const offset = currentT / duration;
            const scale = (timeEnd - timeStart) / duration;

            // Calculate UV offset and scale for Freq
            // Texture Y=0 is 0Hz. Y=1 is MaxFreq.
            const freqOffset = freqStart / maxFreq;
            const freqScale = (freqEnd - freqStart) / maxFreq;

            materialRef.current.uniforms.uOffset.value = offset;
            materialRef.current.uniforms.uScale.value = scale;
            materialRef.current.uniforms.uFreqOffset.value = freqOffset;
            materialRef.current.uniforms.uFreqScale.value = freqScale;
        }
    });

    // Remove the old useEffect for uniforms
    // ...

    // SCALE TO VIEWPORT: Ensure plane always fills the screen
    return (
        <mesh ref={meshRef} position={[0, 0, 0]} scale={[viewport.width, viewport.height, 1]}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={uniforms}
                transparent={true}
            />
        </mesh>
    );
};


const InteractionLayer = ({
    timeWindow,
    setTimeWindow,
    freqWindow,
    setFreqWindow,
    duration,
    maxFreq,
    setPlayheadLock,
    zoomLock,
    scrubMode,
    currentTime,
    onSeek,
    logScale
}: {
    timeWindow: { start: number, end: number },
    setTimeWindow: (w: { start: number, end: number }) => void,
    freqWindow: { min: number, max: number },
    setFreqWindow: (w: { min: number, max: number }) => void,
    duration: number,
    maxFreq: number,
    setPlayheadLock: (l: boolean) => void,
    zoomLock: boolean,
    scrubMode: boolean,
    currentTime: number,
    onSeek: (t: number) => void,
    logScale: boolean
}) => {
    const { viewport, size, gl } = useThree();
    const isDragging = useRef(false);
    const lastX = useRef(0);
    const lastY = useRef(0);

    // Update cursor based on Alt Key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.altKey) gl.domElement.style.cursor = 'grab';
        };
        const handleKeyUp = () => {
            gl.domElement.style.cursor = 'default';
            isDragging.current = false; // Stop dragging if key released
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [gl]);

    const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
        // SCRUB MODE (Primary Override)
        if (scrubMode) {
            isDragging.current = true;
            lastX.current = e.clientX; // Capture start position
            gl.domElement.style.cursor = 'grabbing';

            // "Tape Style" Scrubbing:
            // We lock the playhead to the center (or current relative pos)
            // and move the audio underneath it.
            setPlayheadLock(true);

            e.stopPropagation();
            return;
        }

        if (!e.altKey) return; // Require Modifier

        isDragging.current = true;
        lastX.current = e.clientX;
        lastY.current = e.clientY;
        gl.domElement.style.cursor = 'grabbing';
        setPlayheadLock(false); // Unlock on interaction
        e.stopPropagation(); // Prevent default text selection etc
    };

    const onPointerUp = () => {
        isDragging.current = false;
        gl.domElement.style.cursor = 'grab';
        // If we were scrubbing, we might want to release lock?
        // User probably wants to stay locked if they were cleaning.
        // Let's leave it as is.
    };

    const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
        if (isDragging.current) {
            // SCRUB MODE
            if (scrubMode) {
                const deltaPxX = e.clientX - lastX.current;
                lastX.current = e.clientX;

                // Calculate time delta based on screen pixels
                const timeWindowSize = timeWindow.end - timeWindow.start;
                // Drag Right (+X) -> Palls Audio Right -> Moves BACK in time (-Time)
                const dt = (deltaPxX / size.width) * timeWindowSize;

                // Apply inverted delta to current time
                const newTime = currentTime - dt;
                const clampedTime = Math.max(0, Math.min(duration, newTime));

                onSeek(clampedTime);
                return;
            }

            // Safety check: if Alt released but no keyup event (e.g. out of focus), stop
            if (!e.altKey) {
                isDragging.current = false;
                gl.domElement.style.cursor = 'default';
                return;
            }

            const deltaPxX = e.clientX - lastX.current;
            const deltaPxY = e.clientY - lastY.current;
            lastX.current = e.clientX;
            lastY.current = e.clientY;

            // X-Axis Pan (Time)
            const timeWindowSize = timeWindow.end - timeWindow.start;
            // Drag Right (+X) -> Move Window Left (-Time)
            const dt = -(deltaPxX / size.width) * timeWindowSize;

            // Y-Axis Pan (Freq)
            const freqWindowSize = freqWindow.max - freqWindow.min;
            // Drag Down (+Y) -> Shift Window Up (+Freq)
            const df = (deltaPxY / size.height) * freqWindowSize;

            setTimeWindow({
                start: timeWindow.start + dt,
                end: timeWindow.end + dt
            });

            const targetMin = freqWindow.min + df;
            const targetMax = freqWindow.max + df;

            setFreqWindow({
                min: targetMin, // Allow overscroll for feel, or clamp? Let's use computed values
                max: targetMax
            });
        }
    };

    const onWheel = (e: ThreeEvent<WheelEvent>) => {
        // SCRUB MODE (Primary Override)
        if (scrubMode) {
            const wheelEvent = e.nativeEvent;
            // Scroll Down (+Y) -> Forward (+Time)
            // Scroll Up (-Y) -> Backward (-Time)

            // Sensitivity: Move by 10% of view per scroll unit?
            // deltaY is usually around 100 for a tick.
            // Let's use small factor for smooth scrubbing.
            // 0.001 * 100 = 0.1 * viewWidth.
            const viewDuration = timeWindow.end - timeWindow.start;
            const dt = (wheelEvent.deltaY * 0.0005) * viewDuration;

            let newTime = currentTime + dt;
            newTime = Math.max(0, Math.min(duration, newTime));

            onSeek(newTime);
            return;
        }


        // Require Alt Key for Normal Zoom
        if (!e.altKey) return;

        const wheelEvent = e.nativeEvent;
        const zoomFactor = 1 + wheelEvent.deltaY * 0.001;

        // CHECK MODIFIERS for Uniform Zoom
        // Explicit Zoom Lock OR Meta/Ctrl Key
        const isUniform = zoomLock || wheelEvent.metaKey || wheelEvent.ctrlKey;

        if (isUniform) {
            // UNIFORM ZOOM (Both Axes)

            // 1. Time Zoom
            const tWindowSize = timeWindow.end - timeWindow.start;
            const newTSize = Math.max(0.01, tWindowSize * zoomFactor);
            const deltaT = tWindowSize - newTSize;
            const tempMouseX = (e.pointer.x + 1) / 2;
            const newTStart = timeWindow.start + deltaT * tempMouseX;
            const newTEnd = timeWindow.end - deltaT * (1 - tempMouseX);
            setTimeWindow({ start: newTStart, end: newTEnd });

            // 2. Freq Zoom
            const fWindowSize = freqWindow.max - freqWindow.min;
            const newFSize = Math.max(100, fWindowSize * zoomFactor);
            const deltaF = fWindowSize - newFSize;
            const tempMouseY = (e.pointer.y + 1) / 2;
            const newFMin = freqWindow.min + deltaF * tempMouseY;
            const newFMax = freqWindow.max - deltaF * (1 - tempMouseY);
            setFreqWindow({ min: newFMin, max: newFMax });

        } else if (wheelEvent.shiftKey) {
            // FREQ ZOOM
            const windowSize = freqWindow.max - freqWindow.min;
            const newSize = Math.max(100, windowSize * zoomFactor); // Min 100Hz range
            const deltaSize = windowSize - newSize;

            // Use R3F Interactivity pointer (Normalized -1 to +1)
            // e.pointer.y is +1 at Top, -1 at Bottom.
            const relativeY = (e.pointer.y + 1) / 2;

            const newMin = freqWindow.min + deltaSize * relativeY;
            const newMax = freqWindow.max - deltaSize * (1 - relativeY);

            setFreqWindow({ min: newMin, max: newMax });

        } else {
            // TIME ZOOM (Default)
            const windowSize = timeWindow.end - timeWindow.start;
            const newSize = Math.max(0.01, windowSize * zoomFactor);
            const deltaSize = windowSize - newSize;

            // e.pointer.x is -1 (Left) to +1 (Right)
            const mouseX = (e.pointer.x + 1) / 2;

            const newStart = timeWindow.start + deltaSize * mouseX;
            const newEnd = timeWindow.end - deltaSize * (1 - mouseX);

            setTimeWindow({ start: newStart, end: newEnd });
        }
    };

    return (
        <mesh
            position={[0, 0, 1]} // In front of plane
            scale={[viewport.width, viewport.height, 1]}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            onPointerMove={onPointerMove}
            onWheel={onWheel}
        >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial transparent opacity={0.0} />
        </mesh>
    );
}






// Phase Color Legend Component - Horizontal Bar
const PhaseLegend = () => {
    const gradientStops = Array.from({ length: 13 }, (_, i) => {
        const hue = (i / 12) * 360;
        return `hsl(${hue}, 85%, 50%)`;
    }).join(', ');

    return (
        <div className="flex flex-col gap-1 w-48">
            <div className="flex justify-between text-[9px] text-gray-500 font-medium">
                <span>Phase (θ)</span>
                <div className="flex gap-2">
                    <span>−π</span>
                    <span>0</span>
                    <span>+π</span>
                </div>
            </div>
            <div
                className="w-full h-3 rounded"
                style={{
                    background: `linear-gradient(to right, ${gradientStops})`,
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.5)'
                }}
            />
        </div>
    );
};

// dB Magnitude Color Legend Component - Horizontal Bar
const DbLegend = ({ dbFloor }: { dbFloor: number }) => {
    // Gradient: Black (Floor) -> Bright (0dB)
    const gradientStops = Array.from({ length: 11 }, (_, i) => {
        const brightness = i / 10;
        const hue = 180; // Cyan tint
        const sat = 0.5 * brightness;
        return `hsl(${hue}, ${sat * 100}%, ${brightness * 100}%)`;
    }).join(', ');

    return (
        <div className="flex flex-col gap-1 w-48">
            <div className="flex justify-between text-[9px] text-gray-500 font-medium">
                <span>Magnitude (dB)</span>
                <div className="flex gap-2">
                    <span>{dbFloor}dB</span>
                    <span>0dB</span>
                </div>
            </div>
            <div
                className="w-full h-3 rounded"
                style={{
                    background: `linear-gradient(to right, ${gradientStops})`,
                    boxShadow: 'inset 0 0 2px rgba(0,0,0,0.5)'
                }}
            />
        </div>
    );
};

export default function SpectrogramViewer({ filePath }: { filePath: string }) {
    const [pyramidLevels, setPyramidLevels] = useState<PyramidLevel[]>([]);
    const [selectedLevelIdx, setSelectedLevelIdx] = useState(0);
    const [timeWindow, setTimeWindow] = useState({ start: 0, end: 10 });
    const [gamma, setGamma] = useState(0.1);
    const [loading, setLoading] = useState(false); // Global loading state for cache gen

    // Helper to format freq for axis labels
    const formatFreq = (hz: number): string => {
        if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
        return `${Math.round(hz)}`;
    };

    // Helper to format time for axis labels
    const formatTime = (seconds: number): string => {
        const sign = seconds < 0 ? '-' : '';
        const absSeconds = Math.abs(seconds);
        const mins = Math.floor(absSeconds / 60);
        const secs = Math.floor(absSeconds % 60);
        return `${sign}${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const [brightness, setBrightness] = useState(1.5);
    const [dbFloor, setDbFloor] = useState(-110); // dB floor for dynamic range

    // Multi-channel support
    const [channelInfo, setChannelInfo] = useState<ChannelInfo | null>(null);
    const [selectedChannels, setSelectedChannels] = useState<number[]>([]);

    // Freq Window State
    const [freqWindow, setFreqWindow] = useState({ min: 0, max: 22050 });

    // Audio playback state
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
    const [isLooping, setIsLooping] = useState(false);
    const [playheadLock, setPlayheadLock] = useState(true); // Lock view to playhead
    const [zoomLock, setZoomLock] = useState(false); // Lock Time/Freq zoom together
    const [scrubMode, setScrubMode] = useState(false); // Scroll to scrub
    const [logScale, setLogScale] = useState(false); // Logarithmic Freq Scale

    // High-frequency Playhead Update
    const playheadRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        let frameId: number;
        const loop = () => {
            if (playheadRef.current) {
                // @ts-expect-error - Custom global method
                const exactTime = window.audioPlayerGetCurrentTime?.() ?? 0;

                if (playheadLock) {
                    playheadRef.current.style.left = '50%';
                } else {
                    const duration = timeWindow.end - timeWindow.start;
                    const pct = ((exactTime - timeWindow.start) / duration) * 100;
                    playheadRef.current.style.left = `${pct}%`;
                }
            }
            frameId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(frameId);
    }, [timeWindow, playheadLock]);

    // Seek Helper
    const handleSeek = (time: number) => {
        setCurrentTime(time);
        // @ts-expect-error - Calling exposed method
        window.audioPlayerSeek?.(time);
    };

    // Calculate dynamic Y-axis ticks
    const yTicks = useMemo(() => {
        if (!channelInfo) return [];
        const max = channelInfo.sample_rate ? channelInfo.sample_rate / 2 : 22050;
        const currentMin = freqWindow ? freqWindow.min : 0;
        const currentMax = freqWindow ? freqWindow.max : max;

        // Log Scale Ticks
        if (logScale) {
            // Standard Octave-ish steps: 20, 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k
            const steps = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
            // Filter steps within current view
            return steps.filter(freq => freq >= currentMin && freq <= currentMax).map(f => formatFreq(f)).reverse();
        }

        return [1.0, 0.75, 0.5, 0.25, 0.0].map(ratio => {
            const val = currentMin + (currentMax - currentMin) * ratio;
            return formatFreq(val);
        });
    }, [freqWindow, channelInfo, logScale]);

    // Update MaxFreq when channel info changes
    useEffect(() => {
        if (channelInfo && channelInfo.sample_rate) {
            const max = channelInfo.sample_rate / 2;
            setFreqWindow({ min: 0, max: max });
        }
    }, [channelInfo]);


    // Auto-scroll when playhead lock is enabled
    useEffect(() => {
        if (playheadLock && duration > 0) {
            const windowSize = timeWindow.end - timeWindow.start;
            // Allow overscroll (negative coordinates) so playhead stays centered at edges
            const newStart = currentTime - windowSize / 2;
            const newEnd = newStart + windowSize;

            // Only update if playhead is outside center 40% of view (tolerance)
            const viewCenter = (timeWindow.start + timeWindow.end) / 2;
            const tolerance = windowSize * 0.2;
            if (Math.abs(currentTime - viewCenter) > tolerance) {
                setTimeWindow({ start: newStart, end: newEnd });
            }
        }
    }, [currentTime, playheadLock, duration]);

    // Fetch pyramid info on mount
    useEffect(() => {
        const fetchPyramidInfo = async () => {
            try {
                const response = await axios.get(`http://localhost:8000/pyramid-info`, {
                    params: { file_path: filePath }
                });
                setPyramidLevels(response.data.level_info);

                // Set duration from server info if available
                if (response.data.duration > 0) {
                    setDuration(response.data.duration);
                }

                // Start at middle level
                const midIdx = Math.floor(response.data.level_info.length / 2);
                setSelectedLevelIdx(midIdx);
            } catch (e) {
                console.error("Failed to fetch pyramid info", e);
            }
        };
        fetchPyramidInfo();
    }, [filePath]);

    // Fetch audio channel info on mount
    useEffect(() => {
        const fetchAudioInfo = async () => {
            try {
                const response = await axios.get(`http://localhost:8000/audio-info`, {
                    params: { file_path: filePath, _t: Date.now() }
                });
                const info = response.data.channels as ChannelInfo;
                // Merge sample_rate from top level
                info.sample_rate = response.data.sample_rate;

                setChannelInfo(info);
                // Default: select all channels
                setSelectedChannels(Array.from({ length: info.count }, (_, i) => i));
            } catch (e) {
                console.error("Failed to fetch audio info", e);
            }
        };
        fetchAudioInfo();
    }, [filePath]);

    const toggleChannel = (idx: number) => {
        setSelectedChannels(prev => {
            if (prev.includes(idx)) {
                // Don't allow deselecting all channels
                if (prev.length <= 1) return prev;
                return prev.filter(i => i !== idx);
            } else {
                return [...prev, idx].sort((a, b) => a - b);
            }
        });
    };

    const currentLevel = pyramidLevels[selectedLevelIdx];
    const M = currentLevel?.M ?? 128;

    return (
        <div className="w-full h-full flex flex-col bg-gray-950 text-white select-none">
            {/* Main Viewer Area */}
            <div className="flex-1 relative h-full min-h-[400px] mx-6 border-x border-t border-gray-800 rounded-t-lg overflow-hidden mt-4 bg-black">
                {/* Y-Axis (Frequency) - Simplified */}
                <div className="absolute left-0 top-0 bottom-0 w-12 flex flex-col justify-between py-2 text-[9px] font-mono text-gray-500 z-10 pointer-events-none bg-gradient-to-r from-black/80 to-transparent">
                    {yTicks.map((label, i) => (
                        <span key={i} className="pl-2">{label}</span>
                    ))}
                </div>

                <Canvas>
                    <color attach="background" args={['#000000']} />
                    <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={1} />

                    <SpectrogramPlane
                        filePath={filePath}
                        M={M}
                        timeStart={timeWindow.start}
                        timeEnd={timeWindow.end}
                        duration={duration}
                        freqStart={freqWindow.min}
                        freqEnd={freqWindow.max}
                        maxFreq={channelInfo && channelInfo.sample_rate ? channelInfo.sample_rate / 2 : 22050}
                        locked={playheadLock}
                        gamma={gamma}
                        brightness={brightness}
                        dbFloor={dbFloor}
                        channels={selectedChannels}
                        setLoading={setLoading}
                        currentTime={currentTime}
                        logScale={logScale}
                    />

                    <InteractionLayer
                        timeWindow={timeWindow}
                        setTimeWindow={setTimeWindow}
                        freqWindow={freqWindow}
                        setFreqWindow={setFreqWindow}
                        duration={duration}
                        maxFreq={channelInfo && channelInfo.sample_rate ? channelInfo.sample_rate / 2 : 22050}
                        setPlayheadLock={setPlayheadLock}
                        zoomLock={zoomLock}
                        scrubMode={scrubMode}
                        currentTime={currentTime}
                        onSeek={handleSeek}
                        logScale={logScale}
                    />
                </Canvas>

                {/* Loading Overlay */}
                {loading && (
                    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 backdrop-blur-[1px] pointer-events-none">
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs text-cyan-400 font-mono bg-black/50 px-2 py-1 rounded">Generating Pyramid Cache...</span>
                        </div>
                    </div>
                )}

                {/* Playhead Overlay - Visual Only */}
                {/* Playhead Overlay - Visual Only */}
                {duration > 0 && (
                    <div
                        ref={playheadRef}
                        className="absolute top-0 bottom-0 w-[1px] bg-amber-500 z-30 pointer-events-none shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                        style={{ willChange: 'left' }}
                    >
                        {/* Time Label */}
                        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-[9px] px-1.5 py-0.5 rounded font-mono whitespace-nowrap shadow-sm">
                            {formatTime(currentTime)}
                        </div>
                    </div>
                )}
            </div>

            {/* Waveform & Timeline (Single Source of Truth) */}
            <div className="mx-6 border-x border-gray-800 bg-gray-900/50">
                <WaveformDisplay
                    filePath={filePath}
                    channels={selectedChannels}
                    currentTime={currentTime}
                    onSeek={handleSeek}
                    selection={selection}
                    onSelectionChange={setSelection}
                />
            </div>

            {/* Control Bar: Transport & Tools */}
            <div className="mx-6 px-4 py-3 bg-gray-900 border-x border-b border-gray-800 rounded-b-lg flex items-center gap-4 mb-4 shadow-lg">
                <AudioPlayer
                    filePath={filePath}
                    channels={selectedChannels}
                    onTimeUpdate={setCurrentTime}
                    onDurationChange={setDuration}
                    selection={selection}
                    isLooping={isLooping}
                    externalDuration={duration}
                />

                <div className="h-6 w-px bg-gray-700 mx-2" />

                {/* View Controls */}
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            setTimeWindow({ start: 0, end: duration });
                            setPlayheadLock(false);
                            if (channelInfo && channelInfo.sample_rate) {
                                setFreqWindow({ min: 0, max: channelInfo.sample_rate / 2 });
                            }
                        }}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded border border-gray-700 transition-colors"
                    >
                        Fit All
                    </button>
                    <button
                        onClick={() => setPlayheadLock(!playheadLock)}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors ${playheadLock
                            ? 'bg-amber-600/20 text-amber-500 border-amber-500/50'
                            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                            }`}
                    >
                        {playheadLock ? 'Locked View' : 'Free View'}
                    </button>
                    <button
                        onClick={() => setZoomLock(!zoomLock)}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-2 ${zoomLock
                            ? 'bg-purple-900/50 text-purple-400 border-purple-500/50'
                            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                            }`}
                        title="Lock Zoom Aspect Ratio (Alt+Wheel scales both axes)"
                    >
                        <span>Link Zoom</span>
                        {zoomLock && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />}
                    </button>
                    <button
                        onClick={() => setScrubMode(!scrubMode)}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-2 ${scrubMode
                            ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/50'
                            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                            }`}
                        title="Scrub Mode (Scroll to Seek)"
                    >
                        <span>Scrub</span>
                        {scrubMode && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    </button>
                    <button
                        onClick={() => setLogScale(!logScale)}
                        className={`px-3 py-1.5 text-xs font-medium rounded border transition-colors flex items-center gap-2 ${logScale
                            ? 'bg-blue-900/50 text-blue-400 border-blue-500/50'
                            : 'bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700'
                            }`}
                        title="Logarithmic Frequency Scale"
                    >
                        <span>Log Scale</span>
                    </button>
                </div>

                <div className="flex-1" />

                {/* Legends (Consolidated) */}
                <div className="flex gap-6 opacity-80 hover:opacity-100 transition-opacity">
                    <DbLegend dbFloor={dbFloor} />
                    <PhaseLegend />
                </div>
            </div>

            {/* Laplacian Pyramid Controls (Footer) */}
            <div className="mx-6 mb-6 p-6 rounded-xl bg-gray-900/80 border border-white/5 backdrop-blur-sm shadow-2xl">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                        Laplacian Pyramid Controls
                    </h2>
                    {channelInfo?.sample_rate && (
                        <div className="text-xs font-mono text-gray-500">
                            SR: {(channelInfo.sample_rate / 1000).toFixed(1)}kHz
                        </div>
                    )}
                </div>

                {/* 1. The Step Slider */}
                <div className="mb-8 relative">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-medium text-cyan-400">Scale (M)</span>
                        <span className="text-xs font-mono text-gray-400">
                            {currentLevel ? `M=${currentLevel.M} • ${(currentLevel.T_seconds * 1000).toFixed(1)}ms` : 'Loading...'}
                        </span>
                    </div>

                    {/* Track */}
                    <div className="relative h-8 w-full flex items-center justify-between">
                        {/* Background Line */}
                        <div className="absolute left-0 right-0 h-1 bg-gray-800 rounded-full top-1/2 -translate-y-1/2" />

                        {/* Interactive Dots */}
                        {pyramidLevels.map((l, i) => (
                            <button
                                key={i}
                                onClick={() => setSelectedLevelIdx(i)}
                                className={`relative z-10 w-3 h-3 rounded-full transition-all duration-300 focus:outline-none ${i <= selectedLevelIdx ? 'bg-cyan-900 border border-cyan-700' : 'bg-gray-800 border border-gray-700'
                                    } hover:scale-150 group`}
                            >
                                {/* Tooltip */}
                                <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 text-[9px] text-white px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
                                    M={l.M}
                                </span>
                            </button>
                        ))}

                        {/* The Thumb (Absolute Positioned) */}
                        {pyramidLevels.length > 1 && (
                            <div
                                className="absolute h-4 w-4 bg-cyan-500 rounded-full shadow-[0_0_15px_rgba(6,182,212,0.6)] border-2 border-white pointer-events-none transition-all duration-300 ease-out z-20 top-1/2 -translate-y-1/2"
                                style={{
                                    left: `${(selectedLevelIdx / (pyramidLevels.length - 1)) * 100}%`,
                                    transform: `translate(-50%, -50%)`
                                }}
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-600 font-mono mt-1">
                        <span>High Detail (Global)</span>
                        <span>High Temporal (Transients)</span>
                    </div>
                </div>


                {/* 2. Visual Settings (Grayscale + Channels) */}
                {/* 2. Visual Settings (Grayscale + Channels) */}
                <div className="grid grid-cols-3 gap-6 items-start">
                    {/* Gamma */}
                    <div className="group relative">
                        <div className="flex justify-between mb-2">
                            <label className="text-xs font-medium text-gray-400 group-hover:text-cyan-400 transition-colors">
                                Intensity (Gamma)
                            </label>
                            <span className="text-xs font-mono text-gray-500 group-hover:text-white transition-colors">
                                {gamma.toFixed(2)}
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0.001"
                            max="0.1"
                            step="0.001"
                            value={gamma}
                            onChange={(e) => setGamma(parseFloat(e.target.value))}
                            onDoubleClick={() => setGamma(0.1)}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-cyan-400 transition-all"
                            title="Double-click to reset"
                        />
                        <div className="text-[9px] text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 w-full text-center">
                            Double-click to reset
                        </div>
                    </div>

                    {/* Brightness */}
                    <div className="group relative">
                        <div className="flex justify-between mb-2">
                            <label className="text-xs font-medium text-gray-400 group-hover:text-cyan-400 transition-colors">
                                Brightness
                            </label>
                            <span className="text-xs font-mono text-gray-500 group-hover:text-white transition-colors">
                                {(brightness * 100).toFixed(0)}%
                            </span>
                        </div>
                        <input
                            type="range"
                            min="0"
                            max="10"
                            step="0.05"
                            value={brightness}
                            onChange={(e) => setBrightness(parseFloat(e.target.value))}
                            onDoubleClick={() => setBrightness(1.0)}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-400 hover:accent-white transition-all"
                            title="Double-click to reset"
                        />
                        <div className="text-[9px] text-gray-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 w-full text-center">
                            Range: 0% - 1000%
                        </div>
                    </div>

                    {/* dB Floor */}
                    <div className="group relative">
                        <div className="flex justify-between mb-2">
                            <label className="text-xs font-medium text-gray-400 group-hover:text-cyan-400 transition-colors">
                                dB Floor
                            </label>
                            <span className="text-xs font-mono text-gray-500 group-hover:text-white transition-colors">
                                {dbFloor} dB
                            </span>
                        </div>
                        <input
                            type="range"
                            min="-120"
                            max="-20"
                            step="1"
                            value={dbFloor}
                            onChange={(e) => setDbFloor(parseFloat(e.target.value))}
                            onDoubleClick={() => setDbFloor(-80)}
                            className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-600 hover:accent-cyan-400 transition-all"
                            title="Double-click to reset"
                        />
                    </div>
                </div>

                {/* Channels (If Multi-channel) */}
                {channelInfo && channelInfo.count > 1 && (
                    <div className="mt-6 pt-6 border-t border-white/5">
                        <label className="block text-xs font-medium mb-3 text-gray-400">
                            Active Channels ({channelInfo.count}ch)
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {channelInfo.labels.map((label, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => toggleChannel(idx)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all border ${selectedChannels.includes(idx)
                                        ? 'bg-cyan-900/50 text-cyan-400 border-cyan-500/50'
                                        : 'bg-gray-800 text-gray-500 border-gray-700 hover:bg-gray-700'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div >

    );
}
