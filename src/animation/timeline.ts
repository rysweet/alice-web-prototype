import { BaseAnimation, animationStateOf, clamp01, ensurePositiveDuration, resolveEasing, sanitizeDelta, type Keyframe, type PropertyAnimationConfig, type TimelineSample, type TweenConfig, type TweenState, type ValueAnimationClip, type ValueAnimationState } from "./core.js";

export class AnimationTimeline<T> {
  readonly #keyframes: Keyframe<T>[];
  readonly #interpolate: (a: T, b: T, t: number) => T;
  constructor(keyframes: readonly Keyframe<T>[], interpolate: (a: T, b: T, t: number) => T) {
    if (keyframes.length < 2) throw new TypeError("AnimationTimeline requires at least two keyframes");
    this.#keyframes = [...keyframes].sort((left, right) => left.timeMs - right.timeMs);
    for (let index = 0; index < this.#keyframes.length; index += 1) {
      const frame = this.#keyframes[index];
      if (!Number.isFinite(frame.timeMs) || frame.timeMs < 0) throw new TypeError(`keyframe timeMs must be a finite non-negative number, got ${frame.timeMs}`);
      if (index > 0 && frame.timeMs < this.#keyframes[index - 1]!.timeMs) throw new TypeError("keyframes must be sorted by ascending timeMs");
    }
    this.#interpolate = interpolate;
  }
  get durationMs(): number { return this.#keyframes[this.#keyframes.length - 1]!.timeMs - this.#keyframes[0]!.timeMs; }
  sampleAt(timeMs: number): TimelineSample<T> {
    const first = this.#keyframes[0]!; const last = this.#keyframes[this.#keyframes.length - 1]!;
    const clampedTime = Math.min(Math.max(timeMs, first.timeMs), last.timeMs);
    const durationMs = this.durationMs; const progress = durationMs === 0 ? 1 : (clampedTime - first.timeMs) / durationMs;
    if (clampedTime <= first.timeMs) return { value: first.value, progress };
    if (clampedTime >= last.timeMs) return { value: last.value, progress };
    let lo = 0, hi = this.#keyframes.length - 2;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (this.#keyframes[mid + 1]!.timeMs < clampedTime) lo = mid + 1; else hi = mid; }
    const start = this.#keyframes[lo]!; const end = this.#keyframes[lo + 1]!;
    const segmentDuration = end.timeMs - start.timeMs;
    const rawPortion = segmentDuration === 0 ? 1 : (clampedTime - start.timeMs) / segmentDuration;
    const easedPortion = resolveEasing(start.easing)(clamp01(rawPortion));
    return { value: this.#interpolate(start.value, end.value, easedPortion), progress };
  }
}

export class Tween<T> implements ValueAnimationClip<T> {
  readonly #timeline: AnimationTimeline<T>; #elapsedMs = 0; #isComplete = false; #value: T;
  constructor(private readonly config: TweenConfig<T>) { ensurePositiveDuration(config.durationMs); this.#timeline = new AnimationTimeline<T>([{ timeMs: 0, value: config.from, easing: config.easing }, { timeMs: config.durationMs, value: config.to }], config.interpolate); this.#value = config.from; }
  get elapsedMs(): number { return this.#elapsedMs; } get durationMs(): number { return this.config.durationMs; } get progress(): number { return Math.min(this.#elapsedMs / this.config.durationMs, 1); } get complete(): boolean { return this.#isComplete; } get isComplete(): boolean { return this.#isComplete; } get value(): T { return this.#value; }
  update(deltaMs: number): TweenState<T> { const safeDelta = sanitizeDelta(deltaMs); this.#elapsedMs = Math.min(this.#elapsedMs + safeDelta, this.config.durationMs); const sample = this.#timeline.sampleAt(this.#elapsedMs); this.#value = sample.value; this.#isComplete = this.#elapsedMs >= this.config.durationMs; return { value: this.#value, elapsedMs: this.#elapsedMs, durationMs: this.durationMs, progress: this.progress, complete: this.#isComplete }; }
  reset(): void { this.#elapsedMs = 0; this.#isComplete = false; this.#value = this.config.from; }
}

export class PropertyAnimation<T> extends BaseAnimation implements ValueAnimationClip<T> {
  readonly #timeline: AnimationTimeline<T>; readonly #setValue: (value: T) => void; #value: T; readonly #from: T;
  constructor(config: PropertyAnimationConfig<T>) { ensurePositiveDuration(config.durationMs); super(config.durationMs, config.observer); this.#timeline = new AnimationTimeline<T>([{ timeMs: 0, value: config.from, easing: config.easing }, { timeMs: config.durationMs, value: config.to }], config.interpolate); this.#setValue = config.setValue; this.#from = config.from; this.#value = config.from; }
  get value(): T { return this.#value; }
  override update(deltaMs: number): ValueAnimationState<T> { this.beginIfNeeded(); this.elapsedMsInternal = Math.min(this.elapsedMsInternal + sanitizeDelta(deltaMs), this.durationMs); const sample = this.#timeline.sampleAt(this.elapsedMsInternal); this.#value = sample.value; this.#setValue(this.#value); this.completeInternal = this.elapsedMsInternal >= this.durationMs; this.notifyUpdated(); if (this.completeInternal) this.finishIfNeeded(); return { value: this.#value, ...animationStateOf(this) }; }
  override reset(): void { super.reset(); this.#value = this.#from; this.#setValue(this.#from); }
}
