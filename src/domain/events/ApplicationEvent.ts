import type { ChannelId, PlaylistId } from '../entities';
import type { AppSettings, PlaybackError } from '../entities';

/** Strongly-typed event kind registry — no loose string literals at call sites. */
export const EventKind = {
  PlaybackStarted: 'PlaybackStarted',
  PlaybackStopped: 'PlaybackStopped',
  PlaybackPaused: 'PlaybackPaused',
  PlaybackResumed: 'PlaybackResumed',
  PlaybackError: 'PlaybackError',
  PlaylistLoaded: 'PlaylistLoaded',
  PlaylistLoadFailed: 'PlaylistLoadFailed',
  PlaylistUpdated: 'PlaylistUpdated',
  ChannelChanged: 'ChannelChanged',
  FavoriteAdded: 'FavoriteAdded',
  FavoriteRemoved: 'FavoriteRemoved',
  HistoryUpdated: 'HistoryUpdated',
  SettingsChanged: 'SettingsChanged',
  NetworkDisconnected: 'NetworkDisconnected',
  NetworkConnected: 'NetworkConnected',
  ApplicationStarted: 'ApplicationStarted',
  ApplicationClosed: 'ApplicationClosed',
  PlatformReady: 'PlatformReady',
} as const;

export type EventKind = (typeof EventKind)[keyof typeof EventKind];

/** Payload map keyed by event kind for compile-time type safety. */
export interface ApplicationEventPayloadMap {
  readonly PlaybackStarted: {
    readonly channelId: ChannelId;
    readonly channelName: string;
    readonly url: string;
  };
  readonly PlaybackStopped: {
    readonly channelId: ChannelId | null;
  };
  readonly PlaybackPaused: {
    readonly channelId: ChannelId;
    readonly currentTime: number;
  };
  readonly PlaybackResumed: {
    readonly channelId: ChannelId;
    readonly currentTime: number;
  };
  readonly PlaybackError: {
    readonly channelId: ChannelId | null;
    readonly error: PlaybackError;
  };
  readonly PlaylistLoaded: {
    readonly playlistId: PlaylistId;
    readonly name: string;
    readonly channelCount: number;
    readonly durationMs: number;
  };
  readonly PlaylistLoadFailed: {
    readonly source: string;
    readonly error: string;
  };
  readonly PlaylistUpdated: {
    readonly playlistId: PlaylistId;
  };
  readonly ChannelChanged: {
    readonly channelId: ChannelId;
    readonly channelName: string;
    readonly playlistId: PlaylistId;
  };
  readonly FavoriteAdded: {
    readonly channelId: ChannelId;
    readonly playlistId: PlaylistId;
  };
  readonly FavoriteRemoved: {
    readonly channelId: ChannelId;
  };
  readonly HistoryUpdated: {
    readonly entryCount: number;
  };
  readonly SettingsChanged: {
    readonly settings: AppSettings;
  };
  readonly NetworkDisconnected: Record<string, never>;
  readonly NetworkConnected: Record<string, never>;
  readonly ApplicationStarted: {
    readonly platform: string;
  };
  readonly ApplicationClosed: Record<string, never>;
  readonly PlatformReady: {
    readonly platform: string;
    readonly osVersion: string;
  };
}

/** Discriminated union of all application events. */
export type ApplicationEvent = {
  [K in EventKind]: {
    readonly kind: K;
    readonly timestamp: number;
    readonly payload: ApplicationEventPayloadMap[K];
  };
}[EventKind];

export type EventHandler<K extends EventKind = EventKind> = (
  event: Extract<ApplicationEvent, { kind: K }>,
) => void;

export type Unsubscribe = () => void;

/** Event bus contract — publish/subscribe with typed handlers. */
export interface IEventBus {
  publish<K extends EventKind>(
    kind: K,
    payload: ApplicationEventPayloadMap[K],
  ): ApplicationEvent;
  subscribe<K extends EventKind>(kind: K, handler: EventHandler<K>): Unsubscribe;
  subscribeAll(handler: (event: ApplicationEvent) => void): Unsubscribe;
  getHistory(limit?: number): readonly ApplicationEvent[];
  clearHistory(): void;
}

export interface IEventPublisher {
  publish<K extends EventKind>(
    kind: K,
    payload: ApplicationEventPayloadMap[K],
  ): ApplicationEvent;
}

export interface IEventSubscriber {
  on<K extends EventKind>(kind: K, handler: EventHandler<K>): Unsubscribe;
  onAll(handler: (event: ApplicationEvent) => void): Unsubscribe;
}
