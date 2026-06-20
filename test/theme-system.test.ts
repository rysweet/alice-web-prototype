// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DARK_THEME,
  HighContrastMode,
  LIGHT_THEME,
  ThemeManager,
  ThemePersistence,
  ThemeVariables,
} from "../src/theme-system";

const STORAGE_KEY = "lookingglass.theme.test";

beforeEach(() => {
  localStorage.clear();
});

describe("theme-system", () => {
  it("converts theme variables into CSS custom properties", () => {
    const css = new ThemeVariables(LIGHT_THEME.variables).toCssCustomProperties();
    expect(css).toMatchObject({
      "--alice-background": LIGHT_THEME.variables.background,
      "--alice-font-size": "14px",
    });
  });

  it("switches themes, applies variables, and persists the active theme", () => {
    const persistence = new ThemePersistence(localStorage, STORAGE_KEY);
    const manager = new ThemeManager({ persistence, autoLoad: false });
    const target = new Map<string, string>();

    manager.setTheme("light");
    manager.applyTo({ setProperty: (name, value) => target.set(name, value) });

    expect(manager.getActiveThemeId()).toBe("light");
    expect(target.get("--alice-background")).toBe(LIGHT_THEME.variables.background);

    const reloaded = new ThemeManager({ persistence });
    expect(reloaded.getActiveThemeId()).toBe("light");
  });

  it("migrates legacy default theme storage into the LookingGlass key", () => {
    localStorage.setItem("alice-web.theme", JSON.stringify({
      activeThemeId: "light",
      highContrast: false,
      customTheme: null,
    }));

    const manager = new ThemeManager();

    expect(manager.getActiveThemeId()).toBe("light");
    expect(localStorage.getItem("lookingglass.theme")).toBe(localStorage.getItem("alice-web.theme"));
  });

  it("registers and restores custom themes from persistence", () => {
    const persistence = new ThemePersistence(localStorage, STORAGE_KEY);
    const manager = new ThemeManager({ persistence, autoLoad: false });

    manager.registerCustomTheme("studio", "Studio", {
      accent: "#ff00ff",
      spacingUnit: "10px",
    });
    manager.setTheme("studio");

    const reloaded = new ThemeManager({ persistence });
    expect(reloaded.getActiveTheme().label).toBe("Studio");
    expect(reloaded.getActiveTheme().variables.accent).toBe("#ff00ff");
  });

  it("applies high contrast overlays without losing the selected theme", () => {
    const manager = new ThemeManager({ autoLoad: false, highContrastMode: new HighContrastMode(true) });
    manager.setTheme(DARK_THEME.id);

    const active = manager.getActiveTheme();
    expect(active.label).toContain("High Contrast");
    expect(active.variables.background).toBe("#000000");
    expect(active.variables.accent).toBe("#ffd400");
  });
});
