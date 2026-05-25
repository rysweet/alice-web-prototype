import type { BoundingBox } from "./story-api";
import type { MaterialDefinition } from "./materials";
import {
  MODEL_CLASS_DATA,
  getThumbnailResourceFileName,
  getTextureResourceFileName,
  getVisualResourceFileNameFromModelName,
  type KnownModelClassKey,
  type LoadedModelResource,
  type ModelClassData,
  type ModelClassInfoSource,
  type ModelGeometryData,
  type ModelJointDefinition,
  type ModelResourceCatalog,
  type ModelResourceDefinition,
  type ModelResourceLoadResult,
} from "./model-resources";

export interface ResourceTypeDefinition {
  readonly id: KnownModelClassKey;
  readonly resourceClassName: string;
  readonly modelClass: ModelClassData;
  readonly joints: readonly ModelJointDefinition[];
  readonly hiddenJoints: readonly string[];
  readonly boundingBox: BoundingBox | null;
  readonly textureNames: readonly string[];
  readonly classInfo: ModelClassInfoSource;
}

export interface ResourceAssetPaths {
  readonly visual: string;
  readonly texture: string;
  readonly thumbnail: string | null;
}

export interface LoadedResourceAssets {
  readonly paths: ResourceAssetPaths;
  readonly visual: Uint8Array | null;
  readonly texture: Uint8Array | null;
  readonly thumbnail: Uint8Array | null;
}

export interface BuildResourceDefinitionOptions {
  readonly id: string;
  readonly name: string;
  readonly modelName: string;
  readonly type: KnownModelClassKey | ResourceTypeDefinition;
  readonly geometry?: ModelGeometryData;
  readonly materials?: readonly MaterialDefinition[];
  readonly textures?: Readonly<Record<string, Uint8Array>>;
  readonly thumbnail?: Uint8Array | null;
  readonly tags?: readonly string[];
  readonly treePath?: readonly string[];
  readonly loader?: (definition: ResourceTypeDefinition) => ModelResourceLoadResult | Promise<ModelResourceLoadResult>;
}

export type AssetReader = (assetPath: string) => Promise<Uint8Array | null> | Uint8Array | null;

function cloneBoundingBox(bounds: BoundingBox | null): BoundingBox | null {
  if (!bounds) {
    return null;
  }
  return {
    min: { ...bounds.min },
    max: { ...bounds.max },
  };
}

function createBoundingBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): BoundingBox {
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function joint(name: string, parentName: string | null): ModelJointDefinition {
  return { name, parentName };
}

function cloneJoint(jointDefinition: ModelJointDefinition): ModelJointDefinition {
  return {
    name: jointDefinition.name,
    parentName: jointDefinition.parentName,
    ...(jointDefinition.localTransform ? { localTransform: jointDefinition.localTransform } : {}),
    ...(jointDefinition.bounds !== undefined ? { bounds: cloneBoundingBox(jointDefinition.bounds ?? null) } : {}),
  };
}

function cloneClassInfoSource(source: ModelClassInfoSource): ModelClassInfoSource {
  return {
    ...(source.joints ? { joints: source.joints.map(cloneJoint) } : {}),
    ...(source.boundingBox !== undefined ? { boundingBox: cloneBoundingBox(source.boundingBox ?? null) } : {}),
    ...(source.customArrayNameMap ? { customArrayNameMap: { ...source.customArrayNameMap } } : {}),
    ...(source.suppressedJoints ? { suppressedJoints: [...source.suppressedJoints] } : {}),
    ...(source.arrayNamesToSkip ? { arrayNamesToSkip: [...source.arrayNamesToSkip] } : {}),
    ...(source.removeRootJoints !== undefined ? { removeRootJoints: source.removeRootJoints } : {}),
  };
}

function createResourceTypeDefinition(
  id: KnownModelClassKey,
  joints: readonly ModelJointDefinition[],
  boundingBox: BoundingBox | null,
  hiddenJoints: readonly string[] = [],
  textureNames: readonly string[] = ["DEFAULT"],
): ResourceTypeDefinition {
  const modelClass = { ...MODEL_CLASS_DATA[id] };
  const classInfo: ModelClassInfoSource = {
    joints: joints.map(cloneJoint),
    boundingBox: cloneBoundingBox(boundingBox),
  };
  return {
    id,
    resourceClassName: modelClass.resourceClassName,
    modelClass,
    joints: classInfo.joints ?? [],
    hiddenJoints: [...hiddenJoints],
    boundingBox: cloneBoundingBox(boundingBox),
    textureNames: [...textureNames],
    classInfo,
  };
}

const BIPED_JOINTS = [
  joint("ROOT", null),
  joint("PELVIS_LOWER_BODY", "ROOT"),
  joint("LEFT_HIP", "PELVIS_LOWER_BODY"),
  joint("LEFT_KNEE", "LEFT_HIP"),
  joint("LEFT_ANKLE", "LEFT_KNEE"),
  joint("LEFT_FOOT", "LEFT_ANKLE"),
  joint("RIGHT_HIP", "PELVIS_LOWER_BODY"),
  joint("RIGHT_KNEE", "RIGHT_HIP"),
  joint("RIGHT_ANKLE", "RIGHT_KNEE"),
  joint("RIGHT_FOOT", "RIGHT_ANKLE"),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK", "SPINE_UPPER"),
  joint("HEAD", "NECK"),
  joint("MOUTH", "HEAD"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("RIGHT_CLAVICLE", "SPINE_UPPER"),
  joint("RIGHT_SHOULDER", "RIGHT_CLAVICLE"),
  joint("RIGHT_ELBOW", "RIGHT_SHOULDER"),
  joint("RIGHT_WRIST", "RIGHT_ELBOW"),
  joint("RIGHT_HAND", "RIGHT_WRIST"),
  joint("RIGHT_THUMB", "RIGHT_HAND"),
  joint("RIGHT_THUMB_KNUCKLE", "RIGHT_THUMB"),
  joint("RIGHT_INDEX_FINGER", "RIGHT_HAND"),
  joint("RIGHT_INDEX_FINGER_KNUCKLE", "RIGHT_INDEX_FINGER"),
  joint("RIGHT_MIDDLE_FINGER", "RIGHT_HAND"),
  joint("RIGHT_MIDDLE_FINGER_KNUCKLE", "RIGHT_MIDDLE_FINGER"),
  joint("RIGHT_PINKY_FINGER", "RIGHT_HAND"),
  joint("RIGHT_PINKY_FINGER_KNUCKLE", "RIGHT_PINKY_FINGER"),
  joint("LEFT_CLAVICLE", "SPINE_UPPER"),
  joint("LEFT_SHOULDER", "LEFT_CLAVICLE"),
  joint("LEFT_ELBOW", "LEFT_SHOULDER"),
  joint("LEFT_WRIST", "LEFT_ELBOW"),
  joint("LEFT_HAND", "LEFT_WRIST"),
  joint("LEFT_THUMB", "LEFT_HAND"),
  joint("LEFT_THUMB_KNUCKLE", "LEFT_THUMB"),
  joint("LEFT_INDEX_FINGER", "LEFT_HAND"),
  joint("LEFT_INDEX_FINGER_KNUCKLE", "LEFT_INDEX_FINGER"),
  joint("LEFT_MIDDLE_FINGER", "LEFT_HAND"),
  joint("LEFT_MIDDLE_FINGER_KNUCKLE", "LEFT_MIDDLE_FINGER"),
  joint("LEFT_PINKY_FINGER", "LEFT_HAND"),
  joint("LEFT_PINKY_FINGER_KNUCKLE", "LEFT_PINKY_FINGER"),
] as const;

const QUADRUPED_JOINTS = [
  joint("ROOT", null),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK", "SPINE_UPPER"),
  joint("HEAD", "NECK"),
  joint("LEFT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("LEFT_EAR", "HEAD"),
  joint("MOUTH", "HEAD"),
  joint("RIGHT_EAR", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("FRONT_LEFT_CLAVICLE", "SPINE_UPPER"),
  joint("FRONT_LEFT_SHOULDER", "FRONT_LEFT_CLAVICLE"),
  joint("FRONT_LEFT_KNEE", "FRONT_LEFT_SHOULDER"),
  joint("FRONT_LEFT_ANKLE", "FRONT_LEFT_KNEE"),
  joint("FRONT_LEFT_FOOT", "FRONT_LEFT_ANKLE"),
  joint("FRONT_LEFT_TOE", "FRONT_LEFT_FOOT"),
  joint("FRONT_RIGHT_CLAVICLE", "SPINE_UPPER"),
  joint("FRONT_RIGHT_SHOULDER", "FRONT_RIGHT_CLAVICLE"),
  joint("FRONT_RIGHT_KNEE", "FRONT_RIGHT_SHOULDER"),
  joint("FRONT_RIGHT_ANKLE", "FRONT_RIGHT_KNEE"),
  joint("FRONT_RIGHT_FOOT", "FRONT_RIGHT_ANKLE"),
  joint("FRONT_RIGHT_TOE", "FRONT_RIGHT_FOOT"),
  joint("PELVIS_LOWER_BODY", "ROOT"),
  joint("TAIL_0", "PELVIS_LOWER_BODY"),
  joint("TAIL_1", "TAIL_0"),
  joint("TAIL_2", "TAIL_1"),
  joint("TAIL_3", "TAIL_2"),
  joint("BACK_LEFT_HIP", "PELVIS_LOWER_BODY"),
  joint("BACK_LEFT_KNEE", "BACK_LEFT_HIP"),
  joint("BACK_LEFT_HOCK", "BACK_LEFT_KNEE"),
  joint("BACK_LEFT_ANKLE", "BACK_LEFT_HOCK"),
  joint("BACK_LEFT_FOOT", "BACK_LEFT_ANKLE"),
  joint("BACK_LEFT_TOE", "BACK_LEFT_FOOT"),
  joint("BACK_RIGHT_HIP", "PELVIS_LOWER_BODY"),
  joint("BACK_RIGHT_KNEE", "BACK_RIGHT_HIP"),
  joint("BACK_RIGHT_HOCK", "BACK_RIGHT_KNEE"),
  joint("BACK_RIGHT_ANKLE", "BACK_RIGHT_HOCK"),
  joint("BACK_RIGHT_FOOT", "BACK_RIGHT_ANKLE"),
  joint("BACK_RIGHT_TOE", "BACK_RIGHT_FOOT"),
] as const;

const FLYER_JOINTS = [
  joint("ROOT", null),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK_0", "SPINE_UPPER"),
  joint("NECK_1", "NECK_0"),
  joint("HEAD", "NECK_1"),
  joint("MOUTH", "HEAD"),
  joint("LOWER_LIP", "MOUTH"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("LEFT_WING_SHOULDER", "SPINE_UPPER"),
  joint("LEFT_WING_ELBOW", "LEFT_WING_SHOULDER"),
  joint("LEFT_WING_WRIST", "LEFT_WING_ELBOW"),
  joint("LEFT_WING_TIP", "LEFT_WING_WRIST"),
  joint("RIGHT_WING_SHOULDER", "SPINE_UPPER"),
  joint("RIGHT_WING_ELBOW", "RIGHT_WING_SHOULDER"),
  joint("RIGHT_WING_WRIST", "RIGHT_WING_ELBOW"),
  joint("RIGHT_WING_TIP", "RIGHT_WING_WRIST"),
  joint("PELVIS_LOWER_BODY", "ROOT"),
  joint("TAIL_0", "PELVIS_LOWER_BODY"),
  joint("TAIL_1", "TAIL_0"),
  joint("TAIL_2", "TAIL_1"),
  joint("LEFT_HIP", "PELVIS_LOWER_BODY"),
  joint("LEFT_KNEE", "LEFT_HIP"),
  joint("LEFT_ANKLE", "LEFT_KNEE"),
  joint("LEFT_FOOT", "LEFT_ANKLE"),
  joint("RIGHT_HIP", "PELVIS_LOWER_BODY"),
  joint("RIGHT_KNEE", "RIGHT_HIP"),
  joint("RIGHT_ANKLE", "RIGHT_KNEE"),
  joint("RIGHT_FOOT", "RIGHT_ANKLE"),
] as const;

const SWIMMER_JOINTS = [
  joint("ROOT", null),
  joint("NECK", "ROOT"),
  joint("HEAD", "NECK"),
  joint("MOUTH", "HEAD"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("FRONT_LEFT_FIN", "NECK"),
  joint("FRONT_RIGHT_FIN", "NECK"),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("TAIL", "SPINE_MIDDLE"),
] as const;

const SLITHERER_JOINTS = [
  joint("ROOT", null),
  joint("SPINE_BASE", "ROOT"),
  joint("SPINE_MIDDLE", "SPINE_BASE"),
  joint("SPINE_UPPER", "SPINE_MIDDLE"),
  joint("NECK", "SPINE_UPPER"),
  joint("HEAD", "NECK"),
  joint("MOUTH", "HEAD"),
  joint("LEFT_EYE", "HEAD"),
  joint("RIGHT_EYE", "HEAD"),
  joint("LEFT_EYELID", "HEAD"),
  joint("RIGHT_EYELID", "HEAD"),
  joint("TAIL_0", "ROOT"),
] as const;

const AUTOMOBILE_JOINTS = [
  joint("ROOT", null),
  joint("BACK_WHEELS", "ROOT"),
  joint("FRONT_RIGHT_WHEEL", "ROOT"),
  joint("FRONT_LEFT_WHEEL", "ROOT"),
] as const;

const TRAIN_JOINTS = [
  joint("ROOT", null),
  joint("NEXT_CAR_LOCATION", "ROOT"),
] as const;

const EMPTY_JOINTS: readonly ModelJointDefinition[] = [];

export const BipedResource = createResourceTypeDefinition(
  "BIPED",
  BIPED_JOINTS,
  createBoundingBox(-0.35, 0, -0.2, 0.35, 1.8, 0.3),
  ["ROOT"],
);
export const QuadrupedResource = createResourceTypeDefinition(
  "QUADRUPED",
  QUADRUPED_JOINTS,
  createBoundingBox(-0.9, 0, -0.25, 0.9, 1.25, 0.25),
  ["TAIL_0", "TAIL_1", "TAIL_2", "TAIL_3"],
);
export const FlyerResource = createResourceTypeDefinition(
  "FLYER",
  FLYER_JOINTS,
  createBoundingBox(-1.1, 0, -1.2, 1.1, 1.5, 1.2),
  ["NECK_0", "NECK_1", "TAIL_0", "TAIL_1", "TAIL_2"],
);
export const SwimmerResource = createResourceTypeDefinition(
  "SWIMMER",
  SWIMMER_JOINTS,
  createBoundingBox(-1.2, -0.25, -0.25, 1.2, 0.25, 0.25),
  ["ROOT"],
);
export const FishResource = createResourceTypeDefinition(
  "FISH",
  SWIMMER_JOINTS,
  createBoundingBox(-1.2, -0.25, -0.25, 1.2, 0.25, 0.25),
  ["ROOT"],
);
export const MarineMammalResource = createResourceTypeDefinition(
  "MARINE_MAMMAL",
  SWIMMER_JOINTS,
  createBoundingBox(-1.6, -0.35, -0.35, 1.6, 0.45, 0.35),
  ["ROOT"],
);
export const PropResource = createResourceTypeDefinition("PROP", EMPTY_JOINTS, null);
export const TransportResource = createResourceTypeDefinition("VEHICLE", EMPTY_JOINTS, null);
export const AutomobileResource = createResourceTypeDefinition(
  "AUTOMOBILE",
  AUTOMOBILE_JOINTS,
  createBoundingBox(-1.3, 0, -0.8, 1.3, 1.4, 0.8),
  ["ROOT"],
);
export const AircraftResource = createResourceTypeDefinition(
  "AIRCRAFT",
  EMPTY_JOINTS,
  createBoundingBox(-2.0, -0.2, -2.5, 2.0, 0.8, 2.5),
);
export const WatercraftResource = createResourceTypeDefinition(
  "WATERCRAFT",
  EMPTY_JOINTS,
  createBoundingBox(-1.6, -0.4, -0.9, 1.6, 1.3, 0.9),
);
export const TrainResource = createResourceTypeDefinition(
  "TRAIN",
  TRAIN_JOINTS,
  createBoundingBox(-1.7, 0, -0.9, 1.7, 1.5, 0.9),
  ["ROOT"],
);
export const SlithererResource = createResourceTypeDefinition(
  "SLITHERER",
  SLITHERER_JOINTS,
  createBoundingBox(-1.4, 0, -0.2, 1.4, 0.35, 0.2),
  ["TAIL_0"],
);

const RESOURCE_TYPES = {
  BIPED: BipedResource,
  FLYER: FlyerResource,
  QUADRUPED: QuadrupedResource,
  SWIMMER: SwimmerResource,
  FISH: FishResource,
  MARINE_MAMMAL: MarineMammalResource,
  PROP: PropResource,
  VEHICLE: TransportResource,
  AUTOMOBILE: AutomobileResource,
  AIRCRAFT: AircraftResource,
  WATERCRAFT: WatercraftResource,
  TRAIN: TrainResource,
  SLITHERER: SlithererResource,
} satisfies Record<KnownModelClassKey, ResourceTypeDefinition>;

const RESOURCE_TYPES_BY_CLASS_NAME = new Map<string, ResourceTypeDefinition>(
  Object.values(RESOURCE_TYPES).map((resourceType) => [resourceType.resourceClassName, resourceType]),
);

function resolveResourceType(type: KnownModelClassKey | ResourceTypeDefinition): ResourceTypeDefinition {
  return typeof type === "string" ? RESOURCE_TYPES[type] : type;
}

export function listResourceTypes(): ResourceTypeDefinition[] {
  return Object.values(RESOURCE_TYPES);
}

export function getResourceType(type: KnownModelClassKey): ResourceTypeDefinition {
  return RESOURCE_TYPES[type];
}

export function getResourceTypeByClassName(resourceClassName: string): ResourceTypeDefinition | null {
  return RESOURCE_TYPES_BY_CLASS_NAME.get(resourceClassName) ?? null;
}

export function createResourceAssetPaths(modelName: string, textureName: string | null = null): ResourceAssetPaths {
  return {
    visual: getVisualResourceFileNameFromModelName(modelName),
    texture: getTextureResourceFileName(modelName, textureName),
    thumbnail: getThumbnailResourceFileName(modelName, textureName),
  };
}

export async function loadResourceAssets(
  modelName: string,
  textureName: string | null,
  readAsset: AssetReader,
): Promise<LoadedResourceAssets> {
  const paths = createResourceAssetPaths(modelName, textureName);
  const [visual, texture, thumbnail] = await Promise.all([
    Promise.resolve(readAsset(paths.visual)),
    Promise.resolve(readAsset(paths.texture)),
    paths.thumbnail ? Promise.resolve(readAsset(paths.thumbnail)) : Promise.resolve(null),
  ]);
  return { paths, visual, texture, thumbnail };
}

export function buildModelResourceDefinitionFromType(options: BuildResourceDefinitionOptions): ModelResourceDefinition {
  const resourceType = resolveResourceType(options.type);
  return {
    id: options.id,
    name: options.name,
    modelName: options.modelName,
    category: resourceType.modelClass.category,
    modelClass: resourceType.id,
    ...(options.tags ? { tags: [...options.tags] } : {}),
    ...(options.treePath ? { treePath: [...options.treePath] } : {}),
    ...(options.geometry ? { geometry: options.geometry } : {}),
    ...(options.materials ? { materials: [...options.materials] } : {}),
    ...(options.textures ? { textures: options.textures } : {}),
    ...(options.thumbnail ? { thumbnail: new Uint8Array(options.thumbnail) } : {}),
    classInfo: cloneClassInfoSource(resourceType.classInfo),
    ...(options.loader
      ? {
          loader: async () => {
            const loaded = await options.loader!(resourceType);
            return {
              ...loaded,
              ...(loaded.classInfo
                ? {
                    classInfo: {
                      ...cloneClassInfoSource(resourceType.classInfo),
                      ...loaded.classInfo,
                    },
                  }
                : {}),
            };
          },
        }
      : {}),
  };
}

export async function loadBuiltModelResource(
  catalog: ModelResourceCatalog,
  definition: BuildResourceDefinitionOptions,
): Promise<LoadedModelResource> {
  const built = buildModelResourceDefinitionFromType(definition);
  catalog.register(built);
  return catalog.load(built.id);
}
