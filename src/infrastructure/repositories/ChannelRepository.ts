import type { Channel, ChannelId, PlaylistId } from '@/domain/entities';
import type { IChannelRepository } from '@/domain/repositories/IChannelRepository';
import type { IChannelIndex } from '@/domain/repositories';

/** Channel repository backed by in-memory index — swappable for SQLite/IndexedDB/cloud. */
export class ChannelRepository implements IChannelRepository {
  constructor(private readonly index: IChannelIndex) {}

  buildIndex(playlistId: PlaylistId, channels: readonly Channel[]): void {
    this.index.build(playlistId, channels);
  }

  removeIndex(playlistId: PlaylistId): void {
    if ('remove' in this.index && typeof this.index.remove === 'function') {
      (this.index as { remove: (id: PlaylistId) => void }).remove(playlistId);
    }
  }

  getById(playlistId: PlaylistId, channelId: ChannelId): Channel | null {
    const channels = this.index.getChannels(playlistId);
    return channels.find((c) => c.id === channelId) ?? null;
  }

  getAll(playlistId: PlaylistId): readonly Channel[] {
    return this.index.getChannels(playlistId);
  }

  getCategories(playlistId: PlaylistId): readonly string[] {
    return this.index.getCategories(playlistId);
  }

  search(playlistId: PlaylistId, query: string): readonly Channel[] {
    return this.index.search(playlistId, query);
  }

  getByCategory(playlistId: PlaylistId, category: string): readonly Channel[] {
    return this.index.getChannelsByCategory(playlistId, category);
  }
}
