import { type ReactNode } from 'react';
import { Focusable } from '@/ui/components/Focusable';
import { useClock } from './useClock';
import { useLocale, useT } from '@/i18n/useT';

export const APP_VERSION = '1.0.0';

interface AndroidTopBarProps {
  readonly sectionLabel: string;
  readonly crumb?: string | undefined;
  readonly playlistName?: string | undefined;
  readonly expiresLabel?: string | undefined;
  readonly licensed: boolean;
}

export function AndroidTopBar({
  sectionLabel,
  crumb,
  playlistName,
  expiresLabel,
  licensed,
}: AndroidTopBarProps): ReactNode {
  const t = useT();
  const locale = useLocale();
  const clock = useClock(locale);

  return (
    <header className="and-topbar">
      <div className="and-topbar-brand">
        <span className="and-clock">{clock}</span>
        <div>
          <p className="and-version">Version {APP_VERSION}</p>
          <p className="and-wordmark">
            Iv<span>Player</span>
          </p>
        </div>
      </div>
      <div className="and-topbar-mid">
        <span className="and-pill">{sectionLabel}</span>
        {crumb ? <p className="and-crumb">▸ {crumb}</p> : null}
      </div>
      <div className="and-topbar-meta">
        <div className="and-meta-card">
          <p className="and-meta-k">{t('home.currentPlaylist')}</p>
          <p className="and-meta-v">{playlistName || '—'}</p>
          {expiresLabel ? (
            <p className="and-meta-s">
              {t('home.expires')} {expiresLabel}
            </p>
          ) : null}
        </div>
        <div className="and-meta-card">
          <p className="and-meta-k">{licensed ? t('home.active') : t('home.inactive')}</p>
          <p className="and-meta-v">{licensed ? '●' : '○'}</p>
        </div>
      </div>
    </header>
  );
}

interface RailItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly onClick: () => void;
}

interface AndroidIconRailProps {
  readonly items: readonly RailItem[];
}

export function AndroidIconRail({ items }: AndroidIconRailProps): ReactNode {
  return (
    <nav className="and-icons" aria-label="IvPlayer">
      {items.map((item, index) => (
        <Focusable
          key={item.id}
          focusId={`rail-${item.id}`}
          focusGroup="and-rail"
          focusPriority={20 - index}
          className="and-icon-btn"
          onClick={item.onClick}
          title={item.label}
        >
          <span>{item.icon}</span>
        </Focusable>
      ))}
    </nav>
  );
}
