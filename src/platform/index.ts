import type { PlatformContext } from './interfaces';
import { createAndroidPlatform } from './android';
import { createBrowserPlatform } from './browser';
import { createWebOSPlatform } from './webos';
import { createWindowsPlatform } from './windows';
import { detectPlatformType, setAndroidTelevision } from './detectPlatform';

let platformContext: PlatformContext | null = null;

/**
 * Resolves the active platform once.
 * webOS / Windows / Android / Browser adapters share PlatformContext.
 */
export function getPlatform(): PlatformContext {
  if (platformContext) return platformContext;

  switch (detectPlatformType()) {
    case 'webos':
      platformContext = createWebOSPlatform();
      break;
    case 'windows':
      platformContext = createWindowsPlatform();
      break;
    case 'android':
      platformContext = createAndroidPlatform();
      break;
    default:
      platformContext = createBrowserPlatform();
  }

  return platformContext;
}

export async function initializePlatform(): Promise<PlatformContext> {
  const ctx = getPlatform();
  await ctx.platform.initialize();
  return ctx;
}

/** Test helper — clears cached platform context. */
export function resetPlatformContext(): void {
  platformContext = null;
  setAndroidTelevision(false);
}

export {
  detectPlatformType,
  detectAppTarget,
  isSimulator,
  isWebOS,
  isTvUi,
  isTouchUi,
  isAndroidUi,
  isDesktopUi,
  isAndroidTelevision,
  setAndroidTelevision,
  type PlatformType,
  type AppTarget,
} from './detectPlatform';
export * from './interfaces';
