import { describe, it, expect } from "vitest";
import {
  linear,
  easeIn,
  easeOut,
  easeInOut,
  lerpVec3,
  nlerp,
  lerpScalar,
  Tween,
  type EasingFn,
  type TweenConfig,
  type TweenState,
} from "../src/animation";
import type { Vec3 } from "../src/story-api";
import type { Orientation } from "../src/story-api";

// ---------------------------------------------------------------------------
// Easing Functions
// ---------------------------------------------------------------------------

describe("easing functions", () => {
  describe("linear", () => {
    it("returns 0 at t=0", () => {
      expect(linear(0)).toBe(0);
    });

    it("returns 1 at t=1", () => {
      expect(linear(1)).toBe(1);
    });

    it("returns 0.5 at t=0.5", () => {
      expect(linear(0.5)).toBe(0.5);
    });

    it("returns 0.25 at t=0.25", () => {
      expect(linear(0.25)).toBe(0.25);
    });
  });

  describe("easeIn (t²)", () => {
    it("returns 0 at t=0", () => {
      expect(easeIn(0)).toBe(0);
    });

    it("returns 1 at t=1", () => {
      expect(easeIn(1)).toBe(1);
    });

    it("returns 0.25 at t=0.5 (0.5² = 0.25)", () => {
      expect(easeIn(0.5)).toBeCloseTo(0.25, 10);
    });

    it("returns 0.01 at t=0.1", () => {
      expect(easeIn(0.1)).toBeCloseTo(0.01, 10);
    });
  });

  describe("easeOut (1-(1-t)²)", () => {
    it("returns 0 at t=0", () => {
      expect(easeOut(0)).toBe(0);
    });

    it("returns 1 at t=1", () => {
      expect(easeOut(1)).toBe(1);
    });

    it("returns 0.75 at t=0.5", () => {
      expect(easeOut(0.5)).toBeCloseTo(0.75, 10);
    });

    it("returns 0.19 at t=0.1", () => {
      // 1 - (1-0.1)² = 1 - 0.81 = 0.19
      expect(easeOut(0.1)).toBeCloseTo(0.19, 10);
    });
  });

  describe("easeInOut (3t²-2t³ smoothstep)", () => {
    it("returns 0 at t=0", () => {
      expect(easeInOut(0)).toBe(0);
    });

    it("returns 1 at t=1", () => {
      expect(easeInOut(1)).toBe(1);
    });

    it("returns 0.5 at t=0.5 (symmetric midpoint)", () => {
      expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    });

    it("returns < 0.5 for t=0.25 (slow start)", () => {
      // 3*(0.25)² - 2*(0.25)³ = 3*0.0625 - 2*0.015625 = 0.1875 - 0.03125 = 0.15625
      expect(easeInOut(0.25)).toBeCloseTo(0.15625, 10);
    });

    it("returns > 0.5 for t=0.75 (slow end)", () => {
      // 3*(0.75)² - 2*(0.75)³ = 3*0.5625 - 2*0.421875 = 1.6875 - 0.84375 = 0.84375
      expect(easeInOut(0.75)).toBeCloseTo(0.84375, 10);
    });
  });

  describe("all easings pass through (0,0) and (1,1)", () => {
    const easings: [string, EasingFn][] = [
      ["linear", linear],
      ["easeIn", easeIn],
      ["easeOut", easeOut],
      ["easeInOut", easeInOut],
    ];

    for (const [name, fn] of easings) {
      it(`${name}(0) === 0`, () => {
        expect(fn(0)).toBe(0);
      });

      it(`${name}(1) === 1`, () => {
        expect(fn(1)).toBe(1);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Interpolation Functions
// ---------------------------------------------------------------------------

describe("lerpVec3", () => {
  const a: Vec3 = { x: 0, y: 0, z: 0 };
  const b: Vec3 = { x: 10, y: 20, z: -6 };

  it("returns start at t=0", () => {
    const result = lerpVec3(a, b, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.z).toBe(0);
  });

  it("returns end at t=1", () => {
    const result = lerpVec3(a, b, 1);
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.z).toBe(-6);
  });

  it("returns midpoint at t=0.5", () => {
    const result = lerpVec3(a, b, 0.5);
    expect(result.x).toBeCloseTo(5, 10);
    expect(result.y).toBeCloseTo(10, 10);
    expect(result.z).toBeCloseTo(-3, 10);
  });

  it("returns quarter point at t=0.25", () => {
    const result = lerpVec3(a, b, 0.25);
    expect(result.x).toBeCloseTo(2.5, 10);
    expect(result.y).toBeCloseTo(5, 10);
    expect(result.z).toBeCloseTo(-1.5, 10);
  });

  it("interpolates between two non-origin vectors", () => {
    const from: Vec3 = { x: 10, y: 10, z: 10 };
    const to: Vec3 = { x: 20, y: 30, z: 0 };
    const result = lerpVec3(from, to, 0.5);
    expect(result.x).toBeCloseTo(15, 10);
    expect(result.y).toBeCloseTo(20, 10);
    expect(result.z).toBeCloseTo(5, 10);
  });
});

describe("nlerp (quaternion)", () => {
  const identity: Orientation = { x: 0, y: 0, z: 0, w: 1 };
  const rotated90Y: Orientation = { x: 0, y: 0.7071067811865475, z: 0, w: 0.7071067811865475 };

  it("returns start at t=0 (normalized)", () => {
    const result = nlerp(identity, rotated90Y, 0);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0, 5);
    expect(result.z).toBeCloseTo(0, 5);
    expect(result.w).toBeCloseTo(1, 5);
  });

  it("returns end at t=1 (normalized)", () => {
    const result = nlerp(identity, rotated90Y, 1);
    expect(result.x).toBeCloseTo(0, 5);
    expect(result.y).toBeCloseTo(0.7071067811865475, 5);
    expect(result.z).toBeCloseTo(0, 5);
    expect(result.w).toBeCloseTo(0.7071067811865475, 5);
  });

  it("returns a unit quaternion at t=0.5", () => {
    const result = nlerp(identity, rotated90Y, 0.5);
    const length = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2);
    expect(length).toBeCloseTo(1, 5);
  });

  it("returns identity quaternion for zero-length interpolation", () => {
    // Two opposite quaternions that cancel out at t=0.5
    const a: Orientation = { x: 0, y: 0, z: 0, w: 0 };
    const b: Orientation = { x: 0, y: 0, z: 0, w: 0 };
    const result = nlerp(a, b, 0.5);
    expect(result).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("always returns a normalized quaternion", () => {
    for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const result = nlerp(identity, rotated90Y, t);
      const length = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2 + result.w ** 2);
      expect(length).toBeCloseTo(1, 5);
    }
  });
});

describe("lerpScalar", () => {
  it("returns start at t=0", () => {
    expect(lerpScalar(0, 1, 0)).toBe(0);
  });

  it("returns end at t=1", () => {
    expect(lerpScalar(0, 1, 1)).toBe(1);
  });

  it("returns 0.75 for lerp(0, 1, 0.75)", () => {
    expect(lerpScalar(0, 1, 0.75)).toBeCloseTo(0.75, 10);
  });

  it("returns 150 for lerp(100, 200, 0.5)", () => {
    expect(lerpScalar(100, 200, 0.5)).toBeCloseTo(150, 10);
  });

  it("interpolates negative values", () => {
    expect(lerpScalar(-10, 10, 0.5)).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// Tween Class
// ---------------------------------------------------------------------------

describe("Tween", () => {
  function makeVec3Config(overrides: Partial<TweenConfig<Vec3>> = {}): TweenConfig<Vec3> {
    return {
      from: { x: 0, y: 0, z: 0 },
      to: { x: 10, y: 0, z: 0 },
      durationMs: 1000,
      easing: linear,
      interpolate: lerpVec3,
      ...overrides,
    };
  }

  function makeScalarConfig(overrides: Partial<TweenConfig<number>> = {}): TweenConfig<number> {
    return {
      from: 0,
      to: 1,
      durationMs: 1000,
      easing: linear,
      interpolate: lerpScalar,
      ...overrides,
    };
  }

  describe("constructor validation", () => {
    it("throws TypeError for durationMs = 0", () => {
      expect(() => new Tween(makeScalarConfig({ durationMs: 0 }))).toThrow(TypeError);
    });

    it("throws TypeError for negative durationMs", () => {
      expect(() => new Tween(makeScalarConfig({ durationMs: -100 }))).toThrow(TypeError);
    });

    it("throws TypeError for NaN durationMs", () => {
      expect(() => new Tween(makeScalarConfig({ durationMs: NaN }))).toThrow(TypeError);
    });

    it("throws TypeError for Infinity durationMs", () => {
      expect(() => new Tween(makeScalarConfig({ durationMs: Infinity }))).toThrow(TypeError);
    });

    it("throws TypeError for -Infinity durationMs", () => {
      expect(() => new Tween(makeScalarConfig({ durationMs: -Infinity }))).toThrow(TypeError);
    });

    it("accepts valid positive durationMs", () => {
      expect(() => new Tween(makeScalarConfig({ durationMs: 1 }))).not.toThrow();
      expect(() => new Tween(makeScalarConfig({ durationMs: 0.001 }))).not.toThrow();
      expect(() => new Tween(makeScalarConfig({ durationMs: 60000 }))).not.toThrow();
    });
  });

  describe("update lifecycle", () => {
    it("starts at the 'from' value before any update", () => {
      const tween = new Tween(makeScalarConfig());
      const state = tween.update(0);
      expect(state.value).toBe(0);
      expect(state.progress).toBe(0);
      expect(state.complete).toBe(false);
    });

    it("progresses linearly with linear easing", () => {
      const tween = new Tween(makeScalarConfig());
      const state = tween.update(500); // 50%
      expect(state.value).toBeCloseTo(0.5, 10);
      expect(state.progress).toBeCloseTo(0.5, 10);
      expect(state.complete).toBe(false);
    });

    it("completes at exactly durationMs", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(500);
      const state = tween.update(500); // total 1000ms
      expect(state.value).toBe(1);
      expect(state.progress).toBe(1);
      expect(state.complete).toBe(true);
    });

    it("clamps at 1 when overshooting duration", () => {
      const tween = new Tween(makeScalarConfig());
      const state = tween.update(5000); // way past 1000ms
      expect(state.value).toBe(1);
      expect(state.progress).toBe(1);
      expect(state.complete).toBe(true);
    });

    it("stays complete on subsequent updates after completion", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(2000);
      const state = tween.update(100); // extra update after done
      expect(state.value).toBe(1);
      expect(state.progress).toBe(1);
      expect(state.complete).toBe(true);
    });

    it("accumulates delta across multiple updates", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(250); // 25%
      tween.update(250); // 50%
      const state = tween.update(250); // 75%
      expect(state.value).toBeCloseTo(0.75, 10);
      expect(state.progress).toBeCloseTo(0.75, 10);
    });
  });

  describe("easing integration", () => {
    it("applies easeIn to progress", () => {
      const tween = new Tween(makeScalarConfig({ easing: easeIn }));
      const state = tween.update(500); // raw progress 0.5, eased 0.25
      expect(state.value).toBeCloseTo(0.25, 5);
      expect(state.progress).toBeCloseTo(0.5, 10); // raw progress
    });

    it("applies easeOut to progress", () => {
      const tween = new Tween(makeScalarConfig({ easing: easeOut }));
      const state = tween.update(500); // raw progress 0.5, eased 0.75
      expect(state.value).toBeCloseTo(0.75, 5);
    });

    it("applies easeInOut to progress", () => {
      const tween = new Tween(makeScalarConfig({ easing: easeInOut }));
      const state = tween.update(500); // raw progress 0.5, eased 0.5
      expect(state.value).toBeCloseTo(0.5, 5);
    });
  });

  describe("Vec3 tween", () => {
    it("interpolates position correctly", () => {
      const tween = new Tween(makeVec3Config({
        from: { x: 0, y: 0, z: 0 },
        to: { x: 10, y: 20, z: -6 },
      }));

      const state = tween.update(500); // 50%
      expect(state.value.x).toBeCloseTo(5, 5);
      expect(state.value.y).toBeCloseTo(10, 5);
      expect(state.value.z).toBeCloseTo(-3, 5);
    });

    it("reaches exact 'to' value at completion", () => {
      const tween = new Tween(makeVec3Config({
        to: { x: 5, y: 0, z: -3 },
      }));

      const state = tween.update(1000);
      expect(state.value).toEqual({ x: 5, y: 0, z: -3 });
      expect(state.complete).toBe(true);
    });
  });

  describe("quaternion tween via nlerp", () => {
    it("interpolates orientation and stays normalized", () => {
      const tween = new Tween<Orientation>({
        from: { x: 0, y: 0, z: 0, w: 1 },
        to: { x: 0, y: 0.7071067811865475, z: 0, w: 0.7071067811865475 },
        durationMs: 1000,
        easing: linear,
        interpolate: nlerp,
      });

      const state = tween.update(500);
      const len = Math.sqrt(
        state.value.x ** 2 + state.value.y ** 2 +
        state.value.z ** 2 + state.value.w ** 2,
      );
      expect(len).toBeCloseTo(1, 5);
      expect(state.complete).toBe(false);
    });
  });

  describe("opacity (scalar) tween", () => {
    it("fades out from 1 to 0 over 500ms", () => {
      const tween = new Tween(makeScalarConfig({
        from: 1,
        to: 0,
        durationMs: 500,
        easing: easeOut,
      }));

      const mid = tween.update(250); // 50% progress, eased 0.75
      expect(mid.value).toBeCloseTo(0.25, 5); // lerp(1, 0, 0.75) = 0.25
      expect(mid.complete).toBe(false);

      const end = tween.update(250); // done
      expect(end.value).toBe(0);
      expect(end.complete).toBe(true);
    });
  });

  describe("negative and NaN delta handling", () => {
    it("treats negative deltaMs as 0 (time doesn't go backwards)", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(500);
      const state = tween.update(-100);
      // Should stay at 500ms (50%), not go to 400ms
      expect(state.progress).toBeCloseTo(0.5, 10);
    });

    it("treats NaN deltaMs as 0", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(500);
      const state = tween.update(NaN);
      expect(state.progress).toBeCloseTo(0.5, 10);
    });
  });

  describe("isComplete getter", () => {
    it("returns false before completion", () => {
      const tween = new Tween(makeScalarConfig());
      expect(tween.isComplete).toBe(false);
      tween.update(500);
      expect(tween.isComplete).toBe(false);
    });

    it("returns true after completion", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(1000);
      expect(tween.isComplete).toBe(true);
    });

    it("returns true after overshooting", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(5000);
      expect(tween.isComplete).toBe(true);
    });
  });

  describe("reset()", () => {
    it("resets elapsed time to 0", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(1000); // complete
      expect(tween.isComplete).toBe(true);

      tween.reset();
      expect(tween.isComplete).toBe(false);

      const state = tween.update(0);
      expect(state.value).toBe(0);
      expect(state.progress).toBe(0);
      expect(state.complete).toBe(false);
    });

    it("allows replaying the full tween after reset", () => {
      const tween = new Tween(makeScalarConfig());
      tween.update(1000);
      tween.reset();

      const mid = tween.update(500);
      expect(mid.value).toBeCloseTo(0.5, 10);

      const end = tween.update(500);
      expect(end.value).toBe(1);
      expect(end.complete).toBe(true);
    });
  });

  describe("concurrent tweens are independent", () => {
    it("two tweens produce independent state", () => {
      const positionTween = new Tween(makeVec3Config({ durationMs: 2000 }));
      const opacityTween = new Tween(makeScalarConfig({ durationMs: 500 }));

      // After 500ms: position at 25%, opacity at 100%
      const pos = positionTween.update(500);
      const opa = opacityTween.update(500);

      expect(pos.progress).toBeCloseTo(0.25, 10);
      expect(pos.complete).toBe(false);
      expect(opa.progress).toBe(1);
      expect(opa.complete).toBe(true);
    });

    it("updating one tween does not affect the other", () => {
      const t1 = new Tween(makeScalarConfig());
      const t2 = new Tween(makeScalarConfig());

      t1.update(1000); // complete
      const s2 = t2.update(500); // 50%

      expect(t1.isComplete).toBe(true);
      expect(s2.progress).toBeCloseTo(0.5, 10);
      expect(s2.complete).toBe(false);
    });
  });

  describe("very small durations", () => {
    it("handles 1ms duration", () => {
      const tween = new Tween(makeScalarConfig({ durationMs: 1 }));
      const state = tween.update(1);
      expect(state.complete).toBe(true);
      expect(state.value).toBe(1);
    });

    it("handles fractional durationMs", () => {
      const tween = new Tween(makeScalarConfig({ durationMs: 0.5 }));
      const state = tween.update(0.5);
      expect(state.complete).toBe(true);
      expect(state.value).toBe(1);
    });
  });
});
