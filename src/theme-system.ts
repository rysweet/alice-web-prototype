export interface ThemeVariableValues {
  background: string;
  foreground: string;
  surface: string;
  accent: string;
  border: string;
  focusRing: string;
  fontFamily: string;
  fontSize: string;
  spacingUnit: string;
}

export interface ThemeDefinition {
  id: string;
  label: string;
  mode: "light" | "dark" | "custom";
  variables: ThemeVariableValues;
}

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CssVariableTarget {
  setProperty(name: string, value: string): void;
  removeProperty?(name: string): void;
}

export interface PersistedThemeState {
  activeThemeId: string;
  highContrast: boolean;
  customTheme?: ThemeDefinition | null;
}

const DEFAULT_STORAGE_KEY = "lookingglass.theme";
const LEGACY_STORAGE_KEY = "alice-web.theme";

function cloneVariables(values: ThemeVariableValues): ThemeVariableValues {
  return { ...values };
}

function cloneTheme(theme: ThemeDefinition): ThemeDefinition {
  return {
    ...theme,
    variables: cloneVariables(theme.variables),
  };
}

function getDefaultStorage(): ThemeStorage | null {
  if (typeof globalThis === "undefined" || !("localStorage" in globalThis)) {
    return null;
  }
  return globalThis.localStorage as ThemeStorage;
}

function migrateLegacyStorage(storage: ThemeStorage | null, storageKey: string): void {
  if (!storage || storageKey !== DEFAULT_STORAGE_KEY || storage.getItem(storageKey) !== null) {
    return;
  }
  const legacyValue = storage.getItem(LEGACY_STORAGE_KEY);
  if (legacyValue !== null) {
    storage.setItem(storageKey, legacyValue);
  }
}

export class ThemeVariables {
  private readonly values: ThemeVariableValues;

  constructor(values: ThemeVariableValues) {
    this.values = cloneVariables(values);
  }

  toObject(): ThemeVariableValues {
    return cloneVariables(this.values);
  }

  toCssCustomProperties(prefix = "--alice"): Record<string, string> {
    return {
      [`${prefix}-background`]: this.values.background,
      [`${prefix}-foreground`]: this.values.foreground,
      [`${prefix}-surface`]: this.values.surface,
      [`${prefix}-accent`]: this.values.accent,
      [`${prefix}-border`]: this.values.border,
      [`${prefix}-focus-ring`]: this.values.focusRing,
      [`${prefix}-font-family`]: this.values.fontFamily,
      [`${prefix}-font-size`]: this.values.fontSize,
      [`${prefix}-spacing-unit`]: this.values.spacingUnit,
    };
  }

  static merge(base: ThemeVariableValues, overrides: Partial<ThemeVariableValues> = {}): ThemeVariables {
    return new ThemeVariables({ ...base, ...overrides });
  }
}

export class HighContrastMode {
  constructor(private enabled = false) {}

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  apply(theme: ThemeDefinition): ThemeDefinition {
    if (!this.enabled) {
      return cloneTheme(theme);
    }

    return {
      ...theme,
      label: `${theme.label} (High Contrast)`,
      variables: {
        ...theme.variables,
        background: "#000000",
        foreground: "#ffffff",
        surface: "#000000",
        border: "#ffffff",
        accent: "#ffd400",
        focusRing: "#00ffff",
      },
    };
  }
}

export class ThemePersistence {
  private readonly storage: ThemeStorage | null;
  private readonly storageKey: string;

  constructor(storage: ThemeStorage | null = getDefaultStorage(), storageKey = DEFAULT_STORAGE_KEY) {
    this.storage = storage;
    this.storageKey = storageKey;
    migrateLegacyStorage(this.storage, this.storageKey);
  }

  save(state: PersistedThemeState): void {
    this.storage?.setItem(this.storageKey, JSON.stringify(state));
  }

  load(): PersistedThemeState | null {
    const raw = this.storage?.getItem(this.storageKey);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as PersistedThemeState;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.storage?.removeItem(this.storageKey);
  }
}

export const LIGHT_THEME: Readonly<ThemeDefinition> = Object.freeze({
  id: "light",
  label: "Light",
  mode: "light",
  variables: Object.freeze({
    background: "#f5f7fb",
    foreground: "#1f2937",
    surface: "#ffffff",
    accent: "#2563eb",
    border: "#cbd5e1",
    focusRing: "#0ea5e9",
    fontFamily: '"Inter", sans-serif',
    fontSize: "14px",
    spacingUnit: "8px",
  }),
});

export const DARK_THEME: Readonly<ThemeDefinition> = Object.freeze({
  id: "dark",
  label: "Dark",
  mode: "dark",
  variables: Object.freeze({
    background: "#111827",
    foreground: "#f9fafb",
    surface: "#1f2937",
    accent: "#60a5fa",
    border: "#374151",
    focusRing: "#93c5fd",
    fontFamily: '"Inter", sans-serif',
    fontSize: "14px",
    spacingUnit: "8px",
  }),
});

export class ThemeManager {
  private readonly themes = new Map<string, ThemeDefinition>();
  private readonly persistence: ThemePersistence;
  private readonly highContrastMode: HighContrastMode;
  private activeThemeId: string;

  constructor(options: {
    persistence?: ThemePersistence;
    highContrastMode?: HighContrastMode;
    themes?: Iterable<ThemeDefinition>;
    defaultThemeId?: string;
    autoLoad?: boolean;
  } = {}) {
    this.persistence = options.persistence ?? new ThemePersistence();
    this.highContrastMode = options.highContrastMode ?? new HighContrastMode(false);
    for (const theme of options.themes ?? [LIGHT_THEME, DARK_THEME]) {
      this.registerTheme(theme);
    }
    this.activeThemeId = options.defaultThemeId ?? DARK_THEME.id;

    if (options.autoLoad ?? true) {
      this.load();
    }
  }

  registerTheme(theme: ThemeDefinition): void {
    this.themes.set(theme.id, cloneTheme(theme));
  }

  registerCustomTheme(id: string, label: string, overrides: Partial<ThemeVariableValues>): ThemeDefinition {
    const theme: ThemeDefinition = {
      id,
      label,
      mode: "custom",
      variables: ThemeVariables.merge(DARK_THEME.variables, overrides).toObject(),
    };
    this.registerTheme(theme);
    return cloneTheme(theme);
  }

  getTheme(themeId: string): ThemeDefinition | null {
    const theme = this.themes.get(themeId);
    return theme ? cloneTheme(theme) : null;
  }

  getAvailableThemes(): ThemeDefinition[] {
    return [...this.themes.values()].map(cloneTheme);
  }

  setTheme(themeId: string): ThemeDefinition {
    if (!this.themes.has(themeId)) {
      throw new Error(`Unknown theme: ${themeId}`);
    }
    this.activeThemeId = themeId;
    this.save();
    return this.getActiveTheme();
  }

  getActiveTheme(): ThemeDefinition {
    const theme = this.themes.get(this.activeThemeId) ?? this.themes.get(DARK_THEME.id) ?? cloneTheme(DARK_THEME);
    return this.highContrastMode.apply(theme);
  }

  getActiveThemeId(): string {
    return this.activeThemeId;
  }

  setHighContrast(enabled: boolean): void {
    this.highContrastMode.setEnabled(enabled);
    this.save();
  }

  isHighContrastEnabled(): boolean {
    return this.highContrastMode.isEnabled();
  }

  applyTo(target: CssVariableTarget, prefix = "--alice"): Record<string, string> {
    const properties = new ThemeVariables(this.getActiveTheme().variables).toCssCustomProperties(prefix);
    for (const [name, value] of Object.entries(properties)) {
      target.setProperty(name, value);
    }
    return properties;
  }

  save(): void {
    const customTheme = this.themes.get(this.activeThemeId)?.mode === "custom"
      ? this.themes.get(this.activeThemeId) ?? null
      : null;
    this.persistence.save({
      activeThemeId: this.activeThemeId,
      highContrast: this.highContrastMode.isEnabled(),
      customTheme: customTheme ? cloneTheme(customTheme) : null,
    });
  }

  load(): void {
    const state = this.persistence.load();
    if (!state) {
      return;
    }
    if (state.customTheme) {
      this.registerTheme(state.customTheme);
    }
    if (state.activeThemeId && this.themes.has(state.activeThemeId)) {
      this.activeThemeId = state.activeThemeId;
    }
    this.highContrastMode.setEnabled(Boolean(state.highContrast));
  }
}
