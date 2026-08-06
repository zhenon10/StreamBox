import type { StorageService } from '@/platform/interfaces';

const LEGACY_PLAYLIST_KEY = 'streambox:playlists';

/** Removes oversized legacy localStorage playlist data that exceeds the ~5 MB quota. */
export async function clearLegacyPlaylistStorage(storage: StorageService): Promise<void> {
  try {
    const raw = await storage.getItem(LEGACY_PLAYLIST_KEY);
    if (!raw) return;

    // Legacy format stored all channels inline — typically >5 MB for large IPTV lists.
    if (raw.length > 3_000_000) {
      await storage.removeItem(LEGACY_PLAYLIST_KEY);
    }
  } catch {
    try {
      await storage.removeItem(LEGACY_PLAYLIST_KEY);
    } catch {
      // Ignore cleanup failures.
    }
  }
}
