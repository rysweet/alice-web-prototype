import { easeIn, easeInOut, easeOut, lerpScalar, linear } from "./animation";
import type { PoseableEntity } from "./poses";
import type { Size } from "./story-api/types";

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

  constructor(
    public readonly durationMs: number,
    public readonly style: AnimationStyle = AnimationStyle.BEGIN_AND_END_GENTLY,
  ) {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new TypeError(`durationMs must be a finite non-negative number, got ${durationMs}`);
    }
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
    this.apply(resolveStyle(this.style)(this.progress));
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
