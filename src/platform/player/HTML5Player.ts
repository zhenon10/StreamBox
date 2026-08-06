import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import type { PlaybackError } from '@/domain/entities';
import type {
  IVideoPlayer,
  IVideoPlayerEvents,
  VideoLoadOptions,
} from '@/platform/player/IVideoPlayer';
import { VideoPlayerType } from '@/platform/player/IVideoPlayer';
import {
  buildLivePlaybackCandidates,
  buildPlaybackCandidates,
  enginesForLive,
  enginesForUrl,
  formatPlaybackFailure,
  resolveMediaFetchUrl,
  type PlaybackEngine,
} from '@/infrastructure/player/streamUrl';

function mapMediaError(error: MediaError | null): PlaybackError {
  if (!error) {
    return { code: 'UNKNOWN', message: 'Unknown playback error', recoverable: true };
  }

  const messages: Record<number, string> = {
    [MediaError.MEDIA_ERR_ABORTED]: 'Playback aborted',
    [MediaError.MEDIA_ERR_NETWORK]: 'Network error during playback',
    [MediaError.MEDIA_ERR_DECODE]: 'Unable to decode stream',
    [MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED]:
      'Stream format not supported (tarayıcı bu codec/kapsayıcıyı açamıyor)',
  };

  const recoverable = error.code === MediaError.MEDIA_ERR_NETWORK;

  return {
    code: `MEDIA_${String(error.code)}`,
    message: messages[error.code] ?? 'Playback failed',
    recoverable,
  };
}

function isPlayAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'AbortError' ||
    error.message.includes('interrupted by a call to pause') ||
    error.message.includes('interrupted by a new load request')
  );
}

function inferLive(url: string, options?: VideoLoadOptions): boolean {
  if (options?.isLive === true) return true;
  if (options?.isLive === false) return false;
  const u = url.toLowerCase();
  if (u.includes('/live/')) return true;
  if (u.includes('/movie/') || u.includes('/series/')) return false;
  // Extension-less IPTV stream without VOD path — treat as live.
  if (!/\.(mp4|mkv|m3u8|avi|m4v)(\?|$)/i.test(u)) return true;
  return false;
}

/** HTML5 + HLS.js + mpegts.js */
export class HTML5Player implements IVideoPlayer {
  readonly playerType: VideoPlayerType = VideoPlayerType.HTML5;
  protected video: HTMLVideoElement | null = null;
  protected container: HTMLElement | null = null;
  protected handlers: IVideoPlayerEvents = {};
  private hls: Hls | null = null;
  private mpegtsPlayer: ReturnType<typeof mpegts.createPlayer> | null = null;
  private loadGeneration = 0;
  private suppressErrors = false;
  private switching = false;
  private playPromise: Promise<void> | null = null;
  private liveMode = false;

  attach(container: HTMLElement): void {
    this.container = container;
    this.video = this.createVideoElement();
    this.bindVideoEvents(this.video);
    container.appendChild(this.video);
  }

  detach(): void {
    this.destroyEngines();
    if (this.video && this.container?.contains(this.video)) {
      this.container.removeChild(this.video);
    }
    void this.clearVideoSource();
    this.video = null;
    this.container = null;
  }

  async load(url: string, options?: VideoLoadOptions): Promise<void> {
    if (!this.video) throw new Error('Player not attached');
    const generation = ++this.loadGeneration;
    this.liveMode = inferLive(url, options);
    this.handlers.onStateChange?.('loading');
    this.suppressErrors = true;
    this.switching = true;
    this.destroyEngines();
    await this.clearVideoSource();

    const candidates = this.liveMode
      ? buildLivePlaybackCandidates(url)
      : buildPlaybackCandidates(url);
    let lastError: Error | null = null;

    try {
      for (const candidate of candidates) {
        if (generation !== this.loadGeneration) return;

        const engines = this.liveMode ? enginesForLive() : enginesForUrl(candidate);
        for (const engine of engines) {
          if (generation !== this.loadGeneration) return;
          try {
            await this.loadWithEngine(engine, candidate);
            this.suppressErrors = false;
            this.switching = false;
            return;
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            this.destroyEngines();
            await this.clearVideoSource();
          }
        }
      }

      throw new Error(formatPlaybackFailure(url, lastError?.message ?? 'no supported source'));
    } finally {
      if (generation === this.loadGeneration) {
        this.suppressErrors = false;
        this.switching = false;
      }
    }
  }

  async play(): Promise<void> {
    if (!this.video) return;

    const attempt = async (): Promise<void> => {
      if (this.mpegtsPlayer) {
        try {
          await this.mpegtsPlayer.play();
          this.handlers.onStateChange?.('playing');
          return;
        } catch {
          // fall through
        }
      }
      const video = this.video;
      if (!video) return;
      this.playPromise = video.play().then(() => undefined);
      await this.playPromise;
      this.playPromise = null;
    };

    for (let i = 0; i < (this.liveMode ? 5 : 2); i++) {
      try {
        await attempt();
        this.handlers.onStateChange?.('playing');
        return;
      } catch (error) {
        this.playPromise = null;
        if (isPlayAbort(error) && i < (this.liveMode ? 4 : 1)) {
          await delay(120 + i * 80);
          continue;
        }
        if (isPlayAbort(error)) {
          // Last abort — keep trying silently in background for live.
          if (this.liveMode) {
            void this.keepAlivePlay();
            return;
          }
        }
        const message = error instanceof Error ? error.message : 'Playback failed';
        if (/supported source|not supported|decode/i.test(message)) {
          throw new Error(formatPlaybackFailure(this.video.currentSrc || '', message));
        }
        throw error instanceof Error ? error : new Error(message);
      }
    }
  }

  /** Keep nudging play() for live until data flows or generation changes. */
  private async keepAlivePlay(): Promise<void> {
    const generation = this.loadGeneration;
    for (let i = 0; i < 20; i++) {
      if (generation !== this.loadGeneration || !this.video) return;
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !this.video.paused) {
        this.handlers.onStateChange?.('playing');
        return;
      }
      try {
        if (this.mpegtsPlayer) await this.mpegtsPlayer.play();
        else await this.video.play();
        this.handlers.onStateChange?.('playing');
        return;
      } catch {
        await delay(400);
      }
    }
  }

  pause(): void {
    if (this.switching) return;
    void this.awaitPlayThen(() => {
      try {
        this.mpegtsPlayer?.pause();
      } catch {
        // ignore
      }
      this.video?.pause();
      this.handlers.onStateChange?.('paused');
    });
  }

  stop(): void {
    this.destroyEngines();
    void this.clearVideoSource();
    this.handlers.onStateChange?.('idle');
  }

  seek(seconds: number): void {
    if (!this.video || this.liveMode) return;
    const target = Math.max(0, seconds);
    try {
      if (this.mpegtsPlayer && 'currentTime' in this.mpegtsPlayer) {
        (this.mpegtsPlayer as { currentTime: number }).currentTime = target;
      }
      this.video.currentTime = target;
    } catch {
      // ignore
    }
  }

  setVolume(volume: number): void {
    if (!this.video) return;
    const v = Math.min(1, Math.max(0, volume / 100));
    this.video.volume = v;
    if (v > 0) this.video.muted = false;
  }

  getVolume(): number {
    if (!this.video) return 0;
    return Math.round(this.video.volume * 100);
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
    this.loadGeneration++;
    this.suppressErrors = true;
    this.switching = true;
    this.detach();
    this.handlers = {};
  }

  setEventHandlers(handlers: IVideoPlayerEvents): void {
    this.handlers = handlers;
  }

  protected createVideoElement(): HTMLVideoElement {
    const video = document.createElement('video');
    video.className = 'absolute inset-0 h-full w-full bg-black object-contain';
    video.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000';
    video.playsInline = true;
    video.preload = 'auto';
    video.autoplay = false;
    video.muted = false;
    return video;
  }

  protected bindVideoEvents(video: HTMLVideoElement): void {
    video.addEventListener('playing', () => {
      if (this.switching) return;
      this.handlers.onStateChange?.('playing');
    });
    video.addEventListener('waiting', () => {
      if (this.switching) return;
      this.handlers.onStateChange?.('buffering');
    });
    video.addEventListener('pause', () => {
      if (this.switching || this.suppressErrors || video.ended) return;
      this.handlers.onStateChange?.('paused');
    });
    video.addEventListener('timeupdate', () => {
      this.handlers.onTimeUpdate?.(video.currentTime, video.duration || 0);
    });
    video.addEventListener('error', () => {
      if (this.suppressErrors || this.switching || !video.error) return;
      if (video.error.code === MediaError.MEDIA_ERR_ABORTED) return;
      this.handlers.onError?.(mapMediaError(video.error));
      this.handlers.onStateChange?.('error');
    });
    video.addEventListener('ended', () => this.handlers.onEnded?.());
  }

  private async awaitPlayThen(fn: () => void): Promise<void> {
    if (this.playPromise) {
      try {
        await this.playPromise;
      } catch {
        // ignore
      }
      this.playPromise = null;
    }
    fn();
  }

  private async clearVideoSource(): Promise<void> {
    if (!this.video) return;
    await this.awaitPlayThen(() => {
      try {
        this.video?.pause();
      } catch {
        // ignore
      }
    });
    if (!this.video) return;
    this.video.removeAttribute('src');
    try {
      this.video.load();
    } catch {
      // ignore
    }
  }

  private async loadWithEngine(engine: PlaybackEngine, url: string): Promise<void> {
    switch (engine) {
      case 'hls':
        await this.loadHls(url);
        return;
      case 'mpegts':
        if (!mpegts.isSupported()) throw new Error('MPEG-TS not supported');
        await this.loadMpegTs(url);
        return;
      case 'native':
        await this.loadNative(url);
        return;
    }
  }

  private async loadNative(url: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');

    // Live almost never works as native progressive — fail fast.
    if (this.liveMode) {
      throw new Error('Native engine skipped for live');
    }

    const urls =
      import.meta.env.DEV && /^https?:\/\//i.test(url)
        ? [url, resolveMediaFetchUrl(url)]
        : [url];

    let lastError: Error | null = null;
    for (const src of urls) {
      try {
        await this.loadNativeOnce(src);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await this.clearVideoSource();
      }
    }
    throw lastError ?? new Error('Native playback failed');
  }

  private async loadNativeOnce(url: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Native load timeout'));
      }, 12_000);

      const onError = (): void => {
        cleanup();
        reject(new Error(video.error?.message ?? 'Native playback failed'));
      };
      const onReady = (): void => {
        cleanup();
        resolve();
      };
      const cleanup = (): void => {
        window.clearTimeout(timer);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
      };

      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
      video.src = url;
      video.load();
    });
  }

  private async loadHls(url: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');

    if (video.canPlayType('application/vnd.apple.mpegurl') && !import.meta.env.DEV) {
      await this.loadNativeOnce(url);
      return;
    }

    if (!Hls.isSupported()) throw new Error('HLS.js not supported');

    const BaseLoader = Hls.DefaultConfig.loader;

    class ProxiedLoader extends BaseLoader {
      load(
        context: Parameters<InstanceType<typeof BaseLoader>['load']>[0],
        config: Parameters<InstanceType<typeof BaseLoader>['load']>[1],
        callbacks: Parameters<InstanceType<typeof BaseLoader>['load']>[2],
      ): void {
        context.url = resolveMediaFetchUrl(context.url);
        super.load(context, config, callbacks);
      }
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: this.liveMode,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
        maxBufferLength: this.liveMode ? 10 : 30,
        maxMaxBufferLength: this.liveMode ? 20 : 60,
        loader: ProxiedLoader,
      });

      this.hls = hls;

      const timer = window.setTimeout(() => {
        finish(() => reject(new Error('HLS load timeout')));
      }, this.liveMode ? 10_000 : 15_000);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        window.clearTimeout(timer);
        finish(resolve);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        window.clearTimeout(timer);
        finish(() => reject(new Error(data.details || 'HLS playback failed')));
      });

      hls.loadSource(resolveMediaFetchUrl(url));
      hls.attachMedia(video);
    });
  }

  private async loadMpegTs(url: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');
    if (!mpegts.isSupported()) throw new Error('MPEG-TS not supported in this browser');

    const isLive = this.liveMode || /\/live\//i.test(url);
    const generation = this.loadGeneration;

    // Prefer proxied URL in browser DEV (CORS). Try direct first on non-dev.
    const urlsToTry = import.meta.env.DEV
      ? [resolveMediaFetchUrl(url), url]
      : [url, resolveMediaFetchUrl(url)];

    let lastError: Error | null = null;
    for (const fetchUrl of urlsToTry) {
      if (generation !== this.loadGeneration) return;
      try {
        await this.loadMpegTsOnce(fetchUrl, isLive, generation);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.destroyEngines();
      }
    }
    throw lastError ?? new Error('MPEG-TS load failed');
  }

  private async loadMpegTsOnce(
    fetchUrl: string,
    isLive: boolean,
    generation: number,
  ): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void): void => {
        if (settled || generation !== this.loadGeneration) return;
        settled = true;
        fn();
      };

      const player = mpegts.createPlayer(
        {
          type: 'mse',
          isLive,
          url: fetchUrl,
          hasAudio: true,
          hasVideo: true,
        },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: isLive ? 384 : 512,
          liveBufferLatencyChasing: isLive,
          liveBufferLatencyMaxLatency: 5,
          liveBufferLatencyMinRemain: 1,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
          fixAudioTimestampGap: true,
        },
      );

      this.mpegtsPlayer = player;
      player.attachMediaElement(video);

      // Live: don't wait forever for MEDIA_INFO — start ASAP so play() can pull data.
      const timer = window.setTimeout(() => {
        if (isLive) {
          finish(resolve);
        } else if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          finish(resolve);
        } else {
          finish(() => reject(new Error('MPEG-TS load timeout')));
        }
      }, isLive ? 2_500 : 10_000);

      player.on(mpegts.Events.ERROR, (...args: unknown[]) => {
        window.clearTimeout(timer);
        finish(() => reject(new Error(`MPEG-TS error: ${args.map(String).join(' ')}`)));
      });
      player.on(mpegts.Events.MEDIA_INFO, () => {
        window.clearTimeout(timer);
        finish(resolve);
      });
      video.addEventListener(
        'canplay',
        () => {
          window.clearTimeout(timer);
          finish(resolve);
        },
        { once: true },
      );

      try {
        player.load();
      } catch (error) {
        window.clearTimeout(timer);
        finish(() =>
          reject(error instanceof Error ? error : new Error(String(error))),
        );
      }
    });
  }

  private destroyEngines(): void {
    if (this.hls) {
      try {
        this.hls.destroy();
      } catch {
        // ignore
      }
      this.hls = null;
    }
    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.pause();
        this.mpegtsPlayer.unload();
        this.mpegtsPlayer.detachMediaElement();
        this.mpegtsPlayer.destroy();
      } catch {
        // ignore
      }
      this.mpegtsPlayer = null;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
