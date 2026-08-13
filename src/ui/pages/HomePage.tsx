import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Focusable } from '@/ui/components/Focusable';
import { Card } from '@/ui/components/Card';
import { useRouteFocus, useScreenGraph } from '@/ui/navigation/NavigationProvider';
import type { NavigationScreenGraph, NavigationNode } from '@/ui/navigation/NavigationGraph';
import { usePlaylistStore } from '@/application/stores/playlistStore';
import { channelIndex, repositories, platform, services, TOKENS } from '@/application/di/container';
import { yieldToMain } from '@/infrastructure/async/yieldToMain';
import {
  loadPlaylistFromFile,
  loadPlaylistFromUrl,
} from '@/application/usecases/playlistUseCases';
import {
  activateLicense,
  claimDeviceLicense,
  validateStoredLicense,
} from '@/application/usecases/licenseUseCases';
import { playlistGroupsNeedRepair } from '@/domain/content/contentSection';
import type { LicenseSnapshot } from '@/domain/license/types';
import {
  formatPurchaseCode,
  getOrCreateDeviceId,
} from '@/infrastructure/license/DeviceIdentity';
import { playlistRequiresLicense } from '@/domain/license/storeBuild';
import { licenseErrorKey, type MessageKey } from '@/i18n';
import { useLocale, useT } from '@/i18n/useT';

/** Store / production: playlist URL only after a device-bound player license. */
const STORE_BUILD = playlistRequiresLicense();
const BUY_SITE = 'https://ivplayer.tr/activation.html';

function formatPlaylistLoadError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.trim();
    if (msg) return msg;
    if (error.name === 'AbortError') return 'Playlist indirme zaman aşımı';
    if (error.name) return `Playlist yüklenemedi (${error.name})`;
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'Playlist yüklenemedi';
}

const ALL_MENU_ITEMS = [
  {
    id: 'check',
    titleKey: 'menu.checkLicense' as const satisfies MessageKey,
    subtitleKey: 'menu.checkLicenseSub' as const satisfies MessageKey,
    icon: '↻',
    action: 'check' as const,
  },
  {
    id: 'activate',
    titleKey: 'menu.activate' as const satisfies MessageKey,
    subtitleKey: 'menu.activateSub' as const satisfies MessageKey,
    icon: '🔑',
    action: 'activate' as const,
  },
  {
    id: 'open-file',
    titleKey: 'menu.openFile' as const satisfies MessageKey,
    subtitleKey: 'menu.openFileSub' as const satisfies MessageKey,
    icon: '📁',
    action: 'file' as const,
  },
  {
    id: 'open-url',
    titleKey: 'menu.openUrl' as const satisfies MessageKey,
    subtitleKey: 'menu.openUrlSub' as const satisfies MessageKey,
    icon: '🌐',
    action: 'url' as const,
  },
  {
    id: 'favorites',
    titleKey: 'menu.favorites' as const satisfies MessageKey,
    subtitleKey: 'menu.favoritesSub' as const satisfies MessageKey,
    icon: '★',
    action: 'navigate' as const,
    path: '/favorites',
  },
  {
    id: 'history',
    titleKey: 'menu.history' as const satisfies MessageKey,
    subtitleKey: 'menu.historySub' as const satisfies MessageKey,
    icon: '🕐',
    action: 'navigate' as const,
    path: '/history',
  },
  {
    id: 'settings',
    titleKey: 'menu.settings' as const satisfies MessageKey,
    subtitleKey: 'menu.settingsSub' as const satisfies MessageKey,
    icon: '⚙',
    action: 'navigate' as const,
    path: '/settings',
  },
] as const;

type MenuItem = (typeof ALL_MENU_ITEMS)[number];

function menuItemsForLicense(licensed: boolean): readonly MenuItem[] {
  if (!STORE_BUILD) {
    return ALL_MENU_ITEMS;
  }
  // Free store app: URL/file only after website purchase is bound to this device.
  if (!licensed) {
    return ALL_MENU_ITEMS.filter(
      (item) =>
        item.action === 'check' ||
        item.action === 'activate' ||
        (item.action === 'navigate' && item.path === '/settings'),
    );
  }
  return ALL_MENU_ITEMS.filter((item) => item.action !== 'activate');
}

function buildHomeGraph(
  menuItems: readonly MenuItem[],
  hasLicenseShortcut: boolean,
): NavigationScreenGraph {
  const nodes: NavigationNode[] = menuItems.map((item, index) => ({
    id: `menu-${item.id}`,
    group: 'home-menu',
    isDefault: index === 0,
    priority: 10 - index,
    neighbors: {
      ...(index > 0 ? { left: `menu-${menuItems[index - 1]?.id}` } : {}),
      ...(index < menuItems.length - 1 ? { right: `menu-${menuItems[index + 1]?.id}` } : {}),
    },
  }));

  if (hasLicenseShortcut) {
    nodes.push({
      id: 'license-open',
      group: 'home-license',
      isDefault: false,
      priority: 15,
      neighbors: { down: 'menu-check' },
    });
  }

  nodes.push({
    id: 'device-card',
    group: 'home-device',
    isDefault: !hasLicenseShortcut,
    priority: 16,
    neighbors: { down: hasLicenseShortcut ? 'license-open' : 'menu-check' },
  });

  return {
    screenId: 'home',
    defaultFocusId: hasLicenseShortcut ? 'license-open' : 'device-card',
    nodes,
  };
}

export function HomePage(): ReactNode {
  const t = useT();
  const locale = useLocale();
  const [licenseSnapshot, setLicenseSnapshot] = useState<LicenseSnapshot | null>(null);
  const [licenseChecked, setLicenseChecked] = useState(false);
  const menuItems = useMemo(
    () => menuItemsForLicense(Boolean(licenseSnapshot)),
    [licenseSnapshot],
  );
  const homeGraph = useMemo(
    () => buildHomeGraph(menuItems, Boolean(licenseSnapshot)),
    [licenseSnapshot, menuItems],
  );

  useRouteFocus('home');
  useScreenGraph('home', homeGraph);
  const navigate = useNavigate();
  const [urlDialogOpen, setUrlDialogOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [activateDialogOpen, setActivateDialogOpen] = useState(false);
  const [activateCode, setActivateCode] = useState('');
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const [checkingLicense, setCheckingLicense] = useState(false);
  const [deviceCode, setDeviceCode] = useState('');

  const {
    isLoading,
    loadProgress,
    loadError,
    recentPlaylists,
    setLoading,
    setLoadProgress,
    setLoadError,
    setCurrentPlaylist,
    setRecentPlaylists,
  } = usePlaylistStore();

  const licenseDeps = useCallback(
    () => ({
      licenseClient: services.resolve(TOKENS.licenseClient),
      storage: platform.storage,
      licenseStore: services.resolve(TOKENS.licenseStore),
    }),
    [],
  );

  const loadPlaylistUrl = useCallback(
    async (url: string): Promise<void> => {
      setLoading(true);
      setLoadError(null);
      setLoadProgress(0);
      try {
        const playlist = await loadPlaylistFromUrl(
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
          url,
          (progress) => setLoadProgress(progress.loaded),
        );
        setCurrentPlaylist(playlist);
        setLoading(false);
        await yieldToMain();
        const recent = await repositories.recentPlaylists.getRecent(10);
        setRecentPlaylists(recent);
        await yieldToMain();
        navigate('/channels');
      } catch (error) {
        setLoadError(formatPlaylistLoadError(error));
        setLoading(false);
      }
    },
    [
      navigate,
      setCurrentPlaylist,
      setLoadError,
      setLoadProgress,
      setLoading,
      setRecentPlaylists,
    ],
  );

  useEffect(() => {
    void (async () => {
      const deviceId = await getOrCreateDeviceId(platform.storage);
      setDeviceCode(formatPurchaseCode(deviceId));

      const validated = await validateStoredLicense(licenseDeps());
      if (validated.ok) {
        setLicenseSnapshot(validated.snapshot);
        const recent = await repositories.recentPlaylists.getRecent(10);
        setRecentPlaylists(recent);
      } else {
        setLicenseSnapshot(null);
        if (STORE_BUILD) {
          setCurrentPlaylist(null);
          setRecentPlaylists([]);
          await repositories.recentPlaylists.clear();
        } else {
          const recent = await repositories.recentPlaylists.getRecent(10);
          setRecentPlaylists(recent);
        }
      }
      setLicenseChecked(true);
    })();
  }, [licenseDeps, setCurrentPlaylist, setRecentPlaylists]);

  const handleLoadFile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setLoadProgress(0);

    const loadDeps = {
      filePicker: platform.filePicker,
      playlistRepo: repositories.playlists,
      recentRepo: repositories.recentPlaylists,
      channelIndex,
      channelRepo: repositories.channels,
      contentProviders: services.resolve(TOKENS.contentProviderRegistry),
      eventPublisher: services.resolve(TOKENS.eventPublisher),
      performanceMonitor: services.resolve(TOKENS.performanceMonitor),
    };

    try {
      const playlist = await loadPlaylistFromFile(loadDeps, (progress) =>
        setLoadProgress(progress.loaded),
      );
      setCurrentPlaylist(playlist);
      setLoading(false);
      await yieldToMain();
      const recent = await repositories.recentPlaylists.getRecent(10);
      setRecentPlaylists(recent);
      await yieldToMain();
      navigate('/channels');
    } catch (error) {
      setLoadError(formatPlaylistLoadError(error));
      setLoading(false);
    }
  }, [navigate, setCurrentPlaylist, setLoadError, setLoadProgress, setLoading, setRecentPlaylists]);

  const handleLoadUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlDialogOpen(false);
    await loadPlaylistUrl(urlInput.trim());
    setUrlInput('');
  }, [loadPlaylistUrl, urlInput]);

  const handleCheckLicense = useCallback(async () => {
    if (checkingLicense) return;
    setCheckingLicense(true);
    setLoadError(null);
    try {
      const label = platform.platform.getDeviceInfo().model;
      const result = await claimDeviceLicense(licenseDeps(), label);
      if (!result.ok) {
        setLoadError(t(licenseErrorKey(result.error === 'not_found' ? 'not_found' : result.error)));
        return;
      }
      const snapshot: LicenseSnapshot = {
        token: result.token,
        deviceId: await getOrCreateDeviceId(platform.storage),
        expiresAt: result.expiresAt,
        playlistUrl: result.playlistUrl,
        planName: result.planName,
        activatedAt: Date.now(),
      };
      setLicenseSnapshot(snapshot);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t(licenseErrorKey('unknown')));
    } finally {
      setCheckingLicense(false);
    }
  }, [checkingLicense, licenseDeps, setLoadError, t]);

  const handleBuyOnSite = useCallback(() => {
    const url = deviceCode
      ? `${BUY_SITE}?device=${encodeURIComponent(deviceCode)}`
      : BUY_SITE;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      /* TV may block window.open — URL is shown on screen */
    }
  }, [deviceCode]);

  const handleActivateSubmit = useCallback(async () => {
    if (!activateCode.trim() || activating) return;
    setActivating(true);
    setActivateError(null);
    try {
      const label = platform.platform.getDeviceInfo().model;
      const result = await activateLicense(licenseDeps(), activateCode.trim(), label);
      if (!result.ok) {
        setActivateError(t(licenseErrorKey(result.error)));
        setActivating(false);
        return;
      }
      const snapshot: LicenseSnapshot = {
        token: result.token,
        deviceId: (await getOrCreateDeviceId(platform.storage)),
        expiresAt: result.expiresAt,
        playlistUrl: result.playlistUrl,
        planName: result.planName,
        activatedAt: Date.now(),
      };
      setLicenseSnapshot(snapshot);
      setActivateDialogOpen(false);
      services.resolve(TOKENS.navigationGraph).popModal();
      setActivateCode('');
      setActivating(false);
      if (result.playlistUrl?.trim()) {
        await loadPlaylistUrl(result.playlistUrl);
      }
    } catch (error) {
      setActivateError(error instanceof Error ? error.message : t(licenseErrorKey('unknown')));
      setActivating(false);
    }
  }, [activateCode, activating, licenseDeps, loadPlaylistUrl, t]);

  const handleOpenLicensedPlaylist = useCallback(async () => {
    if (licenseSnapshot?.playlistUrl?.trim()) {
      await loadPlaylistUrl(licenseSnapshot.playlistUrl);
      return;
    }
    services.resolve(TOKENS.navigationGraph).pushModal('url-dialog');
    setUrlDialogOpen(true);
  }, [licenseSnapshot, loadPlaylistUrl]);

  const handleMenuAction = (action: MenuItem): void => {
    if (action.action === 'check') {
      void handleCheckLicense();
    } else if (action.action === 'activate') {
      setActivateError(null);
      services.resolve(TOKENS.navigationGraph).pushModal('activate-dialog');
      setActivateDialogOpen(true);
    } else if (action.action === 'file') {
      void handleLoadFile();
    } else if (action.action === 'url') {
      services.resolve(TOKENS.navigationGraph).pushModal('url-dialog');
      setUrlDialogOpen(true);
    } else if (action.action === 'navigate') {
      navigate(action.path);
    }
  };

  const handleRecentSelect = async (playlistId: string): Promise<void> => {
    if (STORE_BUILD && !licenseSnapshot) return;

    let playlist = await repositories.playlists.getById(
      playlistId as import('@/domain/entities').PlaylistId,
    );
    if (!playlist) return;

    const shouldRefetch =
      playlist.source.type === 'url' &&
      (playlist.channels.length === 0 || playlistGroupsNeedRepair(playlist.channels));

    if (shouldRefetch) {
      setLoading(true);
      setLoadProgress(0);
      try {
        playlist = await loadPlaylistFromUrl(
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
          playlist.source.location,
          (progress) => setLoadProgress(progress.loaded),
        );
      } finally {
        setLoading(false);
      }
    }

    setCurrentPlaylist(playlist);
    await yieldToMain();
    navigate('/channels');
  };

  const expiresLabel = licenseSnapshot
    ? new Date(licenseSnapshot.expiresAt).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US')
    : '';

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-surface-950 via-surface-900 to-surface-950">
      <header className="flex items-center justify-between px-16 pt-12 pb-8">
        <div>
          <h1 className="text-5xl font-bold tracking-tight text-white">
            Iv<span className="text-accent-400">Player</span>
          </h1>
          <p className="mt-2 text-xl text-slate-400">{t('app.tagline')}</p>
        </div>
        <div className="text-right text-lg text-slate-500">
          <div>{platform.platform.getDeviceInfo().platform.toUpperCase()}</div>
          {deviceCode && (
            <div className="mt-1 font-mono text-sm text-slate-500">
              {t('home.device')} {deviceCode}
            </div>
          )}
        </div>
      </header>

      {licenseChecked && STORE_BUILD && (
        <section className="mx-16 mb-6">
          <Focusable
            focusId="device-card"
            focusGroup="home-device"
            focusPriority={16}
            className="block w-full"
            onClick={handleBuyOnSite}
          >
            <div className="rounded-2xl border border-white/10 bg-surface-900/80 px-8 py-6 [.focused_&]:border-accent-400">
              <p className="text-sm font-medium uppercase tracking-wider text-accent-300">
                {t('home.device')}
              </p>
              <p className="mt-2 font-mono text-4xl font-bold tracking-[0.18em] text-white">
                {deviceCode || '…'}
              </p>
              <p className="mt-3 max-w-3xl text-base text-slate-400">{t('home.deviceHint')}</p>
              <p className="mt-2 text-lg text-accent-300">
                {t('home.buyOnSite')}: {t('home.buyUrl')}
              </p>
            </div>
          </Focusable>
        </section>
      )}

      {isLoading && (
        <div className="mx-16 mb-6 rounded-xl bg-surface-800 px-6 py-4">
          <p className="text-lg text-accent-300">
            {t('home.loadingPlaylist')} {loadProgress.toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-700">
            <div className="h-full animate-pulse bg-accent-500" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {loadError && (
        <div className="mx-16 mb-6 rounded-xl border-2 border-red-500 bg-red-950 px-6 py-4 text-lg text-white">
          {loadError}
        </div>
      )}

      {licenseSnapshot && (
        <section className="mx-16 mb-6">
          <Focusable
            focusId="license-open"
            focusGroup="home-license"
            focusPriority={15}
            className="block w-full"
            onClick={() => void handleOpenLicensedPlaylist()}
          >
            <div className="flex items-center justify-between rounded-2xl border border-accent-500/40 bg-accent-500/15 px-8 py-5 [.focused_&]:border-accent-400 [.focused_&]:bg-accent-500/25">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-accent-300">
                  {t('home.licenseActive')} · {licenseSnapshot.planName}
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  {licenseSnapshot.playlistUrl?.trim()
                    ? t('home.openLicensed')
                    : t('home.addPlaylist')}
                </p>
                <p className="mt-1 text-base text-slate-400">
                  {t('home.expires')}: {expiresLabel}
                </p>
              </div>
              <span className="rounded-xl bg-accent-500 px-6 py-3 text-lg font-semibold text-white">
                {licenseSnapshot.playlistUrl?.trim() ? t('home.open') : t('home.add')}
              </span>
            </div>
          </Focusable>
        </section>
      )}

      <section className="px-16 pb-8">
        <h2 className="mb-6 text-2xl font-semibold text-slate-300">{t('home.quickActions')}</h2>
        <div
          className={`grid gap-6 ${
            STORE_BUILD
              ? menuItems.length <= 2
                ? 'grid-cols-2'
                : 'grid-cols-2 xl:grid-cols-4'
              : 'grid-cols-3 xl:grid-cols-6'
          }`}
        >
          {menuItems.map((item, index) => (
            <Focusable
              key={item.id}
              focusId={`menu-${item.id}`}
              focusGroup="home-menu"
              focusPriority={10 - index}
              className="h-48"
              onClick={() => handleMenuAction(item)}
            >
              <Card
                title={t(item.titleKey)}
                subtitle={t(item.subtitleKey)}
                icon={item.icon}
                focused={false}
                className="h-full"
              />
            </Focusable>
          ))}
        </div>
      </section>

      {licenseChecked && STORE_BUILD && !licenseSnapshot && (
        <section className="mx-16 mb-6 rounded-2xl border border-surface-600 bg-surface-900/80 px-8 py-5">
          <p className="text-xl font-semibold text-white">{t('home.licenseRequired')}</p>
          <p className="mt-1 text-base text-slate-400">{t('home.licenseRequiredHint')}</p>
        </section>
      )}

      {recentPlaylists.length > 0 && (!STORE_BUILD || Boolean(licenseSnapshot)) && (
        <section className="flex-1 px-16 pb-12">
          <h2 className="mb-6 text-2xl font-semibold text-slate-300">{t('home.recent')}</h2>
          <div className="flex gap-6 overflow-x-auto pb-4">
            {recentPlaylists.map((entry, index) => (
              <Focusable
                key={entry.id}
                focusId={`recent-${entry.id}`}
                focusGroup="home-recent"
                focusPriority={5 - index}
                className="h-40 w-72 shrink-0"
                onClick={() => void handleRecentSelect(entry.id)}
              >
                <Card
                  title={entry.name}
                  subtitle={entry.source.type === 'url' ? entry.source.location : entry.source.label}
                  icon="📺"
                  badge={entry.source.type}
                  className="h-full"
                />
              </Focusable>
            ))}
          </div>
        </section>
      )}

      {urlDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-[720px] rounded-2xl bg-surface-800 p-8">
            <h3 className="mb-4 text-3xl font-semibold text-white">{t('url.title')}</h3>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/playlist.m3u"
              className="mb-6 w-full rounded-xl border-2 border-surface-600 bg-surface-900 px-6 py-4 text-xl text-white focus:border-accent-500 focus:outline-none"
              autoFocus
            />
            <div className="flex gap-4">
              <Focusable
                focusId="url-load"
                focusGroup="url-dialog"
                focusPriority={2}
                className="flex-1"
                onClick={() => void handleLoadUrl()}
              >
                <div className="rounded-xl bg-accent-500 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-accent-400">
                  {t('url.load')}
                </div>
              </Focusable>
              <Focusable
                focusId="url-cancel"
                focusGroup="url-dialog"
                focusPriority={1}
                className="flex-1"
                onClick={() => {
                  services.resolve(TOKENS.navigationGraph).popModal();
                  setUrlDialogOpen(false);
                }}
              >
                <div className="rounded-xl bg-surface-700 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-surface-600">
                  {t('url.cancel')}
                </div>
              </Focusable>
            </div>
          </div>
        </div>
      )}

      {activateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-[760px] rounded-2xl bg-surface-800 p-8">
            <h3 className="mb-2 text-3xl font-semibold text-white">{t('activate.title')}</h3>
            <p className="mb-6 text-lg text-slate-400">
              {t('activate.hint')}{' '}
              <span className="font-mono text-accent-300">{deviceCode || '…'}</span>
            </p>
            <input
              type="text"
              value={activateCode}
              onChange={(e) => setActivateCode(e.target.value.toUpperCase())}
              placeholder="DEMO-2026"
              className="mb-4 w-full rounded-xl border-2 border-surface-600 bg-surface-900 px-6 py-5 text-center text-3xl font-semibold tracking-widest text-white focus:border-accent-500 focus:outline-none"
              autoFocus
              autoCapitalize="characters"
              spellCheck={false}
            />
            {activateError && (
              <p className="mb-4 text-lg text-error-500">{activateError}</p>
            )}
            <div className="flex gap-4">
              <Focusable
                focusId="activate-submit"
                focusGroup="activate-dialog"
                focusPriority={2}
                className="flex-1"
                disabled={activating}
                onClick={() => void handleActivateSubmit()}
              >
                <div className="rounded-xl bg-accent-500 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-accent-400">
                  {activating ? t('activate.activating') : t('activate.submit')}
                </div>
              </Focusable>
              <Focusable
                focusId="activate-cancel"
                focusGroup="activate-dialog"
                focusPriority={1}
                className="flex-1"
                onClick={() => {
                  services.resolve(TOKENS.navigationGraph).popModal();
                  setActivateDialogOpen(false);
                  setActivateError(null);
                }}
              >
                <div className="rounded-xl bg-surface-700 py-4 text-center text-xl font-semibold text-white [.focused_&]:bg-surface-600">
                  {t('activate.cancel')}
                </div>
              </Focusable>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
