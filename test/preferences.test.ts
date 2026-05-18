import { describe, it, expect } from "vitest";
import {
  Preferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "../src/preferences";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

describe("Preferences — defaults", () => {
  it("exports DEFAULT_PREFERENCES with documented values", () => {
    expect(DEFAULT_PREFERENCES).toEqual({
      theme: "dark",
      gridVisible: true,
      snapToGrid: false,
      cameraFov: 60,
      autoSaveInterval: 60,
    });
  });

  it("new instance returns all defaults via get()", () => {
    const prefs = new Preferences();
    expect(prefs.get("theme")).toBe("dark");
    expect(prefs.get("gridVisible")).toBe(true);
    expect(prefs.get("snapToGrid")).toBe(false);
    expect(prefs.get("cameraFov")).toBe(60);
    expect(prefs.get("autoSaveInterval")).toBe(60);
  });

  it("getAll() returns a full copy of current preferences", () => {
    const prefs = new Preferences();
    const all = prefs.getAll();
    expect(all).toEqual(DEFAULT_PREFERENCES);
    // Must be a copy, not the same reference
    expect(all).not.toBe(DEFAULT_PREFERENCES);
  });
});

// ---------------------------------------------------------------------------
// Typed get / set
// ---------------------------------------------------------------------------

describe("Preferences — get/set", () => {
  it("set() updates a single key", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    expect(prefs.get("theme")).toBe("light");
  });

  it("set() does not affect other keys", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    expect(prefs.get("gridVisible")).toBe(true);
    expect(prefs.get("cameraFov")).toBe(60);
  });

  it("set() allows toggling boolean preferences", () => {
    const prefs = new Preferences();
    prefs.set("gridVisible", false);
    expect(prefs.get("gridVisible")).toBe(false);
    prefs.set("gridVisible", true);
    expect(prefs.get("gridVisible")).toBe(true);
  });

  it("set() allows updating numeric preferences", () => {
    const prefs = new Preferences();
    prefs.set("cameraFov", 90);
    expect(prefs.get("cameraFov")).toBe(90);
    prefs.set("autoSaveInterval", 120);
    expect(prefs.get("autoSaveInterval")).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("Preferences — validation", () => {
  it("rejects invalid theme values", () => {
    const prefs = new Preferences();
    expect(() => prefs.set("theme", "neon" as any)).toThrow();
    expect(prefs.get("theme")).toBe("dark");
  });

  it("accepts valid theme values", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    expect(prefs.get("theme")).toBe("light");
    prefs.set("theme", "dark");
    expect(prefs.get("theme")).toBe("dark");
  });

  it("clamps cameraFov to valid range [1, 179]", () => {
    const prefs = new Preferences();
    prefs.set("cameraFov", 0);
    expect(prefs.get("cameraFov")).toBe(1);
    prefs.set("cameraFov", 200);
    expect(prefs.get("cameraFov")).toBe(179);
    prefs.set("cameraFov", -10);
    expect(prefs.get("cameraFov")).toBe(1);
  });

  it("clamps autoSaveInterval to valid range [0, 3600]", () => {
    const prefs = new Preferences();
    prefs.set("autoSaveInterval", -5);
    expect(prefs.get("autoSaveInterval")).toBe(0);
    prefs.set("autoSaveInterval", 9999);
    expect(prefs.get("autoSaveInterval")).toBe(3600);
  });

  it("rejects NaN for numeric preferences", () => {
    const prefs = new Preferences();
    expect(() => prefs.set("cameraFov", NaN)).toThrow();
    expect(() => prefs.set("autoSaveInterval", NaN)).toThrow();
  });

  it("rejects Infinity for numeric preferences", () => {
    const prefs = new Preferences();
    expect(() => prefs.set("cameraFov", Infinity)).toThrow();
    expect(() => prefs.set("autoSaveInterval", -Infinity)).toThrow();
  });

  it("rejects wrong type for boolean preferences", () => {
    const prefs = new Preferences();
    expect(() => prefs.set("gridVisible", "yes" as any)).toThrow();
    expect(() => prefs.set("snapToGrid", 1 as any)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// JSON serialization
// ---------------------------------------------------------------------------

describe("Preferences — serialization", () => {
  it("toJSON() returns a plain object snapshot", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    prefs.set("cameraFov", 90);
    const json = prefs.toJSON();
    expect(json).toEqual({
      theme: "light",
      gridVisible: true,
      snapToGrid: false,
      cameraFov: 90,
      autoSaveInterval: 60,
    });
  });

  it("fromJSON() restores preferences from a valid object", () => {
    const saved: UserPreferences = {
      theme: "light",
      gridVisible: false,
      snapToGrid: true,
      cameraFov: 45,
      autoSaveInterval: 300,
    };
    const prefs = Preferences.fromJSON(saved);
    expect(prefs.getAll()).toEqual(saved);
  });

  it("fromJSON() applies defaults for missing keys (partial input)", () => {
    const partial = { theme: "light" } as Partial<UserPreferences>;
    const prefs = Preferences.fromJSON(partial as UserPreferences);
    expect(prefs.get("theme")).toBe("light");
    expect(prefs.get("gridVisible")).toBe(true);
    expect(prefs.get("cameraFov")).toBe(60);
  });

  it("fromJSON() ignores unknown keys (no prototype pollution)", () => {
    const tainted = {
      theme: "dark",
      gridVisible: true,
      snapToGrid: false,
      cameraFov: 60,
      autoSaveInterval: 60,
      __proto__: { admin: true },
      constructor: "evil",
    } as any;
    const prefs = Preferences.fromJSON(tainted);
    expect((prefs.getAll() as any).__proto__).toBeUndefined;
    expect((prefs.getAll() as any).constructor).toBeUndefined;
    // Should only have the 5 known keys
    expect(Object.keys(prefs.toJSON())).toHaveLength(5);
  });

  it("fromJSON() validates values (rejects malformed data)", () => {
    const bad = { theme: "neon", cameraFov: "not-a-number" } as any;
    // Should not throw — applies defaults for invalid values
    const prefs = Preferences.fromJSON(bad);
    expect(prefs.get("theme")).toBe("dark"); // invalid → default
    expect(prefs.get("cameraFov")).toBe(60); // invalid → default
  });

  it("round-trips through toJSON/fromJSON", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    prefs.set("snapToGrid", true);
    prefs.set("cameraFov", 120);

    const restored = Preferences.fromJSON(prefs.toJSON());
    expect(restored.getAll()).toEqual(prefs.getAll());
  });
});

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

describe("Preferences — reset", () => {
  it("reset() restores all defaults", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    prefs.set("gridVisible", false);
    prefs.set("cameraFov", 120);
    prefs.reset();
    expect(prefs.getAll()).toEqual(DEFAULT_PREFERENCES);
  });

  it("reset(key) restores a single key to default", () => {
    const prefs = new Preferences();
    prefs.set("theme", "light");
    prefs.set("cameraFov", 120);
    prefs.reset("theme");
    expect(prefs.get("theme")).toBe("dark");
    expect(prefs.get("cameraFov")).toBe(120); // untouched
  });
});

// ---------------------------------------------------------------------------
// Change notification
// ---------------------------------------------------------------------------

describe("Preferences — onChange callback", () => {
  it("fires onChange when a value changes", () => {
    const prefs = new Preferences();
    const changes: Array<{ key: string; oldValue: unknown; newValue: unknown }> = [];
    prefs.onChange((key, oldValue, newValue) => {
      changes.push({ key, oldValue, newValue });
    });
    prefs.set("theme", "light");
    expect(changes).toEqual([{ key: "theme", oldValue: "dark", newValue: "light" }]);
  });

  it("does not fire onChange when set to the same value", () => {
    const prefs = new Preferences();
    const changes: unknown[] = [];
    prefs.onChange(() => changes.push(1));
    prefs.set("theme", "dark"); // same as default
    expect(changes).toHaveLength(0);
  });

  it("fires onChange on reset", () => {
    const prefs = new Preferences();
    prefs.set("cameraFov", 120);
    const changes: Array<{ key: string }> = [];
    prefs.onChange((key) => changes.push({ key }));
    prefs.reset("cameraFov");
    expect(changes).toEqual([{ key: "cameraFov" }]);
  });
});
