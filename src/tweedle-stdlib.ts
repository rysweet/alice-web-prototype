import type { Vec3, Orientation } from "./story-api/types";
import {
  SThing,
  STurnable,
  SMovableTurnable,
  SModel,
} from "./story-api/entities";

// ---------------------------------------------------------------------------
// Internal state (WeakMaps keep GC-friendly per-entity state)
// ---------------------------------------------------------------------------

const lastSaidText = new WeakMap<SThing, string>();
const lastThoughtText = new WeakMap<SThing, string>();
const delayLog: number[] = [];

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertInstance<T>(
  entity: unknown,
  ctor: abstract new (...args: any[]) => T,
  label: string,
): asserts entity is T {
  if (!(entity instanceof ctor)) {
    throw new TypeError(`${label} must be an instance of ${ctor.name}`);
  }
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function assertFiniteVec3(v: Vec3, label: string): void {
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) {
    throw new TypeError(`${label} coordinates must be finite numbers`);
  }
}

// ---------------------------------------------------------------------------
// say / think
// ---------------------------------------------------------------------------

/** Record speech text for an entity. */
export function say(entity: SThing, text: string): void {
  assertInstance(entity, SThing, "entity");
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }
  lastSaidText.set(entity, text);
}

/** Record thought text for an entity. */
export function think(entity: SThing, text: string): void {
  assertInstance(entity, SThing, "entity");
  if (typeof text !== "string") {
    throw new TypeError("text must be a string");
  }
  lastThoughtText.set(entity, text);
}

/** Retrieve last speech text (undefined if entity never spoke). */
export function getLastSaid(entity: SThing): string | undefined {
  return lastSaidText.get(entity);
}

/** Retrieve last thought text (undefined if entity never thought). */
export function getLastThought(entity: SThing): string | undefined {
  return lastThoughtText.get(entity);
}

// ---------------------------------------------------------------------------
// move
// ---------------------------------------------------------------------------

/** Translate an entity by direction × amount (world-space). */
export function move(entity: SMovableTurnable, direction: Vec3, amount: number): void {
  assertInstance(entity, SMovableTurnable, "entity");
  assertFiniteVec3(direction, "direction");
  assertFinite(amount, "amount");

  const pos = entity.position;
  entity.position = {
    x: pos.x + direction.x * amount,
    y: pos.y + direction.y * amount,
    z: pos.z + direction.z * amount,
  };
}

// ---------------------------------------------------------------------------
// Quaternion helpers
// ---------------------------------------------------------------------------

function multiplyQuaternions(a: Orientation, b: Orientation): Orientation {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

function quaternionFromAxisAngle(
  ax: number,
  ay: number,
  az: number,
  angle: number,
): Orientation {
  const half = angle / 2;
  const s = Math.sin(half);
  const c = Math.cos(half);
  return { x: ax * s, y: ay * s, z: az * s, w: c };
}

// ---------------------------------------------------------------------------
// turn / roll — shared rotation logic
// ---------------------------------------------------------------------------

function applyAxisRotation(
  entity: STurnable,
  direction: Vec3,
  amount: number,
  axisX: number,
  axisY: number,
  axisZ: number,
): void {
  assertInstance(entity, STurnable, "entity");
  assertFiniteVec3(direction, "direction");
  assertFinite(amount, "amount");

  const angle = -direction.x * amount;
  if (angle === 0) return;

  const delta = quaternionFromAxisAngle(axisX, axisY, axisZ, angle);
  entity.orientation = multiplyQuaternions(delta, entity.orientation);
}

/**
 * Rotate entity around Y axis (yaw).
 * LEFT direction → positive angle, RIGHT → negative (right-hand rule).
 */
export function turn(entity: STurnable, direction: Vec3, amount: number): void {
  applyAxisRotation(entity, direction, amount, 0, 1, 0);
}

/**
 * Rotate entity around Z axis (roll).
 * LEFT direction → positive angle, RIGHT → negative (right-hand rule).
 */
export function roll(entity: STurnable, direction: Vec3, amount: number): void {
  applyAxisRotation(entity, direction, amount, 0, 0, 1);
}

// ---------------------------------------------------------------------------
// resize / setOpacity / setColor
// ---------------------------------------------------------------------------

/** Multiply all dimensions of an SModel's size by a uniform factor. */
export function resize(entity: SModel, factor: number): void {
  assertInstance(entity, SModel, "entity");
  if (!Number.isFinite(factor) || factor <= 0) {
    throw new TypeError("factor must be a positive finite number");
  }

  const { width, height, depth } = entity.size;
  entity.size = {
    width: width * factor,
    height: height * factor,
    depth: depth * factor,
  };
}

/** Set the opacity of an SModel. Accepts any finite number (no clamping). */
export function setOpacity(entity: SModel, value: number): void {
  assertInstance(entity, SModel, "entity");
  assertFinite(value, "opacity");
  entity.opacity = value;
}

/** Set the color of an SModel. */
export function setColor(entity: SModel, color: string): void {
  assertInstance(entity, SModel, "entity");
  if (typeof color !== "string") {
    throw new TypeError("color must be a string");
  }
  if (color === "") {
    throw new TypeError("color must be a non-empty string");
  }
  entity.color = color;
}

// ---------------------------------------------------------------------------
// delay
// ---------------------------------------------------------------------------

/** Record a delay duration (non-blocking). */
export function delay(duration: number): void {
  if (!Number.isFinite(duration) || duration < 0) {
    throw new TypeError("duration must be a non-negative finite number");
  }
  delayLog.push(duration);
}

/** Get all recorded delays as a frozen array. */
export function getDelays(): readonly number[] {
  return Object.freeze([...delayLog]);
}

/** Clear all recorded delays. */
export function clearDelays(): void {
  delayLog.length = 0;
}
