import { describe, expect, it } from "vitest";
import {
  EditorState,
  IdeState,
  PerspectiveState,
  ProjectState,
  SelectionState,
  UndoRedoState,
} from "../src/alice-ide-state.js";
import { Operation, OperationHistory } from "../src/croquet-operations.js";

describe("alice-ide-state", () => {
  it("tracks the active perspective and remembers the previous one", () => {
    const perspective = new PerspectiveState();

    perspective.switchTo("scene").switchTo("run");

    expect(perspective.active).toBe("run");
    expect(perspective.previous).toBe("scene");
    expect(perspective.isActive("code")).toBe(false);
  });

  it("stores selections independently and clears them together", () => {
    const selection = new SelectionState<string, string, string>();

    selection.selectEntity("bunny").selectStatement("moveForward").selectType("SBiped");
    expect(selection.selectedEntity).toBe("bunny");
    expect(selection.selectedStatement).toBe("moveForward");
    expect(selection.selectedType).toBe("SBiped");

    selection.clear();
    expect(selection.selectedEntity).toBeNull();
    expect(selection.selectedStatement).toBeNull();
    expect(selection.selectedType).toBeNull();
  });

  it("normalizes editor cursor and zoom state", () => {
    const editor = new EditorState();

    editor.setMode("scene").setCursorPosition({ line: 12, column: 4, offset: 88 }).setZoomLevel(-5);

    expect(editor.mode).toBe("scene");
    expect(editor.cursorPosition).toEqual({ line: 12, column: 4, offset: 88 });
    expect(editor.zoomLevel).toBe(1);
  });

  it("opens marks saves and closes projects", () => {
    const state = new ProjectState<{ name: string }>();

    state.open({ name: "Round92" }, "/projects/round92.a3p").markDirty().markSaved("/projects/saved.a3p");
    expect(state.loadedProject).toEqual({ name: "Round92" });
    expect(state.dirty).toBe(false);
    expect(state.savePath).toBe("/projects/saved.a3p");

    state.close();
    expect(state.hasProject).toBe(false);
    expect(state.savePath).toBeNull();
  });

  it("proxies undo and redo state from a shared operation history", () => {
    const history = new OperationHistory();
    const values: string[] = [];
    const undoRedo = new UndoRedoState(history);
    const operation = new Operation("append", {
      execute: () => {
        values.push("draft");
      },
      undo: () => {
        values.pop();
      },
    });

    history.execute(operation);
    expect(undoRedo.canUndo).toBe(true);
    expect(undoRedo.undoDepth).toBe(1);

    undoRedo.undo();
    expect(values).toEqual([]);
    expect(undoRedo.canRedo).toBe(true);

    undoRedo.redo();
    expect(values).toEqual(["draft"]);
  });

  it("coordinates the centralized ide state", () => {
    const ide = new IdeState<{ name: string }, string, string, string>();
    const history = new OperationHistory();

    ide
      .openProject({ name: "Alice" }, "/projects/alice.a3p")
      .selectEntity("camera")
      .selectStatement("turn")
      .selectType("SCamera")
      .switchPerspective("scene")
      .setEditorMode("design")
      .setCursorPosition({ line: 3, column: 9 })
      .setZoomLevel(1.5)
      .attachHistory(history);

    expect(ide.project.loadedProject).toEqual({ name: "Alice" });
    expect(ide.selection.selectedEntity).toBe("camera");
    expect(ide.selection.selectedStatement).toBe("turn");
    expect(ide.selection.selectedType).toBe("SCamera");
    expect(ide.perspective.active).toBe("scene");
    expect(ide.editor.mode).toBe("design");
    expect(ide.editor.cursorPosition).toEqual({ line: 3, column: 9 });
    expect(ide.editor.zoomLevel).toBe(1.5);
    expect(ide.undoRedo.canUndo).toBe(false);

    ide.clearSelection();
    expect(ide.selection.selectedEntity).toBeNull();
  });
});
