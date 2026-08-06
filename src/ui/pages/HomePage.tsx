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
  LICENSE_ERROR_MESSAGES_TR,
  validateStoredLicense,
} from '@/application/usecases/licenseUseCases';
import { playlistGroupsNeedRepair } from '@/domain/content/contentSection';
import type { LicenseSnapshot } from '@/domain/license/types';
import {
  getOrCreateDeviceId,
  shortDeviceId,
} from '@/infrastructure/license/DeviceIdentity';

/** LG Content Store build: activation-only (no free-form M3U URL/file). */
const STORE_BUILD =
  String(import.meta.env.VITE_STORE_BUILD ?? '').toLowerCase() === 'true';

const ALL_MENU_ITEMS = [
  {
    id: 'activate',
    title: 'Aktive et',
    subtitle: 'Aktivasyon kodu ile bağlan',
    icon: '🔑',
    action: 'activate' as const,
  },
  {
    id: 'open-file',
    title: 'Open M3U File',
    subtitle: 'Browse and load a local playlist',
    icon: '📁',
    action: 'file' as const,
  },
  {
    id: 'open-url',
    title: 'Open Playlist URL',
    subtitle: 'Load from remote M3U/M3U8 URL',
    icon: '🌐',
    action: 'url' as const,
  },
  {
    id: 'favorites',
    title: 'Favorites',
    subtitle: 'Your starred channels',
    icon: '★',
    action: 'navigate' as const,
    path: '/favorites',
  },
  {
    id: 'history',
    title: 'History',
    subtitle: 'Recently watched channels',
    icon: '🕐',
    action: 'navigate' as const,
    path: '/history',
  },
  {
    id: 'settings',
    title: 'Settings',
    subtitle: 'Playback and app preferences',
    icon: '⚙',
    action: 'navigate' as const,
    path: '/settings',
  },
] as const;

type MenuItem = (typeof ALL_MENU_ITEMS)[number];

const MENU_ITEMS: readonly MenuItem[] = STORE_BUILD
  ? ALL_MENU_ITEMS.filter((item) => item.action !== 'file' && item.action !== 'url')
  : ALL_MENU_ITEMS;

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
      neighbors: { down: 'menu-activate' },
    });
  }

  return {
    screenId: 'home',
    defaultFocusId: hasLicenseShortcut ? 'license-open' : 'menu-activate',
    nodes,
  };
}

export function HomePage(): ReactNode {
  const [licenseSnapshot, setLicenseSnapshot] = useState<LicenseSnapshot | null>(null);
  const homeGraph = useMemo(
    () => buildHomeGraph(MENU_ITEMS, Boolean(licenseSnapshot)),
    [licenseSnapshot],
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
  const [deviceShort, setDeviceShort] = useState('');

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
        setLoadError(error instanceof Error ? error.message : 'Failed to load playlist');
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
      const recent = await repositories.recentPlaylists.getRecent(10);
      setRecentPlaylists(recent);

      const deviceId = await getOrCreateDeviceId(platform.storage);
      setDeviceShort(shortDeviceId(deviceId));

      const validated = await validateStoredLicense(licenseDeps());
      if (validated.ok) {
        setLicenseSnapshot(validated.snapshot);
      } else {
        setLicenseSnapshot(null);
      }
    })();
  }, [licenseDeps, setRecentPlaylists]);

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
      setLoadError(error instanceof Error ? error.message : 'Failed to load playlist');
      setLoading(false);
    }
  }, [navigate, setCurrentPlaylist, setLoadError, setLoadProgress, setLoading, setRecentPlaylists]);

  const handleLoadUrl = useCallback(async () => {
    if (!urlInput.trim()) return;
    setUrlDialogOpen(false);
    await loadPlaylistUrl(urlInput.trim());
    setUrlInput('');
  }, [loadPlaylistUrl, urlInput]);

  const handleActivateSubmit = useCallback(async () => {
    if (!activateCode.trim() || activating) return;
    setActivating(true);
    setActivateError(null);
    try {
      const label = platform.platform.getDeviceInfo().model;
      const result = await activateLicense(licenseDeps(), activateCode.trim(), label);
      if (!result.ok) {
        setActivateError(LICENSE_ERROR_MESSAGES_TR[result.error]);
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
      await loadPlaylistUrl(result.playlistUrl);
    } catch (error) {
      setActivateError(error instanceof Error ? error.message : LICENSE_ERROR_MESSAGES_TR.unknown);
      setActivating(false);
    }
  }, [activateCode, activating, licenseDeps, loadPlaylistUrl]);

  const handleOpenLicensedPlaylist = useCallback(async () => {
    if (!licenseSnapshot?.playlistUrl) return;
    await loadPlaylistUrl(licenseSnapshot.playlistUrl);
  }, [licenseSnapshot, loadPlaylistUrl]);

  const handleMenuAction = (action: MenuItem): void => {
    if (action.action === 'activate') {
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
    ? new Date(licenseSnapshot.expiresAt).toLocaleDateString('tr-TR')
    : '';

  return (
    <div className="flex h-full flex-col bg-gradient-to-br from-surface-950 via-surface-900 to-surface-950">
      <header className="flex items-center justify-between px-16 pt-12 pb-8">
        <div>
          <h1 className="text-5xl font-bold tracking-tight text-white">
            Stream<span className="text-accent-400">Box</span> TV
          </h1>
          <p className="mt-2 text-xl text-slate-400">Premium IPTV for Smart TV</p>
        </div>
        <div className="text-right text-lg text-slate-500">
          <div>{platform.platform.getDeviceInfo().platform.toUpperCase()}</div>
          {deviceShort && (
            <div className="mt-1 font-mono text-sm text-slate-600">Cihaz {deviceShort}</div>
          )}
        </div>
      </header>

      {isLoading && (
        <div className="mx-16 mb-6 rounded-xl bg-surface-800 px-6 py-4">
          <p className="text-lg text-accent-300">
            Loading playlist… {loadProgress.toLocaleString()} channels
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-700">
            <div className="h-full animate-pulse bg-accent-500" style={{ width: '100%' }} />
          </div>
        </div>
      )}

      {loadError && (
        <div className="mx-16 mb-6 rounded-xl bg-error-500/20 px-6 py-4 text-lg text-error-500">
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
                  Lisans aktif · {licenseSnapshot.planName}
                </p>
                <p className="mt-1 text-2xl font-semibold text-white">
                  Lisanslı playlist’i aç
                </p>
                <p className="mt-1 text-base text-slate-400">Bitiş: {expiresLabel}</p>
              </div>
              <span className="rounded-xl bg-accent-500 px-6 py-3 text-lg font-semibold text-white">
                Aç
              </span>
            </div>
          </Focusable>
        </section>
      )}

      <section className="px-16 pb-8">
        <h2 className="mb-6 text-2xl font-semibold text-slate-300">Quick Actions</h2>
        <div
          className={`grid gap-6 ${
            STORE_BUILD ? 'grid-cols-2 xl:grid-cols-4' : 'grid-cols-3 xl:grid-cols-6'
          }`}
        >
          {MENU_ITEMS.map((item, index) => (
            <Focusable
              key={item.id}
              focusId={`menu-${item.id}`}
              focusGroup="home-menu"
              focusPriority={10 - index}
              className="h-48"
              onClick={() => handleMenuAction(item)}
            >
              <Card
                title={item.title}
                subtitle={item.subtitle}
                icon={item.icon}
                focused={false}
                className="h-full"
              />
            </Focusable>
          ))}
        </div>
      </section>

      {recentPlaylists.length > 0 && (
        <section className="flex-1 px-16 pb-12">
          <h2 className="mb-6 text-2xl font-semibold text-slate-300">Recent Playlists</h2>
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
            <h3 className="mb-4 text-3xl font-semibold text-white">Enter Playlist URL</h3>
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
                  Load Playlist
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
                  Cancel
                </div>
              </Focusable>
            </div>
          </div>
        </div>
      )}

      {activateDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-[760px] rounded-2xl bg-surface-800 p-8">
            <h3 className="mb-2 text-3xl font-semibold text-white">Lisansı aktive et</h3>
            <p className="mb-6 text-lg text-slate-400">
              Aktivasyon kodunuzu girin. Cihaz kodu:{' '}
              <span className="font-mono text-accent-300">{deviceShort || '…'}</span>
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
                  {activating ? 'Aktive ediliyor…' : 'Aktive et'}
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
                  İptal
                </div>
              </Focusable>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
