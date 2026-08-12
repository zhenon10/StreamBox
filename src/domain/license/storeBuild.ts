/**
 * Production gate helpers.
 * Store / HotPlayer-style builds: player requires a valid license; user supplies M3U.
 */

export function isStoreBuild(): boolean {
  return String(import.meta.env.VITE_STORE_BUILD ?? '').toLowerCase() === 'true';
}

/** When true, channels / recent / favorites / history require an active license. */
export function playlistRequiresLicense(): boolean {
  return isStoreBuild();
}
