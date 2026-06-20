import {
  type AnimationEasing,
  AnimationQueue,
  interpolateVec3Linear,
  slerpOrientation,
} from "./animation-loop.js";
import {
  type SceneGraphNode,
  type Transform,
  Transformable,
} from "./scene-graph.js";
import { normalizeQuaternion } from "./story-api/expanded-math.js";
import type { Orientation, Vec3 } from "./story-api/types.js";
import { targetEntityIdOf } from "./vm-scene-bridge-entities.js";
import {
  cloneTransform,
  identityTransform,
  isFiniteTransform,
  projectedWorldForNode,
  worldToLocalTransform,
} from "./vm-scene-bridge-transforms.js";

export class TransformAnimationController {
  readonly #entityNodes = new Map<string, SceneGraphNode>();
  readonly #nodeEntities = new Map<SceneGraphNode, string>();
  readonly #projectedLocals = new Map<string, Transform>();
  readonly #onTransformChanged: () => void;

  #animationQueue: AnimationQueue | null;

  constructor(animationQueue: AnimationQueue | null | undefined, onTransformChanged: () => void) {
    this.#animationQueue = animationQueue ?? new AnimationQueue();
    this.#onTransformChanged = onTransformChanged;
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
    this.#onTransformChanged();
  }

  getNodeForEntity(entityId: string): SceneGraphNode | null {
    return this.#entityNodes.get(entityId) ?? null;
  }

  localFor(entityId: string): Transform {
    return cloneTransform(this.#projectedLocals.get(entityId) ?? this.#requireTransformable(entityId).localTransform);
  }

  worldFor(entityId: string): Transform {
    const node = this.#requireTransformable(entityId);
    return this.projectedWorldForNode(node);
  }

  projectedWorldForNode(node: SceneGraphNode | null): Transform {
    return projectedWorldForNode(node, (sceneNode) => {
      const entityId = this.#nodeEntities.get(sceneNode);
      return entityId ? this.#projectedLocals.get(entityId) : sceneNode.localTransform;
    });
  }

  targetNodeFor(value: unknown): SceneGraphNode | null {
    const targetId = targetEntityIdOf(value);
    return targetId ? this.#entityNodes.get(targetId) ?? null : null;
  }

  animateLocalPosition(entityId: string, to: Vec3, duration: number, easing: AnimationEasing): Promise<void> {
    const local = this.localFor(entityId);
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

  animateLocalOrientation(entityId: string, to: Orientation, duration: number, easing: AnimationEasing): Promise<void> {
    const local = this.localFor(entityId);
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

  animateLocalScale(entityId: string, to: Vec3, duration: number, easing: AnimationEasing): Promise<void> {
    const local = this.localFor(entityId);
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

  animateWorldPosition(entityId: string, to: Vec3, duration: number, easing: AnimationEasing): Promise<void> {
    const world = this.worldFor(entityId);
    const node = this.#requireTransformable(entityId);
    const parentWorld = this.projectedWorldForNode(node.parent);
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

  animateWorldOrientation(entityId: string, to: Orientation, duration: number, easing: AnimationEasing): Promise<void> {
    const world = this.worldFor(entityId);
    const node = this.#requireTransformable(entityId);
    const parentWorld = this.projectedWorldForNode(node.parent);
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

  setVehicle(entityId: string, vehicleValue: unknown): void {
    const node = this.#requireTransformable(entityId);
    const world = this.worldFor(entityId);
    const parent = this.targetNodeFor(vehicleValue);
    if (!parent || parent === node || this.#containsDescendant(node, parent)) {
      return;
    }
    const parentWorld = this.projectedWorldForNode(parent);
    const local = worldToLocalTransform(parentWorld, world);
    if (!this.#setProjectedLocal(entityId, local)) {
      return;
    }
    parent.addChild(node);
    node.localTransform = local;
    this.#onTransformChanged();
  }

  #requireTransformable(entityId: string): Transformable {
    const node = this.#entityNodes.get(entityId);
    if (!(node instanceof Transformable)) {
      throw new TypeError(`entity "${entityId}" is not transformable`);
    }
    return node;
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
    this.#onTransformChanged();
  }

  #applyWorld(entityId: string, world: Transform): void {
    const node = this.#requireTransformable(entityId);
    const parentWorld = node.parent ? node.parent.worldTransform : identityTransform();
    node.localTransform = worldToLocalTransform(parentWorld, world);
    this.#onTransformChanged();
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
}
