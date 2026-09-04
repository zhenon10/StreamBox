import type { Channel } from '@/domain/entities';

/** Top-level content buckets — Live TV vs VOD (movies / series). */
export type ContentSection = 'live' | 'movie' | 'series';

export const CONTENT_SECTION_LABELS: Record<ContentSection, string> = {
  live: 'Canlı TV',
  movie: 'Filmler',
  series: 'Diziler',
};

/**
 * Fold Turkish + Latin accents so "FİLM", "SÉRIE", "CINÉMA" match ASCII rules.
 * JS /i does NOT treat İ as I or É as E.
 */
export function normalizeCategoryKey(value: string): string {
  return value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/Ş/g, 's')
    .replace(/ş/g, 's')
    .replace(/Ğ/g, 'g')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u')
    .replace(/ü/g, 'u')
    .replace(/Ö/g, 'o')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'c')
    .replace(/ç/g, 'c')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Movie / VOD group markers (matched against normalized text). */
const MOVIE_GROUP =
  /(?:^|[\s|/_►›»→:.-])(film|films|filme|filmler|filmleri|movie|movies|vod|cinema|sinema|peliculas?|boxoffice|box\s*office|hollywoodwood|bollywood|animasyon|animation)(?:\b|$)/;

/** Series markers. */
const SERIES_GROUP =
  /(?:^|[\s|/_►›»→:.-])(dizi|diziler|dizisi|series|serie|seriales|serial|sezon|season|episode|bolum|tv\s*shows?)(?:\b|$)/;

/** VOD platforms — never under Live. */
const VOD_PLATFORM =
  /\b(netflix|disney(?:\s*\+)?|amazon|prime\s*video|exxen|blutv|blu\s*tv|gain|hbo|\bmax\b|apple\s*tv|mubi|\btod\b|puhu|tv\+|tabii|youtube|imdb|filmbox|film\s*box|moviebox|dizi\s*box|bein\s*connect|premiere)\b/;

/**
 * Broadcast live tokens. "belgesel" alone can be live, but NOT when the name
 * also contains film/dizi (handled by checking movie/series first).
 */
const LIVE_TOKEN =
  /(ulusal|yerel|spor|sport|sports|haber|news|belgesel|canli|live|radyo|radio|muzik|music|dini|uydu|satellite|ulusal\s*kanallar|yerel\s*kanallar|raw|android)/;

const PIPE_LIVE =
  /^[a-z]{2,3}\s*[|:／⁄]\s*(ulusal|yerel|spor|sport|haber|news|belgesel|canli|live|radyo|radio|muzik|music|dini|cocuk|kids)/;

/** Panel style: "► Ulusal", "► Spor", "► Haber" */
const TRIANGLE_LIVE =
  /^[►▶➢➤▸➔→]\s*(ulusal|yerel|spor|sport|haber|news|belgesel|canli|live|radyo|radio|muzik|music|dini|cocuk|kids|raw)/;

const LIVE_KIDS_TV = /\b(cocuk\s*tv|kids\s*tv|cartoon\s*network|nick(?:elodeon)?)\b/;

const YEAR_TOKEN = /\b(19|20)\d{2}\b/;
const YEAR_VOD_HINT = /yabanc|yerli|koleksiyon|collection|boxset|box\s*set/;

/** +18 / adult category markers — kept locked behind a PIN until unlocked. */
const ADULT_GROUP =
  /(?:^|[\s|/_►›»→:.-])(adult|adults|xxx|erotik|erotic|erotica|porn|porno|playboy|brazzers|hustler|yetiskin|seks|sex|fetish|milf)(?:\b|$)/;
const ADULT_AGE_MARK = /(?:^|[\s|/_►›»→:.-])\+?18\+?(?:[\s|/_►›»→:.-]|$)/;

/** True when a raw group-title marks the category as adult-only content. */
export function isAdultCategory(group: string): boolean {
  const g = normalizeCategoryKey(group);
  if (!g) return false;
  if (ADULT_GROUP.test(g)) return true;
  if (ADULT_AGE_MARK.test(g)) return true;
  return false;
}

/**
 * Classify a single channel.
 * Strong group labels (FİLM / DİZİ / ULUSAL) win over URL quirks.
 */
export function classifyChannel(channel: Channel): ContentSection {
  const group = channel.group ?? '';

  if (isStrongSeriesName(group)) return 'series';
  if (isStrongMovieName(group)) return 'movie';
  if (isStrongLiveName(group)) return 'live';

  const url = channel.url.toLowerCase();
  const fromUrl = classifyFromUrl(url);
  if (fromUrl) return fromUrl;

  if (/\.(mp4|mkv|avi|m4v|mov|wmv)(\?|$)/i.test(url)) {
    return classifyGroupName(group) === 'series' ? 'series' : 'movie';
  }

  return classifyGroupName(group);
}

function classifyFromUrl(url: string): ContentSection | null {
  if (/\/series\/|\/show\/|\/episode\//i.test(url)) return 'series';
  if (/\/movie\/|\/movies\/|\/vod\/|\/film\//i.test(url)) return 'movie';
  if (/\/live\/|\/streaming\//i.test(url)) return 'live';

  try {
    const parsed = new URL(url);
    const type = parsed.searchParams.get('type')?.toLowerCase();
    if (type === 'series' || type === 'serial') return 'series';
    if (type === 'movie' || type === 'vod' || type === 'films' || type === 'film') return 'movie';
    if (type === 'live') return 'live';

    const stream = parsed.searchParams.get('stream')?.toLowerCase();
    if (stream === 'series') return 'series';
    if (stream === 'movie' || stream === 'vod') return 'movie';
    if (stream === 'live') return 'live';
  } catch {
    if (/[?&]type=series\b/i.test(url)) return 'series';
    if (/[?&]type=(movie|vod|film)\b/i.test(url)) return 'movie';
    if (/[?&]type=live\b/i.test(url)) return 'live';
  }

  return null;
}

export function isStrongMovieName(group: string): boolean {
  const g = normalizeCategoryKey(group);
  if (!g) return false;
  if (MOVIE_GROUP.test(g)) return true;
  if (VOD_PLATFORM.test(g) && !SERIES_GROUP.test(g) && !LIVE_TOKEN.test(g)) return true;
  if (YEAR_TOKEN.test(g) && YEAR_VOD_HINT.test(g)) return true;
  return false;
}

export function isStrongSeriesName(group: string): boolean {
  const g = normalizeCategoryKey(group);
  if (!g) return false;
  return SERIES_GROUP.test(g);
}

export function isStrongLiveName(group: string): boolean {
  const g = normalizeCategoryKey(group);
  if (!g) return false;
  // Film / dizi labels always win — "FİLM ► Belgesel" must NOT be live.
  if (isStrongMovieName(group) || isStrongSeriesName(group)) return false;
  if (PIPE_LIVE.test(g)) return true;
  if (TRIANGLE_LIVE.test(g)) return true;
  if (LIVE_KIDS_TV.test(g)) return true;
  if (LIVE_TOKEN.test(g)) return true;
  return false;
}

/** True when the category clearly belongs to VOD (should never appear under Live). */
export function isVodLabeledCategory(group: string): boolean {
  if (isStrongMovieName(group) || isStrongSeriesName(group)) return true;
  const g = normalizeCategoryKey(group);
  // Catch accented / partial labels that slipped past strong matchers.
  return /(?:^|[\s|/_►›»→:.-])(serie|series|dizi|film|filme|cinema|sinema|vod|movie)(?:\b|$)/.test(
    g,
  );
}

/**
 * Cached playlists with almost everything as "Uncategorized" need a re-fetch.
 * Covers old EXTINF bugs (/live/ URLs) and bare Xtream `type=m3u` lists
 * (short /user/pass/id URLs with no group-title).
 */
export function playlistGroupsNeedRepair(
  channels: readonly { readonly group: string; readonly url: string }[],
): boolean {
  if (channels.length < 200) return false;
  const sample = Math.min(channels.length, 8_000);
  let uncategorized = 0;
  let liveUncat = 0;
  for (let i = 0; i < sample; i++) {
    const ch = channels[i];
    if (!ch) continue;
    const g = (ch.group || '').trim();
    if (g === '' || g === 'Uncategorized') {
      uncategorized++;
      if (/\/live\//i.test(ch.url)) liveUncat++;
    }
  }
  const ratio = uncategorized / sample;
  // Bare Xtream m3u: every row is Uncategorized, URLs lack /live/.
  if (ratio >= 0.8) return true;
  return ratio >= 0.45 && liveUncat >= 50;
}

export function classifyGroupName(group: string): ContentSection {
  const g = group.trim();
  if (!g) return 'live';

  if (isStrongSeriesName(g) && isStrongMovieName(g)) {
    const key = normalizeCategoryKey(g);
    if (/dizi/.test(key) && !/film/.test(key)) return 'series';
    return 'movie';
  }
  if (isStrongSeriesName(g)) return 'series';
  if (isStrongMovieName(g)) return 'movie';
  if (VOD_PLATFORM.test(normalizeCategoryKey(g))) return 'movie';
  if (isStrongLiveName(g)) return 'live';
  if (YEAR_TOKEN.test(normalizeCategoryKey(g)) && YEAR_VOD_HINT.test(normalizeCategoryKey(g))) {
    return 'movie';
  }
  return 'live';
}

/**
 * Live tab: only real broadcast categories (no FİLM / DİZİ packs).
 * Movie / Series tabs: block the opposite strong labels.
 */
export function categoryAllowedInSection(name: string, section: ContentSection): boolean {
  if (section === 'live') {
    // Strict: never show film / dizi / série / cinéma packs under Canlı TV.
    if (isVodLabeledCategory(name)) return false;
    return true;
  }
  if (section === 'movie') {
    if (isStrongSeriesName(name) && !isStrongMovieName(name)) return false;
    if (isStrongLiveName(name)) return false;
    return true;
  }
  if (isStrongMovieName(name) && !isStrongSeriesName(name)) return false;
  if (isStrongLiveName(name) && !isStrongSeriesName(name)) return false;
  return true;
}

export function dominantSection(
  counts: Readonly<Record<ContentSection, number>>,
  groupName?: string,
): ContentSection {
  if (groupName) {
    if (isStrongSeriesName(groupName)) return 'series';
    if (isStrongMovieName(groupName)) return 'movie';
    if (isStrongLiveName(groupName)) return 'live';
  }

  let best: ContentSection = 'live';
  let bestCount = -1;
  (['movie', 'series', 'live'] as const).forEach((section) => {
    const n = counts[section];
    if (n > bestCount) {
      best = section;
      bestCount = n;
    }
  });

  if (counts.movie === counts.live && counts.movie > 0 && counts.movie >= counts.series) {
    return 'movie';
  }
  if (counts.series === counts.live && counts.series > 0 && counts.series > counts.movie) {
    return 'series';
  }
  return best;
}

export function groupTotal(counts: Readonly<Record<ContentSection, number>>): number {
  return counts.live + counts.movie + counts.series;
}

export interface SectionCategory {
  readonly name: string;
  readonly channelCount: number;
  readonly section: ContentSection;
  /** +18 / adult category — hidden behind the PIN lock until unlocked. */
  readonly adult: boolean;
}

export interface ContentCatalog {
  readonly live: readonly SectionCategory[];
  readonly movie: readonly SectionCategory[];
  readonly series: readonly SectionCategory[];
  readonly counts: Record<ContentSection, number>;
}

export function emptyCatalog(): ContentCatalog {
  return {
    live: [],
    movie: [],
    series: [],
    counts: { live: 0, movie: 0, series: 0 },
  };
}

export function classifyCategoryName(name: string): ContentSection {
  return classifyGroupName(name);
}
