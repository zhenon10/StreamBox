/**
 * Detect stream container / protocol from URL path (query ignored).
 */
export type StreamKind = 'hls' | 'mpegts' | 'native' | 'unknown';

export type PlaybackEngine = 'hls' | 'mpegts' | 'native';

const UNPLAYABLE_EXT = ['.mkv', '.avi', '.mpg', '.mpeg', '.mov', '.wmv', '.flv', '.m4v'] as const;

export function isRemuxUrl(url: string): boolean {
  return /\/v1\/stream-remux\b/i.test(url) || /\/api\/stream-remux\b/i.test(url);
}

export function needsContainerRemux(url: string): boolean {
  const lower = stripQuery(url).toLowerCase();
  return UNPLAYABLE_EXT.some((ext) => lower.endsWith(ext));
}

/**
 * License API remux endpoint — ffmpeg -c copy → MPEG-TS for browser MSE.
 */
export function resolveRemuxFetchUrl(sourceUrl: string): string | null {
  if (typeof window === 'undefined') return null;
  if (!/^https?:\/\//i.test(sourceUrl)) return null;
  if (isRemuxUrl(sourceUrl)) return null;

  if (import.meta.env.DEV) {
    return `/api/stream-remux?url=${encodeURIComponent(sourceUrl)}`;
  }

  const licenseBase = String(import.meta.env.VITE_LICENSE_API_URL ?? '')
    .trim()
    .replace(/\/$/, '');
  if (!licenseBase || /YOUR-LICENSE/i.test(licenseBase)) return null;
  return `${licenseBase}/v1/stream-remux?url=${encodeURIComponent(sourceUrl)}`;
}

export function detectStreamKind(url: string): StreamKind {
  if (isRemuxUrl(url)) return 'mpegts';

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

/** Live-only candidates — original first, then Xtream /live/ + HLS twins. */
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

  // Short form http://host/user/pass/123 → expand to classic Xtream live paths.
  const short = /^(https?:\/\/[^/?#]+)\/([^/?#]+)\/([^/?#]+)\/(\d+)\/?$/i.exec(bare);
  if (short) {
    const origin = short[1] ?? '';
    const user = short[2] ?? '';
    const pass = short[3] ?? '';
    const id = short[4] ?? '';
    push(`${origin}/live/${user}/${pass}/${id}`);
    push(`${origin}/live/${user}/${pass}/${id}.m3u8`);
    push(`${origin}/live/${user}/${pass}/${id}.ts`);
  }

  if (lower.endsWith('.ts') || lower.endsWith('.m2ts')) {
    push(`${stem}.m3u8${query}`);
  } else if (lower.endsWith('.m3u8')) {
    push(`${stem}.ts${query}`);
  } else if (!/\/live\//i.test(bare)) {
    push(`${bare}.m3u8${query}`);
    if (stem !== bare) push(`${stem}.m3u8${query}`);
  } else if (!/\.(m3u8|ts|m2ts)$/i.test(lower)) {
    push(`${bare}.m3u8${query}`);
    push(`${bare}.ts${query}`);
  }

  return candidates;
}

/** Engines for forced live mode (even without /live/ in URL). */
export function enginesForLive(url?: string): readonly PlaybackEngine[] {
  if (url && (/\.m3u8(\?|$)/i.test(url) || /type=m3u8/i.test(url))) {
    return ['hls', 'mpegts'];
  }
  // Raw TS / extension-less: mpegts first, HLS second (some panels serve m3u8 body).
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
  if (isRemuxUrl(url)) return ['mpegts'];
  // Never feed raw MKV/AVI into MSE engines — wait for remux candidate.
  if (needsContainerRemux(url)) return [];

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
      // Progressive MP4/WebM — mpegts.js cannot demux these; skip it.
      return ['native', 'hls'];
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

  // Unplayable containers — remux early (aliases often 404 and burn timeouts).
  for (const ext of UNPLAYABLE_EXT) {
    if (lower.endsWith(ext)) {
      const stem = bare.slice(0, -ext.length);
      const remux = resolveRemuxFetchUrl(url);
      if (remux) push(remux);
      push(`${stem}.mp4${query}`);
      push(`${stem}.m3u8${query}`);
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
    const remux = resolveRemuxFetchUrl(url);
    push(`${bare}.mp4${query}`);
    push(`${bare}.m3u8${query}`);
    if (remux) push(remux);
    push(url);
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
    if (/\/(movie|series)\//i.test(bare)) {
      const remux = resolveRemuxFetchUrl(url);
      if (remux) push(remux);
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
  if (isRemuxUrl(url) || needsContainerRemux(url)) {
    return `Bu video tarayıcıda açılamıyor (${cause}). Kaynak MKV/HEVC olabilir — remux başarısız veya codec desteklenmiyor.`;
  }
  const kind = detectStreamKind(url);
  if (kind === 'native' || /\.(mkv|avi|mov|hevc|m4v)(\?|$)/i.test(url)) {
    return `Bu video tarayıcıda açılamıyor (${cause}). Kaynak MKV/HEVC olabilir — webOS TV’de deneyin veya başka bir yayın seçin.`;
  }
  return `Oynatma başarısız: ${cause}`;
}

/**
 * True for failures worth a silent auto-retry (proxy hiccup, upstream timeout,
 * transient network blip). False for codec/container failures where retrying
 * the same URL will just fail again the same way.
 */
export function isTransientPlaybackFailure(message: string): boolean {
  if (/desteklenmiyor|codec|decode|not supported|remux_unavailable/i.test(message)) {
    return false;
  }
  return /timeout|zaman aşımı|network|ağ|proxy_failed|upstream|abort|bağlantı/i.test(message);
}

function stripQuery(url: string): string {
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}
