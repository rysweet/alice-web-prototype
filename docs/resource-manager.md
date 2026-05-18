# Resource Manager

The resource manager (`src/resource-manager.ts`) provides categorized resource
management for texture, model, and audio assets with lazy loading, LRU caching,
and cache statistics. It is a standalone module with zero project imports — the
loading strategy is injected via a user-provided loader function.

## Overview

| Export | Kind | Purpose |
|--------|------|---------|
| `createResourceManager` | function | Factory — creates a `ResourceManager` with an injected loader |
| `ResourceManager` | interface | Register, load, cache, query, and evict resources |
| `ResourceEntry` | interface | Snapshot of a registered resource (key, type, data, loaded status) |
| `CacheStats` | interface | Cache hit/miss/eviction/size counters |
| `ResourceType` | type | `"texture" \| "model" \| "audio"` |
| `ResourceManagerOptions` | interface | Configuration (max cache size) |

The module has no filesystem or network dependency. It works identically in
browser and Node.js environments.

## Quick Start

```typescript
import { createResourceManager } from "./resource-manager.js";

// Provide a loader function — called on first access for each resource
const manager = createResourceManager(async (key) => {
  const response = await fetch(`/assets/${key}`);
  return new Uint8Array(await response.arrayBuffer());
});

// Register resources by key and category
manager.register("models/Bunny.dae", "model");
manager.register("textures/skin.png", "texture");
manager.register("audio/hop.wav", "audio");

// First get() triggers the loader (cache miss)
const bunnyData = await manager.get("models/Bunny.dae");
console.log(bunnyData.byteLength);  // e.g. 45231

// Second get() returns cached data (cache hit)
const bunnyAgain = await manager.get("models/Bunny.dae");

// Check stats
const stats = manager.stats();
console.log(stats.hits);       // 1
console.log(stats.misses);     // 1
console.log(stats.evictions);  // 0
console.log(stats.size);       // 1 loaded entry
```

### With LRU Eviction

```typescript
const manager = createResourceManager(loader, { maxCacheSize: 2 });

manager.register("a.png", "texture");
manager.register("b.png", "texture");
manager.register("c.png", "texture");

await manager.get("a.png");  // loads a (size: 1)
await manager.get("b.png");  // loads b (size: 2, cache full)
await manager.get("c.png");  // loads c, evicts a (LRU) (size: 2)

manager.getIfLoaded("a.png");  // null — evicted
manager.getIfLoaded("b.png");  // Uint8Array — still cached
manager.getIfLoaded("c.png");  // Uint8Array — still cached

console.log(manager.stats().evictions);  // 1
```

### With AliceProjectArchive Resources

```typescript
import { readProject } from "./project-io.js";
import { createResourceManager } from "./resource-manager.js";

const archive = await readProject(a3pBuffer);

// Use the archive's resource map as the loader
const manager = createResourceManager(async (key) => {
  const data = archive.resources.get(key);
  if (!data) throw new Error(`Resource not found in archive: ${key}`);
  return data;
});

// Register all resources from the archive
for (const [path, _data] of archive.resources) {
  if (path.startsWith("resources/models/"))   manager.register(path, "model");
  else if (path.startsWith("resources/textures/")) manager.register(path, "texture");
  else if (path.startsWith("resources/audio/"))    manager.register(path, "audio");
}

// Query by category
const textures = manager.entriesByType("texture");
console.log(`${textures.length} textures registered`);
```

## API Reference

### `createResourceManager(loader, options?): ResourceManager`

Factory function. Creates a resource manager with the given loader function and
optional cache configuration.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `loader` | `(key: string) => Promise<Uint8Array>` | Called on first `get()` for each resource key. Must return the resource bytes. |
| `options` | `ResourceManagerOptions` | Optional configuration. |

**Returns:** A `ResourceManager` instance.

```typescript
interface ResourceManagerOptions {
  /** Max loaded entries before LRU eviction. 0 = unlimited. Default: 0. */
  maxCacheSize?: number;
}
```

If `maxCacheSize` is negative, it is clamped to `0` (unlimited).

### `ResourceManager`

```typescript
interface ResourceManager {
  register(key: string, type: ResourceType): void;
  get(key: string): Promise<Uint8Array>;
  getIfLoaded(key: string): Uint8Array | null;
  has(key: string): boolean;
  remove(key: string): boolean;
  clear(): void;
  stats(): CacheStats;
  entries(): readonly ResourceEntry[];
  entriesByType(type: ResourceType): readonly ResourceEntry[];
}
```

#### `register(key: string, type: ResourceType): void`

Register a resource key with a category. The resource is not loaded until
`get()` is called.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | Key is an empty string |
| `Error` | Key is already registered |

```typescript
manager.register("models/Bunny.dae", "model");
manager.register("textures/skin.png", "texture");
```

#### `get(key: string): Promise<Uint8Array>`

Get resource data. On first access (cache miss), calls the loader function,
stores the result, and increments the miss counter. On subsequent accesses
(cache hit), returns cached data and increments the hit counter.

If `maxCacheSize > 0` and the cache is full, the least-recently-accessed loaded
entry is evicted (data set to `null`, loaded set to `false`, eviction counter
incremented) before the new entry is loaded.

**Concurrency:** Concurrent `get()` calls for the same key share one loader
Promise (deduplication). The loader is called exactly once per key per load
cycle.

**Throws (rejects):**

| Error | Condition |
|-------|-----------|
| `Error` | Key is not registered |
| `Error` | Loader function throws or rejects |

On loader rejection, the pending Promise is cleared so subsequent `get()` calls
retry the loader.

```typescript
const data = await manager.get("models/Bunny.dae");
```

#### `getIfLoaded(key: string): Uint8Array | null`

Synchronous access. Returns cached data if the resource has been loaded, or
`null` if it hasn't been loaded yet (or was evicted).

Does **not** trigger the loader. Does **not** affect cache statistics.

```typescript
const data = manager.getIfLoaded("models/Bunny.dae");
if (data) {
  console.log(`Cached: ${data.byteLength} bytes`);
}
```

#### `has(key: string): boolean`

Check if a key is registered (loaded or not).

```typescript
manager.has("models/Bunny.dae");  // true
manager.has("models/Cat.dae");    // false
```

#### `remove(key: string): boolean`

Remove a resource entry entirely (registration + cached data). Returns `true`
if the entry existed, `false` otherwise.

```typescript
manager.remove("models/Bunny.dae");  // true
manager.remove("models/Bunny.dae");  // false (already removed)
```

#### `clear(): void`

Remove all entries and reset all statistics to zero.

```typescript
manager.clear();
console.log(manager.stats().size);  // 0
```

#### `stats(): CacheStats`

Return current cache statistics.

```typescript
interface CacheStats {
  readonly hits: number;       // get() calls served from cache
  readonly misses: number;     // get() calls that triggered the loader
  readonly evictions: number;  // entries evicted by LRU policy
  readonly size: number;       // count of currently loaded entries
}
```

```typescript
const s = manager.stats();
console.log(`Hit rate: ${s.hits / (s.hits + s.misses) * 100}%`);
```

#### `entries(): readonly ResourceEntry[]`

Return a snapshot of all registered entries.

```typescript
interface ResourceEntry {
  readonly key: string;
  readonly type: ResourceType;
  readonly data: Uint8Array | null;  // null if not yet loaded or evicted
  readonly loaded: boolean;
}
```

```typescript
for (const entry of manager.entries()) {
  console.log(`${entry.key} [${entry.type}] loaded=${entry.loaded}`);
}
```

#### `entriesByType(type: ResourceType): readonly ResourceEntry[]`

Return a filtered snapshot of entries matching the given type.

```typescript
const models = manager.entriesByType("model");
console.log(`${models.length} models registered`);
```

### `ResourceType`

```typescript
type ResourceType = "texture" | "model" | "audio";
```

The caller assigns categories at `register()` time. The resource manager does
not infer categories from file paths or extensions.

## LRU Eviction

When `maxCacheSize` is set to a positive number, the resource manager tracks
access order. When a `get()` call would load a new entry that exceeds the
capacity, the least-recently-accessed loaded entry is evicted:

1. Its `data` is set to `null`
2. Its `loaded` flag is set to `false`
3. The `evictions` counter is incremented
4. The entry remains registered — a subsequent `get()` will re-load it

"Access" means any `get()` call, whether it was a hit or a miss. `getIfLoaded()`
does not update access order.

### LRU Example

```typescript
const mgr = createResourceManager(loader, { maxCacheSize: 3 });

mgr.register("a", "texture");
mgr.register("b", "texture");
mgr.register("c", "texture");
mgr.register("d", "texture");

await mgr.get("a");  // [a]
await mgr.get("b");  // [a, b]
await mgr.get("c");  // [a, b, c] — cache full
await mgr.get("a");  // [b, c, a] — a moves to most-recent
await mgr.get("d");  // evicts b (LRU) → [c, a, d]

mgr.getIfLoaded("b");  // null — evicted
mgr.getIfLoaded("a");  // Uint8Array — still cached
mgr.stats().evictions;  // 1
```

## Concurrent Load Deduplication

If multiple `get()` calls for the same key arrive before the loader resolves,
only one loader invocation occurs. All callers receive the same Promise:

```typescript
const [r1, r2, r3] = await Promise.all([
  manager.get("big-model.dae"),
  manager.get("big-model.dae"),
  manager.get("big-model.dae"),
]);

// loader was called exactly once
// r1, r2, r3 are the same Uint8Array
console.log(manager.stats().misses);  // 1
```

If the loader rejects, the pending Promise is cleared. A subsequent `get()`
retries the loader:

```typescript
let attempt = 0;
const flakyMgr = createResourceManager(async (key) => {
  attempt++;
  if (attempt === 1) throw new Error("network error");
  return new Uint8Array([1, 2, 3]);
});

flakyMgr.register("flaky.png", "texture");

await flakyMgr.get("flaky.png").catch(() => {});  // first attempt fails
const data = await flakyMgr.get("flaky.png");     // second attempt succeeds
```

## Error Handling

| Scenario | Error |
|----------|-------|
| `register()` with empty key `""` | `Error("Resource key must not be empty")` |
| `register()` with duplicate key | `Error("Resource already registered: {key}")` |
| `get()` with unregistered key | Rejects with `Error("Unknown resource: {key}")` |
| Loader function throws/rejects | Rejection propagated to caller; pending Promise cleared for retry |

## Security

| Concern | Mitigation |
|---------|------------|
| Loader never resolves (memory leak) | Caller responsibility — documented |
| Loader returns very large `Uint8Array` | Not limited at module level; `maxCacheSize` limits entry count, not byte size |
| Buffer mutation via `getIfLoaded()` | Acceptable — standard cache semantics; defensive copy would be too expensive for 3D assets |
| No eval, no dynamic code execution | Pure data management only |
| No filesystem or network access | Loader injection — module has no `fs`/`http`/`fetch` imports |

## Module Exports

```typescript
// Factory
import { createResourceManager } from "./resource-manager.js";

// Types
import type {
  ResourceManager,
  ResourceEntry,
  CacheStats,
  ResourceType,
  ResourceManagerOptions,
} from "./resource-manager.js";
```

## Architecture

```
src/
  resource-manager.ts       — Resource manager (NEW)
test/
  resource-manager.test.ts  — ~12 tests covering register, get, cache,
                              eviction, concurrency, errors, stats
```

The resource manager has **zero imports** from other project modules and **zero
external dependencies**. The loader function is injected by the caller, making
the module fully testable with mock loaders.

## Limitations

- **No byte-size limit.** `maxCacheSize` limits the *count* of loaded entries,
  not the total byte size. A single large resource could consume significant
  memory. Byte-size budgets are an out-of-scope enhancement.
- **No persistence.** The cache is in-memory only. Clearing or recreating the
  manager resets all state.
- **No prefetching.** Resources are loaded on demand via `get()`. There is no
  `prefetch()` or `loadAll()` method.
- **No content validation.** The manager stores whatever bytes the loader
  returns. It does not validate that textures are valid images, models are valid
  meshes, etc.
- **`getIfLoaded()` returns a mutable reference.** The caller could mutate the
  cached `Uint8Array`. This is by design — defensive copies would be prohibitively
  expensive for 3D assets.
