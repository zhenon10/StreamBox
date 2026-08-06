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
import {
  clearLicense,
  getStoredLicense,
} from '@/application/usecases/licenseUseCases';
import {
  getOrCreateDeviceId,
  shortDeviceId,
} from '@/infrastructure/license/DeviceIdentity';

interface SettingItem {
  readonly id: keyof AppSettings;
  readonly label: string;
  readonly description: string;
  readonly type: 'boolean' | 'number';
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

const SETTING_ITEMS: SettingItem[] = [
  {
    id: 'autoReconnect',
    label: 'Auto Reconnect',
    description: 'Automatically retry on playback errors',
    type: 'boolean',
  },
  {
    id: 'reconnectAttempts',
    label: 'Reconnect Attempts',
    description: 'Maximum retry attempts before giving up',
    type: 'number',
    min: 1,
    max: 20,
    step: 1,
  },
  {
    id: 'reconnectDelayMs',
    label: 'Reconnect Delay (ms)',
    description: 'Delay between reconnect attempts',
    type: 'number',
    min: 1000,
    max: 30000,
    step: 1000,
  },
  {
    id: 'bufferSizeSeconds',
    label: 'Buffer Size (seconds)',
    description: 'Playback buffer duration',
    type: 'number',
    min: 1,
    max: 30,
    step: 1,
  },
  {
    id: 'defaultVolume',
    label: 'Default Volume',
    description: 'Initial volume level (0-100)',
    type: 'number',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    id: 'showChannelNumbers',
    label: 'Show Channel Numbers',
    description: 'Display channel numbers in lists',
    type: 'boolean',
  },
  {
    id: 'enableHardwareAcceleration',
    label: 'Hardware Acceleration',
    description: 'Use GPU decoding when available',
    type: 'boolean',
  },
];

export function SettingsPage(): ReactNode {
  useRouteFocus('settings');
  const navigate = useNavigate();
  const { setSettings } = usePlaylistStore();
  const [localSettings, setLocalSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [license, setLicense] = useState<LicenseSnapshot | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);

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

  const handleToggle = (key: keyof AppSettings): void => {
    setLocalSettings((prev) => {
      const current = prev[key];
      if (typeof current !== 'boolean') return prev;
      return { ...prev, [key]: !current };
    });
    setSaved(false);
  };

  const handleNumberChange = (key: keyof AppSettings, delta: number): void => {
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
      setLicense(null);
    } finally {
      setLicenseBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col bg-surface-950">
      <header className="flex items-center justify-between border-b border-surface-800 px-16 py-10">
        <div>
          <h1 className="text-4xl font-bold text-white">Settings</h1>
          <p className="mt-2 text-xl text-slate-400">Configure playback and display options</p>
        </div>
        <Focusable focusId="settings-back" focusGroup="settings-nav" onClick={() => navigate('/')}>
          <span className="rounded-xl bg-surface-800 px-8 py-3 text-xl text-white [.focused_&]:bg-surface-700">
            ← Back
          </span>
        </Focusable>
      </header>

      <div className="scrollbar-hidden flex-1 overflow-y-auto px-16 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <LicensePanel
            license={license}
            deviceId={deviceId}
            busy={licenseBusy}
            onClear={() => void handleClearLicense()}
          />
          <ThemeSelector />
          {SETTING_ITEMS.map((item, index) => (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-2xl bg-surface-900 px-8 py-6"
            >
              <div className="flex-1 pr-8">
                <h3 className="text-2xl font-semibold text-white">{item.label}</h3>
                <p className="mt-1 text-lg text-slate-400">{item.description}</p>
              </div>

              {item.type === 'boolean' ? (
                <Focusable
                  focusId={`setting-${item.id}`}
                  focusGroup="settings"
                  focusPriority={10 - index}
                  onClick={() => handleToggle(item.id)}
                >
                  <div
                    className={`h-10 w-20 rounded-full transition-colors [.focused_&]:ring-2 [.focused_&]:ring-accent-500 ${
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
                <div className="flex items-center gap-4">
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
                  <span className="min-w-[80px] text-center text-2xl font-semibold text-accent-300">
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

      <footer className="flex items-center gap-6 border-t border-surface-800 px-16 py-8">
        <Focusable
          focusId="settings-save"
          focusGroup="settings-actions"
          focusPriority={10}
          onClick={() => void handleSave()}
        >
          <span className="rounded-xl bg-accent-500 px-10 py-4 text-xl font-semibold text-white [.focused_&]:bg-accent-400">
            Save Settings
          </span>
        </Focusable>

        <Focusable
          focusId="settings-reset"
          focusGroup="settings-actions"
          focusPriority={9}
          onClick={handleReset}
        >
          <span className="rounded-xl bg-surface-800 px-10 py-4 text-xl text-white [.focused_&]:bg-surface-700">
            Reset to Defaults
          </span>
        </Focusable>

        <Focusable
          focusId="settings-clear-history"
          focusGroup="settings-actions"
          focusPriority={8}
          onClick={() => void handleClearHistory()}
        >
          <span className="rounded-xl bg-surface-800 px-10 py-4 text-xl text-white [.focused_&]:bg-surface-700">
            Clear History
          </span>
        </Focusable>

        {saved && <span className="text-lg text-success-500">Settings saved</span>}
      </footer>
    </div>
  );
}

function LicensePanel({
  license,
  deviceId,
  busy,
  onClear,
}: {
  readonly license: LicenseSnapshot | null;
  readonly deviceId: string;
  readonly busy: boolean;
  readonly onClear: () => void;
}): ReactNode {
  return (
    <div className="mb-8 rounded-2xl bg-surface-900 px-8 py-6">
      <h3 className="mb-4 text-2xl font-semibold text-white">Lisans</h3>
      <div className="space-y-2 text-lg text-slate-300">
        <p>
          Cihaz ID:{' '}
          <span className="font-mono text-accent-300">
            {deviceId ? shortDeviceId(deviceId) : '…'}
          </span>
        </p>
        {license ? (
          <>
            <p>
              Plan: <span className="text-white">{license.planName}</span>
            </p>
            <p>
              Bitiş:{' '}
              <span className="text-white">
                {new Date(license.expiresAt).toLocaleDateString('tr-TR')}
              </span>
            </p>
            <p className="truncate text-base text-slate-500">{license.playlistUrl}</p>
          </>
        ) : (
          <p className="text-slate-400">Aktif lisans yok — ana ekrandan aktive edin.</p>
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
              {busy ? 'Kaldırılıyor…' : 'Lisansı kaldır'}
            </span>
          </Focusable>
        </div>
      )}
    </div>
  );
}

function ThemeSelector(): ReactNode {
  const themeService = services.resolve(TOKENS.themeService);
  const themes = themeService.getAvailableThemes();
  const [activeTheme, setActiveTheme] = useState(themeService.getCurrentTheme().id);

  const handleSelect = (theme: ThemeDefinition): void => {
    themeService.setTheme(theme.id);
    setActiveTheme(theme.id);
  };

  return (
    <div className="mb-8 rounded-2xl bg-surface-900 px-8 py-6">
      <h3 className="mb-4 text-2xl font-semibold text-white">Theme</h3>
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
