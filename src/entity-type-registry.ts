import {
  SBillboard,
  SBiped,
  SBox,
  SCamera,
  SCone,
  SCylinder,
  SDisc,
  SFlyer,
  SGround,
  SJointedModel,
  SMarker,
  SModel,
  SMovableTurnable,
  SProp,
  SQuadruped,
  SShape,
  SSlitherer,
  SSphere,
  SSwimmer,
  STextModel,
  SThing,
  STorus,
  STurnable,
  STransport,
  SVRHand,
  SVRHeadset,
  SVRUser,
  SAxes,
} from "./story-api";
import { SMarineMammal } from "./biped-quadruped";
import type { KnownModelClassKey, ModelClassData } from "./model-resources";
import { MODEL_CLASS_DATA } from "./model-resources";
import { getResourceType, type ResourceTypeDefinition } from "./story-resources";

export type EntityCtor<T extends SThing = SThing> = abstract new (...args: never[]) => T;

export interface EntityTypeNode {
  readonly type: EntityType;
  depth: number;
  parent: EntityTypeNode | null;
  children: EntityTypeNode[];
}

export interface ResourceEnumerationEntry {
  readonly typeName: string;
  readonly displayName: string;
  readonly modelClass: KnownModelClassKey;
  readonly category: string;
  readonly resourceClassName: string;
  readonly packageName: string;
  readonly abstractionClassName: string;
  readonly implementationClassName: string;
  readonly hiddenJoints: readonly string[];
  readonly textureNames: readonly string[];
}

export class EntityType<T extends SThing = SThing> {
  readonly name: string;
  readonly displayName: string;
  readonly parentName: string | null;
  readonly ctor: EntityCtor<T>;
  readonly category: string;
  readonly modelClass: KnownModelClassKey | null;
  readonly #createInstance: (() => T) | null;

  constructor(options: {
    readonly name: string;
    readonly parentName: string | null;
    readonly ctor: EntityCtor<T>;
    readonly category: string;
    readonly modelClass?: KnownModelClassKey | null;
    readonly createInstance?: (() => T) | null;
  }) {
    this.name = options.name;
    this.displayName = options.name.startsWith("S") ? options.name.slice(1) : options.name;
    this.parentName = options.parentName;
    this.ctor = options.ctor;
    this.category = options.category;
    this.modelClass = options.modelClass ?? null;
    this.#createInstance = options.createInstance ?? (() => new (options.ctor as unknown as new () => T)());
  }

  create(name?: string): T {
    if (!this.#createInstance) {
      throw new TypeError(`${this.name} is metadata-only and cannot be instantiated directly`);
    }
    const entity = this.#createInstance();
    if (name && typeof entity.setName === "function") {
      entity.setName(name);
    }
    return entity;
  }

  matches(value: unknown): value is T {
    return value instanceof this.ctor;
  }

  get modelClassData(): ModelClassData | null {
    return this.modelClass ? MODEL_CLASS_DATA[this.modelClass] : null;
  }

  get resourceType(): ResourceTypeDefinition | null {
    return this.modelClass ? getResourceType(this.modelClass) : null;
  }
}

class JointedModelTypeBase<T extends SJointedModel> extends EntityType<T> {}
class ShapeTypeBase<T extends SShape> extends EntityType<T> {}

export class BipedType extends JointedModelTypeBase<SBiped> {
  constructor() {
    super({ name: "SBiped", parentName: "SJointedModel", ctor: SBiped, category: "people", modelClass: "BIPED" });
  }
}

export class QuadrupedType extends JointedModelTypeBase<SQuadruped> {
  constructor() {
    super({ name: "SQuadruped", parentName: "SJointedModel", ctor: SQuadruped, category: "animals", modelClass: "QUADRUPED" });
  }
}

export class FlyerType extends JointedModelTypeBase<SFlyer> {
  constructor() {
    super({ name: "SFlyer", parentName: "SJointedModel", ctor: SFlyer, category: "animals", modelClass: "FLYER" });
  }
}

export class SwimmerType extends JointedModelTypeBase<SSwimmer> {
  constructor() {
    super({ name: "SSwimmer", parentName: "SJointedModel", ctor: SSwimmer, category: "animals", modelClass: "SWIMMER" });
  }
}

export class SlithererType extends JointedModelTypeBase<SSlitherer> {
  constructor() {
    super({ name: "SSlitherer", parentName: "SJointedModel", ctor: SSlitherer, category: "animals", modelClass: "SLITHERER" });
  }
}

export class MarineMammalType extends JointedModelTypeBase<SMarineMammal> {
  constructor() {
    super({ name: "SMarineMammal", parentName: "SSwimmer", ctor: SMarineMammal, category: "animals", modelClass: "MARINE_MAMMAL" });
  }
}

export class PropType extends JointedModelTypeBase<SProp> {
  constructor() {
    super({ name: "SProp", parentName: "SJointedModel", ctor: SProp, category: "props", modelClass: "PROP" });
  }
}

export class DiscType extends ShapeTypeBase<SDisc> {
  constructor() {
    super({ name: "SDisc", parentName: "SShape", ctor: SDisc, category: "shapes" });
  }
}

export class BoxType extends ShapeTypeBase<SBox> {
  constructor() {
    super({ name: "SBox", parentName: "SShape", ctor: SBox, category: "shapes" });
  }
}

export class SphereType extends ShapeTypeBase<SSphere> {
  constructor() {
    super({ name: "SSphere", parentName: "SShape", ctor: SSphere, category: "shapes" });
  }
}

export class CylinderType extends ShapeTypeBase<SCylinder> {
  constructor() {
    super({ name: "SCylinder", parentName: "SShape", ctor: SCylinder, category: "shapes" });
  }
}

export class ConeType extends ShapeTypeBase<SCone> {
  constructor() {
    super({ name: "SCone", parentName: "SShape", ctor: SCone, category: "shapes" });
  }
}

export class TorusType extends ShapeTypeBase<STorus> {
  constructor() {
    super({ name: "STorus", parentName: "SShape", ctor: STorus, category: "shapes" });
  }
}

export class GroundType extends EntityType<SGround> {
  constructor() {
    super({ name: "SGround", parentName: "SThing", ctor: SGround, category: "environment" });
  }
}

export class CameraType extends EntityType<SCamera> {
  constructor() {
    super({ name: "SCamera", parentName: "SMovableTurnable", ctor: SCamera, category: "cameras" });
  }
}

export class MarkerType extends EntityType<SMarker> {
  constructor() {
    super({ name: "SMarker", parentName: "SMovableTurnable", ctor: SMarker, category: "markers" });
  }
}

export class BillboardType extends EntityType<SBillboard> {
  constructor() {
    super({ name: "SBillboard", parentName: "SModel", ctor: SBillboard, category: "decorations" });
  }
}

export class TextModelType extends EntityType<STextModel> {
  constructor() {
    super({ name: "STextModel", parentName: "SModel", ctor: STextModel, category: "text" });
  }
}

export class TransportType extends EntityType<STransport> {
  constructor() {
    super({ name: "STransport", parentName: "SMovableTurnable", ctor: STransport, category: "vehicles", modelClass: "VEHICLE" });
  }
}

export class VRHandType extends EntityType<SVRHand> {
  constructor() {
    super({ name: "SVRHand", parentName: "SMovableTurnable", ctor: SVRHand, category: "vr" });
  }
}

export class VRHeadsetType extends EntityType<SVRHeadset> {
  constructor() {
    super({ name: "SVRHeadset", parentName: "SMovableTurnable", ctor: SVRHeadset, category: "vr" });
  }
}

export class VRUserType extends EntityType<SVRUser> {
  constructor() {
    super({ name: "SVRUser", parentName: "SMovableTurnable", ctor: SVRUser, category: "vr" });
  }
}

export class AxesType extends EntityType<SAxes> {
  constructor() {
    super({ name: "SAxes", parentName: "SShape", ctor: SAxes, category: "markers" });
  }
}

export class TypeInheritanceTree {
  readonly nodes: ReadonlyMap<string, EntityTypeNode>;
  readonly roots: readonly EntityTypeNode[];

  constructor(types: readonly EntityType[]) {
    const byName = new Map<string, EntityTypeNode>();
    for (const type of types) {
      byName.set(type.name, {
        type,
        depth: 0,
        parent: null,
        children: [],
      });
    }

    for (const node of byName.values()) {
      if (!node.type.parentName) {
        continue;
      }
      const parent = byName.get(node.type.parentName);
      if (!parent) {
        continue;
      }
      node.parent = parent;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    }

    this.nodes = byName;
    this.roots = [...byName.values()]
      .filter((node) => node.parent === null)
      .sort((left, right) => left.type.name.localeCompare(right.type.name));
  }

  get(typeName: string): EntityTypeNode | null {
    return this.nodes.get(typeName) ?? null;
  }

  pathTo(typeName: string): string[] {
    const path: string[] = [];
    let current = this.get(typeName);
    while (current) {
      path.unshift(current.type.name);
      current = current.parent;
    }
    return path;
  }

  ancestryOf(typeName: string): EntityType[] {
    return this.pathTo(typeName)
      .map((name) => this.nodes.get(name)?.type)
      .filter((type): type is EntityType => type !== undefined);
  }

  isA(typeName: string, ancestorTypeName: string): boolean {
    return this.pathTo(typeName).includes(ancestorTypeName);
  }

  descendantsOf(typeName: string): EntityType[] {
    const root = this.get(typeName);
    if (!root) {
      return [];
    }
    const result: EntityType[] = [];
    const visit = (node: EntityTypeNode): void => {
      for (const child of node.children) {
        result.push(child.type);
        visit(child);
      }
    };
    visit(root);
    return result;
  }
}

export class ResourceEnumeration {
  constructor(private readonly registry: EntityTypeRegistry = EntityTypeRegistry.getInstance()) {}

  listAll(): ResourceEnumerationEntry[] {
    return this.registry.listTypes()
      .filter((type) => type.modelClass !== null)
      .map((type) => this.#toEntry(type))
      .sort((left, right) => left.typeName.localeCompare(right.typeName));
  }

  listForType(typeName: string): ResourceEnumerationEntry[] {
    const tree = this.registry.getInheritanceTree();
    return this.registry.listTypes()
      .filter((type) => type.modelClass !== null)
      .filter((type) => type.name === typeName || tree.isA(type.name, typeName))
      .map((type) => this.#toEntry(type))
      .sort((left, right) => left.typeName.localeCompare(right.typeName));
  }

  #toEntry(type: EntityType): ResourceEnumerationEntry {
    const resourceType = type.resourceType;
    const modelClass = type.modelClassData;
    if (!resourceType || !type.modelClass || !modelClass) {
      throw new TypeError(`${type.name} does not define a model resource class`);
    }
    return {
      typeName: type.name,
      displayName: type.displayName,
      modelClass: type.modelClass,
      category: modelClass.category,
      resourceClassName: resourceType.resourceClassName,
      packageName: modelClass.packageName,
      abstractionClassName: modelClass.abstractionClassName,
      implementationClassName: modelClass.implementationClassName,
      hiddenJoints: [...resourceType.hiddenJoints],
      textureNames: [...resourceType.textureNames],
    };
  }
}

export class EntityTypeRegistry {
  static #instance: EntityTypeRegistry | null = null;

  static getInstance(): EntityTypeRegistry {
    if (EntityTypeRegistry.#instance === null) {
      EntityTypeRegistry.#instance = new EntityTypeRegistry();
    }
    return EntityTypeRegistry.#instance;
  }

  readonly #types = new Map<string, EntityType>();
  #tree: TypeInheritanceTree | null = null;

  private constructor() {
    for (const type of [
      new EntityType({ name: "SThing", parentName: null, ctor: SThing, category: "core", createInstance: () => new SThing() }),
      new EntityType({ name: "STurnable", parentName: "SThing", ctor: STurnable, category: "core", createInstance: () => new STurnable() }),
      new EntityType({ name: "SMovableTurnable", parentName: "STurnable", ctor: SMovableTurnable, category: "core", createInstance: () => new SMovableTurnable() }),
      new EntityType({ name: "SModel", parentName: "SMovableTurnable", ctor: SModel, category: "core", createInstance: () => new SModel() }),
      new EntityType({ name: "SShape", parentName: "SModel", ctor: SShape, category: "shapes" }),
      new EntityType({ name: "SJointedModel", parentName: "SModel", ctor: SJointedModel, category: "models", createInstance: () => new SJointedModel() }),
      new GroundType(),
      new CameraType(),
      new MarkerType(),
      new BillboardType(),
      new TextModelType(),
      new BoxType(),
      new SphereType(),
      new DiscType(),
      new CylinderType(),
      new ConeType(),
      new TorusType(),
      new PropType(),
      new BipedType(),
      new QuadrupedType(),
      new FlyerType(),
      new SwimmerType(),
      new SlithererType(),
      new MarineMammalType(),
      new TransportType(),
      new VRHandType(),
      new VRHeadsetType(),
      new VRUserType(),
      new AxesType(),
    ]) {
      this.register(type);
    }
  }

  register(type: EntityType): this {
    this.#types.set(type.name, type);
    this.#tree = null;
    return this;
  }

  listTypes(): EntityType[] {
    return [...this.#types.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  get(typeName: string): EntityType | null {
    return this.#types.get(typeName) ?? null;
  }

  require(typeName: string): EntityType {
    const type = this.get(typeName);
    if (!type) {
      throw new TypeError(`unknown entity type ${typeName}`);
    }
    return type;
  }

  create<T extends SThing = SThing>(typeName: string, name?: string): T {
    return this.require(typeName).create(name) as T;
  }

  getMostSpecificTypeForInstance(value: unknown): EntityType | null {
    const matches = this.listTypes().filter((type) => type.matches(value));
    if (matches.length === 0) {
      return null;
    }
    const tree = this.getInheritanceTree();
    return matches.sort((left, right) => tree.pathTo(right.name).length - tree.pathTo(left.name).length)[0] ?? null;
  }

  getInheritanceTree(): TypeInheritanceTree {
    if (!this.#tree) {
      this.#tree = new TypeInheritanceTree(this.listTypes());
    }
    return this.#tree;
  }

  listDescendants(typeName: string): EntityType[] {
    return this.getInheritanceTree().descendantsOf(typeName);
  }

  enumerateResources(typeName: string): ResourceEnumerationEntry[] {
    return new ResourceEnumeration(this).listForType(typeName);
  }
}

export const entityTypeRegistry = EntityTypeRegistry.getInstance();
