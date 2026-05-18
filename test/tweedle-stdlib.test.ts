import { describe, it, expect, beforeEach } from "vitest";
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
import {
  SThing,
  STurnable,
  SMovableTurnable,
  SModel,
  SBiped,
  SCamera,
} from "../src/story-api/entities";
import { Direction } from "../src/collision-detection";

// ---------------------------------------------------------------------------
// say / getLastSaid
// ---------------------------------------------------------------------------

describe("say", () => {
  it("records text retrievable via getLastSaid", () => {
    const entity = new SBiped();
    say(entity, "Hello!");
    expect(getLastSaid(entity)).toBe("Hello!");
  });

  it("overwrites previous text", () => {
    const entity = new SBiped();
    say(entity, "First");
    say(entity, "Second");
    expect(getLastSaid(entity)).toBe("Second");
  });

  it("tracks text per entity independently", () => {
    const a = new SBiped();
    const b = new SBiped();
    say(a, "A speaks");
    say(b, "B speaks");
    expect(getLastSaid(a)).toBe("A speaks");
    expect(getLastSaid(b)).toBe("B speaks");
  });

  it("returns undefined for entity that never spoke", () => {
    const entity = new SBiped();
    expect(getLastSaid(entity)).toBeUndefined();
  });

  it("throws TypeError for non-SThing entity", () => {
    expect(() => say({} as any, "text")).toThrow(TypeError);
  });

  it("throws TypeError for non-string text", () => {
    const entity = new SBiped();
    expect(() => say(entity, 42 as any)).toThrow(TypeError);
  });

  it("works on base SThing", () => {
    const entity = new SThing();
    say(entity, "I am a thing");
    expect(getLastSaid(entity)).toBe("I am a thing");
  });

  it("accepts empty string as valid text", () => {
    const entity = new SBiped();
    say(entity, "");
    expect(getLastSaid(entity)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// think / getLastThought
// ---------------------------------------------------------------------------

describe("think", () => {
  it("records thought retrievable via getLastThought", () => {
    const entity = new SBiped();
    think(entity, "Hmm...");
    expect(getLastThought(entity)).toBe("Hmm...");
  });

  it("overwrites previous thought", () => {
    const entity = new SBiped();
    think(entity, "First");
    think(entity, "Second");
    expect(getLastThought(entity)).toBe("Second");
  });

  it("is independent from say", () => {
    const entity = new SBiped();
    say(entity, "Said text");
    think(entity, "Thought text");
    expect(getLastSaid(entity)).toBe("Said text");
    expect(getLastThought(entity)).toBe("Thought text");
  });

  it("returns undefined for entity that never thought", () => {
    const entity = new SBiped();
    expect(getLastThought(entity)).toBeUndefined();
  });

  it("throws TypeError for non-SThing entity", () => {
    expect(() => think({} as any, "text")).toThrow(TypeError);
  });

  it("throws TypeError for non-string text", () => {
    const entity = new SBiped();
    expect(() => think(entity, null as any)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

describe("move", () => {
  it("moves entity forward along -Z", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.FORWARD, 3);
    expect(model.position).toEqual({ x: 0, y: 0, z: -3 });
  });

  it("moves entity right along +X", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.RIGHT, 5);
    expect(model.position).toEqual({ x: 5, y: 0, z: 0 });
  });

  it("moves entity up along +Y", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.UP, 2);
    expect(model.position).toEqual({ x: 0, y: 2, z: 0 });
  });

  it("accumulates multiple moves", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.RIGHT, 5);
    move(model, Direction.UP, 2);
    expect(model.position).toEqual({ x: 5, y: 2, z: 0 });
  });

  it("handles arbitrary direction vectors", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, { x: 1, y: 1, z: 0 }, 3);
    expect(model.position).toEqual({ x: 3, y: 3, z: 0 });
  });

  it("handles negative amount (backward movement)", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };
    move(model, Direction.FORWARD, -2);
    expect(model.position).toEqual({ x: 0, y: 0, z: 2 });
  });

  it("handles zero amount (no movement)", () => {
    const model = new SModel();
    model.position = { x: 5, y: 3, z: 1 };
    move(model, Direction.FORWARD, 0);
    expect(model.position).toEqual({ x: 5, y: 3, z: 1 });
  });

  it("works with SCamera (SMovableTurnable subclass)", () => {
    const cam = new SCamera();
    cam.position = { x: 0, y: 0, z: 0 };
    move(cam, Direction.BACKWARD, 10);
    expect(cam.position).toEqual({ x: 0, y: 0, z: 10 });
  });

  it("throws TypeError for non-SMovableTurnable entity", () => {
    const turnable = new STurnable();
    expect(() => move(turnable as any, Direction.FORWARD, 1)).toThrow(
      TypeError,
    );
  });

  it("throws TypeError for non-finite amount", () => {
    const model = new SModel();
    expect(() => move(model, Direction.FORWARD, NaN)).toThrow(TypeError);
  });

  it("throws TypeError for Infinity amount", () => {
    const model = new SModel();
    expect(() => move(model, Direction.FORWARD, Infinity)).toThrow(TypeError);
  });

  it("throws TypeError for non-finite direction coordinates", () => {
    const model = new SModel();
    expect(() => move(model, { x: NaN, y: 0, z: 0 }, 1)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// turn
// ---------------------------------------------------------------------------

describe("turn", () => {
  it("applies Y-axis rotation (yaw)", () => {
    const model = new SModel();
    // Identity quaternion: { x: 0, y: 0, z: 0, w: 1 }
    turn(model, Direction.LEFT, Math.PI / 2);
    const o = model.orientation;

    // 90° left around Y: q = { x: 0, y: sin(π/4), z: 0, w: cos(π/4) }
    expect(o.x).toBeCloseTo(0, 5);
    expect(o.y).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(o.z).toBeCloseTo(0, 5);
    expect(o.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("turns RIGHT with negative angle", () => {
    const model = new SModel();
    turn(model, Direction.RIGHT, Math.PI / 2);
    const o = model.orientation;

    // 90° right around Y: q = { x: 0, y: -sin(π/4), z: 0, w: cos(π/4) }
    expect(o.x).toBeCloseTo(0, 5);
    expect(o.y).toBeCloseTo(-Math.sin(Math.PI / 4), 5);
    expect(o.z).toBeCloseTo(0, 5);
    expect(o.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("zero turn preserves identity orientation", () => {
    const model = new SModel();
    turn(model, Direction.LEFT, 0);
    expect(model.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("composes two 90° turns into 180°", () => {
    const model = new SModel();
    turn(model, Direction.LEFT, Math.PI / 2);
    turn(model, Direction.LEFT, Math.PI / 2);
    const o = model.orientation;

    // 180° around Y: q = { x: 0, y: 1, z: 0, w: 0 }
    expect(o.x).toBeCloseTo(0, 5);
    expect(Math.abs(o.y)).toBeCloseTo(1, 5);
    expect(o.z).toBeCloseTo(0, 5);
    expect(o.w).toBeCloseTo(0, 4);
  });

  it("FORWARD direction produces no rotation (x=0)", () => {
    const model = new SModel();
    turn(model, Direction.FORWARD, Math.PI / 2);
    // FORWARD has x=0, so no rotation sign → no-op
    expect(model.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("throws TypeError for non-STurnable entity", () => {
    const thing = new SThing();
    expect(() => turn(thing as any, Direction.LEFT, 1)).toThrow(TypeError);
  });

  it("throws TypeError for non-finite amount", () => {
    const model = new SModel();
    expect(() => turn(model, Direction.LEFT, NaN)).toThrow(TypeError);
  });

  it("throws TypeError for non-finite direction", () => {
    const model = new SModel();
    expect(() => turn(model, { x: NaN, y: 0, z: 0 }, 1)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// roll
// ---------------------------------------------------------------------------

describe("roll", () => {
  it("applies Z-axis rotation", () => {
    const model = new SModel();
    roll(model, Direction.LEFT, Math.PI / 2);
    const o = model.orientation;

    // 90° left around Z: q = { x: 0, y: 0, z: sin(π/4), w: cos(π/4) }
    expect(o.x).toBeCloseTo(0, 5);
    expect(o.y).toBeCloseTo(0, 5);
    expect(o.z).toBeCloseTo(Math.sin(Math.PI / 4), 5);
    expect(o.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("rolls RIGHT with negative angle", () => {
    const model = new SModel();
    roll(model, Direction.RIGHT, Math.PI / 2);
    const o = model.orientation;

    expect(o.x).toBeCloseTo(0, 5);
    expect(o.y).toBeCloseTo(0, 5);
    expect(o.z).toBeCloseTo(-Math.sin(Math.PI / 4), 5);
    expect(o.w).toBeCloseTo(Math.cos(Math.PI / 4), 5);
  });

  it("zero roll preserves identity orientation", () => {
    const model = new SModel();
    roll(model, Direction.LEFT, 0);
    expect(model.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("throws TypeError for non-STurnable entity", () => {
    const thing = new SThing();
    expect(() => roll(thing as any, Direction.LEFT, 1)).toThrow(TypeError);
  });

  it("throws TypeError for non-finite amount", () => {
    const model = new SModel();
    expect(() => roll(model, Direction.LEFT, Infinity)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// resize
// ---------------------------------------------------------------------------

describe("resize", () => {
  it("doubles all dimensions", () => {
    const model = new SModel();
    model.size = { width: 2, height: 3, depth: 1 };
    resize(model, 2);
    expect(model.size).toEqual({ width: 4, height: 6, depth: 2 });
  });

  it("halves all dimensions", () => {
    const model = new SModel();
    model.size = { width: 4, height: 6, depth: 2 };
    resize(model, 0.5);
    expect(model.size).toEqual({ width: 2, height: 3, depth: 1 });
  });

  it("factor of 1 preserves size", () => {
    const model = new SModel();
    model.size = { width: 5, height: 5, depth: 5 };
    resize(model, 1);
    expect(model.size).toEqual({ width: 5, height: 5, depth: 5 });
  });

  it("works with SBiped (SModel subclass)", () => {
    const biped = new SBiped();
    biped.size = { width: 1, height: 2, depth: 1 };
    resize(biped, 3);
    expect(biped.size).toEqual({ width: 3, height: 6, depth: 3 });
  });

  it("throws TypeError for non-SModel entity", () => {
    const turnable = new STurnable();
    expect(() => resize(turnable as any, 2)).toThrow(TypeError);
  });

  it("throws TypeError for zero factor", () => {
    const model = new SModel();
    expect(() => resize(model, 0)).toThrow(TypeError);
  });

  it("throws TypeError for negative factor", () => {
    const model = new SModel();
    expect(() => resize(model, -1)).toThrow(TypeError);
  });

  it("throws TypeError for NaN factor", () => {
    const model = new SModel();
    expect(() => resize(model, NaN)).toThrow(TypeError);
  });

  it("throws TypeError for Infinity factor", () => {
    const model = new SModel();
    expect(() => resize(model, Infinity)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// setOpacity
// ---------------------------------------------------------------------------

describe("setOpacity", () => {
  it("sets opacity to 0.5", () => {
    const model = new SModel();
    setOpacity(model, 0.5);
    expect(model.opacity).toBe(0.5);
  });

  it("sets opacity to 0", () => {
    const model = new SModel();
    setOpacity(model, 0);
    expect(model.opacity).toBe(0);
  });

  it("sets opacity to 1", () => {
    const model = new SModel();
    model.opacity = 0.3;
    setOpacity(model, 1);
    expect(model.opacity).toBe(1);
  });

  it("accepts values outside 0-1 (no clamping)", () => {
    const model = new SModel();
    setOpacity(model, -0.5);
    expect(model.opacity).toBe(-0.5);
    setOpacity(model, 2.0);
    expect(model.opacity).toBe(2.0);
  });

  it("throws TypeError for non-SModel entity", () => {
    const turnable = new STurnable();
    expect(() => setOpacity(turnable as any, 0.5)).toThrow(TypeError);
  });

  it("throws TypeError for NaN", () => {
    const model = new SModel();
    expect(() => setOpacity(model, NaN)).toThrow(TypeError);
  });

  it("throws TypeError for Infinity", () => {
    const model = new SModel();
    expect(() => setOpacity(model, Infinity)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// setColor
// ---------------------------------------------------------------------------

describe("setColor", () => {
  it("sets color to RED", () => {
    const model = new SModel();
    setColor(model, "RED");
    expect(model.color).toBe("RED");
  });

  it("sets color to BLUE", () => {
    const model = new SModel();
    setColor(model, "BLUE");
    expect(model.color).toBe("BLUE");
  });

  it("overwrites existing color", () => {
    const model = new SModel();
    setColor(model, "RED");
    setColor(model, "GREEN");
    expect(model.color).toBe("GREEN");
  });

  it("throws TypeError for non-SModel entity", () => {
    const turnable = new STurnable();
    expect(() => setColor(turnable as any, "RED")).toThrow(TypeError);
  });

  it("throws TypeError for non-string color", () => {
    const model = new SModel();
    expect(() => setColor(model, 42 as any)).toThrow(TypeError);
  });

  it("throws TypeError for empty string color", () => {
    const model = new SModel();
    expect(() => setColor(model, "")).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// delay / getDelays / clearDelays
// ---------------------------------------------------------------------------

describe("delay", () => {
  beforeEach(() => {
    clearDelays();
  });

  it("records a single delay", () => {
    delay(1.5);
    expect(getDelays()).toEqual([1.5]);
  });

  it("accumulates multiple delays in order", () => {
    delay(1.0);
    delay(0.5);
    delay(2.0);
    expect(getDelays()).toEqual([1.0, 0.5, 2.0]);
  });

  it("records zero delay", () => {
    delay(0);
    expect(getDelays()).toEqual([0]);
  });

  it("returns frozen array from getDelays", () => {
    delay(1.0);
    const delays = getDelays();
    expect(Object.isFrozen(delays)).toBe(true);
  });

  it("clearDelays empties the list", () => {
    delay(1.0);
    delay(2.0);
    clearDelays();
    expect(getDelays()).toEqual([]);
  });

  it("throws TypeError for negative duration", () => {
    expect(() => delay(-1)).toThrow(TypeError);
  });

  it("throws TypeError for NaN duration", () => {
    expect(() => delay(NaN)).toThrow(TypeError);
  });

  it("throws TypeError for Infinity duration", () => {
    expect(() => delay(Infinity)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// Integration: move + turn compose
// ---------------------------------------------------------------------------

describe("stdlib integration", () => {
  it("move after turn changes position based on world-space direction", () => {
    const model = new SModel();
    model.position = { x: 0, y: 0, z: 0 };

    // Move forward (world space -Z)
    move(model, Direction.FORWARD, 5);
    expect(model.position.z).toBeCloseTo(-5);

    // Move right (world space +X)
    move(model, Direction.RIGHT, 3);
    expect(model.position.x).toBeCloseTo(3);
    expect(model.position.z).toBeCloseTo(-5);
  });

  it("say and think are independent state channels", () => {
    const entity = new SBiped();
    say(entity, "Hello");
    think(entity, "Goodbye");

    expect(getLastSaid(entity)).toBe("Hello");
    expect(getLastThought(entity)).toBe("Goodbye");

    say(entity, "New speech");
    expect(getLastSaid(entity)).toBe("New speech");
    expect(getLastThought(entity)).toBe("Goodbye");
  });

  it("resize + setOpacity + setColor compose", () => {
    const model = new SModel();
    model.size = { width: 1, height: 1, depth: 1 };

    resize(model, 3);
    setOpacity(model, 0.7);
    setColor(model, "PURPLE");

    expect(model.size).toEqual({ width: 3, height: 3, depth: 3 });
    expect(model.opacity).toBe(0.7);
    expect(model.color).toBe("PURPLE");
  });
});
