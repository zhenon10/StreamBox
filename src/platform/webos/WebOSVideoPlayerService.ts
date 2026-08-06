import type { PlaybackError, PlaybackState } from '@/domain/entities';
import type { VideoPlayerEvents, VideoPlayerService } from '../interfaces';

function mapMediaError(error: MediaError | null): PlaybackError {
  if (!error) {
    return { code: 'UNKNOWN', message: 'Unknown playback error', recoverable: true };
  }

  const messages: Record<number, string> = {
    [MediaError.MEDIA_ERR_ABORTED]: 'Playback aborted',
    [MediaError.MEDIA_ERR_NETWORK]: 'Network error during playback',
    [MediaError.MEDIA_ERR_DECODE]: 'Unable to decode stream',
    [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]: 'Stream format not supported',
  };

  const recoverable =
    error.code === MediaError.MEDIA_ERR_NETWORK ||
    error.code === MediaError.MEDIA_ERR_ABORTED;

  return {
    code: `MEDIA_${String(error.code)}`,
    message: messages[error.code] ?? 'Playback failed',
    recoverable,
  };
}

function mapReadyState(state: number): PlaybackState {
  switch (state) {
    case HTMLMediaElement.HAVE_NOTHING:
      return 'loading';
    case HTMLMediaElement.HAVE_METADATA:
      return 'buffering';
    case HTMLMediaElement.HAVE_CURRENT_DATA:
    case HTMLMediaElement.HAVE_FUTURE_DATA:
    case HTMLMediaElement.HAVE_ENOUGH_DATA:
      return 'playing';
    default:
      return 'idle';
  }
}

export class WebOSVideoPlayerService implements VideoPlayerService {
  private video: HTMLVideoElement | null = null;
  private container: HTMLElement | null = null;
  private handlers: VideoPlayerEvents = {};

  attach(container: HTMLElement): void {
    this.container = container;
    this.video = document.createElement('video');
    this.video.className = 'absolute inset-0 h-full w-full bg-black object-contain';
    this.video.playsInline = true;
    this.video.preload = 'auto';

    this.bindVideoEvents();
    container.appendChild(this.video);
  }

  detach(): void {
    if (this.video && this.container?.contains(this.video)) {
      this.container.removeChild(this.video);
    }
    this.stop();
    this.video = null;
    this.container = null;
  }

  async load(url: string, _options?: import('../interfaces').VideoLoadOptions): Promise<void> {
    if (!this.video) throw new Error('Video element not attached');
    this.handlers.onStateChange?.('loading');
    this.video.src = url;
    this.video.load();
  }

  async play(): Promise<void> {
    if (!this.video) return;
    await this.video.play();
    this.handlers.onStateChange?.('playing');
  }

  pause(): void {
    this.video?.pause();
    this.handlers.onStateChange?.('paused');
  }

  stop(): void {
    if (!this.video) return;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.handlers.onStateChange?.('idle');
  }

  seek(seconds: number): void {
    if (!this.video) return;
    this.video.currentTime = Math.max(0, seconds);
  }

  setVolume(volume: number): void {
    if (!this.video) return;
    const v = Math.min(1, Math.max(0, volume / 100));
    this.video.volume = v;
    if (v > 0) this.video.muted = false;
  }

  getVolume(): number {
    return Math.round((this.video?.volume ?? 0) * 100);
  }

  setMuted(muted: boolean): void {
    if (!this.video) return;
    this.video.muted = muted;
  }

  isMuted(): boolean {
    return this.video?.muted ?? false;
  }

  setObjectFit(fit: 'contain' | 'cover' | 'fill'): void {
    if (!this.video) return;
    this.video.style.objectFit = fit;
  }

  getCurrentTime(): number {
    return this.video?.currentTime ?? 0;
  }

  getDuration(): number {
    return this.video?.duration ?? 0;
  }

  destroy(): void {
    this.detach();
    this.handlers = {};
  }

  setEventHandlers(handlers: VideoPlayerEvents): void {
    this.handlers = handlers;
  }

  private bindVideoEvents(): void {
    if (!this.video) return;
    const video = this.video;

    video.addEventListener('playing', () => this.handlers.onStateChange?.('playing'));
    video.addEventListener('waiting', () => this.handlers.onStateChange?.('buffering'));
    video.addEventListener('pause', () => {
      if (video.ended) return;
      this.handlers.onStateChange?.('paused');
    });
    video.addEventListener('timeupdate', () => {
      this.handlers.onTimeUpdate?.(video.currentTime, video.duration || 0);
    });
    video.addEventListener('error', () => {
      this.handlers.onError?.(mapMediaError(video.error));
      this.handlers.onStateChange?.('error');
    });
    video.addEventListener('ended', () => this.handlers.onEnded?.());
    video.addEventListener('loadeddata', () => {
      this.handlers.onStateChange?.(mapReadyState(video.readyState));
    });
  }
}
