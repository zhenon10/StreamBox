import type { Channel, ChannelId, PlaylistId } from '@/domain/entities';
import type { IChannelIndex } from '@/domain/repositories';

interface CategoryIndex {
  readonly channels: readonly Channel[];
  readonly byCategory: ReadonlyMap<string, readonly number[]>;
  readonly searchIndex: ReadonlyMap<string, readonly number[]>;
}

export class ChannelIndex implements IChannelIndex {
  private readonly indices = new Map<PlaylistId, CategoryIndex>();

  build(playlistId: PlaylistId, channels: readonly Channel[]): void {
    const byCategory = new Map<string, number[]>();
    const searchIndex = new Map<string, number[]>();

    channels.forEach((channel, index) => {
      const group = channel.group.toLowerCase();
      const groupList = byCategory.get(group) ?? [];
      groupList.push(index);
      byCategory.set(group, groupList);

      const tokens = tokenize(channel.name);
      for (const token of tokens) {
        const tokenList = searchIndex.get(token) ?? [];
        tokenList.push(index);
        searchIndex.set(token, tokenList);
      }
    });

    this.indices.set(playlistId, { channels, byCategory, searchIndex });
  }

  remove(playlistId: PlaylistId): void {
    this.indices.delete(playlistId);
  }

  getChannels(playlistId: PlaylistId): readonly Channel[] {
    return this.indices.get(playlistId)?.channels ?? [];
  }

  getCategories(playlistId: PlaylistId): readonly string[] {
    const index = this.indices.get(playlistId);
    if (!index) return [];
    return Array.from(index.byCategory.keys()).map((key) => {
      const channel = index.channels[index.byCategory.get(key)?.[0] ?? 0];
      return channel?.group ?? key;
    });
  }

  getChannelsByCategory(playlistId: PlaylistId, category: string): readonly Channel[] {
    const index = this.indices.get(playlistId);
    if (!index) return [];

    const normalized = category.toLowerCase();
    const positions = index.byCategory.get(normalized) ?? [];
    return positions.map((pos) => index.channels[pos]).filter(Boolean) as Channel[];
  }

  search(playlistId: PlaylistId, query: string): readonly Channel[] {
    const index = this.indices.get(playlistId);
    if (!index || !query.trim()) return index?.channels ?? [];

    const tokens = tokenize(query);
    if (tokens.length === 0) return index.channels;

    const matchSets = tokens.map((token) => {
      const matches = new Set<number>();
      for (const [key, positions] of index.searchIndex) {
        if (key.includes(token)) {
          for (const pos of positions) matches.add(pos);
        }
      }
      return matches;
    });

    const first = matchSets[0];
    if (!first) return [];

    const intersection = [...first].filter((pos) =>
      matchSets.every((set) => set.has(pos)),
    );

    return intersection.map((pos) => index.channels[pos]).filter(Boolean) as Channel[];
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_.]+/)
    .filter((t) => t.length > 0);
}

export function createChannelIdFromUrl(url: string, name: string): ChannelId {
  const raw = `${name}:${url}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return `${Math.abs(hash).toString(36)}` as ChannelId;
}
