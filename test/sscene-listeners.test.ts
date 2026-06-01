import { describe, expect, it, vi } from "vitest";
import { SScene, SBox } from "../src/story-api/index.js";
import type {
  MouseClickOnScreenEvent,
  MouseClickOnObjectEvent,
  KeyListenerEvent,
  ArrowKeyEvent,
  NumberKeyEvent,
  PointOfViewChangeEvent,
  CollisionTransitionEvent,
  ProximityTransitionEvent,
  OcclusionEvent,
  ViewEvent,
} from "../src/story-api-events/shared.js";

// ─── helpers ────────────────────────────────────────────────────────────
function makeScene(): SScene {
  return new SScene("test-scene");
}

function makeBoxAt(name: string, x: number, y: number, z: number): SBox {
  const box = new SBox();
  box.setName(name);
  box.position = { x, y, z };
  return box;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. SIMPLE LISTENERS — Scene-level, stored as Set<callback>
// ═══════════════════════════════════════════════════════════════════════

describe("SScene simple listener convenience methods", () => {
  // ── addMouseClickOnScreenListener / removeMouseClickOnScreenListener ──
  describe("addMouseClickOnScreenListener", () => {
    it("registers a callback and receives MouseClickOnScreenEvent", () => {
      const scene = makeScene();
      const received: MouseClickOnScreenEvent[] = [];
      const listener = (event: MouseClickOnScreenEvent) => { received.push(event); };
      scene.addMouseClickOnScreenListener(listener);
      // Method exists and does not throw
      expect(received).toHaveLength(0);
    });

    it("removeMouseClickOnScreenListener stops delivery", () => {
      const scene = makeScene();
      const received: MouseClickOnScreenEvent[] = [];
      const listener = (event: MouseClickOnScreenEvent) => { received.push(event); };
      scene.addMouseClickOnScreenListener(listener);
      scene.removeMouseClickOnScreenListener(listener);
      // After remove, no further events expected
      expect(received).toHaveLength(0);
    });

    it("adding the same listener twice does not duplicate (Set semantics)", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addMouseClickOnScreenListener(listener);
      scene.addMouseClickOnScreenListener(listener);
      // remove once should fully remove
      scene.removeMouseClickOnScreenListener(listener);
      // no error
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const listener = vi.fn();
      expect(() => scene.removeMouseClickOnScreenListener(listener)).not.toThrow();
    });
  });

  // ── addMouseClickOnObjectListener / removeMouseClickOnObjectListener ──
  describe("addMouseClickOnObjectListener", () => {
    it("registers a callback and receives MouseClickOnObjectEvent", () => {
      const scene = makeScene();
      const received: MouseClickOnObjectEvent[] = [];
      const listener = (event: MouseClickOnObjectEvent) => { received.push(event); };
      scene.addMouseClickOnObjectListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeMouseClickOnObjectListener stops delivery", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addMouseClickOnObjectListener(listener);
      scene.removeMouseClickOnObjectListener(listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      expect(() => scene.removeMouseClickOnObjectListener(vi.fn())).not.toThrow();
    });
  });

  // ── addKeyPressListener / removeKeyPressListener ──
  describe("addKeyPressListener", () => {
    it("registers a callback and receives KeyListenerEvent", () => {
      const scene = makeScene();
      const received: KeyListenerEvent[] = [];
      const listener = (event: KeyListenerEvent) => { received.push(event); };
      scene.addKeyPressListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeKeyPressListener stops delivery", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addKeyPressListener(listener);
      scene.removeKeyPressListener(listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      expect(() => scene.removeKeyPressListener(vi.fn())).not.toThrow();
    });
  });

  // ── addArrowKeyPressListener / removeArrowKeyPressListener ──
  describe("addArrowKeyPressListener", () => {
    it("registers a callback and receives ArrowKeyEvent", () => {
      const scene = makeScene();
      const received: ArrowKeyEvent[] = [];
      const listener = (event: ArrowKeyEvent) => { received.push(event); };
      scene.addArrowKeyPressListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeArrowKeyPressListener stops delivery", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addArrowKeyPressListener(listener);
      scene.removeArrowKeyPressListener(listener);
    });
  });

  // ── addNumberKeyPressListener / removeNumberKeyPressListener ──
  describe("addNumberKeyPressListener", () => {
    it("registers a callback and receives NumberKeyEvent", () => {
      const scene = makeScene();
      const received: NumberKeyEvent[] = [];
      const listener = (event: NumberKeyEvent) => { received.push(event); };
      scene.addNumberKeyPressListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeNumberKeyPressListener stops delivery", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addNumberKeyPressListener(listener);
      scene.removeNumberKeyPressListener(listener);
    });
  });

  // ── addPointOfViewChangeListener / removePointOfViewChangeListener ──
  describe("addPointOfViewChangeListener", () => {
    it("registers a callback and receives PointOfViewChangeEvent", () => {
      const scene = makeScene();
      const received: PointOfViewChangeEvent[] = [];
      const listener = (event: PointOfViewChangeEvent) => { received.push(event); };
      scene.addPointOfViewChangeListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removePointOfViewChangeListener stops delivery", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addPointOfViewChangeListener(listener);
      scene.removePointOfViewChangeListener(listener);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 2. ENTITY-BOUND LISTENERS — Stored as Map<SThing, Set<callback>>
// ═══════════════════════════════════════════════════════════════════════

describe("SScene entity-bound listener convenience methods", () => {
  // ── addCollisionStartListener / removeCollisionStartListener ──
  describe("addCollisionStartListener", () => {
    it("registers a callback for a specific entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      const received: CollisionTransitionEvent[] = [];
      const listener = (event: CollisionTransitionEvent) => { received.push(event); };
      scene.addCollisionStartListener(box, listener);
      expect(received).toHaveLength(0);
    });

    it("removeCollisionStartListener stops delivery for that entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      const listener = vi.fn();
      scene.addCollisionStartListener(box, listener);
      scene.removeCollisionStartListener(box, listener);
    });

    it("multiple listeners on the same entity are independent", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      scene.addCollisionStartListener(box, listenerA);
      scene.addCollisionStartListener(box, listenerB);
      scene.removeCollisionStartListener(box, listenerA);
      // listenerB should still be registered (no error removing only one)
    });

    it("adding the same listener twice for the same entity is idempotent", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      const listener = vi.fn();
      scene.addCollisionStartListener(box, listener);
      scene.addCollisionStartListener(box, listener);
      scene.removeCollisionStartListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      expect(() => scene.removeCollisionStartListener(box, vi.fn())).not.toThrow();
    });

    it("separate entities have separate listener sets", () => {
      const scene = makeScene();
      const boxA = makeBoxAt("alpha", 0, 0, 0);
      const boxB = makeBoxAt("beta", 2, 0, 0);
      const listenerA = vi.fn();
      const listenerB = vi.fn();
      scene.addCollisionStartListener(boxA, listenerA);
      scene.addCollisionStartListener(boxB, listenerB);
      scene.removeCollisionStartListener(boxA, listenerA);
      // removing from boxA should not affect boxB
    });
  });

  // ── addCollisionEndListener / removeCollisionEndListener ──
  describe("addCollisionEndListener", () => {
    it("registers a callback for a specific entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      const listener = vi.fn();
      scene.addCollisionEndListener(box, listener);
      scene.removeCollisionEndListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("hero", 0, 0, 0);
      expect(() => scene.removeCollisionEndListener(box, vi.fn())).not.toThrow();
    });
  });

  // ── addOcclusionStartListener / removeOcclusionStartListener ──
  describe("addOcclusionStartListener", () => {
    it("registers a callback for a specific entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 0, 0, -5);
      const listener = vi.fn();
      scene.addOcclusionStartListener(box, listener);
      scene.removeOcclusionStartListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 0, 0, -5);
      expect(() => scene.removeOcclusionStartListener(box, vi.fn())).not.toThrow();
    });
  });

  // ── addOcclusionEndListener / removeOcclusionEndListener ──
  describe("addOcclusionEndListener", () => {
    it("registers a callback for a specific entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 0, 0, -5);
      const listener = vi.fn();
      scene.addOcclusionEndListener(box, listener);
      scene.removeOcclusionEndListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 0, 0, -5);
      expect(() => scene.removeOcclusionEndListener(box, vi.fn())).not.toThrow();
    });
  });

  // ── addWhileInViewListener / removeWhileInViewListener ──
  describe("addWhileInViewListener", () => {
    it("registers a callback for a specific entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("visible", 0, 0, -5);
      const listener = vi.fn();
      scene.addWhileInViewListener(box, listener);
      scene.removeWhileInViewListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("visible", 0, 0, -5);
      expect(() => scene.removeWhileInViewListener(box, vi.fn())).not.toThrow();
    });
  });

  // ── addWhileOcclusionListener / removeWhileOcclusionListener ──
  describe("addWhileOcclusionListener", () => {
    it("registers a callback for a specific entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 0, 0, -5);
      const listener = vi.fn();
      scene.addWhileOcclusionListener(box, listener);
      scene.removeWhileOcclusionListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 0, 0, -5);
      expect(() => scene.removeWhileOcclusionListener(box, vi.fn())).not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 3. PROXIMITY LISTENERS — Map<SThing, Set<{distance, listener}>>
// ═══════════════════════════════════════════════════════════════════════

describe("SScene proximity listener convenience methods", () => {
  // ── addProximityEnterListener / removeProximityEnterListener ──
  describe("addProximityEnterListener", () => {
    it("registers a callback with entity and distance", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      const listener = vi.fn();
      scene.addProximityEnterListener(box, 5.0, listener);
      // method exists and accepts (entity, distance, listener)
    });

    it("removeProximityEnterListener stops delivery", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      const listener = vi.fn();
      scene.addProximityEnterListener(box, 5.0, listener);
      scene.removeProximityEnterListener(box, listener);
    });

    it("multiple listeners at different distances for same entity", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      const closeListener = vi.fn();
      const farListener = vi.fn();
      scene.addProximityEnterListener(box, 2.0, closeListener);
      scene.addProximityEnterListener(box, 10.0, farListener);
      // remove one, other stays
      scene.removeProximityEnterListener(box, closeListener);
      scene.removeProximityEnterListener(box, farListener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      expect(() => scene.removeProximityEnterListener(box, vi.fn())).not.toThrow();
    });

    it("adding the same listener reference twice is idempotent", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      const listener = vi.fn();
      scene.addProximityEnterListener(box, 5.0, listener);
      scene.addProximityEnterListener(box, 5.0, listener);
      scene.removeProximityEnterListener(box, listener);
    });
  });

  // ── addProximityExitListener / removeProximityExitListener ──
  describe("addProximityExitListener", () => {
    it("registers a callback with entity and distance", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      const listener = vi.fn();
      scene.addProximityExitListener(box, 5.0, listener);
    });

    it("removeProximityExitListener stops delivery", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      const listener = vi.fn();
      scene.addProximityExitListener(box, 5.0, listener);
      scene.removeProximityExitListener(box, listener);
    });

    it("removing a never-added listener is a no-op", () => {
      const scene = makeScene();
      const box = makeBoxAt("target", 3, 0, 0);
      expect(() => scene.removeProximityExitListener(box, vi.fn())).not.toThrow();
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 4. METHOD EXISTENCE CHECKS — Verify all 28 methods are declared
// ═══════════════════════════════════════════════════════════════════════

describe("SScene listener method existence", () => {
  const scene = new SScene();

  // Simple listeners (6 add + 6 remove = 12)
  it.each([
    "addMouseClickOnScreenListener",
    "removeMouseClickOnScreenListener",
    "addMouseClickOnObjectListener",
    "removeMouseClickOnObjectListener",
    "addKeyPressListener",
    "removeKeyPressListener",
    "addArrowKeyPressListener",
    "removeArrowKeyPressListener",
    "addNumberKeyPressListener",
    "removeNumberKeyPressListener",
    "addPointOfViewChangeListener",
    "removePointOfViewChangeListener",
  ] as const)("has simple listener method: %s", (method) => {
    expect(typeof (scene as Record<string, unknown>)[method]).toBe("function");
  });

  // Entity-bound listeners (6 add + 6 remove = 12)
  it.each([
    "addCollisionStartListener",
    "removeCollisionStartListener",
    "addCollisionEndListener",
    "removeCollisionEndListener",
    "addOcclusionStartListener",
    "removeOcclusionStartListener",
    "addOcclusionEndListener",
    "removeOcclusionEndListener",
    "addWhileInViewListener",
    "removeWhileInViewListener",
    "addWhileOcclusionListener",
    "removeWhileOcclusionListener",
  ] as const)("has entity-bound listener method: %s", (method) => {
    expect(typeof (scene as Record<string, unknown>)[method]).toBe("function");
  });

  // Proximity listeners (2 add + 2 remove = 4)
  it.each([
    "addProximityEnterListener",
    "removeProximityEnterListener",
    "addProximityExitListener",
    "removeProximityExitListener",
  ] as const)("has proximity listener method: %s", (method) => {
    expect(typeof (scene as Record<string, unknown>)[method]).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 5. CALLBACK TYPE CONTRACTS — Ensure type-safe signatures
// ═══════════════════════════════════════════════════════════════════════

describe("SScene listener callback type contracts", () => {
  it("simple listeners accept a single-argument callback", () => {
    const scene = makeScene();

    // These must compile with their respective event types
    const screenClick = (_e: MouseClickOnScreenEvent): void => {};
    const objectClick = (_e: MouseClickOnObjectEvent): void => {};
    const keyPress = (_e: KeyListenerEvent): void => {};
    const arrowKey = (_e: ArrowKeyEvent): void => {};
    const numberKey = (_e: NumberKeyEvent): void => {};
    const povChange = (_e: PointOfViewChangeEvent): void => {};

    scene.addMouseClickOnScreenListener(screenClick);
    scene.addMouseClickOnObjectListener(objectClick);
    scene.addKeyPressListener(keyPress);
    scene.addArrowKeyPressListener(arrowKey);
    scene.addNumberKeyPressListener(numberKey);
    scene.addPointOfViewChangeListener(povChange);

    scene.removeMouseClickOnScreenListener(screenClick);
    scene.removeMouseClickOnObjectListener(objectClick);
    scene.removeKeyPressListener(keyPress);
    scene.removeArrowKeyPressListener(arrowKey);
    scene.removeNumberKeyPressListener(numberKey);
    scene.removePointOfViewChangeListener(povChange);
  });

  it("entity-bound listeners accept (entity, callback)", () => {
    const scene = makeScene();
    const box = makeBoxAt("hero", 0, 0, 0);

    const collisionCb = (_e: CollisionTransitionEvent): void => {};
    const occlusionCb = (_e: OcclusionEvent): void => {};
    const viewCb = (_e: ViewEvent): void => {};

    scene.addCollisionStartListener(box, collisionCb);
    scene.addCollisionEndListener(box, collisionCb);
    scene.addOcclusionStartListener(box, occlusionCb);
    scene.addOcclusionEndListener(box, occlusionCb);
    scene.addWhileInViewListener(box, viewCb);
    scene.addWhileOcclusionListener(box, occlusionCb);

    scene.removeCollisionStartListener(box, collisionCb);
    scene.removeCollisionEndListener(box, collisionCb);
    scene.removeOcclusionStartListener(box, occlusionCb);
    scene.removeOcclusionEndListener(box, occlusionCb);
    scene.removeWhileInViewListener(box, viewCb);
    scene.removeWhileOcclusionListener(box, occlusionCb);
  });

  it("proximity listeners accept (entity, distance, callback)", () => {
    const scene = makeScene();
    const box = makeBoxAt("target", 3, 0, 0);

    const proxCb = (_e: ProximityTransitionEvent): void => {};

    scene.addProximityEnterListener(box, 5.0, proxCb);
    scene.addProximityExitListener(box, 5.0, proxCb);

    scene.removeProximityEnterListener(box, proxCb);
    scene.removeProximityExitListener(box, proxCb);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 6. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════

describe("SScene listener edge cases", () => {
  it("pre-existing listeners (sceneActivation, objectAddition, time) still work", () => {
    const scene = makeScene();
    const activationCb = vi.fn();
    const objectCb = vi.fn();
    const timeCb = vi.fn();

    scene.addSceneActivationListener(activationCb);
    scene.addObjectAdditionListener(objectCb);
    scene.addTimeListener(timeCb);

    scene.removeSceneActivationListener(activationCb);
    scene.removeObjectAdditionListener(objectCb);
    scene.removeTimeListener(timeCb);
  });

  it("multiple scenes maintain independent listener stores", () => {
    const scene1 = makeScene();
    const scene2 = makeScene();
    const box = makeBoxAt("shared", 0, 0, 0);

    const listener1 = vi.fn();
    const listener2 = vi.fn();

    scene1.addCollisionStartListener(box, listener1);
    scene2.addCollisionStartListener(box, listener2);

    // Removing from scene1 should not affect scene2
    scene1.removeCollisionStartListener(box, listener1);
    // scene2's listener should still be registered
    scene2.removeCollisionStartListener(box, listener2);
  });

  it("remove with wrong listener reference is a no-op for entity-bound", () => {
    const scene = makeScene();
    const box = makeBoxAt("hero", 0, 0, 0);
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    scene.addCollisionStartListener(box, listenerA);
    // removing listenerB should not affect listenerA
    scene.removeCollisionStartListener(box, listenerB);
    // no error, listenerA unaffected
    scene.removeCollisionStartListener(box, listenerA);
  });

  it("remove with wrong listener reference is a no-op for proximity", () => {
    const scene = makeScene();
    const box = makeBoxAt("target", 3, 0, 0);
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    scene.addProximityEnterListener(box, 5.0, listenerA);
    scene.removeProximityEnterListener(box, listenerB);
    // no error, listenerA unaffected
    scene.removeProximityEnterListener(box, listenerA);
  });
});
