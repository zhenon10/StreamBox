import { useCallback, type ReactNode } from 'react';
import { Focusable } from '@/ui/components/Focusable';
import {
  IconForward30,
  IconLive,
  IconPlay,
  IconPause,
  IconRewind30,
} from '@/ui/components/PlayerIcons';

interface TimelineBarProps {
  readonly currentTime: number;
  readonly duration: number;
  readonly onSeek: (seconds: number) => void;
  readonly onSkip: (deltaSeconds: number) => void;
  readonly seekable: boolean;
  readonly isPlaying?: boolean;
  readonly isBuffering?: boolean;
  readonly onPlayPause?: () => void;
  /** When false, only the scrubber / live badge is shown (transport lives elsewhere). */
  readonly showTransport?: boolean;
}

export function TimelineBar({
  currentTime,
  duration,
  onSeek,
  onSkip,
  seekable,
  isPlaying = false,
  isBuffering = false,
  onPlayPause,
  showTransport = true,
}: TimelineBarProps): ReactNode {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const safeCurrent = Math.max(0, Math.min(currentTime, safeDuration || currentTime));
  const progress = safeDuration > 0 ? Math.min(100, (safeCurrent / safeDuration) * 100) : 0;

  const handleRangeChange = useCallback(
    (value: string) => {
      if (!seekable || safeDuration <= 0) return;
      const ratio = Number(value) / 1000;
      onSeek(ratio * safeDuration);
    },
    [onSeek, safeDuration, seekable],
  );

  return (
    <div className="w-full px-12">
      <div className="mb-4 flex items-center justify-between text-base text-slate-300">
        <span className="tabular-nums tracking-wide">{formatTime(safeCurrent)}</span>
        {seekable && safeDuration > 0 ? (
          <span className="tabular-nums tracking-wide">{formatTime(safeDuration)}</span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-error-500/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
            <IconLive className="h-3 w-3 animate-pulse" />
            Canlı
          </span>
        )}
      </div>

      <div className="group relative h-2 w-full rounded-full bg-white/20 transition-[height] hover:h-3">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent-400"
          style={{ width: seekable ? `${String(progress)}%` : '100%' }}
        />
        {seekable && safeDuration > 0 && (
          <>
            <div
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow-md"
              style={{ left: `calc(${String(progress)}% - 8px)` }}
            />
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(progress * 10)}
              onChange={(e) => handleRangeChange(e.target.value)}
              className="absolute inset-0 w-full cursor-pointer opacity-0"
              aria-label="Zaman çubuğu"
            />
          </>
        )}
      </div>

      {showTransport && (seekable || onPlayPause) && (
        <div className="mt-6 flex items-center justify-center gap-8">
          {seekable && safeDuration > 0 && (
            <Focusable
              focusId="player-seek-back"
              focusGroup="player-timeline"
              focusPriority={9}
              onClick={() => onSkip(-30)}
              aria-label="30 saniye geri"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white transition-colors [.focused_&]:bg-accent-500 [.focused_&]:text-white hover:bg-white/20">
                <IconRewind30 className="h-11 w-11" />
              </span>
            </Focusable>
          )}

          {onPlayPause && (
            <Focusable
              focusId="player-playpause-center"
              focusGroup="player-timeline"
              focusPriority={10}
              onClick={onPlayPause}
              aria-label={isBuffering ? 'Yükleniyor' : isPlaying ? 'Duraklat' : 'Oynat'}
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent-500 text-white shadow-lg shadow-accent-500/30 transition-transform [.focused_&]:scale-110 [.focused_&]:bg-accent-400">
                {isBuffering ? (
                  <span className="h-8 w-8 animate-spin rounded-full border-4 border-white/30 border-t-white" />
                ) : isPlaying ? (
                  <IconPause className="h-9 w-9" />
                ) : (
                  <IconPlay className="h-9 w-9 translate-x-0.5" />
                )}
              </span>
            </Focusable>
          )}

          {seekable && safeDuration > 0 && (
            <Focusable
              focusId="player-seek-forward"
              focusGroup="player-timeline"
              focusPriority={8}
              onClick={() => onSkip(30)}
              aria-label="30 saniye ileri"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white transition-colors [.focused_&]:bg-accent-500 [.focused_&]:text-white hover:bg-white/20">
                <IconForward30 className="h-11 w-11" />
              </span>
            </Focusable>
          )}
        </div>
      )}
    </div>
  );
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const mm = hours > 0 ? String(minutes).padStart(2, '0') : String(minutes);
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${mm}:${ss}` : `${mm}:${ss}`;
}
