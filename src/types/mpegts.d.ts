declare module 'mpegts.js' {
  export interface PlayerMediaDataSource {
    type?: string;
    isLive?: boolean;
    url?: string;
    hasAudio?: boolean;
    hasVideo?: boolean;
  }

  export interface PlayerConfig {
    enableWorker?: boolean;
    enableStashBuffer?: boolean;
    stashInitialSize?: number;
    liveBufferLatencyChasing?: boolean;
    liveBufferLatencyMaxLatency?: number;
    liveBufferLatencyMinRemain?: number;
    lazyLoad?: boolean;
    autoCleanupSourceBuffer?: boolean;
    fixAudioTimestampGap?: boolean;
  }

  export interface Player {
    attachMediaElement(mediaElement: HTMLMediaElement): void;
    detachMediaElement(): void;
    load(): void;
    unload(): void;
    play(): Promise<void>;
    pause(): void;
    destroy(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }

  export interface FeatureList {
    mseLivePlayback: boolean;
  }

  interface MpegtsStatic {
    createPlayer(mediaDataSource: PlayerMediaDataSource, config?: PlayerConfig): Player;
    isSupported(): boolean;
    getFeatureList(): FeatureList;
    Events: {
      ERROR: string;
      MEDIA_INFO: string;
    };
  }

  const mpegts: MpegtsStatic;
  export default mpegts;
}
