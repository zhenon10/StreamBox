import type { Category, Channel, ChannelId } from '@/domain/entities';
import { createChannelId } from '@/domain/entities';
import { yieldToMain } from '@/infrastructure/async/yieldToMain';

interface ExtInfMetadata {
  duration: string;
  attributes: Record<string, string>;
  title: string;
}

function parseExtInf(line: string): ExtInfMetadata | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('#EXTINF:')) return null;

  const body = trimmed.slice('#EXTINF:'.length).trim();
  const durMatch = /^(-?\d+(?:\.\d+)?)\s*(.*)$/.exec(body);
  if (!durMatch) return null;

  const duration = durMatch[1] ?? '-1';
  let rest = durMatch[2] ?? '';
  // Support both:
  //   #EXTINF:-1 attrs...,Title
  //   #EXTINF:-1,attrs...,Title   /  #EXTINF:-1,Title
  if (rest.startsWith(',')) {
    rest = rest.slice(1);
  }

  // Split attributes / title on the first comma that is NOT inside quotes.
  // Correct:  #EXTINF:-1 tvg-id="a" group-title="► Ulusal",TRT 1
  // Also OK:  #EXTINF:-1,group-title="TR|FILM",Movie Name
  let inQuotes = false;
  let commaIdx = -1;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      commaIdx = i;
      break;
    }
  }

  let attrBlob = '';
  let title = rest.trim();
  if (commaIdx >= 0) {
    attrBlob = rest.slice(0, commaIdx).trim();
    title = rest.slice(commaIdx + 1).trim();
  }

  const attributes: Record<string, string> = {};
  // Double-quoted attrs (standard)
  const attrRegex = /([\w-]+)\s*=\s*"([^"]*)"/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(attrBlob)) !== null) {
    attributes[attrMatch[1] ?? ''] = attrMatch[2] ?? '';
  }
  // Single-quoted attrs (some panels)
  const attrRegexSq = /([\w-]+)\s*=\s*'([^']*)'/g;
  while ((attrMatch = attrRegexSq.exec(attrBlob)) !== null) {
    const key = attrMatch[1] ?? '';
    if (key && attributes[key] === undefined) {
      attributes[key] = attrMatch[2] ?? '';
    }
  }

  return { duration, attributes, title };
}

function extractGroup(attributes: Record<string, string>): string {
  const raw =
    attributes['group-title'] ??
    attributes['group'] ??
    attributes['tvg-group'] ??
    '';
  const group = raw.trim();
  return group || 'Uncategorized';
}

function generateChannelId(url: string, index: number): ChannelId {
  return createChannelId(`ch_${String(index)}_${hashString(url)}`);
}

function hashString(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function categoriesFromCounts(counts: Map<string, number>): Category[] {
  // Cap early — sorting tens of thousands of group titles freezes low-end browsers.
  const MAX_CATEGORIES = 300;
  const entries = Array.from(counts.entries());
  if (entries.length > MAX_CATEGORIES) {
    entries.sort((a, b) => b[1] - a[1]);
    entries.length = MAX_CATEGORIES;
  }
  return entries
    .map(([name, channelCount]) => ({ name, channelCount }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function buildCategories(channels: readonly Channel[]): Category[] {
  const counts = new Map<string, number>();
  for (const channel of channels) {
    counts.set(channel.group, (counts.get(channel.group) ?? 0) + 1);
  }
  return categoriesFromCounts(counts);
}

export interface ParseM3UResult {
  readonly channels: readonly Channel[];
  readonly categories: readonly Category[];
}

export interface ParseM3UAsyncOptions {
  readonly onProgress?: (loaded: number) => void;
  /** Yield to the UI every N lines (default 2500). */
  readonly yieldEveryLines?: number;
}

function createChannelFromMeta(
  pendingMeta: ExtInfMetadata,
  url: string,
  index: number,
): Channel {
  const attrs = pendingMeta.attributes;
  return {
    id: generateChannelId(url, index),
    name: pendingMeta.title || attrs['tvg-name'] || `Channel ${String(index + 1)}`,
    url,
    group: extractGroup(attrs),
    logoUrl: attrs['tvg-logo'] ?? null,
    tvgId: attrs['tvg-id'] ?? null,
    tvgName: attrs['tvg-name'] ?? null,
  };
}

export function parseM3U(content: string): ParseM3UResult {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];
  let pendingMeta: ExtInfMetadata | null = null;
  let index = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      pendingMeta = parseExtInf(line);
      continue;
    }

    if (line.startsWith('#')) continue;

    if (pendingMeta) {
      channels.push(createChannelFromMeta(pendingMeta, line, index));
      pendingMeta = null;
      index++;
    }
  }

  return {
    channels,
    categories: buildCategories(channels),
  };
}

export function parseM3UInChunks(
  content: string,
  chunkSize: number,
  onChunk: (channels: readonly Channel[]) => void,
): ParseM3UResult {
  const lines = content.split(/\r?\n/);
  const allChannels: Channel[] = [];
  let pendingMeta: ExtInfMetadata | null = null;
  let index = 0;
  let chunk: Channel[] = [];

  const flushChunk = (): void => {
    if (chunk.length === 0) return;
    onChunk(chunk);
    allChannels.push(...chunk);
    chunk = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      pendingMeta = parseExtInf(line);
      continue;
    }

    if (line.startsWith('#')) continue;

    if (pendingMeta) {
      chunk.push(createChannelFromMeta(pendingMeta, line, index));
      pendingMeta = null;
      index++;

      if (chunk.length >= chunkSize) {
        flushChunk();
      }
    }
  }

  flushChunk();

  return {
    channels: allChannels,
    categories: buildCategories(allChannels),
  };
}

/**
 * Parses large M3U content without freezing the UI.
 * Walks the string line-by-line (no giant split) and yields periodically.
 */
export async function parseM3UAsync(
  content: string,
  options: ParseM3UAsyncOptions = {},
): Promise<ParseM3UResult> {
  const yieldEvery = options.yieldEveryLines ?? 2500;
  const channels: Channel[] = [];
  const categoryCounts = new Map<string, number>();
  let pendingMeta: ExtInfMetadata | null = null;
  let index = 0;
  let lineStart = 0;
  let processedLines = 0;

  while (lineStart < content.length) {
    let lineEnd = content.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = content.length;

    let line = content.slice(lineStart, lineEnd);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    line = line.trim();
    lineStart = lineEnd + 1;
    processedLines++;

    if (line) {
      if (line.startsWith('#EXTINF:')) {
        pendingMeta = parseExtInf(line);
      } else if (/^#EXTGRP:/i.test(line) && pendingMeta) {
        // Some playlists put the category on the next line.
        const grp = line.replace(/^#EXTGRP:\s*/i, '').trim();
        if (grp && !pendingMeta.attributes['group-title']) {
          pendingMeta.attributes['group-title'] = grp;
        }
      } else if (!line.startsWith('#') && pendingMeta) {
        const channel = createChannelFromMeta(pendingMeta, line, index);
        channels.push(channel);
        categoryCounts.set(channel.group, (categoryCounts.get(channel.group) ?? 0) + 1);
        pendingMeta = null;
        index++;
      }
    }

    if (processedLines % yieldEvery === 0) {
      options.onProgress?.(channels.length);
      await yieldToMain();
    }
  }

  options.onProgress?.(channels.length);

  return {
    channels,
    categories: categoriesFromCounts(categoryCounts),
  };
}
