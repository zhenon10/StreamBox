import type { Playlist, PlaylistId } from '@/domain/entities';
import type { IPlaylistRepository } from '@/domain/repositories';
import type { StorageService } from '@/platform/interfaces';
import {
  IDBStore,
  type PlaylistMetaRecord,
  deletePlaylistChannels,
  idbDelete,
  idbGet,
  idbGetAll,
  idbPut,
  isIndexedDBAvailable,
  loadPlaylistChannels,
  savePlaylistChannels,
} from './IndexedDBService';

const LEGACY_PLAYLIST_KEY = 'streambox:playlists';
/** Above this size, channel persistence runs in the background so navigation is not blocked. */
const DEFER_CHANNEL_PERSIST_THRESHOLD = 15_000;

/**
 * Stores playlist metadata in IndexedDB and channels in chunked records.
 * Supports large playlists (100k+ channels) without localStorage quota limits.
 */
export class IndexedDBPlaylistRepository implements IPlaylistRepository {
  private migrationDone = false;

  constructor(private readonly legacyStorage: StorageService) {}

  async save(playlist: Playlist): Promise<void> {
    await this.ensureMigration();

    const meta: PlaylistMetaRecord = {
      id: playlist.id,
      name: playlist.name,
      source: playlist.source,
      categories: playlist.categories,
      loadedAt: playlist.loadedAt,
      channelCount: playlist.channels.length,
    };

    await idbPut(IDBStore.PlaylistMeta, {
      ...meta,
      // Huge category lists in IDB meta can stall reads; UI only shows ~120 anyway.
      categories: meta.categories.slice(0, 300),
    });

    if (playlist.channels.length > DEFER_CHANNEL_PERSIST_THRESHOLD) {
      void savePlaylistChannels(playlist.id, playlist.channels);
      return;
    }

    await savePlaylistChannels(playlist.id, playlist.channels);
  }

  async getById(id: PlaylistId): Promise<Playlist | null> {
    await this.ensureMigration();

    const meta = await idbGet<PlaylistMetaRecord>(IDBStore.PlaylistMeta, id);
    if (!meta) return null;

    const channels = await loadPlaylistChannels(id);
    return this.merge(meta, channels);
  }

  async getAll(): Promise<readonly Playlist[]> {
    await this.ensureMigration();

    const metas = await idbGetAll<PlaylistMetaRecord>(IDBStore.PlaylistMeta);
    const playlists: Playlist[] = [];

    for (const meta of metas) {
      const channels = await loadPlaylistChannels(meta.id);
      playlists.push(this.merge(meta, channels));
    }

    return playlists;
  }

  async delete(id: PlaylistId): Promise<void> {
    await idbDelete(IDBStore.PlaylistMeta, id);
    await deletePlaylistChannels(id);
  }

  private merge(
    meta: PlaylistMetaRecord,
    channels: readonly import('@/domain/entities').Channel[],
  ): Playlist {
    return {
      id: meta.id as PlaylistId,
      name: meta.name,
      source: meta.source,
      categories: meta.categories,
      loadedAt: meta.loadedAt,
      channels,
    };
  }

  /** One-time migration from legacy localStorage blob. */
  private async ensureMigration(): Promise<void> {
    if (this.migrationDone || !isIndexedDBAvailable()) return;

    const raw = await this.legacyStorage.getItem(LEGACY_PLAYLIST_KEY);
    if (!raw) {
      this.migrationDone = true;
      return;
    }

    try {
      const legacy = JSON.parse(raw) as Record<string, Playlist>;
      for (const playlist of Object.values(legacy)) {
        await this.save(playlist);
      }
      await this.legacyStorage.removeItem(LEGACY_PLAYLIST_KEY);
    } catch {
      // Legacy data corrupt or too large — drop it so app can continue.
      await this.legacyStorage.removeItem(LEGACY_PLAYLIST_KEY);
    }

    this.migrationDone = true;
  }
}

/**
 * Fallback when IndexedDB is unavailable — stores metadata only, channels in memory session.
 * Prevents quota errors by never persisting channel arrays to localStorage.
 */
export class LocalStoragePlaylistMetadataRepository implements IPlaylistRepository {
  private readonly sessionChannels = new Map<string, readonly import('@/domain/entities').Channel[]>();

  constructor(private readonly storage: StorageService) {}

  async save(playlist: Playlist): Promise<void> {
    this.sessionChannels.set(playlist.id, playlist.channels);

    const meta: PlaylistMetaRecord = {
      id: playlist.id,
      name: playlist.name,
      source: playlist.source,
      categories: playlist.categories,
      loadedAt: playlist.loadedAt,
      channelCount: playlist.channels.length,
    };

    const index = await this.getMetaIndex();
    index[playlist.id] = meta;
    await this.storage.setItem(LEGACY_PLAYLIST_KEY, JSON.stringify(index));
  }

  async getById(id: PlaylistId): Promise<Playlist | null> {
    const index = await this.getMetaIndex();
    const meta = index[id];
    if (!meta) return null;

    const channels = this.sessionChannels.get(id) ?? [];
    return {
      id: meta.id as PlaylistId,
      name: meta.name,
      source: meta.source,
      categories: meta.categories,
      loadedAt: meta.loadedAt,
      channels,
    };
  }

  async getAll(): Promise<readonly Playlist[]> {
    const index = await this.getMetaIndex();
    return Object.values(index).map((meta) => ({
      id: meta.id as PlaylistId,
      name: meta.name,
      source: meta.source,
      categories: meta.categories,
      loadedAt: meta.loadedAt,
      channels: this.sessionChannels.get(meta.id) ?? [],
    }));
  }

  async delete(id: PlaylistId): Promise<void> {
    this.sessionChannels.delete(id);
    const index = await this.getMetaIndex();
    delete index[id];
    await this.storage.setItem(LEGACY_PLAYLIST_KEY, JSON.stringify(index));
  }

  private async getMetaIndex(): Promise<Record<string, PlaylistMetaRecord>> {
    const raw = await this.storage.getItem(LEGACY_PLAYLIST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PlaylistMetaRecord | Playlist>;

    const index: Record<string, PlaylistMetaRecord> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if ('channelCount' in value) {
        index[key] = value as PlaylistMetaRecord;
      } else {
        const pl = value as Playlist;
        index[key] = {
          id: pl.id,
          name: pl.name,
          source: pl.source,
          categories: pl.categories,
          loadedAt: pl.loadedAt,
          channelCount: pl.channels.length,
        };
        this.sessionChannels.set(pl.id, pl.channels);
      }
    }
    return index;
  }
}

export function createPlaylistRepository(storage: StorageService): IPlaylistRepository {
  if (isIndexedDBAvailable()) {
    return new IndexedDBPlaylistRepository(storage);
  }
  return new LocalStoragePlaylistMetadataRepository(storage);
}
