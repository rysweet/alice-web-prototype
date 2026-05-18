import type { AliceProject, AliceObject } from "../a3p-parser";
import type { Position, Orientation } from "./types";
import {
  SThing,
  SGround,
  SScene,
  STurnable,
  SMovableTurnable,
  SCamera,
  SModel,
  SJointedModel,
  SBiped,
  SFlyer,
  SQuadruped,
  SProp,
} from "./entities";

/** Single source of truth for type-name → entity factory mappings. */
const TYPE_FACTORIES: Array<[suffix: string, factory: () => SThing]> = [
  ["SBiped", () => new SBiped()],
  ["SFlyer", () => new SFlyer()],
  ["SQuadruped", () => new SQuadruped()],
  ["SProp", () => new SProp()],
  ["SGround", () => new SGround()],
  ["SCamera", () => new SCamera()],
  ["SScene", () => new SScene()],
  ["SJointedModel", () => new SJointedModel()],
  ["SModel", () => new SModel()],
];

/** O(1) lookup by exact suffix (e.g. "org.lgna.story.SBiped" → "SBiped"). */
const SUFFIX_TYPE_MAP = new Map<string, () => SThing>(TYPE_FACTORIES);

export function createEntityForType(typeName: string): SThing {
  // Fast path: extract suffix after last dot for O(1) Map lookup
  const dotIdx = typeName.lastIndexOf(".");
  const suffix = dotIdx >= 0 ? typeName.substring(dotIdx + 1) : typeName;
  const fast = SUFFIX_TYPE_MAP.get(suffix);
  if (fast) return fast();

  // Slow path: substring scan for unconventional type names
  for (const [substring, factory] of TYPE_FACTORIES) {
    if (typeName.includes(substring)) return factory();
  }
  return new SProp();
}

/** Runtime container for scene entities (analogous to Java's SceneImp). */
export class Scene {
  private readonly _entities = new Map<string, SThing>();

  atmosphereColor: string | undefined;
  fogDensity: number | undefined;
  ambientLightColor: string | undefined;

  get entities(): ReadonlyMap<string, SThing> {
    return this._entities;
  }

  addEntity(name: string, entity: SThing): void {
    if (!name.trim()) {
      throw new TypeError("entity name must be a non-empty string");
    }
    if (this._entities.has(name)) {
      throw new TypeError(`entity "${name}" already exists in scene`);
    }
    this._entities.set(name, entity);
  }

  removeEntity(name: string): boolean {
    return this._entities.delete(name);
  }

  getEntity(name: string): SThing | undefined {
    return this._entities.get(name);
  }

  setEntityPosition(name: string, position: Position): void {
    const entity = this._entities.get(name);
    if (!entity) {
      throw new TypeError(`entity "${name}" not found`);
    }
    if (!(entity instanceof SMovableTurnable)) {
      throw new TypeError(
        `entity "${name}" (${entity.constructor.name}) does not support position`,
      );
    }
    if (!isFinitePosition(position)) {
      throw new TypeError("position coordinates must be finite numbers");
    }
    entity.position = position;
  }

  setEntityOrientation(name: string, orientation: Orientation): void {
    const entity = this._entities.get(name);
    if (!entity) {
      throw new TypeError(`entity "${name}" not found`);
    }
    if (!(entity instanceof STurnable)) {
      throw new TypeError(
        `entity "${name}" (${entity.constructor.name}) does not support orientation`,
      );
    }
    if (!isFiniteOrientation(orientation)) {
      throw new TypeError("orientation components must be finite numbers");
    }
    entity.orientation = orientation;
  }

  /** Bridge from parser output to typed entity model. */
  static fromProject(project: AliceProject): Scene {
    const scene = new Scene();

    for (const obj of project.sceneObjects) {
      const entity = createEntityForType(obj.typeName);
      scene.addEntity(obj.name, entity);
      applyTransforms(entity, obj);
    }

    return scene;
  }
}

function isFinitePosition(p: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

function isFiniteOrientation(o: { x: number; y: number; z: number; w: number }): boolean {
  return Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z) && Number.isFinite(o.w);
}

function isFiniteSize(s: { width: number; height: number; depth: number }): boolean {
  return Number.isFinite(s.width) && Number.isFinite(s.height) && Number.isFinite(s.depth);
}

function applyTransforms(entity: SThing, obj: AliceObject): void {
  if (entity instanceof SMovableTurnable && obj.position && isFinitePosition(obj.position)) {
    entity.position = obj.position;
  }
  if (entity instanceof STurnable && obj.orientation && isFiniteOrientation(obj.orientation)) {
    entity.orientation = obj.orientation;
  }
  if (entity instanceof SModel && obj.size && isFiniteSize(obj.size)) {
    entity.size = obj.size;
  }
}
