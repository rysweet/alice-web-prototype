import type { AliceObject, AliceProject } from "../a3p-parser";
import {
  SAxes,
  SBillboard,
  SBiped,
  SBox,
  SCamera,
  SCameraMarker,
  SCone,
  SCylinder,
  SDisc,
  SFlyer,
  SGround,
  SJointedModel,
  SMarker,
  SModel,
  SMovableTurnable,
  SProgram,
  SProp,
  SQuadruped,
  SScene,
  SSlitherer,
  SSphere,
  SSun,
  SSwimmer,
  STarget,
  STextModel,
  SThing,
  SThingMarker,
  STorus,
  STurnable,
} from "./expanded-entities";
import type { ProgramImp, SceneActivationController } from "./expanded-implementation";
import { isFiniteOrientation, isFinitePosition, isFiniteSize } from "./expanded-math";
import type { Orientation, Position } from "./expanded-types";

const TYPE_FACTORIES: Array<[suffix: string, factory: () => SThing]> = [
  ["SBiped", () => new SBiped()],
  ["SFlyer", () => new SFlyer()],
  ["SQuadruped", () => new SQuadruped()],
  ["SSlitherer", () => new SSlitherer()],
  ["SSwimmer", () => new SSwimmer()],
  ["SProp", () => new SProp()],
  ["SDisc", () => new SDisc()],
  ["SSphere", () => new SSphere()],
  ["SBox", () => new SBox()],
  ["SCone", () => new SCone()],
  ["SCylinder", () => new SCylinder()],
  ["STorus", () => new STorus()],
  ["STextModel", () => new STextModel()],
  ["SBillboard", () => new SBillboard()],
  ["SAxes", () => new SAxes()],
  ["SSun", () => new SSun()],
  ["STarget", () => new STarget()],
  ["SCameraMarker", () => new SCameraMarker()],
  ["SThingMarker", () => new SThingMarker()],
  ["SMarker", () => new SMarker()],
  ["SGround", () => new SGround()],
  ["SCamera", () => new SCamera()],
  ["SScene", () => new SScene()],
  ["SJointedModel", () => new SJointedModel()],
  ["SModel", () => new SModel()],
];

const SUFFIX_TYPE_MAP = new Map<string, () => SThing>(TYPE_FACTORIES);

export function createEntityForType(typeName: string): SThing {
  const dotIndex = typeName.lastIndexOf(".");
  const suffix = dotIndex >= 0 ? typeName.slice(dotIndex + 1) : typeName;
  const fast = SUFFIX_TYPE_MAP.get(suffix);
  if (fast) {
    return fast();
  }
  for (const [substring, factory] of TYPE_FACTORIES) {
    if (typeName.includes(substring)) {
      return factory();
    }
  }
  return new SProp();
}

export class Scene implements SceneActivationController {
  readonly #entities = new Map<string, SThing>();
  #isActive = false;
  #program: ProgramImp | null = null;

  atmosphereColor: string | undefined;
  fogDensity: number | undefined;
  ambientLightColor: string | undefined;

  get entities(): ReadonlyMap<string, SThing> {
    return this.#entities;
  }

  get isActive(): boolean {
    return this.#isActive;
  }

  get program(): ProgramImp | null {
    return this.#program;
  }

  bindProgram(program: ProgramImp | null): void {
    this.#program = program;
  }

  activate(): void {
    if (this.#isActive) {
      return;
    }
    this.#isActive = true;
    for (const entity of this.#entities.values()) {
      entity.imp.attachToScene(this);
      entity.imp.activate();
    }
  }

  deactivate(): void {
    if (!this.#isActive) {
      return;
    }
    for (const entity of this.#entities.values()) {
      entity.imp.deactivate();
    }
    this.#isActive = false;
  }

  addEntity(name: string, entity: SThing): void {
    if (!name.trim()) {
      throw new TypeError("entity name must be a non-empty string");
    }
    if (this.#entities.has(name)) {
      throw new TypeError(`entity \"${name}\" already exists in scene`);
    }
    this.#entities.set(name, entity);
    entity.name = entity.name ?? name;
    entity.imp.attachToScene(this);
    if (this.#isActive) {
      entity.imp.activate();
    }
  }

  removeEntity(name: string): boolean {
    const entity = this.#entities.get(name);
    if (!entity) {
      return false;
    }
    entity.imp.detachFromScene();
    return this.#entities.delete(name);
  }

  getEntity(name: string): SThing | undefined {
    return this.#entities.get(name);
  }

  setEntityPosition(name: string, position: Position): void {
    const entity = this.#entities.get(name);
    if (!entity) {
      throw new TypeError(`entity \"${name}\" not found`);
    }
    if (!(entity instanceof SMovableTurnable)) {
      throw new TypeError(`entity \"${name}\" (${entity.constructor.name}) does not support position`);
    }
    if (!isFinitePosition(position)) {
      throw new TypeError("position coordinates must be finite numbers");
    }
    entity.position = position;
  }

  setEntityOrientation(name: string, orientation: Orientation): void {
    const entity = this.#entities.get(name);
    if (!entity) {
      throw new TypeError(`entity \"${name}\" not found`);
    }
    if (!(entity instanceof STurnable)) {
      throw new TypeError(`entity \"${name}\" (${entity.constructor.name}) does not support orientation`);
    }
    if (!isFiniteOrientation(orientation)) {
      throw new TypeError("orientation components must be finite numbers");
    }
    entity.orientation = orientation;
  }

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

function applyTransforms(entity: SThing, obj: AliceObject): void {
  if (entity instanceof SMovableTurnable && obj.position && isFinitePosition(obj.position)) {
    entity.position = obj.position;
  }
  if (entity instanceof STurnable && obj.orientation && isFiniteOrientation(obj.orientation)) {
    entity.orientation = obj.orientation;
  }
  if ((entity instanceof SModel || entity instanceof SMarker) && obj.size && isFiniteSize(obj.size)) {
    entity.size = obj.size;
  }
}

export function activateScene(program: SProgram, scene: Scene): void {
  program.setActiveScene(scene);
}
