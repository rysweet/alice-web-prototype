/** User preferences with typed get/set, validation, persistence, and change notifications. */

export interface UserPreferences {
  theme: "dark" | "light";
  gridVisible: boolean;
  snapToGrid: boolean;
  cameraFov: number;
  autoSaveInterval: number;
}

export interface PreferenceChangeEvent {
  key: keyof UserPreferences;
  oldValue: unknown;
  newValue: unknown;
  source: "set" | "reset" | "load";
  snapshot: UserPreferences;
}

export interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PreferencesOptions {
  storage?: PreferenceStorage | null;
  storageKey?: string;
  autoLoad?: boolean;
  autoSave?: boolean;
  defaults?: Partial<UserPreferences>;
}

export const DEFAULT_PREFERENCES: Readonly<UserPreferences> = Object.freeze({
  theme: "dark",
  gridVisible: true,
  snapToGrid: false,
  cameraFov: 60,
  autoSaveInterval: 60,
});

const DEFAULT_STORAGE_KEY = "alice-web.preferences";
const KNOWN_KEYS = Object.keys(DEFAULT_PREFERENCES) as Array<keyof UserPreferences>;

type ChangeListener = (
  key: keyof UserPreferences,
  oldValue: unknown,
  newValue: unknown,
) => void;

type DetailedChangeListener = (event: PreferenceChangeEvent) => void;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getDefaultStorage(): PreferenceStorage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  return globalThis.localStorage as PreferenceStorage;
}

function createSnapshot(data: UserPreferences): UserPreferences {
  return Object.assign(Object.create(null) as UserPreferences, data);
}

function validatePreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): void {
  switch (key) {
    case "theme":
      if (value !== "dark" && value !== "light") {
        throw new Error(`Invalid theme: "${value}". Must be "dark" or "light".`);
      }
      break;
    case "gridVisible":
    case "snapToGrid":
      if (typeof value !== "boolean") {
        throw new TypeError(`"${key}" must be a boolean, got ${typeof value}`);
      }
      break;
    case "cameraFov":
    case "autoSaveInterval":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`"${key}" must be a finite number`);
      }
      break;
  }
}

function processPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): UserPreferences[K] {
  switch (key) {
    case "cameraFov":
      return clamp(value as number, 1, 179) as UserPreferences[K];
    case "autoSaveInterval":
      return clamp(value as number, 0, 3600) as UserPreferences[K];
    default:
      return value;
  }
}

function setPreferenceValue<K extends keyof UserPreferences>(
  target: UserPreferences,
  key: K,
  value: UserPreferences[K],
): void {
  target[key] = value;
}

export class Preferences {
  private readonly _defaults: UserPreferences;
  private readonly _storage: PreferenceStorage | null;
  private readonly _storageKey: string;
  private readonly _autoSave: boolean;
  private _data: UserPreferences;
  private readonly _listeners: ChangeListener[] = [];
  private readonly _eventListeners: DetailedChangeListener[] = [];

  constructor(options: PreferencesOptions = {}) {
    this._defaults = Preferences._sanitizeObject(
      options.defaults ?? {},
      createSnapshot(DEFAULT_PREFERENCES),
    );
    this._storage = options.storage ?? getDefaultStorage();
    this._storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this._autoSave = options.autoSave ?? true;
    this._data = createSnapshot(this._defaults);

    if (options.autoLoad ?? true) {
      this.load();
    }
  }

  get storageKey(): string {
    return this._storageKey;
  }

  get<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    return this._data[key];
  }

  set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
    validatePreference(key, value);
    const processed = processPreference(key, value);
    const old = this._data[key];
    if (old === processed) return;
    setPreferenceValue(this._data, key, processed);
    this._emit(key, old, processed, "set");
    this.save(false);
  }

  update(values: Partial<UserPreferences>): void {
    for (const key of KNOWN_KEYS) {
      if (key in values) {
        this.set(key, values[key] as UserPreferences[typeof key]);
      }
    }
  }

  getAll(): UserPreferences {
    return this.toJSON();
  }

  toJSON(): UserPreferences {
    return createSnapshot(this._data);
  }

  load(): UserPreferences {
    const raw = this._storage?.getItem(this._storageKey);
    if (!raw) {
      return this.getAll();
    }

    try {
      const parsed = JSON.parse(raw) as Partial<UserPreferences>;
      const sanitized = Preferences._sanitizeObject(parsed, this._defaults);
      for (const key of KNOWN_KEYS) {
        const previous = this._data[key];
        const next = sanitized[key];
        if (previous !== next) {
          setPreferenceValue(this._data, key, next);
          this._emit(key, previous, next, "load");
        }
      }
    } catch {
      this._data = createSnapshot(this._defaults);
    }

    return this.getAll();
  }

  save(force = true): void {
    if ((!force && !this._autoSave) || !this._storage) {
      return;
    }
    this._storage.setItem(this._storageKey, JSON.stringify(this.toJSON()));
  }

  hasPersistedState(): boolean {
    return this._storage?.getItem(this._storageKey) != null;
  }

  clearPersisted(): void {
    this._storage?.removeItem(this._storageKey);
  }

  static fromJSON(data: Partial<UserPreferences>, options: PreferencesOptions = {}): Preferences {
    const prefs = new Preferences({ ...options, autoLoad: false });
    prefs._data = Preferences._sanitizeObject(data, prefs._defaults);
    return prefs;
  }

  reset(key?: keyof UserPreferences): void {
    if (key !== undefined) {
      const old = this._data[key];
      const def = this._defaults[key];
      if (old === def) return;
      setPreferenceValue(this._data, key, def);
      this._emit(key, old, def, "reset");
      this.save(false);
      return;
    }

    for (const knownKey of KNOWN_KEYS) {
      this.reset(knownKey);
    }
  }

  onChange(listener: ChangeListener): () => void {
    this._listeners.push(listener);
    return () => {
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    };
  }

  subscribe(listener: DetailedChangeListener): () => void {
    this._eventListeners.push(listener);
    return () => {
      const index = this._eventListeners.indexOf(listener);
      if (index !== -1) {
        this._eventListeners.splice(index, 1);
      }
    };
  }

  private _emit<K extends keyof UserPreferences>(
    key: K,
    oldValue: UserPreferences[K],
    newValue: UserPreferences[K],
    source: PreferenceChangeEvent["source"],
  ): void {
    for (const listener of this._listeners) {
      listener(key, oldValue, newValue);
    }
    const snapshot = this.toJSON();
    for (const listener of this._eventListeners) {
      listener({ key, oldValue, newValue, source, snapshot });
    }
  }

  private static _sanitizeObject(
    data: Partial<UserPreferences>,
    defaults: UserPreferences,
  ): UserPreferences {
    const next = createSnapshot(defaults);
    for (const key of KNOWN_KEYS) {
      if (!(key in data)) continue;
      try {
        const value = data[key] as UserPreferences[typeof key];
        validatePreference(key, value);
        setPreferenceValue(next, key, processPreference(key, value));
      } catch {
        setPreferenceValue(next, key, defaults[key]);
      }
    }
    return next;
  }
}
