import {
  ContentSourceType,
  createContentProviderId,
  type ContentLoadProgress,
  type ContentLoadRequest,
  type ContentLoadResult,
  type IContentProvider,
  type IContentProviderRegistry,
} from '@/domain/content/IContentProvider';
import type { PlaylistSource } from '@/domain/entities';
import { parseM3UAsync } from '@/infrastructure/parsers/M3UParser';
import type { FilePickerService } from '@/platform/interfaces';
import type { DownloadService } from '@/application/download/DownloadService';
import type { CacheService } from '@/application/cache/CacheService';
import { CacheNamespace } from '@/domain/cache/ICacheService';
import type { Logger } from '@/infrastructure/logging/Logger';

/** Skip memory cache above this size — caching a 50MB+ M3U doubles RAM and freezes. */
const MEMORY_CACHE_MAX_BYTES = 2_000_000;

/** M3U content provider — handles local files and remote URLs. */
export class M3UContentProvider implements IContentProvider {
  readonly id = createContentProviderId('m3u');
  readonly displayName = 'M3U Playlist';
  readonly supportedSourceTypes = [ContentSourceType.M3UFile, ContentSourceType.M3UUrl] as const;

  constructor(
    private readonly filePicker: FilePickerService,
    private readonly downloadService: DownloadService,
    private readonly cacheService: CacheService,
    private readonly logger: Logger,
  ) {}

  canHandle(sourceType: ContentSourceType): boolean {
    return (
      sourceType === ContentSourceType.M3UFile || sourceType === ContentSourceType.M3UUrl
    );
  }

  async load(
    request: ContentLoadRequest,
    onProgress?: (progress: ContentLoadProgress) => void,
  ): Promise<ContentLoadResult> {
    if (request.sourceType === ContentSourceType.M3UFile) {
      return this.loadFromFile(onProgress);
    }
    return this.loadFromUrl(request.location, request.label, onProgress);
  }

  private async loadFromFile(
    onProgress?: (progress: ContentLoadProgress) => void,
  ): Promise<ContentLoadResult> {
    const result = await this.filePicker.pickM3UFile();
    if (!result) {
      throw new Error('No file selected');
    }

    const source: PlaylistSource = {
      type: 'file',
      label: result.name,
      location: result.name,
    };

    return this.parseContent(result.content, result.name, source, onProgress);
  }

  private async loadFromUrl(
    url: string,
    label: string | undefined,
    onProgress?: (progress: ContentLoadProgress) => void,
  ): Promise<ContentLoadResult> {
    this.logger.info('Fetching remote M3U', 'M3UContentProvider');

    let content: string;
    const cacheKey = `m3u:${url}`;
    const cached = await this.cacheService.get<string>(CacheNamespace.Playlist, cacheKey);

    if (cached) {
      content = cached;
    } else {
      content = await this.downloadService.downloadText(url, {
        timeoutMs: 120_000,
        retryAttempts: 3,
      });

      if (content.length <= MEMORY_CACHE_MAX_BYTES) {
        await this.cacheService.set(CacheNamespace.Playlist, cacheKey, content);
      }
    }

    const source: PlaylistSource = {
      type: 'url',
      label: label ?? this.extractNameFromUrl(url),
      location: url,
    };

    return this.parseContent(content, source.label, source, onProgress);
  }

  private async parseContent(
    content: string,
    name: string,
    source: PlaylistSource,
    onProgress?: (progress: ContentLoadProgress) => void,
  ): Promise<ContentLoadResult> {
    const { channels, categories } = await parseM3UAsync(content, {
      onProgress: (loaded) => onProgress?.({ loaded, total: null }),
      yieldEveryLines: 2000,
    });

    onProgress?.({ loaded: channels.length, total: channels.length });

    return { name, channels, categories, source };
  }

  private extractNameFromUrl(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const segment = pathname.split('/').filter(Boolean).pop();
      return segment ?? url;
    } catch {
      return url;
    }
  }
}

/** Registry for content providers — application resolves provider by source type. */
export class ContentProviderRegistry implements IContentProviderRegistry {
  private readonly providers = new Map<
    import('@/domain/content/IContentProvider').ContentProviderId,
    IContentProvider
  >();

  register(provider: IContentProvider): void {
    this.providers.set(provider.id, provider);
  }

  getProviderFor(sourceType: ContentSourceType): IContentProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.canHandle(sourceType)) return provider;
    }
    return null;
  }

  getProviderById(
    id: import('@/domain/content/IContentProvider').ContentProviderId,
  ): IContentProvider | null {
    return this.providers.get(id) ?? null;
  }

  getAll(): readonly IContentProvider[] {
    return [...this.providers.values()];
  }
}
