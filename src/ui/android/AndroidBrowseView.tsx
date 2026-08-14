import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Focusable } from '@/ui/components/Focusable';
import { VirtualChannelList } from '@/ui/components/VirtualChannelList';
import { ChannelLogo } from '@/ui/components/ChannelLogo';
import { AndroidIconRail, AndroidTopBar } from './AndroidChrome';
import { PosterGrid } from './PosterGrid';
import type { Channel } from '@/domain/entities';
import type { ContentSection, SectionCategory } from '@/domain/content/contentSection';
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
  readonly onSelectChannel: (channel: Channel) => void;
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
  const vod = section === 'movie' || section === 'series';
  const crumb = searchQuery.trim() || activeCategory || sectionLabel;
  const catIds = useMemo(
    () => categories.map((_, index) => `and-cat-${String(index)}`),
    [categories],
  );
  useListNavigation('and-cats', catIds, 'vertical');

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
          <div className="and-cat-scroll scrollbar-hidden">
            {categories.map((category, index) => {
              const active = activeCategory === category.name;
              return (
                <Focusable
                  key={`${category.section}-${category.name}`}
                  focusId={`and-cat-${String(index)}`}
                  focusGroup="and-cats"
                  focusPriority={Math.max(0, 12 - index)}
                  className="and-cat"
                  onClick={() => onSelectCategory(category.name)}
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
          ) : vod ? (
            <PosterGrid
              key={`${section}-${activeCategory ?? ''}-${searchQuery}`}
              count={listCount}
              getChannel={getChannel}
              onSelect={onSelectChannel}
              favorites={favorites}
            />
          ) : (
            <VirtualChannelList
              key={`${section}-${activeCategory ?? ''}-${searchQuery}`}
              count={listCount}
              getChannel={getChannel}
              onSelect={onSelectChannel}
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
