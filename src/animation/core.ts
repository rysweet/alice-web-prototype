import type { Orientation, Size, Vec3 } from "../story-api";

export type EasingFn = (t: number) => number;
export interface Style { calculatePortion(timeElapsed: number, timeTotal: number): number; }
export type AnimationStyleLike = EasingFn | Style;
export interface AnimationClipState { readonly elapsedMs: number; readonly durationMs: number; readonly progress: number; readonly complete: boolean; }
export interface AnimationClip extends AnimationClipState { readonly isComplete: boolean; update(deltaMs: number): AnimationClipState; reset(): void; }
export interface ValueAnimationState<T> extends AnimationClipState { readonly value: T; }
export interface ValueAnimationClip<T> extends AnimationClip { readonly value: T; update(deltaMs: number): ValueAnimationState<T>; }
export interface AnimationObserver { started?(animation: AnimationClip): void; updated?(animation: AnimationClip, state: AnimationClipState): void; finished?(animation: AnimationClip): void; completed?(animation: AnimationClip): void; }
export interface TweenConfig<T> { from: T; to: T; durationMs: number; easing: AnimationStyleLike; interpolate: (a: T, b: T, t: number) => T; }
export interface TweenState<T> extends AnimationClipState { value: T; }
export interface Keyframe<T> { readonly timeMs: number; readonly value: T; readonly easing?: AnimationStyleLike; }
export interface TimelineSample<T> { readonly value: T; readonly progress: number; }
export interface PropertyAnimationConfig<T> extends TweenConfig<T> { readonly setValue: (value: T) => void; readonly observer?: AnimationObserver; }

export function clamp01(value: number): number { if (!Number.isFinite(value)) return 0; return Math.min(Math.max(value, 0), 1); }
export function sanitizeDelta(deltaMs: number): number { return Number.isFinite(deltaMs) && deltaMs > 0 ? deltaMs : 0; }
export function ensurePositiveDuration(durationMs: number): void { if (!Number.isFinite(durationMs) || durationMs <= 0) throw new TypeError(`durationMs must be a finite positive number, got ${durationMs}`); }
export function resolveEasing(easing: AnimationStyleLike | undefined): EasingFn { if (!easing) return linear; if (typeof easing === "function") return easing; return (t) => easing.calculatePortion(clamp01(t), 1); }
export function animationStateOf(animation: AnimationClip): AnimationClipState { return { elapsedMs: animation.elapsedMs, durationMs: animation.durationMs, progress: animation.progress, complete: animation.complete }; }

export abstract class BaseAnimation implements AnimationClip {
  protected elapsedMsInternal = 0; protected started = false; protected completeInternal = false; protected finished = false;
  constructor(public readonly durationMs: number, protected readonly observer?: AnimationObserver) { if (!Number.isFinite(durationMs) || durationMs < 0) throw new TypeError(`durationMs must be a finite non-negative number, got ${durationMs}`); }
  get elapsedMs(): number { return this.elapsedMsInternal; } get progress(): number { return this.durationMs === 0 ? 1 : Math.min(this.elapsedMsInternal / this.durationMs, 1); }
  get complete(): boolean { return this.completeInternal; } get isComplete(): boolean { return this.completeInternal; }
  reset(): void { this.elapsedMsInternal = 0; this.started = false; this.completeInternal = false; this.finished = false; }
  protected beginIfNeeded(): void { if (!this.started) { this.started = true; this.observer?.started?.(this); } }
  protected notifyUpdated(): void { this.observer?.updated?.(this, animationStateOf(this)); }
  protected finishIfNeeded(): void { if (this.completeInternal && !this.finished) { this.finished = true; this.observer?.finished?.(this); this.observer?.completed?.(this); } }
  abstract update(deltaMs: number): AnimationClipState;
}

export function linear(t: number): number { return t; }
export function easeIn(t: number): number { return t * t; }
export function easeOut(t: number): number { return 1 - (1 - t) * (1 - t); }
export function easeInOut(t: number): number { return t * t * (3 - 2 * t); }
export function bounce(t: number): number { const portion = clamp01(t); const n1 = 7.5625; const d1 = 2.75; if (portion < 1 / d1) return n1 * portion * portion; if (portion < 2 / d1) { const shifted = portion - 1.5 / d1; return n1 * shifted * shifted + 0.75; } if (portion < 2.5 / d1) { const shifted = portion - 2.25 / d1; return n1 * shifted * shifted + 0.9375; } const shifted = portion - 2.625 / d1; return n1 * shifted * shifted + 0.984375; }

export class TraditionalStyle implements Style {
  static readonly BEGIN_AND_END_ABRUPTLY = Object.freeze(new TraditionalStyle(false, false));
  static readonly BEGIN_GENTLY_AND_END_ABRUPTLY = Object.freeze(new TraditionalStyle(true, false));
  static readonly BEGIN_ABRUPTLY_AND_END_GENTLY = Object.freeze(new TraditionalStyle(false, true));
  static readonly BEGIN_AND_END_GENTLY = Object.freeze(new TraditionalStyle(true, true));
  constructor(public readonly isSlowInDesired: boolean, public readonly isSlowOutDesired: boolean) {}
  private static gently(x: number, a: number, b: number): number { if (x < a) return ((b - 1) / (a * ((((b * b) - (a * b)) + a) - 1))) * x * x; if (x > b) { const a3 = 1 / ((((b * b) - (a * b)) + a) - 1); const b3 = -2 * a3; const c3 = 1 + a3; return (a3 * x * x) + (b3 * x) + c3; } const m = (2 * (b - 1)) / ((((b * b) - (a * b)) + a) - 1); const b2 = (-m * a) / 2; return (m * x) + b2; }
  calculatePortion(timeElapsed: number, timeTotal: number): number { if (timeTotal === 0) return 1; const portion = clamp01(timeElapsed / timeTotal); if (this.isSlowInDesired) return this.isSlowOutDesired ? TraditionalStyle.gently(portion, 0.3, 0.8) : TraditionalStyle.gently(portion, 0.99, 0.999); return this.isSlowOutDesired ? TraditionalStyle.gently(portion, 0.001, 0.01) : portion; }
}
export class AbruptStyle extends TraditionalStyle { constructor() { super(false, false); } }
export class GentleStyle extends TraditionalStyle { constructor() { super(true, true); } }
export const DEFAULT_STYLE: Style = TraditionalStyle.BEGIN_AND_END_GENTLY;
export function styleToEasing(style: AnimationStyleLike = DEFAULT_STYLE): EasingFn { return resolveEasing(style); }
export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }; }
export function nlerp(a: Orientation, b: Orientation, t: number): Orientation { const x = a.x + (b.x - a.x) * t; const y = a.y + (b.y - a.y) * t; const z = a.z + (b.z - a.z) * t; const w = a.w + (b.w - a.w) * t; const len = Math.sqrt(x * x + y * y + z * z + w * w); if (len === 0) return { x: 0, y: 0, z: 0, w: 1 }; const invLen = 1 / len; return { x: x * invLen, y: y * invLen, z: z * invLen, w: w * invLen }; }
export function lerpScalar(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function lerpSize(a: Size, b: Size, t: number): Size { return { width: lerpScalar(a.width, b.width, t), height: lerpScalar(a.height, b.height, t), depth: lerpScalar(a.depth, b.depth, t) }; }
