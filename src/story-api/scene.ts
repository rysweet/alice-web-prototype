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

/** Type mapping entries checked in order — first match wins. */
const TYPE_MAP: Array<[substring: string, factory: () => SThing]> = [
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

function createEntityForType(typeName: string): SThing {
  for (const [substring, factory] of TYPE_MAP) {
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
    if (
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
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
    if (
      !Number.isFinite(orientation.x) ||
      !Number.isFinite(orientation.y) ||
      !Number.isFinite(orientation.z) ||
      !Number.isFinite(orientation.w)
    ) {
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
