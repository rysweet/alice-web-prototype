import { describe, expect, it } from "vitest";
import {
  DEFAULT_HIGH_CONTRAST_THEME,
  TabOrderManager,
  annotateSceneElements,
  createHighContrastStyle,
  findKeyboardShortcuts,
  formatKeyboardShortcutCheatsheet,
  listKeyboardShortcuts,
  resolveHighContrastTheme,
} from "../src/accessibility.js";

describe("accessibility", () => {
  it("orders focus targets by explicit tab index and registration order", () => {
    const manager = new TabOrderManager([
      { id: "camera", label: "Camera", role: "camera", shortcutIds: ["focus-next"] },
      { id: "ground", label: "Ground", role: "scene", tabIndex: 5 },
      { id: "rabbit", label: "Rabbit", role: "actor", tabIndex: 1 },
      { id: "hidden", label: "Hidden", role: "prop", hidden: true, tabIndex: 0 },
    ]);

    expect(manager.getOrderedElements().map((element) => element.id)).toEqual(["rabbit", "ground", "camera"]);
    expect(manager.next("ground")?.id).toBe("camera");
    expect(manager.previous("rabbit")?.id).toBe("camera");

    manager.unregister("ground");
    expect(manager.getOrderedElements().map((element) => element.id)).toEqual(["rabbit", "camera"]);
  });

  it("creates screen reader annotations with shortcut hints", () => {
    const annotations = annotateSceneElements([
      {
        id: "rabbit",
        label: "Rabbit",
        role: "actor",
        description: "Main scene actor",
        selected: true,
        shortcutIds: ["activate-selection", "open-shortcuts"],
      },
      {
        id: "camera",
        label: "Scene Camera",
        role: "camera",
        screenReaderHint: "Use arrow keys to frame the shot",
      },
    ]);

    expect(annotations[0]?.ariaLabel).toBe("Rabbit, selected");
    expect(annotations[0]?.ariaDescription).toContain("actor element");
    expect(annotations[0]?.ariaDescription).toContain("Shortcuts: Enter / Space, Ctrl+/");
    expect(annotations[1]?.announcement).toContain("Use arrow keys to frame the shot");
  });

  it("supports high contrast theme overrides and selected focus styling", () => {
    const theme = resolveHighContrastTheme({ accent: "#ff00ff", border: "#00ff00" });
    const selectedStyle = createHighContrastStyle(true, theme);
    const unselectedStyle = createHighContrastStyle(false, theme);

    expect(theme.background).toBe(DEFAULT_HIGH_CONTRAST_THEME.background);
    expect(theme.accent).toBe("#ff00ff");
    expect(selectedStyle.borderColor).toBe("#ff00ff");
    expect(unselectedStyle.borderColor).toBe("#00ff00");
    expect(selectedStyle.focusRing).toBe(DEFAULT_HIGH_CONTRAST_THEME.focusRing);
  });

  it("documents and discovers keyboard shortcuts", () => {
    expect(listKeyboardShortcuts("navigation").map((shortcut) => shortcut.id)).toEqual([
      "focus-next",
      "focus-previous",
    ]);
    expect(findKeyboardShortcuts("preview")[0]?.id).toBe("run-world");
    expect(formatKeyboardShortcutCheatsheet(["focus-next", "open-shortcuts"]))
      .toContain("Tab: Move to the next focusable control");
  });
});
