import type { AliceProject } from "./a3p-parser.js";
import {
  SceneGraph,
  SceneGraphNode,
  type Transform,
  Transformable,
  VisualNode,
} from "./scene-graph.js";
import {
  addVec3,
  magnitudeVec3,
  normalizeQuaternion,
  normalizeVec3,
  orientationFromLookDirection,
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
import {
  createProjectSceneNodes,
  targetEntityIdOf,
} from "./vm-scene-bridge-entities.js";
import {
  durationMs,
  easeFor,
  finiteScreenPosition,
  finiteVec3,
  numericValue,
  screenPositionOf,
  toColor3,
  type ScreenPosition,
} from "./vm-scene-bridge-mapping.js";
import {
  cloneTransform,
  identityTransform,
  isFiniteTransform,
  projectedWorldForNode,
  worldToLocalTransform,
} from "./vm-scene-bridge-transforms.js";

const DEFAULT_BUBBLE_DURATION_MS = 2000;

export type SceneNode = SceneGraphNode;
export type { ScreenPosition };

export interface ProjectSceneRegistration {
  readonly sceneGraph: SceneGraph;
  readonly entityNodes: ReadonlyMap<string, SceneGraphNode>;
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

export interface VmSceneRuntimeOptions extends VmSceneBridgeOptions {
  readonly sceneGraph?: SceneGraph;
  readonly render?: (simulationTimeMs: number) => void;
}

export function createSceneGraphForProject(project: AliceProject, sceneGraph: SceneGraph = new SceneGraph()): ProjectSceneRegistration {
  const entityNodes = createProjectSceneNodes(project);
  for (const node of entityNodes.values()) {
    sceneGraph.root.addChild(node);
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

  get animationQueue(): AnimationQueue | null {
    return this.#animationQueue;
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
    if (this.#speechBubbles.size === 0) {
      return;
    }

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
      const projected = finiteScreenPosition(this.#projectWorldToScreen(
        { x: world.position.x, y: world.position.y + offset, z: world.position.z },
        entityId,
        node,
      ));
      const style = overlay.element.style;
      const left = `${projected.x}px`;
      const top = `${projected.y}px`;
      const display = projected.visible === false ? "none" : "block";
      if (style.left !== left) {
        style.left = left;
      }
      if (style.top !== top) {
        style.top = top;
      }
      if (style.display !== display) {
        style.display = display;
      }
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
    return projectedWorldForNode(node, (sceneNode) => {
      const entityId = this.#nodeEntities.get(sceneNode);
      return entityId ? this.#projectedLocals.get(entityId) : sceneNode.localTransform;
    });
  }

  #worldFor(entityId: string): Transform {
    const node = this.#requireTransformable(entityId);
    return this.#projectedWorldForNode(node);
  }

  #targetNodeFor(value: unknown): SceneGraphNode | null {
    const targetId = targetEntityIdOf(value);
    return targetId ? this.#entityNodes.get(targetId) ?? null : null;
  }

  #setProjectedLocal(entityId: string, local: Transform): boolean {
    if (!isFiniteTransform(local)) {
      return false;
    }
    this.#projectedLocals.set(entityId, cloneTransform(local));
    return true;
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
    if (!this.#setProjectedLocal(entityId, targetLocal)) {
      return Promise.resolve();
    }
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
    if (!this.#setProjectedLocal(entityId, targetLocal)) {
      return Promise.resolve();
    }
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
    if (!this.#setProjectedLocal(entityId, targetLocal)) {
      return Promise.resolve();
    }
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
    if (!this.#setProjectedLocal(entityId, worldToLocalTransform(parentWorld, targetWorld))) {
      return Promise.resolve();
    }
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
    if (!this.#setProjectedLocal(entityId, worldToLocalTransform(parentWorld, targetWorld))) {
      return Promise.resolve();
    }
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
      element.style.position = "absolute";
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
    const basis = typeof directionValue === "string"
      ? rotateVector(world.orientation, vectorFromMoveDirection(parseMoveDirection(directionValue)))
      : directionValue == null
        ? vectorFromMoveDirection("FORWARD")
        : finiteVec3(directionValue, { x: 0, y: 0, z: 0 });
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
    const parent = this.#targetNodeFor(vehicleValue);
    if (!parent || parent === node || this.#containsDescendant(node, parent)) {
      return;
    }
    const parentWorld = this.#projectedWorldForNode(parent);
    const local = worldToLocalTransform(parentWorld, world);
    if (!this.#setProjectedLocal(entityId, local)) {
      return;
    }
    parent.addChild(node);
    node.localTransform = local;
    this.updateSpeechBubblePositions();
  }

  #containsDescendant(root: SceneGraphNode, candidate: SceneGraphNode): boolean {
    let current: SceneGraphNode | null = candidate;
    while (current) {
      if (current === root) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  #place(entityId: string, relationValue: unknown, targetValue: unknown, offsetValue?: unknown): Promise<void> {
    const target = this.#targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const selfWorld = this.#worldFor(entityId);
    const targetWorld = this.#projectedWorldForNode(target);
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
    const target = this.#targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const world = this.#worldFor(entityId);
    const targetWorld = this.#projectedWorldForNode(target);
    const direction = subtractVec3(targetWorld.position, world.position);
    if (magnitudeVec3(direction) === 0) {
      return Promise.resolve();
    }
    return this.#animateWorldOrientation(entityId, orientationFromLookDirection(direction), 0, "linear");
  }

  #orientTo(entityId: string, targetValue: unknown): Promise<void> {
    const target = this.#targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    return this.#animateWorldOrientation(entityId, this.#projectedWorldForNode(target).orientation, 0, "linear");
  }

  #moveToward(entityId: string, targetValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const target = this.#targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const world = this.#worldFor(entityId);
    const targetWorld = this.#projectedWorldForNode(target);
    const direction = subtractVec3(targetWorld.position, world.position);
    const distance = magnitudeVec3(direction);
    const amount = numericValue(amountValue, 0);
    const movement = distance > 0
      ? {
        x: (direction.x / distance) * amount,
        y: (direction.y / distance) * amount,
        z: (direction.z / distance) * amount,
      }
      : { x: 0, y: 0, z: amount };
    return this.#animateWorldPosition(entityId, addVec3(world.position, movement), durationMs(durationValue), easeFor(styleValue));
  }

  #turnToFace(entityId: string, targetValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const target = this.#targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const world = this.#worldFor(entityId);
    const targetWorld = this.#projectedWorldForNode(target);
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
