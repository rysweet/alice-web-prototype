import { describe, it, expect, beforeEach } from "vitest";
import {
  Clipboard,
  type ClipboardBuffer,
} from "../src/clipboard";
import { Scene } from "../src/story-api/scene";
import { SModel, SProp, SBiped, SCamera } from "../src/story-api/entities";
import type { AliceObject } from "../src/a3p-parser";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAliceObject(
  name: string,
  typeName = "org.lgna.story.SProp",
  overrides: Partial<AliceObject> = {},
): AliceObject {
  return {
    name,
    typeName,
    resourceType: null,
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    size: { width: 1, height: 1, depth: 1 },
    ...overrides,
  };
}

function makeSceneWithEntities(): { scene: Scene; objects: AliceObject[] } {
  const scene = new Scene();
  const objects = [
    makeAliceObject("tree", "org.lgna.story.SProp", {
      position: { x: 1, y: 2, z: 3 },
      size: { width: 2, height: 4, depth: 2 },
    }),
    makeAliceObject("hero", "org.lgna.story.SBiped", {
      position: { x: 5, y: 0, z: 5 },
    }),
  ];

  const tree = new SProp();
  tree.position = { x: 1, y: 2, z: 3 };
  tree.size = { width: 2, height: 4, depth: 2 };
  scene.addEntity("tree", tree);

  const hero = new SBiped();
  hero.position = { x: 5, y: 0, z: 5 };
  scene.addEntity("hero", hero);

  return { scene, objects };
}

// ---------------------------------------------------------------------------
// Clipboard — empty state
// ---------------------------------------------------------------------------

describe("Clipboard — empty state", () => {
  it("starts empty", () => {
    const cb = new Clipboard();
    expect(cb.isEmpty).toBe(true);
    expect(cb.contents).toBeNull();
  });

  it("hasEntity is false when empty", () => {
    const cb = new Clipboard();
    expect(cb.hasEntity).toBe(false);
  });

  it("hasCode is false when empty", () => {
    const cb = new Clipboard();
    expect(cb.hasCode).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Clipboard — copy entity
// ---------------------------------------------------------------------------

describe("Clipboard — copy entity", () => {
  it("copyEntity stores entity data", () => {
    const cb = new Clipboard();
    const obj = makeAliceObject("tree");
    cb.copyEntity(obj);
    expect(cb.isEmpty).toBe(false);
    expect(cb.hasEntity).toBe(true);
    expect(cb.hasCode).toBe(false);
  });

  it("copies are independent of source (deep clone)", () => {
    const cb = new Clipboard();
    const obj = makeAliceObject("tree", "org.lgna.story.SProp", {
      position: { x: 1, y: 2, z: 3 },
    });
    cb.copyEntity(obj);
    // Mutate source
    obj.position!.x = 999;
    // Clipboard should be unaffected
    const contents = cb.contents as { kind: "entity"; data: AliceObject };
    expect(contents.data.position!.x).toBe(1);
  });

  it("overwrites previous clipboard contents", () => {
    const cb = new Clipboard();
    cb.copyEntity(makeAliceObject("tree"));
    cb.copyEntity(makeAliceObject("rock"));
    const contents = cb.contents as { kind: "entity"; data: AliceObject };
    expect(contents.data.name).toBe("rock");
  });
});

// ---------------------------------------------------------------------------
// Clipboard — copy code
// ---------------------------------------------------------------------------

describe("Clipboard — copy code", () => {
  it("copyCode stores a code string", () => {
    const cb = new Clipboard();
    cb.copyCode("this.hero.move(FORWARD, 1.0);");
    expect(cb.isEmpty).toBe(false);
    expect(cb.hasCode).toBe(true);
    expect(cb.hasEntity).toBe(false);
  });

  it("pasteCode returns the stored code", () => {
    const cb = new Clipboard();
    cb.copyCode("this.hero.move(FORWARD, 1.0);");
    expect(cb.pasteCode()).toBe("this.hero.move(FORWARD, 1.0);");
  });

  it("pasteCode returns null when no code is stored", () => {
    const cb = new Clipboard();
    expect(cb.pasteCode()).toBeNull();
  });

  it("pasteCode returns null after entity was copied (overwrite)", () => {
    const cb = new Clipboard();
    cb.copyCode("some code");
    cb.copyEntity(makeAliceObject("tree"));
    expect(cb.pasteCode()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Clipboard — paste entity (unique names)
// ---------------------------------------------------------------------------

describe("Clipboard — paste entity with unique names", () => {
  it("pasteEntity returns cloned AliceObject with _copy suffix", () => {
    const cb = new Clipboard();
    const { scene } = makeSceneWithEntities();
    cb.copyEntity(makeAliceObject("tree"));
    const pasted = cb.pasteEntity(scene);
    expect(pasted).not.toBeNull();
    expect(pasted!.name).toBe("tree_copy");
  });

  it("pasteEntity appends _copy_2, _copy_3 on collisions", () => {
    const cb = new Clipboard();
    const { scene } = makeSceneWithEntities();
    cb.copyEntity(makeAliceObject("tree"));

    // First paste: tree_copy
    const p1 = cb.pasteEntity(scene);
    expect(p1!.name).toBe("tree_copy");
    // Simulate adding it to scene
    scene.addEntity("tree_copy", new SProp());

    // Second paste: tree_copy_2
    const p2 = cb.pasteEntity(scene);
    expect(p2!.name).toBe("tree_copy_2");
    scene.addEntity("tree_copy_2", new SProp());

    // Third paste: tree_copy_3
    const p3 = cb.pasteEntity(scene);
    expect(p3!.name).toBe("tree_copy_3");
  });

  it("pasteEntity returns null when clipboard is empty", () => {
    const cb = new Clipboard();
    const { scene } = makeSceneWithEntities();
    expect(cb.pasteEntity(scene)).toBeNull();
  });

  it("pasteEntity returns null when clipboard has code", () => {
    const cb = new Clipboard();
    const { scene } = makeSceneWithEntities();
    cb.copyCode("some code");
    expect(cb.pasteEntity(scene)).toBeNull();
  });

  it("pasteEntity preserves all AliceObject fields", () => {
    const cb = new Clipboard();
    const scene = new Scene();
    const obj = makeAliceObject("hero", "org.lgna.story.SBiped", {
      resourceType: "org.lgna.story.resources.biped.AlienResource",
      position: { x: 5, y: 10, z: 15 },
      orientation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
      size: { width: 2, height: 3, depth: 1 },
    });
    cb.copyEntity(obj);
    const pasted = cb.pasteEntity(scene);
    expect(pasted!.typeName).toBe("org.lgna.story.SBiped");
    expect(pasted!.resourceType).toBe("org.lgna.story.resources.biped.AlienResource");
    expect(pasted!.position).toEqual({ x: 5, y: 10, z: 15 });
    expect(pasted!.orientation).toEqual({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 });
    expect(pasted!.size).toEqual({ width: 2, height: 3, depth: 1 });
  });

  it("pasted object is independent of clipboard (deep clone)", () => {
    const cb = new Clipboard();
    const scene = new Scene();
    cb.copyEntity(makeAliceObject("tree", "org.lgna.story.SProp", {
      position: { x: 1, y: 2, z: 3 },
    }));
    const p1 = cb.pasteEntity(scene);
    const p2 = cb.pasteEntity(scene);
    // Mutate p1
    p1!.position!.x = 999;
    // p2 should be unaffected
    expect(p2!.position!.x).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Clipboard — clear
// ---------------------------------------------------------------------------

describe("Clipboard — clear", () => {
  it("clear() empties the clipboard", () => {
    const cb = new Clipboard();
    cb.copyEntity(makeAliceObject("tree"));
    cb.clear();
    expect(cb.isEmpty).toBe(true);
    expect(cb.contents).toBeNull();
  });

  it("clear() after code copy empties the clipboard", () => {
    const cb = new Clipboard();
    cb.copyCode("code");
    cb.clear();
    expect(cb.isEmpty).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clipboard — name uniqueness edge cases
// ---------------------------------------------------------------------------

describe("Clipboard — name uniqueness edge cases", () => {
  it("handles entity whose name already ends with _copy", () => {
    const cb = new Clipboard();
    const scene = new Scene();
    scene.addEntity("box_copy", new SProp());
    cb.copyEntity(makeAliceObject("box_copy"));
    const pasted = cb.pasteEntity(scene);
    // Should generate box_copy_copy since box_copy already exists
    expect(pasted!.name).toBe("box_copy_copy");
  });

  it("handles entity name not in scene (no collision)", () => {
    const cb = new Clipboard();
    const scene = new Scene();
    cb.copyEntity(makeAliceObject("unique_thing"));
    const pasted = cb.pasteEntity(scene);
    // No collision → still gets _copy suffix for consistency
    expect(pasted!.name).toBe("unique_thing_copy");
  });
});
