export type AssetType = "model" | "texture" | "audio";

export interface AssetManifestEntry<K extends string = string, T extends AssetType = AssetType> {
  readonly key: K;
  readonly type: T;
  readonly uri: string;
  readonly bytes?: Uint8Array;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface ProgressSnapshot {
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly percent: number;
  readonly currentKey: string | null;
  readonly lastError: string | null;
}

export interface TextureMipLevel {
  readonly level: number;
  readonly width: number;
  readonly height: number;
}

export interface TextureResource {
  readonly key: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly mipmaps: readonly TextureMipLevel[];
  readonly bytes: Uint8Array;
}

export interface AudioResource {
  readonly key: string;
  readonly format: string;
  readonly durationMs: number;
  readonly bytes: Uint8Array;
}

export interface LoadedModelResource<T> {
  readonly key: string;
  readonly payload: T;
  readonly bytes: Uint8Array;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export type AssetSourceLoader<K extends string = string> = (
  entry: AssetManifestEntry<K>,
) => Promise<Uint8Array> | Uint8Array;

export class ResourceCache<K, V> {
  readonly #maxEntries: number;
  readonly #items = new Map<K, V>();

  constructor(maxEntries = Number.POSITIVE_INFINITY) {
    this.#maxEntries = Number.isFinite(maxEntries) && maxEntries > 0 ? maxEntries : Number.POSITIVE_INFINITY;
  }

  get size(): number {
    return this.#items.size;
  }

  has(key: K): boolean {
    return this.#items.has(key);
  }

  get(key: K): V | undefined {
    const value = this.#items.get(key);
    if (value !== undefined) {
      this.#items.delete(key);
      this.#items.set(key, value);
    }
    return value;
  }

  set(key: K, value: V): void {
    if (this.#items.has(key)) {
      this.#items.delete(key);
    }
    this.#items.set(key, value);
    while (this.#items.size > this.#maxEntries) {
      const oldest = this.#items.keys().next().value as K | undefined;
      if (oldest === undefined) {
        break;
      }
      this.#items.delete(oldest);
    }
  }

  delete(key: K): boolean {
    return this.#items.delete(key);
  }

  keys(): K[] {
    return Array.from(this.#items.keys());
  }
}

export class AssetManifest<K extends string = string> {
  readonly #entries = new Map<K, AssetManifestEntry<K>>();

  constructor(entries: readonly AssetManifestEntry<K>[] = []) {
    for (const entry of entries) {
      this.#entries.set(entry.key, entry);
    }
  }

  get(key: K): AssetManifestEntry<K> | undefined {
    return this.#entries.get(key);
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  entries(type?: AssetType): AssetManifestEntry<K>[] {
    return Array.from(this.#entries.values()).filter((entry) => !type || entry.type === type);
  }

  keys(type?: AssetType): K[] {
    return this.entries(type).map((entry) => entry.key);
  }
}

export class ProgressTracker {
  readonly #listeners = new Set<(snapshot: ProgressSnapshot) => void>();
  #snapshot: ProgressSnapshot = {
    total: 0,
    completed: 0,
    failed: 0,
    percent: 0,
    currentKey: null,
    lastError: null,
  };

  subscribe(listener: (snapshot: ProgressSnapshot) => void): () => void {
    this.#listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.#listeners.delete(listener);
    };
  }

  start(total: number): void {
    this.#snapshot = {
      total,
      completed: 0,
      failed: 0,
      percent: 0,
      currentKey: null,
      lastError: null,
    };
    this.#emit();
  }

  begin(key: string): void {
    this.#snapshot = {
      ...this.#snapshot,
      currentKey: key,
    };
    this.#emit();
  }

  complete(key: string): void {
    const completed = this.#snapshot.completed + 1;
    this.#snapshot = {
      ...this.#snapshot,
      completed,
      currentKey: key,
      percent: this.#percent(completed, this.#snapshot.failed),
    };
    this.#emit();
  }

  fail(key: string, error: unknown): void {
    const failed = this.#snapshot.failed + 1;
    this.#snapshot = {
      ...this.#snapshot,
      failed,
      currentKey: key,
      lastError: error instanceof Error ? error.message : String(error),
      percent: this.#percent(this.#snapshot.completed, failed),
    };
    this.#emit();
  }

  snapshot(): ProgressSnapshot {
    return { ...this.#snapshot };
  }

  #percent(completed: number, failed: number): number {
    if (this.#snapshot.total === 0) {
      return 0;
    }
    return ((completed + failed) / this.#snapshot.total) * 100;
  }

  #emit(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) {
      listener(snapshot);
    }
  }
}

function defaultSourceLoader<K extends string>(entry: AssetManifestEntry<K>): Uint8Array {
  return entry.bytes ?? new Uint8Array();
}

function extensionOf(uri: string): string {
  const lastDot = uri.lastIndexOf(".");
  return lastDot >= 0 ? uri.slice(lastDot + 1).toLowerCase() : "";
}

export function detectTextureFormat(uri: string, bytes: Uint8Array): string {
  if (bytes.length >= 4
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47) {
    return "image/png";
  }
  if (extensionOf(uri) === "jpg" || extensionOf(uri) === "jpeg") {
    return "image/jpeg";
  }
  return "application/octet-stream";
}

export function detectAudioFormat(uri: string, bytes: Uint8Array): string {
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) == "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) == "WAVE") {
    return "audio/wav";
  }
  if (extensionOf(uri) === "mp3") {
    return "audio/mpeg";
  }
  return "application/octet-stream";
}

function generateMipmaps(width: number, height: number): TextureMipLevel[] {
  const mipmaps: TextureMipLevel[] = [];
  let level = 0;
  let nextWidth = Math.max(1, Math.floor(width));
  let nextHeight = Math.max(1, Math.floor(height));
  while (true) {
    mipmaps.push({ level, width: nextWidth, height: nextHeight });
    if (nextWidth === 1 && nextHeight === 1) {
      return mipmaps;
    }
    nextWidth = Math.max(1, Math.floor(nextWidth / 2));
    nextHeight = Math.max(1, Math.floor(nextHeight / 2));
    level += 1;
  }
}

export class TextureLoader<K extends string = string> {
  constructor(
    private readonly sourceLoader: AssetSourceLoader<K> = defaultSourceLoader,
    private readonly cache = new ResourceCache<string, TextureResource>(),
  ) {}

  async load(entry: AssetManifestEntry<K, "texture">, options: { generateMipmaps?: boolean } = {}): Promise<TextureResource> {
    const cached = this.cache.get(entry.key);
    if (cached) {
      return cached;
    }
    const bytes = entry.bytes ?? await Promise.resolve(this.sourceLoader(entry));
    const resource: TextureResource = {
      key: entry.key,
      format: detectTextureFormat(entry.uri, bytes),
      width: entry.width ?? 1,
      height: entry.height ?? 1,
      mipmaps: options.generateMipmaps === false ? [{ level: 0, width: entry.width ?? 1, height: entry.height ?? 1 }] : generateMipmaps(entry.width ?? 1, entry.height ?? 1),
      bytes,
    };
    this.cache.set(entry.key, resource);
    return resource;
  }
}

export class AudioLoader<K extends string = string> {
  constructor(
    private readonly sourceLoader: AssetSourceLoader<K> = defaultSourceLoader,
    private readonly cache = new ResourceCache<string, AudioResource>(),
  ) {}

  async load(entry: AssetManifestEntry<K, "audio">): Promise<AudioResource> {
    const cached = this.cache.get(entry.key);
    if (cached) {
      return cached;
    }
    const bytes = entry.bytes ?? await Promise.resolve(this.sourceLoader(entry));
    const resource: AudioResource = {
      key: entry.key,
      format: detectAudioFormat(entry.uri, bytes),
      durationMs: entry.durationMs ?? bytes.length,
      bytes,
    };
    this.cache.set(entry.key, resource);
    return resource;
  }
}

export class ModelResourceLoader<K extends string, T> {
  readonly #pending = new Map<K, Promise<LoadedModelResource<T>>>();

  constructor(
    private readonly manifest: AssetManifest<K>,
    private readonly sourceLoader: AssetSourceLoader<K>,
    private readonly decoder: (entry: AssetManifestEntry<K, "model">, bytes: Uint8Array) => T,
    private readonly cache = new ResourceCache<K, LoadedModelResource<T>>(),
  ) {}

  availableKeys(): K[] {
    return this.manifest.keys("model");
  }

  async load(key: K): Promise<LoadedModelResource<T>> {
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }
    const inflight = this.#pending.get(key);
    if (inflight) {
      return inflight;
    }
    const entry = this.manifest.get(key);
    if (!entry || entry.type !== "model") {
      throw new Error(`Unknown model resource '${key}'`);
    }
    const modelEntry = entry as AssetManifestEntry<K, "model">;
    const pending = Promise.resolve(this.sourceLoader(modelEntry)).then((bytes) => {
      const resource: LoadedModelResource<T> = {
        key,
        payload: this.decoder(modelEntry, bytes),
        bytes,
        metadata: modelEntry.metadata ?? {},
      };
      this.cache.set(key, resource);
      this.#pending.delete(key);
      return resource;
    }).catch((error) => {
      this.#pending.delete(key);
      throw error;
    });
    this.#pending.set(key, pending);
    return pending;
  }

  async loadMany(keys: readonly K[], tracker?: ProgressTracker): Promise<LoadedModelResource<T>[]> {
    tracker?.start(keys.length);
    const resources: LoadedModelResource<T>[] = [];
    for (const key of keys) {
      tracker?.begin(key);
      try {
        const resource = await this.load(key);
        resources.push(resource);
        tracker?.complete(key);
      } catch (error) {
        tracker?.fail(key, error);
        throw error;
      }
    }
    return resources;
  }
}
