import { createToken } from './ServiceRegistry';
import type { PlatformContext } from '@/platform/interfaces';
import type { IEventBus } from '@/domain/events/ApplicationEvent';
import type { IContentProviderRegistry } from '@/domain/content/IContentProvider';
import type { IRepositoryBundle } from '@/domain/repositories/IChannelRepository';
import type { IChannelIndex } from '@/domain/repositories';
import type { Logger } from '@/infrastructure/logging/Logger';
import type { LoggerFactory } from '@/infrastructure/logging/Logger';
import type { CacheService } from '@/application/cache/CacheService';
import type { DownloadService } from '@/application/download/DownloadService';
import type { CrashManager } from '@/application/crash/CrashManager';
import type { BackgroundTaskScheduler } from '@/application/scheduler/BackgroundTaskScheduler';
import type { PerformanceMonitor } from '@/application/performance/PerformanceMonitor';
import type { ThemeService } from '@/application/theme/ThemeService';
import type { DeveloperModeService } from '@/application/dev/DeveloperModeService';
import type { NavigationGraphManager } from '@/ui/navigation/NavigationGraph';
import type { EventPublisher } from '@/application/events/EventBus';
import type { EventSubscriber } from '@/application/events/EventBus';
import type { IVideoPlayerFactory } from '@/platform/player/IVideoPlayer';
import type { ILicenseClient } from '@/domain/license/ILicenseClient';
import type { LicenseStore } from '@/infrastructure/license/LicenseStore';

export const TOKENS = {
  platformContext: createToken<PlatformContext>('PlatformContext'),
  repositories: createToken<IRepositoryBundle>('Repositories'),
  channelIndex: createToken<IChannelIndex>('ChannelIndex'),
  eventBus: createToken<IEventBus>('EventBus'),
  eventPublisher: createToken<EventPublisher>('EventPublisher'),
  eventSubscriber: createToken<EventSubscriber>('EventSubscriber'),
  loggerFactory: createToken<LoggerFactory>('LoggerFactory'),
  logger: createToken<Logger>('Logger'),
  cacheService: createToken<CacheService>('CacheService'),
  downloadService: createToken<DownloadService>('DownloadService'),
  crashManager: createToken<CrashManager>('CrashManager'),
  taskScheduler: createToken<BackgroundTaskScheduler>('BackgroundTaskScheduler'),
  performanceMonitor: createToken<PerformanceMonitor>('PerformanceMonitor'),
  themeService: createToken<ThemeService>('ThemeService'),
  developerMode: createToken<DeveloperModeService>('DeveloperModeService'),
  navigationGraph: createToken<NavigationGraphManager>('NavigationGraphManager'),
  contentProviderRegistry: createToken<IContentProviderRegistry>('ContentProviderRegistry'),
  videoPlayerFactory: createToken<IVideoPlayerFactory>('VideoPlayerFactory'),
  licenseClient: createToken<ILicenseClient>('LicenseClient'),
  licenseStore: createToken<LicenseStore>('LicenseStore'),
} as const;
