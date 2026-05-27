import { describe, expect, it } from "vitest";
import {
  ContextualShortcuts,
  ShortcutConflictDetector,
  ShortcutHelpOverlay,
  ShortcutManager,
  ShortcutMap,
} from "../src/keyboard-shortcuts";

describe("keyboard-shortcuts", () => {
  it("registers, normalizes, and unregisters shortcut mappings", () => {
    const map = new ShortcutMap();
    map.register({ id: "run", combo: "Shift + Ctrl + R", description: "Run world" });

    expect(map.lookup("ctrl+shift+r")[0]?.id).toBe("run");
    expect(map.unregister("run")).toBe(true);
    expect(map.lookup("ctrl+shift+r")).toEqual([]);
  });

  it("detects conflicts and filters shortcuts by active context", () => {
    const detector = new ShortcutConflictDetector();
    const contextual = new ContextualShortcuts(new Set(["editor"]));
    const shortcuts = [
      { id: "save", combo: "Ctrl+S", description: "Save project", contexts: ["editor"] },
      { id: "scene-save", combo: "Ctrl+S", description: "Save scene", contexts: ["scene"] },
      { id: "help", combo: "F1", description: "Open help" },
    ];

    expect(detector.detect(shortcuts)).toEqual([{ combo: "ctrl+s", shortcutIds: ["save", "scene-save"] }]);
    expect(contextual.filter(shortcuts).map((shortcut) => shortcut.id)).toEqual(["save", "help"]);
  });

  it("triggers only shortcuts valid for the current context", () => {
    const manager = new ShortcutManager();
    const fired: string[] = [];
    manager.register({ id: "rename", combo: "F2", description: "Rename", contexts: ["editor"], action: () => fired.push("rename") });
    manager.register({ id: "play", combo: "F2", description: "Play", contexts: ["runtime"], action: () => fired.push("play") });

    expect(manager.trigger("f2", ["editor"]).map((shortcut) => shortcut.id)).toEqual(["rename"]);
    expect(fired).toEqual(["rename"]);
  });

  it("builds help overlay sections in display order", () => {
    const overlay = new ShortcutHelpOverlay();
    const rendered = overlay.render([
      { id: "run", combo: "Ctrl+R", description: "Run world", group: "Runtime" },
      { id: "build", combo: "Ctrl+B", description: "Build project", group: "Runtime" },
      { id: "help", combo: "F1", description: "Open help", group: "Help" },
    ]);

    expect(rendered).toContain("Runtime");
    expect(rendered).toContain("- Ctrl+B: Build project");
    expect(rendered).toContain("Help");
  });
});
