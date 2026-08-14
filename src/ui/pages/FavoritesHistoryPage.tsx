import { useEffect, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { VirtualChannelList } from '@/ui/components/VirtualChannelList';
import { Focusable } from '@/ui/components/Focusable';
import { useRouteFocus } from '@/ui/navigation/NavigationProvider';
import { usePlaylistStore } from '@/application/stores/playlistStore';
import { channelSession } from '@/application/channels/ChannelSessionStore';
import { repositories } from '@/application/di/container';
import type { Channel, ChannelId } from '@/domain/entities';
import { useRequireLicense } from '@/ui/hooks/useRequireLicense';
import { useT } from '@/i18n/useT';

export function FavoritesPage(): ReactNode {
  useRouteFocus('favorites');
  const navigate = useNavigate();
  const t = useT();
  const { checking: licenseChecking, licensed } = useRequireLicense();
  const { currentPlaylist, favorites, setFavorites } = usePlaylistStore();

  useEffect(() => {
    void repositories.favorites.getAll().then(setFavorites);
  }, [setFavorites]);

  const favoriteChannels = useMemo((): Channel[] => {
    if (!currentPlaylist || channelSession.getCount() === 0) return [];
    const result: Channel[] = [];
    for (const id of favorites) {
      const ch = channelSession.getById(id);
      if (ch) result.push(ch);
    }
    return result;
  }, [currentPlaylist, favorites]);

  if (licenseChecking || !licensed) return null;

  return (
    <div className="app-scroll list-page flex h-full flex-col bg-surface-950">
      <header className="flex items-center justify-between border-b border-surface-800 px-16 py-10">
        <div>
          <h1 className="text-4xl font-bold text-white">{t('favorites.title')}</h1>
          <p className="mt-2 text-xl text-slate-400">
            {favoriteChannels.length} {t('favorites.count')}
          </p>
        </div>
        <Focusable focusId="fav-back" focusGroup="fav-nav" onClick={() => navigate('/')}>
          <span className="rounded-xl bg-surface-800 px-8 py-3 text-xl text-white [.focused_&]:bg-surface-700">
            ← {t('common.back')}
          </span>
        </Focusable>
      </header>

      {!currentPlaylist ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-2xl text-slate-400">{t('favorites.emptyPlaylist')}</p>
        </div>
      ) : favoriteChannels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-2xl text-slate-400">{t('favorites.empty')}</p>
        </div>
      ) : (
        <div className="flex-1 py-4">
          <VirtualChannelList
            count={favoriteChannels.length}
            getChannel={(index) => favoriteChannels[index] ?? null}
            onSelect={(channel) => {
              channelSession.remember(channel);
              channelSession.setZapContext(null);
              navigate(`/player/${channel.id}`);
            }}
            favorites={favorites as ChannelId[]}
            focusGroup="favorites"
          />
        </div>
      )}
    </div>
  );
}

export function HistoryPage(): ReactNode {
  useRouteFocus('history');
  const navigate = useNavigate();
  const t = useT();
  const { checking: licenseChecking, licensed } = useRequireLicense();
  const { currentPlaylist, history, setHistory } = usePlaylistStore();

  useEffect(() => {
    void repositories.history.getRecent(50).then(setHistory);
  }, [setHistory]);

  const historyChannels = useMemo((): Channel[] => {
    if (!currentPlaylist || channelSession.getCount() === 0) return [];
    const result: Channel[] = [];
    for (const entry of history) {
      const ch = channelSession.getById(entry.channelId);
      if (ch) result.push(ch);
    }
    return result;
  }, [currentPlaylist, history]);

  if (licenseChecking || !licensed) return null;

  return (
    <div className="app-scroll list-page flex h-full flex-col bg-surface-950">
      <header className="flex items-center justify-between border-b border-surface-800 px-16 py-10">
        <div>
          <h1 className="text-4xl font-bold text-white">{t('history.title')}</h1>
          <p className="mt-2 text-xl text-slate-400">{t('history.subtitle')}</p>
        </div>
        <Focusable focusId="hist-back" focusGroup="hist-nav" onClick={() => navigate('/')}>
          <span className="rounded-xl bg-surface-800 px-8 py-3 text-xl text-white [.focused_&]:bg-surface-700">
            ← {t('common.back')}
          </span>
        </Focusable>
      </header>

      {!currentPlaylist ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-2xl text-slate-400">{t('history.emptyPlaylist')}</p>
        </div>
      ) : historyChannels.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-2xl text-slate-400">{t('history.empty')}</p>
        </div>
      ) : (
        <div className="flex-1 py-4">
          <VirtualChannelList
            count={historyChannels.length}
            getChannel={(index) => historyChannels[index] ?? null}
            onSelect={(channel) => {
              channelSession.remember(channel);
              channelSession.setZapContext(null);
              navigate(`/player/${channel.id}`);
            }}
            focusGroup="history"
          />
        </div>
      )}
    </div>
  );
}
