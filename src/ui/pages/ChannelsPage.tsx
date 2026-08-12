import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Focusable } from '@/ui/components/Focusable';
import { VirtualChannelList } from '@/ui/components/VirtualChannelList';
import { useRouteFocus } from '@/ui/navigation/NavigationProvider';
import { usePlaylistStore, usePlayerStore } from '@/application/stores/playlistStore';
import { channelSession } from '@/application/channels/ChannelSessionStore';
import {
  channelIndex,
  platform,
  repositories,
  services,
  TOKENS,
} from '@/application/di/container';
import { loadPlaylistFromUrl } from '@/application/usecases/playlistUseCases';
import {
  emptyCatalog,
  playlistGroupsNeedRepair,
  type ContentCatalog,
  type ContentSection,
  type SectionCategory,
} from '@/domain/content/contentSection';
import type { Channel } from '@/domain/entities';
import { useRequireLicense } from '@/ui/hooks/useRequireLicense';
import { useLocale, useT } from '@/i18n/useT';
import type { MessageKey } from '@/i18n';

const SEARCH_DEBOUNCE_MS = 300;
const REQUIRE_FILTER_THRESHOLD = 2_000;

const SECTION_ORDER: readonly ContentSection[] = ['live', 'movie', 'series'];

const SECTION_TITLE_KEY: Record<ContentSection, MessageKey> = {
  live: 'section.live',
  movie: 'section.movie',
  series: 'section.series',
};

const SECTION_HINT_KEY: Record<ContentSection, MessageKey> = {
  live: 'section.liveHint',
  movie: 'section.movieHint',
  series: 'section.seriesHint',
};

const SECTION_META: Record<
  ContentSection,
  { readonly icon: string; readonly accent: string }
> = {
  live: {
    icon: 'LIVE',
    accent: 'from-error-500/35 to-surface-950',
  },
  movie: {
    icon: 'FILM',
    accent: 'from-warning-500/35 to-surface-950',
  },
  series: {
    icon: 'DIZI',
    accent: 'from-accent-500/35 to-surface-950',
  },
};

export function ChannelsPage(): ReactNode {
  useRouteFocus('channels');
  const navigate = useNavigate();
  const t = useT();
  const locale = useLocale();
  const numberLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  const { checking: licenseChecking, licensed } = useRequireLicense();
  const currentPlaylist = usePlaylistStore((s) => s.currentPlaylist);
  const activeCategory = usePlaylistStore((s) => s.activeCategory);
  const searchQuery = usePlaylistStore((s) => s.searchQuery);
  const contentSection = usePlaylistStore((s) => s.contentSection);
  const favorites = usePlaylistStore((s) => s.favorites);
  const showChannelNumbers = usePlaylistStore((s) => s.settings.showChannelNumbers);
  const setActiveCategory = usePlaylistStore((s) => s.setActiveCategory);
  const setSearchQuery = usePlaylistStore((s) => s.setSearchQuery);
  const setContentSection = usePlaylistStore((s) => s.setContentSection);
  const setFavorites = usePlaylistStore((s) => s.setFavorites);
  const setCurrentPlaylist = usePlaylistStore((s) => s.setCurrentPlaylist);
  const setLoading = usePlaylistStore((s) => s.setLoading);
  const setLoadProgress = usePlaylistStore((s) => s.setLoadProgress);

  const [catalog, setCatalog] = useState<ContentCatalog>(emptyCatalog);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [viewIndices, setViewIndices] = useState<readonly number[] | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [ready, setReady] = useState(false);
  const [repairMessage, setRepairMessage] = useState<string | null>(null);
  const repairAttempted = useRef(false);

  const channelCount = currentPlaylist?.channelCount ?? 0;
  const requireFilter = channelCount > REQUIRE_FILTER_THRESHOLD;
  const hasFilter = Boolean(searchQuery.trim() || activeCategory);

  const sectionCategories: readonly SectionCategory[] = useMemo(() => {
    return catalog[contentSection];
  }, [catalog, contentSection]);

  const availableSections = useMemo(() => {
    return SECTION_ORDER.filter((s) => catalog.counts[s] > 0);
  }, [catalog]);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!currentPlaylist) {
      navigate('/');
      return;
    }

    if (channelSession.getCount() === 0) {
      navigate('/');
      return;
    }

    setActiveCategory(null);
    setViewIndices(null);
    setSearchQuery('');
    setCatalogLoading(true);
    setRepairMessage(null);

    void repositories.favorites.getByPlaylist(currentPlaylist.id).then(setFavorites);

    let cancelled = false;
    void (async () => {
      // Re-parse URL playlists that were saved with broken group-title parsing.
      if (
        !repairAttempted.current &&
        currentPlaylist.source.type === 'url' &&
        playlistGroupsNeedRepair(channelSession.getAll())
      ) {
        repairAttempted.current = true;
        setRepairMessage(t('channels.repairing'));
        setLoading(true);
        setLoadProgress(0);
        try {
          const repaired = await loadPlaylistFromUrl(
            {
              network: platform.network,
              playlistRepo: repositories.playlists,
              recentRepo: repositories.recentPlaylists,
              channelIndex,
              channelRepo: repositories.channels,
              contentProviders: services.resolve(TOKENS.contentProviderRegistry),
              eventPublisher: services.resolve(TOKENS.eventPublisher),
              performanceMonitor: services.resolve(TOKENS.performanceMonitor),
            },
            currentPlaylist.source.location,
            (progress) => setLoadProgress(progress.loaded),
          );
          if (cancelled) return;
          setCurrentPlaylist(repaired);
          setLoading(false);
          setRepairMessage(null);
          return;
        } catch {
          if (!cancelled) {
            setRepairMessage(null);
            setLoading(false);
          }
        }
      }

      const built = await channelSession.ensureCatalog();
      if (cancelled) return;
      setCatalog(built);

      const preferred =
        SECTION_ORDER.find((s) => built.counts[s] > 0) ?? ('live' as ContentSection);
      if (built.counts[usePlaylistStore.getState().contentSection] === 0) {
        setContentSection(preferred);
      }
      setCatalogLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    currentPlaylist,
    navigate,
    setActiveCategory,
    setFavorites,
    setSearchQuery,
    setContentSection,
    setCurrentPlaylist,
    setLoading,
    setLoadProgress,
  ]);

  useEffect(() => {
    if (!currentPlaylist || !ready || catalogLoading) return;

    let cancelled = false;
    const query = searchQuery.trim();

    const apply = async (): Promise<void> => {
      if (query) {
        setIndexing(true);
        const indices = await channelSession.searchIndices(query, 500, contentSection);
        if (cancelled) return;
        setViewIndices(indices);
        setIndexing(false);
        return;
      }

      if (activeCategory) {
        setIndexing(true);
        const indices = await channelSession.collectGroupIndices(
          activeCategory,
          contentSection,
        );
        if (cancelled) return;
        setViewIndices(indices);
        setIndexing(false);
        return;
      }

      if (requireFilter) {
        setViewIndices(null);
        setIndexing(false);
        return;
      }

      setViewIndices(null);
      setIndexing(false);
    };

    const timer = window.setTimeout(() => {
      void apply();
    }, query ? SEARCH_DEBOUNCE_MS : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    currentPlaylist,
    searchQuery,
    activeCategory,
    contentSection,
    ready,
    requireFilter,
    catalogLoading,
  ]);

  const showList = !requireFilter || hasFilter;
  const showCategoryPicker = requireFilter && !hasFilter && !catalogLoading;
  const listCount = showList
    ? (viewIndices?.length ?? (requireFilter ? 0 : channelSession.getCount()))
    : 0;

  const getChannel = useCallback(
    (index: number): Channel | null => {
      if (viewIndices) {
        const realIndex = viewIndices[index];
        return realIndex === undefined ? null : channelSession.getAt(realIndex);
      }
      return channelSession.getAt(index);
    },
    [viewIndices],
  );

  const handleChannelSelect = useCallback(
    (channel: Channel) => {
      channelSession.remember(channel);
      channelSession.setZapContext(viewIndices);
      usePlayerStore.getState().setActiveChannel(channel);
      navigate(`/player/${channel.id}`);
    },
    [navigate, viewIndices],
  );

  const selectCategory = useCallback(
    (name: string) => {
      setActiveCategory(name);
      setSearchQuery('');
    },
    [setActiveCategory, setSearchQuery],
  );

  const searchPlaceholder = t('channels.searchPlaceholder');

  if (licenseChecking || !licensed) return null;
  if (!currentPlaylist) return null;

  const sectionLabel = t(SECTION_TITLE_KEY[contentSection]);
  const sectionMeta = SECTION_META[contentSection];
  const sectionHint = t(SECTION_HINT_KEY[contentSection]);

  return (
    <div className="flex h-full bg-surface-950">
      {/* Left rail */}
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-surface-700 bg-surface-900">
        <div className="border-b border-surface-700 px-6 py-5">
          <p className="text-sm font-medium uppercase tracking-wider text-accent-300">
            IvPlayer
          </p>
          <h2 className="mt-1 truncate text-2xl font-bold text-white">{currentPlaylist.name}</h2>
          <p className="mt-1 text-base text-slate-400">
            {channelCount.toLocaleString(numberLocale)} {t('channels.content')}
          </p>
          {repairMessage && (
            <p className="mt-3 text-sm text-warning-300">{repairMessage}</p>
          )}
        </div>

        <div className="flex flex-col gap-3 border-b border-surface-700 p-4">
          {availableSections.map((section) => {
            const active = contentSection === section;
            const meta = SECTION_META[section];
            return (
              <Focusable
                key={section}
                focusId={`section-${section}`}
                focusGroup="sections"
                focusPriority={section === 'live' ? 12 : section === 'movie' ? 11 : 10}
                className="block w-full"
                onClick={() => {
                  setContentSection(section);
                  setActiveCategory(null);
                  setSearchQuery('');
                  setViewIndices(null);
                }}
              >
                <div
                  className={`flex items-center gap-4 rounded-2xl px-4 py-4 transition-colors [.focused_&]:ring-2 [.focused_&]:ring-accent-400 ${
                    active
                      ? 'bg-accent-500 text-white'
                      : 'bg-surface-800 text-slate-200 hover:bg-surface-700'
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl text-xs font-bold tracking-wide ${
                      active ? 'bg-white/20 text-white' : 'bg-surface-700 text-accent-300'
                    }`}
                  >
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xl font-semibold">
                      {t(SECTION_TITLE_KEY[section])}
                    </div>
                    <div className={`text-sm ${active ? 'text-white/80' : 'text-slate-400'}`}>
                      {catalog.counts[section].toLocaleString(numberLocale)} ·{' '}
                      {t(SECTION_HINT_KEY[section])}
                    </div>
                  </div>
                </div>
              </Focusable>
            );
          })}
        </div>

        <div className="border-b border-surface-700 p-4">
          <label className="mb-2 block text-sm font-medium text-slate-400">
            {t('channels.searchLabel')}
          </label>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-2xl border-2 border-surface-600 bg-surface-800 px-5 py-4 text-xl text-white placeholder:text-slate-500 focus:border-accent-400 focus:outline-none"
          />
        </div>

        {activeCategory && (
          <div className="border-b border-surface-700 px-4 py-3">
            <Focusable
              focusId="clear-category"
              focusGroup="categories"
              className="block w-full"
              onClick={() => setActiveCategory(null)}
            >
              <div className="rounded-xl bg-surface-800 px-4 py-3 text-center text-lg text-slate-200 [.focused_&]:bg-accent-500 [.focused_&]:text-white">
                {t('channels.allCategories')}
              </div>
            </Focusable>
          </div>
        )}

        <div className="scrollbar-hidden flex-1 overflow-y-auto p-4">
          <p className="mb-3 px-1 text-sm font-semibold uppercase tracking-wider text-slate-500">
            {t('channels.categories')}
          </p>
          {catalogLoading ? (
            <p className="px-2 py-4 text-lg text-slate-500">{t('channels.indexing')}</p>
          ) : sectionCategories.length === 0 ? (
            <p className="px-2 py-4 text-lg text-slate-500">{t('channels.noCategory')}</p>
          ) : (
            sectionCategories.slice(0, 40).map((category, index) => (
              <Focusable
                key={`${category.section}-${category.name}`}
                focusId={`cat-side-${contentSection}-${String(index)}`}
                focusGroup="categories"
                focusPriority={Math.max(0, 8 - index)}
                className="mb-2 block w-full"
                onClick={() => selectCategory(category.name)}
              >
                <div
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 text-lg transition-colors [.focused_&]:bg-accent-500 [.focused_&]:text-white ${
                    activeCategory === category.name
                      ? 'bg-accent-500/25 text-accent-300'
                      : 'bg-surface-800/80 text-slate-200 hover:bg-surface-700'
                  }`}
                >
                  <span className="min-w-0 truncate font-medium">{shortCategoryName(category.name)}</span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm tabular-nums ${
                      activeCategory === category.name
                        ? 'bg-white/20 text-white'
                        : 'bg-surface-700 text-slate-400'
                    }`}
                  >
                    {category.channelCount.toLocaleString(numberLocale)}
                  </span>
                </div>
              </Focusable>
            ))
          )}
          {!catalogLoading && sectionCategories.length > 40 && (
            <p className="mt-2 px-2 text-sm text-slate-500">
              +{(sectionCategories.length - 40).toLocaleString(numberLocale)}{' '}
              {t('channels.moreCategories')}
            </p>
          )}
        </div>

        <Focusable
          focusId="back-home"
          focusGroup="categories"
          className="m-4 block"
          onClick={() => navigate('/')}
        >
          <div className="rounded-2xl bg-surface-800 py-4 text-center text-xl font-medium text-slate-200 [.focused_&]:bg-surface-700">
            {t('channels.home')}
          </div>
        </Focusable>
      </aside>

      {/* Main stage */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b ${sectionMeta.accent} opacity-80`}
        />

        <header className="relative z-10 flex items-end justify-between gap-6 px-10 pb-4 pt-8">
          <div className="min-w-0">
            <p className="text-base text-slate-300">
              {searchQuery.trim()
                ? t('channels.searchResults')
                : activeCategory
                  ? sectionLabel
                  : t('channels.selectCategory')}
            </p>
            <h1 className="mt-1 truncate text-4xl font-bold text-white">
              {searchQuery.trim()
                ? `"${searchQuery.trim()}"`
                : activeCategory
                  ? shortCategoryName(activeCategory)
                  : sectionLabel}
              {indexing ? '…' : ''}
            </h1>
          </div>
          {showList && (
            <span className="shrink-0 rounded-full bg-surface-800 px-5 py-2 text-lg text-slate-300">
              {listCount.toLocaleString(numberLocale)} {t('channels.results')}
            </span>
          )}
        </header>

        <div className="relative z-10 flex-1 overflow-hidden px-6 pb-6">
          {!ready || catalogLoading || indexing ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-2xl text-slate-300">{t('channels.loading')}</p>
            </div>
          ) : showCategoryPicker ? (
            <CategoryGrid
              categories={sectionCategories}
              section={contentSection}
              onSelect={selectCategory}
            />
          ) : !showList ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-12 text-center">
              <p className="text-3xl font-semibold text-white">{sectionLabel}</p>
              <p className="max-w-2xl text-xl text-slate-400">{sectionHint}</p>
            </div>
          ) : listCount === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-2xl text-slate-400">{t('channels.noResults')}</p>
            </div>
          ) : (
            <VirtualChannelList
              count={listCount}
              getChannel={getChannel}
              onSelect={handleChannelSelect}
              favorites={favorites}
              showNumbers={showChannelNumbers && contentSection === 'live'}
              focusGroup="channels"
            />
          )}
        </div>
      </main>
    </div>
  );
}

function CategoryGrid({
  categories,
  section,
  onSelect,
}: {
  readonly categories: readonly SectionCategory[];
  readonly section: ContentSection;
  readonly onSelect: (name: string) => void;
}): ReactNode {
  const t = useT();
  const locale = useLocale();
  const numberLocale = locale === 'tr' ? 'tr-TR' : 'en-US';
  if (categories.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-xl text-slate-400">{t('channels.noCategory')}</p>
      </div>
    );
  }

  return (
    <div className="scrollbar-hidden h-full overflow-y-auto px-4 pb-4">
      <p className="mb-5 text-lg text-slate-300">
        {t('channels.pickCategory').replace('{s}', t(SECTION_TITLE_KEY[section]))}
      </p>
      <div className="grid grid-cols-3 gap-5">
        {categories.map((category, index) => (
          <Focusable
            key={`${category.section}-${category.name}`}
            focusId={`cat-grid-${section}-${String(index)}`}
            focusGroup={`category-grid-${section}`}
            focusPriority={Math.max(0, 20 - index)}
            className="block h-36"
            onClick={() => onSelect(category.name)}
          >
            <div className="flex h-full flex-col justify-between rounded-2xl border border-surface-600 bg-surface-800 p-5 transition-colors [.focused_&]:border-accent-400 [.focused_&]:bg-accent-500 [.focused_&]:text-white hover:bg-surface-700">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-700 text-sm font-bold text-accent-300 [.focused_&]:bg-white/20 [.focused_&]:text-white">
                  {categoryTileIcon(category.name, section)}
                </span>
                <span className="rounded-full bg-surface-700 px-3 py-1 text-sm tabular-nums text-slate-300 [.focused_&]:bg-white/20 [.focused_&]:text-white">
                  {category.channelCount.toLocaleString(numberLocale)}
                </span>
              </div>
              <h3 className="line-clamp-2 text-xl font-semibold leading-snug text-white">
                {shortCategoryName(category.name)}
              </h3>
            </div>
          </Focusable>
        ))}
      </div>
    </div>
  );
}

function shortCategoryName(name: string): string {
  // "TR|FILM ► Disney +" → "Disney +"
  const cleaned = name
    .replace(/^[^|]*\|\s*/u, '')
    .replace(/^[A-Z]{2,3}\s*[|›»►→]\s*/u, '')
    .replace(/^[^\w\u00C0-\u024F]+/u, '')
    .trim();
  return cleaned || name;
}

function categoryTileIcon(name: string, section: ContentSection): string {
  const n = name.toLowerCase();
  if (/spor|sport/i.test(n)) return 'SP';
  if (/haber|news/i.test(n)) return 'HB';
  if (/çocuk|cocuk|kids|child/i.test(n)) return 'CK';
  if (/netflix/i.test(n)) return 'NF';
  if (/disney/i.test(n)) return 'DN';
  if (/anim/i.test(n)) return 'AN';
  if (section === 'movie') return 'FM';
  if (section === 'series') return 'DZ';
  return 'TV';
}
