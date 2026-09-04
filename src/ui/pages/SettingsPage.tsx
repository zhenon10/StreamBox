import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Focusable } from '@/ui/components/Focusable';
import { useRouteFocus } from '@/ui/navigation/NavigationProvider';
import { usePlaylistStore } from '@/application/stores/playlistStore';
import { platform, repositories, services, TOKENS } from '@/application/di/container';
import type { AppSettings } from '@/domain/entities';
import { DEFAULT_SETTINGS } from '@/domain/entities';
import { EventKind } from '@/domain/events/ApplicationEvent';
import type { ThemeDefinition } from '@/application/theme/ThemeService';
import type { LicenseSnapshot } from '@/domain/license/types';
import { clearLicense, getStoredLicense } from '@/application/usecases/licenseUseCases';
import { formatPurchaseCode, getOrCreateDeviceId } from '@/infrastructure/license/DeviceIdentity';
import { APP_LOCALES, LOCALE_LABELS, type AppLocale, type MessageKey } from '@/i18n';
import { useLocale, useT } from '@/i18n/useT';
import { AdultPinDialog } from '@/ui/components/AdultPinDialog';
import { adultLockSession } from '@/application/security/adultLockSession';

interface SettingItem {
  readonly id: Exclude<keyof AppSettings, 'locale'>;
  readonly labelKey: MessageKey;
  readonly descriptionKey: MessageKey;
  readonly type: 'boolean' | 'number';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

const SETTING_ITEMS: SettingItem[] = [
  {
    id: 'autoReconnect',
    labelKey: 'settings.autoReconnect',
    descriptionKey: 'settings.autoReconnectDesc',
    type: 'boolean',
  },
  {
    id: 'reconnectAttempts',
    labelKey: 'settings.reconnectAttempts',
    descriptionKey: 'settings.reconnectAttemptsDesc',
    type: 'number',
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: 'reconnectDelayMs',
    labelKey: 'settings.reconnectDelay',
    descriptionKey: 'settings.reconnectDelayDesc',
    type: 'number',
    min: 1000,
    max: 30000,
    step: 1000,
  },
  {
    id: 'bufferSizeSeconds',
    labelKey: 'settings.bufferSize',
    descriptionKey: 'settings.bufferSizeDesc',
    type: 'number',
    min: 1,
    max: 30,
    step: 1,
  },
  {
    id: 'defaultVolume',
    labelKey: 'settings.defaultVolume',
    descriptionKey: 'settings.defaultVolumeDesc',
    type: 'number',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    id: 'showChannelNumbers',
    labelKey: 'settings.showChannelNumbers',
    descriptionKey: 'settings.showChannelNumbersDesc',
    type: 'boolean',
  },
  {
    id: 'enableHardwareAcceleration',
    labelKey: 'settings.hwAccel',
    descriptionKey: 'settings.hwAccelDesc',
    type: 'boolean',
  },
  {
    id: 'adultLockEnabled',
    labelKey: 'settings.adultLockEnabled',
    descriptionKey: 'settings.adultLockEnabledDesc',
    type: 'boolean',
  },
];

export function SettingsPage(): ReactNode {
  useRouteFocus('settings');
  const navigate = useNavigate();
  const t = useT();
  const locale = useLocale();
  const { setSettings } = usePlaylistStore();
  const [localSettings, setLocalSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [license, setLicense] = useState<LicenseSnapshot | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [adultPinDialogOpen, setAdultPinDialogOpen] = useState(false);

  useEffect(() => {
    void repositories.settings.get().then((loaded) => {
      setLocalSettings(loaded);
      setSettings(loaded);
    });
    void (async () => {
      const id = await getOrCreateDeviceId(platform.storage);
      setDeviceId(id);
      const snap = await getStoredLicense({
        storage: platform.storage,
        licenseStore: services.resolve(TOKENS.licenseStore),
      });
      setLicense(snap);
    })();
  }, [setSettings]);

  const handleToggle = (key: Exclude<keyof AppSettings, 'locale'>): void => {
    setLocalSettings((prev) => {
      const current = prev[key];
      if (typeof current !== 'boolean') return prev;
      return { ...prev, [key]: !current };
    });
    setSaved(false);
  };

  const handleNumberChange = (key: Exclude<keyof AppSettings, 'locale'>, delta: number): void => {
    setLocalSettings((prev) => {
      const current = prev[key];
      if (typeof current !== 'number') return prev;
      const item = SETTING_ITEMS.find((s) => s.id === key);
      const min = item?.min ?? 0;
      const max = item?.max ?? 100;
      const step = item?.step ?? 1;
      const next = Math.min(max, Math.max(min, current + delta * step));
      return { ...prev, [key]: next };
    });
    setSaved(false);
  };

  const handleLocale = (next: AppLocale): void => {
    const nextSettings = { ...localSettings, locale: next };
    setLocalSettings(nextSettings);
    setSettings(nextSettings);
    void repositories.settings.save(nextSettings);
    setSaved(false);
  };

  const handleSave = async (): Promise<void> => {
    await repositories.settings.save(localSettings);
    setSettings(localSettings);
    services.resolve(TOKENS.eventPublisher).publish(EventKind.SettingsChanged, {
      settings: localSettings,
    });
    setSaved(true);
  };

  const handleReset = (): void => {
    setLocalSettings(DEFAULT_SETTINGS);
    setSaved(false);
  };

  const handleClearHistory = async (): Promise<void> => {
    await repositories.history.clear();
  };

  const handleClearLicense = async (): Promise<void> => {
    setLicenseBusy(true);
    try {
      await clearLicense({
        licenseClient: services.resolve(TOKENS.licenseClient),
        storage: platform.storage,
        licenseStore: services.resolve(TOKENS.licenseStore),
      });
      await repositories.recentPlaylists.clear();
      setLicense(null);
      usePlaylistStore.getState().setCurrentPlaylist(null);
      usePlaylistStore.getState().setRecentPlaylists([]);
      usePlaylistStore.getState().setFavorites([]);
    } finally {
      setLicenseBusy(false);
    }
  };

  const handleAdultPinSubmit = (pin: string): null => {
    const nextSettings = { ...localSettings, adultPin: pin };
    setLocalSettings(nextSettings);
    setSettings(nextSettings);
    void repositories.settings.save(nextSettings);
    adultLockSession.lock();
    setAdultPinDialogOpen(false);
    setSaved(false);
    return null;
  };

  const handleAdultPinRemove = (): void => {
    const nextSettings = { ...localSettings, adultPin: null };
    setLocalSettings(nextSettings);
    setSettings(nextSettings);
    void repositories.settings.save(nextSettings);
    adultLockSession.lock();
    setSaved(false);
  };

  const dateLocale = locale === 'tr' ? 'tr-TR' : 'en-US';

  return (
    <div className="app-scroll settings-page flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-surface-950">
      <header className="settings-head flex items-center justify-between border-b border-surface-800 px-16 py-10">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold text-white">{t('settings.title')}</h1>
          <p className="mt-2 text-xl text-slate-400">{t('settings.subtitle')}</p>
        </div>
        <Focusable focusId="settings-back" focusGroup="settings-nav" onClick={() => navigate('/')}>
          <span className="settings-back rounded-xl bg-surface-800 px-8 py-3 text-xl text-white [.focused_&]:bg-surface-700">
            ← {t('settings.back')}
          </span>
        </Focusable>
      </header>

      <div className="settings-body scrollbar-hidden min-h-0 min-w-0 flex-1 overflow-y-auto px-16 py-8">
        <div className="settings-stack mx-auto max-w-4xl space-y-4">
          <LanguageSelector value={localSettings.locale} onChange={handleLocale} />
          <LicensePanel
            license={license}
            deviceId={deviceId}
            busy={licenseBusy}
            dateLocale={dateLocale}
            onClear={() => void handleClearLicense()}
          />
          <AdultPinPanel
            hasPin={Boolean(localSettings.adultPin)}
            onChange={() => setAdultPinDialogOpen(true)}
            onRemove={handleAdultPinRemove}
          />
          <ThemeSelector />
          {SETTING_ITEMS.map((item, index) => (
            <div
              key={item.id}
              className="settings-row flex items-center justify-between rounded-2xl bg-surface-900 px-8 py-6"
            >
              <div className="settings-row-label min-w-0 flex-1 pr-8">
                <h3 className="text-2xl font-semibold text-white">{t(item.labelKey)}</h3>
                <p className="mt-1 text-lg text-slate-400">{t(item.descriptionKey)}</p>
              </div>

              {item.type === 'boolean' ? (
                <Focusable
                  focusId={`setting-${item.id}`}
                  focusGroup="settings"
                  focusPriority={10 - index}
                  className="settings-control shrink-0"
                  onClick={() => handleToggle(item.id)}
                >
                  <div
                    className={`settings-toggle h-10 w-20 rounded-full transition-colors [.focused_&]:ring-2 [.focused_&]:ring-accent-500 ${
                      localSettings[item.id] ? 'bg-accent-500' : 'bg-surface-700'
                    }`}
                  >
                    <div
                      className={`h-10 w-10 rounded-full bg-white shadow transition-transform ${
                        localSettings[item.id] ? 'translate-x-10' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </Focusable>
              ) : (
                <div className="settings-control flex shrink-0 items-center gap-4">
                  <Focusable
                    focusId={`setting-${item.id}-dec`}
                    focusGroup="settings"
                    focusPriority={10 - index}
                    onClick={() => handleNumberChange(item.id, -1)}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-800 text-2xl text-white [.focused_&]:bg-surface-700">
                      −
                    </span>
                  </Focusable>
                  <span className="settings-num min-w-[80px] text-center text-2xl font-semibold text-accent-300">
                    {String(localSettings[item.id])}
                  </span>
                  <Focusable
                    focusId={`setting-${item.id}-inc`}
                    focusGroup="settings"
                    focusPriority={10 - index}
                    onClick={() => handleNumberChange(item.id, 1)}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-800 text-2xl text-white [.focused_&]:bg-surface-700">
                      +
                    </span>
                  </Focusable>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="settings-footer flex items-center gap-6 border-t border-surface-800 px-16 py-8">
        <Focusable
          focusId="settings-save"
          focusGroup="settings-actions"
          focusPriority={10}
          onClick={() => void handleSave()}
        >
          <span className="rounded-xl bg-accent-500 px-10 py-4 text-xl font-semibold text-white [.focused_&]:bg-accent-400">
            {t('settings.save')}
          </span>
        </Focusable>

        <Focusable
          focusId="settings-reset"
          focusGroup="settings-actions"
          focusPriority={9}
          onClick={handleReset}
        >
          <span className="rounded-xl bg-surface-800 px-10 py-4 text-xl text-white [.focused_&]:bg-surface-700">
            {t('settings.reset')}
          </span>
        </Focusable>

        <Focusable
          focusId="settings-clear-history"
          focusGroup="settings-actions"
          focusPriority={8}
          onClick={() => void handleClearHistory()}
        >
          <span className="rounded-xl bg-surface-800 px-10 py-4 text-xl text-white [.focused_&]:bg-surface-700">
            {t('settings.clearHistory')}
          </span>
        </Focusable>

        {saved && <span className="text-lg text-success-500">{t('settings.saved')}</span>}
      </footer>
      {adultPinDialogOpen && (
        <AdultPinDialog
          mode="set"
          onCancel={() => setAdultPinDialogOpen(false)}
          onSubmit={handleAdultPinSubmit}
        />
      )}
    </div>
  );
}

function LanguageSelector({
  value,
  onChange,
}: {
  readonly value: AppLocale;
  readonly onChange: (locale: AppLocale) => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="settings-panel mb-8 rounded-2xl bg-surface-900 px-8 py-6">
      <h3 className="mb-4 text-2xl font-semibold text-white">{t('settings.language')}</h3>
      <div className="flex flex-wrap gap-4">
        {APP_LOCALES.map((loc) => (
          <Focusable
            key={loc}
            focusId={`locale-${loc}`}
            focusGroup="settings-locale"
            onClick={() => onChange(loc)}
          >
            <div
              className={`rounded-xl px-6 py-3 text-lg transition-colors [.focused_&]:ring-2 [.focused_&]:ring-accent-500 ${
                value === loc ? 'bg-accent-500/30 text-accent-300' : 'bg-surface-800 text-slate-300'
              }`}
            >
              {LOCALE_LABELS[loc]}
            </div>
          </Focusable>
        ))}
      </div>
    </div>
  );
}

function LicensePanel({
  license,
  deviceId,
  busy,
  dateLocale,
  onClear,
}: {
  readonly license: LicenseSnapshot | null;
  readonly deviceId: string;
  readonly busy: boolean;
  readonly dateLocale: string;
  readonly onClear: () => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="settings-panel mb-8 rounded-2xl bg-surface-900 px-8 py-6">
      <h3 className="mb-4 text-2xl font-semibold text-white">{t('settings.license')}</h3>
      <div className="space-y-2 text-lg text-slate-300">
        <p>
          {t('settings.deviceId')}:{' '}
          <span className="settings-device-id font-mono text-accent-300">
            {deviceId ? formatPurchaseCode(deviceId) : '…'}
          </span>
        </p>
        {license ? (
          <>
            <p>
              {t('settings.plan')}: <span className="text-white">{license.planName}</span>
            </p>
            <p>
              {t('settings.expires')}:{' '}
              <span className="text-white">
                {new Date(license.expiresAt).toLocaleDateString(dateLocale)}
              </span>
            </p>
            {license.playlistUrl?.trim() ? (
              <p className="truncate text-base text-slate-500">{license.playlistUrl}</p>
            ) : (
              <p className="text-base text-slate-500">{t('settings.userPlaylist')}</p>
            )}
          </>
        ) : (
          <p className="text-slate-400">{t('settings.noLicense')}</p>
        )}
      </div>
      {license && (
        <div className="mt-5">
          <Focusable
            focusId="license-clear"
            focusGroup="settings-license"
            disabled={busy}
            onClick={onClear}
          >
            <span className="rounded-xl bg-surface-800 px-6 py-3 text-lg text-white [.focused_&]:bg-error-500">
              {busy ? t('settings.clearing') : t('settings.clearLicense')}
            </span>
          </Focusable>
        </div>
      )}
    </div>
  );
}

function AdultPinPanel({
  hasPin,
  onChange,
  onRemove,
}: {
  readonly hasPin: boolean;
  readonly onChange: () => void;
  readonly onRemove: () => void;
}): ReactNode {
  const t = useT();
  return (
    <div className="settings-panel mb-8 rounded-2xl bg-surface-900 px-8 py-6">
      <h3 className="mb-2 text-2xl font-semibold text-white">{t('settings.adultPin')}</h3>
      <p className="mb-4 text-lg text-slate-400">
        {hasPin ? t('settings.adultPinSet') : t('settings.adultPinNotSet')}
      </p>
      <div className="flex flex-wrap gap-4">
        <Focusable focusId="adult-pin-change" focusGroup="settings-adult-pin" onClick={onChange}>
          <span className="rounded-xl bg-surface-800 px-6 py-3 text-lg text-white [.focused_&]:bg-surface-700">
            {hasPin ? t('settings.adultPinChange') : t('settings.adultPinCreate')}
          </span>
        </Focusable>
        {hasPin && (
          <Focusable focusId="adult-pin-remove" focusGroup="settings-adult-pin" onClick={onRemove}>
            <span className="rounded-xl bg-surface-800 px-6 py-3 text-lg text-white [.focused_&]:bg-error-500">
              {t('settings.adultPinRemove')}
            </span>
          </Focusable>
        )}
      </div>
    </div>
  );
}

function ThemeSelector(): ReactNode {
  const t = useT();
  const themeService = services.resolve(TOKENS.themeService);
  const themes = themeService.getAvailableThemes();
  const [activeTheme, setActiveTheme] = useState(themeService.getCurrentTheme().id);

  const handleSelect = (theme: ThemeDefinition): void => {
    themeService.setTheme(theme.id);
    setActiveTheme(theme.id);
  };

  return (
    <div className="settings-panel mb-8 rounded-2xl bg-surface-900 px-8 py-6">
      <h3 className="mb-4 text-2xl font-semibold text-white">{t('settings.theme')}</h3>
      <div className="flex flex-wrap gap-4">
        {themes.map((theme: ThemeDefinition) => (
          <Focusable
            key={theme.id}
            focusId={`theme-${theme.id}`}
            focusGroup="settings-theme"
            onClick={() => handleSelect(theme)}
          >
            <div
              className={`rounded-xl px-6 py-3 text-lg transition-colors [.focused_&]:ring-2 [.focused_&]:ring-accent-500 ${
                activeTheme === theme.id
                  ? 'bg-accent-500/30 text-accent-300'
                  : 'bg-surface-800 text-slate-300'
              }`}
            >
              {theme.name}
            </div>
          </Focusable>
        ))}
      </div>
    </div>
  );
}
