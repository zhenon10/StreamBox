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
  isWebPageStreamUrl,
  isRemuxUrl,
  resolveMediaFetchUrl,
  type PlaybackEngine,
} from '@/infrastructure/player/streamUrl';

/**
 * From an HTTPS page an http:// media URL is blocked as mixed content before any
 * request is made, so a direct fallback can only fail — and its generic
 * "NetworkError Exception" would replace the proxy's real error.
 */
function canFetchDirect(url: string): boolean {
  if (typeof window === 'undefined') return true;
  return !(window.location.protocol === 'https:' && /^http:\/\//i.test(url));
}

/** mpegts.js ERROR args are (type, detail, info{code,msg}); keep the HTTP status readable. */
function describeMpegTsError(args: readonly unknown[]): string {
  const [type, detail, info] = args;
  const parts = [type, detail].filter((v): v is string => typeof v === 'string');
  if (info && typeof info === 'object') {
    const { code, msg } = info as { code?: unknown; msg?: unknown };
    if (typeof code === 'number' && code !== -1) parts.push(String(code));
    if (typeof msg === 'string' && msg) parts.push(msg);
  }
  return `MPEG-TS error: ${parts.filter(Boolean).join(' ')}`;
}

function mapMediaError(error: MediaError | null, live: boolean): PlaybackError {
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

  // Live TS/HLS streams routinely hit decoder errors mid-stream (PTS jumps,
  // corrupt packets, encoder restarts). A fresh reload recovers them.
  const recoverable =
    error.code === MediaError.MEDIA_ERR_NETWORK ||
    (live && error.code === MediaError.MEDIA_ERR_DECODE);

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

function isAutoplayBlocked(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'NotAllowedError' ||
    /notallowed|user didn't interact|user gesture|autoplay/i.test(error.message)
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
  private objectFit: 'contain' | 'cover' | 'fill' = 'contain';

  attach(container: HTMLElement): void {
    if (this.container === container && this.video && container.contains(this.video)) {
      return;
    }
    if (this.video) this.detach();
    this.container = container;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
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
    if (!this.video && !this.container) throw new Error('Player not attached');
    const generation = ++this.loadGeneration;
    this.liveMode = inferLive(url, options);
    this.handlers.onStateChange?.('loading');
    this.suppressErrors = true;
    this.switching = true;
    this.destroyEngines();
    // Reusing the same <video> after MSE detach → audio-only / black on webOS
    // emulator (and often Chrome). Fresh element matches "leave list & reopen".
    await this.recreateVideoElement();
    if (generation !== this.loadGeneration) return;

    if (isWebPageStreamUrl(url)) {
      this.suppressErrors = false;
      this.switching = false;
      throw new Error(formatPlaybackFailure(url, 'web page'));
    }

    const candidates = this.liveMode
      ? buildLivePlaybackCandidates(url)
      : buildPlaybackCandidates(url);
    let firstError: Error | null = null;

    try {
      for (const candidate of candidates) {
        if (generation !== this.loadGeneration) return;

        const engines = this.liveMode
          ? enginesForLive(candidate)
          : enginesForUrl(candidate);
        if (engines.length === 0) continue;
        for (const engine of engines) {
          if (generation !== this.loadGeneration) return;
          try {
            await this.loadWithEngine(engine, candidate);
            this.nudgeVideoPlane();
            this.suppressErrors = false;
            this.switching = false;
            return;
          } catch (error) {
            if (generation !== this.loadGeneration) return;
            // The first attempt is the user's own URL; later candidates are guesses
            // (.m3u8/.mp4 variants) whose errors say nothing about the real cause.
            const failure = error instanceof Error ? error : new Error(String(error));
            if (!firstError?.message.trim()) firstError = failure;
            this.destroyEngines();
            await this.recreateVideoElement();
            if (generation !== this.loadGeneration) return;
          }
        }
      }

      throw new Error(formatPlaybackFailure(url, firstError?.message ?? 'no supported source'));
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
        } catch (error) {
          if (isAutoplayBlocked(error)) {
            await this.playWithAutoplayUnlock();
            return;
          }
          // fall through
        }
      }
      const video = this.video;
      if (!video) return;
      this.playPromise = video.play().then(() => undefined);
      try {
        await this.playPromise;
      } catch (error) {
        this.playPromise = null;
        if (isAutoplayBlocked(error)) {
          await this.playWithAutoplayUnlock();
          return;
        }
        throw error;
      }
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

  /** Chrome blocks unmuted autoplay after navigation; mute → play → restore volume. */
  private async playWithAutoplayUnlock(): Promise<void> {
    const video = this.video;
    if (!video) return;
    const wasMuted = video.muted;
    video.muted = true;
    try {
      if (this.mpegtsPlayer) {
        try {
          await this.mpegtsPlayer.play();
        } catch {
          await video.play();
        }
      } else {
        await video.play();
      }
    } finally {
      video.muted = wasMuted;
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
    this.objectFit = fit;
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
    // Explicit edges — CSS `inset` is unreliable on webOS Chromium 79.
    video.setAttribute(
      'style',
      'position:absolute;top:0;left:0;right:0;bottom:0;width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;background:transparent;z-index:1;opacity:1;visibility:visible',
    );
    video.playsInline = true;
    video.preload = 'auto';
    video.autoplay = true;
    video.muted = false;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
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
      this.handlers.onError?.(mapMediaError(video.error, this.liveMode));
      this.handlers.onStateChange?.('error');
    });
    video.addEventListener('ended', () => this.handlers.onEnded?.());
  }

  /** Engine error after load succeeded; hand it to the controller so it can reconnect. */
  private reportRuntimeError(code: string, message: string, generation: number): void {
    if (generation !== this.loadGeneration || this.suppressErrors || this.switching) return;
    this.handlers.onError?.({ code, message, recoverable: this.liveMode });
    this.handlers.onStateChange?.('error');
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
      this.video.srcObject = null;
    } catch {
      // ignore
    }
    try {
      this.video.load();
    } catch {
      // ignore
    }
  }

  /**
   * Tear down the current <video> and mount a new one.
   * Required after mpegts/HLS MSE detach — otherwise zap often plays audio with a black frame.
   */
  private async recreateVideoElement(): Promise<void> {
    const container = this.container;
    if (!container) return;

    await this.awaitPlayThen(() => {
      try {
        this.video?.pause();
      } catch {
        // ignore
      }
    });

    if (this.video) {
      try {
        this.video.removeAttribute('src');
        this.video.srcObject = null;
        this.video.load();
      } catch {
        // ignore
      }
      if (container.contains(this.video)) {
        container.removeChild(this.video);
      }
      this.video = null;
    }

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    // Give Chromium/webOS time to release MediaSource / decoder after zap.
    await delay(isWebOsLike() ? 400 : 250);

    this.video = this.createVideoElement();
    this.video.style.objectFit = this.objectFit;
    this.bindVideoEvents(this.video);
    container.appendChild(this.video);
  }

  private nudgeVideoPlane(): void {
    const video = this.video;
    if (!video) return;
    // Force compositor to reattach the video plane (audio-only / black frame after MSE swap).
    const display = video.style.display;
    video.style.display = 'none';
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    video.offsetHeight;
    video.style.display = display || 'block';
    video.style.transform = 'translateZ(0)';
    video.style.opacity = '0.99';
    window.requestAnimationFrame(() => {
      if (this.video !== video) return;
      video.style.opacity = '1';
      video.style.transform = 'none';
    });
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

    // Production web is HTTPS; IPTV URLs are often HTTP → mixed-content block.
    // Always prefer the CORS/HTTPS stream-proxy, then fall back to direct.
    const proxied = resolveMediaFetchUrl(url);
    const urls = proxied === url ? [url] : canFetchDirect(url) ? [proxied, url] : [proxied];

    let firstError: Error | null = null;
    for (const src of urls) {
      try {
        await this.loadNativeOnce(src);
        return;
      } catch (error) {
        firstError ??= error instanceof Error ? error : new Error(String(error));
        await this.clearVideoSource();
      }
    }
    throw firstError ?? new Error('Native playback failed');
  }

  private async loadNativeOnce(url: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');

    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Native load timeout'));
      }, 20_000);

      const onError = (): void => {
        cleanup();
        reject(new Error(video.error?.message || 'Native playback failed'));
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
      try {
        await this.loadNativeOnce(resolveMediaFetchUrl(url));
        return;
      } catch (error) {
        // Recent Chrome/Edge claim native HLS too, but their failures carry no
        // detail and hls.js copes with streams they reject — so retry there.
        if (!Hls.isSupported()) throw error;
        await this.clearVideoSource();
      }
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
        enableWorker: false,
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
      const generation = this.loadGeneration;
      let mediaRecoveries = 0;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (!settled) {
          window.clearTimeout(timer);
          const httpStatus = data.response?.code;
          const detail = `${data.details || 'HLS playback failed'}${httpStatus ? ` ${String(httpStatus)}` : ''}`;
          finish(() => reject(new Error(detail)));
          return;
        }
        // Mid-playback fatal error: try the in-place hls.js recovery first.
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 3) {
          mediaRecoveries++;
          hls.recoverMediaError();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && this.liveMode) {
          hls.startLoad();
          return;
        }
        this.reportRuntimeError('HLS_RUNTIME', data.details || 'HLS playback failed', generation);
      });
      hls.on(Hls.Events.FRAG_BUFFERED, () => {
        mediaRecoveries = 0;
      });

      hls.loadSource(resolveMediaFetchUrl(url));
      hls.attachMedia(video);
    });
  }

  private async loadMpegTs(url: string): Promise<void> {
    const video = this.video;
    if (!video) throw new Error('Player not attached');
    if (!mpegts.isSupported()) throw new Error('MPEG-TS not supported in this browser');

    const isLive = isRemuxUrl(url)
      ? false
      : this.liveMode || /\/live\//i.test(url);
    const generation = this.loadGeneration;

    // Prefer proxied URL whenever rewrite applies (DEV Vite proxy or webOS license proxy).
    const proxied = resolveMediaFetchUrl(url);
    const urlsToTry =
      proxied === url ? [url] : canFetchDirect(url) ? [proxied, url] : [proxied];

    let firstError: Error | null = null;
    for (const fetchUrl of urlsToTry) {
      if (generation !== this.loadGeneration) return;
      try {
        await this.loadMpegTsOnce(fetchUrl, isLive, generation);
        return;
      } catch (error) {
        firstError ??= error instanceof Error ? error : new Error(String(error));
        this.destroyEngines();
        await this.recreateVideoElement();
        if (generation !== this.loadGeneration) return;
      }
    }
    throw firstError ?? new Error('MPEG-TS load failed');
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
        if (settled) return;
        settled = true;
        if (generation !== this.loadGeneration) {
          reject(new Error('aborted'));
          return;
        }
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
          enableWorker: false,
          enableStashBuffer: true,
          stashInitialSize: isLive ? 768 : 512,
          // Web goes through the license-server stream-proxy, which adds latency
          // vs. a direct connection. Tight chasing thresholds (8s/1.5s) made
          // mpegts.js tear down and reopen the connection every few seconds on
          // that extra hop, which looked like the stream repeatedly stalling.
          liveBufferLatencyChasing: isLive,
          liveBufferLatencyMaxLatency: 20,
          liveBufferLatencyMinRemain: 4,
          lazyLoad: false,
          autoCleanupSourceBuffer: true,
          fixAudioTimestampGap: true,
        },
      );

      this.mpegtsPlayer = player;
      player.attachMediaElement(video);

      const timer = window.setTimeout(() => {
        if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          finish(resolve);
        } else {
          finish(() => reject(new Error('MPEG-TS load timeout')));
        }
      }, isLive ? 12_000 : 18_000);

      player.on(mpegts.Events.ERROR, (...args: unknown[]) => {
        const message = describeMpegTsError(args);
        if (settled) {
          // mpegts.js stops feeding MSE after a runtime error, so the picture freezes.
          this.reportRuntimeError('MPEGTS_RUNTIME', message, generation);
          return;
        }
        window.clearTimeout(timer);
        finish(() => reject(new Error(message)));
      });
      player.on(mpegts.Events.MEDIA_INFO, () => {
        window.clearTimeout(timer);
        finish(() => {
          this.nudgeVideoPlane();
          resolve();
        });
      });
      video.addEventListener(
        'canplay',
        () => {
          window.clearTimeout(timer);
          finish(() => {
            this.nudgeVideoPlane();
            resolve();
          });
        },
        { once: true },
      );
      video.addEventListener(
        'playing',
        () => {
          this.nudgeVideoPlane();
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
    if (this.video) {
      try {
        this.video.pause();
        this.video.removeAttribute('src');
        this.video.srcObject = null;
      } catch {
        // ignore
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isWebOsLike(): boolean {
  try {
    if (typeof window !== 'undefined' && (window.PalmSystem || window.webOS)) return true;
  } catch {
    // ignore
  }
  return String(import.meta.env.VITE_PLATFORM ?? '') === 'webos';
}
