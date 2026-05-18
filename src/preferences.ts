/** User preferences with typed get/set, validation, clamping, and JSON serialization. */

export interface UserPreferences {
  theme: "dark" | "light";
  gridVisible: boolean;
  snapToGrid: boolean;
  cameraFov: number;
  autoSaveInterval: number;
}

export const DEFAULT_PREFERENCES: Readonly<UserPreferences> = Object.freeze({
  theme: "dark",
  gridVisible: true,
  snapToGrid: false,
  cameraFov: 60,
  autoSaveInterval: 60,
});

type ChangeListener = (
  key: keyof UserPreferences,
  oldValue: unknown,
  newValue: unknown,
) => void;

const KNOWN_KEYS = new Set<string>(Object.keys(DEFAULT_PREFERENCES));

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Preferences {
  private _data: UserPreferences;
  private _listeners: ChangeListener[] = [];

  constructor() {
    this._data = { ...DEFAULT_PREFERENCES };
  }

  get<K extends keyof UserPreferences>(key: K): UserPreferences[K] {
    return this._data[key];
  }

  set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]): void {
    this._validate(key, value);
    const processed = this._process(key, value);
    const old = this._data[key];
    if (old === processed) return;
    (this._data as unknown as Record<string, unknown>)[key] = processed;
    for (const listener of this._listeners) {
      listener(key, old, processed);
    }
  }

  getAll(): UserPreferences {
    return this.toJSON();
  }

  toJSON(): UserPreferences {
    return { ...this._data };
  }

  static fromJSON(data: UserPreferences): Preferences {
    const prefs = new Preferences();
    for (const key of KNOWN_KEYS) {
      const k = key as keyof UserPreferences;
      if (k in data) {
        try {
          prefs.set(k, (data as unknown as Record<string, unknown>)[k] as never);
        } catch {
          // invalid value — keep default
        }
      }
    }
    return prefs;
  }

  reset(key?: keyof UserPreferences): void {
    if (key !== undefined) {
      const old = this._data[key];
      const def = DEFAULT_PREFERENCES[key];
      if (old === def) return;
      (this._data as unknown as Record<string, unknown>)[key] = def;
      for (const listener of this._listeners) {
        listener(key, old, def);
      }
    } else {
      for (const k of Object.keys(DEFAULT_PREFERENCES) as Array<keyof UserPreferences>) {
        this.reset(k);
      }
    }
  }

  onChange(listener: ChangeListener): void {
    this._listeners.push(listener);
  }

  private _validate<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ): void {
    switch (key) {
      case "theme":
        if (value !== "dark" && value !== "light") {
          throw new Error(
            `Invalid theme: "${value}". Must be "dark" or "light".`,
          );
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
        if (typeof value !== "number" || !Number.isFinite(value as number)) {
          throw new TypeError(`"${key}" must be a finite number`);
        }
        break;
    }
  }

  private _process<K extends keyof UserPreferences>(
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
}
