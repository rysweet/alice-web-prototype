/**
 * Outside-In Integration Tests — Sprint 3 (PR #30)
 *
 * Cross-module integration and edge-case scenarios for:
 *   collision-detection, tweedle-stdlib, grading-pipeline
 *
 * These tests exercise the modules from a user's perspective,
 * composing multiple APIs to verify end-to-end behavior.
 */
import { describe, it, expect, beforeEach } from "vitest";

// collision-detection
import {
  euclideanDistance,
  isWithinDistance,
  aabbFromEntity,
  aabbIntersects,
  aabbContainsPoint,
  Direction,
} from "../src/collision-detection";

// tweedle-stdlib
import {
  say,
  think,
  move,
  turn,
  roll,
  resize,
  setOpacity,
  setColor,
  delay,
  getLastSaid,
  getLastThought,
  getDelays,
  clearDelays,
} from "../src/tweedle-stdlib";

// grading-pipeline
import {
  gradeLesson,
} from "../src/grading-pipeline";
import type {
  GradeInput,
  ExecutionLogEntry,
  EventRegistration,
} from "../src/grading-pipeline";

// entities & types
import {
  SThing,
  STurnable,
  SMovableTurnable,
  SModel,
  SBiped,
  SProp,
  SGround,
  SScene,
  SCamera,
} from "../src/story-api/entities";
import { Scene } from "../src/story-api/scene";
import type { Vec3 } from "../src/story-api/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logEntry(step: number, kind: string, detail: string): ExecutionLogEntry {
  return { step, kind, detail };
}

function emptyInput(scene?: Scene): GradeInput {
  return {
    scene: scene ?? new Scene(),
    executionLog: [],
    eventRegistrations: [],
    declaredMethods: [],
  };
}

// ===========================================================================
// Scenario 1: Move entity, then check collision via AABB
// ===========================================================================

describe("cross-module: move + collision detection", () => {
  it("moving an entity into range triggers AABB intersection", () => {
    const a = new SModel();
    a.position = { x: 0, y: 0, z: 0 };
    a.size = { width: 2, height: 2, depth: 2 };

    const b = new SModel();
    b.position = { x: 10, y: 0, z: 0 };
    b.size = { width: 2, height: 2, depth: 2 };

    // Initially separated
    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(false);

    // Move entity a toward b
    move(a, Direction.RIGHT, 9);

    // Now a is at (9,0,0), AABB [8,11] on X — overlaps b's [9,11]
    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(true);
  });

  it("moving entity away breaks AABB intersection", () => {
    const a = new SModel();
    a.position = { x: 0, y: 0, z: 0 };
    a.size = { width: 2, height: 2, depth: 2 };

    const b = new SModel();
    b.position = { x: 1, y: 0, z: 0 };
    b.size = { width: 2, height: 2, depth: 2 };

    // Initially overlapping
    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(true);

    // Move entity a far away
    move(a, Direction.LEFT, 100);

    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(false);
  });

  it("euclideanDistance reflects move operations", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    const origin: Vec3 = { x: 0, y: 0, z: 0 };

    move(model, Direction.RIGHT, 3);
    move(model, Direction.UP, 4);

    expect(euclideanDistance(origin, model.position)).toBe(5);
  });

  it("isWithinDistance works with entity positions after move", () => {
    const a = new SModel();
    a.position = { x: 0, y: 0, z: 0 };
    const b = new SModel();
    b.position = { x: 0, y: 0, z: 0 };

    move(b, Direction.FORWARD, 5);

    expect(isWithinDistance(a.position, b.position, 5)).toBe(true);
    expect(isWithinDistance(a.position, b.position, 4.9)).toBe(false);
  });
});

// ===========================================================================
// Scenario 2: Resize affects AABB collision geometry
// ===========================================================================

describe("cross-module: resize + collision detection", () => {
  it("resizing makes entities collide that were previously separated", () => {
    const a = new SModel();
    a.position = { x: 0, y: 0, z: 0 };
    a.size = { width: 1, height: 1, depth: 1 };

    const b = new SModel();
    b.position = { x: 3, y: 0, z: 0 };
    b.size = { width: 1, height: 1, depth: 1 };

    // AABBs: a=[-0.5,0.5], b=[2.5,3.5] — no overlap
    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(false);

    // Resize a by 6x: a becomes [-3,3] — now overlaps b [2.5,3.5]
    resize(a, 6);
    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(true);
  });

  it("aabbContainsPoint reflects resize", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    model.size = { width: 1, height: 1, depth: 1 };

    const point: Vec3 = { x: 2, y: 0, z: 0 };

    // Initially doesn't contain point
    expect(aabbContainsPoint(aabbFromEntity(model), point)).toBe(false);

    // After resize by 5x: AABB [-2.5,2.5] — contains point (2,0,0)
    resize(model, 5);
    expect(aabbContainsPoint(aabbFromEntity(model), point)).toBe(true);
  });
});

// ===========================================================================
// Scenario 3: Full Alice3 lesson simulation (L1–L8 with stdlib calls)
// ===========================================================================

describe("cross-module: stdlib + grading pipeline", () => {
  it("L1: adding entity via scene and grading passes", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    const result = gradeLesson(1, emptyInput(scene));
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1);
  });

  it("L2: move/turn log entries pass grading", () => {
    const model = new SModel();
    // Actually call stdlib
    move(model, Direction.FORWARD, 3);
    turn(model, Direction.LEFT, Math.PI / 4);

    const result = gradeLesson(2, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.move(FORWARD, 3)"),
        logEntry(2, "MethodCall", "this.turn(LEFT, 0.25)"),
      ],
    });
    expect(result.passed).toBe(true);
  });

  it("L3: event listener registration passes grading", () => {
    const result = gradeLesson(3, {
      ...emptyInput(),
      eventRegistrations: [
        { eventType: "mouseClick", handlerName: "handleClick" },
      ],
    });
    expect(result.passed).toBe(true);
  });

  it("L8 capstone: multi-criteria grading with full scene", () => {
    const scene = new Scene();
    scene.addEntity("cat", new SBiped());
    scene.addEntity("dog", new SBiped());
    scene.addEntity("tree", new SProp());

    const result = gradeLesson(8, {
      scene,
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
        logEntry(2, "IfElse", "if cat.isCollidingWith(dog)"),
        logEntry(3, "MethodCall", "this.customDance()"),
      ],
      eventRegistrations: [],
      declaredMethods: ["customDance"],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria.length).toBe(4);
    expect(result.score).toBe(1);
    // All four criteria pass
    for (const c of result.criteria) {
      expect(c.passed).toBe(true);
    }
  });

  it("L8 capstone: partial failure yields partial score", () => {
    const scene = new Scene();
    // Only 1 entity — need 3
    scene.addEntity("bunny", new SBiped());

    const result = gradeLesson(8, {
      scene,
      executionLog: [
        logEntry(1, "CountLoop", "repeat 5 times"),
        // No IfElse, no custom method
      ],
      eventRegistrations: [],
      declaredMethods: [],
    });

    expect(result.passed).toBe(false);
    // 1 of 4 criteria pass (has-loop)
    expect(result.score).toBe(0.25);
  });
});

// ===========================================================================
// Scenario 4: Stdlib state isolation between entities
// ===========================================================================

describe("cross-module: stdlib state isolation", () => {
  beforeEach(() => {
    clearDelays();
  });

  it("say/think state is per-entity and independent", () => {
    const e1 = new SBiped();
    const e2 = new SBiped();
    const e3 = new SModel();

    say(e1, "one");
    say(e2, "two");
    think(e3, "three");

    expect(getLastSaid(e1)).toBe("one");
    expect(getLastSaid(e2)).toBe("two");
    expect(getLastSaid(e3)).toBeUndefined();
    expect(getLastThought(e3)).toBe("three");
    expect(getLastThought(e1)).toBeUndefined();
  });

  it("delay log is global and accumulates across entities", () => {
    delay(1);
    delay(2);
    delay(0.5);
    expect(getDelays()).toEqual([1, 2, 0.5]);
    clearDelays();
    expect(getDelays()).toEqual([]);
  });
});

// ===========================================================================
// Scenario 5: Direction constants with collision detection
// ===========================================================================

describe("cross-module: Direction + collision + stdlib", () => {
  it("all 6 direction vectors are unit vectors", () => {
    for (const [name, dir] of Object.entries(Direction)) {
      const len = euclideanDistance(dir as Vec3, { x: 0, y: 0, z: 0 });
      expect(len).toBeCloseTo(1, 10);
    }
  });

  it("opposite directions sum to zero", () => {
    const pairs: [Vec3, Vec3][] = [
      [Direction.FORWARD, Direction.BACKWARD],
      [Direction.LEFT, Direction.RIGHT],
      [Direction.UP, Direction.DOWN],
    ];
    for (const [a, b] of pairs) {
      expect(a.x + b.x).toBe(0);
      expect(a.y + b.y).toBe(0);
      expect(a.z + b.z).toBe(0);
    }
  });

  it("move in opposite directions returns to origin", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.FORWARD, 7);
    move(model, Direction.BACKWARD, 7);
    expect(model.position.x).toBeCloseTo(0);
    expect(model.position.y).toBeCloseTo(0);
    expect(model.position.z).toBeCloseTo(0);
  });
});

// ===========================================================================
// Scenario 6: Edge cases — grading pipeline boundary inputs
// ===========================================================================

describe("edge cases: grading pipeline", () => {
  it("throws for lesson 0", () => {
    expect(() => gradeLesson(0, emptyInput())).toThrow(TypeError);
  });

  it("throws for lesson 9", () => {
    expect(() => gradeLesson(9, emptyInput())).toThrow(TypeError);
  });

  it("throws for fractional lesson", () => {
    expect(() => gradeLesson(1.5, emptyInput())).toThrow(TypeError);
  });

  it("throws for negative lesson", () => {
    expect(() => gradeLesson(-1, emptyInput())).toThrow(TypeError);
  });

  it("L1 fails with empty scene", () => {
    const result = gradeLesson(1, emptyInput());
    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
  });

  it("L1 ignores default entities (SGround, SScene, SCamera)", () => {
    const scene = new Scene();
    scene.addEntity("ground", new SGround());
    scene.addEntity("scene", new SScene());
    scene.addEntity("cam", new SCamera());
    const result = gradeLesson(1, emptyInput(scene));
    expect(result.passed).toBe(false);
  });

  it("all 8 lessons produce valid result structure", () => {
    for (let i = 1; i <= 8; i++) {
      const result = gradeLesson(i, emptyInput());
      expect(result.lesson).toBe(i);
      expect(typeof result.passed).toBe("boolean");
      expect(typeof result.score).toBe("number");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(Array.isArray(result.criteria)).toBe(true);
      for (const c of result.criteria) {
        expect(typeof c.name).toBe("string");
        expect(typeof c.passed).toBe("boolean");
        expect(typeof c.message).toBe("string");
      }
    }
  });
});

// ===========================================================================
// Scenario 7: Edge cases — stdlib extreme values
// ===========================================================================

describe("edge cases: stdlib extreme values", () => {
  it("move with very large amount doesn't crash", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.RIGHT, 1e15);
    expect(model.position.x).toBe(1e15);
  });

  it("move with very small fractional amount", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.UP, 1e-15);
    expect(model.position.y).toBeCloseTo(1e-15);
  });

  it("resize preserves precision with small factors", () => {
    const model = new SModel();
    model.size = { width: 100, height: 100, depth: 100 };
    resize(model, 0.001);
    expect(model.size.width).toBeCloseTo(0.1);
    expect(model.size.height).toBeCloseTo(0.1);
    expect(model.size.depth).toBeCloseTo(0.1);
  });

  it("setOpacity with large negative value doesn't throw", () => {
    const model = new SModel();
    setOpacity(model, -1000);
    expect(model.opacity).toBe(-1000);
  });

  it("say accepts unicode and special characters", () => {
    const entity = new SBiped();
    say(entity, "こんにちは 🌸 \"quotes\" <html> &amp;");
    expect(getLastSaid(entity)).toBe("こんにちは 🌸 \"quotes\" <html> &amp;");
  });

  it("setColor accepts any non-empty string", () => {
    const model = new SModel();
    setColor(model, "#FF00FF");
    expect(model.color).toBe("#FF00FF");
    setColor(model, "rgb(255, 0, 128)");
    expect(model.color).toBe("rgb(255, 0, 128)");
  });
});

// ===========================================================================
// Scenario 8: Collision detection — degenerate geometry
// ===========================================================================

describe("edge cases: collision degenerate geometry", () => {
  it("zero-volume AABB (point entity) still intersects containing box", () => {
    const pointBox = { min: { x: 5, y: 5, z: 5 }, max: { x: 5, y: 5, z: 5 } };
    const bigBox = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };
    expect(aabbIntersects(pointBox, bigBox)).toBe(true);
  });

  it("flat AABB (2D entity on one plane) intersects", () => {
    // Zero depth
    const flat = { min: { x: 0, y: 0, z: 5 }, max: { x: 10, y: 10, z: 5 } };
    const vol = { min: { x: 3, y: 3, z: 3 }, max: { x: 7, y: 7, z: 7 } };
    expect(aabbIntersects(flat, vol)).toBe(true);
  });

  it("euclidean distance with all-zero vectors", () => {
    const zero: Vec3 = { x: 0, y: 0, z: 0 };
    expect(euclideanDistance(zero, zero)).toBe(0);
  });

  it("very small distance still detected by isWithinDistance", () => {
    const a: Vec3 = { x: 0, y: 0, z: 0 };
    const b: Vec3 = { x: 1e-10, y: 0, z: 0 };
    expect(isWithinDistance(a, b, 1e-9)).toBe(true);
    expect(isWithinDistance(a, b, 1e-11)).toBe(false);
  });
});
