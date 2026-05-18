// ═══════════════════════════════════════════════════════════════════════════
// resource-manager.ts — Manage texture/model/audio resources with caching
//
// Provides: ResourceManager with lazy loading, LRU eviction, concurrent
// load deduplication, and per-type enumeration.
// Pure computation, no filesystem or network I/O.
// ═══════════════════════════════════════════════════════════════════════════

// ── Public Types ─────────────────────────────────────────────────────────

export type ResourceType = "texture" | "model" | "audio";

export interface ResourceEntry {
  key: string;
  type: ResourceType;
  data: Uint8Array | null;
  loaded: boolean;
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export interface ResourceManagerOptions {
  maxCacheSize?: number;
}

export interface ResourceManager {
  register(key: string, type: ResourceType): void;
  get(key: string): Promise<Uint8Array>;
  getIfLoaded(key: string): Uint8Array | null;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): void;
  stats(): CacheStats;
  entries(): ResourceEntry[];
  entriesByType(type: ResourceType): ResourceEntry[];
}

// ── Factory ──────────────────────────────────────────────────────────────

export function createResourceManager(
  loader: (key: string) => Promise<Uint8Array>,
  options?: ResourceManagerOptions,
): ResourceManager {
  const maxCacheSize =
    options?.maxCacheSize !== undefined
      ? Math.max(0, options.maxCacheSize)
      : 0; // 0 = unlimited

  // Registry persists across evictions
  const registry = new Map<string, ResourceType>();
  // Cache holds loaded data (subject to LRU eviction)
  const cache = new Map<string, Uint8Array>();
  // In-flight loads for deduplication
  const pending = new Map<string, Promise<Uint8Array>>();

  let hits = 0;
  let misses = 0;
  let evictions = 0;

  // LRU via Map insertion order: delete+re-set moves entry to end (most recent).
  // Oldest entries are at the start of iteration. O(1) vs O(n) array indexOf.
  function touchLru(key: string, data: Uint8Array): void {
    cache.delete(key);
    cache.set(key, data);
  }

  function evictIfNeeded(): void {
    if (maxCacheSize === 0) return;
    while (cache.size >= maxCacheSize) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
      evictions++;
    }
  }

  const mgr: ResourceManager = {
    register(key: string, type: ResourceType): void {
      if (!key) throw new Error("Resource key cannot be empty");
      if (registry.has(key))
        throw new Error(`Resource '${key}' is already registered`);
      registry.set(key, type);
    },

    async get(key: string): Promise<Uint8Array> {
      if (!registry.has(key)) {
        throw new Error(`Unknown resource '${key}'`);
      }

      const cached = cache.get(key);
      if (cached !== undefined) {
        hits++;
        touchLru(key, cached);
        return cached;
      }

      const inflight = pending.get(key);
      if (inflight) return inflight;

      misses++;
      const promise = loader(key)
        .then((data) => {
          pending.delete(key);
          evictIfNeeded();
          cache.set(key, data);
          return data;
        })
        .catch((err) => {
          pending.delete(key);
          throw err;
        });

      pending.set(key, promise);
      return promise;
    },

    getIfLoaded(key: string): Uint8Array | null {
      return cache.get(key) ?? null;
    },

    has(key: string): boolean {
      return registry.has(key);
    },

    remove(key: string): boolean {
      if (!registry.has(key)) return false;
      registry.delete(key);
      cache.delete(key);
      pending.delete(key);
      return true;
    },

    clear(): void {
      registry.clear();
      cache.clear();
      pending.clear();
      hits = 0;
      misses = 0;
      evictions = 0;
    },

    stats(): CacheStats {
      return { hits, misses, evictions, size: cache.size };
    },

    entries(): ResourceEntry[] {
      return Array.from(registry.entries()).map(([key, type]) => ({
        key,
        type,
        data: cache.get(key) ?? null,
        loaded: cache.has(key),
      }));
    },

    entriesByType(type: ResourceType): ResourceEntry[] {
      const result: ResourceEntry[] = [];
      for (const [key, rType] of registry) {
        if (rType === type) {
          result.push({ key, type: rType, data: cache.get(key) ?? null, loaded: cache.has(key) });
        }
      }
      return result;
    },
  };

  return mgr;
}
