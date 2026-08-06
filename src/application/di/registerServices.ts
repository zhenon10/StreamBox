import { detectPlatformType } from '@/platform/detectPlatform';
import { getPlatform } from '@/platform';
import { ChannelIndex } from '@/infrastructure/indexing/ChannelIndex';
import {
  LocalStorageFavoritesRepository,
  LocalStorageHistoryRepository,
  LocalStorageRecentPlaylistsRepository,
  LocalStorageSettingsRepository,
} from '@/infrastructure/storage/LocalStorageRepositories';
import { createPlaylistRepository } from '@/infrastructure/storage/IndexedDBPlaylistRepository';
import { ChannelRepository } from '@/infrastructure/repositories/ChannelRepository';
import { EventBus, EventPublisher, EventSubscriber } from '@/application/events/EventBus';
import { LoggerFactory } from '@/infrastructure/logging/Logger';
import { CacheService } from '@/application/cache/CacheService';
import { DownloadService } from '@/application/download/DownloadService';
import { CrashManager } from '@/application/crash/CrashManager';
import { BackgroundTaskScheduler } from '@/application/scheduler/BackgroundTaskScheduler';
import { PerformanceMonitor } from '@/application/performance/PerformanceMonitor';
import { ThemeService } from '@/application/theme/ThemeService';
import { DeveloperModeService } from '@/application/dev/DeveloperModeService';
import { NavigationGraphManager } from '@/ui/navigation/NavigationGraph';
import {
  ContentProviderRegistry,
  M3UContentProvider,
} from '@/infrastructure/content/M3UContentProvider';
import {
  VideoPlayerFactory,
  VideoPlayerServiceAdapter,
} from '@/platform/player/WebOSPlayer';
import { ServiceRegistry, ServiceProvider, ServiceLifetime } from './ServiceRegistry';
import { TOKENS } from './tokens';
import type { IRepositoryBundle } from '@/domain/repositories/IChannelRepository';
import type { PlatformContext } from '@/platform/interfaces';
import { HttpLicenseClient } from '@/infrastructure/license/HttpLicenseClient';
import { LicenseStore } from '@/infrastructure/license/LicenseStore';

let providerInstance: ServiceProvider | null = null;

function createRegistry(): ServiceRegistry {
  const registry = new ServiceRegistry();

  registry.register(
    TOKENS.platformContext,
    () => {
      const ctx = getPlatform();
      const platformType = detectPlatformType();
      const playerFactory = new VideoPlayerFactory(platformType);
      const player = playerFactory.create();
      const videoPlayer = new VideoPlayerServiceAdapter(player);

      return {
        ...ctx,
        videoPlayer,
        _videoPlayerImpl: player,
        _playerType: player.playerType,
      } as PlatformContext & { _videoPlayerImpl: unknown; _playerType: string };
    },
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.channelIndex,
    () => new ChannelIndex(),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.repositories,
    (provider) => {
      const platformCtx = provider.resolve(TOKENS.platformContext);
      const index = provider.resolve(TOKENS.channelIndex);
      return {
        playlists: createPlaylistRepository(platformCtx.storage),
        favorites: new LocalStorageFavoritesRepository(platformCtx.storage),
        history: new LocalStorageHistoryRepository(platformCtx.storage),
        recentPlaylists: new LocalStorageRecentPlaylistsRepository(platformCtx.storage),
        settings: new LocalStorageSettingsRepository(platformCtx.storage),
        channels: new ChannelRepository(index),
      } satisfies IRepositoryBundle;
    },
    ServiceLifetime.Singleton,
  );

  registry.register(TOKENS.eventBus, () => new EventBus(), ServiceLifetime.Singleton);

  registry.register(
    TOKENS.eventPublisher,
    (p) => new EventPublisher(p.resolve(TOKENS.eventBus)),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.eventSubscriber,
    (p) => new EventSubscriber(p.resolve(TOKENS.eventBus)),
    ServiceLifetime.Singleton,
  );

  registry.register(TOKENS.loggerFactory, () => new LoggerFactory(), ServiceLifetime.Singleton);

  registry.register(
    TOKENS.logger,
    (p) => p.resolve(TOKENS.loggerFactory).create('StreamBox'),
    ServiceLifetime.Singleton,
  );

  registry.register(TOKENS.cacheService, () => new CacheService(), ServiceLifetime.Singleton);

  registry.register(
    TOKENS.downloadService,
    () => new DownloadService(),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.crashManager,
    (p) => new CrashManager(p.resolve(TOKENS.logger), p.resolve(TOKENS.eventPublisher)),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.taskScheduler,
    () => new BackgroundTaskScheduler(),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.performanceMonitor,
    () => new PerformanceMonitor(),
    ServiceLifetime.Singleton,
  );

  registry.register(TOKENS.themeService, () => new ThemeService(), ServiceLifetime.Singleton);

  registry.register(
    TOKENS.developerMode,
    () => new DeveloperModeService(),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.navigationGraph,
    () => new NavigationGraphManager(),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.contentProviderRegistry,
    (p) => {
      const reg = new ContentProviderRegistry();
      reg.register(
        new M3UContentProvider(
          p.resolve(TOKENS.platformContext).filePicker,
          p.resolve(TOKENS.downloadService),
          p.resolve(TOKENS.cacheService),
          p.resolve(TOKENS.logger),
        ),
      );
      return reg;
    },
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.videoPlayerFactory,
    () => new VideoPlayerFactory(detectPlatformType()),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.licenseClient,
    (p) => new HttpLicenseClient(p.resolve(TOKENS.platformContext).network),
    ServiceLifetime.Singleton,
  );

  registry.register(
    TOKENS.licenseStore,
    (p) => new LicenseStore(p.resolve(TOKENS.platformContext).storage),
    ServiceLifetime.Singleton,
  );

  return registry;
}

export function getServiceProvider(): ServiceProvider {
  if (!providerInstance) {
    providerInstance = new ServiceProvider(createRegistry());
  }
  return providerInstance;
}

export function resetServiceProvider(): void {
  providerInstance = null;
}

export function registerServices(): ServiceProvider {
  return getServiceProvider();
}
