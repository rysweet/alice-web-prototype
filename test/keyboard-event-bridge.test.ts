import { describe, expect, it } from "vitest";
import {
  KeyboardEventBridge,
  comboFromKeyboardEvent,
  detectPlatform,
  primaryModifier,
  resolveDefaultShortcuts,
  resolveModCombo,
  DEFAULT_IDE_SHORTCUTS,
  type KeyboardEventLike,
} from "../src/keyboard-event-bridge";
import { ShortcutManager } from "../src/keyboard-shortcuts";

function keyEvent(overrides: Partial<KeyboardEventLike> & { key: string }): KeyboardEventLike {
  return {
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    ...overrides,
  };
}

describe("keyboard-event-bridge", () => {
  // ---------- comboFromKeyboardEvent ----------

  it("converts a basic key press to a combo string", () => {
    expect(comboFromKeyboardEvent(keyEvent({ key: "s", ctrlKey: true }))).toBe("ctrl+s");
  });

  it("handles multiple modifiers", () => {
    expect(comboFromKeyboardEvent(keyEvent({ key: "s", ctrlKey: true, shiftKey: true }))).toBe("ctrl+shift+s");
  });

  it("normalizes arrow keys and special keys", () => {
    expect(comboFromKeyboardEvent(keyEvent({ key: "ArrowUp" }))).toBe("up");
    expect(comboFromKeyboardEvent(keyEvent({ key: "ArrowDown" }))).toBe("down");
    expect(comboFromKeyboardEvent(keyEvent({ key: "Escape" }))).toBe("esc");
    expect(comboFromKeyboardEvent(keyEvent({ key: "Delete" }))).toBe("del");
    expect(comboFromKeyboardEvent(keyEvent({ key: " " }))).toBe("space");
  });

  it("ignores bare modifier key presses", () => {
    expect(comboFromKeyboardEvent(keyEvent({ key: "Control", ctrlKey: true }))).toBe("");
    expect(comboFromKeyboardEvent(keyEvent({ key: "Shift", shiftKey: true }))).toBe("");
    expect(comboFromKeyboardEvent(keyEvent({ key: "Meta", metaKey: true }))).toBe("");
    expect(comboFromKeyboardEvent(keyEvent({ key: "Alt", altKey: true }))).toBe("");
  });

  it("handles function keys", () => {
    expect(comboFromKeyboardEvent(keyEvent({ key: "F1" }))).toBe("f1");
    expect(comboFromKeyboardEvent(keyEvent({ key: "F5", ctrlKey: true }))).toBe("ctrl+f5");
  });

  // ---------- Platform Detection ----------

  it("detects platform from user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X)")).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0)")).toBe("windows");
    expect(detectPlatform("")).toBe("windows");
  });

  it("returns correct primary modifier per platform", () => {
    expect(primaryModifier("mac")).toBe("meta");
    expect(primaryModifier("windows")).toBe("ctrl");
    expect(primaryModifier("linux")).toBe("ctrl");
  });

  // ---------- Mod Resolution ----------

  it("resolves mod combos for different platforms", () => {
    expect(resolveModCombo("mod+s", "windows")).toBe("ctrl+s");
    expect(resolveModCombo("mod+s", "mac")).toBe("meta+s");
    expect(resolveModCombo("mod+shift+z", "mac")).toBe("meta+shift+z");
  });

  it("passes through combos without mod unchanged", () => {
    expect(resolveModCombo("f5", "windows")).toBe("f5");
    expect(resolveModCombo("ctrl+s", "mac")).toBe("ctrl+s");
  });

  // ---------- Default IDE Shortcuts ----------

  it("provides a comprehensive set of default IDE shortcuts", () => {
    expect(DEFAULT_IDE_SHORTCUTS.length).toBeGreaterThanOrEqual(20);
    const ids = DEFAULT_IDE_SHORTCUTS.map((s) => s.id);
    expect(ids).toContain("undo");
    expect(ids).toContain("redo");
    expect(ids).toContain("save-project");
    expect(ids).toContain("run");
    expect(ids).toContain("cut");
    expect(ids).toContain("copy");
    expect(ids).toContain("paste");
    expect(ids).toContain("help");
  });

  it("resolves default shortcuts for a specific platform", () => {
    const resolved = resolveDefaultShortcuts("mac");
    const save = resolved.find((s) => s.id === "save-project")!;
    expect(save.combo).toBe("meta+s");
    const undo = resolved.find((s) => s.id === "undo")!;
    expect(undo.combo).toBe("meta+z");
  });

  // ---------- KeyboardEventBridge ----------

  it("dispatches keyboard events to a ShortcutManager", () => {
    const manager = new ShortcutManager();
    const fired: string[] = [];
    manager.register({ id: "save", combo: "ctrl+s", description: "Save", action: () => fired.push("save") });

    const bridge = new KeyboardEventBridge(manager, { platform: "windows" });
    const handled = bridge.handleEvent(keyEvent({ key: "s", ctrlKey: true }));

    expect(handled).toBe(true);
    expect(fired).toEqual(["save"]);
    expect(bridge.handledCombos).toEqual(["ctrl+s"]);
  });

  it("returns false for unmatched events", () => {
    const manager = new ShortcutManager();
    const bridge = new KeyboardEventBridge(manager);
    expect(bridge.handleEvent(keyEvent({ key: "x" }))).toBe(false);
  });

  it("ignores repeated key events when configured", () => {
    const manager = new ShortcutManager();
    const count = { n: 0 };
    manager.register({ id: "test", combo: "a", description: "Test", action: () => count.n++ });

    const bridge = new KeyboardEventBridge(manager, { ignoreRepeat: true });
    bridge.handleEvent(keyEvent({ key: "a", repeat: false }));
    bridge.handleEvent(keyEvent({ key: "a", repeat: true }));

    expect(count.n).toBe(1);
  });

  it("respects shouldIgnore predicate", () => {
    const manager = new ShortcutManager();
    const fired: string[] = [];
    manager.register({ id: "test", combo: "a", description: "Test", action: () => fired.push("a") });

    const bridge = new KeyboardEventBridge(manager, {
      shouldIgnore: (event) => event.key === "a",
    });
    bridge.handleEvent(keyEvent({ key: "a" }));

    expect(fired).toEqual([]);
  });

  it("uses active contexts from callback", () => {
    const manager = new ShortcutManager();
    const fired: string[] = [];
    manager.register({ id: "editor-save", combo: "ctrl+s", description: "Save", contexts: ["editor"], action: () => fired.push("editor") });
    manager.register({ id: "scene-save", combo: "ctrl+s", description: "Save scene", contexts: ["scene"], action: () => fired.push("scene") });

    const bridge = new KeyboardEventBridge(manager, {
      contexts: () => ["editor"],
    });
    bridge.handleEvent(keyEvent({ key: "s", ctrlKey: true }));

    expect(fired).toEqual(["editor"]);
  });

  it("attaches and detaches from event targets", () => {
    const manager = new ShortcutManager();
    const fired: string[] = [];
    manager.register({ id: "test", combo: "a", description: "Test", action: () => fired.push("a") });

    const listeners: ((event: KeyboardEventLike) => void)[] = [];
    const target = {
      addEventListener(_type: string, listener: (event: KeyboardEventLike) => void) { listeners.push(listener); },
      removeEventListener(_type: string, _listener: (event: KeyboardEventLike) => void) { listeners.length = 0; },
    };

    const bridge = new KeyboardEventBridge(manager);
    bridge.attach(target);
    expect(listeners.length).toBe(1);

    listeners[0](keyEvent({ key: "a" }));
    expect(fired).toEqual(["a"]);

    bridge.detach();
    expect(listeners.length).toBe(0);
  });
});
