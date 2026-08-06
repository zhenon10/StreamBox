export type RemoteKey =
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Enter'
  | 'Back'
  | 'Play'
  | 'Pause'
  | 'Stop'
  | 'MediaPlayPause';

export interface RemoteKeyEvent {
  readonly key: RemoteKey;
  readonly repeat: boolean;
}

export type RemoteKeyHandler = (event: RemoteKeyEvent) => void;

export interface DeviceInfo {
  readonly platform: string;
  readonly model: string;
  readonly osVersion: string;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly is4K: boolean;
}

export interface PlatformService {
  initialize(): Promise<void>;
  getDeviceInfo(): DeviceInfo;
  exitApp(): void;
  setKeepScreenOn(enabled: boolean): void;
}

export interface StorageService {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getKeys(prefix?: string): Promise<string[]>;
}

export interface NetworkRequestOptions {
  readonly method?: 'GET' | 'POST' | 'HEAD';
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeoutMs?: number;
}

export interface NetworkResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly body: string;
}

export interface NetworkService {
  fetch(url: string, options?: NetworkRequestOptions): Promise<NetworkResponse>;
}

export interface FilePickerResult {
  readonly name: string;
  readonly content: string;
}

export interface FilePickerService {
  pickM3UFile(): Promise<FilePickerResult | null>;
}

export interface RemoteService {
  subscribe(handler: RemoteKeyHandler): () => void;
  mapKeyCode(keyCode: number): RemoteKey | null;
}

export interface VideoPlayerEvents {
  onStateChange?: (state: import('@/domain/entities').PlaybackState) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onError?: (error: import('@/domain/entities').PlaybackError) => void;
  onEnded?: () => void;
}

export interface VideoLoadOptions {
  readonly isLive?: boolean;
}

export interface VideoPlayerService {
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
  setEventHandlers(handlers: VideoPlayerEvents): void;
}

export interface PlatformContext {
  readonly platform: PlatformService;
  readonly storage: StorageService;
  readonly network: NetworkService;
  readonly filePicker: FilePickerService;
  readonly remote: RemoteService;
  readonly videoPlayer: VideoPlayerService;
}
