export interface PluginSettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExtensionPointDefinition {
  id: string;
  description?: string;
  allowsMultiple?: boolean;
}

export interface ExtensionEntry<T = unknown> {
  pluginId: string;
  extensionPointId: string;
  contribution: T;
}

export interface PluginManifest {
  id: string;
  entry: string;
  displayName?: string;
  enabled?: boolean;
  defaultSettings?: Record<string, unknown>;
}

export interface PluginContext {
  manifest: PluginManifest;
  registry: ExtensionRegistry;
  settings: PluginSettingsManager;
}

export interface Plugin {
  readonly id?: string;
  init(context: PluginContext): void | Promise<void>;
  activate(context: PluginContext): void | Promise<void>;
  deactivate(context: PluginContext): void | Promise<void>;
}

export interface PluginModule {
  default?: Plugin;
  plugin?: Plugin;
}

export interface PluginDiscovery {
  discover(): readonly PluginManifest[] | Promise<readonly PluginManifest[]>;
}

export interface PluginLoader {
  load(manifest: PluginManifest): Plugin | PluginModule | Promise<Plugin | PluginModule>;
}

export interface PluginManagerOptions {
  discovery?: PluginDiscovery | readonly PluginManifest[];
  loader: PluginLoader | Record<string, Plugin | PluginModule>;
  registry?: ExtensionRegistry;
  settings?: PluginSettingsManager;
  autoActivate?: boolean;
}

export interface LoadedPluginSummary {
  id: string;
  manifest: PluginManifest;
  active: boolean;
}

const DEFAULT_STORAGE_KEY = "lookingglass.plugins.settings";
const LEGACY_STORAGE_KEY = "alice-web.plugins.settings";

function cloneValue<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneManifest(manifest: PluginManifest): PluginManifest {
  return {
    ...manifest,
    defaultSettings: manifest.defaultSettings
      ? cloneValue(manifest.defaultSettings)
      : undefined,
  };
}

function cloneSettingsRecord(settings: Record<string, unknown>): Record<string, unknown> {
  return cloneValue(settings);
}

function isPlugin(value: Plugin | PluginModule): value is Plugin {
  const candidate = value as Plugin;
  return typeof candidate.init === "function"
    && typeof candidate.activate === "function"
    && typeof candidate.deactivate === "function";
}

function isPluginDiscovery(value: PluginDiscovery | readonly PluginManifest[]): value is PluginDiscovery {
  return typeof value === "object" && value !== null && "discover" in value;
}

function isPluginLoader(value: PluginLoader | Record<string, Plugin | PluginModule>): value is PluginLoader {
  return typeof value === "object" && value !== null && "load" in value;
}

function migrateLegacyStorage(storage: PluginSettingsStorage | null, storageKey: string): void {
  if (!storage || storageKey !== DEFAULT_STORAGE_KEY || storage.getItem(storageKey) !== null) {
    return;
  }
  const legacyValue = storage.getItem(LEGACY_STORAGE_KEY);
  if (legacyValue !== null) {
    storage.setItem(storageKey, legacyValue);
  }
}

function normalizePlugin(loaded: Plugin | PluginModule, manifest: PluginManifest): Plugin {
  const plugin = isPlugin(loaded) ? loaded : loaded.plugin ?? loaded.default;
  if (!plugin) {
    throw new Error(`Plugin loader did not return a plugin for "${manifest.id}".`);
  }
  if (plugin.id && plugin.id !== manifest.id) {
    throw new Error(
      `Plugin id mismatch for entry "${manifest.entry}": expected "${manifest.id}" but received "${plugin.id}".`,
    );
  }
  return plugin;
}

export class ExtensionRegistry {
  private readonly _definitions = new Map<string, ExtensionPointDefinition>();
  private readonly _extensions = new Map<string, ExtensionEntry[]>();

  registerExtensionPoint(
    definition: ExtensionPointDefinition | string,
    options: Omit<ExtensionPointDefinition, "id"> = {},
  ): ExtensionPointDefinition {
    const normalized = typeof definition === "string"
      ? { id: definition, ...options }
      : { ...definition };
    const existing = this._definitions.get(normalized.id);
    if (existing) {
      return { ...existing };
    }
    this._definitions.set(normalized.id, normalized);
    this._extensions.set(normalized.id, []);
    return { ...normalized };
  }

  hasExtensionPoint(id: string): boolean {
    return this._definitions.has(id);
  }

  listExtensionPoints(): ExtensionPointDefinition[] {
    return Array.from(this._definitions.values(), (definition) => ({ ...definition }));
  }

  contribute<T>(extensionPointId: string, pluginId: string, contribution: T): ExtensionEntry<T> {
    const definition = this._definitions.get(extensionPointId);
    if (!definition) {
      throw new Error(`Unknown extension point: ${extensionPointId}`);
    }
    const entries = this._extensions.get(extensionPointId) ?? [];
    if (!definition.allowsMultiple && entries.length > 0) {
      throw new Error(`Extension point "${extensionPointId}" only accepts one contribution.`);
    }
    const entry: ExtensionEntry<T> = {
      pluginId,
      extensionPointId,
      contribution: cloneValue(contribution),
    };
    entries.push(entry as ExtensionEntry);
    this._extensions.set(extensionPointId, entries);
    return { ...entry, contribution: cloneValue(entry.contribution) };
  }

  getExtensions<T>(extensionPointId: string): ExtensionEntry<T>[] {
    return (this._extensions.get(extensionPointId) ?? []).map((entry) => ({
      pluginId: entry.pluginId,
      extensionPointId: entry.extensionPointId,
      contribution: cloneValue(entry.contribution) as T,
    }));
  }

  removePlugin(pluginId: string): void {
    for (const [extensionPointId, entries] of this._extensions.entries()) {
      this._extensions.set(
        extensionPointId,
        entries.filter((entry) => entry.pluginId !== pluginId),
      );
    }
  }

  clear(): void {
    for (const extensionPointId of this._extensions.keys()) {
      this._extensions.set(extensionPointId, []);
    }
  }
}

export class PluginSettingsManager {
  private readonly _storage: PluginSettingsStorage | null;
  private readonly _storageKey: string;
  private readonly _defaults = new Map<string, Record<string, unknown>>();
  private readonly _values = new Map<string, Record<string, unknown>>();

  constructor(options: { storage?: PluginSettingsStorage | null; storageKey?: string } = {}) {
    this._storage = options.storage ?? null;
    this._storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    migrateLegacyStorage(this._storage, this._storageKey);
    this._hydrate();
  }

  registerDefaults(pluginId: string, defaults: Record<string, unknown> = {}): Record<string, unknown> {
    const clonedDefaults = cloneSettingsRecord(defaults);
    this._defaults.set(pluginId, clonedDefaults);
    const merged = { ...clonedDefaults, ...this._values.get(pluginId) };
    this._values.set(pluginId, merged);
    this._persist();
    return cloneSettingsRecord(merged);
  }

  getAll(pluginId: string): Record<string, unknown> {
    return cloneSettingsRecord(this._ensure(pluginId));
  }

  get<T>(pluginId: string, key: string, fallback?: T): T | undefined {
    const values = this._ensure(pluginId);
    return (key in values ? values[key] : fallback) as T | undefined;
  }

  set(pluginId: string, key: string, value: unknown): void {
    const values = this._ensure(pluginId);
    values[key] = cloneValue(value);
    this._values.set(pluginId, values);
    this._persist();
  }

  update(pluginId: string, values: Record<string, unknown>): void {
    const next = { ...this._ensure(pluginId), ...cloneSettingsRecord(values) };
    this._values.set(pluginId, next);
    this._persist();
  }

  reset(pluginId: string): void {
    const defaults = this._defaults.get(pluginId) ?? {};
    this._values.set(pluginId, cloneSettingsRecord(defaults));
    this._persist();
  }

  clear(pluginId: string): void {
    this._defaults.delete(pluginId);
    this._values.delete(pluginId);
    this._persist();
  }

  private _ensure(pluginId: string): Record<string, unknown> {
    if (!this._values.has(pluginId)) {
      const defaults = this._defaults.get(pluginId) ?? {};
      this._values.set(pluginId, cloneSettingsRecord(defaults));
    }
    return this._values.get(pluginId)!;
  }

  private _hydrate(): void {
    const raw = this._storage?.getItem(this._storageKey);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      for (const [pluginId, values] of Object.entries(parsed)) {
        if (values && typeof values === "object") {
          this._values.set(pluginId, cloneSettingsRecord(values));
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[PluginSettings] corrupt plugin settings removed (${this._storageKey}): ${msg}`);
      this._storage?.removeItem(this._storageKey);
    }
  }

  private _persist(): void {
    if (!this._storage) {
      return;
    }
    const snapshot = Object.fromEntries(
      Array.from(this._values.entries(), ([pluginId, values]) => [pluginId, cloneSettingsRecord(values)]),
    );
    this._storage.setItem(this._storageKey, JSON.stringify(snapshot));
  }
}

export class StaticPluginDiscovery implements PluginDiscovery {
  private readonly _manifests: readonly PluginManifest[];

  constructor(manifests: readonly PluginManifest[]) {
    this._manifests = manifests.map(cloneManifest);
  }

  discover(): readonly PluginManifest[] {
    return this._manifests.map(cloneManifest);
  }
}

export class MapPluginLoader implements PluginLoader {
  private readonly _plugins = new Map<string, Plugin | PluginModule>();

  constructor(entries: Record<string, Plugin | PluginModule> | Iterable<[string, Plugin | PluginModule]>) {
    for (const [key, plugin] of entries instanceof Map ? entries.entries() : Object.entries(entries)) {
      this._plugins.set(key, plugin);
    }
  }

  load(manifest: PluginManifest): Plugin | PluginModule {
    const plugin = this._plugins.get(manifest.entry) ?? this._plugins.get(manifest.id);
    if (!plugin) {
      throw new Error(`No plugin registered for entry "${manifest.entry}".`);
    }
    return plugin;
  }
}

interface LoadedPluginRecord {
  manifest: PluginManifest;
  plugin: Plugin;
  context: PluginContext;
  active: boolean;
}

export class PluginManager {
  readonly registry: ExtensionRegistry;
  readonly settings: PluginSettingsManager;
  private readonly _discovery: PluginDiscovery;
  private readonly _loader: PluginLoader;
  private readonly _autoActivate: boolean;
  private readonly _loaded = new Map<string, LoadedPluginRecord>();
  private _discovered: PluginManifest[] | null = null;

  constructor(options: PluginManagerOptions) {
    this.registry = options.registry ?? new ExtensionRegistry();
    this.settings = options.settings ?? new PluginSettingsManager();
    this._discovery = options.discovery == null
      ? new StaticPluginDiscovery([])
      : isPluginDiscovery(options.discovery)
        ? options.discovery
        : new StaticPluginDiscovery(options.discovery);
    this._loader = isPluginLoader(options.loader)
      ? options.loader
      : new MapPluginLoader(options.loader);
    this._autoActivate = options.autoActivate ?? true;
  }

  async discoverPlugins(): Promise<PluginManifest[]> {
    const manifests = (await this._discovery.discover()).map(cloneManifest);
    const seen = new Set<string>();
    for (const manifest of manifests) {
      if (seen.has(manifest.id)) {
        throw new Error(`Duplicate plugin id discovered: ${manifest.id}`);
      }
      seen.add(manifest.id);
    }
    this._discovered = manifests;
    return manifests.map(cloneManifest);
  }

  async loadDiscoveredPlugins(): Promise<LoadedPluginSummary[]> {
    const manifests = this._discovered ?? await this.discoverPlugins();
    for (const manifest of manifests) {
      await this.loadPlugin(manifest);
    }
    return this.listLoadedPlugins();
  }

  async loadPlugin(manifest: PluginManifest): Promise<LoadedPluginSummary> {
    const existing = this._loaded.get(manifest.id);
    if (existing) {
      return this._toSummary(existing);
    }
    const clonedManifest = cloneManifest(manifest);
    const plugin = normalizePlugin(await this._loader.load(clonedManifest), clonedManifest);
    this.settings.registerDefaults(clonedManifest.id, clonedManifest.defaultSettings ?? {});
    const context: PluginContext = {
      manifest: cloneManifest(clonedManifest),
      registry: this.registry,
      settings: this.settings,
    };
    const record: LoadedPluginRecord = {
      manifest: clonedManifest,
      plugin,
      context,
      active: false,
    };
    await plugin.init(context);
    this._loaded.set(clonedManifest.id, record);
    if (this._autoActivate && clonedManifest.enabled !== false) {
      await this.activatePlugin(clonedManifest.id);
    }
    return this._toSummary(record);
  }

  async activatePlugin(pluginId: string): Promise<void> {
    const record = this._loaded.get(pluginId);
    if (!record) {
      throw new Error(`Plugin not loaded: ${pluginId}`);
    }
    if (record.active) {
      return;
    }
    await record.plugin.activate(record.context);
    record.active = true;
  }

  async deactivatePlugin(pluginId: string): Promise<void> {
    const record = this._loaded.get(pluginId);
    if (!record) {
      throw new Error(`Plugin not loaded: ${pluginId}`);
    }
    if (!record.active) {
      this.registry.removePlugin(pluginId);
      return;
    }
    await record.plugin.deactivate(record.context);
    record.active = false;
    this.registry.removePlugin(pluginId);
  }

  async unloadPlugin(pluginId: string): Promise<void> {
    if (!this._loaded.has(pluginId)) {
      return;
    }
    await this.deactivatePlugin(pluginId);
    this._loaded.delete(pluginId);
  }

  listLoadedPlugins(): LoadedPluginSummary[] {
    return Array.from(this._loaded.values(), (record) => this._toSummary(record));
  }

  getLoadedPlugin(pluginId: string): LoadedPluginSummary | null {
    const record = this._loaded.get(pluginId);
    return record ? this._toSummary(record) : null;
  }

  private _toSummary(record: LoadedPluginRecord): LoadedPluginSummary {
    return {
      id: record.manifest.id,
      manifest: cloneManifest(record.manifest),
      active: record.active,
    };
  }
}
