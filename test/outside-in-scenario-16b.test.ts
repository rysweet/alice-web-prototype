import { describe, it, expect } from "vitest";
import { SScene, SBox } from "../src/story-api/index.js";

/**
 * Step 16b Outside-In Scenarios — testing SScene listener API
 * as an external consumer would use it.
 */
describe("Step 16b: Outside-In Scenario 1 (Simple - API Surface)", () => {
  it("all 14 add methods and 14 remove methods exist on SScene", () => {
    const scene = new SScene();
    const addMethods = [
      "addMouseClickOnScreenListener", "addMouseClickOnObjectListener",
      "addKeyPressListener", "addArrowKeyPressListener", "addNumberKeyPressListener",
      "addPointOfViewChangeListener",
      "addCollisionStartListener", "addCollisionEndListener",
      "addProximityEnterListener", "addProximityExitListener",
      "addOcclusionStartListener", "addOcclusionEndListener",
      "addWhileInViewListener", "addWhileOcclusionListener",
    ];
    const removeMethods = addMethods.map(m => m.replace("add", "remove"));
    for (const m of [...addMethods, ...removeMethods]) {
      expect(typeof (scene as any)[m]).toBe("function");
    }
  });
});

describe("Step 16b: Outside-In Scenario 2 (Edge - Listener Lifecycle)", () => {
  it("add and remove key press listener without error", () => {
    const scene = new SScene();
    const cb = () => {};
    expect(() => {
      scene.addKeyPressListener(cb);
      scene.removeKeyPressListener(cb);
    }).not.toThrow();
  });

  it("removing a non-existent listener does not throw", () => {
    const scene = new SScene();
    expect(() => scene.removeKeyPressListener(() => {})).not.toThrow();
  });

  it("double-adding then removing a listener does not throw", () => {
    const scene = new SScene();
    const cb = () => {};
    expect(() => {
      scene.addMouseClickOnScreenListener(cb);
      scene.addMouseClickOnScreenListener(cb);
      scene.removeMouseClickOnScreenListener(cb);
    }).not.toThrow();
  });

  it("full lifecycle for all proximity/occlusion listeners", () => {
    const scene = new SScene();
    const entity = new SBox();
    const noop = () => {};
    const entityBound = [
      ["addOcclusionStartListener", "removeOcclusionStartListener"],
      ["addOcclusionEndListener", "removeOcclusionEndListener"],
      ["addWhileInViewListener", "removeWhileInViewListener"],
      ["addWhileOcclusionListener", "removeWhileOcclusionListener"],
    ] as const;
    expect(() => {
      for (const [add, remove] of entityBound) {
        (scene as any)[add](entity, noop);
        (scene as any)[remove](entity, noop);
      }
      // Proximity methods require (entity, distance, listener)
      scene.addProximityEnterListener(entity, 5, noop);
      scene.removeProximityEnterListener(entity, noop);
      scene.addProximityExitListener(entity, 5, noop);
      scene.removeProximityExitListener(entity, noop);
    }).not.toThrow();
  });

  it("collision start/end listener lifecycle", () => {
    const scene = new SScene();
    const entity = new SBox();
    const noop = () => {};
    expect(() => {
      scene.addCollisionStartListener(entity, noop);
      scene.addCollisionEndListener(entity, noop);
      scene.removeCollisionStartListener(entity, noop);
      scene.removeCollisionEndListener(entity, noop);
    }).not.toThrow();
  });

  it("PointOfView, Arrow key, and Number key listener lifecycle", () => {
    const scene = new SScene();
    const noop = () => {};
    expect(() => {
      scene.addPointOfViewChangeListener(noop);
      scene.addArrowKeyPressListener(noop);
      scene.addNumberKeyPressListener(noop);
      scene.removePointOfViewChangeListener(noop);
      scene.removeArrowKeyPressListener(noop);
      scene.removeNumberKeyPressListener(noop);
    }).not.toThrow();
  });
});
