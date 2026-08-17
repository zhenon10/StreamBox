import type { Channel } from '@/domain/entities';
import { normalizeCategoryKey } from '@/domain/content/contentSection';

/** One playable episode under a series show. */
export interface SeriesEpisode {
  readonly channel: Channel;
  readonly season: number;
  readonly episode: number;
  /** Index into the current browse view (0..listCount-1). */
  readonly viewIndex: number;
}

/** Series poster row — many M3U episodes collapsed into one title. */
export interface SeriesShow {
  readonly id: string;
  readonly title: string;
  readonly logoUrl: string | null;
  readonly episodeCount: number;
  readonly episodes: readonly SeriesEpisode[];
}

interface ParsedEpisode {
  readonly seriesTitle: string;
  readonly season: number;
  readonly episode: number;
}

/**
 * Pull series title + S/E from common IPTV name patterns:
 * "Zero Day S01 E01", "Show S01E02", "Show 1x03", "Dizi 1. Sezon 2. Bölüm"
 */
export function parseEpisodeMeta(name: string): ParsedEpisode | null {
  const raw = name.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  if (!raw) return null;

  const patterns: RegExp[] = [
    /^(.*?)\s*[-–:_|]?\s*S(\d{1,2})\s*[.\-_\s]*E(\d{1,3})\b/i,
    /^(.*?)\s*[-–:_|]?\s*S(\d{1,2})\s*E(\d{1,3})\b/i,
    /^(.*?)\s*[-–:_|]?\s*(\d{1,2})x(\d{1,3})\b/i,
    /^(.*?)\s*[-–:_|]?\s*(\d{1,2})\.\s*Sezon\s+(\d{1,3})\.\s*B[oö]l[uü]m\b/i,
    /^(.*?)\s*[-–:_|]?\s*Sezon\s*(\d{1,2})\s*[-–:_|]?\s*B[oö]l[uü]m\s*(\d{1,3})\b/i,
    /^(.*?)\s*[-–:_|]?\s*B[oö]l[uü]m\s*(\d{1,3})\b/i,
    /^(.*?)\s*[-–:_|]?\s*(?:Ep|Episode|Eps)\.?\s*(\d{1,3})\b/i,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const re = patterns[i];
    if (!re) continue;
    const m = re.exec(raw);
    if (!m) continue;

    const title = cleanSeriesTitle(m[1] ?? '');
    if (!title) continue;

    // Patterns with only episode capture (index 6–7): season defaults to 1.
    if (i >= 5) {
      const ep = Number(m[2]);
      if (!Number.isFinite(ep) || ep < 1) continue;
      return { seriesTitle: title, season: 1, episode: ep };
    }

    const season = Number(m[2]);
    const episode = Number(m[3]);
    if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 0 || episode < 1) {
      continue;
    }
    return { seriesTitle: title, season: Math.max(1, season), episode };
  }

  return null;
}

function cleanSeriesTitle(value: string): string {
  return value
    .replace(/\s*[-–:_|]\s*$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function seriesKey(title: string): string {
  return normalizeCategoryKey(title);
}

/**
 * Collapse flat M3U episode rows into series posters.
 * Titles that do not look like episodes stay as single-item shows.
 */
export function groupChannelsIntoSeries(
  count: number,
  getChannel: (index: number) => Channel | null,
): SeriesShow[] {
  const map = new Map<
    string,
    {
      title: string;
      logoUrl: string | null;
      episodes: SeriesEpisode[];
    }
  >();

  for (let i = 0; i < count; i++) {
    const channel = getChannel(i);
    if (!channel) continue;

    const parsed = parseEpisodeMeta(channel.name);
    const title = parsed?.seriesTitle ?? channel.name.trim();
    const key = seriesKey(title) || `row-${String(i)}`;
    const season = parsed?.season ?? 1;
    const episode = parsed?.episode ?? 1;

    let bucket = map.get(key);
    if (!bucket) {
      bucket = {
        title: parsed?.seriesTitle ?? channel.name.trim(),
        logoUrl: channel.logoUrl,
        episodes: [],
      };
      map.set(key, bucket);
    } else if (!bucket.logoUrl && channel.logoUrl) {
      bucket.logoUrl = channel.logoUrl;
    }

    bucket.episodes.push({
      channel,
      season,
      episode,
      viewIndex: i,
    });
  }

  const shows: SeriesShow[] = [];
  for (const [id, bucket] of map) {
    bucket.episodes.sort((a, b) => {
      if (a.season !== b.season) return a.season - b.season;
      if (a.episode !== b.episode) return a.episode - b.episode;
      return a.channel.name.localeCompare(b.channel.name);
    });
    shows.push({
      id,
      title: bucket.title,
      logoUrl: bucket.logoUrl,
      episodeCount: bucket.episodes.length,
      episodes: bucket.episodes,
    });
  }

  shows.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return shows;
}
