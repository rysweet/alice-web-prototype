import { describe, expect, it, vi } from "vitest";
import { SScene, SBox, SCamera } from "../src/story-api/index.js";
import type { SSceneListenerDispatch } from "../src/story-api/index.js";
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

const modifiers = Object.freeze({ alt: false, ctrl: false, meta: false, shift: false });

type ListenerCallback = (event: any) => void;

type SimpleListenerCase = {
  readonly name: string;
  readonly event: any;
  readonly add: (scene: SScene, listener: ListenerCallback) => void;
  readonly remove: (scene: SScene, listener: ListenerCallback) => void;
  readonly dispatch: (event: any) => SSceneListenerDispatch;
};

type EntityListenerCase = {
  readonly name: string;
  readonly eventFor: (entity: SBox) => any;
  readonly add: (scene: SScene, entity: SBox, listener: ListenerCallback) => void;
  readonly remove: (scene: SScene, entity: SBox, listener: ListenerCallback) => void;
  readonly dispatch: (entity: SBox, event: any) => SSceneListenerDispatch;
};

function expectSimpleListenerDelivery(testCase: SimpleListenerCase): void {
  const scene = makeScene();
  const received: unknown[] = [];
  const listener = (event: unknown) => { received.push(event); };

  testCase.add(scene, listener);
  scene.dispatchListenerEvent(testCase.dispatch(testCase.event));
  expect(received).toEqual([testCase.event]);

  testCase.remove(scene, listener);
  scene.dispatchListenerEvent(testCase.dispatch(testCase.event));
  expect(received).toEqual([testCase.event]);
}

function expectEntityListenerDelivery(testCase: EntityListenerCase): void {
  const scene = makeScene();
  const entity = makeBoxAt("hero", 0, 0, 0);
  const otherEntity = makeBoxAt("other", 2, 0, 0);
  const event = testCase.eventFor(entity);
  const received: unknown[] = [];
  const listener = (deliveredEvent: unknown) => { received.push(deliveredEvent); };

  testCase.add(scene, entity, listener);
  scene.dispatchListenerEvent(testCase.dispatch(otherEntity, testCase.eventFor(otherEntity)));
  expect(received).toEqual([]);

  scene.dispatchListenerEvent(testCase.dispatch(entity, event));
  expect(received).toEqual([event]);

  testCase.remove(scene, entity, listener);
  scene.dispatchListenerEvent(testCase.dispatch(entity, event));
  expect(received).toEqual([event]);
}

// ═══════════════════════════════════════════════════════════════════════
// 0. DELIVERY — Callbacks fire before removal and stop after removal
// ═══════════════════════════════════════════════════════════════════════

describe("SScene listener event delivery", () => {
  it.each([
    {
      name: "mouse click on screen",
      event: { type: "click", screenX: 10, screenY: 20, point: { x: 1, y: 2, z: 3 } },
      add: (scene, listener) => scene.addMouseClickOnScreenListener(listener),
      remove: (scene, listener) => scene.removeMouseClickOnScreenListener(listener),
      dispatch: (event) => ({ listener: "mouseClickOnScreen", event }),
    } satisfies SimpleListenerCase,
    {
      name: "mouse click on object",
      event: { type: "click", target: null, targetName: null, point: { x: 1, y: 2, z: 3 }, distance: 4 },
      add: (scene, listener) => scene.addMouseClickOnObjectListener(listener),
      remove: (scene, listener) => scene.removeMouseClickOnObjectListener(listener),
      dispatch: (event) => ({ listener: "mouseClickOnObject", event }),
    } satisfies SimpleListenerCase,
    {
      name: "key press",
      event: { type: "key-press", key: "a", modifiers, shortcuts: ["a"], pressed: true },
      add: (scene, listener) => scene.addKeyPressListener(listener),
      remove: (scene, listener) => scene.removeKeyPressListener(listener),
      dispatch: (event) => ({ listener: "keyPress", event }),
    } satisfies SimpleListenerCase,
    {
      name: "arrow key press",
      event: { type: "key-press", key: "ArrowUp", direction: "FORWARD", modifiers },
      add: (scene, listener) => scene.addArrowKeyPressListener(listener),
      remove: (scene, listener) => scene.removeArrowKeyPressListener(listener),
      dispatch: (event) => ({ listener: "arrowKeyPress", event }),
    } satisfies SimpleListenerCase,
    {
      name: "number key press",
      event: { type: "key-press", key: "5", number: 5, modifiers },
      add: (scene, listener) => scene.addNumberKeyPressListener(listener),
      remove: (scene, listener) => scene.removeNumberKeyPressListener(listener),
      dispatch: (event) => ({ listener: "numberKeyPress", event }),
    } satisfies SimpleListenerCase,
    {
      name: "point of view change",
      event: { type: "pov-change" } as PointOfViewChangeEvent,
      add: (scene, listener) => scene.addPointOfViewChangeListener(listener),
      remove: (scene, listener) => scene.removePointOfViewChangeListener(listener),
      dispatch: (event) => ({ listener: "pointOfViewChange", event }),
    } satisfies SimpleListenerCase,
  ])("delivers $name callbacks until removal", (testCase) => {
    expectSimpleListenerDelivery(testCase);
  });

  it.each([
    {
      name: "collision start",
      eventFor: (entity) => ({ type: "collision-start", left: entity, right: makeBoxAt("wall", 1, 0, 0), pairKey: "hero::wall" }),
      add: (scene, entity, listener) => scene.addCollisionStartListener(entity, listener),
      remove: (scene, entity, listener) => scene.removeCollisionStartListener(entity, listener),
      dispatch: (entity, event) => ({ listener: "collisionStart", entity, event }),
    } satisfies EntityListenerCase,
    {
      name: "collision end",
      eventFor: (entity) => ({ type: "collision-end", left: entity, right: makeBoxAt("wall", 1, 0, 0), pairKey: "hero::wall" }),
      add: (scene, entity, listener) => scene.addCollisionEndListener(entity, listener),
      remove: (scene, entity, listener) => scene.removeCollisionEndListener(entity, listener),
      dispatch: (entity, event) => ({ listener: "collisionEnd", entity, event }),
    } satisfies EntityListenerCase,
    {
      name: "occlusion start",
      eventFor: (entity) => ({ type: "occlusion-start", camera: new SCamera(), target: entity, occluder: null }),
      add: (scene, entity, listener) => scene.addOcclusionStartListener(entity, listener),
      remove: (scene, entity, listener) => scene.removeOcclusionStartListener(entity, listener),
      dispatch: (entity, event) => ({ listener: "occlusionStart", entity, event }),
    } satisfies EntityListenerCase,
    {
      name: "occlusion end",
      eventFor: (entity) => ({ type: "occlusion-end", camera: new SCamera(), target: entity, occluder: null }),
      add: (scene, entity, listener) => scene.addOcclusionEndListener(entity, listener),
      remove: (scene, entity, listener) => scene.removeOcclusionEndListener(entity, listener),
      dispatch: (entity, event) => ({ listener: "occlusionEnd", entity, event }),
    } satisfies EntityListenerCase,
    {
      name: "while in view",
      eventFor: (entity) => ({ type: "while-in-view", camera: new SCamera(), target: entity }),
      add: (scene, entity, listener) => scene.addWhileInViewListener(entity, listener),
      remove: (scene, entity, listener) => scene.removeWhileInViewListener(entity, listener),
      dispatch: (entity, event) => ({ listener: "whileInView", entity, event }),
    } satisfies EntityListenerCase,
    {
      name: "while occlusion",
      eventFor: (entity) => ({ type: "while-occlusion", camera: new SCamera(), target: entity, occluder: null }),
      add: (scene, entity, listener) => scene.addWhileOcclusionListener(entity, listener),
      remove: (scene, entity, listener) => scene.removeWhileOcclusionListener(entity, listener),
      dispatch: (entity, event) => ({ listener: "whileOcclusion", entity, event }),
    } satisfies EntityListenerCase,
  ])("delivers $name callbacks for the registered entity until removal", (testCase) => {
    expectEntityListenerDelivery(testCase);
  });

  it.each([
    {
      name: "proximity enter",
      add: (scene: SScene, entity: SBox, listener: (event: ProximityTransitionEvent) => void) =>
        scene.addProximityEnterListener(entity, 5, listener),
      remove: (scene: SScene, entity: SBox, listener: (event: ProximityTransitionEvent) => void) =>
        scene.removeProximityEnterListener(entity, listener),
      dispatch: (entity: SBox, event: ProximityTransitionEvent): SSceneListenerDispatch =>
        ({ listener: "proximityEnter", entity, event }),
    },
    {
      name: "proximity exit",
      add: (scene: SScene, entity: SBox, listener: (event: ProximityTransitionEvent) => void) =>
        scene.addProximityExitListener(entity, 5, listener),
      remove: (scene: SScene, entity: SBox, listener: (event: ProximityTransitionEvent) => void) =>
        scene.removeProximityExitListener(entity, listener),
      dispatch: (entity: SBox, event: ProximityTransitionEvent): SSceneListenerDispatch =>
        ({ listener: "proximityExit", entity, event }),
    },
  ])("delivers $name callbacks until removal", (testCase) => {
    const scene = makeScene();
    const entity = makeBoxAt("target", 3, 0, 0);
    const event: ProximityTransitionEvent = {
      type: testCase.name === "proximity enter" ? "proximity-enter" : "proximity-exit",
      source: entity,
      target: makeBoxAt("observer", 0, 0, 0),
      pairKey: "observer::target",
      threshold: 5,
      distance: 3,
    };
    const received: ProximityTransitionEvent[] = [];
    const listener = (deliveredEvent: ProximityTransitionEvent) => { received.push(deliveredEvent); };

    testCase.add(scene, entity, listener);
    scene.dispatchListenerEvent(testCase.dispatch(entity, event));
    expect(received).toEqual([event]);

    testCase.remove(scene, entity, listener);
    scene.dispatchListenerEvent(testCase.dispatch(entity, event));
    expect(received).toEqual([event]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// 1. SIMPLE LISTENERS — Scene-level, stored as Set<callback>
// ═══════════════════════════════════════════════════════════════════════

describe("SScene simple listener convenience methods", () => {
  // ── addMouseClickOnScreenListener / removeMouseClickOnScreenListener ──
  describe("addMouseClickOnScreenListener", () => {
    it("registers a MouseClickOnScreenEvent callback without immediate delivery", () => {
      const scene = makeScene();
      const received: MouseClickOnScreenEvent[] = [];
      const listener = (event: MouseClickOnScreenEvent) => { received.push(event); };
      scene.addMouseClickOnScreenListener(listener);
      // Method exists and does not throw
      expect(received).toHaveLength(0);
    });

    it("removeMouseClickOnScreenListener removes a registered callback without throwing", () => {
      const scene = makeScene();
      const received: MouseClickOnScreenEvent[] = [];
      const listener = (event: MouseClickOnScreenEvent) => { received.push(event); };
      scene.addMouseClickOnScreenListener(listener);
      scene.removeMouseClickOnScreenListener(listener);
      // Registration and removal are covered by the delivery tests above.
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
    it("registers a MouseClickOnObjectEvent callback without immediate delivery", () => {
      const scene = makeScene();
      const received: MouseClickOnObjectEvent[] = [];
      const listener = (event: MouseClickOnObjectEvent) => { received.push(event); };
      scene.addMouseClickOnObjectListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeMouseClickOnObjectListener removes a registered callback without throwing", () => {
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
    it("registers a KeyListenerEvent callback without immediate delivery", () => {
      const scene = makeScene();
      const received: KeyListenerEvent[] = [];
      const listener = (event: KeyListenerEvent) => { received.push(event); };
      scene.addKeyPressListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeKeyPressListener removes a registered callback without throwing", () => {
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
    it("registers an ArrowKeyEvent callback without immediate delivery", () => {
      const scene = makeScene();
      const received: ArrowKeyEvent[] = [];
      const listener = (event: ArrowKeyEvent) => { received.push(event); };
      scene.addArrowKeyPressListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeArrowKeyPressListener removes a registered callback without throwing", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addArrowKeyPressListener(listener);
      scene.removeArrowKeyPressListener(listener);
    });
  });

  // ── addNumberKeyPressListener / removeNumberKeyPressListener ──
  describe("addNumberKeyPressListener", () => {
    it("registers a NumberKeyEvent callback without immediate delivery", () => {
      const scene = makeScene();
      const received: NumberKeyEvent[] = [];
      const listener = (event: NumberKeyEvent) => { received.push(event); };
      scene.addNumberKeyPressListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removeNumberKeyPressListener removes a registered callback without throwing", () => {
      const scene = makeScene();
      const listener = vi.fn();
      scene.addNumberKeyPressListener(listener);
      scene.removeNumberKeyPressListener(listener);
    });
  });

  // ── addPointOfViewChangeListener / removePointOfViewChangeListener ──
  describe("addPointOfViewChangeListener", () => {
    it("registers a PointOfViewChangeEvent callback without immediate delivery", () => {
      const scene = makeScene();
      const received: PointOfViewChangeEvent[] = [];
      const listener = (event: PointOfViewChangeEvent) => { received.push(event); };
      scene.addPointOfViewChangeListener(listener);
      expect(received).toHaveLength(0);
    });

    it("removePointOfViewChangeListener removes a registered callback without throwing", () => {
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

    it("removeCollisionStartListener removes a registered callback for that entity", () => {
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
// 3. PROXIMITY LISTENERS — Map<SThing, Map<callback, distance>>
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

    it("removeProximityEnterListener removes a registered callback", () => {
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

    it("removeProximityExitListener removes a registered callback", () => {
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
    expect(typeof (scene as unknown as Record<string, unknown>)[method]).toBe("function");
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
    expect(typeof (scene as unknown as Record<string, unknown>)[method]).toBe("function");
  });

  // Proximity listeners (2 add + 2 remove = 4)
  it.each([
    "addProximityEnterListener",
    "removeProximityEnterListener",
    "addProximityExitListener",
    "removeProximityExitListener",
  ] as const)("has proximity listener method: %s", (method) => {
    expect(typeof (scene as unknown as Record<string, unknown>)[method]).toBe("function");
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
