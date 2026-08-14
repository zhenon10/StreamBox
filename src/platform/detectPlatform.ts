export type PlatformType = 'webos' | 'browser' | 'windows' | 'android';

export type AppTarget = 'simulator' | 'tv' | 'desktop' | 'mobile';

declare global {
  interface ImportMetaEnv {
    readonly VITE_PLATFORM?: string;
    readonly VITE_APP_TARGET?: string;
  }

  interface Window {
    __TAURI_INTERNALS__?: { invoke?: unknown };
    Capacitor?: {
      getPlatform?: () => string;
      isNativePlatform?: () => boolean;
    };
  }
}

function hasWebOsRuntime(): boolean {
  return typeof window !== 'undefined' && (window.PalmSystem !== undefined || window.webOS !== undefined);
}

function hasTauriRuntime(): boolean {
  return typeof window !== 'undefined' && window.__TAURI_INTERNALS__ !== undefined;
}

function hasCapacitorAndroid(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = window.Capacitor;
  if (!cap) return false;
  const platform = cap.getPlatform?.() ?? '';
  if (platform === 'android') return true;
  return cap.isNativePlatform?.() === true && platform !== 'ios' && platform !== 'web';
}

/**
 * Automatic platform detection:
 * - LG webOS device / emulator → WebOSPlatform
 * - Tauri desktop shell → WindowsPlatform
 * - Capacitor Android → AndroidPlatform
 * - Browser / Vite simulator → BrowserPlatform
 *
 * Runtime webOS / Tauri / Capacitor globals win over VITE_PLATFORM.
 */
export function detectPlatformType(): PlatformType {
  if (hasWebOsRuntime()) return 'webos';
  if (hasTauriRuntime()) return 'windows';
  if (hasCapacitorAndroid()) return 'android';

  const forced = import.meta.env.VITE_PLATFORM;
  if (forced === 'webos' || forced === 'browser' || forced === 'windows' || forced === 'android') {
    return forced;
  }

  if (import.meta.env.DEV || import.meta.env.MODE === 'simulator') {
    return 'browser';
  }

  return 'browser';
}

/** Set from AndroidPlatformService after native UiMode / Leanback check. */
let androidTelevision = false;

export function setAndroidTelevision(value: boolean): void {
  androidTelevision = value;
}

export function isAndroidTelevision(): boolean {
  return detectPlatformType() === 'android' && androidTelevision;
}

export function detectAppTarget(): AppTarget {
  const target = import.meta.env.VITE_APP_TARGET;
  if (target === 'tv' || target === 'simulator' || target === 'desktop' || target === 'mobile') {
    return target;
  }

  const platform = detectPlatformType();
  if (platform === 'webos' || isAndroidTelevision()) return 'tv';
  if (platform === 'windows') return 'desktop';
  if (platform === 'android') return 'mobile';
  return 'simulator';
}

export function isSimulator(): boolean {
  return detectAppTarget() === 'simulator';
}

export function isWebOS(): boolean {
  return detectPlatformType() === 'webos';
}

/** 10-foot D-pad chrome: LG webOS and Android TV. */
export function isTvUi(): boolean {
  return detectPlatformType() === 'webos' || isAndroidTelevision();
}

export function isTouchUi(): boolean {
  return detectPlatformType() === 'android' && !androidTelevision;
}

/** Android phone + Android TV share the landscape browse shell. */
export function isAndroidUi(): boolean {
  return detectPlatformType() === 'android';
}

export function isDesktopUi(): boolean {
  const platform = detectPlatformType();
  return platform === 'windows' || platform === 'browser';
}
