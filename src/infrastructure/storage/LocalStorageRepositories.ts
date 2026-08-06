import type {
  AppSettings,
  HistoryEntry,
  Playlist,
  PlaylistId,
  RecentPlaylistEntry,
  ChannelId,
} from '@/domain/entities';
import { DEFAULT_SETTINGS } from '@/domain/entities';
import type {
  IFavoritesRepository,
  IHistoryRepository,
  IPlaylistRepository,
  IRecentPlaylistsRepository,
  ISettingsRepository,
} from '@/domain/repositories';
import type { StorageService } from '@/platform/interfaces';

const STORAGE_KEYS = {
  playlists: 'streambox:playlists',
  favorites: 'streambox:favorites',
  history: 'streambox:history',
  recentPlaylists: 'streambox:recent-playlists',
  settings: 'streambox:settings',
} as const;

export class LocalStoragePlaylistRepository implements IPlaylistRepository {
  constructor(private readonly storage: StorageService) {}

  async save(playlist: Playlist): Promise<void> {
    const all = await this.getAllMap();
    all[playlist.id] = playlist;
    await this.storage.setItem(STORAGE_KEYS.playlists, JSON.stringify(all));
  }

  async getById(id: PlaylistId): Promise<Playlist | null> {
    const all = await this.getAllMap();
    return all[id] ?? null;
  }

  async getAll(): Promise<readonly Playlist[]> {
    const all = await this.getAllMap();
    return Object.values(all);
  }

  async delete(id: PlaylistId): Promise<void> {
    const all = await this.getAllMap();
    delete all[id];
    await this.storage.setItem(STORAGE_KEYS.playlists, JSON.stringify(all));
  }

  private async getAllMap(): Promise<Record<string, Playlist>> {
    const raw = await this.storage.getItem(STORAGE_KEYS.playlists);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, Playlist>;
  }
}

export class LocalStorageFavoritesRepository implements IFavoritesRepository {
  constructor(private readonly storage: StorageService) {}

  async add(channelId: ChannelId, playlistId: PlaylistId): Promise<void> {
    const favorites = await this.getMap();
    favorites[channelId] = playlistId;
    await this.storage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  }

  async remove(channelId: ChannelId): Promise<void> {
    const favorites = await this.getMap();
    delete favorites[channelId];
    await this.storage.setItem(STORAGE_KEYS.favorites, JSON.stringify(favorites));
  }

  async isFavorite(channelId: ChannelId): Promise<boolean> {
    const favorites = await this.getMap();
    return channelId in favorites;
  }

  async getAll(): Promise<readonly ChannelId[]> {
    const favorites = await this.getMap();
    return Object.keys(favorites) as ChannelId[];
  }

  async getByPlaylist(playlistId: PlaylistId): Promise<readonly ChannelId[]> {
    const favorites = await this.getMap();
    return Object.entries(favorites)
      .filter(([, pid]) => pid === playlistId)
      .map(([cid]) => cid as ChannelId);
  }

  private async getMap(): Promise<Record<string, PlaylistId>> {
    const raw = await this.storage.getItem(STORAGE_KEYS.favorites);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, PlaylistId>;
  }
}

export class LocalStorageHistoryRepository implements IHistoryRepository {
  constructor(private readonly storage: StorageService) {}

  async add(entry: HistoryEntry): Promise<void> {
    const history = await this.getList();
    const filtered = history.filter((h) => h.channelId !== entry.channelId);
    const updated = [entry, ...filtered].slice(0, 100);
    await this.storage.setItem(STORAGE_KEYS.history, JSON.stringify(updated));
  }

  async getRecent(limit: number): Promise<readonly HistoryEntry[]> {
    const history = await this.getList();
    return history.slice(0, limit);
  }

  async clear(): Promise<void> {
    await this.storage.removeItem(STORAGE_KEYS.history);
  }

  private async getList(): Promise<HistoryEntry[]> {
    const raw = await this.storage.getItem(STORAGE_KEYS.history);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  }
}

export class LocalStorageRecentPlaylistsRepository implements IRecentPlaylistsRepository {
  constructor(private readonly storage: StorageService) {}

  async add(entry: RecentPlaylistEntry): Promise<void> {
    const list = await this.getList();
    const filtered = list.filter((p) => p.id !== entry.id);
    const updated = [entry, ...filtered].slice(0, 20);
    await this.storage.setItem(STORAGE_KEYS.recentPlaylists, JSON.stringify(updated));
  }

  async getRecent(limit: number): Promise<readonly RecentPlaylistEntry[]> {
    const list = await this.getList();
    return list.slice(0, limit);
  }

  async remove(id: PlaylistId): Promise<void> {
    const list = await this.getList();
    const updated = list.filter((p) => p.id !== id);
    await this.storage.setItem(STORAGE_KEYS.recentPlaylists, JSON.stringify(updated));
  }

  private async getList(): Promise<RecentPlaylistEntry[]> {
    const raw = await this.storage.getItem(STORAGE_KEYS.recentPlaylists);
    if (!raw) return [];
    return JSON.parse(raw) as RecentPlaylistEntry[];
  }
}

export class LocalStorageSettingsRepository implements ISettingsRepository {
  constructor(private readonly storage: StorageService) {}

  async get(): Promise<AppSettings> {
    const raw = await this.storage.getItem(STORAGE_KEYS.settings);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  }

  async save(settings: AppSettings): Promise<void> {
    await this.storage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }
}
