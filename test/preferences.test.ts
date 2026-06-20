// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  Preferences,
  type PreferenceChangeEvent,
  type UserPreferences,
} from "../src/preferences";

const STORAGE_KEY = "lookingglass.preferences.test";

beforeEach(() => {
  localStorage.clear();
});

describe("Preferences", () => {
  it("starts with documented defaults", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY });
    expect(DEFAULT_PREFERENCES).toEqual({
      theme: "dark",
      gridVisible: true,
      snapToGrid: false,
      cameraFov: 60,
      autoSaveInterval: 60,
    });
    expect(prefs.getAll()).toEqual(DEFAULT_PREFERENCES);
  });

  it("supports custom defaults without mutating the global defaults", () => {
    const prefs = new Preferences({
      storageKey: STORAGE_KEY,
      defaults: { theme: "light", autoSaveInterval: 120 },
    });

    expect(prefs.getAll()).toEqual({
      theme: "light",
      gridVisible: true,
      snapToGrid: false,
      cameraFov: 60,
      autoSaveInterval: 120,
    });
    expect(DEFAULT_PREFERENCES.theme).toBe("dark");
  });

  it("updates individual preferences and preserves other values", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY });
    prefs.set("theme", "light");
    prefs.update({ gridVisible: false, cameraFov: 90 });

    expect(prefs.getAll()).toEqual({
      theme: "light",
      gridVisible: false,
      snapToGrid: false,
      cameraFov: 90,
      autoSaveInterval: 60,
    });
  });

  it("validates and clamps persisted numeric settings", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY });
    prefs.set("cameraFov", 500);
    prefs.set("autoSaveInterval", -3);

    expect(prefs.get("cameraFov")).toBe(179);
    expect(prefs.get("autoSaveInterval")).toBe(0);
    expect(() => prefs.set("theme", "neon" as never)).toThrow();
    expect(() => prefs.set("gridVisible", "yes" as never)).toThrow();
  });

  it("round-trips through toJSON/fromJSON with a null-prototype snapshot", () => {
    const saved: UserPreferences = {
      theme: "light",
      gridVisible: false,
      snapToGrid: true,
      cameraFov: 45,
      autoSaveInterval: 300,
    };

    const restored = Preferences.fromJSON(saved, { storageKey: STORAGE_KEY });
    const json = restored.toJSON() as unknown as Record<string, unknown>;

    expect(restored.getAll()).toEqual(saved);
    expect(Object.getPrototypeOf(json)).toBeNull();
    expect(json.constructor).toBeUndefined();
    expect(json.__proto__).toBeUndefined();
  });

  it("ignores malformed JSON input and unknown keys", () => {
    const prefs = Preferences.fromJSON(
      { theme: "neon", cameraFov: "bad", unknown: true } as never,
      { storageKey: STORAGE_KEY },
    );

    expect(prefs.getAll()).toEqual(DEFAULT_PREFERENCES);
  });

  it("persists changes and auto-loads them for the next instance", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY });
    prefs.set("theme", "light");
    prefs.set("snapToGrid", true);

    const reloaded = new Preferences({ storageKey: STORAGE_KEY });
    expect(reloaded.getAll()).toEqual({
      theme: "light",
      gridVisible: true,
      snapToGrid: true,
      cameraFov: 60,
      autoSaveInterval: 60,
    });
  });

  it("migrates legacy default storage into the LookingGlass key", () => {
    localStorage.setItem("alice-web.preferences", JSON.stringify({ theme: "light" }));

    const prefs = new Preferences();

    expect(prefs.get("theme")).toBe("light");
    expect(localStorage.getItem("lookingglass.preferences")).toBe(
      localStorage.getItem("alice-web.preferences"),
    );
  });

  it("supports manual persistence when autoSave is disabled", () => {
    const prefs = new Preferences({
      storageKey: STORAGE_KEY,
      autoSave: false,
      autoLoad: false,
    });

    prefs.set("theme", "light");
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    prefs.save();
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toMatchObject({
      theme: "light",
    });
  });

  it("can clear persisted state and report whether persistence exists", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY });
    expect(prefs.hasPersistedState()).toBe(false);

    prefs.set("theme", "light");
    expect(prefs.hasPersistedState()).toBe(true);

    prefs.clearPersisted();
    expect(prefs.hasPersistedState()).toBe(false);
  });

  it("fires simple and detailed change notifications and supports unsubscribe", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY, autoLoad: false });
    const keys: string[] = [];
    const events: PreferenceChangeEvent[] = [];

    const offSimple = prefs.onChange((key) => keys.push(key));
    const offDetailed = prefs.subscribe((event) => events.push(event));

    prefs.set("theme", "light");
    offSimple();
    offDetailed();
    prefs.set("gridVisible", false);

    expect(keys).toEqual(["theme"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      key: "theme",
      oldValue: "dark",
      newValue: "light",
      source: "set",
    });
    expect(events[0].snapshot.theme).toBe("light");
  });

  it("emits load notifications when persisted state changes the in-memory snapshot", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ theme: "light", cameraFov: 75 }),
    );
    const prefs = new Preferences({ storageKey: STORAGE_KEY, autoLoad: false });
    const events: PreferenceChangeEvent[] = [];
    prefs.subscribe((event) => events.push(event));

    prefs.load();

    expect(events.map((event) => [event.key, event.source, event.newValue])).toEqual([
      ["theme", "load", "light"],
      ["cameraFov", "load", 75],
    ]);
  });

  it("reset restores defaults and persists the reset state", () => {
    const prefs = new Preferences({ storageKey: STORAGE_KEY });
    prefs.set("theme", "light");
    prefs.set("cameraFov", 120);
    prefs.reset();

    expect(prefs.getAll()).toEqual(DEFAULT_PREFERENCES);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null")).toMatchObject({
      theme: "dark",
      cameraFov: 60,
    });
  });
});
