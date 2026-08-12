/**
 * Detect stream container / protocol from URL path (query ignored).
 */
export type StreamKind = 'hls' | 'mpegts' | 'native' | 'unknown';

export type PlaybackEngine = 'hls' | 'mpegts' | 'native';

export function detectStreamKind(url: string): StreamKind {
  const path = stripQuery(url).toLowerCase();

  if (path.endsWith('.m3u8') || path.includes('/hls/') || path.includes('type=m3u8')) {
    return 'hls';
  }
  if (
    path.endsWith('.ts') ||
    path.endsWith('.m2ts') ||
    path.includes('/mpegts') ||
    path.includes('output=ts') ||
    path.includes('type=ts')
  ) {
    return 'mpegts';
  }
  if (
    path.endsWith('.mp4') ||
    path.endsWith('.webm') ||
    path.endsWith('.ogg') ||
    path.endsWith('.mp3') ||
    path.endsWith('.aac')
  ) {
    return 'native';
  }

  // Xtream-style live/vod paths — often MPEG-TS when playlist used output=ts
  if (/\/(live|movie|series)\//i.test(path)) return 'mpegts';

  return 'unknown';
}

/** Live-only candidates — original first, optional HLS twin. No .mp4 probing. */
export function buildLivePlaybackCandidates(url: string): string[] {
  const candidates: string[] = [];
  const push = (u: string): void => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  const bare = stripQuery(url);
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const lower = bare.toLowerCase();
  const slash = bare.lastIndexOf('/');
  const dot = bare.lastIndexOf('.');
  const stem = dot > slash ? bare.slice(0, dot) : bare;

  push(url);
  if (lower.endsWith('.ts') || lower.endsWith('.m2ts')) {
    push(`${stem}.m3u8${query}`);
  } else if (!lower.endsWith('.m3u8')) {
    push(`${bare}.m3u8${query}`);
    if (stem !== bare) push(`${stem}.m3u8${query}`);
  }
  return candidates;
}

/** Engines for forced live mode (even without /live/ in URL). */
export function enginesForLive(): readonly PlaybackEngine[] {
  // Match last working repo: mpegts MSE first for live Xtream.
  return ['mpegts', 'hls'];
}

function isLikelyWebOsRuntime(): boolean {
  try {
    if (typeof window !== 'undefined' && (window.PalmSystem || window.webOS)) return true;
  } catch {
    // ignore
  }
  return String(import.meta.env.VITE_PLATFORM ?? '') === 'webos';
}

export function enginesForUrl(url: string): readonly PlaybackEngine[] {
  const live = /\/live\//i.test(url);
  const kind = detectStreamKind(url);
  const onWebOs = isLikelyWebOsRuntime();

  if (live) {
    if (kind === 'hls') return onWebOs ? ['hls', 'native'] : ['hls'];
    return onWebOs ? ['mpegts', 'hls', 'native'] : ['mpegts', 'hls'];
  }

  switch (kind) {
    case 'hls':
      return onWebOs ? ['hls', 'native'] : ['hls', 'native'];
    case 'mpegts':
      return onWebOs ? ['mpegts', 'hls', 'native'] : ['mpegts', 'hls', 'native'];
    case 'native':
      return ['native', 'mpegts', 'hls'];
    default:
      return onWebOs ? ['mpegts', 'hls', 'native'] : ['mpegts', 'hls', 'native'];
  }
}

/**
 * Produce candidate playback URLs (best first) so the player can fall back.
 * Browser cannot play raw MKV/AVI; Xtream often accepts .mp4 / .m3u8 aliases.
 */
export function buildPlaybackCandidates(url: string): string[] {
  const candidates: string[] = [];
  const push = (u: string): void => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  const bare = stripQuery(url);
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  const lower = bare.toLowerCase();
  const isLive = /\/live\//i.test(bare);
  const xtream = /\/(live|movie|series)\//i.test(bare);

  const stemOf = (path: string): string => {
    const slash = path.lastIndexOf('/');
    const dot = path.lastIndexOf('.');
    if (dot > slash) return path.slice(0, dot);
    return path;
  };

  // Live streams: original URL first, optional HLS twin only.
  // Do NOT probe .mp4 — wasted attempts pause() the element and abort play().
  if (isLive) {
    push(url);
    const stem = stemOf(bare);
    if (lower.endsWith('.ts') || lower.endsWith('.m2ts')) {
      push(`${stem}.m3u8${query}`);
    } else if (!/\.(m3u8|mp4|ts)$/i.test(lower)) {
      push(`${bare}.m3u8${query}`);
    }
    return candidates;
  }

  // Unplayable containers — prefer browser-friendly aliases first.
  for (const ext of ['.mkv', '.avi', '.mpg', '.mpeg', '.mov', '.wmv', '.flv', '.m4v']) {
    if (lower.endsWith(ext)) {
      const stem = bare.slice(0, -ext.length);
      push(`${stem}.mp4${query}`);
      push(`${stem}.m3u8${query}`);
      push(`${stem}.ts${query}`);
      push(stem + query);
      push(url);
      return candidates;
    }
  }

  if (lower.endsWith('.ts') || lower.endsWith('.m2ts')) {
    const stem = stemOf(bare);
    push(url);
    push(`${stem}.m3u8${query}`);
    return candidates;
  }

  if (lower.endsWith('.m3u8')) {
    push(url);
    return candidates;
  }

  if (lower.endsWith('.mp4')) {
    push(url);
    const stem = stemOf(bare);
    push(`${stem}.m3u8${query}`);
    push(`${stem}.ts${query}`);
    return candidates;
  }

  // Extension-less Xtream movie/series URLs.
  if (/\/(movie|series)\/[^/]+\/[^/]+\/[^/.?]+$/i.test(bare)) {
    push(url);
    push(`${bare}.m3u8${query}`);
    push(`${bare}.mp4${query}`);
    push(`${bare}.ts${query}`);
    return candidates;
  }

  push(url);

  if (xtream) {
    const stem = stemOf(bare);
    if (stem !== bare) {
      push(`${stem}.m3u8${query}`);
      push(`${stem}.mp4${query}`);
    } else {
      push(`${bare}.m3u8${query}`);
      push(`${bare}.mp4${query}`);
    }
  }

  return candidates;
}

/**
 * Route remote media through a same-origin / CORS-friendly proxy when needed.
 * - Dev simulator: Vite `/api/stream-proxy`
 * - Production web + packaged webOS: license API `/v1/stream-proxy` (MSE requires CORS)
 */
export function resolveMediaFetchUrl(url: string): string {
  if (typeof window === 'undefined') return url;
  if (url.startsWith('/') || url.startsWith(window.location.origin)) return url;
  if (!/^https?:\/\//i.test(url)) return url;

  if (import.meta.env.DEV) {
    return `/api/stream-proxy?url=${encodeURIComponent(url)}`;
  }

  const licenseBase = String(import.meta.env.VITE_LICENSE_API_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  if (licenseBase && url.startsWith(licenseBase)) {
    return url;
  }
  if (licenseBase && !/YOUR-LICENSE/i.test(licenseBase)) {
    return `${licenseBase}/v1/stream-proxy?url=${encodeURIComponent(url)}`;
  }

  return url;
}

export function formatPlaybackFailure(url: string, cause: string): string {
  const kind = detectStreamKind(url);
  if (kind === 'native' || /\.(mkv|avi|mov|hevc|m4v)(\?|$)/i.test(url)) {
    return `Bu video tarayıcıda açılamıyor (${cause}). Kaynak MKV/HEVC olabilir — webOS TV’de deneyin veya başka bir yayın seçin.`;
  }
  return `Oynatma başarısız: ${cause}`;
}

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}
