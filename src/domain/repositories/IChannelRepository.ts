import type { Channel, ChannelId, PlaylistId } from '../entities';

/**
 * Repository abstraction for channel data access.
 * Hides whether channels come from memory index, SQLite, or cloud sync.
 */
export interface IChannelRepository {
  buildIndex(playlistId: PlaylistId, channels: readonly Channel[]): void;
  removeIndex(playlistId: PlaylistId): void;
  getById(playlistId: PlaylistId, channelId: ChannelId): Channel | null;
  getAll(playlistId: PlaylistId): readonly Channel[];
  getCategories(playlistId: PlaylistId): readonly string[];
  search(playlistId: PlaylistId, query: string): readonly Channel[];
  getByCategory(playlistId: PlaylistId, category: string): readonly Channel[];
}

/** Aggregate repository bundle — storage implementation is fully hidden. */
export interface IRepositoryBundle {
  readonly playlists: import('./index').IPlaylistRepository;
  readonly favorites: import('./index').IFavoritesRepository;
  readonly history: import('./index').IHistoryRepository;
  readonly recentPlaylists: import('./index').IRecentPlaylistsRepository;
  readonly settings: import('./index').ISettingsRepository;
  readonly channels: IChannelRepository;
}
