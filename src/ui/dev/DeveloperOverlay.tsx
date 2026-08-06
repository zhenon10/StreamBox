import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { services, TOKENS } from '@/application/di/container';
import type { DeveloperModeState } from '@/application/dev/DeveloperModeService';

/** Developer diagnostics overlay toggled by hidden key sequence. */
export function DeveloperOverlay(): ReactNode {
  const [state, setState] = useState<DeveloperModeState | null>(null);
  const location = useLocation();

  useEffect(() => {
    const devMode = services.resolve(TOKENS.developerMode);
    return devMode.subscribe(setState);
  }, []);

  useEffect(() => {
    const devMode = services.resolve(TOKENS.developerMode);
    devMode.updateState({ currentRoute: location.pathname });
  }, [location.pathname]);

  useEffect(() => {
    const interval = setInterval(() => {
      const perf = services.resolve(TOKENS.performanceMonitor);
      const cache = services.resolve(TOKENS.cacheService);
      const devMode = services.resolve(TOKENS.developerMode);
      const focused = document.querySelector<HTMLElement>('[data-focus-id].focused, [data-focusable="true"].focused');
      const platformCtx = services.resolve(TOKENS.platformContext) as {
        _playerType?: string;
      };
      const providers = services.resolve(TOKENS.contentProviderRegistry);
      const stats = cache.getStats();
      const avgHitRatio =
        stats.length > 0
          ? stats.reduce((sum: number, s: { hitRatio: number }) => sum + s.hitRatio, 0) / stats.length
          : 0;
      perf.recordCacheHitRatio(avgHitRatio);

      devMode.updateState({
        performance: perf.getSnapshot(),
        focusedElementId: focused?.dataset.focusId ?? null,
        activeProvider: providers.getAll()[0]?.displayName ?? null,
        activePlayer: platformCtx._playerType ?? 'unknown',
        recentEvents: services.resolve(TOKENS.eventBus).getHistory(10),
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!state?.enabled) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[9999] w-[480px] rounded-xl border border-accent-500/40 bg-surface-900/95 p-4 font-mono text-xs text-slate-300 shadow-2xl backdrop-blur">
      <div className="mb-2 text-sm font-bold text-accent-400">Developer Mode</div>
      <div className="grid grid-cols-2 gap-1">
        <span>FPS:</span>
        <span className="text-white">{state.performance?.fps ?? '—'}</span>
        <span>Memory:</span>
        <span className="text-white">
          {state.performance?.memoryMb !== null && state.performance?.memoryMb !== undefined
            ? `${state.performance.memoryMb.toFixed(1)} MB`
            : 'N/A'}
        </span>
        <span>Route:</span>
        <span className="truncate text-white">{state.currentRoute}</span>
        <span>Focus:</span>
        <span className="truncate text-white">{state.focusedElementId ?? 'none'}</span>
        <span>Provider:</span>
        <span className="text-white">{state.activeProvider ?? 'none'}</span>
        <span>Player:</span>
        <span className="text-white">{state.activePlayer ?? 'none'}</span>
        <span>Uptime:</span>
        <span className="text-white">
          {state.performance ? `${(state.performance.uptimeMs / 1000).toFixed(0)}s` : '—'}
        </span>
      </div>
      {state.performance && state.performance.metrics.length > 0 && (
        <div className="mt-3 border-t border-surface-700 pt-2">
          <div className="mb-1 font-semibold text-slate-400">Metrics</div>
          {state.performance.metrics.slice(-5).map((m, i) => (
            <div key={i} className="truncate">
              {m.name}: {m.value.toFixed(1)} {m.unit}
            </div>
          ))}
        </div>
      )}
      {state.recentEvents.length > 0 && (
        <div className="mt-3 max-h-24 overflow-y-auto border-t border-surface-700 pt-2">
          <div className="mb-1 font-semibold text-slate-400">Events</div>
          {state.recentEvents.slice(-5).map((e, i) => (
            <div key={i} className="truncate text-accent-300">
              {e.kind}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
