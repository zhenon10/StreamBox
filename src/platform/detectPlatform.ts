export type PlatformType = 'webos' | 'browser';

export type AppTarget = 'simulator' | 'tv';

declare global {
  interface ImportMetaEnv {
    readonly VITE_PLATFORM?: string;
    readonly VITE_APP_TARGET?: string;
  }
}

/**
 * Automatic platform detection:
 * - LG webOS device / emulator → WebOSPlatform
 * - Browser / Vite simulator → BrowserPlatform
 *
 * Forced override via VITE_PLATFORM (simulator / production builds).
 * Runtime webOS globals always win when present on a real device.
 */
export function detectPlatformType(): PlatformType {
  if (typeof window !== 'undefined') {
    if (window.PalmSystem !== undefined || window.webOS !== undefined) {
      return 'webos';
    }
  }

  const forced = import.meta.env.VITE_PLATFORM;
  if (forced === 'webos') return 'webos';
  if (forced === 'browser') return 'browser';

  // Vite simulator / development defaults to browser.
  if (import.meta.env.DEV || import.meta.env.MODE === 'simulator') {
    return 'browser';
  }

  return 'browser';
}

export function detectAppTarget(): AppTarget {
  const target = import.meta.env.VITE_APP_TARGET;
  if (target === 'tv') return 'tv';
  if (target === 'simulator') return 'simulator';

  return detectPlatformType() === 'webos' ? 'tv' : 'simulator';
}

export function isSimulator(): boolean {
  return detectAppTarget() === 'simulator';
}

export function isWebOS(): boolean {
  return detectPlatformType() === 'webos';
}
