import type { ApplicationEvent } from '@/domain/events/ApplicationEvent';
import type { PerformanceSnapshot } from '@/application/performance/PerformanceMonitor';

export const DeveloperKey = {
  ArrowUp: 'ArrowUp',
  ArrowDown: 'ArrowDown',
  ArrowLeft: 'ArrowLeft',
  ArrowRight: 'ArrowRight',
  Enter: 'Enter',
} as const;

/** Hidden key sequence: Up Up Down Down Left Right Enter */
const ACTIVATION_SEQUENCE: readonly string[] = [
  DeveloperKey.ArrowUp,
  DeveloperKey.ArrowUp,
  DeveloperKey.ArrowDown,
  DeveloperKey.ArrowDown,
  DeveloperKey.ArrowLeft,
  DeveloperKey.ArrowRight,
  DeveloperKey.Enter,
];

export interface DeveloperModeState {
  readonly enabled: boolean;
  readonly currentRoute: string;
  readonly focusedElementId: string | null;
  readonly activeProvider: string | null;
  readonly activePlayer: string | null;
  readonly performance: PerformanceSnapshot | null;
  readonly recentEvents: readonly ApplicationEvent[];
}

type DeveloperModeListener = (state: DeveloperModeState) => void;

/** Developer overlay controller toggled by hidden remote key sequence. */
export class DeveloperModeService {
  private enabled = false;
  private sequenceIndex = 0;
  private lastKeyTime = 0;
  private readonly listeners = new Set<DeveloperModeListener>();
  private state: DeveloperModeState = {
    enabled: false,
    currentRoute: '/',
    focusedElementId: null,
    activeProvider: null,
    activePlayer: null,
    performance: null,
    recentEvents: [],
  };

  private static readonly SEQUENCE_TIMEOUT_MS = 3000;

  toggle(): void {
    this.enabled = !this.enabled;
    this.updateState({ enabled: this.enabled });
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  handleKey(key: string): boolean {
    const now = Date.now();
    if (now - this.lastKeyTime > DeveloperModeService.SEQUENCE_TIMEOUT_MS) {
      this.sequenceIndex = 0;
    }
    this.lastKeyTime = now;

    const expected = ACTIVATION_SEQUENCE[this.sequenceIndex];
    if (key === expected) {
      this.sequenceIndex++;
      if (this.sequenceIndex >= ACTIVATION_SEQUENCE.length) {
        this.sequenceIndex = 0;
        this.toggle();
        return true;
      }
    } else {
      this.sequenceIndex = key === ACTIVATION_SEQUENCE[0] ? 1 : 0;
    }
    return false;
  }

  updateState(partial: Partial<DeveloperModeState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  getState(): DeveloperModeState {
    return this.state;
  }

  subscribe(listener: DeveloperModeListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }
}
