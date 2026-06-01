import { easeIn, easeInOut, easeOut, lerpScalar, linear } from "./animation";
import type { PoseableEntity } from "./poses";
import type { Size, Position, Orientation } from "./story-api/types";
import { IDENTITY_ORIENTATION } from "./story-api/expanded-math";

export const AnimationStyle = Object.freeze({
  BEGIN_GENTLY: "BEGIN_GENTLY",
  END_GENTLY: "END_GENTLY",
  BEGIN_AND_END_GENTLY: "BEGIN_AND_END_GENTLY",
  NONE: "NONE",
} as const);

export type AnimationStyle = (typeof AnimationStyle)[keyof typeof AnimationStyle];

export interface AnimationFrame {
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
  readonly complete: boolean;
}

export interface BubbleState {
  readonly kind: "say" | "think";
  readonly text: string;
  readonly durationMs: number;
  readonly visible: boolean;
  readonly progress: number;
}

export interface BubbleHost {
  bubble: BubbleState | null;
}

export interface ResizableEntity {
  size: Size;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(Math.max(value, 0), 1);
}

function sanitizeDelta(deltaMs: number): number {
  return Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0;
}

function cloneSize(size: Size): Size {
  return { width: size.width, height: size.height, depth: size.depth };
}

function resolveStyle(style: AnimationStyle): (portion: number) => number {
  switch (style) {
    case AnimationStyle.BEGIN_GENTLY:
      return easeIn;
    case AnimationStyle.END_GENTLY:
      return easeOut;
    case AnimationStyle.BEGIN_AND_END_GENTLY:
      return easeInOut;
    case AnimationStyle.NONE:
    default:
      return linear;
  }
}

export abstract class DurationAnimation {
  protected elapsedMsInternal = 0;
  protected completeInternal = false;
  private readonly easingFn: (portion: number) => number;

  constructor(
    public readonly durationMs: number,
    public readonly style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new TypeError(`durationMs must be a finite non-negative number, got ${durationMs}`);
    }
    this.easingFn = resolveStyle(style);
  }

  get elapsedMs(): number {
    return this.elapsedMsInternal;
  }

  get progress(): number {
    if (this.durationMs === 0) {
      return 1;
    }
    return clamp01(this.elapsedMsInternal / this.durationMs);
  }

  get isComplete(): boolean {
    return this.completeInternal;
  }

  get complete(): boolean {
    return this.completeInternal;
  }

  get remainingMs(): number {
    return Math.max(this.durationMs - this.elapsedMsInternal, 0);
  }

  reset(): void {
    this.elapsedMsInternal = 0;
    this.completeInternal = false;
    this.apply(0);
  }

  update(deltaMs: number): AnimationFrame {
    if (this.completeInternal) {
      return this.snapshot();
    }
    const nextElapsed = this.durationMs === 0
      ? this.durationMs
      : Math.min(this.elapsedMsInternal + sanitizeDelta(deltaMs), this.durationMs);
    this.elapsedMsInternal = nextElapsed;
    this.apply(this.easingFn(this.progress));
    if (this.elapsedMsInternal >= this.durationMs) {
      this.completeInternal = true;
      this.finish();
    }
    return this.snapshot();
  }

  protected finish(): void {
  }

  protected snapshot(): AnimationFrame {
    const progress = this.progress;
    return {
      elapsedMs: this.elapsedMsInternal,
      durationMs: this.durationMs,
      progress,
      complete: this.completeInternal,
    };
  }

  protected abstract apply(portion: number): void;
}

export class CompoundAnimation extends DurationAnimation {
  private constructor(
    readonly mode: "order" | "together",
    readonly animations: readonly DurationAnimation[],
  ) {
    super(
      mode === "order"
        ? animations.reduce((sum, animation) => sum + animation.durationMs, 0)
        : Math.max(0, ...animations.map((animation) => animation.durationMs)),
      AnimationStyle.NONE,
    );
  }

  static doInOrder(...animations: DurationAnimation[]): CompoundAnimation {
    return new CompoundAnimation("order", animations);
  }

  static doTogether(...animations: DurationAnimation[]): CompoundAnimation {
    return new CompoundAnimation("together", animations);
  }

  reset(): void {
    super.reset();
    for (const animation of this.animations) {
      animation.reset();
    }
  }

  update(deltaMs: number): AnimationFrame {
    if (this.completeInternal) {
      return this.snapshot();
    }
    const previousElapsed = this.elapsedMsInternal;
    this.elapsedMsInternal = this.durationMs === 0
      ? this.durationMs
      : Math.min(this.elapsedMsInternal + sanitizeDelta(deltaMs), this.durationMs);
    if (this.mode === "order") {
      this.advanceInOrder(previousElapsed, this.elapsedMsInternal);
    } else {
      this.advanceTogether(previousElapsed, this.elapsedMsInternal);
    }
    if (this.elapsedMsInternal >= this.durationMs) {
      this.completeInternal = true;
    }
    return this.snapshot();
  }

  // No-op: CompoundAnimation delegates to child animations
  protected apply(): void {
  }

  private advanceTogether(previousElapsed: number, nextElapsed: number): void {
    for (const animation of this.animations) {
      const previousLocal = Math.min(previousElapsed, animation.durationMs);
      const nextLocal = Math.min(nextElapsed, animation.durationMs);
      const delta = nextLocal - previousLocal;
      if (delta > 0 || (animation.durationMs === 0 && nextElapsed === 0 && !animation.isComplete)) {
        animation.update(delta);
      }
    }
  }

  private advanceInOrder(previousElapsed: number, nextElapsed: number): void {
    let offset = 0;
    for (const animation of this.animations) {
      const previousLocal = Math.min(Math.max(previousElapsed - offset, 0), animation.durationMs);
      const nextLocal = Math.min(Math.max(nextElapsed - offset, 0), animation.durationMs);
      const delta = nextLocal - previousLocal;
      if (delta > 0 || (animation.durationMs === 0 && nextLocal === 0 && previousLocal === 0 && !animation.isComplete)) {
        animation.update(delta);
      }
      offset += animation.durationMs;
    }
  }
}

export class DelayAnimation extends DurationAnimation {
  // No-op: DelayAnimation only tracks elapsed time
  protected apply(): void {
  }
}

abstract class BubbleAnimationBase extends DurationAnimation {
  constructor(
    protected readonly host: BubbleHost,
    protected readonly text: string,
    durationMs: number,
    protected readonly kind: "say" | "think",
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
  }

  protected apply(portion: number): void {
    this.host.bubble = {
      kind: this.kind,
      text: this.text,
      durationMs: this.durationMs,
      visible: true,
      progress: portion,
    };
  }

  protected finish(): void {
    this.host.bubble = null;
  }
}

export class SayBubbleAnimation extends BubbleAnimationBase {
  constructor(host: BubbleHost, text: string, durationMs: number, style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY) {
    super(host, text, durationMs, "say", style);
  }
}

export class ThinkBubbleAnimation extends BubbleAnimationBase {
  constructor(host: BubbleHost, text: string, durationMs: number, style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY) {
    super(host, text, durationMs, "think", style);
  }
}

export class SetDimensionAnimation extends DurationAnimation {
  private startSize: Size;

  constructor(
    private readonly target: ResizableEntity,
    private readonly dimension: keyof Size,
    private readonly targetValue: number,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startSize = cloneSize(target.size);
  }

  reset(): void {
    this.startSize = cloneSize(this.target.size);
    super.reset();
  }

  protected apply(portion: number): void {
    const start = this.startSize[this.dimension];
    this.target.size = {
      ...this.startSize,
      [this.dimension]: lerpScalar(start, this.targetValue, portion),
    };
  }

  protected finish(): void {
    this.target.size = {
      ...this.startSize,
      [this.dimension]: this.targetValue,
    };
  }
}

export class StrikePoseAnimation extends DurationAnimation {
  private readonly startRotations: Record<string, number>;

  constructor(
    private readonly target: PoseableEntity,
    private readonly pose: Record<string, number>,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startRotations = { ...target.jointRotations };
  }

  reset(): void {
    Object.assign(this.startRotations, this.target.jointRotations);
    super.reset();
  }

  protected apply(portion: number): void {
    const current = this.target.jointRotations;
    const next: Record<string, number> = {};
    for (const key in current) {
      next[key] = current[key];
    }
    for (const [jointName, targetRotation] of Object.entries(this.pose)) {
      const startRotation = this.startRotations[jointName] ?? 0;
      next[jointName] = lerpScalar(startRotation, targetRotation, portion);
    }
    this.target.jointRotations = next;
  }

  protected finish(): void {
    this.target.jointRotations = {
      ...this.target.jointRotations,
      ...this.pose,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Named story-specific animation classes (Alice3 parity)
// ═══════════════════════════════════════════════════════════════════════════

interface PositionedEntity {
  position: Position;
}

interface OrientedEntity extends PositionedEntity {
  orientation: Orientation;
}

interface JointedEntity {
  jointRotations: Record<string, number>;
}

interface WingedEntity extends JointedEntity {
  readonly wingJointNames?: readonly string[];
}

function lerpPosition(from: Position, to: Position, portion: number): Position {
  return {
    x: lerpScalar(from.x, to.x, portion),
    y: lerpScalar(from.y, to.y, portion),
    z: lerpScalar(from.z, to.z, portion),
  };
}

function lerpOrientation(from: Orientation, to: Orientation, portion: number): Orientation {
  const result = {
    x: lerpScalar(from.x, to.x, portion),
    y: lerpScalar(from.y, to.y, portion),
    z: lerpScalar(from.z, to.z, portion),
    w: lerpScalar(from.w, to.w, portion),
  };
  const len = Math.sqrt(result.x * result.x + result.y * result.y + result.z * result.z + result.w * result.w) || 1;
  return { x: result.x / len, y: result.y / len, z: result.z / len, w: result.w / len };
}

function lookAtOrientation(from: Position, to: Position): Orientation {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const mag = Math.sqrt(dx * dx + dz * dz);
  if (mag === 0) return IDENTITY_ORIENTATION;
  const yaw = Math.atan2(-dx, -dz);
  const halfYaw = yaw / 2;
  return { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) };
}

function pointAtOrientation(from: Position, to: Position): Orientation {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const mag = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (mag === 0) return IDENTITY_ORIENTATION;
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.asin(dy / mag);
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2);
  const sp = Math.sin(pitch / 2);
  return {
    x: cy * sp,
    y: sy * cp,
    z: -sy * sp,
    w: cy * cp,
  };
}

export class MoveToAnimation extends DurationAnimation {
  private readonly startPos: Position;

  constructor(
    private readonly entity: PositionedEntity,
    private readonly target: Position,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startPos = { ...entity.position };
  }

  protected apply(portion: number): void {
    this.entity.position = lerpPosition(this.startPos, this.target, portion);
  }
}

export class MoveTowardAnimation extends DurationAnimation {
  private readonly startPos: Position;
  private readonly targetPos: Position;

  constructor(
    private readonly entity: PositionedEntity,
    target: Position,
    private readonly amount: number,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startPos = { ...entity.position };
    const dx = target.x - this.startPos.x;
    const dy = target.y - this.startPos.y;
    const dz = target.z - this.startPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const scale = amount / dist;
    this.targetPos = {
      x: this.startPos.x + dx * scale,
      y: this.startPos.y + dy * scale,
      z: this.startPos.z + dz * scale,
    };
  }

  protected apply(portion: number): void {
    this.entity.position = lerpPosition(this.startPos, this.targetPos, portion);
  }
}

export class OrientToAnimation extends DurationAnimation {
  private readonly startOrientation: Orientation;
  private readonly targetOrientation: Orientation;

  constructor(
    private readonly entity: OrientedEntity,
    target: Position,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startOrientation = { ...entity.orientation };
    this.targetOrientation = pointAtOrientation(entity.position, target);
  }

  protected apply(portion: number): void {
    this.entity.orientation = lerpOrientation(this.startOrientation, this.targetOrientation, portion);
  }
}

// PointAt is semantically identical to OrientTo (full 3D facing toward target)
export class PointAtAnimation extends OrientToAnimation {}

export class TurnToFaceAnimation extends DurationAnimation {
  private readonly startOrientation: Orientation;
  private readonly targetOrientation: Orientation;

  constructor(
    private readonly entity: OrientedEntity,
    target: Position,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startOrientation = { ...entity.orientation };
    this.targetOrientation = lookAtOrientation(entity.position, target);
  }

  protected apply(portion: number): void {
    this.entity.orientation = lerpOrientation(this.startOrientation, this.targetOrientation, portion);
  }
}

export class PlaceAnimation extends DurationAnimation {
  private readonly startPos: Position;

  constructor(
    private readonly entity: PositionedEntity,
    private readonly target: Position,
    durationMs = 0,
    style: AnimationStyle = AnimationStyle.NONE,
  ) {
    super(durationMs, style);
    this.startPos = { ...entity.position };
  }

  protected apply(portion: number): void {
    this.entity.position = portion >= 1 ? { ...this.target } : lerpPosition(this.startPos, this.target, portion);
  }
}

export class StraightenOutJointsAnimation extends DurationAnimation {
  private readonly startRotations: Record<string, number>;
  private readonly jointKeys: string[];
  private readonly output: Record<string, number>;

  constructor(
    private readonly target: JointedEntity,
    durationMs: number,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.startRotations = { ...target.jointRotations };
    this.jointKeys = Object.keys(this.startRotations);
    this.output = Object.create(null) as Record<string, number>;
  }

  protected apply(portion: number): void {
    const { output, startRotations, jointKeys } = this;
    for (let i = 0; i < jointKeys.length; i++) {
      const key = jointKeys[i];
      output[key] = lerpScalar(startRotations[key], 0, portion);
    }
    this.target.jointRotations = output;
  }
}

export class FoldWingsAnimation extends DurationAnimation {
  private readonly wingStartRotations: Record<string, number>;
  private readonly wingJoints: readonly string[];
  private static readonly DEFAULT_WING_JOINTS = [
    "LEFT_WING_SHOULDER", "LEFT_WING_ELBOW", "LEFT_WING_WRIST", "LEFT_WING_TIP",
    "RIGHT_WING_SHOULDER", "RIGHT_WING_ELBOW", "RIGHT_WING_WRIST", "RIGHT_WING_TIP",
  ] as const;

  constructor(
    private readonly target: WingedEntity,
    durationMs: number,
    private readonly foldAngle = 90,
    style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    super(durationMs, style);
    this.wingJoints = target.wingJointNames ?? FoldWingsAnimation.DEFAULT_WING_JOINTS;
    // Only snapshot the wing joints we'll actually animate
    const starts: Record<string, number> = Object.create(null) as Record<string, number>;
    for (const joint of this.wingJoints) {
      starts[joint] = target.jointRotations[joint] ?? 0;
    }
    this.wingStartRotations = starts;
  }

  protected apply(portion: number): void {
    const rotations = this.target.jointRotations;
    for (const joint of this.wingJoints) {
      rotations[joint] = lerpScalar(this.wingStartRotations[joint], this.foldAngle, portion);
    }
    this.target.jointRotations = rotations;
  }
}
