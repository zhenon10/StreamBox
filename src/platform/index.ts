import type { PlatformContext } from './interfaces';
import { createWebOSPlatform } from './webos';
import { createBrowserPlatform } from './browser';
import { detectPlatformType } from './detectPlatform';

let platformContext: PlatformContext | null = null;

/**
 * Resolves the active platform once.
 * Development / Simulator → BrowserPlatform
 * Production on LG webOS → WebOSPlatform
 */
export function getPlatform(): PlatformContext {
  if (platformContext) return platformContext;

  const type = detectPlatformType();
  platformContext = type === 'webos' ? createWebOSPlatform() : createBrowserPlatform();
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
}

export {
  detectPlatformType,
  detectAppTarget,
  isSimulator,
  isWebOS,
  type PlatformType,
  type AppTarget,
} from './detectPlatform';
export * from './interfaces';
