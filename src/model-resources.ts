import type { BoundingBox, JointNode, Orientation, Position } from "./story-api";
import type { MaterialDefinition } from "./materials";

export interface BaseModelClassData {
  readonly abstractionClassName: string;
  readonly implementationClassName: string;
}

export interface ModelClassData extends BaseModelClassData {
  readonly resourceClassName: string;
  readonly packageName: string;
  readonly category: string;
}

export const BASE_MODEL_CLASS_DATA = {
  PROP: {
    abstractionClassName: "SJointedModel",
    implementationClassName: "BasicJointedModelImp",
  },
  BIPED: {
    abstractionClassName: "SBiped",
    implementationClassName: "BipedImp",
  },
  SWIMMER: {
    abstractionClassName: "SSwimmer",
    implementationClassName: "SwimmerImp",
  },
  FLYER: {
    abstractionClassName: "SFlyer",
    implementationClassName: "FlyerImp",
  },
  QUADRUPED: {
    abstractionClassName: "SQuadruped",
    implementationClassName: "QuadrupedImp",
  },
  VEHICLE: {
    abstractionClassName: "STransport",
    implementationClassName: "TransportImp",
  },
  SLITHERER: {
    abstractionClassName: "SSlitherer",
    implementationClassName: "SlithererImp",
  },
} satisfies Record<string, BaseModelClassData>;

export const MODEL_CLASS_DATA = {
  BIPED: {
    ...BASE_MODEL_CLASS_DATA.BIPED,
    resourceClassName: "BipedResource",
    packageName: "org.lgna.story.resources.biped",
    category: "people",
  },
  FLYER: {
    ...BASE_MODEL_CLASS_DATA.FLYER,
    resourceClassName: "FlyerResource",
    packageName: "org.lgna.story.resources.flyer",
    category: "animals",
  },
  QUADRUPED: {
    ...BASE_MODEL_CLASS_DATA.QUADRUPED,
    resourceClassName: "QuadrupedResource",
    packageName: "org.lgna.story.resources.quadruped",
    category: "animals",
  },
  SWIMMER: {
    ...BASE_MODEL_CLASS_DATA.SWIMMER,
    resourceClassName: "SwimmerResource",
    packageName: "org.lgna.story.resources.swimmer",
    category: "animals",
  },
  FISH: {
    ...BASE_MODEL_CLASS_DATA.SWIMMER,
    resourceClassName: "FishResource",
    packageName: "org.lgna.story.resources.fish",
    category: "animals",
  },
  MARINE_MAMMAL: {
    ...BASE_MODEL_CLASS_DATA.SWIMMER,
    resourceClassName: "MarineMammalResource",
    packageName: "org.lgna.story.resources.marinemammal",
    category: "animals",
  },
  PROP: {
    ...BASE_MODEL_CLASS_DATA.PROP,
    resourceClassName: "PropResource",
    packageName: "org.lgna.story.resources.prop",
    category: "props",
  },
  VEHICLE: {
    ...BASE_MODEL_CLASS_DATA.VEHICLE,
    resourceClassName: "TransportResource",
    packageName: "org.lgna.story.resources.transport",
    category: "vehicles",
  },
  AUTOMOBILE: {
    ...BASE_MODEL_CLASS_DATA.VEHICLE,
    resourceClassName: "AutomobileResource",
    packageName: "org.lgna.story.resources.automobile",
    category: "vehicles",
  },
  AIRCRAFT: {
    ...BASE_MODEL_CLASS_DATA.VEHICLE,
    resourceClassName: "AircraftResource",
    packageName: "org.lgna.story.resources.aircraft",
    category: "vehicles",
  },
  WATERCRAFT: {
    ...BASE_MODEL_CLASS_DATA.VEHICLE,
    resourceClassName: "WatercraftResource",
    packageName: "org.lgna.story.resources.watercraft",
    category: "vehicles",
  },
  TRAIN: {
    ...BASE_MODEL_CLASS_DATA.VEHICLE,
    resourceClassName: "TrainResource",
    packageName: "org.lgna.story.resources.train",
    category: "vehicles",
  },
  SLITHERER: {
    ...BASE_MODEL_CLASS_DATA.SLITHERER,
    resourceClassName: "SlithererResource",
    packageName: "org.lgna.story.resources.slitherer",
    category: "animals",
  },
} satisfies Record<string, ModelClassData>;

export type KnownModelClassKey = keyof typeof MODEL_CLASS_DATA;

export interface ModelGeometryData {
  readonly vertices: readonly number[];
  readonly indices: readonly number[];
  readonly normals?: readonly number[];
  readonly uvs?: readonly number[];
  readonly bounds?: BoundingBox | null;
}

export interface ModelJointDefinition {
  readonly name: string;
  readonly parentName: string | null;
  readonly localTransform?: {
    readonly position: Position;
    readonly orientation: Orientation;
  };
  readonly bounds?: BoundingBox | null;
}

export interface ModelClassInfo {
  readonly modelClass: ModelClassData;
  readonly joints: readonly ModelJointDefinition[];
  readonly hierarchy: readonly JointNode[];
  readonly jointArrays: Readonly<Record<string, readonly string[]>>;
  readonly boundingBox: BoundingBox | null;
}

export interface ModelClassInfoSource {
  readonly joints?: readonly ModelJointDefinition[];
  readonly boundingBox?: BoundingBox | null;
  readonly customArrayNameMap?: Readonly<Record<string, string>>;
  readonly suppressedJoints?: readonly string[];
  readonly arrayNamesToSkip?: readonly string[];
  readonly removeRootJoints?: boolean;
}

export interface ModelResourceLoadResult {
  readonly geometry?: ModelGeometryData;
  readonly materials?: readonly MaterialDefinition[];
  readonly textures?: Readonly<Record<string, Uint8Array>>;
  readonly thumbnail?: Uint8Array | null;
  readonly classInfo?: ModelClassInfoSource;
}

export interface ModelResourceDefinition {
  readonly id: string;
  readonly name: string;
  readonly modelName: string;
  readonly category: string;
  readonly modelClass: KnownModelClassKey | ModelClassData;
  readonly tags?: readonly string[];
  readonly treePath?: readonly string[];
  readonly geometry?: ModelGeometryData;
  readonly materials?: readonly MaterialDefinition[];
  readonly textures?: Readonly<Record<string, Uint8Array>>;
  readonly thumbnail?: Uint8Array | null;
  readonly classInfo?: ModelClassInfoSource;
  readonly loader?: (definition: ModelResourceSummary) => ModelResourceLoadResult | Promise<ModelResourceLoadResult>;
}

export interface ModelResourceSummary {
  readonly id: string;
  readonly name: string;
  readonly modelName: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly treePath: readonly string[];
  readonly modelClass: ModelClassData;
}

export interface LoadedModelResource extends ModelResourceSummary {
  readonly geometry: ModelGeometryData;
  readonly materials: readonly MaterialDefinition[];
  readonly textures: Readonly<Record<string, Uint8Array>>;
  readonly thumbnail: Uint8Array | null;
  readonly classInfo: ModelClassInfo;
}

export interface ModelDiscoveryOptions {
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly query?: string;
}

export interface ModelBrowserNode {
  readonly id: string;
  readonly name: string;
  readonly kind: "folder" | "model";
  readonly children: readonly ModelBrowserNode[];
  readonly resourceId?: string;
  readonly category?: string;
  readonly modelClass?: ModelClassData;
}

const ARRAY_PATTERN = /(_\d*$)/i;
const ZERO_POSITION: Position = { x: 0, y: 0, z: 0 };
const IDENTITY_ORIENTATION: Orientation = { x: 0, y: 0, z: 0, w: 1 };

function clonePosition(position: Position): Position {
  return { ...position };
}

function cloneOrientation(orientation: Orientation): Orientation {
  return { ...orientation };
}

function cloneBoundingBox(bounds: BoundingBox | null | undefined): BoundingBox | null {
  if (!bounds) {
    return null;
  }
  return {
    min: { ...bounds.min },
    max: { ...bounds.max },
  };
}

function cloneGeometry(geometry: ModelGeometryData): ModelGeometryData {
  return {
    vertices: [...geometry.vertices],
    indices: [...geometry.indices],
    ...(geometry.normals ? { normals: [...geometry.normals] } : {}),
    ...(geometry.uvs ? { uvs: [...geometry.uvs] } : {}),
    ...(geometry.bounds !== undefined ? { bounds: cloneBoundingBox(geometry.bounds) } : {}),
  };
}

function cloneJointDefinition(joint: ModelJointDefinition): ModelJointDefinition {
  return {
    name: joint.name,
    parentName: joint.parentName,
    ...(joint.localTransform
      ? {
          localTransform: {
            position: clonePosition(joint.localTransform.position),
            orientation: cloneOrientation(joint.localTransform.orientation),
          },
        }
      : {}),
    ...(joint.bounds !== undefined ? { bounds: cloneBoundingBox(joint.bounds) } : {}),
  };
}

function cloneJointNode(node: JointNode): JointNode {
  return {
    name: node.name,
    parentName: node.parentName,
    localTransform: {
      position: clonePosition(node.localTransform.position),
      orientation: cloneOrientation(node.localTransform.orientation),
    },
    children: node.children.map(cloneJointNode),
  };
}

function cloneMaterialDefinitions(materials: readonly MaterialDefinition[]): MaterialDefinition[] {
  return materials.map((material) => ({ ...material }));
}

function cloneTextureRecord(textures: Readonly<Record<string, Uint8Array>>): Record<string, Uint8Array> {
  const result: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(textures)) {
    result[key] = new Uint8Array(value);
  }
  return result;
}

function cloneSummary(summary: ModelResourceSummary): ModelResourceSummary {
  return {
    ...summary,
    tags: [...summary.tags],
    treePath: [...summary.treePath],
    modelClass: { ...summary.modelClass },
  };
}

function cloneLoadedResource(resource: LoadedModelResource): LoadedModelResource {
  return {
    ...cloneSummary(resource),
    geometry: cloneGeometry(resource.geometry),
    materials: cloneMaterialDefinitions(resource.materials),
    textures: cloneTextureRecord(resource.textures),
    thumbnail: resource.thumbnail ? new Uint8Array(resource.thumbnail) : null,
    classInfo: {
      modelClass: { ...resource.classInfo.modelClass },
      joints: resource.classInfo.joints.map(cloneJointDefinition),
      hierarchy: resource.classInfo.hierarchy.map(cloneJointNode),
      jointArrays: Object.fromEntries(
        Object.entries(resource.classInfo.jointArrays).map(([name, entries]) => [name, [...entries]]),
      ),
      boundingBox: cloneBoundingBox(resource.classInfo.boundingBox),
    },
  };
}

function resolveModelClass(modelClass: KnownModelClassKey | ModelClassData): ModelClassData {
  if (typeof modelClass === "string") {
    return { ...MODEL_CLASS_DATA[modelClass] };
  }
  return { ...modelClass };
}

function normalizeTreePath(definition: ModelResourceDefinition): string[] {
  return definition.treePath && definition.treePath.length > 0
    ? definition.treePath.map((segment) => segment.trim()).filter(Boolean)
    : [definition.category];
}

function computeBoundsFromGeometry(geometry: ModelGeometryData): BoundingBox | null {
  if (geometry.bounds !== undefined) {
    return cloneBoundingBox(geometry.bounds);
  }
  if (geometry.vertices.length === 0) {
    return null;
  }
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < geometry.vertices.length; index += 3) {
    const x = geometry.vertices[index];
    const y = geometry.vertices[index + 1];
    const z = geometry.vertices[index + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function defaultJointTransform(joint: ModelJointDefinition): { position: Position; orientation: Orientation } {
  return {
    position: clonePosition(joint.localTransform?.position ?? ZERO_POSITION),
    orientation: cloneOrientation(joint.localTransform?.orientation ?? IDENTITY_ORIENTATION),
  };
}

export function enumToCamelCase(enumName: string, startWithLowerCase = false): string {
  let result = "";
  for (let index = 0; index < enumName.length; index += 1) {
    if (index === 0) {
      result += startWithLowerCase
        ? enumName[index].toLowerCase()
        : enumName[index].toUpperCase();
    } else if (enumName[index - 1] === "_") {
      result += enumName[index].toUpperCase();
    } else if (enumName[index] !== "_") {
      result += enumName[index].toLowerCase();
    }
  }
  return result;
}

export function camelCaseToEnum(name: string): string {
  let result = "";
  for (let index = 0; index < name.length; index += 1) {
    if (index !== 0 && /[A-Z]/.test(name[index])) {
      result += "_";
    }
    result += name[index].toUpperCase();
  }
  return result;
}

export function isEnumName(name: string): boolean {
  return [...name].every((character) => character === "_" || /[A-Z0-9]/.test(character));
}

export function makeEnumName(name: string): string {
  if (isEnumName(name)) {
    return name;
  }
  return name.includes("_") ? name.toUpperCase() : camelCaseToEnum(name);
}

export function getDefaultTextureEnumName(_resourceName: string | null | undefined): string {
  return "DEFAULT";
}

function createTextureBaseName(modelName: string | null, textureName: string | null): string | null {
  if (modelName === null) {
    return null;
  }
  let normalizedTextureName = textureName;
  if (normalizedTextureName === null) {
    normalizedTextureName = "_cls";
  } else if (
    normalizedTextureName.toUpperCase() === getDefaultTextureEnumName(modelName)
    || modelName.toLowerCase() === enumToCamelCase(normalizedTextureName).toLowerCase()
    || normalizedTextureName.toUpperCase() === makeEnumName(modelName)
  ) {
    normalizedTextureName = "";
  } else if (normalizedTextureName !== "") {
    normalizedTextureName = `_${makeEnumName(normalizedTextureName)}`;
  }
  return `${modelName.toLowerCase()}${normalizedTextureName}`;
}

export function getThumbnailResourceFileName(modelName: string | null, textureName: string | null): string | null {
  const baseName = createTextureBaseName(modelName, textureName);
  return baseName ? `${baseName}.png` : null;
}

export function getTextureResourceFileName(modelName: string, textureName: string | null, extension = "a3t"): string {
  return `${createTextureBaseName(modelName, textureName)}.${extension}`;
}

export function getVisualResourceFileNameFromModelName(modelName: string, extension = "a3r"): string {
  return `${modelName.toLowerCase()}.${extension}`;
}

export function getArrayIndexForJoint(jointName: string): number {
  if (!ARRAY_PATTERN.test(jointName)) {
    return -1;
  }
  const indexString = jointName.slice(jointName.lastIndexOf("_") + 1).replace(/^0+/, "");
  if (indexString.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(indexString, 10);
  return Number.isNaN(parsed) ? -1 : parsed;
}

export function getArrayNameForJoint(
  jointName: string,
  customArrayNameMap: Readonly<Record<string, string>> = {},
  namesToSkip: readonly string[] = [],
): string | null {
  if (!ARRAY_PATTERN.test(jointName)) {
    return null;
  }
  let name = jointName.slice(0, jointName.lastIndexOf("_"));
  if (name in customArrayNameMap) {
    name = customArrayNameMap[name]!;
  }
  return namesToSkip.some((candidate) => candidate.toLowerCase() === name.toLowerCase())
    ? null
    : name;
}

export function hasArray(
  arrayName: string,
  joints: readonly ModelJointDefinition[],
  customArrayNameMap: Readonly<Record<string, string>> = {},
  namesToSkip: readonly string[] = [],
): boolean {
  return joints.some((joint) => getArrayNameForJoint(joint.name, customArrayNameMap, namesToSkip) === arrayName);
}

export function getArrayEntries(
  jointNames: readonly string[],
  customArrayNameMap: Readonly<Record<string, string>> = {},
  jointsToSuppress: readonly string[] = [],
  arrayNamesToSkip: readonly string[] = [],
): Record<string, string[]> {
  const suppressed = new Set(jointsToSuppress.map((name) => name.toLowerCase()));
  const entries: Record<string, string[]> = {};

  for (const jointName of jointNames) {
    if (suppressed.has(jointName.toLowerCase())) {
      continue;
    }
    const arrayName = getArrayNameForJoint(jointName, customArrayNameMap, arrayNamesToSkip);
    if (!arrayName) {
      continue;
    }
    (entries[arrayName] ??= []).push(jointName);
  }

  for (const [arrayName, names] of Object.entries(entries)) {
    names.sort((left, right) => {
      const leftIndex = getArrayIndexForJoint(left);
      const rightIndex = getArrayIndexForJoint(right);
      if (leftIndex === rightIndex) {
        throw new Error(`Duplicate array index detected for ${arrayName}: ${left} and ${right}`);
      }
      return leftIndex - rightIndex;
    });
  }

  return entries;
}

export function isRootJoint(jointName: string): boolean {
  return jointName.toLowerCase() === "root";
}

function hasParent(sorted: readonly ModelJointDefinition[], parentName: string | null): boolean {
  if (!parentName) {
    return true;
  }
  return sorted.some((entry) => entry.name.toLowerCase() === parentName.toLowerCase());
}

export function makeCodeReadyJointDefinitions(
  source: readonly ModelJointDefinition[],
  removeRootJoints = false,
): ModelJointDefinition[] {
  const cleaned: ModelJointDefinition[] = [];
  for (const entry of source) {
    const cloned = cloneJointDefinition(entry);
    if (removeRootJoints) {
      if (isRootJoint(cloned.name) && !cloned.parentName) {
        continue;
      }
      if (cloned.parentName && isRootJoint(cloned.parentName)) {
        cleaned.push({ ...cloned, parentName: null });
        continue;
      }
    }
    cleaned.push(cloned);
  }

  const sorted: ModelJointDefinition[] = [];
  while (sorted.length !== cleaned.length) {
    const before = sorted.length;
    for (const entry of cleaned) {
      if (!sorted.includes(entry) && hasParent(sorted, entry.parentName)) {
        sorted.push(entry);
      }
    }
    if (before === sorted.length) {
      const unresolved = cleaned
        .filter((entry) => !sorted.includes(entry))
        .map((entry) => `${entry.name} -> ${entry.parentName}`)
        .join(", ");
      throw new Error(`Joint tree cannot be ordered because one or more parents are missing or cyclic: ${unresolved}`);
    }
  }

  return sorted;
}

export function buildJointHierarchy(joints: readonly ModelJointDefinition[]): JointNode[] {
  const ordered = makeCodeReadyJointDefinitions(joints);
  const nodeMap = new Map<string, JointNode>();
  const roots: JointNode[] = [];

  for (const joint of ordered) {
    const node: JointNode = {
      name: joint.name,
      parentName: joint.parentName,
      localTransform: defaultJointTransform(joint),
      children: [],
    };
    nodeMap.set(joint.name.toUpperCase(), node);
    if (joint.parentName) {
      const parent = nodeMap.get(joint.parentName.toUpperCase());
      if (!parent) {
        throw new Error(`Missing parent joint '${joint.parentName}' for '${joint.name}'`);
      }
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots.map(cloneJointNode);
}

function normalizeClassInfo(
  modelClass: ModelClassData,
  geometry: ModelGeometryData,
  classInfo: ModelClassInfoSource | undefined,
): ModelClassInfo {
  const joints = makeCodeReadyJointDefinitions(classInfo?.joints ?? [], classInfo?.removeRootJoints ?? false);
  return {
    modelClass: { ...modelClass },
    joints,
    hierarchy: buildJointHierarchy(joints),
    jointArrays: getArrayEntries(
      joints.map((joint) => joint.name),
      classInfo?.customArrayNameMap,
      classInfo?.suppressedJoints,
      classInfo?.arrayNamesToSkip,
    ),
    boundingBox: cloneBoundingBox(classInfo?.boundingBox) ?? computeBoundsFromGeometry(geometry),
  };
}

export class ModelResourceCatalog {
  readonly #definitions = new Map<string, ModelResourceDefinition>();
  readonly #loaded = new Map<string, LoadedModelResource>();
  readonly #pending = new Map<string, Promise<LoadedModelResource>>();

  constructor(seed: readonly ModelResourceDefinition[] = []) {
    for (const definition of seed) {
      this.register(definition);
    }
  }

  register(definition: ModelResourceDefinition): void {
    const id = definition.id.trim();
    if (!id) {
      throw new TypeError("model resource id must be a non-empty string");
    }
    if (this.#definitions.has(id)) {
      throw new TypeError(`model resource \"${id}\" already exists`);
    }
    if (!definition.name.trim() || !definition.modelName.trim() || !definition.category.trim()) {
      throw new TypeError("model resource must define non-empty name, modelName, and category");
    }
    this.#definitions.set(id, {
      ...definition,
      id,
      tags: [...(definition.tags ?? [])],
      treePath: normalizeTreePath(definition),
      ...(definition.geometry ? { geometry: cloneGeometry(definition.geometry) } : {}),
      ...(definition.materials ? { materials: cloneMaterialDefinitions(definition.materials) } : {}),
      ...(definition.textures ? { textures: cloneTextureRecord(definition.textures) } : {}),
      ...(definition.thumbnail ? { thumbnail: new Uint8Array(definition.thumbnail) } : {}),
      ...(definition.classInfo
        ? {
            classInfo: {
              ...definition.classInfo,
              ...(definition.classInfo.joints ? { joints: definition.classInfo.joints.map(cloneJointDefinition) } : {}),
              ...(definition.classInfo.boundingBox !== undefined
                ? { boundingBox: cloneBoundingBox(definition.classInfo.boundingBox) }
                : {}),
              ...(definition.classInfo.customArrayNameMap
                ? { customArrayNameMap: { ...definition.classInfo.customArrayNameMap } }
                : {}),
              ...(definition.classInfo.suppressedJoints
                ? { suppressedJoints: [...definition.classInfo.suppressedJoints] }
                : {}),
              ...(definition.classInfo.arrayNamesToSkip
                ? { arrayNamesToSkip: [...definition.classInfo.arrayNamesToSkip] }
                : {}),
            },
          }
        : {}),
    });
  }

  remove(id: string): boolean {
    const removed = this.#definitions.delete(id);
    this.#loaded.delete(id);
    this.#pending.delete(id);
    return removed;
  }

  get(id: string): ModelResourceSummary | null {
    const definition = this.#definitions.get(id);
    return definition ? this.#summaryFromDefinition(definition) : null;
  }

  list(): ModelResourceSummary[] {
    return this.discover();
  }

  categories(): string[] {
    return [...new Set(this.list().map((resource) => resource.category))].sort((left, right) => left.localeCompare(right));
  }

  byCategory(category: string): ModelResourceSummary[] {
    return this.discover({ category });
  }

  discover(options: ModelDiscoveryOptions = {}): ModelResourceSummary[] {
    const normalizedCategory = options.category?.trim().toLowerCase();
    const query = options.query?.trim().toLowerCase() ?? "";
    const requiredTags = new Set((options.tags ?? []).map((tag) => tag.toLowerCase()));

    return [...this.#definitions.values()]
      .map((definition) => this.#summaryFromDefinition(definition))
      .filter((resource) => {
        if (normalizedCategory && resource.category.toLowerCase() !== normalizedCategory) {
          return false;
        }
        for (const tag of requiredTags) {
          if (!resource.tags.some((resourceTag) => resourceTag.toLowerCase() === tag)) {
            return false;
          }
        }
        if (!query) {
          return true;
        }
        return (
          resource.id.toLowerCase().includes(query)
          || resource.name.toLowerCase().includes(query)
          || resource.modelName.toLowerCase().includes(query)
          || resource.tags.some((tag) => tag.toLowerCase().includes(query))
          || resource.modelClass.resourceClassName.toLowerCase().includes(query)
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getIfLoaded(id: string): LoadedModelResource | null {
    const loaded = this.#loaded.get(id);
    return loaded ? cloneLoadedResource(loaded) : null;
  }

  async load(id: string): Promise<LoadedModelResource> {
    const cached = this.#loaded.get(id);
    if (cached) {
      return cloneLoadedResource(cached);
    }

    const inflight = this.#pending.get(id);
    if (inflight) {
      return cloneLoadedResource(await inflight);
    }

    const definition = this.#definitions.get(id);
    if (!definition) {
      throw new Error(`Unknown model resource '${id}'`);
    }

    const summary = this.#summaryFromDefinition(definition);
    const promise = (async () => {
      const loaded = definition.loader ? await definition.loader(summary) : {};
      const geometry = loaded.geometry ?? definition.geometry;
      if (!geometry) {
        throw new Error(`Model resource '${id}' does not define geometry data`);
      }
      const normalizedGeometry: ModelGeometryData = {
        ...cloneGeometry(geometry),
        bounds: computeBoundsFromGeometry(geometry),
      };
      const materialDefinitions = loaded.materials ?? definition.materials ?? [];
      const textures = loaded.textures ?? definition.textures ?? {};
      const classInfo = normalizeClassInfo(
        summary.modelClass,
        normalizedGeometry,
        loaded.classInfo ?? definition.classInfo,
      );
      const resource: LoadedModelResource = {
        ...summary,
        geometry: normalizedGeometry,
        materials: cloneMaterialDefinitions(materialDefinitions),
        textures: cloneTextureRecord(textures),
        thumbnail: loaded.thumbnail
          ? new Uint8Array(loaded.thumbnail)
          : definition.thumbnail
            ? new Uint8Array(definition.thumbnail)
            : null,
        classInfo,
      };
      this.#loaded.set(id, resource);
      this.#pending.delete(id);
      return resource;
    })().catch((error) => {
      this.#pending.delete(id);
      throw error;
    });

    this.#pending.set(id, promise);
    return cloneLoadedResource(await promise);
  }

  buildTree(rootName = "Gallery"): ModelBrowserNode {
    const root: {
      id: string;
      name: string;
      kind: "folder";
      children: ModelBrowserNode[];
    } = {
      id: "root",
      name: rootName,
      kind: "folder",
      children: [],
    };

    for (const resource of this.list()) {
      let current = root;
      const folderPath = resource.treePath.length > 0 ? resource.treePath : [resource.category];
      let currentPath = "";
      for (const segment of folderPath) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        let folder = current.children.find(
          (child): child is ModelBrowserNode & { kind: "folder"; children: ModelBrowserNode[] } => child.kind === "folder" && child.name === segment,
        );
        if (!folder) {
          folder = {
            id: `folder:${currentPath}`,
            name: segment,
            kind: "folder",
            children: [],
          };
          current.children.push(folder);
        }
        current = folder;
      }
      current.children.push({
        id: `model:${resource.id}`,
        name: resource.name,
        kind: "model",
        children: [],
        resourceId: resource.id,
        category: resource.category,
        modelClass: { ...resource.modelClass },
      });
    }

    const sortChildren = (node: ModelBrowserNode): ModelBrowserNode => {
      const sortedChildren = [...node.children]
        .map(sortChildren)
        .sort((left, right) => {
          if (left.kind !== right.kind) {
            return left.kind === "folder" ? -1 : 1;
          }
          return left.name.localeCompare(right.name);
        });
      return { ...node, children: sortedChildren };
    };

    return sortChildren(root);
  }

  #summaryFromDefinition(definition: ModelResourceDefinition): ModelResourceSummary {
    return cloneSummary({
      id: definition.id,
      name: definition.name,
      modelName: definition.modelName,
      category: definition.category,
      tags: [...(definition.tags ?? [])],
      treePath: normalizeTreePath(definition),
      modelClass: resolveModelClass(definition.modelClass),
    });
  }
}
