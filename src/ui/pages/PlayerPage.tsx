import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Focusable } from '@/ui/components/Focusable';
import { ChannelLogo } from '@/ui/components/ChannelLogo';
import { TimelineBar } from '@/ui/components/TimelineBar';
import {
  IconAspect,
  IconBack,
  IconChannelDown,
  IconChannelUp,
  IconEyeOff,
  IconForward30,
  IconFullscreen,
  IconFullscreenExit,
  IconInfo,
  IconPause,
  IconPlay,
  IconRetry,
  IconRewind30,
  IconStar,
  IconStop,
  IconVolume,
  IconVolumeMute,
} from '@/ui/components/PlayerIcons';
import { useRouteFocus } from '@/ui/navigation/NavigationProvider';
import { usePlaylistStore, usePlayerStore } from '@/application/stores/playlistStore';
import { channelSession } from '@/application/channels/ChannelSessionStore';
import { classifyChannel } from '@/domain/content/contentSection';
import { repositories, platform, services, TOKENS } from '@/application/di/container';
import { isTouchUi, isTvUi, isWebOS } from '@/platform/detectPlatform';
import { isTextEntryTypingKey, isTypingInField } from '@/platform/textEntry';
import { useRequireLicense } from '@/ui/hooks/useRequireLicense';
import {
  PlaybackController,
  createPlaybackOptions,
} from '@/application/services/PlaybackController';
import { recordWatchHistory, toggleFavorite } from '@/application/usecases/playlistUseCases';
import { isTransientPlaybackFailure } from '@/infrastructure/player/streamUrl';
import { EventKind } from '@/domain/events/ApplicationEvent';
import { MetricName } from '@/application/performance/PerformanceMonitor';
import type { ChannelId } from '@/domain/entities';
import { useT } from '@/i18n/useT';
import type { MessageKey } from '@/i18n';

type ObjectFit = 'contain' | 'cover' | 'fill';

const FIT_CYCLE: readonly ObjectFit[] = ['contain', 'cover', 'fill'];
const FIT_KEYS: Record<ObjectFit, MessageKey> = {
  contain: 'player.fitContain',
  cover: 'player.fitCover',
  fill: 'player.fitFill',
};
/** Phone/desktop: hide chrome after 5s. TV: hide sooner while playing so the video plane is visible. */
function overlayHideMs(): number {
  return isTvUi() ? 3_000 : 5_000;
}

function delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function PlayerPage(): ReactNode {
  useRouteFocus('player');
  const t = useT();
  const { checking: licenseChecking, licensed } = useRequireLicense();
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<PlaybackController | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { currentPlaylist, favorites, settings, setFavorites } = usePlaylistStore();
  const {
    activeChannel,
    playbackState,
    playbackError,
    showOverlay,
    currentTime,
    duration,
    setActiveChannel,
    setPlaybackState,
    setPlaybackError,
    setCurrentTime,
    setDuration,
    setShowOverlay,
  } = usePlayerStore();

  const [volume, setVolume] = useState(settings.defaultVolume);
  const [muted, setMuted] = useState(false);
  const [objectFit, setObjectFit] = useState<ObjectFit>('contain');
  const [showInfo, setShowInfo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const channel =
    (channelId ? channelSession.getById(channelId) : null) ??
    (activeChannel?.id === channelId ? activeChannel : null);

  const contentKind = useMemo(
    () => (channel ? classifyChannel(channel) : 'live'),
    [channel],
  );

  const seekable =
    contentKind !== 'live' && Number.isFinite(duration) && duration > 0;

  const isFavorite = channel ? favorites.includes(channel.id as ChannelId) : false;
  const isPlaying = playbackState === 'playing';
  const isBuffering =
    playbackState === 'buffering' ||
    playbackState === 'loading' ||
    playbackState === 'reconnecting';

  const bumpOverlay = useCallback(() => {
    setShowOverlay(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      const state = usePlayerStore.getState().playbackState;
      if (state === 'error') return;
      // On TV keep chrome while paused / buffering so remote users aren't stranded.
      if (isTvUi() && state !== 'playing') return;
      setShowOverlay(false);
      setShowInfo(false);
    }, overlayHideMs());
  }, [setShowOverlay]);

  const handleSeek = useCallback(
    (seconds: number) => {
      controllerRef.current?.seek(seconds);
      setCurrentTime(seconds);
      bumpOverlay();
    },
    [bumpOverlay, setCurrentTime],
  );

  const handleSkip = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(duration || Number.POSITIVE_INFINITY, currentTime + delta));
      handleSeek(Number.isFinite(next) ? next : Math.max(0, currentTime + delta));
    },
    [currentTime, duration, handleSeek],
  );

  const handlePlayPause = useCallback(() => {
    const controller = controllerRef.current;
    if (!controller) return;
    bumpOverlay();
    const state = usePlayerStore.getState().playbackState;
    if (state === 'playing' || state === 'buffering') {
      controller.pause();
    } else {
      controller.resume();
    }
  }, [bumpOverlay]);

  const handleStop = useCallback(() => {
    controllerRef.current?.stop();
    setPlaybackState('idle');
    bumpOverlay();
  }, [bumpOverlay, setPlaybackState]);

  const handleToggleMute = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    const next = ctrl.toggleMute();
    setMuted(next);
    bumpOverlay();
  }, [bumpOverlay]);

  const handleVolumeDelta = useCallback(
    (delta: number) => {
      const ctrl = controllerRef.current;
      if (!ctrl) return;
      const current = ctrl.getVolume();
      const next = Math.min(100, Math.max(0, current + delta));
      ctrl.setVolume(next);
      ctrl.setMuted(false);
      setVolume(next);
      setMuted(false);
      bumpOverlay();
    },
    [bumpOverlay],
  );

  const handleVolumeSlider = useCallback(
    (value: number) => {
      const ctrl = controllerRef.current;
      if (!ctrl) return;
      ctrl.setVolume(value);
      ctrl.setMuted(value === 0);
      setVolume(value);
      setMuted(value === 0);
      bumpOverlay();
    },
    [bumpOverlay],
  );

  const handleCycleFit = useCallback(() => {
    setObjectFit((prev) => {
      const idx = FIT_CYCLE.indexOf(prev);
      return FIT_CYCLE[(idx + 1) % FIT_CYCLE.length] ?? 'contain';
    });
    bumpOverlay();
  }, [bumpOverlay]);

  const handleToggleFullscreen = useCallback(async () => {
    const el = rootRef.current;
    if (!el) return;
    bumpOverlay();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // Browser / TV may deny fullscreen
    }
  }, [bumpOverlay]);

  const zapChannel = useCallback(
    (direction: 1 | -1) => {
      if (!channel) return;
      const next = channelSession.findNeighbor(channel.id, direction);
      if (!next) return;
      channelSession.remember(next);
      usePlayerStore.getState().setActiveChannel(next);
      navigate(`/player/${next.id}`, { replace: true });
    },
    [channel, navigate],
  );

  const handleToggleFavorite = useCallback(async () => {
    if (!channel || !currentPlaylist) return;
    bumpOverlay();
    await toggleFavorite(
      repositories.favorites,
      channel.id,
      currentPlaylist.id,
      services.resolve(TOKENS.eventPublisher),
    );
    const updated = await repositories.favorites.getByPlaylist(currentPlaylist.id);
    setFavorites(updated);
  }, [bumpOverlay, channel, currentPlaylist, setFavorites]);

  const handleRetry = useCallback(() => {
    if (!channel || !controllerRef.current) return;
    setPlaybackError(null);
    bumpOverlay();
    void controllerRef.current.play(channel.url, channel.id, channel.name, {
      isLive: classifyChannel(channel) === 'live',
    });
  }, [bumpOverlay, channel, setPlaybackError]);

  // Full player recreate per channel — same path as leaving the list and reopening.
  // Reusing MSE/mpegts on one session causes audio + black video on zap (web + webOS).
  useEffect(() => {
    if (!currentPlaylist || !channelId) {
      navigate('/channels');
      return;
    }

    const found =
      channelSession.getById(channelId) ??
      (activeChannel?.id === channelId ? activeChannel : null);
    if (!found) {
      navigate('/channels');
      return;
    }

    channelSession.remember(found);
    setActiveChannel(found);
    setCurrentTime(0);
    setDuration(0);
    setShowInfo(false);
    setShowOverlay(true);
    setPlaybackError(null);
    setPlaybackState('loading');
    platform.platform.setKeepScreenOn(true);

    const perfMonitor = services.resolve(TOKENS.performanceMonitor);
    const eventPublisher = services.resolve(TOKENS.eventPublisher);
    perfMonitor.mark('player-start');

    let cancelled = false;
    let controller: PlaybackController | null = null;

    const start = async (): Promise<void> => {
      // Let the previous channel's MediaSource / decoder fully release.
      await delayMs(isWebOS() ? 450 : 280);
      if (cancelled) return;

      const el = containerRef.current;
      if (!el) {
        window.requestAnimationFrame(() => {
          void start();
        });
        return;
      }

      const videoPlayer = services.resolve(TOKENS.videoPlayerFactory).create();
      const options = createPlaybackOptions(settings);
      controller = new PlaybackController(
        videoPlayer,
        options,
        {
          onStateChange: setPlaybackState,
          onError: setPlaybackError,
          onTimeUpdate: (current, dur) => {
            setCurrentTime(current);
            setDuration(Number.isFinite(dur) && dur > 0 ? dur : 0);
          },
        },
        eventPublisher,
      );
      controllerRef.current = controller;

      controller.attach(el);
      controller.setVolume(settings.defaultVolume);
      setVolume(settings.defaultVolume);
      setMuted(false);
      controller.setObjectFit(objectFit);

      eventPublisher.publish(EventKind.ChannelChanged, {
        channelId: found.id,
        channelName: found.name,
        playlistId: currentPlaylist.id,
      });
      bumpOverlay();

      const AUTO_RETRY_ATTEMPTS = 2; // silent retries for proxy/network hiccups only
      let attempt = 0;
      for (;;) {
        try {
          setPlaybackError(null);
          await controller.play(found.url, found.id, found.name, {
            isLive: classifyChannel(found) === 'live',
          });
          if (cancelled) return;
          setPlaybackError(null);
          perfMonitor.measure(MetricName.PlayerStartupLatency, 'player-start', 'ms');
          await recordWatchHistory(
            repositories.history,
            {
              channelId: found.id,
              channelName: found.name,
              playlistId: currentPlaylist.id,
              watchedAt: Date.now(),
            },
            eventPublisher,
          );
          return;
        } catch (error) {
          if (cancelled) return;
          const message = error instanceof Error ? error.message : 'Failed to start playback';
          if (attempt < AUTO_RETRY_ATTEMPTS && isTransientPlaybackFailure(message)) {
            attempt += 1;
            await delayMs(700 * attempt);
            if (cancelled) return;
            continue;
          }
          setPlaybackError({
            code: 'PLAY_FAILED',
            message,
            recoverable: true,
          });
          setPlaybackState('error');
          return;
        }
      }
    };

    void start();

    return () => {
      cancelled = true;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      controller?.destroy();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      platform.platform.setKeepScreenOn(false);
      setPlaybackState('idle');
      setPlaybackError(null);
      setCurrentTime(0);
      setDuration(0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, currentPlaylist?.id]);

  useEffect(() => {
    controllerRef.current?.setObjectFit(objectFit);
  }, [objectFit]);

  useEffect(() => {
    const onFsChange = (): void => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      bumpOverlay();
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, [bumpOverlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!controllerRef.current) return;
      if (isTypingInField(e) && isTextEntryTypingKey(e)) return;
      bumpOverlay();

      switch (e.key) {
        case ' ':
        case 'MediaPlayPause':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowLeft':
          if (seekable) {
            e.preventDefault();
            handleSkip(-10);
          }
          break;
        case 'ArrowRight':
          if (seekable) {
            e.preventDefault();
            handleSkip(10);
          }
          break;
        case 'ArrowUp':
        case 'ChannelUp':
          e.preventDefault();
          zapChannel(-1);
          break;
        case 'ArrowDown':
        case 'ChannelDown':
          e.preventDefault();
          zapChannel(1);
          break;
        case 'm':
        case 'M':
        case 'AudioVolumeMute':
          e.preventDefault();
          handleToggleMute();
          break;
        case 'AudioVolumeUp':
          e.preventDefault();
          handleVolumeDelta(5);
          break;
        case 'AudioVolumeDown':
          e.preventDefault();
          handleVolumeDelta(-5);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          void handleToggleFullscreen();
          break;
        case 'Escape':
          e.preventDefault();
          if (document.fullscreenElement) {
            void document.exitFullscreen();
          } else {
            navigate('/channels');
          }
          break;
        case 'i':
        case 'I':
          e.preventDefault();
          setShowInfo((v) => !v);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    bumpOverlay,
    handlePlayPause,
    handleSkip,
    handleToggleFullscreen,
    handleToggleMute,
    handleVolumeDelta,
    navigate,
    seekable,
    zapChannel,
  ]);

  if (licenseChecking || !licensed) return null;
  if (!channel) return null;

  const tvUi = isTvUi();
  const phone = isTouchUi();
  const btnSize = tvUi ? 'h-16 w-16' : phone ? 'phone-ctrl' : 'h-14 w-14';
  const iconSize = tvUi ? 'h-8 w-8' : phone ? 'phone-ctrl-icon' : 'h-7 w-7';
  const playSize = tvUi ? 'h-20 w-20' : phone ? 'phone-ctrl-play' : 'h-16 w-16';
  const seekIcon = tvUi ? 'h-12 w-12' : phone ? 'phone-ctrl-icon' : 'h-11 w-11';
  const playIcon = tvUi ? 'h-10 w-10' : phone ? 'phone-ctrl-icon' : 'h-9 w-9';

  return (
    <div
      ref={rootRef}
      className="player-shell fixed inset-0 z-0 bg-black"
      onMouseMove={phone ? undefined : bumpOverlay}
      onTouchStart={bumpOverlay}
      onClick={() => {
        if (!showOverlay) bumpOverlay();
      }}
    >
      <div
        key={channelId}
        ref={containerRef}
        className="absolute top-0 right-0 bottom-0 left-0 h-full w-full overflow-hidden"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1,
          background: '#101820',
        }}
      />

      {showOverlay && (
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 left-0 z-20 flex min-h-0 min-w-0 flex-col overflow-hidden">
          {/* Top chrome only — do NOT paint a full-screen dimmer over the video plane. */}
          <header
            className="player-chrome pointer-events-auto flex min-w-0 shrink-0 items-center justify-between gap-6 overflow-hidden px-14 pt-10 pb-4"
            style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.85), rgba(0,0,0,0))' }}
          >
            <div className="flex min-w-0 items-center gap-6">
              <ChannelLogo name={channel.name} logoUrl={channel.logoUrl} size={phone ? 'sm' : 'lg'} />
              <div className="min-w-0">
                <h1 className="truncate text-4xl font-bold text-white">{channel.name}</h1>
                <p className="mt-1 truncate text-xl text-slate-300">{channel.group}</p>
              </div>
            </div>
            <StatusBadge state={playbackState} />
          </header>

          {showInfo && (
            <div className="pointer-events-auto player-info-panel mx-14 mt-2 max-w-3xl rounded-2xl bg-black/70 px-6 py-5">
              <p className="text-lg text-slate-200">
                <span className="text-slate-400">{t('player.type')}:</span>{' '}
                {contentKind === 'live'
                  ? t('section.live')
                  : contentKind === 'movie'
                    ? t('section.movie')
                    : t('section.series')}
              </p>
              <p className="mt-2 break-all text-sm text-slate-400">{channel.url}</p>
              <p className="mt-2 text-sm text-slate-500">{t('player.remoteHint')}</p>
            </div>
          )}

          {playbackError && (
            <div className="pointer-events-auto mx-14 mt-6 rounded-2xl border-2 border-red-500 bg-red-950 px-8 py-6">
              <p className="text-2xl font-semibold text-white">{playbackError.message}</p>
              {playbackError.recoverable && (
                <Focusable
                  focusId="player-retry"
                  focusGroup="player-controls"
                  focusPriority={10}
                  className="mt-4 inline-block"
                  onClick={handleRetry}
                  aria-label={t('player.retry')}
                >
                  <span className="inline-flex items-center gap-3 rounded-xl bg-accent-500 px-8 py-3 text-xl font-semibold text-white [.focused_&]:bg-accent-400">
                    <IconRetry className="h-6 w-6" />
                    {t('player.retry')}
                  </span>
                </Focusable>
              )}
            </div>
          )}

          <div className="flex-1" />

          <footer
            className="player-chrome pointer-events-auto shrink-0 px-10 pb-10 pt-4"
            style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0))' }}
          >
            <TimelineBar
              currentTime={currentTime}
              duration={duration}
              seekable={seekable}
              onSeek={handleSeek}
              onSkip={handleSkip}
              isPlaying={isPlaying}
              isBuffering={isBuffering}
              showTransport={false}
            />

            {/* Primary transport */}
            <div className="player-transport mt-5 flex items-center justify-center gap-5">
              <IconButton
                focusId="player-ch-prev"
                label={t('player.prevChannel')}
                priority={9}
                size={btnSize}
                onClick={() => zapChannel(-1)}
              >
                <IconChannelUp className={iconSize} />
              </IconButton>

              {seekable && (
                <IconButton
                  focusId="player-seek-back"
                  label={t('player.seekBack')}
                  priority={9}
                  size={btnSize}
                  onClick={() => handleSkip(-30)}
                >
                  <IconRewind30 className={seekIcon} />
                </IconButton>
              )}

              <IconButton
                focusId="player-playpause"
                label={
                  isBuffering
                    ? t('player.loading')
                    : isPlaying
                      ? t('player.pause')
                      : t('player.play')
                }
                priority={10}
                size={playSize}
                accent
                onClick={handlePlayPause}
              >
                {isBuffering ? (
                  <span className={`${phone ? 'h-4 w-4 border-2' : 'h-8 w-8 border-4'} animate-spin rounded-full border-white/30 border-t-white`} />
                ) : isPlaying ? (
                  <IconPause className={playIcon} />
                ) : (
                  <IconPlay className={`${playIcon} translate-x-0.5`} />
                )}
              </IconButton>

              {seekable && (
                <IconButton
                  focusId="player-seek-forward"
                  label={t('player.seekForward')}
                  priority={8}
                  size={btnSize}
                  onClick={() => handleSkip(30)}
                >
                  <IconForward30 className={seekIcon} />
                </IconButton>
              )}

              <IconButton
                focusId="player-ch-next"
                label={t('player.nextChannel')}
                priority={9}
                size={btnSize}
                onClick={() => zapChannel(1)}
              >
                <IconChannelDown className={iconSize} />
              </IconButton>

              {!phone && (
              <IconButton
                focusId="player-stop"
                label={t('player.stop')}
                priority={8}
                size={btnSize}
                className="player-stop-btn"
                onClick={handleStop}
              >
                <IconStop className={iconSize} />
              </IconButton>
              )}
            </div>

            {/* Secondary toolbar */}
            <div className="player-toolbar mt-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <IconButton
                  focusId="player-back"
                  label={t('player.back')}
                  priority={7}
                  size={btnSize}
                  onClick={() => navigate('/channels')}
                >
                  <IconBack className={iconSize} />
                </IconButton>

                <IconButton
                  focusId="player-favorite"
                  label={isFavorite ? t('player.removeFavorite') : t('player.addFavorite')}
                  priority={6}
                  size={btnSize}
                  active={isFavorite}
                  onClick={() => void handleToggleFavorite()}
                >
                  <IconStar filled={isFavorite} className={iconSize} />
                </IconButton>

                {!phone && (
                <IconButton
                  focusId="player-info"
                  label={t('player.info')}
                  priority={5}
                  size={btnSize}
                  active={showInfo}
                  onClick={() => {
                    setShowInfo((v) => !v);
                    bumpOverlay();
                  }}
                >
                  <IconInfo className={iconSize} />
                </IconButton>
                )}
              </div>

              <div className="flex items-center gap-3">
                <IconButton
                  focusId="player-mute"
                  label={muted ? t('player.unmute') : t('player.mute')}
                  priority={6}
                  size={btnSize}
                  onClick={handleToggleMute}
                >
                  {muted || volume === 0 ? (
                    <IconVolumeMute className={iconSize} />
                  ) : (
                    <IconVolume className={iconSize} />
                  )}
                </IconButton>

                {!tvUi && !phone && (
                  <div className="player-volume-slider flex w-40 items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={muted ? 0 : volume}
                      onChange={(e) => handleVolumeSlider(Number(e.target.value))}
                      className="h-2 w-full cursor-pointer accent-accent-400"
                      aria-label={t('player.volume')}
                    />
                    <span className="w-8 text-right text-sm tabular-nums text-slate-300">
                      {muted ? 0 : volume}
                    </span>
                  </div>
                )}

                {!phone && (
                <IconButton
                  focusId="player-vol-down"
                  label={t('player.volumeDown')}
                  priority={4}
                  size={btnSize}
                  onClick={() => handleVolumeDelta(-5)}
                >
                  <span className="text-2xl font-bold leading-none">−</span>
                </IconButton>
                )}
                <span className="player-vol-num w-10 text-center text-lg tabular-nums text-slate-300">
                  {muted ? 0 : volume}
                </span>
                {!phone && (
                <IconButton
                  focusId="player-vol-up"
                  label={t('player.volumeUp')}
                  priority={4}
                  size={btnSize}
                  onClick={() => handleVolumeDelta(5)}
                >
                  <span className="text-2xl font-bold leading-none">+</span>
                </IconButton>
                )}

                <IconButton
                  focusId="player-aspect"
                  label={`${t('player.aspect')}: ${t(FIT_KEYS[objectFit])}`}
                  priority={5}
                  size={btnSize}
                  onClick={handleCycleFit}
                >
                  <IconAspect className={iconSize} />
                </IconButton>

                {!tvUi && !phone && (
                  <span className="player-fs-wrap">
                  <IconButton
                    focusId="player-fullscreen"
                    label={isFullscreen ? t('player.fullscreenExit') : t('player.fullscreen')}
                    priority={5}
                    size={btnSize}
                    active={isFullscreen}
                    onClick={() => void handleToggleFullscreen()}
                  >
                    {isFullscreen ? (
                      <IconFullscreenExit className={iconSize} />
                    ) : (
                      <IconFullscreen className={iconSize} />
                    )}
                  </IconButton>
                  </span>
                )}

                {!phone && (
                <IconButton
                  focusId="player-toggle-overlay"
                  label={t('player.hideControls')}
                  priority={3}
                  size={btnSize}
                  onClick={() => setShowOverlay(false)}
                >
                  <IconEyeOff className={iconSize} />
                </IconButton>
                )}
              </div>
            </div>

            <p className="player-hint mt-3 text-center text-sm text-slate-400">
              {t(FIT_KEYS[objectFit])}
              {contentKind === 'live' ? t('player.hintLive') : t('player.hintVod')}
            </p>
          </footer>
        </div>
      )}

      {!showOverlay && (
        <button
          type="button"
          className="absolute inset-0 z-20 cursor-default bg-transparent"
          aria-label={t('player.showControls')}
          onClick={bumpOverlay}
        />
      )}
    </div>
  );
}

function IconButton({
  focusId,
  label,
  onClick,
  children,
  priority = 5,
  active = false,
  size = 'h-14 w-14',
  accent = false,
  className = '',
}: {
  focusId: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
  priority?: number;
  active?: boolean;
  size?: string;
  accent?: boolean;
  className?: string;
}): ReactNode {
  return (
    <Focusable
      focusId={focusId}
      focusGroup="player-controls"
      focusPriority={priority}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={className}
    >
      <span
        className={`flex items-center justify-center rounded-full text-white transition-colors [.focused_&]:bg-accent-500 hover:bg-white/20 ${size} ${
          accent
            ? 'bg-accent-500 shadow-lg shadow-accent-500/30 [.focused_&]:bg-accent-400'
            : active
              ? 'bg-accent-500/40 text-accent-200'
              : 'bg-white/15'
        }`}
      >
        {children}
      </span>
    </Focusable>
  );
}

function StatusBadge({ state }: { state: string }): ReactNode {
  const t = useT();
  const labelKeys: Record<string, MessageKey> = {
    playing: 'player.state.playing',
    loading: 'player.state.loading',
    buffering: 'player.state.buffering',
    reconnecting: 'player.state.reconnecting',
    error: 'player.state.error',
    paused: 'player.state.paused',
    idle: 'player.state.idle',
  };

  const colors: Record<string, string> = {
    playing: 'bg-success-500/20 text-success-500',
    loading: 'bg-warning-500/20 text-warning-500',
    buffering: 'bg-warning-500/20 text-warning-500',
    reconnecting: 'bg-warning-500/20 text-warning-500',
    error: 'bg-error-500/20 text-error-500',
    paused: 'bg-surface-700 text-slate-300',
    idle: 'bg-surface-700 text-slate-300',
  };

  return (
    <span
      className={`player-status shrink-0 rounded-full px-6 py-2 text-lg font-medium ${colors[state] ?? colors.idle}`}
    >
      {labelKeys[state] ? t(labelKeys[state]) : state}
    </span>
  );
}
