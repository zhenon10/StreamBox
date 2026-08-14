import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Channel } from '@/domain/entities';
import { isTouchUi } from '@/platform/detectPlatform';
import { Focusable } from './Focusable';
import { ChannelLogo } from './ChannelLogo';

const PAGE_SIZE = 40;

interface VirtualChannelListProps {
  readonly count: number;
  readonly getChannel: (index: number) => Channel | null;
  readonly onSelect: (channel: Channel) => void;
  readonly favorites?: readonly string[];
  readonly showNumbers?: boolean;
  readonly focusGroup?: string;
  readonly onFocusChannel?: (channel: Channel) => void;
  readonly density?: 'default' | 'compact';
}

/**
 * Page-based channel list — never virtualizes 100k rows (huge scroll heights freeze Chrome/TV).
 * Renders at most PAGE_SIZE DOM nodes.
 */
export function VirtualChannelList({
  count,
  getChannel,
  onSelect,
  favorites = [],
  showNumbers = true,
  focusGroup = 'channels',
  onFocusChannel,
  density = 'default',
}: VirtualChannelListProps): ReactNode {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, count);
  const showRemoteLogos = count <= 2000;

  useEffect(() => {
    setPage(0);
  }, [count]);

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  const favoriteSet = favorites.length > 0 ? new Set(favorites) : null;
  const phone = isTouchUi();

  const rows: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const channel = getChannel(i);
    if (!channel) continue;
    const isFavorite = favoriteSet?.has(channel.id) ?? false;

    rows.push(
      <Focusable
        key={`${channel.id}-${String(i)}`}
        focusId={`channel-row-${String(i)}`}
        focusGroup={focusGroup}
        className={`channel-row mb-2 block w-full ${density === 'compact' ? 'h-14' : 'h-20'}`}
        onClick={() => onSelect(channel)}
        onFocus={() => onFocusChannel?.(channel)}
      >
        <div className="channel-row-inner flex h-full items-center gap-5 rounded-2xl bg-surface-900/60 px-5 transition-colors [.focused_&]:bg-accent-500 hover:bg-surface-800">
          {showNumbers && (
            <span className="channel-row-num w-14 text-right text-xl tabular-nums text-slate-500 [.focused_&]:text-white/70">
              {String(i + 1)}
            </span>
          )}
          <ChannelLogo
            name={channel.name}
            logoUrl={showRemoteLogos ? channel.logoUrl : null}
            size={phone || density === 'compact' ? 'xs' : 'md'}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-semibold text-white">{channel.name}</p>
            <p className="truncate text-lg text-slate-400 [.focused_&]:text-white/75">{channel.group}</p>
          </div>
          {isFavorite && <span className="text-2xl text-accent-400 [.focused_&]:text-white">★</span>}
        </div>
      </Focusable>,
    );
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col px-2">
      <div className="scrollbar-hidden min-h-0 flex-1 overflow-y-scroll">{rows}</div>

      {totalPages > 1 && (
        <div className="channel-pager flex items-center justify-between gap-4 border-t border-surface-800 px-4 py-4">
          <Focusable
            focusId="channel-page-prev"
            focusGroup={`${focusGroup}-pager`}
            className="block"
            disabled={safePage <= 0}
            onClick={goPrev}
          >
            <span className="rounded-xl bg-surface-800 px-6 py-3 text-lg text-white [.focused_&]:bg-surface-700">
              ← Prev
            </span>
          </Focusable>
          <span className="text-lg text-slate-400">
            Page {String(safePage + 1)} / {String(totalPages)}
          </span>
          <Focusable
            focusId="channel-page-next"
            focusGroup={`${focusGroup}-pager`}
            className="block"
            disabled={safePage >= totalPages - 1}
            onClick={goNext}
          >
            <span className="rounded-xl bg-surface-800 px-6 py-3 text-lg text-white [.focused_&]:bg-surface-700">
              Next →
            </span>
          </Focusable>
        </div>
      )}
    </div>
  );
}
