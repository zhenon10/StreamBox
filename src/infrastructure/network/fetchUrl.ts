import { detectPlatformType } from '@/platform/detectPlatform';

/** Dev-only proxy path — Vite middleware forwards to the target URL server-side. */
export const PLAYLIST_PROXY_PATH = '/api/playlist-proxy';

/**
 * In browser dev mode, route external URLs through the Vite proxy to bypass CORS.
 * On webOS TV, fetch the URL directly.
 */
export function resolveFetchUrl(url: string): string {
  if (detectPlatformType() !== 'browser') {
    return url;
  }

  if (import.meta.env.DEV && isExternalUrl(url)) {
    return `${PLAYLIST_PROXY_PATH}?url=${encodeURIComponent(url)}`;
  }

  return url;
}

export function isExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function mapFetchError(error: unknown, originalUrl: string): Error {
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    if (detectPlatformType() === 'browser') {
      return new Error(
        'Network request blocked (CORS). In browser dev mode, restart the dev server and retry. ' +
          'Alternatively, download the M3U file and use "Open M3U File". On LG webOS TV, direct URL loading works.',
      );
    }
    return new Error(`Network request failed: ${error.message}`);
  }

  if (error instanceof Error && error.message === 'Download cancelled') {
    return error;
  }

  if (error instanceof Error) {
    return new Error(`Failed to load playlist: ${error.message}`);
  }

  return new Error(`Failed to load playlist from ${sanitizeUrlForLog(originalUrl)}`);
}

function sanitizeUrlForLog(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.password = '';
    if (parsed.username) parsed.username = '***';
    parsed.searchParams.forEach((_, key) => {
      if (/password|token|key|auth/i.test(key)) {
        parsed.searchParams.set(key, '***');
      }
    });
    return parsed.toString();
  } catch {
    return '[invalid url]';
  }
}
