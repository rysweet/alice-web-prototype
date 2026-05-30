import { describe, it, expect, beforeEach } from "vitest";
import {
  UndoRedoManager,
  CreateMethodCommand,
  DeleteMethodCommand,
  InsertStatementCommand,
  CompositeCommand,
} from "../src/undo-redo";
import { IdeState } from "../src/alice-ide-state";

// ---------------------------------------------------------------------------
// CreateMethodCommand
// ---------------------------------------------------------------------------

describe("CreateMethodCommand", () => {
  let procedures: Map<string, string[]>;
  let manager: UndoRedoManager;

  beforeEach(() => {
    procedures = new Map([["myFirstMethod", []]]);
    manager = new UndoRedoManager();
  });

  it("creates a new procedure", () => {
    const cmd = new CreateMethodCommand(procedures, "walkForward");
    manager.execute(cmd);
    expect(procedures.has("walkForward")).toBe(true);
    expect(procedures.get("walkForward")).toEqual([]);
  });

  it("creates a function", () => {
    const cmd = new CreateMethodCommand(procedures, "getDistance", true, "DecimalNumber");
    manager.execute(cmd);
    expect(procedures.has("getDistance")).toBe(true);
    expect(cmd.description).toContain("function");
  });

  it("throws on duplicate method name", () => {
    const cmd = new CreateMethodCommand(procedures, "myFirstMethod");
    expect(() => manager.execute(cmd)).toThrow("already exists");
  });

  it("undo removes the created method", () => {
    const cmd = new CreateMethodCommand(procedures, "newMethod");
    manager.execute(cmd);
    expect(procedures.has("newMethod")).toBe(true);
    manager.undo();
    expect(procedures.has("newMethod")).toBe(false);
  });

  it("redo re-creates the method", () => {
    const cmd = new CreateMethodCommand(procedures, "newMethod");
    manager.execute(cmd);
    manager.undo();
    manager.redo();
    expect(procedures.has("newMethod")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DeleteMethodCommand
// ---------------------------------------------------------------------------

describe("DeleteMethodCommand", () => {
  let procedures: Map<string, string[]>;
  let manager: UndoRedoManager;

  beforeEach(() => {
    procedures = new Map([
      ["myFirstMethod", ["step1", "step2"]],
      ["helper", ["doSomething"]],
    ]);
    manager = new UndoRedoManager();
  });

  it("deletes an existing method", () => {
    const cmd = new DeleteMethodCommand(procedures, "helper");
    manager.execute(cmd);
    expect(procedures.has("helper")).toBe(false);
  });

  it("throws when deleting non-existent method", () => {
    const cmd = new DeleteMethodCommand(procedures, "nonexistent");
    expect(() => manager.execute(cmd)).toThrow("not found");
  });

  it("undo restores deleted method with statements", () => {
    const cmd = new DeleteMethodCommand(procedures, "myFirstMethod");
    manager.execute(cmd);
    manager.undo();
    expect(procedures.has("myFirstMethod")).toBe(true);
    expect(procedures.get("myFirstMethod")).toEqual(["step1", "step2"]);
  });
});

// ---------------------------------------------------------------------------
// InsertStatementCommand
// ---------------------------------------------------------------------------

describe("InsertStatementCommand", () => {
  let procedures: Map<string, string[]>;
  let manager: UndoRedoManager;

  beforeEach(() => {
    procedures = new Map([["myFirstMethod", ["existing"]]]);
    manager = new UndoRedoManager();
  });

  it("inserts statement at beginning", () => {
    const cmd = new InsertStatementCommand(procedures, "myFirstMethod", 0, "first");
    manager.execute(cmd);
    expect(procedures.get("myFirstMethod")).toEqual(["first", "existing"]);
  });

  it("inserts statement at end", () => {
    const cmd = new InsertStatementCommand(procedures, "myFirstMethod", 100, "last");
    manager.execute(cmd);
    expect(procedures.get("myFirstMethod")).toEqual(["existing", "last"]);
  });

  it("throws for non-existent method", () => {
    const cmd = new InsertStatementCommand(procedures, "ghost", 0, "stmt");
    expect(() => manager.execute(cmd)).toThrow("not found");
  });

  it("undo removes inserted statement", () => {
    const cmd = new InsertStatementCommand(procedures, "myFirstMethod", 0, "inserted");
    manager.execute(cmd);
    expect(procedures.get("myFirstMethod")).toEqual(["inserted", "existing"]);
    manager.undo();
    expect(procedures.get("myFirstMethod")).toEqual(["existing"]);
  });

  it("handles negative index by clamping to 0", () => {
    const cmd = new InsertStatementCommand(procedures, "myFirstMethod", -5, "clamped");
    manager.execute(cmd);
    expect(procedures.get("myFirstMethod")![0]).toBe("clamped");
  });
});

// ---------------------------------------------------------------------------
// IdeState — project lifecycle
// ---------------------------------------------------------------------------

describe("IdeState — project lifecycle", () => {
  let ide: IdeState;

  beforeEach(() => {
    ide = new IdeState();
  });

  it("starts with no project", () => {
    expect(ide.hasProject).toBe(false);
    expect(ide.isDirty).toBe(false);
  });

  it("openProject sets project state", () => {
    ide.openProject({ name: "TestProject" }, "/path/to/project.a3p");
    expect(ide.hasProject).toBe(true);
    expect(ide.isDirty).toBe(false);
  });

  it("newProject creates fresh project state", () => {
    ide.openProject({ name: "Old" });
    ide.newProject("Fresh");
    expect(ide.hasProject).toBe(true);
    expect(ide.isDirty).toBe(false);
  });

  it("closeProject clears all state", () => {
    ide.openProject({ name: "Test" });
    ide.selectEntity("someEntity");
    ide.closeProject();
    expect(ide.hasProject).toBe(false);
    expect(ide.selection.selectedEntity).toBeNull();
  });

  it("markDirty sets dirty flag", () => {
    ide.openProject({ name: "Test" });
    ide.markDirty();
    expect(ide.isDirty).toBe(true);
  });

  it("saveProject clears dirty flag", () => {
    ide.openProject({ name: "Test" });
    ide.markDirty();
    ide.saveProject("/saved/path.a3p");
    expect(ide.isDirty).toBe(false);
  });

  it("full lifecycle: new → edit → save → close", () => {
    ide.newProject("MyProject");
    expect(ide.hasProject).toBe(true);

    ide.markDirty();
    expect(ide.isDirty).toBe(true);

    ide.saveProject("/projects/MyProject.a3p");
    expect(ide.isDirty).toBe(false);

    ide.closeProject();
    expect(ide.hasProject).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Composite operations with undo/redo
// ---------------------------------------------------------------------------

describe("Composite IDE operations", () => {
  it("creates method and inserts statement as composite", () => {
    const procedures = new Map<string, string[]>([["myFirstMethod", []]]);
    const manager = new UndoRedoManager();

    const composite = new CompositeCommand([
      new CreateMethodCommand(procedures, "newMethod"),
      new InsertStatementCommand(procedures, "newMethod", 0, "this.move()"),
    ]);

    manager.execute(composite);
    expect(procedures.has("newMethod")).toBe(true);
    expect(procedures.get("newMethod")).toEqual(["this.move()"]);

    manager.undo();
    expect(procedures.has("newMethod")).toBe(false);

    manager.redo();
    expect(procedures.has("newMethod")).toBe(true);
    expect(procedures.get("newMethod")).toEqual(["this.move()"]);
  });
});
