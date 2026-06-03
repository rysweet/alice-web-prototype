/**
 * Tests for accessibility patterns from issue #88's "What Would Add Value" section.
 *
 * Covers: HighContrastDetector, ScreenReaderDescriptionBuilder,
 * AccessibleDragDrop, AccessibleTreeView, AccessibleCodeEditor.
 */
import { describe, expect, it } from "vitest";
import {
  HighContrastDetector,
  ScreenReaderDescriptionBuilder,
  AccessibleDragDrop,
  AccessibleTreeView,
  AccessibleCodeEditor,
  type TreeNode,
  type CodeEditorState,
} from "../src/accessibility-patterns";

// ---------------------------------------------------------------------------
// HighContrastDetector
// ---------------------------------------------------------------------------

describe("HighContrastDetector", () => {
  it("detects high-contrast from media query", () => {
    const detector = new HighContrastDetector();
    expect(detector.detect({ matches: true })).toBe(true);
    expect(detector.detect({ matches: false })).toBe(false);
  });

  it("defaults to false without media query", () => {
    const detector = new HighContrastDetector();
    expect(detector.detect()).toBe(false);
  });

  it("supports forced value for testing", () => {
    const detector = new HighContrastDetector();
    detector.forceValue(true);
    expect(detector.detect()).toBe(true);
    detector.forceValue(false);
    expect(detector.detect()).toBe(false);
  });

  it("clears forced value", () => {
    const detector = new HighContrastDetector();
    detector.forceValue(true);
    detector.clearForce();
    expect(detector.detect()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ScreenReaderDescriptionBuilder
// ---------------------------------------------------------------------------

describe("ScreenReaderDescriptionBuilder", () => {
  const builder = new ScreenReaderDescriptionBuilder();

  it("builds basic description", () => {
    const desc = builder.describe({ type: "button", label: "Run" });
    expect(desc).toContain("Run");
    expect(desc).toContain("button");
  });

  it("includes state", () => {
    const desc = builder.describe({ type: "button", label: "Run", state: "disabled" });
    expect(desc).toContain("disabled");
  });

  it("includes value", () => {
    const desc = builder.describe({ type: "slider", label: "Volume", value: "75" });
    expect(desc).toContain("value: 75");
  });

  it("includes position", () => {
    const desc = builder.describe({
      type: "treeitem",
      label: "Cat",
      position: { index: 2, total: 5 },
    });
    expect(desc).toContain("2 of 5");
  });

  it("includes shortcut", () => {
    const desc = builder.describe({ type: "button", label: "Run", shortcut: "Ctrl+R" });
    expect(desc).toContain("shortcut: Ctrl+R");
  });

  it("includes hint", () => {
    const desc = builder.describe({ type: "panel", label: "Code", hint: "Double-click to maximize" });
    expect(desc).toContain("Double-click to maximize");
  });

  it("builds concise label", () => {
    const lbl = builder.label({ type: "button", label: "Save", state: "active" });
    expect(lbl).toBe("Save, active");
  });

  it("builds label without state", () => {
    const lbl = builder.label({ type: "button", label: "Save" });
    expect(lbl).toBe("Save");
  });
});

// ---------------------------------------------------------------------------
// AccessibleDragDrop
// ---------------------------------------------------------------------------

describe("AccessibleDragDrop", () => {
  it("announces pick-up", () => {
    const dnd = new AccessibleDragDrop();
    dnd.announcePickUp("Cat entity");
    expect(dnd.isDragActive).toBe(true);
    expect(dnd.liveRegion.text).toContain("Picked up Cat entity");
  });

  it("announces target with can-drop", () => {
    const dnd = new AccessibleDragDrop();
    dnd.announcePickUp("Cat");
    dnd.announceTarget("Scene Editor", true);
    const history = dnd.liveRegion.history;
    const last = history[history.length - 1];
    expect(last.text).toContain("Over Scene Editor");
    expect(last.text).toContain("Enter to drop");
  });

  it("announces target with cannot-drop", () => {
    const dnd = new AccessibleDragDrop();
    dnd.announcePickUp("Cat");
    dnd.announceTarget("Code Panel", false);
    const history = dnd.liveRegion.history;
    const last = history[history.length - 1];
    expect(last.text).toContain("drop not allowed");
  });

  it("announces drop", () => {
    const dnd = new AccessibleDragDrop();
    dnd.announcePickUp("Cat");
    dnd.announceDrop("Scene Editor");
    expect(dnd.isDragActive).toBe(false);
    expect(dnd.liveRegion.text).toContain("Dropped Cat on Scene Editor");
  });

  it("announces cancel", () => {
    const dnd = new AccessibleDragDrop();
    dnd.announcePickUp("Cat");
    dnd.announceCancel();
    expect(dnd.isDragActive).toBe(false);
    expect(dnd.liveRegion.text).toContain("cancelled");
  });

  it("ignores target announcement when no drag active", () => {
    const dnd = new AccessibleDragDrop();
    dnd.announceTarget("Scene", true);
    expect(dnd.liveRegion.text).toBe("");
  });
});

// ---------------------------------------------------------------------------
// AccessibleTreeView
// ---------------------------------------------------------------------------

describe("AccessibleTreeView", () => {
  const tree: TreeNode[] = [
    {
      id: "scene",
      label: "Scene",
      role: "scene",
      expanded: true,
      children: [
        { id: "alice", label: "Alice", role: "actor" },
        { id: "cat", label: "Cat", role: "actor", selected: true },
      ],
    },
    {
      id: "camera",
      label: "Camera",
      role: "camera",
    },
  ];

  it("builds attributes for tree nodes", () => {
    const view = new AccessibleTreeView();
    const attrs = view.buildNodeAttributes(tree[0], 1, 1, 2, false);
    expect(attrs.role).toBe("treeitem");
    expect(attrs["aria-level"]).toBe(1);
    expect(attrs["aria-setsize"]).toBe(2);
    expect(attrs["aria-posinset"]).toBe(1);
    expect(attrs["aria-expanded"]).toBe("true");
    expect(attrs.tabindex).toBe("-1");
  });

  it("sets tabindex 0 for active item", () => {
    const view = new AccessibleTreeView();
    const attrs = view.buildNodeAttributes(tree[0], 1, 1, 2, true);
    expect(attrs.tabindex).toBe("0");
  });

  it("includes aria-selected when set", () => {
    const view = new AccessibleTreeView();
    const selected = tree[0].children![1]; // Cat, selected=true
    const attrs = view.buildNodeAttributes(selected, 2, 2, 2, false);
    expect(attrs["aria-selected"]).toBe("true");
  });

  it("omits aria-expanded for leaf nodes", () => {
    const view = new AccessibleTreeView();
    const leaf: TreeNode = { id: "leaf", label: "Leaf" };
    const attrs = view.buildNodeAttributes(leaf, 1, 1, 1, false);
    expect(attrs["aria-expanded"]).toBeUndefined();
  });

  it("builds all node attributes with nesting", () => {
    const view = new AccessibleTreeView();
    view.setActiveItem("scene");
    const allAttrs = view.buildAll(tree);
    // scene + alice + cat + camera = 4
    expect(allAttrs.length).toBe(4);
    expect(allAttrs[0]["aria-level"]).toBe(1);
    expect(allAttrs[1]["aria-level"]).toBe(2); // alice
    expect(allAttrs[2]["aria-level"]).toBe(2); // cat
    expect(allAttrs[3]["aria-level"]).toBe(1); // camera
  });

  it("skips collapsed children", () => {
    const collapsed: TreeNode[] = [
      {
        id: "scene",
        label: "Scene",
        expanded: false,
        children: [{ id: "alice", label: "Alice" }],
      },
    ];
    const view = new AccessibleTreeView();
    const allAttrs = view.buildAll(collapsed);
    expect(allAttrs.length).toBe(1); // only scene, alice is hidden
  });

  it("announces expand/collapse", () => {
    const view = new AccessibleTreeView();
    view.announceToggle(tree[0], true);
    expect(view.liveRegion.text).toContain("Scene expanded");
    expect(view.liveRegion.text).toContain("2 items");
  });

  it("announces focus", () => {
    const view = new AccessibleTreeView();
    view.announceFocus(tree[0], 1);
    expect(view.liveRegion.text).toContain("Scene");
    expect(view.liveRegion.text).toContain("level 1");
  });
});

// ---------------------------------------------------------------------------
// AccessibleCodeEditor
// ---------------------------------------------------------------------------

describe("AccessibleCodeEditor", () => {
  const state: CodeEditorState = {
    lineCount: 42,
    cursorLine: 10,
    cursorColumn: 5,
    selectionActive: false,
    language: "Tweedle",
  };

  it("builds editor attributes", () => {
    const editor = new AccessibleCodeEditor();
    const attrs = editor.buildAttributes("Main Method", state);
    expect(attrs.role).toBe("textbox");
    expect(attrs["aria-multiline"]).toBe("true");
    expect(attrs["aria-label"]).toBe("Main Method");
    expect(attrs["aria-description"]).toContain("Tweedle code editor");
    expect(attrs["aria-description"]).toContain("42 lines");
    expect(attrs.tabindex).toBe("0");
  });

  it("includes readonly when set", () => {
    const editor = new AccessibleCodeEditor();
    const readOnlyState: CodeEditorState = { ...state, readOnly: true };
    const attrs = editor.buildAttributes("Viewer", readOnlyState);
    expect(attrs["aria-readonly"]).toBe("true");
  });

  it("announces cursor move", () => {
    const editor = new AccessibleCodeEditor();
    editor.announceCursorMove(15, 8);
    expect(editor.liveRegion.text).toContain("Line 15, column 8");
  });

  it("announces selection", () => {
    const editor = new AccessibleCodeEditor();
    editor.announceSelection(3);
    expect(editor.liveRegion.text).toContain("3 lines selected");
  });

  it("announces selection cleared", () => {
    const editor = new AccessibleCodeEditor();
    editor.announceSelection(0);
    expect(editor.liveRegion.text).toContain("Selection cleared");
  });

  it("announces errors assertively", () => {
    const editor = new AccessibleCodeEditor();
    editor.announceError(5, "Syntax error");
    const msg = editor.liveRegion.currentMessage;
    expect(msg!.priority).toBe("assertive");
    expect(msg!.text).toContain("Error on line 5");
  });

  it("announces code actions", () => {
    const editor = new AccessibleCodeEditor();
    editor.announceAction("Code indented");
    expect(editor.liveRegion.text).toBe("Code indented");
  });
});
