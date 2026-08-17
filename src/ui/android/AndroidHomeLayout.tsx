import { type ReactNode } from 'react';
import { Focusable } from '@/ui/components/Focusable';
import type { LicenseSnapshot } from '@/domain/license/types';
import type { PlaylistMeta } from '@/application/stores/playlistStore';
import { APP_VERSION } from './AndroidChrome';
import { useT } from '@/i18n/useT';

interface AndroidHomeLayoutProps {
  readonly deviceCode: string;
  readonly licenseSnapshot: LicenseSnapshot | null;
  readonly licenseChecked: boolean;
  readonly expiresLabel: string;
  readonly isLoading: boolean;
  readonly loadProgress: number;
  readonly loadError: string | null;
  readonly currentPlaylist: PlaylistMeta | null;
  readonly playStore: boolean;
  readonly checkingLicense: boolean;
  readonly onCheckLicense: () => void;
  readonly onBuy: () => void;
  readonly onOpenUrl: () => void;
  readonly onOpenFile: () => void;
  readonly onActivate: () => void;
  readonly onSettings: () => void;
  readonly onExit: () => void;
  readonly onLive: () => void;
  readonly onMovies: () => void;
  readonly onSeries: () => void;
}

export function AndroidHomeLayout({
  deviceCode,
  licenseSnapshot,
  licenseChecked,
  expiresLabel,
  isLoading,
  loadProgress,
  loadError,
  currentPlaylist,
  playStore,
  checkingLicense,
  onCheckLicense,
  onBuy,
  onOpenUrl,
  onOpenFile,
  onActivate,
  onSettings,
  onExit,
  onLive,
  onMovies,
  onSeries,
}: AndroidHomeLayoutProps): ReactNode {
  const t = useT();
  const licensed = Boolean(licenseSnapshot);
  const playlistName = currentPlaylist?.name ?? '';

  return (
    <div className="and-shell and-home">
      <div className="and-home-brand">
        <p className="and-version">Version {APP_VERSION}</p>
        <h1 className="and-home-logo">
          Iv<span>Player</span>
        </h1>
        <p className="and-home-playlist">
          {t('home.currentPlaylist')}: <strong>{playlistName || '—'}</strong>
        </p>
        <div className="and-home-status">
          <span className={licensed ? 'is-on' : 'is-off'}>
            {licensed
              ? licenseSnapshot?.planName || t('home.active')
              : t('home.inactive')}
          </span>
          {expiresLabel ? (
            <span>
              {t('home.expires')} {expiresLabel}
            </span>
          ) : null}
        </div>
      </div>

      {isLoading && (
        <p className="and-home-msg">
          {t('home.loadingPlaylist')} {loadProgress.toLocaleString()}
        </p>
      )}
      {loadError && <p className="and-home-msg is-error">{loadError}</p>}

      <div className="and-home-tiles">
        <HomeTile
          focusId="tile-live"
          priority={12}
          icon="📺"
          label={t('home.openLive')}
          onClick={onLive}
        />
        <HomeTile
          focusId="tile-movie"
          priority={11}
          icon="🎬"
          label={t('home.openMovies')}
          onClick={onMovies}
        />
        <HomeTile
          focusId="tile-series"
          priority={10}
          icon="🎞"
          label={t('home.openSeries')}
          onClick={onSeries}
        />
      </div>

      <div className="and-home-utils">
        <UtilBtn
          focusId="util-refresh"
          label={checkingLicense ? t('home.checkingLicense') : t('home.refresh')}
          onClick={onCheckLicense}
        />
        <UtilBtn focusId="util-playlist" label={t('home.changePlaylist')} onClick={onOpenUrl} />
        <UtilBtn focusId="util-file" label={t('menu.openFile')} onClick={onOpenFile} />
        {!playStore && (
          <UtilBtn focusId="util-activate" label={t('menu.activate')} onClick={onActivate} />
        )}
        <UtilBtn focusId="util-settings" label="⚙" onClick={onSettings} icon />
        <UtilBtn focusId="util-exit" label="⏻" onClick={onExit} icon />
      </div>

      {licenseChecked && (
        <button type="button" className="and-home-device" onClick={playStore ? undefined : onBuy}>
          <span>{t('home.device')}</span>
          <strong>{deviceCode || '…'}</strong>
        </button>
      )}

      <p className="and-home-copy">{t('home.disclaimer')}</p>
    </div>
  );
}

function HomeTile({
  focusId,
  priority,
  icon,
  label,
  onClick,
}: {
  readonly focusId: string;
  readonly priority: number;
  readonly icon: string;
  readonly label: string;
  readonly onClick: () => void;
}): ReactNode {
  return (
    <Focusable
      focusId={focusId}
      focusGroup="home-tiles"
      focusPriority={priority}
      className="and-tile"
      onClick={onClick}
    >
      <span className="and-tile-icon">{icon}</span>
      <span className="and-tile-label">{label}</span>
    </Focusable>
  );
}

function UtilBtn({
  focusId,
  label,
  onClick,
  icon = false,
}: {
  readonly focusId: string;
  readonly label: string;
  readonly onClick: () => void;
  readonly icon?: boolean;
}): ReactNode {
  return (
    <Focusable
      focusId={focusId}
      focusGroup="home-utils"
      className={icon ? 'and-util is-icon' : 'and-util'}
      onClick={onClick}
    >
      <span>{label}</span>
    </Focusable>
  );
}
