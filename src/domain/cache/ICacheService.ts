export const CacheNamespace = {
  Memory: 'memory',
  Image: 'image',
  Logo: 'logo',
  Playlist: 'playlist',
  Epg: 'epg',
} as const;

export type CacheNamespace = (typeof CacheNamespace)[keyof typeof CacheNamespace];

export interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number | null;
  readonly size: number;
  readonly createdAt: number;
  readonly lastAccessedAt: number;
}

export interface CacheNamespaceConfig {
  readonly maxSizeBytes: number;
  readonly defaultTtlMs: number | null;
  readonly maxEntries: number;
}

export interface CacheStats {
  readonly namespace: CacheNamespace;
  readonly entryCount: number;
  readonly sizeBytes: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly hitRatio: number;
}

export interface ICacheService {
  get<T>(namespace: CacheNamespace, key: string): Promise<T | null>;
  set<T>(namespace: CacheNamespace, key: string, value: T, ttlMs?: number): Promise<void>;
  has(namespace: CacheNamespace, key: string): Promise<boolean>;
  delete(namespace: CacheNamespace, key: string): Promise<boolean>;
  clear(namespace: CacheNamespace): Promise<void>;
  preload<T>(
    namespace: CacheNamespace,
    key: string,
    loader: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T>;
  getStats(namespace?: CacheNamespace): readonly CacheStats[];
  evictExpired(): number;
}
