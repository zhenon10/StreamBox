export type ChannelId = string & { readonly __brand: 'ChannelId' };
export type PlaylistId = string & { readonly __brand: 'PlaylistId' };

export function createChannelId(value: string): ChannelId {
  return value as ChannelId;
}

export function createPlaylistId(value: string): PlaylistId {
  return value as PlaylistId;
}

export interface Channel {
  readonly id: ChannelId;
  readonly name: string;
  readonly url: string;
  readonly group: string;
  readonly logoUrl: string | null;
  readonly tvgId: string | null;
  readonly tvgName: string | null;
}

export interface Category {
  readonly name: string;
  readonly channelCount: number;
}

export type PlaylistSourceType = 'file' | 'url';

export interface PlaylistSource {
  readonly type: PlaylistSourceType;
  readonly label: string;
  readonly location: string;
}

export interface Playlist {
  readonly id: PlaylistId;
  readonly name: string;
  readonly source: PlaylistSource;
  readonly channels: readonly Channel[];
  readonly categories: readonly Category[];
  readonly loadedAt: number;
}

export interface RecentPlaylistEntry {
  readonly id: PlaylistId;
  readonly name: string;
  readonly source: PlaylistSource;
  readonly lastOpenedAt: number;
}

export interface HistoryEntry {
  readonly channelId: ChannelId;
  readonly channelName: string;
  readonly playlistId: PlaylistId;
  readonly watchedAt: number;
}

export interface AppSettings {
  readonly bufferSizeSeconds: number;
  readonly autoReconnect: boolean;
  readonly reconnectAttempts: number;
  readonly reconnectDelayMs: number;
  readonly defaultVolume: number;
  readonly showChannelNumbers: boolean;
  readonly enableHardwareAcceleration: boolean;
  /** UI language */
  readonly locale: 'tr' | 'en';
}

export const DEFAULT_SETTINGS: AppSettings = {
  bufferSizeSeconds: 3,
  autoReconnect: true,
  reconnectAttempts: 5,
  reconnectDelayMs: 3000,
  defaultVolume: 80,
  showChannelNumbers: true,
  enableHardwareAcceleration: true,
  locale: 'tr',
};

export type PlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'buffering'
  | 'error'
  | 'reconnecting';

export interface PlaybackError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface PlaybackInfo {
  readonly state: PlaybackState;
  readonly currentTime: number;
  readonly duration: number;
  readonly error: PlaybackError | null;
}
