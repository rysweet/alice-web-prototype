import type { AliceObject, AliceProject } from "./a3p-parser.js";
import {
  CameraNode,
  GroupNode,
  LightNode,
  SceneGraph,
  SceneGraphNode,
  type Transform,
  Transformable,
  VisualNode,
  quaternionMultiply,
  rotateVec3ByQuaternion,
} from "./scene-graph.js";
import {
  addVec3,
  magnitudeVec3,
  normalizeQuaternion,
  normalizeVec3,
  orientationFromLookDirection,
  quaternionConjugate,
  quaternionFromAxisAngle,
  quaternionMultiply as multiplyOrientation,
  relationOffset,
  revolutionsToRadians,
  rotateVector,
  scaleVec3,
  subtractVec3,
  vectorFromMoveDirection,
} from "./story-api/expanded-math.js";
import {
  parseMoveDirection,
  parseRollDirection,
  parseSpatialRelation,
  parseTurnDirection,
  type Orientation,
  type SpatialRelation,
  type Vec3,
} from "./story-api/types.js";
import { type AnimationEasing, AnimationLoop, AnimationQueue, easeInOut, interpolateVec3Linear, slerpOrientation } from "./animation-loop.js";
import type { AliceMethodBridge, ExecutionResult, RuntimeObject, VMState, VMExecutionOptions } from "./tweedle-vm-core-types.js";
import { executeProject, virtualMachine } from "./tweedle-vm-core-setup.js";
import type { EntryPointExecutionOptions } from "./virtual-machine.js";

const IDENTITY_ORIENTATION: Orientation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const UNIT_SCALE: Vec3 = Object.freeze({ x: 1, y: 1, z: 1 });
const DEFAULT_BUBBLE_DURATION_MS = 2000;

const COLOR_KEYWORDS: Readonly<Record<string, { r: number; g: number; b: number }>> = Object.freeze({
  WHITE: { r: 1, g: 1, b: 1 },
  BLACK: { r: 0, g: 0, b: 0 },
  RED: { r: 1, g: 0, b: 0 },
  GREEN: { r: 0, g: 1, b: 0 },
  BLUE: { r: 0, g: 0, b: 1 },
  YELLOW: { r: 1, g: 1, b: 0 },
  ORANGE: { r: 1, g: 0.5, b: 0 },
  PURPLE: { r: 0.5, g: 0, b: 0.5 },
  PINK: { r: 1, g: 0.75, b: 0.8 },
  GRAY: { r: 0.5, g: 0.5, b: 0.5 },
  GREY: { r: 0.5, g: 0.5, b: 0.5 },
  BROWN: { r: 0.6, g: 0.4, b: 0.2 },
  CYAN: { r: 0, g: 1, b: 1 },
  MAGENTA: { r: 1, g: 0, b: 1 },
});

export type SceneNode = SceneGraphNode;

export interface ScreenPosition {
  readonly x: number;
  readonly y: number;
  readonly visible?: boolean;
}

export interface SpeechBubbleOverlay {
  readonly entityId: string;
  readonly kind: "say" | "think";
  readonly text: string;
  readonly element: HTMLElement | null;
  readonly persistent: boolean;
}

export interface VmSceneBridgeOptions {
  readonly animationQueue?: AnimationQueue | null;
  readonly overlayContainer?: HTMLElement | null;
  readonly projectWorldToScreen?: (worldPosition: Vec3, entityId: string, node: SceneGraphNode) => ScreenPosition;
  readonly defaultBubbleDurationMs?: number;
}

export interface ProjectSceneRegistration {
  readonly sceneGraph: SceneGraph;
  readonly entityNodes: ReadonlyMap<string, SceneGraphNode>;
}

export interface VmSceneRuntimeOptions extends VmSceneBridgeOptions {
  readonly sceneGraph?: SceneGraph;
  readonly render?: (simulationTimeMs: number) => void;
}

function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    orientation: { ...IDENTITY_ORIENTATION },
    scale: { ...UNIT_SCALE },
  };
}

function cloneTransform(value: Transform): Transform {
  return {
    position: { ...value.position },
    orientation: { ...value.orientation },
    scale: { ...value.scale },
  };
}

function multiplyVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x * right.x,
    y: left.y * right.y,
    z: left.z * right.z,
  };
}

function divideVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: right.x === 0 ? 0 : left.x / right.x,
    y: right.y === 0 ? 0 : left.y / right.y,
    z: right.z === 0 ? 0 : left.z / right.z,
  };
}

function invertOrientation(orientation: Orientation): Orientation {
  return normalizeQuaternion(quaternionConjugate(orientation));
}

function combineTransforms(parent: Transform, child: Transform): Transform {
  const scaled = multiplyVec3(parent.scale, child.position);
  const rotated = rotateVec3ByQuaternion(scaled, parent.orientation);
  return {
    position: addVec3(parent.position, rotated),
    orientation: normalizeQuaternion(quaternionMultiply(parent.orientation, child.orientation)),
    scale: multiplyVec3(parent.scale, child.scale),
  };
}

function worldToLocalTransform(parentWorld: Transform, world: Transform): Transform {
  const offset = subtractVec3(world.position, parentWorld.position);
  const unrotated = rotateVec3ByQuaternion(offset, invertOrientation(parentWorld.orientation));
  return {
    position: divideVec3(unrotated, parentWorld.scale),
    orientation: normalizeQuaternion(multiplyOrientation(invertOrientation(parentWorld.orientation), world.orientation)),
    scale: divideVec3(world.scale, parentWorld.scale),
  };
}

function numericValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function durationMs(value: unknown): number {
  const parsed = numericValue(value, 0);
  return parsed > 0 ? parsed * 1000 : 0;
}

function easeFor(value: unknown): AnimationEasing {
  if (typeof value === "string" && value.toUpperCase().includes("GENT")) {
    return "ease-in-out";
  }
  return "linear";
}

function toColor3(value: unknown): { r: number; g: number; b: number } | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const hex = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (/^[\da-fA-F]{6}$/.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16) / 255,
      g: Number.parseInt(hex.slice(2, 4), 16) / 255,
      b: Number.parseInt(hex.slice(4, 6), 16) / 255,
    };
  }

  return COLOR_KEYWORDS[trimmed.toUpperCase()] ?? null;
}

function screenPositionOf(worldPosition: Vec3): ScreenPosition {
  return {
    x: worldPosition.x * 100,
    y: worldPosition.y * -100,
    visible: true,
  };
}

function chooseNodeForObject(object: AliceObject): SceneGraphNode {
  if (/camera/i.test(object.typeName)) {
    return new CameraNode(object.name);
  }
  if (/sun|light/i.test(object.typeName)) {
    return new LightNode(object.name, "directional");
  }
  if (/scene/i.test(object.typeName)) {
    return new GroupNode(object.name);
  }
  const node = new VisualNode(object.name);
  node.meshRef = object.resourceType;
  return node;
}

function transformFromObject(object: AliceObject): Transform {
  return {
    position: object.position ? { ...object.position } : { x: 0, y: 0, z: 0 },
    orientation: object.orientation ? { ...object.orientation } : { ...IDENTITY_ORIENTATION },
    scale: object.size
      ? { x: object.size.width, y: object.size.height, z: object.size.depth }
      : { ...UNIT_SCALE },
  };
}

function targetEntityIdOf(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "name" in value) {
    const named = value as { name?: unknown };
    return typeof named.name === "string" ? named.name : null;
  }
  return null;
}

export function createSceneGraphForProject(project: AliceProject, sceneGraph: SceneGraph = new SceneGraph()): ProjectSceneRegistration {
  const entityNodes = new Map<string, SceneGraphNode>();
  for (const object of project.sceneObjects) {
    const node = chooseNodeForObject(object);
    node.localTransform = transformFromObject(object);
    sceneGraph.root.addChild(node);
    entityNodes.set(object.name, node);
  }
  return { sceneGraph, entityNodes };
}

export class VmSceneBridge implements AliceMethodBridge {
  readonly #entityNodes = new Map<string, SceneGraphNode>();
  readonly #nodeEntities = new Map<SceneGraphNode, string>();
  readonly #projectedLocals = new Map<string, Transform>();
  readonly #speechBubbles = new Map<string, SpeechBubbleOverlay>();

  #animationQueue: AnimationQueue | null;
  readonly #overlayContainer: HTMLElement | null;
  readonly #projectWorldToScreen: (worldPosition: Vec3, entityId: string, node: SceneGraphNode) => ScreenPosition;
  readonly #defaultBubbleDurationMs: number;

  constructor(options: VmSceneBridgeOptions = {}) {
    this.#animationQueue = options.animationQueue ?? new AnimationQueue();
    this.#overlayContainer = options.overlayContainer
      ?? (typeof document !== "undefined" ? document.body : null);
    this.#projectWorldToScreen = options.projectWorldToScreen ?? screenPositionOf;
    this.#defaultBubbleDurationMs = options.defaultBubbleDurationMs ?? DEFAULT_BUBBLE_DURATION_MS;
  }

  setAnimationQueue(animationQueue: AnimationQueue | null): void {
    this.#animationQueue = animationQueue;
  }

  registerEntity(entityId: string, sceneNode: SceneGraphNode): void {
    this.#entityNodes.set(entityId, sceneNode);
    this.#nodeEntities.set(sceneNode, entityId);
    this.#projectedLocals.set(entityId, cloneTransform(sceneNode.localTransform));
    this.updateSpeechBubblePositions();
  }

  getNodeForEntity(entityId: string): SceneGraphNode | null {
    return this.#entityNodes.get(entityId) ?? null;
  }

  getSpeechBubbleElement(entityId: string): HTMLElement | null {
    return this.#speechBubbles.get(entityId)?.element ?? null;
  }

  handleMethodCall(target: RuntimeObject, methodName: string, args: readonly unknown[], _state: VMState): boolean {
    const entityId = target.name;
    const node = this.#entityNodes.get(entityId);
    if (!node) {
      return false;
    }

    switch (methodName) {
      case "move":
        this.#move(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "turn":
        this.#turn(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "roll":
        this.#roll(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "resize":
        this.#resize(entityId, args[0], args[1], args[2]);
        return true;
      case "say":
        this.#speak(entityId, "say", args[0], args[1]);
        return true;
      case "think":
        this.#speak(entityId, "think", args[0], args[1]);
        return true;
      case "setColor":
        this.#setColor(entityId, args[0]);
        return true;
      case "setOpacity":
        this.#setOpacity(entityId, args[0]);
        return true;
      case "setVehicle":
        this.#setVehicle(entityId, args[0]);
        return true;
      case "place":
        this.#place(entityId, args[0], args[1], args[2]);
        return true;
      case "pointAt":
        this.#pointAt(entityId, args[0]);
        return true;
      case "orientTo":
        this.#orientTo(entityId, args[0]);
        return true;
      case "moveToward":
        this.#moveToward(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "turnToFace":
        this.#turnToFace(entityId, args[0], args[1], args[2]);
        return true;
      default:
        return false;
    }
  }

  updateSpeechBubblePositions(): void {
    for (const [entityId, overlay] of this.#speechBubbles.entries()) {
      if (!overlay.element) {
        continue;
      }
      const node = this.#entityNodes.get(entityId);
      if (!node) {
        continue;
      }
      const world = node.worldTransform;
      const offset = Math.max(0.5, world.scale.y);
      const projected = this.#projectWorldToScreen(
        { x: world.position.x, y: world.position.y + offset, z: world.position.z },
        entityId,
        node,
      );
      overlay.element.style.position = "absolute";
      overlay.element.style.left = `${projected.x}px`;
      overlay.element.style.top = `${projected.y}px`;
      overlay.element.style.display = projected.visible === false ? "none" : "block";
    }
  }

  #requireTransformable(entityId: string): Transformable {
    const node = this.#entityNodes.get(entityId);
    if (!(node instanceof Transformable)) {
      throw new TypeError(`entity \"${entityId}\" is not transformable`);
    }
    return node;
  }

  #localFor(entityId: string): Transform {
    return cloneTransform(this.#projectedLocals.get(entityId) ?? this.#requireTransformable(entityId).localTransform);
  }

  #projectedWorldForNode(node: SceneGraphNode | null): Transform {
    if (!node) {
      return identityTransform();
    }
    const entityId = this.#nodeEntities.get(node);
    const local = cloneTransform(entityId ? this.#projectedLocals.get(entityId) ?? node.localTransform : node.localTransform);
    return combineTransforms(this.#projectedWorldForNode(node.parent), local);
  }

  #worldFor(entityId: string): Transform {
    const node = this.#requireTransformable(entityId);
    return this.#projectedWorldForNode(node);
  }

  #setProjectedLocal(entityId: string, local: Transform): void {
    this.#projectedLocals.set(entityId, cloneTransform(local));
  }

  #applyLocal(entityId: string, patch: Partial<Transform>): void {
    const node = this.#requireTransformable(entityId);
    node.localTransform = {
      position: patch.position ? { ...patch.position } : { ...node.localTransform.position },
      orientation: patch.orientation ? { ...patch.orientation } : { ...node.localTransform.orientation },
      scale: patch.scale ? { ...patch.scale } : { ...node.localTransform.scale },
    };
    this.updateSpeechBubblePositions();
  }

  #applyWorld(entityId: string, world: Transform): void {
    const node = this.#requireTransformable(entityId);
    const parentWorld = node.parent ? node.parent.worldTransform : identityTransform();
    node.localTransform = worldToLocalTransform(parentWorld, world);
    this.updateSpeechBubblePositions();
  }

  #animateLocalPosition(entityId: string, to: Vec3, duration: number, easing: AnimationEasing): Promise<void> {
    const local = this.#localFor(entityId);
    const targetLocal = { ...local, position: { ...to } };
    this.#setProjectedLocal(entityId, targetLocal);
    if (!this.#animationQueue || duration <= 0) {
      this.#applyLocal(entityId, { position: targetLocal.position });
      return Promise.resolve();
    }
    return this.#animationQueue.enqueue({
      entityId,
      durationMs: duration,
      from: local.position,
      to: targetLocal.position,
      interpolate: interpolateVec3Linear,
      apply: (value) => {
        this.#applyLocal(entityId, { position: value });
      },
      easing,
    });
  }

  #animateLocalOrientation(entityId: string, to: Orientation, duration: number, easing: AnimationEasing): Promise<void> {
    const local = this.#localFor(entityId);
    const targetLocal = { ...local, orientation: normalizeQuaternion(to) };
    this.#setProjectedLocal(entityId, targetLocal);
    if (!this.#animationQueue || duration <= 0) {
      this.#applyLocal(entityId, { orientation: targetLocal.orientation });
      return Promise.resolve();
    }
    return this.#animationQueue.enqueue({
      entityId,
      durationMs: duration,
      from: local.orientation,
      to: targetLocal.orientation,
      interpolate: slerpOrientation,
      apply: (value) => {
        this.#applyLocal(entityId, { orientation: value });
      },
      easing,
    });
  }

  #animateLocalScale(entityId: string, to: Vec3, duration: number, easing: AnimationEasing): Promise<void> {
    const local = this.#localFor(entityId);
    const targetLocal = { ...local, scale: { ...to } };
    this.#setProjectedLocal(entityId, targetLocal);
    if (!this.#animationQueue || duration <= 0) {
      this.#applyLocal(entityId, { scale: targetLocal.scale });
      return Promise.resolve();
    }
    return this.#animationQueue.enqueue({
      entityId,
      durationMs: duration,
      from: local.scale,
      to: targetLocal.scale,
      interpolate: interpolateVec3Linear,
      apply: (value) => {
        this.#applyLocal(entityId, { scale: value });
      },
      easing,
    });
  }

  #animateWorldPosition(entityId: string, to: Vec3, duration: number, easing: AnimationEasing): Promise<void> {
    const world = this.#worldFor(entityId);
    const node = this.#requireTransformable(entityId);
    const parentWorld = this.#projectedWorldForNode(node.parent);
    const targetWorld = { ...world, position: { ...to } };
    this.#setProjectedLocal(entityId, worldToLocalTransform(parentWorld, targetWorld));
    if (!this.#animationQueue || duration <= 0) {
      this.#applyWorld(entityId, targetWorld);
      return Promise.resolve();
    }
    return this.#animationQueue.enqueue({
      entityId,
      durationMs: duration,
      from: world.position,
      to: targetWorld.position,
      interpolate: interpolateVec3Linear,
      apply: (value) => {
        const currentWorld = node.worldTransform;
        this.#applyWorld(entityId, { ...currentWorld, position: value });
      },
      easing,
    });
  }

  #animateWorldOrientation(entityId: string, to: Orientation, duration: number, easing: AnimationEasing): Promise<void> {
    const world = this.#worldFor(entityId);
    const node = this.#requireTransformable(entityId);
    const parentWorld = this.#projectedWorldForNode(node.parent);
    const targetWorld = { ...world, orientation: normalizeQuaternion(to) };
    this.#setProjectedLocal(entityId, worldToLocalTransform(parentWorld, targetWorld));
    if (!this.#animationQueue || duration <= 0) {
      this.#applyWorld(entityId, targetWorld);
      return Promise.resolve();
    }
    return this.#animationQueue.enqueue({
      entityId,
      durationMs: duration,
      from: world.orientation,
      to: targetWorld.orientation,
      interpolate: slerpOrientation,
      apply: (value) => {
        const currentWorld = node.worldTransform;
        this.#applyWorld(entityId, { ...currentWorld, orientation: value });
      },
      easing,
    });
  }

  #showBubble(entityId: string, kind: "say" | "think", text: string, persistent: boolean): void {
    const existing = this.#speechBubbles.get(entityId);
    existing?.element?.remove();

    const element = this.#overlayContainer && typeof document !== "undefined"
      ? document.createElement("div")
      : null;

    if (element && this.#overlayContainer) {
      element.textContent = text;
      element.dataset.entityId = entityId;
      element.dataset.kind = kind;
      element.style.pointerEvents = "none";
      element.style.transform = "translate(-50%, -100%)";
      element.style.padding = "4px 8px";
      element.style.borderRadius = kind === "think" ? "18px" : "12px";
      element.style.border = "1px solid #333";
      element.style.background = "rgba(255, 255, 255, 0.95)";
      element.style.fontFamily = "sans-serif";
      element.style.fontSize = "12px";
      if (kind === "think") {
        element.style.fontStyle = "italic";
      }
      this.#overlayContainer.appendChild(element);
    }

    this.#speechBubbles.set(entityId, {
      entityId,
      kind,
      text,
      element,
      persistent,
    });
    this.updateSpeechBubblePositions();
  }

  #hideBubble(entityId: string): void {
    const overlay = this.#speechBubbles.get(entityId);
    overlay?.element?.remove();
    this.#speechBubbles.delete(entityId);
  }

  #move(entityId: string, directionValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const world = this.#worldFor(entityId);
    const amount = numericValue(amountValue, 0);
    const direction = typeof directionValue === "string"
      ? parseMoveDirection(directionValue)
      : normalizeVec3((directionValue as Vec3 | undefined) ?? vectorFromMoveDirection("FORWARD"));
    const basis = typeof direction === "string"
      ? rotateVector(world.orientation, vectorFromMoveDirection(direction))
      : normalizeVec3(direction);
    const delta = scaleVec3(normalizeVec3(basis), amount);
    return this.#animateWorldPosition(entityId, addVec3(world.position, delta), durationMs(durationValue), easeFor(styleValue));
  }

  #turn(entityId: string, directionValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const local = this.#localFor(entityId);
    const amount = numericValue(amountValue, 0);
    const signed = parseTurnDirection(String(directionValue ?? "LEFT")) === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(signed));
    return this.#animateLocalOrientation(entityId, multiplyOrientation(delta, local.orientation), durationMs(durationValue), easeFor(styleValue));
  }

  #roll(entityId: string, directionValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const local = this.#localFor(entityId);
    const amount = numericValue(amountValue, 0);
    const signed = parseRollDirection(String(directionValue ?? "LEFT")) === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 0, 1, revolutionsToRadians(signed));
    return this.#animateLocalOrientation(entityId, multiplyOrientation(delta, local.orientation), durationMs(durationValue), easeFor(styleValue));
  }

  #resize(entityId: string, factorValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const local = this.#localFor(entityId);
    const factor = Math.max(0, numericValue(factorValue, 1));
    return this.#animateLocalScale(entityId, scaleVec3(local.scale, factor), durationMs(durationValue), easeFor(styleValue));
  }

  #setColor(entityId: string, colorValue: unknown): void {
    const node = this.getNodeForEntity(entityId);
    if (!(node instanceof VisualNode)) {
      return;
    }
    const color = toColor3(colorValue);
    if (color) {
      node.color = color;
    }
  }

  #setOpacity(entityId: string, opacityValue: unknown): void {
    const node = this.getNodeForEntity(entityId);
    if (!(node instanceof VisualNode)) {
      return;
    }
    node.opacity = numericValue(opacityValue, node.opacity);
  }

  #setVehicle(entityId: string, vehicleValue: unknown): void {
    const node = this.#requireTransformable(entityId);
    const world = this.#worldFor(entityId);
    const targetId = targetEntityIdOf(vehicleValue);
    const vehicle = targetId ? this.#entityNodes.get(targetId) ?? null : null;
    const parent = vehicle ?? this.#findRoot(node);
    if (parent === node || !parent) {
      return;
    }
    parent.addChild(node);
    const parentWorld = this.#projectedWorldForNode(node.parent);
    const local = worldToLocalTransform(parentWorld, world);
    this.#setProjectedLocal(entityId, local);
    node.localTransform = local;
    this.updateSpeechBubblePositions();
  }

  #findRoot(node: SceneGraphNode): SceneGraphNode | null {
    let current: SceneGraphNode | null = node;
    while (current?.parent) {
      current = current.parent;
    }
    return current;
  }

  #place(entityId: string, relationValue: unknown, targetValue: unknown, offsetValue?: unknown): Promise<void> {
    const targetId = targetEntityIdOf(targetValue);
    if (!targetId) {
      return Promise.resolve();
    }
    const selfWorld = this.#worldFor(entityId);
    const targetWorld = this.#worldFor(targetId);
    const relation = parseSpatialRelation(String(relationValue ?? "ABOVE")) as SpatialRelation;
    const offset = numericValue(offsetValue, 0);
    const relationDistance = (() => {
      switch (relation) {
        case "ABOVE":
        case "BELOW":
          return ((targetWorld.scale.y + selfWorld.scale.y) / 2) + offset;
        case "LEFT_OF":
        case "RIGHT_OF":
          return ((targetWorld.scale.x + selfWorld.scale.x) / 2) + offset;
        case "IN_FRONT_OF":
        case "BEHIND":
          return ((targetWorld.scale.z + selfWorld.scale.z) / 2) + offset;
      }
    })();
    return this.#animateWorldPosition(entityId, addVec3(targetWorld.position, relationOffset(relation, relationDistance)), 0, "linear");
  }

  #pointAt(entityId: string, targetValue: unknown): Promise<void> {
    const targetId = targetEntityIdOf(targetValue);
    if (!targetId) {
      return Promise.resolve();
    }
    const world = this.#worldFor(entityId);
    const targetWorld = this.#worldFor(targetId);
    const direction = subtractVec3(targetWorld.position, world.position);
    if (magnitudeVec3(direction) === 0) {
      return Promise.resolve();
    }
    return this.#animateWorldOrientation(entityId, orientationFromLookDirection(direction), 0, "linear");
  }

  #orientTo(entityId: string, targetValue: unknown): Promise<void> {
    const targetId = targetEntityIdOf(targetValue);
    if (!targetId) {
      return Promise.resolve();
    }
    return this.#animateWorldOrientation(entityId, this.#worldFor(targetId).orientation, 0, "linear");
  }

  #moveToward(entityId: string, targetValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const targetId = targetEntityIdOf(targetValue);
    if (!targetId) {
      return Promise.resolve();
    }
    const world = this.#worldFor(entityId);
    const targetWorld = this.#worldFor(targetId);
    const direction = subtractVec3(targetWorld.position, world.position);
    const distance = magnitudeVec3(direction);
    const movement = distance > 0
      ? scaleVec3(normalizeVec3(direction), numericValue(amountValue, 0))
      : { x: 0, y: 0, z: numericValue(amountValue, 0) };
    return this.#animateWorldPosition(entityId, addVec3(world.position, movement), durationMs(durationValue), easeFor(styleValue));
  }

  #turnToFace(entityId: string, targetValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const targetId = targetEntityIdOf(targetValue);
    if (!targetId) {
      return Promise.resolve();
    }
    const world = this.#worldFor(entityId);
    const targetWorld = this.#worldFor(targetId);
    const planar = {
      x: targetWorld.position.x - world.position.x,
      y: 0,
      z: targetWorld.position.z - world.position.z,
    };
    if (magnitudeVec3(planar) === 0) {
      return Promise.resolve();
    }
    return this.#animateWorldOrientation(entityId, orientationFromLookDirection(planar), durationMs(durationValue), easeFor(styleValue));
  }

  #speak(entityId: string, kind: "say" | "think", textValue: unknown, durationValue?: unknown): Promise<void> {
    const text = typeof textValue === "string" ? textValue : String(textValue ?? "");
    const duration = durationMs(durationValue);
    const persistent = duration <= 0;
    const actualDuration = duration > 0 ? duration : this.#defaultBubbleDurationMs;

    if (!this.#animationQueue || persistent) {
      this.#showBubble(entityId, kind, text, true);
      return Promise.resolve();
    }

    return this.#animationQueue.enqueue({
      entityId,
      durationMs: actualDuration,
      from: 0,
      to: 1,
      interpolate: (from, to, portion) => from + ((to - from) * portion),
      apply: () => {
        this.updateSpeechBubblePositions();
      },
      easing: easeInOut,
      onStart: () => {
        this.#showBubble(entityId, kind, text, false);
      },
      onComplete: () => {
        this.#hideBubble(entityId);
      },
    });
  }
}

export class VmSceneRuntime {
  readonly sceneGraph: SceneGraph;
  readonly bridge: VmSceneBridge;
  readonly animationLoop: AnimationLoop;
  readonly entityNodes: ReadonlyMap<string, SceneGraphNode>;

  constructor(readonly project: AliceProject, options: VmSceneRuntimeOptions = {}) {
    const registration = createSceneGraphForProject(project, options.sceneGraph ?? new SceneGraph());
    const queue = options.animationQueue ?? new AnimationQueue();
    this.sceneGraph = registration.sceneGraph;
    this.animationLoop = new AnimationLoop({
      queue,
      render: (simulationTimeMs) => {
        this.bridge.updateSpeechBubblePositions();
        options.render?.(simulationTimeMs);
      },
    });
    this.bridge = new VmSceneBridge({
      animationQueue: queue,
      overlayContainer: options.overlayContainer,
      projectWorldToScreen: options.projectWorldToScreen,
      defaultBubbleDurationMs: options.defaultBubbleDurationMs,
    });
    for (const [entityId, node] of registration.entityNodes.entries()) {
      this.bridge.registerEntity(entityId, node);
    }
    this.entityNodes = registration.entityNodes;
    this.bridge.updateSpeechBubblePositions();
  }

  executeProject(options: VMExecutionOptions = {}): ExecutionResult {
    return executeProject(this.project, { ...options, sceneBridge: options.sceneBridge ?? this.bridge });
  }

  executeEntryPoint(options: EntryPointExecutionOptions, executionOptions: VMExecutionOptions = {}): ExecutionResult {
    return virtualMachine.executeEntryPoint(
      this.project,
      options,
      { ...executionOptions, sceneBridge: executionOptions.sceneBridge ?? this.bridge },
    ).result;
  }

  runWorld(options: Partial<EntryPointExecutionOptions> = {}, executionOptions: VMExecutionOptions = {}): ExecutionResult {
    this.animationLoop.play();
    const receiverName = options.receiverName ?? this.project.sceneObjects[0]?.name ?? "";
    const entryMethod = options.entryMethod ?? this.project.methods[0]?.name ?? "";
    return this.executeEntryPoint({ receiverName, entryMethod, args: options.args, debugRuntime: options.debugRuntime }, executionOptions);
  }

  stop(): void {
    this.animationLoop.pause();
  }
}

export function createVmSceneRuntime(project: AliceProject, options: VmSceneRuntimeOptions = {}): VmSceneRuntime {
  return new VmSceneRuntime(project, options);
}
