import { useEffect, type ReactNode } from 'react';
import { services, TOKENS } from '@/application/di/container';
import { TaskPriority } from '@/application/scheduler/BackgroundTaskScheduler';
import { MetricName } from '@/application/performance/PerformanceMonitor';
import { EventKind } from '@/domain/events/ApplicationEvent';
import { ThemeId } from '@/application/theme/ThemeService';

interface AppProvidersProps {
  readonly children: ReactNode;
}

/** Initializes enterprise services and schedules background maintenance. */
export function AppProviders({ children }: AppProvidersProps): ReactNode {
  useEffect(() => {
    const logger = services.resolve(TOKENS.logger);
    const crashManager = services.resolve(TOKENS.crashManager);
    const themeService = services.resolve(TOKENS.themeService);
    const perfMonitor = services.resolve(TOKENS.performanceMonitor);
    const taskScheduler = services.resolve(TOKENS.taskScheduler);
    const cacheService = services.resolve(TOKENS.cacheService);
    const eventPublisher = services.resolve(TOKENS.eventPublisher);
    const eventSubscriber = services.resolve(TOKENS.eventSubscriber);
    const platformCtx = services.resolve(TOKENS.platformContext);

    crashManager.initialize();
    themeService.initialize(ThemeId.Dark);
    perfMonitor.startFrameTracking();
    perfMonitor.mark('app-start');

    eventPublisher.publish(EventKind.ApplicationStarted, {
      platform: platformCtx.platform.getDeviceInfo().platform,
    });

    eventPublisher.publish(EventKind.PlatformReady, {
      platform: platformCtx.platform.getDeviceInfo().platform,
      osVersion: platformCtx.platform.getDeviceInfo().osVersion,
    });

    perfMonitor.record(MetricName.StartupTime, performance.now(), 'ms');

    const cacheCleanup = taskScheduler.schedule({
      name: 'cache-eviction',
      priority: TaskPriority.Low,
      intervalMs: 300_000,
      execute: async () => {
        const evicted = cacheService.evictExpired();
        logger.debug(`Evicted ${String(evicted)} expired cache entries`, 'CacheCleanup');
      },
    });

    const networkListener = (): void => {
      eventPublisher.publish(EventKind.NetworkConnected, {});
    };
    const offlineListener = (): void => {
      eventPublisher.publish(EventKind.NetworkDisconnected, {});
    };
    window.addEventListener('online', networkListener);
    window.addEventListener('offline', offlineListener);

    const devEventLog = eventSubscriber.onAll((event: import('@/domain/events/ApplicationEvent').ApplicationEvent) => {
      logger.trace(`Event: ${event.kind}`, 'EventBus');
    });

    crashManager.registerRecoveryHandler(() => {
      cacheService.evictExpired();
    });

    logger.info('Enterprise services initialized', 'AppProviders');

    return () => {
      cacheCleanup.cancel();
      window.removeEventListener('online', networkListener);
      window.removeEventListener('offline', offlineListener);
      devEventLog();
      perfMonitor.stopFrameTracking();
      eventPublisher.publish(EventKind.ApplicationClosed, {});
    };
  }, []);

  return children;
}
