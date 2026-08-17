import { detectPlatformType } from '@/platform/detectPlatform';

/** Dev-only proxy path — Vite middleware forwards to the target URL server-side. */
export const PLAYLIST_PROXY_PATH = '/api/playlist-proxy';

/**
 * Xtream `type=m3u` is a bare list (no group-title). Prefer `m3u_plus` so
 * Live / Film / Dizi tabs can classify channels.
 */
export function preferXtreamM3uPlus(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (!path.endsWith('/get.php') && path !== '/get.php') return url;
    if (!parsed.searchParams.has('username') || !parsed.searchParams.has('password')) {
      return url;
    }
    const type = (parsed.searchParams.get('type') ?? '').toLowerCase();
    if (type === 'm3u_plus' || type === 'm3u8_plus') return url;
    if (type === 'm3u' || type === '' || type === 'm3u8') {
      parsed.searchParams.set('type', 'm3u_plus');
      if (!parsed.searchParams.get('output')) {
        parsed.searchParams.set('output', 'ts');
      }
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}

/** True when a saved playlist URL should be re-fetched as m3u_plus. */
export function xtreamUrlNeedsM3uPlus(url: string): boolean {
  return preferXtreamM3uPlus(url) !== url;
}

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
