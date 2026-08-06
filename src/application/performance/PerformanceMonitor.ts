export const MetricName = {
  StartupTime: 'startupTime',
  FrameDrop: 'frameDrop',
  MemoryUsage: 'memoryUsage',
  PlaylistParseDuration: 'playlistParseDuration',
  PlayerStartupLatency: 'playerStartupLatency',
  ChannelSwitchDuration: 'channelSwitchDuration',
  CacheHitRatio: 'cacheHitRatio',
} as const;

export type MetricName = (typeof MetricName)[keyof typeof MetricName];

export interface MetricEntry {
  readonly name: MetricName;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: number;
  readonly tags?: Record<string, string>;
}

export interface PerformanceSnapshot {
  readonly metrics: readonly MetricEntry[];
  readonly fps: number;
  readonly memoryMb: number | null;
  readonly uptimeMs: number;
}

/** Tracks application performance metrics for developer diagnostics. */
export class PerformanceMonitor {
  private readonly metrics: MetricEntry[] = [];
  private readonly marks = new Map<string, number>();
  private readonly startTime = performance.now();
  private frameCount = 0;
  private lastFpsUpdate = performance.now();
  private currentFps = 60;
  private rafId: number | null = null;

  startFrameTracking(): void {
    const tick = (): void => {
      this.frameCount++;
      const now = performance.now();
      if (now - this.lastFpsUpdate >= 1000) {
        this.currentFps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsUpdate = now;
        this.record(MetricName.FrameDrop, Math.max(0, 60 - this.currentFps), 'fps-drop');
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stopFrameTracking(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: MetricName, startMark: string, unit = 'ms'): number {
    const start = this.marks.get(startMark);
    if (start === undefined) return 0;
    const duration = performance.now() - start;
    this.record(name, duration, unit);
    this.marks.delete(startMark);
    return duration;
  }

  record(name: MetricName, value: number, unit: string, tags?: Record<string, string>): void {
    this.metrics.push({
      name,
      value,
      unit,
      timestamp: Date.now(),
      ...(tags !== undefined ? { tags } : {}),
    });
    if (this.metrics.length > 500) {
      this.metrics.shift();
    }
  }

  recordCacheHitRatio(ratio: number): void {
    this.record(MetricName.CacheHitRatio, ratio, 'ratio');
  }

  getSnapshot(): PerformanceSnapshot {
    return {
      metrics: [...this.metrics],
      fps: this.currentFps,
      memoryMb: this.getMemoryUsageMb(),
      uptimeMs: performance.now() - this.startTime,
    };
  }

  getMetrics(name?: MetricName): readonly MetricEntry[] {
    if (name) return this.metrics.filter((m) => m.name === name);
    return [...this.metrics];
  }

  private getMemoryUsageMb(): number | null {
    const perf = performance as Performance & {
      memory?: { usedJSHeapSize: number };
    };
    if (perf.memory) {
      return perf.memory.usedJSHeapSize / (1024 * 1024);
    }
    return null;
  }
}
