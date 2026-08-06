import type {
  AppSettings,
  Channel,
  ChannelId,
  HistoryEntry,
  Playlist,
  PlaylistId,
  RecentPlaylistEntry,
} from '../entities';

export interface IPlaylistRepository {
  save(playlist: Playlist): Promise<void>;
  getById(id: PlaylistId): Promise<Playlist | null>;
  getAll(): Promise<readonly Playlist[]>;
  delete(id: PlaylistId): Promise<void>;
}

export interface IFavoritesRepository {
  add(channelId: ChannelId, playlistId: PlaylistId): Promise<void>;
  remove(channelId: ChannelId): Promise<void>;
  isFavorite(channelId: ChannelId): Promise<boolean>;
  getAll(): Promise<readonly ChannelId[]>;
  getByPlaylist(playlistId: PlaylistId): Promise<readonly ChannelId[]>;
}

export interface IHistoryRepository {
  add(entry: HistoryEntry): Promise<void>;
  getRecent(limit: number): Promise<readonly HistoryEntry[]>;
  clear(): Promise<void>;
}

export interface IRecentPlaylistsRepository {
  add(entry: RecentPlaylistEntry): Promise<void>;
  getRecent(limit: number): Promise<readonly RecentPlaylistEntry[]>;
  remove(id: PlaylistId): Promise<void>;
}

export interface ISettingsRepository {
  get(): Promise<AppSettings>;
  save(settings: AppSettings): Promise<void>;
}

export interface IChannelIndex {
  build(playlistId: PlaylistId, channels: readonly Channel[]): void;
  remove?(playlistId: PlaylistId): void;
  getChannels(playlistId: PlaylistId): readonly Channel[];
  getCategories(playlistId: PlaylistId): readonly string[];
  search(playlistId: PlaylistId, query: string): readonly Channel[];
  getChannelsByCategory(playlistId: PlaylistId, category: string): readonly Channel[];
}

export type {
  IChannelRepository,
  IRepositoryBundle,
} from './IChannelRepository';
