import type {
  Channel,
  ChannelId,
  HistoryEntry,
  Playlist,
  PlaylistId,
  PlaylistSource,
  RecentPlaylistEntry,
} from '@/domain/entities';
import { createPlaylistId } from '@/domain/entities';
import type {
  IFavoritesRepository,
  IHistoryRepository,
  IPlaylistRepository,
  IRecentPlaylistsRepository,
} from '@/domain/repositories';
import type { IChannelRepository } from '@/domain/repositories/IChannelRepository';
import { parseM3UAsync } from '@/infrastructure/parsers/M3UParser';
import { yieldToMain } from '@/infrastructure/async/yieldToMain';
import type { IChannelIndex } from '@/domain/repositories';
import type { FilePickerService, NetworkService } from '@/platform/interfaces';
import { ContentSourceType, type IContentProviderRegistry } from '@/domain/content/IContentProvider';
import { EventKind, type IEventPublisher } from '@/domain/events/ApplicationEvent';
import type { PerformanceMonitor } from '@/application/performance/PerformanceMonitor';
import { MetricName } from '@/application/performance/PerformanceMonitor';

export interface LoadPlaylistFromFileDeps {
  readonly filePicker: FilePickerService;
  readonly playlistRepo: IPlaylistRepository;
  readonly recentRepo: IRecentPlaylistsRepository;
  readonly channelIndex: IChannelIndex;
  readonly channelRepo?: IChannelRepository;
  readonly contentProviders?: IContentProviderRegistry;
  readonly eventPublisher?: IEventPublisher;
  readonly performanceMonitor?: PerformanceMonitor;
}

export interface LoadPlaylistFromUrlDeps {
  readonly network: NetworkService;
  readonly playlistRepo: IPlaylistRepository;
  readonly recentRepo: IRecentPlaylistsRepository;
  readonly channelIndex: IChannelIndex;
  readonly channelRepo?: IChannelRepository;
  readonly contentProviders?: IContentProviderRegistry;
  readonly eventPublisher?: IEventPublisher;
  readonly performanceMonitor?: PerformanceMonitor;
}

export interface LoadPlaylistProgress {
  readonly loaded: number;
  readonly total: number | null;
}

function generatePlaylistId(source: PlaylistSource): PlaylistId {
  const raw = `${source.type}:${source.location}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash << 5) - hash + raw.charCodeAt(i);
    hash |= 0;
  }
  return createPlaylistId(`pl_${Math.abs(hash).toString(36)}`);
}

export async function loadPlaylistFromFile(
  deps: LoadPlaylistFromFileDeps,
  onProgress?: (progress: LoadPlaylistProgress) => void,
): Promise<Playlist> {
  deps.performanceMonitor?.mark('playlist-load-start');

  if (deps.contentProviders) {
    const provider = deps.contentProviders.getProviderFor(ContentSourceType.M3UFile);
    if (provider) {
      try {
        const result = await provider.load(
          { sourceType: ContentSourceType.M3UFile, location: '' },
          onProgress,
        );
        return savePlaylistFromContent(deps, result.name, result.source, result.channels, result.categories, onProgress);
      } catch (error) {
        deps.eventPublisher?.publish(EventKind.PlaylistLoadFailed, {
          source: 'file',
          error: error instanceof Error ? error.message : 'Load failed',
        });
        throw error;
      }
    }
  }

  const result = await deps.filePicker.pickM3UFile();
  if (!result) {
    throw new Error('No file selected');
  }

  const source: PlaylistSource = {
    type: 'file',
    label: result.name,
    location: result.name,
  };

  return buildAndSavePlaylist(deps, source, result.content, result.name, onProgress);
}

export async function loadPlaylistFromUrl(
  deps: LoadPlaylistFromUrlDeps,
  url: string,
  onProgress?: (progress: LoadPlaylistProgress) => void,
): Promise<Playlist> {
  deps.performanceMonitor?.mark('playlist-load-start');

  if (deps.contentProviders) {
    const provider = deps.contentProviders.getProviderFor(ContentSourceType.M3UUrl);
    if (provider) {
      try {
        const result = await provider.load(
          { sourceType: ContentSourceType.M3UUrl, location: url },
          onProgress,
        );
        return savePlaylistFromContent(deps, result.name, result.source, result.channels, result.categories, onProgress);
      } catch (error) {
        deps.eventPublisher?.publish(EventKind.PlaylistLoadFailed, {
          source: url,
          error: error instanceof Error ? error.message : 'Load failed',
        });
        throw error;
      }
    }
  }

  const response = await deps.network.fetch(url, { timeoutMs: 60000 });
  if (!response.ok) {
    const error = `Failed to fetch playlist: HTTP ${String(response.status)}`;
    deps.eventPublisher?.publish(EventKind.PlaylistLoadFailed, { source: url, error });
    throw new Error(error);
  }

  const source: PlaylistSource = {
    type: 'url',
    label: extractNameFromUrl(url),
    location: url,
  };

  return buildAndSavePlaylist(deps, source, response.body, source.label, onProgress);
}

async function savePlaylistFromContent(
  deps: LoadPlaylistFromFileDeps | LoadPlaylistFromUrlDeps,
  name: string,
  source: PlaylistSource,
  channels: readonly Channel[],
  categories: readonly import('@/domain/entities').Category[],
  onProgress?: (progress: LoadPlaylistProgress) => void,
): Promise<Playlist> {
  const start = performance.now();
  const id = generatePlaylistId(source);
  const playlist: Playlist = {
    id,
    name,
    source,
    channels,
    categories,
    loadedAt: Date.now(),
  };

  await deps.playlistRepo.save(playlist);

  // Large playlists freeze the browser if we build the full search index
  // on the main thread. Skip sync indexing and use UI fallbacks.
  const INDEX_SYNC_MAX_CHANNELS = 15_000;
  if (channels.length <= INDEX_SYNC_MAX_CHANNELS) {
    deps.channelIndex.build(id, channels);
    deps.channelRepo?.buildIndex(id, channels);
  }

  await yieldToMain();

  const recentEntry: RecentPlaylistEntry = {
    id,
    name,
    source,
    lastOpenedAt: Date.now(),
  };
  await deps.recentRepo.add(recentEntry);

  onProgress?.({ loaded: channels.length, total: channels.length });

  const durationMs = performance.now() - start;
  deps.performanceMonitor?.record(MetricName.PlaylistParseDuration, durationMs, 'ms');
  deps.eventPublisher?.publish(EventKind.PlaylistLoaded, {
    playlistId: id,
    name,
    channelCount: channels.length,
    durationMs,
  });

  return playlist;
}

async function buildAndSavePlaylist(
  deps: LoadPlaylistFromFileDeps | LoadPlaylistFromUrlDeps,
  source: PlaylistSource,
  content: string,
  name: string,
  onProgress?: (progress: LoadPlaylistProgress) => void,
): Promise<Playlist> {
  const { channels, categories } = await parseM3UAsync(content, {
    onProgress: (loaded) => onProgress?.({ loaded, total: null }),
    yieldEveryLines: 2000,
  });

  return savePlaylistFromContent(deps, name, source, channels, categories, onProgress);
}

export async function toggleFavorite(
  favoritesRepo: IFavoritesRepository,
  channelId: ChannelId,
  playlistId: PlaylistId,
  eventPublisher?: IEventPublisher,
): Promise<boolean> {
  const isFavorite = await favoritesRepo.isFavorite(channelId);
  if (isFavorite) {
    await favoritesRepo.remove(channelId);
    eventPublisher?.publish(EventKind.FavoriteRemoved, { channelId });
    return false;
  }
  await favoritesRepo.add(channelId, playlistId);
  eventPublisher?.publish(EventKind.FavoriteAdded, { channelId, playlistId });
  return true;
}

export async function recordWatchHistory(
  historyRepo: IHistoryRepository,
  entry: HistoryEntry,
  eventPublisher?: IEventPublisher,
): Promise<void> {
  await historyRepo.add(entry);
  const recent = await historyRepo.getRecent(100);
  eventPublisher?.publish(EventKind.HistoryUpdated, { entryCount: recent.length });
}

export function findChannel(playlist: Playlist, channelId: ChannelId): Channel | null {
  return playlist.channels.find((c) => c.id === channelId) ?? null;
}

function extractNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segment = pathname.split('/').filter(Boolean).pop();
    return segment ?? url;
  } catch {
    return url;
  }
}
