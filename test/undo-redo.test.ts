import { describe, it, expect, beforeEach } from "vitest";
import {
  UndoRedoManager,
  AddEntityCommand,
  RemoveEntityCommand,
  MoveEntityCommand,
  RotateEntityCommand,
  ResizeEntityCommand,
  CompositeCommand,
  type Command,
} from "../src/undo-redo";
import { Scene } from "../src/story-api/scene";
import { SModel, SBiped, SProp, SCamera } from "../src/story-api/entities";
import type { Position, Orientation, Size } from "../src/story-api/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeScene(): Scene {
  const scene = new Scene();
  const model = new SModel();
  model.position = { x: 1, y: 2, z: 3 };
  model.orientation = { x: 0, y: 0, z: 0, w: 1 };
  model.size = { width: 1, height: 1, depth: 1 };
  scene.addEntity("box", model);
  return scene;
}

// ---------------------------------------------------------------------------
// UndoRedoManager core
// ---------------------------------------------------------------------------

describe("UndoRedoManager — core", () => {
  let manager: UndoRedoManager;

  beforeEach(() => {
    manager = new UndoRedoManager();
  });

  it("starts with empty stacks", () => {
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
  });

  it("execute() pushes command and sets canUndo", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "box", { x: 10, y: 20, z: 30 });
    manager.execute(cmd);
    expect(manager.canUndo).toBe(true);
    expect(manager.canRedo).toBe(false);
  });

  it("undo() reverses the last command", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "box", { x: 10, y: 20, z: 30 });
    manager.execute(cmd);
    manager.undo();
    const entity = scene.getEntity("box") as SModel;
    expect(entity.position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("redo() re-applies the undone command", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "box", { x: 10, y: 20, z: 30 });
    manager.execute(cmd);
    manager.undo();
    manager.redo();
    const entity = scene.getEntity("box") as SModel;
    expect(entity.position).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("undo() when nothing to undo is a no-op", () => {
    expect(() => manager.undo()).not.toThrow();
  });

  it("redo() when nothing to redo is a no-op", () => {
    expect(() => manager.redo()).not.toThrow();
  });

  it("skips non-undoable command undo even when direct undo would throw", () => {
    let executed = false;
    let undoCalled = false;
    const cmd: Command = {
      undoable: false,
      description: "non-undoable direct-call guard",
      execute() {
        executed = true;
      },
      undo() {
        undoCalled = true;
        throw new Error("direct undo should not be called");
      },
    };

    manager.execute(cmd);
    manager.undo();

    expect(executed).toBe(true);
    expect(undoCalled).toBe(false);
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
  });

  it("executing a new command clears the redo stack", () => {
    const scene = makeScene();
    manager.execute(new MoveEntityCommand(scene, "box", { x: 10, y: 0, z: 0 }));
    manager.undo();
    expect(manager.canRedo).toBe(true);
    manager.execute(new MoveEntityCommand(scene, "box", { x: 99, y: 0, z: 0 }));
    expect(manager.canRedo).toBe(false);
  });

  it("clear() empties both stacks", () => {
    const scene = makeScene();
    manager.execute(new MoveEntityCommand(scene, "box", { x: 5, y: 5, z: 5 }));
    manager.undo();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(true);
    manager.clear();
    expect(manager.canUndo).toBe(false);
    expect(manager.canRedo).toBe(false);
  });

  it("supports multiple sequential undo/redo", () => {
    const scene = makeScene();
    manager.execute(new MoveEntityCommand(scene, "box", { x: 10, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 20, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 30, y: 0, z: 0 }));

    manager.undo(); // back to 20
    expect((scene.getEntity("box") as SModel).position.x).toBe(20);
    manager.undo(); // back to 10
    expect((scene.getEntity("box") as SModel).position.x).toBe(10);
    manager.undo(); // back to original 1
    expect((scene.getEntity("box") as SModel).position.x).toBe(1);

    manager.redo(); // forward to 10
    expect((scene.getEntity("box") as SModel).position.x).toBe(10);
    manager.redo(); // forward to 20
    expect((scene.getEntity("box") as SModel).position.x).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Stack cap (100)
// ---------------------------------------------------------------------------

describe("UndoRedoManager — stack cap", () => {
  it("caps undo stack at 100 commands", () => {
    const scene = makeScene();
    const manager = new UndoRedoManager();
    for (let i = 0; i < 150; i++) {
      manager.execute(new MoveEntityCommand(scene, "box", { x: i, y: 0, z: 0 }));
    }
    // Undo 100 times should work, then canUndo should be false
    let undoCount = 0;
    while (manager.canUndo) {
      manager.undo();
      undoCount++;
    }
    expect(undoCount).toBe(100);
  });

  it("drops the oldest commands and preserves the newest reachable state", () => {
    const scene = makeScene();
    const manager = new UndoRedoManager();

    for (let i = 0; i < 150; i++) {
      manager.execute(new MoveEntityCommand(scene, "box", { x: i, y: 0, z: 0 }));
    }

    while (manager.canUndo) {
      manager.undo();
    }

    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 49, y: 0, z: 0 });
    expect(manager.undoCount).toBe(0);
    expect(manager.redoCount).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// undoCount / redoCount
// ---------------------------------------------------------------------------

describe("UndoRedoManager — stack counts", () => {
  it("undoCount and redoCount track stack sizes", () => {
    const scene = makeScene();
    const manager = new UndoRedoManager();
    expect(manager.undoCount).toBe(0);
    expect(manager.redoCount).toBe(0);

    manager.execute(new MoveEntityCommand(scene, "box", { x: 10, y: 0, z: 0 }));
    expect(manager.undoCount).toBe(1);
    expect(manager.redoCount).toBe(0);

    manager.undo();
    expect(manager.undoCount).toBe(0);
    expect(manager.redoCount).toBe(1);
  });

  it("clears the entire redo depth when a new command executes after multiple undos", () => {
    const scene = makeScene();
    const manager = new UndoRedoManager();

    manager.execute(new MoveEntityCommand(scene, "box", { x: 10, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 20, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 30, y: 0, z: 0 }));

    manager.undo();
    manager.undo();
    expect(manager.undoCount).toBe(1);
    expect(manager.redoCount).toBe(2);

    manager.execute(new MoveEntityCommand(scene, "box", { x: 99, y: 0, z: 0 }));

    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 99, y: 0, z: 0 });
    expect(manager.undoCount).toBe(2);
    expect(manager.redoCount).toBe(0);

    manager.redo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 99, y: 0, z: 0 });
  });

  it("replays redo states in original order after a deep undo chain", () => {
    const scene = makeScene();
    const manager = new UndoRedoManager();

    manager.execute(new MoveEntityCommand(scene, "box", { x: 10, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 20, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 30, y: 0, z: 0 }));
    manager.execute(new MoveEntityCommand(scene, "box", { x: 40, y: 0, z: 0 }));

    manager.undo();
    manager.undo();
    manager.undo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 10, y: 0, z: 0 });
    expect(manager.undoCount).toBe(1);
    expect(manager.redoCount).toBe(3);

    manager.redo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 20, y: 0, z: 0 });
    manager.redo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 30, y: 0, z: 0 });
    manager.redo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 40, y: 0, z: 0 });
    expect(manager.undoCount).toBe(4);
    expect(manager.redoCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AddEntityCommand
// ---------------------------------------------------------------------------

describe("AddEntityCommand", () => {
  it("execute adds entity to scene", () => {
    const scene = new Scene();
    const entity = new SProp();
    const cmd = new AddEntityCommand(scene, "tree", entity);
    cmd.execute();
    expect(scene.getEntity("tree")).toBe(entity);
  });

  it("undo removes the added entity", () => {
    const scene = new Scene();
    const entity = new SProp();
    const cmd = new AddEntityCommand(scene, "tree", entity);
    cmd.execute();
    cmd.undo();
    expect(scene.getEntity("tree")).toBeUndefined();
  });

  it("redo re-adds the entity", () => {
    const scene = new Scene();
    const entity = new SProp();
    const cmd = new AddEntityCommand(scene, "tree", entity);
    cmd.execute();
    cmd.undo();
    cmd.execute(); // redo is just re-execute
    expect(scene.getEntity("tree")).toBe(entity);
  });
});

// ---------------------------------------------------------------------------
// RemoveEntityCommand
// ---------------------------------------------------------------------------

describe("RemoveEntityCommand", () => {
  it("execute removes entity from scene and captures it", () => {
    const scene = new Scene();
    const entity = new SProp();
    scene.addEntity("tree", entity);
    const cmd = new RemoveEntityCommand(scene, "tree");
    cmd.execute();
    expect(scene.getEntity("tree")).toBeUndefined();
  });

  it("undo restores the removed entity", () => {
    const scene = new Scene();
    const entity = new SProp();
    scene.addEntity("tree", entity);
    const cmd = new RemoveEntityCommand(scene, "tree");
    cmd.execute();
    cmd.undo();
    expect(scene.getEntity("tree")).toBe(entity);
  });

  it("throws if entity does not exist on execute", () => {
    const scene = new Scene();
    const cmd = new RemoveEntityCommand(scene, "nonexistent");
    expect(() => cmd.execute()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// MoveEntityCommand
// ---------------------------------------------------------------------------

describe("MoveEntityCommand", () => {
  it("execute moves entity to new position", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "box", { x: 10, y: 20, z: 30 });
    cmd.execute();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 10, y: 20, z: 30 });
  });

  it("undo restores original position", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "box", { x: 10, y: 20, z: 30 });
    cmd.execute();
    cmd.undo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("captures position at construction time", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "box", { x: 10, y: 20, z: 30 });
    // Mutate position before execute
    (scene.getEntity("box") as SModel).position = { x: 99, y: 99, z: 99 };
    cmd.execute();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 10, y: 20, z: 30 });
    // Undo restores the position at construction time (1,2,3), not the mutated one
    cmd.undo();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("throws if entity not found", () => {
    const scene = makeScene();
    const cmd = new MoveEntityCommand(scene, "nonexistent", { x: 0, y: 0, z: 0 });
    expect(() => cmd.execute()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// RotateEntityCommand
// ---------------------------------------------------------------------------

describe("RotateEntityCommand", () => {
  it("execute rotates entity to new orientation", () => {
    const scene = makeScene();
    const newOri: Orientation = { x: 0.5, y: 0.5, z: 0.5, w: 0.5 };
    const cmd = new RotateEntityCommand(scene, "box", newOri);
    cmd.execute();
    expect((scene.getEntity("box") as SModel).orientation).toEqual(newOri);
  });

  it("undo restores original orientation", () => {
    const scene = makeScene();
    const newOri: Orientation = { x: 0.5, y: 0.5, z: 0.5, w: 0.5 };
    const cmd = new RotateEntityCommand(scene, "box", newOri);
    cmd.execute();
    cmd.undo();
    expect((scene.getEntity("box") as SModel).orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });
});

// ---------------------------------------------------------------------------
// ResizeEntityCommand
// ---------------------------------------------------------------------------

describe("ResizeEntityCommand", () => {
  it("execute resizes entity to new size", () => {
    const scene = makeScene();
    const newSize: Size = { width: 2, height: 3, depth: 4 };
    const cmd = new ResizeEntityCommand(scene, "box", newSize);
    cmd.execute();
    expect((scene.getEntity("box") as SModel).size).toEqual(newSize);
  });

  it("undo restores original size", () => {
    const scene = makeScene();
    const newSize: Size = { width: 2, height: 3, depth: 4 };
    const cmd = new ResizeEntityCommand(scene, "box", newSize);
    cmd.execute();
    cmd.undo();
    expect((scene.getEntity("box") as SModel).size).toEqual({ width: 1, height: 1, depth: 1 });
  });

  it("throws for non-SModel entity", () => {
    const scene = new Scene();
    scene.addEntity("cam", new SCamera());
    const cmd = new ResizeEntityCommand(scene, "cam", { width: 2, height: 2, depth: 2 });
    expect(() => cmd.execute()).toThrow();
  });
});

// ---------------------------------------------------------------------------
// CompositeCommand
// ---------------------------------------------------------------------------

describe("CompositeCommand", () => {
  it("executes all sub-commands in order", () => {
    const scene = makeScene();
    const entity = new SProp();
    const composite = new CompositeCommand([
      new AddEntityCommand(scene, "tree", entity),
      new MoveEntityCommand(scene, "box", { x: 50, y: 50, z: 50 }),
    ]);
    composite.execute();
    expect(scene.getEntity("tree")).toBe(entity);
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 50, y: 50, z: 50 });
  });

  it("undo reverses all sub-commands in reverse order", () => {
    const scene = makeScene();
    const entity = new SProp();
    const composite = new CompositeCommand([
      new AddEntityCommand(scene, "tree", entity),
      new MoveEntityCommand(scene, "box", { x: 50, y: 50, z: 50 }),
    ]);
    composite.execute();
    composite.undo();
    expect(scene.getEntity("tree")).toBeUndefined();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("works with UndoRedoManager", () => {
    const scene = makeScene();
    const manager = new UndoRedoManager();
    const entity = new SProp();
    const composite = new CompositeCommand([
      new AddEntityCommand(scene, "tree", entity),
      new MoveEntityCommand(scene, "box", { x: 50, y: 50, z: 50 }),
    ]);
    manager.execute(composite);
    expect(manager.undoCount).toBe(1); // composite counts as 1
    manager.undo();
    expect(scene.getEntity("tree")).toBeUndefined();
    expect((scene.getEntity("box") as SModel).position).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("empty composite is a no-op", () => {
    const composite = new CompositeCommand([]);
    expect(() => composite.execute()).not.toThrow();
    expect(() => composite.undo()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Integration: manager + various command types
// ---------------------------------------------------------------------------

describe("UndoRedoManager — integration", () => {
  it("interleaves different command types", () => {
    const scene = new Scene();
    const manager = new UndoRedoManager();

    // Add entity
    const model = new SModel();
    manager.execute(new AddEntityCommand(scene, "cube", model));
    expect(scene.entities.size).toBe(1);

    // Move it
    manager.execute(new MoveEntityCommand(scene, "cube", { x: 5, y: 5, z: 5 }));
    expect((scene.getEntity("cube") as SModel).position).toEqual({ x: 5, y: 5, z: 5 });

    // Resize it
    manager.execute(new ResizeEntityCommand(scene, "cube", { width: 3, height: 3, depth: 3 }));
    expect((scene.getEntity("cube") as SModel).size).toEqual({ width: 3, height: 3, depth: 3 });

    // Undo resize
    manager.undo();
    expect((scene.getEntity("cube") as SModel).size).toEqual({ width: 1, height: 1, depth: 1 });

    // Undo move
    manager.undo();
    expect((scene.getEntity("cube") as SModel).position).toEqual({ x: 0, y: 0, z: 0 });

    // Undo add
    manager.undo();
    expect(scene.entities.size).toBe(0);
  });

  it("description property returns a human-readable string", () => {
    const scene = makeScene();
    const cmds: Command[] = [
      new AddEntityCommand(scene, "tree", new SProp()),
      new RemoveEntityCommand(scene, "box"),
      new MoveEntityCommand(scene, "box", { x: 0, y: 0, z: 0 }),
      new RotateEntityCommand(scene, "box", { x: 0, y: 0, z: 0, w: 1 }),
      new ResizeEntityCommand(scene, "box", { width: 1, height: 1, depth: 1 }),
      new CompositeCommand([]),
    ];
    for (const cmd of cmds) {
      expect(typeof cmd.description).toBe("string");
      expect(cmd.description.length).toBeGreaterThan(0);
    }
  });
});
