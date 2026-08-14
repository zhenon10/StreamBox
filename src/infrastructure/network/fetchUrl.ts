import { detectPlatformType } from '@/platform/detectPlatform';

/** Dev-only proxy path — Vite middleware forwards to the target URL server-side. */
export const PLAYLIST_PROXY_PATH = '/api/playlist-proxy';

/**
 * Route external playlist URLs through a CORS-friendly proxy when needed.
 * - Browser DEV: Vite `/api/playlist-proxy`
 * - Production (web + webOS): license API `/v1/stream-proxy`
 *
 * Never rewrite calls that already target the license API (activate / validate / proxy).
 */
export function resolveFetchUrl(url: string): string {
  if (!isExternalUrl(url)) return url;

  const licenseBase = String(import.meta.env.VITE_LICENSE_API_URL ?? '')
    .trim()
    .replace(/\/$/, '');

  if (licenseBase && isSameOriginOrPath(url, licenseBase)) {
    return url;
  }

  if (import.meta.env.DEV) {
    return `${PLAYLIST_PROXY_PATH}?url=${encodeURIComponent(url)}`;
  }

  if (licenseBase && !/YOUR-LICENSE/i.test(licenseBase)) {
    return `${licenseBase}/v1/stream-proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

function isSameOriginOrPath(url: string, base: string): boolean {
  try {
    const target = new URL(url);
    const origin = new URL(base);
    if (target.origin !== origin.origin) return false;
    // License API routes and the proxy itself must never be re-wrapped.
    return (
      target.pathname.startsWith('/v1/') ||
      target.pathname === '/' ||
      target.pathname.startsWith('/admin')
    );
  } catch {
    return url.startsWith(base);
  }
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
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error('Playlist indirme zaman aşımı — tekrar deneyin');
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new Error('Playlist indirme zaman aşımı — tekrar deneyin');
  }

  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) {
    if (detectPlatformType() === 'browser') {
      return new Error(
        'Network request blocked (CORS). In browser dev mode, restart the dev server and retry. ' +
          'Alternatively, download the M3U file and use "Open M3U File". On LG webOS TV, direct URL loading works.',
      );
    }
    return new Error(`Ağ isteği başarısız: ${error.message || 'bağlantı kurulamadı'}`);
  }

  if (error instanceof Error && error.message === 'Download cancelled') {
    return error;
  }

  if (error instanceof Error) {
    const msg = error.message.trim() || error.name || 'bilinmeyen hata';
    return new Error(`Failed to load playlist: ${msg}`);
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
