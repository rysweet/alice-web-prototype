import { describe, expect, it } from "vitest";
import {
  BatchCommand,
  ClearSceneCommand,
  DeleteStatementCommand,
  DuplicateEntityCommand,
  MoveStatementCommand,
  RenameEntityCommand,
  RenameMethodCommand,
  ReplaceStatementCommand,
  SelectionChangeCommand,
  SetCameraViewCommand,
  SetEntityOpacityCommand,
  SetPropertyCommand,
  SetScenePropertyCommand,
  SetVehicleCommand,
  SetVisibilityCommand,
  SwapEntityPositionsCommand,
  type EntityCloneFactory,
  type SelectionModel,
} from "../src/ide-command-operations";
import { UndoRedoManager } from "../src/undo-redo";
import { Scene } from "../src/story-api/scene";
import { SModel, SMovableTurnable, SProp } from "../src/story-api/entities";

function makeScene(...names: string[]): Scene {
  const scene = new Scene();
  for (const name of names) {
    scene.addEntity(name, new SModel());
  }
  return scene;
}

function makeProcedures(): Map<string, string[]> {
  const procs = new Map<string, string[]>();
  procs.set("myMethod", ["stmt-a", "stmt-b", "stmt-c"]);
  procs.set("helper", ["x", "y"]);
  return procs;
}

describe("ide-command-operations", () => {
  // ---------- Entity Commands ----------

  it("toggles entity visibility with undo", () => {
    const scene = makeScene("rabbit");
    const entity = scene.getEntity("rabbit")!;
    entity.isShowing = true;
    const manager = new UndoRedoManager();

    manager.execute(new SetVisibilityCommand(scene, "rabbit", false));
    expect(entity.isShowing).toBe(false);

    manager.undo();
    expect(entity.isShowing).toBe(true);
  });

  it("throws when visibility target is missing", () => {
    const scene = new Scene();
    expect(() => new SetVisibilityCommand(scene, "ghost", false).execute()).toThrow("not found");
  });

  it("renames an entity in the scene map with undo", () => {
    const scene = makeScene("oldName");
    const entity = scene.getEntity("oldName")!;
    const manager = new UndoRedoManager();

    manager.execute(new RenameEntityCommand(scene, "oldName", "newName"));
    expect(scene.getEntity("oldName")).toBeUndefined();
    expect(scene.getEntity("newName")).toBe(entity);

    manager.undo();
    expect(scene.getEntity("newName")).toBeUndefined();
    expect(scene.getEntity("oldName")).toBe(entity);
  });

  it("prevents rename to an existing name", () => {
    const scene = makeScene("a", "b");
    expect(() => new RenameEntityCommand(scene, "a", "b").execute()).toThrow("already exists");
  });

  it("duplicates an entity using a clone factory", () => {
    const scene = makeScene("original");
    const factory: EntityCloneFactory = {
      clone: () => new SProp(),
    };
    const manager = new UndoRedoManager();

    manager.execute(new DuplicateEntityCommand(scene, "original", "copy", factory));
    expect(scene.getEntity("copy")).toBeDefined();

    manager.undo();
    expect(scene.getEntity("copy")).toBeUndefined();
  });

  it("sets entity opacity with undo", () => {
    const target = { opacity: 1.0 };
    const manager = new UndoRedoManager();

    manager.execute(new SetEntityOpacityCommand(target, "box", 0.5));
    expect(target.opacity).toBe(0.5);

    manager.undo();
    expect(target.opacity).toBe(1.0);
  });

  it("changes vehicle/parent with undo", () => {
    const entity = new SModel();
    const parentA = new SModel();
    const parentB = new SModel();
    entity.vehicle = parentA;
    const manager = new UndoRedoManager();

    manager.execute(new SetVehicleCommand(entity, "entity", parentB));
    expect(entity.vehicle).toBe(parentB);

    manager.undo();
    expect(entity.vehicle).toBe(parentA);
  });

  it("swaps positions of two entities with undo", () => {
    const scene = new Scene();
    const a = new SModel();
    const b = new SModel();
    a.position = { x: 1, y: 2, z: 3 };
    b.position = { x: 4, y: 5, z: 6 };
    scene.addEntity("a", a);
    scene.addEntity("b", b);
    const manager = new UndoRedoManager();

    manager.execute(new SwapEntityPositionsCommand(scene, "a", "b"));
    expect(a.position).toEqual({ x: 4, y: 5, z: 6 });
    expect(b.position).toEqual({ x: 1, y: 2, z: 3 });

    manager.undo();
    expect(a.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(b.position).toEqual({ x: 4, y: 5, z: 6 });
  });

  // ---------- Statement / Method Commands ----------

  it("moves a statement within a method with undo", () => {
    const procs = makeProcedures();
    const manager = new UndoRedoManager();

    manager.execute(new MoveStatementCommand(procs, "myMethod", 0, 2));
    expect(procs.get("myMethod")).toEqual(["stmt-b", "stmt-c", "stmt-a"]);

    manager.undo();
    expect(procs.get("myMethod")).toEqual(["stmt-a", "stmt-b", "stmt-c"]);
  });

  it("deletes a statement with undo", () => {
    const procs = makeProcedures();
    const manager = new UndoRedoManager();

    manager.execute(new DeleteStatementCommand(procs, "myMethod", 1));
    expect(procs.get("myMethod")).toEqual(["stmt-a", "stmt-c"]);

    manager.undo();
    expect(procs.get("myMethod")).toEqual(["stmt-a", "stmt-b", "stmt-c"]);
  });

  it("replaces a statement with undo", () => {
    const procs = makeProcedures();
    const manager = new UndoRedoManager();

    manager.execute(new ReplaceStatementCommand(procs, "myMethod", 1, "new-stmt"));
    expect(procs.get("myMethod")).toEqual(["stmt-a", "new-stmt", "stmt-c"]);

    manager.undo();
    expect(procs.get("myMethod")).toEqual(["stmt-a", "stmt-b", "stmt-c"]);
  });

  it("renames a method with undo", () => {
    const procs = makeProcedures();
    const manager = new UndoRedoManager();

    manager.execute(new RenameMethodCommand(procs, "myMethod", "renamedMethod"));
    expect(procs.has("myMethod")).toBe(false);
    expect(procs.get("renamedMethod")).toEqual(["stmt-a", "stmt-b", "stmt-c"]);

    manager.undo();
    expect(procs.has("renamedMethod")).toBe(false);
    expect(procs.get("myMethod")).toEqual(["stmt-a", "stmt-b", "stmt-c"]);
  });

  // ---------- Selection Commands ----------

  it("changes selection with undo", () => {
    const model: SelectionModel = {
      selected: new Set<string>(),
      select(names) { for (const n of names) (this.selected as Set<string>).add(n); },
      deselect(names) { for (const n of names) (this.selected as Set<string>).delete(n); },
      clear() { (this.selected as Set<string>).clear(); },
    };
    model.select(["a", "b"]);
    const manager = new UndoRedoManager();

    manager.execute(new SelectionChangeCommand(model, new Set(["c"])));
    expect([...model.selected]).toEqual(["c"]);

    manager.undo();
    expect([...model.selected].sort()).toEqual(["a", "b"]);
  });

  // ---------- Scene Commands ----------

  it("sets a scene property with undo", () => {
    const scene = makeScene("rabbit");
    scene.atmosphereColor = "#0000ff";
    const manager = new UndoRedoManager();

    manager.execute(new SetScenePropertyCommand(scene, "atmosphereColor", "#ff0000"));
    expect(scene.atmosphereColor).toBe("#ff0000");

    manager.undo();
    expect(scene.atmosphereColor).toBe("#0000ff");
  });

  it("clears the scene and restores on undo", () => {
    const scene = makeScene("a", "b", "c");
    const manager = new UndoRedoManager();

    manager.execute(new ClearSceneCommand(scene));
    expect([...scene.entities.keys()]).toEqual([]);

    manager.undo();
    expect([...scene.entities.keys()].sort()).toEqual(["a", "b", "c"]);
  });

  // ---------- Camera Commands ----------

  it("sets camera view with undo", () => {
    const camera = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    };
    const manager = new UndoRedoManager();

    manager.execute(new SetCameraViewCommand(camera, {
      position: { x: 10, y: 20, z: 30 },
      orientation: { x: 1, y: 0, z: 0, w: 0 },
    }));
    expect(camera.position).toEqual({ x: 10, y: 20, z: 30 });

    manager.undo();
    expect(camera.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(camera.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  // ---------- Generic Commands ----------

  it("sets an arbitrary property with undo", () => {
    const target: Record<string, number> = { health: 100 };
    const manager = new UndoRedoManager();

    manager.execute(new SetPropertyCommand(target, "health", 50, "player"));
    expect(target.health).toBe(50);

    manager.undo();
    expect(target.health).toBe(100);
  });

  it("batch command rolls back on failure", () => {
    const values: string[] = [];
    const batch = new BatchCommand("test-batch", [
      { execute: () => values.push("a"), undo: () => values.pop(), description: "add a" },
      { execute: () => values.push("b"), undo: () => values.pop(), description: "add b" },
      { execute: () => { throw new Error("fail"); }, undo: () => {}, description: "explode" },
    ]);

    expect(() => batch.execute()).toThrow("fail");
    expect(values).toEqual([]);
  });

  it("batch command undoes all on success then undo", () => {
    const values: string[] = [];
    const batch = new BatchCommand("test-batch", [
      { execute: () => values.push("a"), undo: () => values.pop(), description: "add a" },
      { execute: () => values.push("b"), undo: () => values.pop(), description: "add b" },
    ]);
    const manager = new UndoRedoManager();

    manager.execute(batch);
    expect(values).toEqual(["a", "b"]);

    manager.undo();
    expect(values).toEqual([]);
  });

  it("integrates with UndoRedoManager through full undo/redo cycle", () => {
    const scene = makeScene("entity");
    const entity = scene.getEntity("entity")!;
    entity.isShowing = true;
    const manager = new UndoRedoManager();

    manager.execute(new SetVisibilityCommand(scene, "entity", false));
    manager.execute(new RenameEntityCommand(scene, "entity", "renamed"));
    expect(entity.isShowing).toBe(false);
    expect(scene.getEntity("renamed")).toBe(entity);

    manager.undo();
    expect(scene.getEntity("entity")).toBe(entity);

    manager.undo();
    expect(entity.isShowing).toBe(true);

    manager.redo();
    expect(entity.isShowing).toBe(false);
  });
});
