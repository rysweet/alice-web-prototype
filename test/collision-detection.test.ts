import { describe, it, expect } from "vitest";
import {
  euclideanDistance,
  isWithinDistance,
  aabbFromEntity,
  aabbIntersects,
  aabbContainsPoint,
  Direction,
} from "../src/collision-detection";
import { SModel, SBiped, SThing } from "../src/story-api/entities";
import type { Vec3, BoundingBox } from "../src/story-api/types";

// ---------------------------------------------------------------------------
// euclideanDistance
// ---------------------------------------------------------------------------

describe("euclideanDistance", () => {
  it("returns 0 for coincident points", () => {
    const p: Vec3 = { x: 1, y: 2, z: 3 };
    expect(euclideanDistance(p, p)).toBe(0);
  });

  it("computes 3-4-5 triangle distance (z=0 plane)", () => {
    expect(
      euclideanDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }),
    ).toBe(5);
  });

  it("computes distance along a single axis", () => {
    expect(
      euclideanDistance({ x: 0, y: 0, z: 0 }, { x: 7, y: 0, z: 0 }),
    ).toBe(7);
  });

  it("is commutative", () => {
    const a: Vec3 = { x: 1, y: 2, z: 3 };
    const b: Vec3 = { x: 4, y: 6, z: 8 };
    expect(euclideanDistance(a, b)).toBe(euclideanDistance(b, a));
  });

  it("handles negative coordinates", () => {
    expect(
      euclideanDistance({ x: -1, y: -1, z: -1 }, { x: 1, y: 1, z: 1 }),
    ).toBeCloseTo(Math.sqrt(12), 10);
  });

  it("computes full 3D diagonal distance", () => {
    expect(
      euclideanDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }),
    ).toBeCloseTo(Math.sqrt(3), 10);
  });

  it("throws TypeError on NaN coordinate", () => {
    expect(() =>
      euclideanDistance({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    ).toThrow(TypeError);
  });

  it("throws TypeError on Infinity coordinate", () => {
    expect(() =>
      euclideanDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: Infinity, z: 0 }),
    ).toThrow(TypeError);
  });

  it("throws TypeError on -Infinity coordinate", () => {
    expect(() =>
      euclideanDistance({ x: 0, y: 0, z: -Infinity }, { x: 0, y: 0, z: 0 }),
    ).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// isWithinDistance
// ---------------------------------------------------------------------------

describe("isWithinDistance", () => {
  it("returns true when distance equals threshold", () => {
    expect(
      isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 5),
    ).toBe(true);
  });

  it("returns true when distance is below threshold", () => {
    expect(
      isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2),
    ).toBe(true);
  });

  it("returns false when distance exceeds threshold", () => {
    expect(
      isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 2),
    ).toBe(false);
  });

  it("returns true for coincident points with threshold 0", () => {
    const p: Vec3 = { x: 3, y: 4, z: 5 };
    expect(isWithinDistance(p, p, 0)).toBe(true);
  });

  it("throws TypeError on negative threshold", () => {
    expect(() =>
      isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, -1),
    ).toThrow(TypeError);
  });

  it("throws TypeError on NaN threshold", () => {
    expect(() =>
      isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, NaN),
    ).toThrow(TypeError);
  });

  it("throws TypeError on Infinity threshold", () => {
    expect(() =>
      isWithinDistance(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        Infinity,
      ),
    ).toThrow(TypeError);
  });

  it("throws TypeError when coordinates are non-finite", () => {
    expect(() =>
      isWithinDistance({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 5),
    ).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// aabbFromEntity
// ---------------------------------------------------------------------------

describe("aabbFromEntity", () => {
  it("computes AABB centered on entity position", () => {
    const model = new SModel();
    model.position = { x: 5, y: 0, z: 0 };
    model.size = { width: 2, height: 4, depth: 2 };

    const box = aabbFromEntity(model);
    expect(box.min).toEqual({ x: 4, y: -2, z: -1 });
    expect(box.max).toEqual({ x: 6, y: 2, z: 1 });
  });

  it("produces unit box for default SModel", () => {
    const model = new SModel();
    // default position (0,0,0), default size (1,1,1)
    const box = aabbFromEntity(model);
    expect(box.min).toEqual({ x: -0.5, y: -0.5, z: -0.5 });
    expect(box.max).toEqual({ x: 0.5, y: 0.5, z: 0.5 });
  });

  it("works with SBiped (subclass of SModel)", () => {
    const biped = new SBiped();
    biped.position = { x: 0, y: 0, z: 0 };
    biped.size = { width: 1, height: 2, depth: 1 };

    const box = aabbFromEntity(biped);
    expect(box.min).toEqual({ x: -0.5, y: -1, z: -0.5 });
    expect(box.max).toEqual({ x: 0.5, y: 1, z: 0.5 });
  });

  it("handles negative position coordinates", () => {
    const model = new SModel();
    model.position = { x: -3, y: -2, z: -1 };
    model.size = { width: 2, height: 2, depth: 2 };

    const box = aabbFromEntity(model);
    expect(box.min).toEqual({ x: -4, y: -3, z: -2 });
    expect(box.max).toEqual({ x: -2, y: -1, z: 0 });
  });

  it("throws TypeError for non-SModel entity", () => {
    const thing = new SThing();
    expect(() => aabbFromEntity(thing as any)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// aabbIntersects
// ---------------------------------------------------------------------------

describe("aabbIntersects", () => {
  it("returns true for overlapping boxes", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 2, y: 2, z: 2 },
    };
    const b: BoundingBox = {
      min: { x: 1, y: 1, z: 1 },
      max: { x: 3, y: 3, z: 3 },
    };
    expect(aabbIntersects(a, b)).toBe(true);
  });

  it("returns false for separated boxes", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    };
    const b: BoundingBox = {
      min: { x: 5, y: 5, z: 5 },
      max: { x: 6, y: 6, z: 6 },
    };
    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("returns true for touching faces (shared boundary)", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 1, z: 1 },
    };
    const b: BoundingBox = {
      min: { x: 1, y: 0, z: 0 },
      max: { x: 2, y: 1, z: 1 },
    };
    expect(aabbIntersects(a, b)).toBe(true);
  });

  it("returns true when one box contains the other", () => {
    const outer: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 10 },
    };
    const inner: BoundingBox = {
      min: { x: 2, y: 2, z: 2 },
      max: { x: 3, y: 3, z: 3 },
    };
    expect(aabbIntersects(outer, inner)).toBe(true);
  });

  it("returns true for identical boxes", () => {
    const box: BoundingBox = {
      min: { x: 1, y: 1, z: 1 },
      max: { x: 5, y: 5, z: 5 },
    };
    expect(aabbIntersects(box, box)).toBe(true);
  });

  it("is commutative", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 3, y: 3, z: 3 },
    };
    const b: BoundingBox = {
      min: { x: 2, y: 2, z: 2 },
      max: { x: 5, y: 5, z: 5 },
    };
    expect(aabbIntersects(a, b)).toBe(aabbIntersects(b, a));
  });

  it("returns false when separated on only X axis", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 1, y: 5, z: 5 },
    };
    const b: BoundingBox = {
      min: { x: 2, y: 0, z: 0 },
      max: { x: 3, y: 5, z: 5 },
    };
    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("returns false when separated on only Y axis", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 5, y: 1, z: 5 },
    };
    const b: BoundingBox = {
      min: { x: 0, y: 2, z: 0 },
      max: { x: 5, y: 3, z: 5 },
    };
    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("returns false when separated on only Z axis", () => {
    const a: BoundingBox = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 5, y: 5, z: 1 },
    };
    const b: BoundingBox = {
      min: { x: 0, y: 0, z: 2 },
      max: { x: 5, y: 5, z: 3 },
    };
    expect(aabbIntersects(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// aabbContainsPoint
// ---------------------------------------------------------------------------

describe("aabbContainsPoint", () => {
  const box: BoundingBox = {
    min: { x: 0, y: 0, z: 0 },
    max: { x: 10, y: 10, z: 10 },
  };

  it("returns true for point inside", () => {
    expect(aabbContainsPoint(box, { x: 5, y: 5, z: 5 })).toBe(true);
  });

  it("returns true for point on min boundary", () => {
    expect(aabbContainsPoint(box, { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it("returns true for point on max boundary", () => {
    expect(aabbContainsPoint(box, { x: 10, y: 10, z: 10 })).toBe(true);
  });

  it("returns true for point on face (partial boundary)", () => {
    expect(aabbContainsPoint(box, { x: 0, y: 5, z: 5 })).toBe(true);
  });

  it("returns false for point outside on X", () => {
    expect(aabbContainsPoint(box, { x: 11, y: 5, z: 5 })).toBe(false);
  });

  it("returns false for point outside on Y", () => {
    expect(aabbContainsPoint(box, { x: 5, y: -1, z: 5 })).toBe(false);
  });

  it("returns false for point outside on Z", () => {
    expect(aabbContainsPoint(box, { x: 5, y: 5, z: 11 })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Direction constants
// ---------------------------------------------------------------------------

describe("Direction", () => {
  it("FORWARD is (0, 0, -1)", () => {
    expect(Direction.FORWARD).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("BACKWARD is (0, 0, 1)", () => {
    expect(Direction.BACKWARD).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("LEFT is (-1, 0, 0)", () => {
    expect(Direction.LEFT).toEqual({ x: -1, y: 0, z: 0 });
  });

  it("RIGHT is (1, 0, 0)", () => {
    expect(Direction.RIGHT).toEqual({ x: 1, y: 0, z: 0 });
  });

  it("UP is (0, 1, 0)", () => {
    expect(Direction.UP).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("DOWN is (0, -1, 0)", () => {
    expect(Direction.DOWN).toEqual({ x: 0, y: -1, z: 0 });
  });

  it("direction vectors are frozen", () => {
    expect(Object.isFrozen(Direction.FORWARD)).toBe(true);
    expect(Object.isFrozen(Direction.UP)).toBe(true);
  });

  it("Direction object itself is frozen", () => {
    expect(Object.isFrozen(Direction)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Integration: aabbFromEntity → aabbIntersects
// ---------------------------------------------------------------------------

describe("entity AABB integration", () => {
  it("detects collision between overlapping models", () => {
    const a = new SModel();
    a.position = { x: 0, y: 0, z: 0 };
    a.size = { width: 2, height: 2, depth: 2 };

    const b = new SModel();
    b.position = { x: 1, y: 0, z: 0 };
    b.size = { width: 2, height: 2, depth: 2 };

    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(true);
  });

  it("detects no collision between separated models", () => {
    const a = new SModel();
    a.position = { x: 0, y: 0, z: 0 };
    a.size = { width: 1, height: 1, depth: 1 };

    const b = new SModel();
    b.position = { x: 10, y: 0, z: 0 };
    b.size = { width: 1, height: 1, depth: 1 };

    expect(aabbIntersects(aabbFromEntity(a), aabbFromEntity(b))).toBe(false);
  });

  it("detects point inside entity's AABB", () => {
    const model = new SModel();
    model.position = { x: 5, y: 5, z: 5 };
    model.size = { width: 4, height: 4, depth: 4 };

    const box = aabbFromEntity(model);
    expect(aabbContainsPoint(box, { x: 5, y: 5, z: 5 })).toBe(true);
    expect(aabbContainsPoint(box, { x: 3, y: 3, z: 3 })).toBe(true);
    expect(aabbContainsPoint(box, { x: 0, y: 0, z: 0 })).toBe(false);
  });
});
