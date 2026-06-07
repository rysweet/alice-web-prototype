import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { AliceObject } from "../src/a3p-parser.js";
import { AnimationQueue } from "../src/animation-loop.js";
import { CameraNode, GroupNode, LightNode, SceneGraph, VisualNode, type SceneGraphNode } from "../src/scene-graph.js";
import {
  orientationFromLookDirection,
  quaternionFromAxisAngle,
  quaternionMultiply,
  revolutionsToRadians,
} from "../src/story-api/expanded-math.js";
import type { Orientation, Vec3 } from "../src/story-api/types.js";
import type { RuntimeObject, VMState } from "../src/tweedle-vm-core-types.js";
import { createSceneGraphForProject, VmSceneBridge } from "../src/vm-scene-bridge.js";

function source(name: string, typeName = "SProp"): AliceObject {
  return {
    name,
    typeName,
    resourceType: null,
    position: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    size: { width: 1, height: 1, depth: 1 },
  };
}

function runtimeObject(name: string, typeName = "SProp"): RuntimeObject {
  return {
    name,
    typeName,
    fields: new Map(),
    source: source(name, typeName),
  };
}

function projectObject(overrides: Partial<AliceObject> & Pick<AliceObject, "name" | "typeName">): AliceObject {
  return {
    name: overrides.name,
    typeName: overrides.typeName,
    resourceType: overrides.resourceType ?? null,
    position: overrides.position ?? null,
    orientation: overrides.orientation ?? null,
    size: overrides.size ?? null,
    constructorArgs: overrides.constructorArgs,
  };
}

function expectVec3Close(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.z).toBeCloseTo(expected.z, 5);
}

function expectOrientationClose(actual: Orientation, expected: Orientation): void {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
  expect(actual.z).toBeCloseTo(expected.z, 5);
  expect(actual.w).toBeCloseTo(expected.w, 5);
}

function registerNodes(nodes: Record<string, SceneGraphNode>): VmSceneBridge {
  const bridge = new VmSceneBridge();
  for (const [entityId, node] of Object.entries(nodes)) {
    bridge.registerEntity(entityId, node);
  }
  return bridge;
}

function testState(): VMState {
  return {
    stepCounter: 0,
    depth: 0,
    log: [],
    returned: false,
    returnValue: undefined,
    scopes: [new Map()],
    runtime: {
      globalScope: new Map(),
      classRegistry: new Map(),
      methodTable: new Map(),
      objectTable: new Map(),
    },
    methodMap: new Map(),
    typeMap: new Map(),
    objectMap: new Map(),
    currentSelf: null,
    returnValues: new Map(),
    listenerMap: new Map(),
    sceneBridge: null,
  };
}

const originalGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
};

let dom: JSDOM;

beforeAll(() => {
  dom = new JSDOM("<!doctype html><html><body><div id=overlay></div></body></html>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
  });
});

afterAll(() => {
  dom.window.close();
  Object.assign(globalThis, originalGlobals);
});

describe("vm-scene-bridge", () => {
  it("registers entities and returns their scene nodes", () => {
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    sceneGraph.root.addChild(bunny);

    const bridge = new VmSceneBridge();
    bridge.registerEntity("bunny", bunny);

    expect(bridge.getNodeForEntity("bunny")).toBe(bunny);
    expect(bridge.getNodeForEntity("missing")).toBeNull();
  });

  it("intercepts transform and material methods and updates the scene node", () => {
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    sceneGraph.root.addChild(bunny);

    const bridge = new VmSceneBridge();
    bridge.registerEntity("bunny", bunny);
    const state = testState();
    const entity = runtimeObject("bunny");

    expect(bridge.handleMethodCall(entity, "move", ["FORWARD", 2], state)).toBe(true);
    expect(bunny.worldTransform.position).toEqual({ x: 0, y: 0, z: -2 });

    bridge.handleMethodCall(entity, "turn", ["LEFT", 0.25], state);
    expect(bunny.localTransform.orientation.y).toBeCloseTo(Math.SQRT1_2, 5);
    expect(bunny.localTransform.orientation.w).toBeCloseTo(Math.SQRT1_2, 5);

    bridge.handleMethodCall(entity, "resize", [2], state);
    expect(bunny.localTransform.scale).toEqual({ x: 2, y: 2, z: 2 });

    bridge.handleMethodCall(entity, "setColor", ["#ff0000"], state);
    bridge.handleMethodCall(entity, "setOpacity", [0.4], state);
    expect(bunny.color).toEqual({ r: 1, g: 0, b: 0 });
    expect(bunny.opacity).toBeCloseTo(0.4, 5);
  });

  it("applies spatial transform methods using world and local transform semantics", () => {
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    const target = new VisualNode("target");
    const faceTarget = new VisualNode("faceTarget");
    bunny.localTransform = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 2, y: 2, z: 2 },
    };
    target.localTransform = {
      position: { x: 4, y: 6, z: -5 },
      orientation: quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(0.25)),
      scale: { x: 4, y: 6, z: 8 },
    };
    faceTarget.localTransform = {
      position: { x: 8, y: 0, z: -9 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };
    sceneGraph.root.addChild(bunny);
    sceneGraph.root.addChild(target);
    sceneGraph.root.addChild(faceTarget);

    const bridge = registerNodes({ bunny, target, faceTarget });
    const state = testState();
    const entity = runtimeObject("bunny");
    const targetEntity = runtimeObject("target");

    bridge.handleMethodCall(entity, "move", ["UP", "1.5"], state);
    expectVec3Close(bunny.worldTransform.position, { x: 1, y: 3.5, z: 3 });

    bridge.handleMethodCall(entity, "turn", ["RIGHT", 0.25], state);
    expectOrientationClose(
      bunny.localTransform.orientation,
      quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(-0.25)),
    );

    bridge.handleMethodCall(entity, "roll", ["LEFT", 0.25], state);
    expectOrientationClose(
      bunny.localTransform.orientation,
      quaternionMultiply(
        quaternionFromAxisAngle(0, 0, 1, revolutionsToRadians(0.25)),
        quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(-0.25)),
      ),
    );

    bridge.handleMethodCall(entity, "resize", ["1.5"], state);
    expectVec3Close(bunny.localTransform.scale, { x: 3, y: 3, z: 3 });

    bridge.handleMethodCall(entity, "place", ["ABOVE", targetEntity, 0.5], state);
    expectVec3Close(bunny.worldTransform.position, { x: 4, y: 11, z: -5 });

    bridge.handleMethodCall(entity, "pointAt", [targetEntity], state);
    expectOrientationClose(
      bunny.worldTransform.orientation,
      orientationFromLookDirection({ x: 0, y: -5, z: 0 }),
    );

    bridge.handleMethodCall(entity, "orientTo", [targetEntity], state);
    expectOrientationClose(bunny.worldTransform.orientation, target.worldTransform.orientation);

    bridge.handleMethodCall(entity, "moveToward", [targetEntity, 2], state);
    expectVec3Close(bunny.worldTransform.position, { x: 4, y: 9, z: -5 });

    bridge.handleMethodCall(entity, "turnToFace", [runtimeObject("faceTarget")], state);
    expectOrientationClose(
      bunny.worldTransform.orientation,
      orientationFromLookDirection({ x: 4, y: 0, z: -4 }),
    );
  });

  it("keeps invalid and non-applicable bridge calls as no-ops", () => {
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    const initialTransform = bunny.localTransform;
    sceneGraph.root.addChild(bunny);
    const bridge = registerNodes({ bunny });
    const state = testState();

    expect(bridge.handleMethodCall(runtimeObject("ghost"), "move", ["FORWARD", 5], state)).toBe(false);
    expect(bunny.localTransform).toEqual(initialTransform);

    expect(() => bridge.handleMethodCall(runtimeObject("bunny"), "place", ["ABOVE", runtimeObject("ghost")], state)).not.toThrow();
    expect(() => bridge.handleMethodCall(runtimeObject("bunny"), "pointAt", [runtimeObject("ghost")], state)).not.toThrow();
    expect(() => bridge.handleMethodCall(runtimeObject("bunny"), "orientTo", [runtimeObject("ghost")], state)).not.toThrow();
    expect(() => bridge.handleMethodCall(runtimeObject("bunny"), "moveToward", [runtimeObject("ghost"), 2], state)).not.toThrow();
    expect(() => bridge.handleMethodCall(runtimeObject("bunny"), "turnToFace", [runtimeObject("ghost")], state)).not.toThrow();
    expect(bunny.localTransform).toEqual(initialTransform);

    bridge.handleMethodCall(runtimeObject("bunny"), "setColor", ["BLUE"], state);
    expect(bunny.color).toEqual({ r: 0, g: 0, b: 1 });
    bridge.handleMethodCall(runtimeObject("bunny"), "setColor", ["not-a-color"], state);
    expect(bunny.color).toEqual({ r: 0, g: 0, b: 1 });

    const group = new GroupNode("group");
    sceneGraph.root.addChild(group);
    bridge.registerEntity("group", group);
    expect(() => bridge.handleMethodCall(runtimeObject("group"), "setColor", ["RED"], state)).not.toThrow();
    expect(() => bridge.handleMethodCall(runtimeObject("group"), "setOpacity", [0.25], state)).not.toThrow();
  });

  it("keeps malformed vector movement and projected overlay positions finite", () => {
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    bunny.localTransform = {
      ...bunny.localTransform,
      position: { x: 1, y: 2, z: 3 },
    };
    sceneGraph.root.addChild(bunny);

    const overlay = document.getElementById("overlay") as HTMLElement;
    overlay.replaceChildren();
    const bridge = new VmSceneBridge({
      overlayContainer: overlay,
      projectWorldToScreen: () => ({ x: Number.POSITIVE_INFINITY, y: Number.NaN, visible: false }),
    });
    bridge.registerEntity("bunny", bunny);
    const state = testState();
    const entity = runtimeObject("bunny");

    bridge.handleMethodCall(entity, "move", [{ x: Number.POSITIVE_INFINITY, y: 0, z: 0 }, 5], state);
    expectVec3Close(bunny.worldTransform.position, { x: 1, y: 2, z: 3 });

    bridge.handleMethodCall(entity, "move", [{ x: 0, y: 2, z: 0 }, 3], state);
    expectVec3Close(bunny.worldTransform.position, { x: 1, y: 5, z: 3 });

    bridge.handleMethodCall(entity, "resize", [Number.MAX_VALUE], state);
    expectVec3Close(bunny.localTransform.scale, {
      x: Number.MAX_VALUE,
      y: Number.MAX_VALUE,
      z: Number.MAX_VALUE,
    });
    bridge.handleMethodCall(entity, "resize", [10], state);
    expectVec3Close(bunny.localTransform.scale, {
      x: Number.MAX_VALUE,
      y: Number.MAX_VALUE,
      z: Number.MAX_VALUE,
    });
    bridge.handleMethodCall(entity, "resize", [0], state);
    expectVec3Close(bunny.localTransform.scale, { x: 0, y: 0, z: 0 });

    bridge.handleMethodCall(entity, "say", ["finite"], state);
    const element = bridge.getSpeechBubbleElement("bunny");
    expect(element?.style.left).toBe("0px");
    expect(element?.style.top).toBe("0px");
    expect(element?.style.display).toBe("none");
  });

  it("uses mapping defaults for animation duration, easing, numeric values, color, opacity, and node selection", () => {
    const queue = new AnimationQueue();
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    sceneGraph.root.addChild(bunny);
    const bridge = new VmSceneBridge({ animationQueue: queue });
    bridge.registerEntity("bunny", bunny);
    const entity = runtimeObject("bunny");
    const state = testState();

    bridge.handleMethodCall(entity, "move", ["FORWARD", "bad-number"], state);
    expectVec3Close(bunny.worldTransform.position, { x: 0, y: 0, z: 0 });

    bridge.handleMethodCall(entity, "resize", [-3], state);
    expectVec3Close(bunny.localTransform.scale, { x: 0, y: 0, z: 0 });

    bridge.handleMethodCall(entity, "move", ["RIGHT", 4, "0.5", "GENTLE"], state);
    expect(queue.size).toBe(1);
    queue.update(250);
    expect(bunny.worldTransform.position.x).toBeCloseTo(2, 5);
    queue.update(500);
    expect(bunny.worldTransform.position.x).toBeCloseTo(4, 5);

    bridge.handleMethodCall(entity, "setColor", [" orange "], state);
    expect(bunny.color).toEqual({ r: 1, g: 0.5, b: 0 });
    bridge.handleMethodCall(entity, "setColor", ["336699"], state);
    expect(bunny.color).toEqual({
      r: 0x33 / 255,
      g: 0x66 / 255,
      b: 0x99 / 255,
    });
    bridge.handleMethodCall(entity, "setOpacity", ["0.35"], state);
    expect(bunny.opacity).toBeCloseTo(0.35, 5);

    const registration = createSceneGraphForProject({
      version: "1",
      projectName: "NodeSelection",
      sceneObjects: [
        projectObject({ name: "camera", typeName: "SCamera" }),
        projectObject({ name: "sun", typeName: "SSun" }),
        projectObject({ name: "world", typeName: "SScene" }),
        projectObject({
          name: "prop",
          typeName: "SProp",
          resourceType: "BunnyResource",
          position: { x: 1, y: 2, z: 3 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
          size: { width: 2, height: 3, depth: 4 },
        }),
      ],
      methods: [],
    });

    expect(registration.entityNodes.get("camera")).toBeInstanceOf(CameraNode);
    expect(registration.entityNodes.get("sun")).toBeInstanceOf(LightNode);
    expect(registration.entityNodes.get("world")).toBeInstanceOf(GroupNode);
    const prop = registration.entityNodes.get("prop");
    expect(prop).toBeInstanceOf(VisualNode);
    expect((prop as VisualNode).meshRef).toBe("BunnyResource");
    expectVec3Close(prop!.localTransform.position, { x: 1, y: 2, z: 3 });
    expectVec3Close(prop!.localTransform.scale, { x: 2, y: 3, z: 4 });
  });

  it("creates speech bubble overlays for say calls", () => {
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    sceneGraph.root.addChild(bunny);
    bunny.localTransform = {
      ...bunny.localTransform,
      position: { x: 1, y: 2, z: 0 },
    };

    const overlay = document.getElementById("overlay") as HTMLElement;
    const bridge = new VmSceneBridge({ overlayContainer: overlay });
    bridge.registerEntity("bunny", bunny);

    bridge.handleMethodCall(runtimeObject("bunny"), "say", ["hello"], testState());

    const element = bridge.getSpeechBubbleElement("bunny");
    expect(element).not.toBeNull();
    expect(element?.textContent).toBe("hello");
    expect(element?.dataset.entityId).toBe("bunny");
    expect(element?.style.left).toBe("100px");
    expect(element?.style.top).toBe("-300px");
  });

  it("renders text-only timed say and think overlays and removes them after animation completion", () => {
    const queue = new AnimationQueue();
    const sceneGraph = new SceneGraph();
    const bunny = new VisualNode("bunny");
    sceneGraph.root.addChild(bunny);
    bunny.localTransform = {
      ...bunny.localTransform,
      position: { x: 2, y: 1, z: 0 },
      scale: { x: 1, y: 3, z: 1 },
    };

    const overlay = document.getElementById("overlay") as HTMLElement;
    overlay.replaceChildren();
    const bridge = new VmSceneBridge({
      animationQueue: queue,
      overlayContainer: overlay,
      projectWorldToScreen: (worldPosition, entityId, node) => {
        expect(entityId).toBe("bunny");
        expect(node).toBe(bunny);
        return { x: worldPosition.x + 10, y: worldPosition.y + 20, visible: false };
      },
    });
    bridge.registerEntity("bunny", bunny);

    bridge.handleMethodCall(runtimeObject("bunny"), "think", ["<b>secret</b>", 0.75], testState());
    expect(bridge.getSpeechBubbleElement("bunny")).toBeNull();

    queue.update(0);
    const element = bridge.getSpeechBubbleElement("bunny");
    expect(element).not.toBeNull();
    expect(element?.textContent).toBe("<b>secret</b>");
    expect(element?.querySelector("b")).toBeNull();
    expect(element?.dataset.entityId).toBe("bunny");
    expect(element?.dataset.kind).toBe("think");
    expect(element?.style.fontStyle).toBe("italic");
    expect(element?.style.borderRadius).toBe("18px");
    expect(element?.style.left).toBe("12px");
    expect(element?.style.top).toBe("24px");
    expect(element?.style.display).toBe("none");

    queue.update(750);
    expect(bridge.getSpeechBubbleElement("bunny")).toBeNull();
    expect(overlay.childElementCount).toBe(0);
  });

  it("does not create overlays for unregistered targets", () => {
    const overlay = document.getElementById("overlay") as HTMLElement;
    overlay.replaceChildren();
    const bridge = new VmSceneBridge({ overlayContainer: overlay });

    expect(bridge.handleMethodCall(runtimeObject("ghost"), "say", ["ignored"], testState())).toBe(false);
    expect(bridge.getSpeechBubbleElement("ghost")).toBeNull();
    expect(overlay.childElementCount).toBe(0);
  });

  it("reparents entities with setVehicle while preserving world transform", () => {
    const sceneGraph = new SceneGraph();
    const car = new VisualNode("car");
    const bunny = new VisualNode("bunny");
    car.localTransform = {
      ...car.localTransform,
      position: { x: 10, y: 0, z: 0 },
      orientation: quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(0.25)),
      scale: { x: 2, y: 3, z: 4 },
    };
    bunny.localTransform = {
      ...bunny.localTransform,
      position: { x: 1, y: 0, z: -3 },
      orientation: quaternionFromAxisAngle(0, 0, 1, revolutionsToRadians(0.25)),
      scale: { x: 0.5, y: 0.75, z: 1.25 },
    };
    sceneGraph.root.addChild(car);
    sceneGraph.root.addChild(bunny);

    const bridge = new VmSceneBridge();
    bridge.registerEntity("car", car);
    bridge.registerEntity("bunny", bunny);
    const worldBefore = bunny.worldTransform;

    bridge.handleMethodCall(runtimeObject("bunny"), "setVehicle", [runtimeObject("car")], testState());

    expect(bunny.parent).toBe(car);
    expectVec3Close(bunny.worldTransform.position, worldBefore.position);
    expectOrientationClose(bunny.worldTransform.orientation, worldBefore.orientation);
    expectVec3Close(bunny.worldTransform.scale, worldBefore.scale);
  });

  it("keeps setVehicle as a world-position-preserving no-op for invalid or self vehicles", () => {
    const sceneGraph = new SceneGraph();
    const car = new VisualNode("car");
    const bunny = new VisualNode("bunny");
    car.localTransform = {
      ...car.localTransform,
      position: { x: 5, y: 0, z: 0 },
    };
    bunny.localTransform = {
      ...bunny.localTransform,
      position: { x: 1, y: 2, z: 3 },
    };
    sceneGraph.root.addChild(car);
    sceneGraph.root.addChild(bunny);

    const bridge = registerNodes({ car, bunny });
    const state = testState();
    const entity = runtimeObject("bunny");

    bridge.handleMethodCall(entity, "setVehicle", [runtimeObject("car")], state);
    expect(bunny.parent).toBe(car);
    expectVec3Close(bunny.worldTransform.position, { x: 1, y: 2, z: 3 });

    bridge.handleMethodCall(entity, "setVehicle", [runtimeObject("missing")], state);
    expect(bunny.parent).toBe(car);
    expectVec3Close(bunny.worldTransform.position, { x: 1, y: 2, z: 3 });

    bridge.handleMethodCall(entity, "setVehicle", [entity], state);
    expect(bunny.parent).toBe(car);
    expectVec3Close(bunny.worldTransform.position, { x: 1, y: 2, z: 3 });
  });
});
