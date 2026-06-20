/**
 * Tests for expanded IDE command operations from issue #88's "What Would Add Value" section.
 *
 * Covers: code editing commands, view/navigation commands, search commands,
 * camera commands, entity transform commands, selection commands, and
 * the command-action registry.
 */
import { describe, expect, it, vi } from "vitest";
import { UndoRedoManager } from "../src/undo-redo";
import {
  IndentCommand,
  DedentCommand,
  ToggleCommentCommand,
  SortStatementsCommand,
  SwitchPerspectiveCommand,
  TogglePanelCommand,
  GoToLineCommand,
  FindInCodeCommand,
  ReplaceInCodeCommand,
  CameraBookmarkStore,
  StoreCameraBookmarkCommand,
  RestoreCameraBookmarkCommand,
  FocusOnEntityCommand,
  ResetEntityTransformCommand,
  LockEntityCommand,
  UnlockEntityCommand,
  AlignEntitiesCommand,
  DistributeEntitiesCommand,
  InvertSelectionCommand,
  SelectByTypeCommand,
  CommandActionRegistry,
  type CodeEditorReceiver,
  type PerspectiveReceiver,
  type PanelReceiver,
  type CameraReceiver,
  type EntityTransformReceiver,
  type SearchReceiver,
} from "../src/ide-command-registry";

// ---------------------------------------------------------------------------
// Test Helpers: Fake Receivers
// ---------------------------------------------------------------------------

function createFakeEditor(content = ""): CodeEditorReceiver {
  let _content = content;
  let _selStart = 0;
  let _selEnd = 0;
  return {
    get content() { return _content; },
    setContent(c: string) { _content = c; },
    getSelection() { return { start: _selStart, end: _selEnd }; },
    setSelection(s: number, e: number) { _selStart = s; _selEnd = e; },
    insertAt(offset: number, text: string) {
      _content = _content.slice(0, offset) + text + _content.slice(offset);
    },
    deleteRange(start: number, end: number) {
      const deleted = _content.slice(start, end);
      _content = _content.slice(0, start) + _content.slice(end);
      return deleted;
    },
    getLineCount() { return _content.split("\n").length; },
    getLineContent(line: number) { return _content.split("\n")[line - 1] ?? ""; },
  };
}

function createFakePerspective(active = "code", available = ["code", "scene", "run"]): PerspectiveReceiver {
  let _active = active;
  return {
    get activePerspective() { return _active; },
    switchTo(id: string) { _active = id; },
    get availablePerspectives() { return available; },
  };
}

function createFakePanel(): PanelReceiver {
  const visible = new Set<string>(["sidebar"]);
  return {
    isPanelVisible(id: string) { return visible.has(id); },
    showPanel(id: string) { visible.add(id); },
    hidePanel(id: string) { visible.delete(id); },
  };
}

function createFakeCamera(pos = { x: 0, y: 5, z: 10 }, rot = { x: 0, y: 0, z: 0 }): CameraReceiver {
  const _pos = { ...pos };
  const _rot = { ...rot };
  return {
    get position() { return { ..._pos }; },
    get rotation() { return { ..._rot }; },
    setPosition(x, y, z) { _pos.x = x; _pos.y = y; _pos.z = z; },
    setRotation(x, y, z) { _rot.x = x; _rot.y = y; _rot.z = z; },
    lookAt(x, y, z) { _rot.x = x; _rot.y = y; _rot.z = z; },
  };
}

function createFakeTransforms(): EntityTransformReceiver & { entities: Map<string, any> } {
  const entities = new Map<string, { pos: { x: number; y: number; z: number }; rot: { x: number; y: number; z: number }; scale: { x: number; y: number; z: number }; locked: boolean }>();
  entities.set("alice", { pos: { x: 1, y: 0, z: 0 }, rot: { x: 0, y: 45, z: 0 }, scale: { x: 1, y: 1, z: 1 }, locked: false });
  entities.set("cat", { pos: { x: 3, y: 0, z: 2 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 2, y: 2, z: 2 }, locked: false });
  entities.set("dog", { pos: { x: 5, y: 0, z: 4 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, locked: true });
  return {
    entities,
    getEntityPosition(name) { const e = entities.get(name); return e ? { ...e.pos } : null; },
    setEntityPosition(name, x, y, z) { const e = entities.get(name); if (e) e.pos = { x, y, z }; },
    getEntityRotation(name) { const e = entities.get(name); return e ? { ...e.rot } : null; },
    setEntityRotation(name, x, y, z) { const e = entities.get(name); if (e) e.rot = { x, y, z }; },
    getEntityScale(name) { const e = entities.get(name); return e ? { ...e.scale } : null; },
    setEntityScale(name, x, y, z) { const e = entities.get(name); if (e) e.scale = { x, y, z }; },
    isEntityLocked(name) { return entities.get(name)?.locked ?? false; },
    setEntityLocked(name, locked) { const e = entities.get(name); if (e) e.locked = locked; },
  };
}

function createFakeSearch(editor: CodeEditorReceiver): SearchReceiver {
  let _results: { line: number; column: number; length: number; text: string }[] = [];
  return {
    get results() { return _results; },
    search(query) {
      _results = [];
      const lines = editor.content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const col = lines[i].indexOf(query);
        if (col >= 0) {
          _results.push({ line: i + 1, column: col, length: query.length, text: lines[i] });
        }
      }
      return _results;
    },
    replace(query, replacement) {
      const content = editor.content;
      const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      let count = 0;
      const newContent = content.replace(regex, () => { count++; return replacement; });
      editor.setContent(newContent);
      return count;
    },
    clearResults() { _results = []; },
  };
}

function createFakeSelection(): { model: import("../src/ide-command-operations").SelectionModel } {
  const selected = new Set<string>();
  return {
    model: {
      get selected() { return selected as ReadonlySet<string>; },
      select(names: Iterable<string>) { for (const n of names) selected.add(n); },
      deselect(names: Iterable<string>) { for (const n of names) selected.delete(n); },
      clear() { selected.clear(); },
    },
  };
}

// ---------------------------------------------------------------------------
// Code Editing Commands
// ---------------------------------------------------------------------------

describe("IndentCommand", () => {
  it("indents all lines", () => {
    const editor = createFakeEditor("line1\nline2\nline3");
    const cmd = new IndentCommand(editor);
    cmd.execute();
    expect(editor.content).toBe("  line1\n  line2\n  line3");
  });

  it("undoes indent", () => {
    const editor = createFakeEditor("line1\nline2");
    const cmd = new IndentCommand(editor);
    cmd.execute();
    cmd.undo();
    expect(editor.content).toBe("line1\nline2");
  });
});

describe("DedentCommand", () => {
  it("removes leading whitespace", () => {
    const editor = createFakeEditor("  line1\n  line2");
    const cmd = new DedentCommand(editor);
    cmd.execute();
    expect(editor.content).toBe("line1\nline2");
  });

  it("does not remove non-indented lines", () => {
    const editor = createFakeEditor("line1\n  line2");
    const cmd = new DedentCommand(editor);
    cmd.execute();
    expect(editor.content).toBe("line1\nline2");
  });

  it("undoes dedent", () => {
    const editor = createFakeEditor("  line1");
    const cmd = new DedentCommand(editor);
    cmd.execute();
    cmd.undo();
    expect(editor.content).toBe("  line1");
  });
});

describe("ToggleCommentCommand", () => {
  it("comments uncommented lines", () => {
    const editor = createFakeEditor("a\nb");
    const cmd = new ToggleCommentCommand(editor);
    cmd.execute();
    expect(editor.content).toBe("// a\n// b");
  });

  it("uncomments commented lines", () => {
    const editor = createFakeEditor("// a\n// b");
    const cmd = new ToggleCommentCommand(editor);
    cmd.execute();
    expect(editor.content).toBe("a\nb");
  });

  it("undoes toggle", () => {
    const editor = createFakeEditor("a\nb");
    const cmd = new ToggleCommentCommand(editor);
    cmd.execute();
    cmd.undo();
    expect(editor.content).toBe("a\nb");
  });
});

describe("SortStatementsCommand", () => {
  it("sorts lines alphabetically", () => {
    const editor = createFakeEditor("banana\napple\ncherry");
    const cmd = new SortStatementsCommand(editor);
    cmd.execute();
    expect(editor.content).toBe("apple\nbanana\ncherry");
  });

  it("undoes sort", () => {
    const editor = createFakeEditor("banana\napple");
    const cmd = new SortStatementsCommand(editor);
    cmd.execute();
    cmd.undo();
    expect(editor.content).toBe("banana\napple");
  });
});

// ---------------------------------------------------------------------------
// View / Navigation Commands (non-undoable)
// ---------------------------------------------------------------------------

describe("SwitchPerspectiveCommand", () => {
  it("switches perspective", () => {
    const receiver = createFakePerspective("code");
    const cmd = new SwitchPerspectiveCommand(receiver, "scene");
    cmd.execute();
    expect(receiver.activePerspective).toBe("scene");
  });

  it("is non-undoable", () => {
    const receiver = createFakePerspective();
    const cmd = new SwitchPerspectiveCommand(receiver, "scene");
    expect(cmd.undoable).toBe(false);
  });

  it("throws a clear error if undo is called directly", () => {
    const receiver = createFakePerspective();
    const cmd = new SwitchPerspectiveCommand(receiver, "scene");
    expect(() => cmd.undo()).toThrow("non-undoable; UndoRedoManager skips it");
  });

  it("throws for unknown perspective", () => {
    const receiver = createFakePerspective();
    const cmd = new SwitchPerspectiveCommand(receiver, "nonexistent");
    expect(() => cmd.execute()).toThrow("Unknown perspective");
  });

  it("non-undoable commands skip undo stack", () => {
    const mgr = new UndoRedoManager();
    const receiver = createFakePerspective();
    const cmd = new SwitchPerspectiveCommand(receiver, "scene");
    mgr.execute(cmd);
    expect(mgr.canUndo).toBe(false);
  });
});

describe("TogglePanelCommand", () => {
  it("hides visible panel", () => {
    const receiver = createFakePanel();
    expect(receiver.isPanelVisible("sidebar")).toBe(true);
    const cmd = new TogglePanelCommand(receiver, "sidebar");
    cmd.execute();
    expect(receiver.isPanelVisible("sidebar")).toBe(false);
  });

  it("shows hidden panel", () => {
    const receiver = createFakePanel();
    const cmd = new TogglePanelCommand(receiver, "console");
    cmd.execute();
    expect(receiver.isPanelVisible("console")).toBe(true);
  });

  it("is non-undoable", () => {
    const receiver = createFakePanel();
    const cmd = new TogglePanelCommand(receiver, "sidebar");
    expect(cmd.undoable).toBe(false);
  });

  it("throws a clear error if undo is called directly", () => {
    const receiver = createFakePanel();
    const cmd = new TogglePanelCommand(receiver, "sidebar");
    expect(() => cmd.undo()).toThrow("non-undoable; UndoRedoManager skips it");
  });
});

describe("GoToLineCommand", () => {
  it("sets cursor to line start", () => {
    const editor = createFakeEditor("line1\nline2\nline3");
    const cmd = new GoToLineCommand(editor, 2);
    cmd.execute();
    const sel = editor.getSelection();
    expect(sel.start).toBe(6); // "line1\n" = 6 chars
    expect(sel.end).toBe(6);
  });

  it("throws for out-of-range line", () => {
    const editor = createFakeEditor("line1");
    const cmd = new GoToLineCommand(editor, 5);
    expect(() => cmd.execute()).toThrow("out of range");
  });

  it("is non-undoable", () => {
    const cmd = new GoToLineCommand(createFakeEditor("a"), 1);
    expect(cmd.undoable).toBe(false);
  });

  it("throws a clear error if undo is called directly", () => {
    const cmd = new GoToLineCommand(createFakeEditor("a"), 1);
    expect(() => cmd.undo()).toThrow("non-undoable; UndoRedoManager skips it");
  });
});

// ---------------------------------------------------------------------------
// Search Commands
// ---------------------------------------------------------------------------

describe("FindInCodeCommand", () => {
  it("finds matches", () => {
    const editor = createFakeEditor("foo bar\nbaz foo");
    const search = createFakeSearch(editor);
    const cmd = new FindInCodeCommand(search, "foo");
    cmd.execute();
    expect(cmd.results.length).toBe(2);
  });

  it("is non-undoable", () => {
    const editor = createFakeEditor("a");
    const search = createFakeSearch(editor);
    const cmd = new FindInCodeCommand(search, "a");
    expect(cmd.undoable).toBe(false);
  });

  it("throws a clear error if undo is called directly", () => {
    const editor = createFakeEditor("a");
    const search = createFakeSearch(editor);
    const cmd = new FindInCodeCommand(search, "a");
    expect(() => cmd.undo()).toThrow("non-undoable; UndoRedoManager skips it");
  });
});

describe("ReplaceInCodeCommand", () => {
  it("replaces all occurrences", () => {
    const editor = createFakeEditor("foo bar foo");
    const search = createFakeSearch(editor);
    const cmd = new ReplaceInCodeCommand(editor, search, "foo", "baz");
    cmd.execute();
    expect(editor.content).toBe("baz bar baz");
    expect(cmd.count).toBe(2);
  });

  it("undoes replace", () => {
    const editor = createFakeEditor("foo bar");
    const search = createFakeSearch(editor);
    const cmd = new ReplaceInCodeCommand(editor, search, "foo", "baz");
    cmd.execute();
    cmd.undo();
    expect(editor.content).toBe("foo bar");
  });
});

// ---------------------------------------------------------------------------
// Camera Commands
// ---------------------------------------------------------------------------

describe("CameraBookmarkStore", () => {
  it("stores and retrieves bookmarks", () => {
    const store = new CameraBookmarkStore();
    store.save("home", { x: 0, y: 5, z: 10 }, { x: 0, y: 0, z: 0 });
    const bm = store.get("home");
    expect(bm).not.toBeNull();
    expect(bm!.position.y).toBe(5);
  });

  it("lists bookmarks", () => {
    const store = new CameraBookmarkStore();
    store.save("a", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    store.save("b", { x: 1, y: 1, z: 1 }, { x: 0, y: 0, z: 0 });
    expect(store.list().length).toBe(2);
  });

  it("deletes bookmarks", () => {
    const store = new CameraBookmarkStore();
    store.save("a", { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    expect(store.delete("a")).toBe(true);
    expect(store.get("a")).toBeNull();
  });
});

describe("StoreCameraBookmarkCommand", () => {
  it("stores current camera position", () => {
    const store = new CameraBookmarkStore();
    const camera = createFakeCamera({ x: 1, y: 2, z: 3 }, { x: 10, y: 20, z: 30 });
    const cmd = new StoreCameraBookmarkCommand(store, camera, "test");
    cmd.execute();
    const bm = store.get("test");
    expect(bm!.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("undoes by removing bookmark", () => {
    const store = new CameraBookmarkStore();
    const camera = createFakeCamera();
    const cmd = new StoreCameraBookmarkCommand(store, camera, "test");
    cmd.execute();
    cmd.undo();
    expect(store.get("test")).toBeNull();
  });

  it("undoes by restoring previous bookmark", () => {
    const store = new CameraBookmarkStore();
    store.save("test", { x: 99, y: 99, z: 99 }, { x: 0, y: 0, z: 0 });
    const camera = createFakeCamera({ x: 1, y: 2, z: 3 });
    const cmd = new StoreCameraBookmarkCommand(store, camera, "test");
    cmd.execute();
    cmd.undo();
    expect(store.get("test")!.position.x).toBe(99);
  });
});

describe("RestoreCameraBookmarkCommand", () => {
  it("restores camera from bookmark", () => {
    const store = new CameraBookmarkStore();
    store.save("home", { x: 10, y: 20, z: 30 }, { x: 1, y: 2, z: 3 });
    const camera = createFakeCamera();
    const cmd = new RestoreCameraBookmarkCommand(store, camera, "home");
    cmd.execute();
    expect(camera.position).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("undoes by restoring previous camera position", () => {
    const store = new CameraBookmarkStore();
    store.save("home", { x: 10, y: 20, z: 30 }, { x: 1, y: 2, z: 3 });
    const camera = createFakeCamera({ x: 0, y: 5, z: 10 }, { x: 0, y: 0, z: 0 });
    const cmd = new RestoreCameraBookmarkCommand(store, camera, "home");
    cmd.execute();
    cmd.undo();
    expect(camera.position).toEqual({ x: 0, y: 5, z: 10 });
  });

  it("throws for missing bookmark", () => {
    const store = new CameraBookmarkStore();
    const camera = createFakeCamera();
    const cmd = new RestoreCameraBookmarkCommand(store, camera, "missing");
    expect(() => cmd.execute()).toThrow("not found");
  });
});

describe("FocusOnEntityCommand", () => {
  it("moves camera toward entity", () => {
    const camera = createFakeCamera();
    const transforms = createFakeTransforms();
    const cmd = new FocusOnEntityCommand(camera, transforms, "alice", 5);
    cmd.execute();
    expect(camera.position.x).toBe(1);
    expect(camera.position.y).toBe(5);
    expect(camera.position.z).toBe(5);
  });

  it("undoes focus", () => {
    const camera = createFakeCamera({ x: 0, y: 5, z: 10 }, { x: 0, y: 0, z: 0 });
    const transforms = createFakeTransforms();
    const cmd = new FocusOnEntityCommand(camera, transforms, "alice");
    cmd.execute();
    cmd.undo();
    expect(camera.position).toEqual({ x: 0, y: 5, z: 10 });
  });

  it("throws for missing entity", () => {
    const camera = createFakeCamera();
    const transforms = createFakeTransforms();
    const cmd = new FocusOnEntityCommand(camera, transforms, "nonexistent");
    expect(() => cmd.execute()).toThrow("not found");
  });
});

// ---------------------------------------------------------------------------
// Entity Transform Commands
// ---------------------------------------------------------------------------

describe("ResetEntityTransformCommand", () => {
  it("resets position, rotation, and scale to defaults", () => {
    const transforms = createFakeTransforms();
    const cmd = new ResetEntityTransformCommand(transforms, "alice");
    cmd.execute();
    expect(transforms.getEntityPosition("alice")).toEqual({ x: 0, y: 0, z: 0 });
    expect(transforms.getEntityRotation("alice")).toEqual({ x: 0, y: 0, z: 0 });
    expect(transforms.getEntityScale("alice")).toEqual({ x: 1, y: 1, z: 1 });
  });

  it("undoes reset", () => {
    const transforms = createFakeTransforms();
    const cmd = new ResetEntityTransformCommand(transforms, "alice");
    cmd.execute();
    cmd.undo();
    expect(transforms.getEntityPosition("alice")).toEqual({ x: 1, y: 0, z: 0 });
    expect(transforms.getEntityRotation("alice")).toEqual({ x: 0, y: 45, z: 0 });
  });

  it("throws for missing entity", () => {
    const transforms = createFakeTransforms();
    const cmd = new ResetEntityTransformCommand(transforms, "nonexistent");
    expect(() => cmd.execute()).toThrow("not found");
  });
});

describe("LockEntityCommand / UnlockEntityCommand", () => {
  it("locks an entity", () => {
    const transforms = createFakeTransforms();
    const cmd = new LockEntityCommand(transforms, "alice");
    cmd.execute();
    expect(transforms.isEntityLocked("alice")).toBe(true);
  });

  it("undoes lock", () => {
    const transforms = createFakeTransforms();
    const cmd = new LockEntityCommand(transforms, "alice");
    cmd.execute();
    cmd.undo();
    expect(transforms.isEntityLocked("alice")).toBe(false);
  });

  it("unlocks an entity", () => {
    const transforms = createFakeTransforms();
    const cmd = new UnlockEntityCommand(transforms, "dog");
    cmd.execute();
    expect(transforms.isEntityLocked("dog")).toBe(false);
  });

  it("undoes unlock", () => {
    const transforms = createFakeTransforms();
    const cmd = new UnlockEntityCommand(transforms, "dog");
    cmd.execute();
    cmd.undo();
    expect(transforms.isEntityLocked("dog")).toBe(true);
  });
});

describe("AlignEntitiesCommand", () => {
  it("aligns entities to first entity's x position", () => {
    const transforms = createFakeTransforms();
    const cmd = new AlignEntitiesCommand(transforms, ["alice", "cat", "dog"], "x", "first");
    cmd.execute();
    expect(transforms.getEntityPosition("cat")!.x).toBe(1);
    expect(transforms.getEntityPosition("dog")!.x).toBe(1);
  });

  it("aligns to center", () => {
    const transforms = createFakeTransforms();
    const cmd = new AlignEntitiesCommand(transforms, ["alice", "cat", "dog"], "x", "center");
    cmd.execute();
    const avg = (1 + 3 + 5) / 3;
    expect(transforms.getEntityPosition("alice")!.x).toBe(avg);
    expect(transforms.getEntityPosition("cat")!.x).toBe(avg);
  });

  it("undoes alignment", () => {
    const transforms = createFakeTransforms();
    const cmd = new AlignEntitiesCommand(transforms, ["alice", "cat"], "x");
    cmd.execute();
    cmd.undo();
    expect(transforms.getEntityPosition("alice")!.x).toBe(1);
    expect(transforms.getEntityPosition("cat")!.x).toBe(3);
  });
});

describe("DistributeEntitiesCommand", () => {
  it("distributes entities evenly along x axis", () => {
    const transforms = createFakeTransforms();
    // alice=1, cat=3, dog=5 — already sorted, middle should stay at 3
    const cmd = new DistributeEntitiesCommand(transforms, ["alice", "cat", "dog"], "x");
    cmd.execute();
    // first=1, last=5, step=2 → middle should be 3
    expect(transforms.getEntityPosition("cat")!.x).toBe(3);
  });

  it("distributes unevenly spaced entities", () => {
    const transforms = createFakeTransforms();
    transforms.setEntityPosition("cat", 10, 0, 0); // now: alice=1, cat=10, dog=5
    const cmd = new DistributeEntitiesCommand(transforms, ["alice", "cat", "dog"], "x");
    cmd.execute();
    // sorted: alice=1, dog=5, cat=10 → step=4.5 → dog should be at 5.5
    expect(transforms.getEntityPosition("dog")!.x).toBeCloseTo(5.5);
  });

  it("undoes distribution", () => {
    const transforms = createFakeTransforms();
    const cmd = new DistributeEntitiesCommand(transforms, ["alice", "cat", "dog"], "x");
    cmd.execute();
    cmd.undo();
    expect(transforms.getEntityPosition("alice")!.x).toBe(1);
    expect(transforms.getEntityPosition("cat")!.x).toBe(3);
    expect(transforms.getEntityPosition("dog")!.x).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Selection Commands
// ---------------------------------------------------------------------------

describe("InvertSelectionCommand", () => {
  it("inverts selection", () => {
    const { model } = createFakeSelection();
    model.select(["alice"]);
    const cmd = new InvertSelectionCommand(model, ["alice", "cat", "dog"]);
    cmd.execute();
    expect(model.selected.has("cat")).toBe(true);
    expect(model.selected.has("dog")).toBe(true);
    expect(model.selected.has("alice")).toBe(false);
  });

  it("undoes invert", () => {
    const { model } = createFakeSelection();
    model.select(["alice"]);
    const cmd = new InvertSelectionCommand(model, ["alice", "cat", "dog"]);
    cmd.execute();
    cmd.undo();
    expect(model.selected.has("alice")).toBe(true);
    expect(model.selected.has("cat")).toBe(false);
  });
});

describe("SelectByTypeCommand", () => {
  it("selects entities matching a type filter", () => {
    const { model } = createFakeSelection();
    const isAnimal = (name: string) => name === "cat" || name === "dog";
    const cmd = new SelectByTypeCommand(model, isAnimal, ["alice", "cat", "dog"], "animal");
    cmd.execute();
    expect(model.selected.has("cat")).toBe(true);
    expect(model.selected.has("dog")).toBe(true);
    expect(model.selected.has("alice")).toBe(false);
  });

  it("undoes type selection", () => {
    const { model } = createFakeSelection();
    model.select(["alice"]);
    const isAnimal = (name: string) => name === "cat" || name === "dog";
    const cmd = new SelectByTypeCommand(model, isAnimal, ["alice", "cat", "dog"]);
    cmd.execute();
    cmd.undo();
    expect(model.selected.has("alice")).toBe(true);
    expect(model.selected.has("cat")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Command-Action Registry
// ---------------------------------------------------------------------------

describe("CommandActionRegistry", () => {
  it("registers and creates commands", () => {
    const registry = new CommandActionRegistry();
    const editor = createFakeEditor("test");
    registry.register("indent", () => new IndentCommand(editor));
    const cmd = registry.create("indent");
    expect(cmd).not.toBeNull();
    expect(cmd!.description).toBe("Indent all lines");
  });

  it("returns null for unknown actions", () => {
    const registry = new CommandActionRegistry();
    expect(registry.create("unknown")).toBeNull();
  });

  it("unregisters actions", () => {
    const registry = new CommandActionRegistry();
    registry.register("test", () => new IndentCommand(createFakeEditor()));
    expect(registry.unregister("test")).toBe(true);
    expect(registry.has("test")).toBe(false);
  });

  it("lists registered action IDs", () => {
    const registry = new CommandActionRegistry();
    registry.register("a", () => new IndentCommand(createFakeEditor()));
    registry.register("b", () => new DedentCommand(createFakeEditor()));
    expect(registry.list()).toEqual(["a", "b"]);
  });
});

// ---------------------------------------------------------------------------
// UndoRedoManager integration
// ---------------------------------------------------------------------------

describe("UndoRedoManager integration with expanded commands", () => {
  it("undoable commands enter undo stack", () => {
    const mgr = new UndoRedoManager();
    const editor = createFakeEditor("hello");
    mgr.execute(new IndentCommand(editor));
    expect(mgr.canUndo).toBe(true);
    mgr.undo();
    expect(editor.content).toBe("hello");
  });

  it("non-undoable commands skip undo stack", () => {
    const mgr = new UndoRedoManager();
    const receiver = createFakePerspective();
    mgr.execute(new SwitchPerspectiveCommand(receiver, "scene"));
    expect(receiver.activePerspective).toBe("scene");
    expect(mgr.canUndo).toBe(false);
  });

  it("non-undoable commands do not clear redo stack", () => {
    const mgr = new UndoRedoManager();
    const editor = createFakeEditor("hello");
    mgr.execute(new IndentCommand(editor));
    mgr.undo();
    expect(mgr.canRedo).toBe(true);
    // Fire-and-forget command should not clear redo
    const receiver = createFakePerspective();
    mgr.execute(new SwitchPerspectiveCommand(receiver, "scene"));
    expect(mgr.canRedo).toBe(true);
  });
});
