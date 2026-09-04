import type { Channel, ChannelId, PlaylistId } from '@/domain/entities';
import {
  classifyChannel,
  categoryAllowedInSection,
  dominantSection,
  emptyCatalog,
  groupTotal,
  isAdultCategory,
  isStrongLiveName,
  isStrongMovieName,
  isStrongSeriesName,
  isVodLabeledCategory,
  normalizeCategoryKey,
  type ContentCatalog,
  type ContentSection,
  type SectionCategory,
} from '@/domain/content/contentSection';
import { yieldToMain } from '@/infrastructure/async/yieldToMain';

/**
 * Holds the active playlist's channels outside React/Zustand.
 * Putting 100k Channel objects into React state freezes the browser;
 * the UI reads by index through this session store instead.
 */
class ChannelSessionStoreImpl {
  private playlistId: PlaylistId | null = null;
  private channels: readonly Channel[] = [];
  private byId = new Map<string, Channel>();
  private groupIndices = new Map<string, number[]>();
  /** groupName::section → indices (section-aware category filter). */
  private sectionGroupIndices = new Map<string, number[]>();
  private catalog: ContentCatalog = emptyCatalog();
  private catalogReady = false;
  private catalogPromise: Promise<ContentCatalog> | null = null;
  private indexReady = false;
  private indexPromise: Promise<void> | null = null;
  /** Zap list from channels screen (category / search results). */
  private zapIndices: number[] = [];

  /** Adopt an existing channel array by reference (no clone, no sync index). */
  adopt(playlistId: PlaylistId, channels: readonly Channel[]): void {
    this.playlistId = playlistId;
    this.channels = channels;
    this.byId.clear();
    this.groupIndices.clear();
    this.sectionGroupIndices.clear();
    this.zapIndices = [];
    this.catalog = emptyCatalog();
    this.catalogReady = false;
    this.catalogPromise = null;
    this.indexReady = false;
    this.indexPromise = null;
  }

  clear(): void {
    this.playlistId = null;
    this.channels = [];
    this.byId.clear();
    this.groupIndices.clear();
    this.sectionGroupIndices.clear();
    this.zapIndices = [];
    this.catalog = emptyCatalog();
    this.catalogReady = false;
    this.catalogPromise = null;
    this.indexReady = false;
    this.indexPromise = null;
  }

  getPlaylistId(): PlaylistId | null {
    return this.playlistId;
  }

  getCount(): number {
    return this.channels.length;
  }

  getAt(index: number): Channel | null {
    return this.channels[index] ?? null;
  }

  getById(channelId: ChannelId | string): Channel | null {
    return this.byId.get(channelId) ?? null;
  }

  /** Cache a channel for O(1) player lookup after list selection. */
  remember(channel: Channel): void {
    this.byId.set(channel.id, channel);
  }

  getAll(): readonly Channel[] {
    return this.channels;
  }

  setZapContext(indices: readonly number[] | null): void {
    this.zapIndices = indices ? [...indices] : [];
  }

  /**
   * Next/prev channel within current zap context, else within same group.
   */
  findNeighbor(channelId: ChannelId | string, direction: 1 | -1): Channel | null {
    const list =
      this.zapIndices.length > 0 ? this.zapIndices : this.indicesForChannelGroup(channelId);

    if (list.length === 0) return null;

    let pos = -1;
    for (let i = 0; i < list.length; i++) {
      const idx = list[i];
      if (idx === undefined) continue;
      const ch = this.channels[idx];
      if (ch && ch.id === channelId) {
        pos = i;
        break;
      }
    }
    if (pos < 0) return null;

    const nextPos = pos + direction;
    if (nextPos < 0 || nextPos >= list.length) return null;
    const nextIdx = list[nextPos];
    return nextIdx === undefined ? null : (this.channels[nextIdx] ?? null);
  }

  private indicesForChannelGroup(channelId: ChannelId | string): number[] {
    const current = this.byId.get(channelId);
    if (!current) return [];
    const key = current.group.toLowerCase();
    const cached = this.groupIndices.get(key);
    if (cached) return [...cached];

    const results: number[] = [];
    for (let i = 0; i < this.channels.length; i++) {
      const ch = this.channels[i];
      if (ch && (ch.group === current.group || ch.group.toLowerCase() === key)) {
        results.push(i);
      }
    }
    this.groupIndices.set(key, results);
    return results;
  }

  getCatalog(): ContentCatalog {
    return this.catalog;
  }

  /** Build Live / Movie / Series category lists (chunked). */
  async ensureCatalog(): Promise<ContentCatalog> {
    if (this.catalogReady) return this.catalog;
    if (this.catalogPromise) return this.catalogPromise;

    this.catalogPromise = this.buildCatalog();
    return this.catalogPromise;
  }

  /**
   * Collect indices for one group, optionally limited to a content section.
   */
  async collectGroupIndices(
    groupName: string,
    section?: ContentSection | null,
  ): Promise<readonly number[]> {
    const key = section ? `${section}::${groupName.toLowerCase()}` : groupName.toLowerCase();

    const cache = section ? this.sectionGroupIndices : this.groupIndices;
    const cached = cache.get(key);
    if (cached) return cached;

    const results: number[] = [];
    const channels = this.channels;
    const chunk = 8_000;
    const groupKey = groupName.toLowerCase();

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const matchGroup = ch.group === groupName || ch.group.toLowerCase() === groupKey;
      if (!matchGroup) continue;
      if (section && classifyChannel(ch) !== section) continue;
      results.push(i);

      if (i > 0 && i % chunk === 0) {
        await yieldToMain();
        if (this.channels !== channels) return results;
      }
    }

    if (this.channels === channels) {
      cache.set(key, results);
    }
    return results;
  }

  /**
   * All indices for a section, optionally excluding +18/adult-tagged groups.
   * Used when the adult-content lock is active and no category/search filter
   * is selected, so the small-playlist "show everything" fast path can't
   * leak locked categories.
   */
  async collectSectionIndices(
    section: ContentSection,
    excludeAdult: boolean,
  ): Promise<readonly number[]> {
    const key = `__section::${section}::${excludeAdult ? 'noadult' : 'all'}`;
    const cached = this.sectionGroupIndices.get(key);
    if (cached) return cached;

    const results: number[] = [];
    const channels = this.channels;
    const chunk = 8_000;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      if (classifyChannel(ch) !== section) continue;
      if (excludeAdult && isAdultCategory(ch.group)) continue;
      results.push(i);

      if (i > 0 && i % chunk === 0) {
        await yieldToMain();
        if (this.channels !== channels) return results;
      }
    }

    if (this.channels === channels) {
      this.sectionGroupIndices.set(key, results);
    }
    return results;
  }

  /** @deprecated Prefer collectGroupIndices for a single category. */
  async ensureGroupIndex(): Promise<void> {
    if (this.indexReady) return;
    if (this.indexPromise) return this.indexPromise;
    this.indexPromise = this.buildGroupIndex();
    await this.indexPromise;
  }

  getGroupIndices(groupName: string): readonly number[] {
    return this.groupIndices.get(groupName.toLowerCase()) ?? [];
  }

  /**
   * Search returns at most `limit` indices — optionally scoped to a section.
   */
  async searchIndices(
    query: string,
    limit = 500,
    section?: ContentSection | null,
  ): Promise<number[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results: number[] = [];
    const chunk = 8000;
    const channels = this.channels;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      if (section && classifyChannel(ch) !== section) continue;
      if (ch.name.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q)) {
        results.push(i);
        if (results.length >= limit) break;
      }
      if (i > 0 && i % chunk === 0) {
        await yieldToMain();
        if (this.channels !== channels) return results;
      }
    }
    return results;
  }

  private async buildCatalog(): Promise<ContentCatalog> {
    const channels = this.channels;
    const groupStats = new Map<string, Record<ContentSection, number>>();
    const counts: Record<ContentSection, number> = { live: 0, movie: 0, series: 0 };
    const chunk = 6_000;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const section = classifyChannel(ch);
      counts[section]++;

      let stats = groupStats.get(ch.group);
      if (!stats) {
        stats = { live: 0, movie: 0, series: 0 };
        groupStats.set(ch.group, stats);
      }
      stats[section]++;

      if (i > 0 && i % chunk === 0) {
        await yieldToMain();
        if (this.channels !== channels) return this.catalog;
      }
    }

    if (this.channels !== channels) return this.catalog;

    const live: SectionCategory[] = [];
    const movie: SectionCategory[] = [];
    const series: SectionCategory[] = [];

    for (const [name, stats] of groupStats) {
      const total = groupTotal(stats);
      if (total <= 0) continue;
      const adult = isAdultCategory(name);

      // Film / dizi labels first (Turkish İ: FİLM / DİZİ) — never pin these to Live.
      if (isStrongSeriesName(name)) {
        series.push({ name, channelCount: total, section: 'series', adult });
        continue;
      }
      if (isStrongMovieName(name)) {
        movie.push({ name, channelCount: total, section: 'movie', adult });
        continue;
      }
      if (isStrongLiveName(name)) {
        live.push({ name, channelCount: total, section: 'live', adult });
        continue;
      }

      // Ambiguous group: place only where streams actually belong.
      // Live tab must not inherit VOD leftovers.
      if (stats.series > 0 && categoryAllowedInSection(name, 'series')) {
        series.push({ name, channelCount: stats.series, section: 'series', adult });
      }
      if (stats.movie > 0 && categoryAllowedInSection(name, 'movie')) {
        movie.push({ name, channelCount: stats.movie, section: 'movie', adult });
      }
      if (stats.live > 0 && categoryAllowedInSection(name, 'live') && !isVodLabeledCategory(name)) {
        live.push({ name, channelCount: stats.live, section: 'live', adult });
      } else if (stats.live === 0 && stats.movie === 0 && stats.series === 0) {
        // unreachable — total > 0
      } else if (
        // No section matched; fall back by dominant (still never VOD→Live)
        stats.live + stats.movie + stats.series > 0 &&
        !isVodLabeledCategory(name)
      ) {
        const named = dominantSection(stats, name);
        if (named === 'live' && stats.live > 0) {
          live.push({ name, channelCount: stats.live, section: 'live', adult });
        } else if (named === 'movie' && stats.movie > 0) {
          movie.push({ name, channelCount: stats.movie, section: 'movie', adult });
        } else if (named === 'series' && stats.series > 0) {
          series.push({ name, channelCount: stats.series, section: 'series', adult });
        }
      }
    }

    const sortCats = (list: SectionCategory[]): SectionCategory[] => {
      const MAX = 250;
      // Dedupe by normalized name (prevents repeated tiles when navigating).
      const seen = new Set<string>();
      const unique: SectionCategory[] = [];
      for (const entry of list) {
        const key = normalizeCategoryKey(entry.name);
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(entry);
      }
      unique.sort((a, b) => {
        if (a.section === 'live') {
          const aLive = liveNameScore(a.name);
          const bLive = liveNameScore(b.name);
          if (aLive !== bLive) return bLive - aLive;
        }
        return b.channelCount - a.channelCount || a.name.localeCompare(b.name);
      });
      return unique.slice(0, MAX);
    };

    // Prefer real broadcast groups (► Ulusal / Spor / Haber) when present.
    const liveSorted = sortCats(live);
    const strongLive = liveSorted.filter((c) => isStrongLiveName(c.name));
    const liveFinal =
      strongLive.length >= 2 ? strongLive : liveSorted.filter((c) => !isVodLabeledCategory(c.name));

    this.catalog = {
      live: liveFinal,
      movie: sortCats(movie),
      series: sortCats(series),
      counts,
    };
    this.catalogReady = true;
    return this.catalog;
  }

  private async buildGroupIndex(): Promise<void> {
    const map = new Map<string, number[]>();
    const chunk = 5000;
    const channels = this.channels;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      if (!ch) continue;
      const key = ch.group.toLowerCase();
      let list = map.get(key);
      if (!list) {
        list = [];
        map.set(key, list);
      }
      list.push(i);

      if (i > 0 && i % chunk === 0) {
        await yieldToMain();
        if (this.channels !== channels) return;
      }
    }

    if (this.channels !== channels) return;
    this.groupIndices = map;
    this.indexReady = true;
  }
}

export const channelSession = new ChannelSessionStoreImpl();

/** Higher = more likely a real broadcast category (shown first in Live TV). */
function liveNameScore(name: string): number {
  const key = normalizeCategoryKey(name);
  let score = 0;
  if (/ulusal|haber|spor|belgesel|yerel|canli|live|radyo|muzik/.test(key)) score += 8;
  if (/^[a-z]{2,3}\s*[|:]/.test(key)) score += 2;
  if (/film|filme|movie|netflix|disney|dizi|vod|sinema|cinema/.test(key)) score -= 12;
  if (key === 'uncategorized' || key === 'unknown') score -= 5;
  return score;
}
