import {
  CacheNamespace,
  type CacheEntry,
  type CacheNamespaceConfig,
  type CacheStats,
  type ICacheService,
} from '@/domain/cache/ICacheService';

const DEFAULT_CONFIGS: Record<CacheNamespace, CacheNamespaceConfig> = {
  [CacheNamespace.Memory]: { maxSizeBytes: 5 * 1024 * 1024, defaultTtlMs: 300_000, maxEntries: 500 },
  [CacheNamespace.Image]: { maxSizeBytes: 50 * 1024 * 1024, defaultTtlMs: 86_400_000, maxEntries: 2000 },
  [CacheNamespace.Logo]: { maxSizeBytes: 20 * 1024 * 1024, defaultTtlMs: 604_800_000, maxEntries: 5000 },
  [CacheNamespace.Playlist]: { maxSizeBytes: 100 * 1024 * 1024, defaultTtlMs: null, maxEntries: 20 },
  [CacheNamespace.Epg]: { maxSizeBytes: 30 * 1024 * 1024, defaultTtlMs: 3_600_000, maxEntries: 100 },
};

interface NamespaceStore {
  readonly entries: Map<string, CacheEntry<unknown>>;
  readonly config: CacheNamespaceConfig;
  hits: number;
  misses: number;
  evictions: number;
  currentSizeBytes: number;
}

function estimateSize(value: unknown): number {
  if (typeof value === 'string') return value.length * 2;
  try {
    return JSON.stringify(value).length * 2;
  } catch {
    return 256;
  }
}

/** Multi-namespace cache with TTL, LRU eviction, and async preload. */
export class CacheService implements ICacheService {
  private readonly stores = new Map<CacheNamespace, NamespaceStore>();

  constructor(configOverrides?: Partial<Record<CacheNamespace, Partial<CacheNamespaceConfig>>>) {
    for (const ns of Object.values(CacheNamespace)) {
      const base = DEFAULT_CONFIGS[ns];
      const override = configOverrides?.[ns];
      this.stores.set(ns, {
        entries: new Map(),
        config: { ...base, ...override },
        hits: 0,
        misses: 0,
        evictions: 0,
        currentSizeBytes: 0,
      });
    }
  }

  async get<T>(namespace: CacheNamespace, key: string): Promise<T | null> {
    const store = this.getStore(namespace);
    const entry = store.entries.get(key);

    if (!entry) {
      store.misses++;
      return null;
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.removeEntry(store, key);
      store.misses++;
      return null;
    }

    store.hits++;
    store.entries.set(key, { ...entry, lastAccessedAt: Date.now() });
    return entry.value as T;
  }

  async set<T>(
    namespace: CacheNamespace,
    key: string,
    value: T,
    ttlMs?: number,
  ): Promise<void> {
    const store = this.getStore(namespace);
    const size = estimateSize(value);
    const ttl = ttlMs ?? store.config.defaultTtlMs;

    if (store.entries.has(key)) {
      this.removeEntry(store, key);
    }

    this.evictIfNeeded(store, size);

    const entry: CacheEntry<T> = {
      value,
      size,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      expiresAt: ttl !== null && ttl !== undefined ? Date.now() + ttl : null,
    };

    store.entries.set(key, entry);
    store.currentSizeBytes += size;
  }

  async has(namespace: CacheNamespace, key: string): Promise<boolean> {
    return (await this.get(namespace, key)) !== null;
  }

  async delete(namespace: CacheNamespace, key: string): Promise<boolean> {
    const store = this.getStore(namespace);
    if (!store.entries.has(key)) return false;
    this.removeEntry(store, key);
    return true;
  }

  async clear(namespace: CacheNamespace): Promise<void> {
    const store = this.getStore(namespace);
    store.entries.clear();
    store.currentSizeBytes = 0;
  }

  async preload<T>(
    namespace: CacheNamespace,
    key: string,
    loader: () => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const cached = await this.get<T>(namespace, key);
    if (cached !== null) return cached;

    const value = await loader();
    await this.set(namespace, key, value, ttlMs);
    return value;
  }

  getStats(namespace?: CacheNamespace): readonly CacheStats[] {
    const namespaces = namespace ? [namespace] : (Object.values(CacheNamespace) as CacheNamespace[]);
    return namespaces.map((ns) => {
      const store = this.getStore(ns);
      const total = store.hits + store.misses;
      return {
        namespace: ns,
        entryCount: store.entries.size,
        sizeBytes: store.currentSizeBytes,
        hits: store.hits,
        misses: store.misses,
        evictions: store.evictions,
        hitRatio: total > 0 ? store.hits / total : 0,
      };
    });
  }

  evictExpired(): number {
    let count = 0;
    const now = Date.now();
    for (const store of this.stores.values()) {
      for (const [key, entry] of store.entries) {
        if (entry.expiresAt !== null && now > entry.expiresAt) {
          this.removeEntry(store, key);
          count++;
        }
      }
    }
    return count;
  }

  private getStore(namespace: CacheNamespace): NamespaceStore {
    const store = this.stores.get(namespace);
    if (!store) throw new Error(`Unknown cache namespace: ${namespace}`);
    return store;
  }

  private removeEntry(store: NamespaceStore, key: string): void {
    const entry = store.entries.get(key);
    if (entry) {
      store.currentSizeBytes -= entry.size;
      store.entries.delete(key);
    }
  }

  private evictIfNeeded(store: NamespaceStore, incomingSize: number): void {
    while (
      (store.currentSizeBytes + incomingSize > store.config.maxSizeBytes ||
        store.entries.size >= store.config.maxEntries) &&
      store.entries.size > 0
    ) {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;

      for (const [key, entry] of store.entries) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.removeEntry(store, oldestKey);
        store.evictions++;
      } else {
        break;
      }
    }
  }
}
