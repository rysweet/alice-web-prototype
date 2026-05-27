import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  AnimationController,
  AnimationEvent,
  AnimationLayer,
  AnimationMixer,
  CrossFade,
  Retargeting,
} from "../src/animation-system.js";

describe("animation-system", () => {
  it("samples keyframes with linear and step interpolation", () => {
    const linearClip = new AnimationClip("linear", [
      { timeMs: 0, value: 0 },
      { timeMs: 1000, value: 10 },
    ]);
    const stepClip = new AnimationClip("step", [
      { timeMs: 0, value: 0 },
      { timeMs: 1000, value: 10, interpolation: "step" },
    ]);

    expect(linearClip.sample(500)).toBe(5);
    expect(stepClip.sample(500)).toBe(0);
  });

  it("fires animation events when advancing across their marker time", () => {
    const clip = new AnimationClip("events", [
      { timeMs: 0, value: 0 },
      { timeMs: 1000, value: 1 },
    ], "linear", [new AnimationEvent("footstep", 400, { surface: "stone" })]);

    expect(clip.eventsBetween(0, 399)).toEqual([]);
    expect(clip.eventsBetween(0, 450).map((event) => event.name)).toEqual(["footstep"]);
  });

  it("supports additive and override animation layers for partial poses", () => {
    const basePose = { upper: 1, lower: 2 };
    const layerPose = { upper: 3, lower: 9 };
    const additive = new AnimationLayer("upper-add", "additive", 0.5, ["upper"]);
    const override = new AnimationLayer("upper-override", "override", 0.25, ["upper"]);

    expect(additive.apply(basePose, layerPose)).toEqual({ upper: 2.5, lower: 2 });
    expect(override.apply(basePose, layerPose)).toEqual({ upper: 1.5, lower: 2 });
  });

  it("blends multiple clips in the animation mixer by weight", () => {
    const idle = new AnimationClip("idle", [{ timeMs: 0, value: 0 }]);
    const walk = new AnimationClip("walk", [{ timeMs: 0, value: 10 }]);
    const mixer = new AnimationMixer<number>();
    mixer.addClip("idle", idle, 0.25);
    mixer.addClip("walk", walk, 0.75);

    expect(mixer.evaluate(0)).toBe(7.5);
  });

  it("cross-fades smoothly from one value to another", () => {
    const fade = new CrossFade<number>(400);

    expect(fade.weights(200)).toEqual({ from: 0.5, to: 0.5, complete: false });
    expect(fade.blend(0, 10, 200)).toBe(5);
    expect(fade.weights(400)).toEqual({ from: 0, to: 1, complete: true });
  });

  it("drives idle walk and run transitions through the animation controller", () => {
    const controller = new AnimationController<number>();
    controller.addState("idle", new AnimationClip("idle", [{ timeMs: 0, value: 0 }]));
    controller.addState("walk", new AnimationClip("walk", [{ timeMs: 0, value: 10 }]));
    controller.addState("run", new AnimationClip("run", [{ timeMs: 0, value: 20 }]));
    controller.addTransition("idle", "walk", 500);
    controller.addTransition("walk", "run", 500);

    expect(controller.getCurrentState()).toBe("idle");
    controller.requestState("walk");
    expect(controller.advance(250)).toBe(5);
    expect(controller.advance(250)).toBe(10);
    controller.requestState("run");
    expect(controller.advance(250)).toBe(15);
    expect(controller.advance(250)).toBe(20);
    expect(controller.getCurrentState()).toBe("run");
  });

  it("retargets poses from one skeleton naming scheme to another", () => {
    const retargeting = new Retargeting({ armL: "leftArm", armR: "rightArm" }, 2);

    expect(retargeting.retargetPose({ armL: 10, armR: -5, spine: 3 })).toEqual({
      leftArm: 20,
      rightArm: -10,
    });
  });
});
