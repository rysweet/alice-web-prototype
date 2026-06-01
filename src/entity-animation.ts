import {
  DEFAULT_STYLE,
  PropertyAnimation,
  lerpScalar,
  lerpSize,
  lerpVec3,
  nlerp,
  type AnimationClip,
  type AnimationClipState,
  type AnimationStyleLike,
  type ValueAnimationClip,
  type ValueAnimationState,
} from "./animation";
import { type ModelImp } from "./story-api/expanded-implementation";
import {
  clonePosition,
  type Orientation,
  type Position,
  type RollDirection,
  type Size,
} from "./story-api/expanded-types";
import { quaternionFromAxisAngle, quaternionMultiply } from "./story-api/expanded-math";
import { SCamera, SModel, SThing } from "./story-api";

export interface Axis {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface PositionableEntity extends SThing {
  position: Position;
}

interface OrientableEntity extends PositionableEntity {
  orientation: Orientation;
}

interface ResizableEntity extends SModel {
  size: Size;
}

function sanitizeDuration(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new TypeError(`durationMs must be a finite non-negative number, got ${durationMs}`);
  }
  return durationMs;
}

function immediateState(durationMs = 0): AnimationClipState {
  return {
    elapsedMs: durationMs,
    durationMs,
    progress: 1,
    complete: true,
  };
}

class ImmediateAnimation implements AnimationClip {
  #complete = false;

  constructor(
    readonly durationMs: number,
    private readonly apply: () => void,
    private readonly resetEffect?: () => void,
  ) {
    sanitizeDuration(durationMs);
    this.apply();
    this.#complete = durationMs === 0;
  }

  get elapsedMs(): number {
    return this.#complete ? this.durationMs : 0;
  }

  get progress(): number {
    return this.#complete ? 1 : 0;
  }

  get complete(): boolean {
    return this.#complete;
  }

  get isComplete(): boolean {
    return this.#complete;
  }

  update(deltaMs: number): AnimationClipState {
    if (!this.#complete && deltaMs >= 0) {
      this.#complete = true;
    }
    return immediateState(this.durationMs);
  }

  reset(): void {
    this.resetEffect?.();
    this.#complete = false;
  }
}

function interpolatePaint(from: string, to: string, portion: number): string {
  const hex = /^#?([\da-f]{6})$/i;
  const fromMatch = hex.exec(from.trim());
  const toMatch = hex.exec(to.trim());
  if (!fromMatch || !toMatch) {
    return portion < 1 ? from : to;
  }
  const parse = (value: string): [number, number, number] => [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
  const [fromR, fromG, fromB] = parse(fromMatch[1]);
  const [toR, toG, toB] = parse(toMatch[1]);
  const channel = (left: number, right: number) => Math.round(lerpScalar(left, right, portion));
  return `#${channel(fromR, toR).toString(16).padStart(2, "0")}${channel(fromG, toG).toString(16).padStart(2, "0")}${channel(fromB, toB).toString(16).padStart(2, "0")}`;
}

function delegateImmediate(clip: AnimationClip | null, durationMs: number, apply: () => void): AnimationClip {
  return clip ?? new ImmediateAnimation(durationMs, apply);
}

export class MoveAnimation implements ValueAnimationClip<Position> {
  readonly #clip: PropertyAnimation<Position>;

  constructor(
    readonly entity: PositionableEntity,
    readonly delta: Position,
    readonly durationMs: number,
    readonly easing: AnimationStyleLike = DEFAULT_STYLE,
  ) {
    const from = entity.position;
    this.#clip = new PropertyAnimation<Position>({
      from,
      to: {
        x: from.x + delta.x,
        y: from.y + delta.y,
        z: from.z + delta.z,
      },
      durationMs: sanitizeDuration(durationMs),
      easing,
      interpolate: lerpVec3,
      setValue: (value) => {
        entity.position = value;
      },
    });
  }

  get value(): Position { return this.#clip.value; }
  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): ValueAnimationState<Position> { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class TurnAnimation implements ValueAnimationClip<Orientation> {
  readonly #clip: PropertyAnimation<Orientation>;

  constructor(
    readonly entity: OrientableEntity,
    readonly revolutions: number,
    readonly axis: Axis,
    readonly durationMs: number,
    readonly easing: AnimationStyleLike = DEFAULT_STYLE,
  ) {
    const from = entity.orientation;
    const delta = quaternionFromAxisAngle(axis.x, axis.y, axis.z, revolutions * Math.PI * 2);
    this.#clip = new PropertyAnimation<Orientation>({
      from,
      to: quaternionMultiply(delta, from),
      durationMs: sanitizeDuration(durationMs),
      easing,
      interpolate: nlerp,
      setValue: (value) => {
        entity.orientation = value;
      },
    });
  }

  get value(): Orientation { return this.#clip.value; }
  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): ValueAnimationState<Orientation> { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class RollAnimation extends TurnAnimation {
  constructor(entity: OrientableEntity, direction: RollDirection, revolutions: number, durationMs: number, easing: AnimationStyleLike = DEFAULT_STYLE) {
    super(entity, direction === "LEFT" ? revolutions : -revolutions, { x: 0, y: 0, z: 1 }, durationMs, easing);
  }
}

export class ResizeAnimation implements ValueAnimationClip<Size> {
  readonly #clip: PropertyAnimation<Size>;

  constructor(
    readonly entity: ResizableEntity,
    readonly to: Size,
    readonly durationMs: number,
    readonly easing: AnimationStyleLike = DEFAULT_STYLE,
  ) {
    this.#clip = new PropertyAnimation<Size>({
      from: entity.size,
      to,
      durationMs: sanitizeDuration(durationMs),
      easing,
      interpolate: lerpSize,
      setValue: (value) => {
        entity.size = value;
      },
    });
  }

  get value(): Size { return this.#clip.value; }
  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): ValueAnimationState<Size> { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class SetPaintAnimation implements ValueAnimationClip<string> {
  readonly #clip: PropertyAnimation<string>;

  constructor(
    readonly entity: SModel,
    readonly to: string,
    readonly durationMs: number,
    readonly easing: AnimationStyleLike = DEFAULT_STYLE,
  ) {
    this.#clip = new PropertyAnimation<string>({
      from: entity.color,
      to,
      durationMs: sanitizeDuration(durationMs),
      easing,
      interpolate: interpolatePaint,
      setValue: (value) => {
        entity.color = value;
      },
    });
  }

  get value(): string { return this.#clip.value; }
  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): ValueAnimationState<string> { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class SetOpacityAnimation implements ValueAnimationClip<number> {
  readonly #clip: PropertyAnimation<number>;

  constructor(
    readonly entity: SModel,
    readonly to: number,
    readonly durationMs: number,
    readonly easing: AnimationStyleLike = DEFAULT_STYLE,
  ) {
    this.#clip = new PropertyAnimation<number>({
      from: entity.opacity,
      to,
      durationMs: sanitizeDuration(durationMs),
      easing,
      interpolate: lerpScalar,
      setValue: (value) => {
        entity.opacity = value;
      },
    });
  }

  get value(): number { return this.#clip.value; }
  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): ValueAnimationState<number> { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class SayAnimation implements AnimationClip {
  readonly #clip: AnimationClip;

  constructor(readonly entity: SModel, readonly text: string, durationMs: number) {
    const safeDurationMs = sanitizeDuration(durationMs);
    const clip = (entity.imp as ModelImp).say(text, safeDurationMs / 1000);
    this.#clip = delegateImmediate(clip, safeDurationMs, () => {
      (entity.imp as ModelImp).say(text, 0);
    });
  }

  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get durationMs(): number { return this.#clip.durationMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): AnimationClipState { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class ThinkAnimation implements AnimationClip {
  readonly #clip: AnimationClip;

  constructor(readonly entity: SModel, readonly text: string, durationMs: number) {
    const safeDurationMs = sanitizeDuration(durationMs);
    const clip = (entity.imp as ModelImp).think(text, safeDurationMs / 1000);
    this.#clip = delegateImmediate(clip, safeDurationMs, () => {
      (entity.imp as ModelImp).think(text, 0);
    });
  }

  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get durationMs(): number { return this.#clip.durationMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): AnimationClipState { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class PlayAudioAnimation implements AnimationClip {
  readonly #clip: AnimationClip;
  readonly positionAtStart: Position | null;

  constructor(readonly entity: SThing, readonly source: string, durationMs = 0) {
    const safeDurationMs = sanitizeDuration(durationMs);
    const initialPosition = "position" in entity ? clonePosition((entity as PositionableEntity).position) : null;
    this.positionAtStart = initialPosition;
    this.#clip = new ImmediateAnimation(safeDurationMs, () => {
      entity.playAudio(source);
    });
  }

  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get durationMs(): number { return this.#clip.durationMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): AnimationClipState { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

export class VehicleAnimation implements AnimationClip {
  readonly #clip: AnimationClip;
  readonly previousVehicle: SThing | null;

  constructor(readonly entity: SModel | SCamera, readonly vehicle: SThing | null, durationMs = 0) {
    const safeDurationMs = sanitizeDuration(durationMs);
    this.previousVehicle = (entity.imp.vehicle?.owner as SThing | undefined) ?? null;
    this.#clip = new ImmediateAnimation(
      safeDurationMs,
      () => {
        entity.imp.setVehicle(vehicle?.imp ?? null);
      },
      () => {
        entity.imp.setVehicle(this.previousVehicle?.imp ?? null);
      },
    );
  }

  get elapsedMs(): number { return this.#clip.elapsedMs; }
  get durationMs(): number { return this.#clip.durationMs; }
  get progress(): number { return this.#clip.progress; }
  get complete(): boolean { return this.#clip.complete; }
  get isComplete(): boolean { return this.#clip.isComplete; }
  update(deltaMs: number): AnimationClipState { return this.#clip.update(deltaMs); }
  reset(): void { this.#clip.reset(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SayOutLoudAnimation — browser TTS parity via stub SpeechUtterance
// ═══════════════════════════════════════════════════════════════════════════

export interface SpeechUtterance {
  text: string;
  rate: number;
  pitch: number;
  volume: number;
}

export interface SayOutLoudOptions {
  text: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export class SayOutLoudAnimation implements AnimationClip {
  readonly text: string;
  readonly durationMs: number;
  readonly utterance: SpeechUtterance;
  private _elapsedMs = 0;
  private _complete: boolean;

  constructor(options: SayOutLoudOptions) {
    const rate = options.rate ?? 1.0;
    const pitch = options.pitch ?? 1.0;
    const volume = options.volume ?? 1.0;

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new TypeError(`rate must be a finite positive number, got ${rate}`);
    }
    if (!Number.isFinite(pitch) || pitch <= 0) {
      throw new TypeError(`pitch must be a finite positive number, got ${pitch}`);
    }

    this.text = options.text;
    this.durationMs = (options.text.length / (rate * 5)) * 1000;
    this.utterance = {
      text: options.text,
      rate,
      pitch,
      volume: clampUnit(Number.isFinite(volume) ? volume : 1),
    };
    this._complete = this.durationMs === 0;
  }

  get elapsedMs(): number {
    return this._elapsedMs;
  }

  get progress(): number {
    if (this.durationMs === 0) return 1;
    return Math.min(this._elapsedMs / this.durationMs, 1);
  }

  get complete(): boolean {
    return this._complete;
  }

  get isComplete(): boolean {
    return this._complete;
  }

  update(deltaMs: number): AnimationClipState {
    if (!this._complete && deltaMs > 0) {
      this._elapsedMs = Math.min(this._elapsedMs + deltaMs, this.durationMs);
      if (this._elapsedMs >= this.durationMs) {
        this._complete = true;
      }
    }
    return {
      elapsedMs: this._elapsedMs,
      durationMs: this.durationMs,
      progress: this.progress,
      complete: this._complete,
    };
  }

  reset(): void {
    this._elapsedMs = 0;
    this._complete = this.durationMs === 0;
  }
}
