/**
 * Pure-functional tween engine for Alice animation system.
 * Supports position (Vec3), orientation (quaternion via nlerp), and opacity (scalar).
 * No DOM dependency — works in browser and Node.js.
 */
import type { Vec3, Orientation } from "./story-api";

/** An easing function maps a raw progress [0,1] to an eased value [0,1]. */
export type EasingFn = (t: number) => number;

/** Configuration for a Tween instance. */
export interface TweenConfig<T> {
  from: T;
  to: T;
  durationMs: number;
  easing: EasingFn;
  interpolate: (a: T, b: T, t: number) => T;
}

/** Snapshot of tween state returned by update(). */
export interface TweenState<T> {
  value: T;
  progress: number;
  complete: boolean;
}

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

export function linear(t: number): number {
  return t;
}

export function easeIn(t: number): number {
  return t * t;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Cubic smoothstep: 3t² − 2t³ */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Interpolation functions
// ---------------------------------------------------------------------------

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/** Normalized linear interpolation for quaternions. Falls back to identity for zero-length result. */
export function nlerp(a: Orientation, b: Orientation, t: number): Orientation {
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  const z = a.z + (b.z - a.z) * t;
  const w = a.w + (b.w - a.w) * t;

  const len = Math.sqrt(x * x + y * y + z * z + w * w);
  if (len === 0) {
    return { x: 0, y: 0, z: 0, w: 1 };
  }
  const invLen = 1 / len;
  return { x: x * invLen, y: y * invLen, z: z * invLen, w: w * invLen };
}

export function lerpScalar(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Tween class
// ---------------------------------------------------------------------------

export class Tween<T> {
  private readonly config: TweenConfig<T>;
  private elapsedMs = 0;
  private _isComplete = false;

  constructor(config: TweenConfig<T>) {
    if (!Number.isFinite(config.durationMs) || config.durationMs <= 0) {
      throw new TypeError(
        `durationMs must be a finite positive number, got ${config.durationMs}`,
      );
    }
    this.config = config;
  }

  /** Advance the tween by deltaMs and return the current state. */
  update(deltaMs: number): TweenState<T> {
    const safeDelta = Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
    this.elapsedMs += safeDelta;

    const rawProgress = Math.min(this.elapsedMs / this.config.durationMs, 1);
    const easedT = this.config.easing(rawProgress);
    const value = this.config.interpolate(
      this.config.from,
      this.config.to,
      easedT,
    );
    this._isComplete = rawProgress >= 1;

    return { value, progress: rawProgress, complete: this._isComplete };
  }

  get isComplete(): boolean {
    return this._isComplete;
  }

  reset(): void {
    this.elapsedMs = 0;
    this._isComplete = false;
  }
}
