import { BaseAnimation, animationStateOf, sanitizeDelta, type AnimationClip, type AnimationClipState, type AnimationObserver } from "./core.js";

export class SequentialAnimation extends BaseAnimation {
  readonly #children: AnimationClip[]; #currentIndex = 0;
  constructor(children: readonly AnimationClip[], observer?: AnimationObserver) { super(children.reduce((sum, child) => sum + child.durationMs, 0), observer); this.#children = [...children]; }
  override update(deltaMs: number): AnimationClipState { this.beginIfNeeded(); const safeDelta = sanitizeDelta(deltaMs); let remaining = safeDelta; while (remaining > 0 && this.#currentIndex < this.#children.length) { const child = this.#children[this.#currentIndex]!; const before = child.elapsedMs; child.update(remaining); const consumed = child.elapsedMs - before; if (child.isComplete) this.#currentIndex += 1; if (consumed <= 0) { if (!child.isComplete) break; } else remaining -= consumed; } this.elapsedMsInternal = Math.min(this.elapsedMsInternal + safeDelta, this.durationMs); this.completeInternal = this.#children.every((child) => child.isComplete); this.notifyUpdated(); if (this.completeInternal) this.finishIfNeeded(); return animationStateOf(this); }
  override reset(): void { super.reset(); this.#currentIndex = 0; for (const child of this.#children) child.reset(); }
}
export class ParallelAnimation extends BaseAnimation {
  readonly #children: AnimationClip[];
  constructor(children: readonly AnimationClip[], observer?: AnimationObserver) { super(children.reduce((max, child) => Math.max(max, child.durationMs), 0), observer); this.#children = [...children]; }
  override update(deltaMs: number): AnimationClipState { this.beginIfNeeded(); const safeDelta = sanitizeDelta(deltaMs); for (const child of this.#children) if (!child.isComplete) child.update(safeDelta); this.elapsedMsInternal = Math.min(this.elapsedMsInternal + safeDelta, this.durationMs); this.completeInternal = this.#children.every((child) => child.isComplete); this.notifyUpdated(); if (this.completeInternal) this.finishIfNeeded(); return animationStateOf(this); }
  override reset(): void { super.reset(); for (const child of this.#children) child.reset(); }
}
export function doInOrder(...children: AnimationClip[]): SequentialAnimation { return new SequentialAnimation(children); }
export function doTogether(...children: AnimationClip[]): ParallelAnimation { return new ParallelAnimation(children); }
