import type { AppSettings, PlaybackError, PlaybackState } from '@/domain/entities';
import type { IVideoPlayer } from '@/platform/player/IVideoPlayer';
import type { VideoPlayerService } from '@/platform/interfaces';
import { EventKind, type IEventPublisher } from '@/domain/events/ApplicationEvent';
import type { ChannelId } from '@/domain/entities';

export interface PlaybackControllerOptions {
  readonly autoReconnect: boolean;
  readonly reconnectAttempts: number;
  readonly reconnectDelayMs: number;
  readonly defaultVolume: number;
}

export class PlaybackController {
  private reconnectCount = 0;
  private currentUrl: string | null = null;
  private currentChannelId: ChannelId | null = null;
  private destroyed = false;
  private liveHint = false;
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private lastTime = 0;
  private stallTicks = 0;

  constructor(
    private readonly player: IVideoPlayer | VideoPlayerService,
    private readonly options: PlaybackControllerOptions,
    private readonly callbacks: {
      onStateChange: (state: PlaybackState) => void;
      onError: (error: PlaybackError) => void;
      onTimeUpdate: (current: number, duration: number) => void;
    },
    private readonly eventPublisher?: IEventPublisher,
  ) {
    this.player.setEventHandlers({
      onStateChange: (state) => {
        this.callbacks.onStateChange(state);
        this.publishPlaybackState(state);
      },
      onTimeUpdate: (current, duration) => {
        this.callbacks.onTimeUpdate(current, duration);
      },
      onError: (error) => {
        if (error.code === 'MEDIA_1' || error.code.includes('ABORT')) {
          this.callbacks.onError(error);
          return;
        }
        this.callbacks.onError(error);
        this.eventPublisher?.publish(EventKind.PlaybackError, {
          channelId: this.currentChannelId,
          error,
        });
        if (error.recoverable && this.options.autoReconnect) {
          void this.attemptReconnect();
        }
      },
      onEnded: () => {
        this.clearStallWatchdog();
        this.callbacks.onStateChange('idle');
        if (this.currentChannelId) {
          this.eventPublisher?.publish(EventKind.PlaybackStopped, {
            channelId: this.currentChannelId,
          });
        }
      },
    });
  }

  attach(container: HTMLElement): void {
    this.player.attach(container);
    this.player.setVolume(this.options.defaultVolume);
  }

  async play(
    url: string,
    channelId?: ChannelId,
    channelName?: string,
    options?: { isLive?: boolean },
  ): Promise<void> {
    this.clearStallWatchdog();
    this.currentUrl = url;
    this.currentChannelId = channelId ?? null;
    this.reconnectCount = 0;
    this.liveHint = options?.isLive === true || /\/live\//i.test(url);
    this.lastTime = 0;
    this.stallTicks = 0;
    this.callbacks.onStateChange('loading');
    await this.player.load(url, { isLive: this.liveHint });
    if (this.destroyed) return;

    try {
      await this.player.play();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes('interrupted') ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        await delay(100);
        if (this.destroyed) return;
        await this.player.play();
      } else {
        throw error;
      }
    }

    this.startStallWatchdog();

    if (channelId && channelName) {
      this.eventPublisher?.publish(EventKind.PlaybackStarted, {
        channelId,
        channelName,
        url,
      });
    }
  }

  pause(): void {
    this.clearStallWatchdog();
    this.player.pause();
    if (this.currentChannelId) {
      this.eventPublisher?.publish(EventKind.PlaybackPaused, {
        channelId: this.currentChannelId,
        currentTime: this.player.getCurrentTime(),
      });
    }
  }

  resume(): void {
    void this.player.play();
    this.startStallWatchdog();
    if (this.currentChannelId) {
      this.eventPublisher?.publish(EventKind.PlaybackResumed, {
        channelId: this.currentChannelId,
        currentTime: this.player.getCurrentTime(),
      });
    }
  }

  stop(): void {
    this.clearStallWatchdog();
    const channelId = this.currentChannelId;
    this.currentUrl = null;
    this.currentChannelId = null;
    this.player.stop();
    if (channelId) {
      this.eventPublisher?.publish(EventKind.PlaybackStopped, { channelId });
    }
  }

  seek(seconds: number): void {
    this.player.seek(seconds);
  }

  setVolume(volume: number): void {
    this.player.setVolume(volume);
  }

  getVolume(): number {
    return this.player.getVolume();
  }

  setMuted(muted: boolean): void {
    this.player.setMuted(muted);
  }

  isMuted(): boolean {
    return this.player.isMuted();
  }

  toggleMute(): boolean {
    const next = !this.player.isMuted();
    this.player.setMuted(next);
    return next;
  }

  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void {
    this.player.setObjectFit(fit);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearStallWatchdog();
    this.player.destroy();
  }

  private startStallWatchdog(): void {
    this.clearStallWatchdog();
    if (!this.liveHint) return;

    this.stallTimer = setInterval(() => {
      if (this.destroyed || !this.currentUrl) return;
      const t = this.player.getCurrentTime();
      if (t > this.lastTime + 0.15) {
        this.lastTime = t;
        this.stallTicks = 0;
        return;
      }
      this.stallTicks++;
      // ~12s without progress while "playing/buffering"
      if (this.stallTicks >= 6) {
        this.stallTicks = 0;
        void this.attemptReconnect();
      }
    }, 2_000);
  }

  private clearStallWatchdog(): void {
    if (this.stallTimer) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private publishPlaybackState(state: PlaybackState): void {
    if (state === 'paused' && this.currentChannelId) {
      this.eventPublisher?.publish(EventKind.PlaybackPaused, {
        channelId: this.currentChannelId,
        currentTime: this.player.getCurrentTime(),
      });
    }
    if (state === 'playing' && this.currentChannelId) {
      this.eventPublisher?.publish(EventKind.PlaybackResumed, {
        channelId: this.currentChannelId,
        currentTime: this.player.getCurrentTime(),
      });
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.destroyed || !this.currentUrl) return;
    if (this.reconnectCount >= this.options.reconnectAttempts) {
      this.callbacks.onStateChange('error');
      this.callbacks.onError({
        code: 'STALL',
        message: 'Canlı yayın yanıt vermiyor. Yeniden deneyin.',
        recoverable: true,
      });
      return;
    }

    this.reconnectCount++;
    this.callbacks.onStateChange('reconnecting');
    this.clearStallWatchdog();

    await delay(this.options.reconnectDelayMs);

    if (this.destroyed || !this.currentUrl) return;

    try {
      await this.player.load(this.currentUrl, { isLive: this.liveHint });
      await this.player.play();
      this.callbacks.onStateChange('playing');
      this.lastTime = 0;
      this.stallTicks = 0;
      this.startStallWatchdog();
    } catch {
      void this.attemptReconnect();
    }
  }
}

export function createPlaybackOptions(settings: AppSettings): PlaybackControllerOptions {
  return {
    autoReconnect: settings.autoReconnect,
    reconnectAttempts: settings.reconnectAttempts,
    reconnectDelayMs: settings.reconnectDelayMs,
    defaultVolume: settings.defaultVolume,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
