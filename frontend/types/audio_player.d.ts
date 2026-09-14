export {};

declare global {
  interface Window {
    audioPlayerSeek?: (time: number) => void;
    audioPlayerGetCurrentTime?: () => number;
  }
}
