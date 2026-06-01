import { rayAabbIntersection } from "../collision-detection";
import {
  CollisionHandler,
  KeyPressedHandler,
  MouseClickHandler,
  type ModifierState,
} from "../event-handlers";
import { VisibilityQuery } from "../entity-queries";
import {
  SCamera,
  SMovableTurnable,
  SScene,
  SThing,
  type Orientation,
  type Position,
  type Property,
  type Size,
  getEntityBoundingBox,
} from "../story-api";
import { distanceBetween, normalizeVec3, subtractVec3 } from "../story-api/expanded-math";

export interface SceneActivationEvent {
  readonly type: "scene-start" | "scene-end";
  readonly scene: SScene;
  readonly activationCount: number;
  readonly isActive: boolean;
}

export interface MouseClickOnObjectEvent {
  readonly type: "click" | "double-click" | "drag";
  readonly target: SThing | null;
  readonly targetName: string | null;
  readonly point: Position;
  readonly distance: number;
}

export interface KeyListenerEvent {
  readonly type: "key-press" | "key-release";
  readonly key: string;
  readonly modifiers: ModifierState;
  readonly shortcuts: readonly string[];
  readonly pressed: boolean;
}

export interface CollisionTransitionEvent {
  readonly type: "collision-start" | "collision-end" | "while-collision";
  readonly left: SThing;
  readonly right: SThing;
  readonly pairKey: string;
}

export interface ProximityWatch {
  readonly source: SThing;
  readonly target: SThing;
  readonly threshold: number;
}

export interface ProximityTransitionEvent {
  readonly type: "proximity-enter" | "proximity-exit" | "while-proximity";
  readonly source: SThing;
  readonly target: SThing;
  readonly pairKey: string;
  readonly threshold: number;
  readonly distance: number;
}

export interface OcclusionEvent {
  readonly type: "occluded" | "revealed" | "occlusion-start" | "occlusion-end" | "while-occlusion";
  readonly camera: SCamera;
  readonly target: SThing;
  readonly occluder: SThing | null;
}

export interface TransformationEvent<T = Position | Orientation | Size> {
  readonly type: "transformation";
  readonly entity: SThing;
  readonly property: "position" | "orientation" | "size";
  readonly previousValue: T;
  readonly value: T;
}

export interface ViewEvent {
  readonly type: "view-enter" | "view-exit" | "while-in-view";
  readonly camera: SCamera;
  readonly target: SThing;
}

export interface PairState {
  readonly left: SThing;
  readonly right: SThing;
  readonly pairKey: string;
}

export interface ProximityState {
  readonly source: SThing;
  readonly target: SThing;
  readonly pairKey: string;
  readonly threshold: number;
  readonly distance: number;
}

const collisionHandler = new CollisionHandler();
const visibilityQuery = new VisibilityQuery();
const entityIds = new WeakMap<SThing, string>();
let nextEntityId = 1;

export function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y, z: position.z };
}

function cloneOrientation(orientation: Orientation): Orientation {
  return { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w };
}

function cloneSize(size: Size): Size {
  return { width: size.width, height: size.height, depth: size.depth };
}

export function cloneTransformValue(value: Position | Orientation | Size): Position | Orientation | Size {
  if ("width" in value) return cloneSize(value);
  if ("w" in value) return cloneOrientation(value);
  return clonePosition(value);
}

export function entityKey(entity: SThing): string {
  const named = entity.getName();
  if (named && named.trim().length > 0) {
    return `name:${named}`;
  }
  let key = entityIds.get(entity);
  if (!key) {
    key = `entity:${nextEntityId++}`;
    entityIds.set(entity, key);
  }
  return key;
}

export function pairKey(left: SThing, right: SThing): string {
  const leftKey = entityKey(left);
  const rightKey = entityKey(right);
  return leftKey < rightKey ? `${leftKey}::${rightKey}` : `${rightKey}::${leftKey}`;
}

function positionOf(entity: SThing): Position {
  if (entity instanceof SMovableTurnable) {
    return clonePosition(entity.position);
  }
  const bounds = getEntityBoundingBox(entity);
  if (bounds) {
    return {
      x: (bounds.min.x + bounds.max.x) / 2,
      y: (bounds.min.y + bounds.max.y) / 2,
      z: (bounds.min.z + bounds.max.z) / 2,
    };
  }
  return { x: 0, y: 0, z: 0 };
}

export function collectCollisionPairs(entities: readonly SThing[]): Map<string, PairState> {
  const targets: Array<{ id: string; bounds: NonNullable<ReturnType<typeof getEntityBoundingBox>> }> = [];
  const byId = new Map<string, SThing>();
  for (const entity of entities) {
    const key = entityKey(entity);
    byId.set(key, entity);
    const bounds = getEntityBoundingBox(entity);
    if (bounds) targets.push({ id: key, bounds });
  }
  const pairs = new Map<string, PairState>();
  for (const collision of collisionHandler.getAabbCollisions(targets)) {
    const left = byId.get(collision.leftId);
    const right = byId.get(collision.rightId);
    if (!left || !right) continue;
    const key = pairKey(left, right);
    pairs.set(key, { left, right, pairKey: key });
  }
  return pairs;
}

export function collectProximityPairs(watches: readonly ProximityWatch[]): Map<string, ProximityState> {
  const active = new Map<string, ProximityState>();
  for (const watch of watches) {
    if (!Number.isFinite(watch.threshold) || watch.threshold < 0) {
      throw new TypeError("threshold must be a non-negative finite number");
    }
    const distance = distanceBetween(positionOf(watch.source), positionOf(watch.target));
    if (distance <= watch.threshold) {
      const key = pairKey(watch.source, watch.target);
      active.set(key, {
        source: watch.source,
        target: watch.target,
        pairKey: key,
        threshold: watch.threshold,
        distance,
      });
    }
  }
  return active;
}

function targetBounds(entity: SThing) {
  return getEntityBoundingBox(entity);
}

export function findOccluder(camera: SCamera, target: SThing, occluders: readonly SThing[]): SThing | null {
  if (!visibilityQuery.visibleFrom(camera, target)) {
    return null;
  }
  const targetPosition = positionOf(target);
  const cameraPosition = clonePosition(camera.position);
  const direction = subtractVec3(targetPosition, cameraPosition);
  const distance = distanceBetween(cameraPosition, targetPosition);
  if (distance === 0) {
    return null;
  }
  const rayDirection = normalizeVec3(direction);
  let nearest: { entity: SThing; distance: number } | null = null;
  for (const occluder of occluders) {
    if (occluder === target || !occluder.isShowing) continue;
    const bounds = targetBounds(occluder);
    if (!bounds) continue;
    const hit = rayAabbIntersection({ origin: cameraPosition, direction: rayDirection, maxDistance: distance }, bounds);
    if (!hit || hit.distance >= distance) continue;
    if (!nearest || hit.distance < nearest.distance) {
      nearest = { entity: occluder, distance: hit.distance };
    }
  }
  return nearest?.entity ?? null;
}

export function transformProperty<T>(entity: SThing, name: "position" | "orientation" | "size"): Property<T> | null {
  return entity.imp.getProperty<T>(name) ?? null;
}

export function createMouseClickHandler(options: { doubleClickWindowMs?: number; dragThreshold?: number } = {}): MouseClickHandler {
  return new MouseClickHandler(options.doubleClickWindowMs, options.dragThreshold);
}

export function createKeyPressedHandler(): KeyPressedHandler {
  return new KeyPressedHandler();
}

export { SCamera, SScene, SThing };
export type { ModifierState, Property };
