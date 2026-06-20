import { describe, expect, it } from "vitest";
import {
  ExtensionRegistry,
  MapPluginLoader,
  PluginManager,
  PluginSettingsManager,
  StaticPluginDiscovery,
  type Plugin,
  type PluginSettingsStorage,
} from "../src/plugin-system.js";

class MemoryStorage implements PluginSettingsStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("plugin-system", () => {
  it("registers extension points and removes a plugin's contributions", () => {
    const registry = new ExtensionRegistry();
    registry.registerExtensionPoint({ id: "ide.commands", allowsMultiple: true });

    registry.contribute("ide.commands", "orbit-camera", { command: "orbit" });
    registry.contribute("ide.commands", "snap-grid", { command: "snap" });

    expect(registry.getExtensions<{ command: string }>("ide.commands")).toEqual([
      {
        pluginId: "orbit-camera",
        extensionPointId: "ide.commands",
        contribution: { command: "orbit" },
      },
      {
        pluginId: "snap-grid",
        extensionPointId: "ide.commands",
        contribution: { command: "snap" },
      },
    ]);

    registry.removePlugin("orbit-camera");

    expect(registry.getExtensions<{ command: string }>("ide.commands")).toEqual([
      {
        pluginId: "snap-grid",
        extensionPointId: "ide.commands",
        contribution: { command: "snap" },
      },
    ]);
  });

  it("persists plugin settings and resets to defaults", () => {
    const storage = new MemoryStorage();
    const settings = new PluginSettingsManager({
      storage,
      storageKey: "alice.plugins.test",
    });

    settings.registerDefaults("orbit-camera", { speed: 2, invertY: false });
    settings.set("orbit-camera", "speed", 4);
    settings.update("orbit-camera", { invertY: true });

    const reloaded = new PluginSettingsManager({
      storage,
      storageKey: "alice.plugins.test",
    });
    reloaded.registerDefaults("orbit-camera", { speed: 2, invertY: false });

    expect(reloaded.getAll("orbit-camera")).toEqual({ speed: 4, invertY: true });

    reloaded.reset("orbit-camera");
    expect(reloaded.getAll("orbit-camera")).toEqual({ speed: 2, invertY: false });
  });

  it("migrates legacy default plugin settings into the LookingGlass key", () => {
    const storage = new MemoryStorage();
    storage.setItem("alice-web.plugins.settings", JSON.stringify({
      "orbit-camera": { speed: 5 },
    }));

    const settings = new PluginSettingsManager({ storage });

    expect(settings.getAll("orbit-camera")).toEqual({ speed: 5 });
    expect(storage.getItem("lookingglass.plugins.settings")).toBe(
      storage.getItem("alice-web.plugins.settings"),
    );
  });

  it("discovers, loads, activates, and deactivates plugins", async () => {
    const registry = new ExtensionRegistry();
    registry.registerExtensionPoint({ id: "ide.panels", allowsMultiple: true });
    const settings = new PluginSettingsManager();
    const lifecycle: string[] = [];

    const orbitPlugin: Plugin = {
      id: "orbit-camera",
      init(context) {
        lifecycle.push(`init:${context.manifest.id}`);
        context.registry.contribute("ide.panels", context.manifest.id, { panel: "orbit" });
      },
      activate(context) {
        lifecycle.push(`activate:${context.manifest.id}`);
        context.settings.set(context.manifest.id, "active", true);
      },
      deactivate(context) {
        lifecycle.push(`deactivate:${context.manifest.id}`);
        context.settings.set(context.manifest.id, "active", false);
      },
    };

    const manager = new PluginManager({
      discovery: new StaticPluginDiscovery([
        {
          id: "orbit-camera",
          entry: "orbit-entry",
          defaultSettings: { speed: 3 },
        },
      ]),
      loader: new MapPluginLoader({ "orbit-entry": orbitPlugin }),
      registry,
      settings,
    });

    const loaded = await manager.loadDiscoveredPlugins();

    expect(loaded).toEqual([
      {
        id: "orbit-camera",
        manifest: {
          id: "orbit-camera",
          entry: "orbit-entry",
          defaultSettings: { speed: 3 },
        },
        active: true,
      },
    ]);
    expect(lifecycle).toEqual(["init:orbit-camera", "activate:orbit-camera"]);
    expect(settings.getAll("orbit-camera")).toEqual({ speed: 3, active: true });
    expect(registry.getExtensions<{ panel: string }>("ide.panels")).toEqual([
      {
        pluginId: "orbit-camera",
        extensionPointId: "ide.panels",
        contribution: { panel: "orbit" },
      },
    ]);

    await manager.deactivatePlugin("orbit-camera");

    expect(lifecycle).toEqual([
      "init:orbit-camera",
      "activate:orbit-camera",
      "deactivate:orbit-camera",
    ]);
    expect(settings.get("orbit-camera", "active")).toBe(false);
    expect(registry.getExtensions("ide.panels")).toEqual([]);
  });

  it("loads disabled plugins without activating them", async () => {
    const lifecycle: string[] = [];
    const plugin: Plugin = {
      init() {
        lifecycle.push("init");
      },
      activate() {
        lifecycle.push("activate");
      },
      deactivate() {
        lifecycle.push("deactivate");
      },
    };

    const manager = new PluginManager({
      discovery: [
        {
          id: "theme-pack",
          entry: "theme-entry",
          enabled: false,
          defaultSettings: { accent: "purple" },
        },
      ],
      loader: { "theme-entry": plugin },
    });

    const loaded = await manager.loadDiscoveredPlugins();

    expect(loaded[0]).toMatchObject({ id: "theme-pack", active: false });
    expect(lifecycle).toEqual(["init"]);
    expect(manager.settings.getAll("theme-pack")).toEqual({ accent: "purple" });
  });
});
