import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Focusable } from '@/ui/components/Focusable';
import { VirtualChannelList } from '@/ui/components/VirtualChannelList';
import { ChannelLogo } from '@/ui/components/ChannelLogo';
import { AndroidIconRail, AndroidTopBar } from './AndroidChrome';
import { PosterGrid, channelToPoster } from './PosterGrid';
import type { Channel } from '@/domain/entities';
import type { ContentSection, SectionCategory } from '@/domain/content/contentSection';
import {
  groupChannelsIntoSeries,
  type SeriesShow,
} from '@/domain/content/seriesGroup';
import { platform } from '@/application/di/container';
import { useT } from '@/i18n/useT';
import { useListNavigation } from '@/ui/navigation/NavigationProvider';

interface AndroidBrowseViewProps {
  readonly section: ContentSection;
  readonly sectionLabel: string;
  readonly playlistName: string;
  readonly expiresLabel?: string | undefined;
  readonly licensed: boolean;
  readonly categories: readonly SectionCategory[];
  readonly activeCategory: string | null;
  readonly searchQuery: string;
  readonly onSearch: (value: string) => void;
  readonly onSelectCategory: (name: string) => void;
  readonly onSection: (section: ContentSection) => void;
  readonly listCount: number;
  readonly getChannel: (index: number) => Channel | null;
  readonly onSelectChannel: (channel: Channel, zapViewIndices?: readonly number[]) => void;
  readonly favorites: readonly string[];
  readonly showNumbers: boolean;
  readonly loading: boolean;
  readonly indexing: boolean;
}

export function AndroidBrowseView({
  section,
  sectionLabel,
  playlistName,
  expiresLabel,
  licensed,
  categories,
  activeCategory,
  searchQuery,
  onSearch,
  onSelectCategory,
  onSection,
  listCount,
  getChannel,
  onSelectChannel,
  favorites,
  showNumbers,
  loading,
  indexing,
}: AndroidBrowseViewProps): ReactNode {
  const t = useT();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [preview, setPreview] = useState<Channel | null>(null);
  const [openSeries, setOpenSeries] = useState<SeriesShow | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const vod = section === 'movie' || section === 'series';
  const groupSeries = section === 'series' && !searchQuery.trim();

  useEffect(() => {
    setOpenSeries(null);
  }, [section, activeCategory, searchQuery, listCount]);

  const seriesShows = useMemo(() => {
    if (!groupSeries || openSeries || listCount === 0) return null;
    return groupChannelsIntoSeries(listCount, getChannel);
  }, [groupSeries, openSeries, listCount, getChannel]);

  // Distinct seasons for the open show, in order — lets a multi-season
  // series be browsed one season at a time instead of one long flat list.
  const seasons = useMemo(() => {
    if (!openSeries) return [];
    const set = new Set<number>();
    openSeries.episodes.forEach((ep) => set.add(ep.season));
    return Array.from(set).sort((a, b) => a - b);
  }, [openSeries]);

  useEffect(() => {
    setSelectedSeason(seasons[0] ?? null);
  }, [openSeries, seasons]);

  const seasonEpisodes = useMemo(() => {
    if (!openSeries) return [];
    if (selectedSeason == null || seasons.length <= 1) return openSeries.episodes;
    return openSeries.episodes.filter((ep) => ep.season === selectedSeason);
  }, [openSeries, seasons, selectedSeason]);

  const crumb = openSeries
    ? openSeries.title
    : searchQuery.trim() || activeCategory || sectionLabel;
  const catIds = useMemo(() => {
    if (openSeries && seasons.length > 1) {
      return seasons.map((_, index) => `and-season-${String(index)}`);
    }
    return categories.map((_, index) => `and-cat-${String(index)}`);
  }, [categories, openSeries, seasons]);
  useListNavigation('and-cats', catIds, 'vertical');

  const favSet = useMemo(
    () => (favorites.length > 0 ? new Set(favorites) : null),
    [favorites],
  );

  const episodeCountLabel = (n: number): string =>
    t('channels.episodeCount').replace('{n}', String(n));

  return (
    <div className="and-shell and-browse">
      <AndroidTopBar
        sectionLabel={sectionLabel}
        crumb={crumb}
        playlistName={playlistName}
        expiresLabel={expiresLabel}
        licensed={licensed}
      />
      <div className="and-body">
        <AndroidIconRail
          items={[
            { id: 'home', label: t('channels.home'), icon: '⌂', onClick: () => navigate('/') },
            { id: 'live', label: t('home.openLive'), icon: '📺', onClick: () => onSection('live') },
            {
              id: 'fav',
              label: t('menu.favorites'),
              icon: '♡',
              onClick: () => navigate('/favorites'),
            },
            {
              id: 'search',
              label: t('channels.searchLabel'),
              icon: '⌕',
              onClick: () => setSearchOpen((v) => !v),
            },
            {
              id: 'settings',
              label: t('menu.settings'),
              icon: '⚙',
              onClick: () => navigate('/settings'),
            },
            {
              id: 'exit',
              label: t('home.exit'),
              icon: '⏻',
              onClick: () => platform.platform.exitApp(),
            },
          ]}
        />

        <aside className="and-cats">
          {searchOpen && (
            <input
              className="and-search"
              type="search"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={t('channels.searchPlaceholder')}
              autoFocus
            />
          )}
          {openSeries ? (
            <Focusable
              focusId="and-series-back"
              focusGroup="and-cats"
              focusPriority={20}
              className="and-cat"
              onClick={() => setOpenSeries(null)}
            >
              <div className="and-cat-inner is-active">
                <span className="and-cat-name">← {t('channels.back')}</span>
                <span className="and-cat-count">{openSeries.title}</span>
              </div>
            </Focusable>
          ) : null}
          <div className="and-cat-scroll scrollbar-hidden">
            {openSeries && seasons.length > 1
              ? seasons.map((season, index) => {
                  const active = selectedSeason === season;
                  const count = openSeries.episodes.filter((ep) => ep.season === season).length;
                  return (
                    <Focusable
                      key={`season-${String(season)}`}
                      focusId={`and-season-${String(index)}`}
                      focusGroup="and-cats"
                      focusPriority={Math.max(0, 12 - index)}
                      className="and-cat"
                      onClick={() => setSelectedSeason(season)}
                    >
                      <div className={`and-cat-inner${active ? ' is-active' : ''}`}>
                        <span className="and-cat-name">
                          {t('channels.season').replace('{n}', String(season))}
                        </span>
                        <span className="and-cat-count">
                          {t('channels.total')}: {count}
                        </span>
                      </div>
                    </Focusable>
                  );
                })
              : categories.map((category, index) => {
                  const active = !openSeries && activeCategory === category.name;
                  return (
                    <Focusable
                      key={`${category.section}-${category.name}`}
                      focusId={`and-cat-${String(index)}`}
                      focusGroup="and-cats"
                      focusPriority={Math.max(0, 12 - index)}
                      className="and-cat"
                      onClick={() => {
                        setOpenSeries(null);
                        onSelectCategory(category.name);
                      }}
                    >
                      <div className={`and-cat-inner${active ? ' is-active' : ''}`}>
                        <span className="and-cat-name">{shortName(category.name)}</span>
                        <span className="and-cat-count">
                          {t('channels.total')}: {category.channelCount}
                        </span>
                      </div>
                    </Focusable>
                  );
                })}
          </div>
        </aside>

        <section className="and-main">
          {loading || indexing ? (
            <p className="and-empty">{t('channels.loading')}</p>
          ) : listCount === 0 ? (
            <p className="and-empty">{t('channels.noResults')}</p>
          ) : openSeries ? (
            <PosterGrid
              key={`eps-${openSeries.id}-${String(selectedSeason ?? 'all')}`}
              count={seasonEpisodes.length}
              getItem={(index) => {
                const ep = seasonEpisodes[index];
                if (!ep) return null;
                return {
                  id: ep.channel.id,
                  title: ep.channel.name,
                  logoUrl: ep.channel.logoUrl,
                  subtitle: `S${String(ep.season).padStart(2, '0')} E${String(ep.episode).padStart(2, '0')}`,
                  favorited: favSet?.has(ep.channel.id) ?? false,
                };
              }}
              onSelect={(index) => {
                const ep = seasonEpisodes[index];
                if (!ep) return;
                const zap = seasonEpisodes.map((item) => item.viewIndex);
                onSelectChannel(ep.channel, zap);
              }}
            />
          ) : seriesShows ? (
            <PosterGrid
              key={`series-${section}-${activeCategory ?? ''}`}
              count={seriesShows.length}
              getItem={(index) => {
                const show = seriesShows[index];
                if (!show) return null;
                return {
                  id: show.id,
                  title: show.title,
                  logoUrl: show.logoUrl,
                  subtitle: episodeCountLabel(show.episodeCount),
                  favorited: show.episodes.some((ep) => favSet?.has(ep.channel.id)),
                };
              }}
              onSelect={(index) => {
                const show = seriesShows[index];
                if (!show) return;
                if (show.episodeCount === 1 && show.episodes[0]) {
                  onSelectChannel(show.episodes[0].channel, [show.episodes[0].viewIndex]);
                  return;
                }
                setOpenSeries(show);
              }}
            />
          ) : vod ? (
            <PosterGrid
              key={`${section}-${activeCategory ?? ''}-${searchQuery}`}
              count={listCount}
              getItem={(index) => {
                const channel = getChannel(index);
                if (!channel) return null;
                return channelToPoster(channel, favSet?.has(channel.id) ?? false);
              }}
              onSelect={(index) => {
                const channel = getChannel(index);
                if (channel) onSelectChannel(channel);
              }}
            />
          ) : (
            <VirtualChannelList
              key={`${section}-${activeCategory ?? ''}-${searchQuery}`}
              count={listCount}
              getChannel={getChannel}
              onSelect={(channel) => onSelectChannel(channel)}
              favorites={favorites}
              showNumbers={showNumbers}
              focusGroup="and-channels"
              density="compact"
              onFocusChannel={setPreview}
            />
          )}
        </section>

        {!vod && (
          <aside className="and-preview">
            <div className="and-preview-stage">
              {preview ? (
                <ChannelLogo name={preview.name} logoUrl={preview.logoUrl} size="poster" />
              ) : (
                <p className="and-wordmark">
                  Iv<span>Player</span>
                </p>
              )}
            </div>
            <div className="and-epg">
              <p className="and-epg-title">{t('channels.tvPrograms')}</p>
              <p className="and-epg-sub">
                {preview ? preview.name : t('channels.selectChannel')}
              </p>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

function shortName(name: string): string {
  const cleaned = name
    .replace(/^[^|]*\|\s*/u, '')
    .replace(/^[A-Z]{2,3}\s*[|›»►→]\s*/u, '')
    .trim();
  return cleaned || name;
}
