import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initializePlatform, getPlatform } from '@/platform';
import { registerServices, services, repositories, TOKENS } from '@/application/di/container';
import { clearLegacyPlaylistStorage } from '@/infrastructure/storage/clearLegacyStorage';
import { usePlaylistStore } from '@/application/stores/playlistStore';
import { App } from '@/app/App';
import { EventKind } from '@/domain/events/ApplicationEvent';
import { MetricName, type PerformanceMonitor } from '@/application/performance/PerformanceMonitor';
import './index.css';

async function bootstrap(): Promise<void> {
  const perfMonitor = registerServices().resolve(TOKENS.performanceMonitor) as PerformanceMonitor;
  perfMonitor.mark('bootstrap-start');

  await initializePlatform();
  await clearLegacyPlaylistStorage(getPlatform().storage);

  const logger = services.resolve(TOKENS.logger);
  const eventPublisher = services.resolve(TOKENS.eventPublisher);
  const themeService = services.resolve(TOKENS.themeService);
  const crashManager = services.resolve(TOKENS.crashManager);

  crashManager.onCrash((report: import('@/application/crash/CrashManager').CrashReport) => {
    logger.critical(`Unhandled crash: ${report.message}`, undefined, 'Bootstrap');
  });

  themeService.initialize();

  const settings = await repositories.settings.get();
  usePlaylistStore.getState().setSettings(settings);

  eventPublisher.publish(EventKind.SettingsChanged, { settings });

  const platformCtx = services.resolve(TOKENS.platformContext);
  eventPublisher.publish(EventKind.PlatformReady, {
    platform: platformCtx.platform.getDeviceInfo().platform,
    osVersion: platformCtx.platform.getDeviceInfo().osVersion,
  });

  perfMonitor.measure(MetricName.StartupTime, 'bootstrap-start', 'ms');
  logger.info('Bootstrap complete', 'Bootstrap');

  const root = document.getElementById('root');
  if (!root) throw new Error('Root element not found');

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
