/**
 * Production gate helpers.
 * Store / HotPlayer-style builds: player requires a valid license; user supplies M3U.
 */

export function isStoreBuild(): boolean {
  return String(import.meta.env.VITE_STORE_BUILD ?? '').toLowerCase() === 'true';
}

/** Google Play AAB — no website payment CTA; Play Billing comes next. */
export function isPlayStoreBuild(): boolean {
  return String(import.meta.env.VITE_PLAY_STORE ?? '').toLowerCase() === 'true';
}

/** When true, channels / recent / favorites / history require an active license. */
export function playlistRequiresLicense(): boolean {
  return isStoreBuild();
}
