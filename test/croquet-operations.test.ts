import { describe, expect, it } from "vitest";
import {
  AddEntityOperation,
  CompoundOperation,
  DragOperation,
  EditOperation,
  Operation,
  OperationHistory,
  PropertyChangeOperation,
  RemoveEntityOperation,
  ReparentOperation,
} from "../src/croquet-operations.js";
import { SModel, SProp } from "../src/story-api/entities.js";
import { Scene } from "../src/story-api/scene.js";

describe("croquet-operations", () => {
  it("executes undoable operations and tracks history checkpoints", () => {
    const history = new OperationHistory();
    const values: string[] = [];
    const append = new Operation("append-draft", {
      execute: () => {
        values.push("draft");
      },
      undo: () => {
        values.pop();
      },
    });

    history.execute(append);
    const checkpoint = history.createCheckpoint("after-append");

    expect(values).toEqual(["draft"]);
    expect(history.canUndo).toBe(true);
    expect(checkpoint.nextUndoName).toBe("append-draft");
    expect(history.isAtCheckpoint("after-append")).toBe(true);

    history.undo();
    expect(values).toEqual([]);
    expect(history.isAtCheckpoint("after-append")).toBe(false);

    history.redo();
    expect(values).toEqual(["draft"]);
  });

  it("rolls compound operations back when a child fails", () => {
    const values: string[] = [];
    const compound = new CompoundOperation("atomic", [
      new Operation("first", {
        execute: () => {
          values.push("first");
        },
        undo: () => {
          values.pop();
        },
      }),
      new Operation("explode", {
        execute: () => {
          throw new Error("boom");
        },
        undo: () => {},
      }),
    ]);

    expect(() => compound.execute()).toThrow("boom");
    expect(values).toEqual([]);
  });

  it("drags entities by translating rotating and scaling them", () => {
    const entity = new SModel();
    entity.position = { x: 1, y: 2, z: 3 };
    entity.orientation = { x: 0, y: 0, z: 0, w: 1 };
    entity.size = { width: 1, height: 1, depth: 1 };

    const drag = new DragOperation("drag-box", entity, {
      position: { x: 4, y: 5, z: 6 },
      orientation: { x: 0, y: 1, z: 0, w: 0 },
      size: { width: 2, height: 3, depth: 4 },
    });

    drag.execute();
    expect(entity.position).toEqual({ x: 4, y: 5, z: 6 });
    expect(entity.orientation).toEqual({ x: 0, y: 1, z: 0, w: 0 });
    expect(entity.size).toEqual({ width: 2, height: 3, depth: 4 });

    drag.undo();
    expect(entity.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(entity.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(entity.size).toEqual({ width: 1, height: 1, depth: 1 });
  });

  it("edits statement collections through insert delete and modify steps", () => {
    const statements = ["a", "b", "c"];

    new EditOperation("insert", statements, "insert", 1, "between").execute();
    expect(statements).toEqual(["a", "between", "b", "c"]);

    new EditOperation("modify", statements, "modify", 2, "updated").execute();
    expect(statements).toEqual(["a", "between", "updated", "c"]);

    const deletion = new EditOperation("delete", statements, "delete", 0);
    deletion.execute();
    expect(statements).toEqual(["between", "updated", "c"]);

    deletion.undo();
    expect(statements).toEqual(["a", "between", "updated", "c"]);
  });

  it("changes arbitrary entity properties with clone-safe undo", () => {
    const target = { zoom: { level: 1 } };
    const operation = new PropertyChangeOperation(
      "zoom",
      target,
      "zoom",
      { level: 3 },
      (value) => ({ ...value }),
    );

    operation.execute();
    expect(target.zoom).toEqual({ level: 3 });

    operation.undo();
    expect(target.zoom).toEqual({ level: 1 });
  });

  it("adds removes and restores scene entities", () => {
    const scene = new Scene();
    const bunny = new SProp();
    const add = new AddEntityOperation("add-bunny", scene, "bunny", bunny);
    const remove = new RemoveEntityOperation("remove-bunny", scene, "bunny");

    add.execute();
    expect(scene.getEntity("bunny")).toBe(bunny);

    remove.execute();
    expect(scene.getEntity("bunny")).toBeUndefined();

    remove.undo();
    expect(scene.getEntity("bunny")).toBe(bunny);
  });

  it("reparents entities by changing their vehicle", () => {
    const child = new SModel();
    const originalParent = new SModel();
    const newParent = new SModel();
    child.vehicle = originalParent;

    const reparent = new ReparentOperation("reparent", child, newParent);
    reparent.execute();
    expect(child.vehicle).toBe(newParent);

    reparent.undo();
    expect(child.vehicle).toBe(originalParent);
  });
});
