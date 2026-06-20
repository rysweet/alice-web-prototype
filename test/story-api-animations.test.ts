import { describe, expect, it } from "vitest";
import {
  AnimationStyle,
  CompoundAnimation,
  DelayAnimation,
  DurationAnimation,
  SayBubbleAnimation,
  SetDimensionAnimation,
  StrikePoseAnimation,
  ThinkBubbleAnimation,
} from "../src/story-api-animations";

class RecordingAnimation extends DurationAnimation {
  readonly samples: number[] = [];

  protected apply(portion: number): void {
    this.samples.push(Number(portion.toFixed(4)));
  }
}

class FinishingAnimation extends RecordingAnimation {
  finishCount = 0;

  protected override finish(): void {
    this.finishCount += 1;
  }
}

describe("story-api-animations", () => {
  it("applies configured animation styles", () => {
    const abrupt = new RecordingAnimation(1000, AnimationStyle.NONE);
    const gentle = new RecordingAnimation(1000, AnimationStyle.BEGIN_GENTLY);

    abrupt.update(250);
    gentle.update(250);

    expect(abrupt.samples.at(-1)).toBe(0.25);
    expect(gentle.samples.at(-1)).toBeLessThan(0.25);
  });

  it("waits through delay animations", () => {
    const animation = new DelayAnimation(500, AnimationStyle.NONE);

    expect(animation.update(250)).toEqual({ elapsedMs: 250, durationMs: 500, progress: 0.5, complete: false });
    expect(animation.update(250)).toEqual({ elapsedMs: 500, durationMs: 500, progress: 1, complete: true });
  });

  it("calls the optional finish hook when a duration animation completes", () => {
    const animation = new FinishingAnimation(100, AnimationStyle.NONE);

    animation.update(100);
    animation.update(100);

    expect(animation.finishCount).toBe(1);
  });

  it("runs compound animations in order and together", () => {
    const first = new RecordingAnimation(100, AnimationStyle.NONE);
    const second = new RecordingAnimation(100, AnimationStyle.NONE);
    const inOrder = CompoundAnimation.doInOrder(first, second);

    inOrder.update(100);
    expect(first.isComplete).toBe(true);
    expect(second.isComplete).toBe(false);

    inOrder.update(100);
    expect(second.isComplete).toBe(true);

    const parallelA = new RecordingAnimation(100, AnimationStyle.NONE);
    const parallelB = new RecordingAnimation(200, AnimationStyle.NONE);
    const together = CompoundAnimation.doTogether(parallelA, parallelB);

    together.update(100);
    expect(parallelA.isComplete).toBe(true);
    expect(parallelB.isComplete).toBe(false);
  });

  it("shows and hides say and think bubbles over their duration", () => {
    const host: { bubble: any } = { bubble: null };
    const say = new SayBubbleAnimation(host, "Hello world", 400);

    say.update(200);
    expect(host.bubble).toMatchObject({ kind: "say", text: "Hello world", visible: true });
    say.update(200);
    expect(host.bubble).toBeNull();

    const think = new ThinkBubbleAnimation(host, "Hmm", 300);
    think.update(150);
    expect(host.bubble).toMatchObject({ kind: "think", text: "Hmm", visible: true });
  });

  it("resizes one dimension at a time", () => {
    const target = { size: { width: 1, height: 2, depth: 3 } };
    const animation = new SetDimensionAnimation(target, "height", 10, 1000, AnimationStyle.NONE);

    animation.update(500);
    expect(target.size).toEqual({ width: 1, height: 6, depth: 3 });

    animation.update(500);
    expect(target.size).toEqual({ width: 1, height: 10, depth: 3 });
  });

  it("strikes a pose by interpolating all target joints", () => {
    const target = { jointRotations: { arm: 0, leg: 10, spine: 5 } };
    const animation = new StrikePoseAnimation(target, { arm: 90, leg: -20 }, 1000, AnimationStyle.NONE);

    animation.update(500);
    expect(target.jointRotations).toEqual({ arm: 45, leg: -5, spine: 5 });

    animation.update(500);
    expect(target.jointRotations).toEqual({ arm: 90, leg: -20, spine: 5 });
  });
});
