import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Channel } from '@/domain/entities';
import { Focusable } from '@/ui/components/Focusable';
import { ChannelLogo } from '@/ui/components/ChannelLogo';

interface PosterGridProps {
  readonly count: number;
  readonly getChannel: (index: number) => Channel | null;
  readonly onSelect: (channel: Channel) => void;
  readonly favorites?: readonly string[];
  readonly focusGroup?: string;
}

const PAGE = 40;

export function PosterGrid({
  count,
  getChannel,
  onSelect,
  favorites = [],
  focusGroup = 'posters',
}: PosterGridProps): ReactNode {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(count / PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const start = safePage * PAGE;
  const end = Math.min(start + PAGE, count);
  const fav = favorites.length > 0 ? new Set(favorites) : null;

  useEffect(() => {
    setPage(0);
  }, [count]);

  const goPrev = useCallback(() => {
    setPage((p) => Math.max(0, p - 1));
  }, []);

  const goNext = useCallback(() => {
    setPage((p) => Math.min(totalPages - 1, p + 1));
  }, [totalPages]);

  const cards: ReactNode[] = [];
  for (let i = start; i < end; i++) {
    const channel = getChannel(i);
    if (!channel) continue;
    const year = yearFromName(channel.name);
    cards.push(
      <Focusable
        key={`${channel.id}-${String(i)}`}
        focusId={`poster-${String(i)}`}
        focusGroup={focusGroup}
        className="and-poster"
        onClick={() => onSelect(channel)}
      >
        <div className="and-poster-art">
          <ChannelLogo name={channel.name} logoUrl={channel.logoUrl} size="poster" />
          {fav?.has(channel.id) ? <span className="and-poster-heart">♡</span> : null}
        </div>
        <p className="and-poster-title">
          {channel.name}
          {year ? ` (${year})` : ''}
        </p>
      </Focusable>,
    );
  }

  return (
    <div className="and-poster-wrap">
      <div className="and-posters">{cards}</div>
      {totalPages > 1 && (
        <div className="channel-pager flex items-center justify-between gap-3 px-1 py-2">
          <Focusable
            focusId="poster-page-prev"
            focusGroup={`${focusGroup}-pager`}
            disabled={safePage <= 0}
            onClick={goPrev}
          >
            <span className="rounded-lg bg-surface-800 px-4 py-2 text-sm text-white">←</span>
          </Focusable>
          <span className="text-sm text-slate-400">
            {String(safePage + 1)} / {String(totalPages)}
          </span>
          <Focusable
            focusId="poster-page-next"
            focusGroup={`${focusGroup}-pager`}
            disabled={safePage >= totalPages - 1}
            onClick={goNext}
          >
            <span className="rounded-lg bg-surface-800 px-4 py-2 text-sm text-white">→</span>
          </Focusable>
        </div>
      )}
    </div>
  );
}

function yearFromName(name: string): string | null {
  const match = /\b((?:19|20)\d{2})\b/.exec(name);
  return match?.[1] ?? null;
}
