/** Video player abstraction — application code must never touch HTMLVideoElement directly. */
export type { VideoPlayerEvents } from '../interfaces';

import type { PlaybackState, PlaybackError } from '@/domain/entities';

export interface IVideoPlayerEvents {
  onStateChange?: (state: PlaybackState) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onError?: (error: PlaybackError) => void;
  onEnded?: () => void;
}

export interface VideoLoadOptions {
  readonly isLive?: boolean;
  /** Channel title — used for codec hints (e.g. HEVC). */
  readonly channelName?: string;
}

export interface IVideoPlayer {
  readonly playerType: VideoPlayerType;
  attach(container: HTMLElement): void;
  detach(): void;
  load(url: string, options?: VideoLoadOptions): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  stop(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  getVolume(): number;
  setMuted(muted: boolean): void;
  isMuted(): boolean;
  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void;
  getCurrentTime(): number;
  getDuration(): number;
  destroy(): void;
  setEventHandlers(handlers: IVideoPlayerEvents): void;
}

export const VideoPlayerType = {
  HTML5: 'html5',
  WebOS: 'webos',
  Tizen: 'tizen',
  Android: 'android',
} as const;

export type VideoPlayerType = (typeof VideoPlayerType)[keyof typeof VideoPlayerType];

export interface IVideoPlayerFactory {
  create(): IVideoPlayer;
}
