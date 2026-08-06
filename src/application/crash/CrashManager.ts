import { EventKind, type IEventPublisher } from '@/domain/events/ApplicationEvent';
import type { Logger } from '@/infrastructure/logging/Logger';

export interface CrashReport {
  readonly id: string;
  readonly message: string;
  readonly stack: string | null;
  readonly timestamp: number;
  readonly source: 'error' | 'unhandledrejection' | 'react';
  readonly recoverable: boolean;
}

export interface CrashRecoveryState {
  readonly route: string;
  readonly timestamp: number;
}

type CrashListener = (report: CrashReport) => void;

/** Catches unhandled errors, persists state, and enables module recovery. */
export class CrashManager {
  private readonly reports: CrashReport[] = [];
  private readonly listeners = new Set<CrashListener>();
  private crashScreenVisible = false;
  private recoveryHandlers: (() => void)[] = [];
  private reportCounter = 0;

  constructor(
    private readonly logger: Logger,
    private readonly _eventPublisher?: IEventPublisher,
  ) {}

  initialize(): void {
    window.addEventListener('error', (event) => {
      this.handleError(event.error instanceof Error ? event.error : new Error(event.message), 'error');
    });

    window.addEventListener('unhandledrejection', (event) => {
      const error =
        event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      if (isIgnorableMediaError(error)) {
        event.preventDefault();
        return;
      }
      this.handleError(error, 'unhandledrejection');
    });

    this.logger.info('CrashManager initialized', 'CrashManager');
  }

  registerRecoveryHandler(handler: () => void): () => void {
    this.recoveryHandlers.push(handler);
    return () => {
      this.recoveryHandlers = this.recoveryHandlers.filter((h) => h !== handler);
    };
  }

  reportReactError(error: Error): void {
    this.handleError(error, 'react', true);
  }

  handleError(error: Error, source: CrashReport['source'], recoverable = true): CrashReport {
    this.reportCounter++;
    const report: CrashReport = {
      id: `crash_${String(this.reportCounter)}`,
      message: error.message,
      stack: error.stack ?? null,
      timestamp: Date.now(),
      source,
      recoverable,
    };

    this.reports.push(report);
    if (this.reports.length > 50) this.reports.shift();

    this.logger.critical(`Crash: ${error.message}`, error, 'CrashManager');
    this._eventPublisher?.publish(EventKind.PlaybackError, {
      channelId: null,
      error: { code: 'CRASH', message: error.message, recoverable: recoverable },
    });
    this.crashScreenVisible = true;

    for (const listener of this.listeners) {
      listener(report);
    }

    this.persistRecoveryState();

    return report;
  }

  async recover(): Promise<void> {
    this.logger.info('Attempting crash recovery', 'CrashManager');

    for (const handler of this.recoveryHandlers) {
      try {
        handler();
      } catch (error) {
        this.logger.error('Recovery handler failed', error instanceof Error ? error : undefined, 'CrashManager');
      }
    }

    this.crashScreenVisible = false;
    this.logger.info('Crash recovery completed', 'CrashManager');
  }

  dismissCrashScreen(): void {
    this.crashScreenVisible = false;
  }

  isCrashScreenVisible(): boolean {
    return this.crashScreenVisible;
  }

  getReports(limit = 20): readonly CrashReport[] {
    return this.reports.slice(-limit);
  }

  onCrash(listener: CrashListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  saveRecoveryState(route: string): void {
    const state: CrashRecoveryState = { route, timestamp: Date.now() };
    try {
      sessionStorage.setItem('streambox:recovery', JSON.stringify(state));
    } catch {
      // Storage may be unavailable.
    }
  }

  loadRecoveryState(): CrashRecoveryState | null {
    try {
      const raw = sessionStorage.getItem('streambox:recovery');
      if (!raw) return null;
      return JSON.parse(raw) as CrashRecoveryState;
    } catch {
      return null;
    }
  }

  private persistRecoveryState(): void {
    this.saveRecoveryState(window.location.hash || '/');
  }
}

function isIgnorableMediaError(error: Error): boolean {
  const name = error.name;
  return (
    name === 'AbortError' ||
    name === 'NotSupportedError' ||
    name === 'NotAllowedError' ||
    error.message.includes('play() request was interrupted') ||
    error.message.includes('no supported source was found')
  );
}

export function createCrashRecoveryPublisher(eventPublisher: IEventPublisher): () => void {
  return () => {
    eventPublisher.publish(EventKind.ApplicationStarted, { platform: 'recovery' });
  };
}
