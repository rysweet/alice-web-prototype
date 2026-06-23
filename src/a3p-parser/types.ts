import type JSZip from "jszip";
import type { CameraWorkflowState } from "../camera-workflow";
import type { JointStateSnapshot } from "../joint-system";
import type { BoundingBox, JointNode } from "../story-api/types";

export interface AliceObject {
  name: string;
  typeName: string;
  resourceType: string | null;
  position: { x: number; y: number; z: number } | null;
  orientation: { x: number; y: number; z: number; w: number } | null;
  size: { width: number; height: number; depth: number } | null;
  constructorArgs?: string[];
  modelResourceId?: string;
  materialBindings?: MaterialBinding[];
}

export type ImportedProjectAssetKind = "model" | "texture";

export interface ImportedProjectAsset {
  id: string;
  kind: ImportedProjectAssetKind;
  name: string;
  fileName: string;
  resourcePath: string;
  contentType: string;
  byteLength: number;
}

export interface MaterialBinding {
  target: "surface";
  textureResourceId: string;
}

export interface TextureAssignment {
  objectName: string;
  texturePath: string;
  materialName?: string;
}

export interface AliceStatement {
  kind: string;
  object?: string;
  method?: string;
  arguments?: string[];
  count?: number;
  countExpression?: string;
  body?: AliceStatement[];
  itemType?: string;
  itemName?: string;
  collection?: string;
  condition?: string;
  ifBody?: AliceStatement[];
  elseBody?: AliceStatement[];
  tryBody?: AliceStatement[];
  catchBody?: AliceStatement[];
  catchType?: string;
  catchVariable?: string;
  cases?: Array<{ value: string; body: AliceStatement[] }>;
  defaultCase?: AliceStatement[] | null;
  event?: string;
  expression?: string;
  name?: string;
  varType?: string;
  value?: string;
}

export interface AliceMethod {
  name: string;
  isFunction: boolean;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
  statements: AliceStatement[];
}

export interface AliceFieldDefinition {
  name: string;
  typeName?: string | null;
  resourceType?: string | null;
  initializer?: string | null;
}

export interface AliceTypeDefinition {
  name: string;
  superTypeName?: string | null;
  methods?: AliceMethod[];
  constructors?: AliceMethod[];
  fields?: AliceFieldDefinition[];
}

export interface AliceProject {
  version: string;
  projectName: string;
  sceneObjects: AliceObject[];
  methods: AliceMethod[];
  types?: AliceTypeDefinition[];
  jointHierarchy?: JointNode[];
  boundingBoxes?: Record<string, BoundingBox>;
  textureRefs?: string[];
  importedAssets?: ImportedProjectAsset[];
  textureAssignments?: TextureAssignment[];
  cameraWorkflow?: CameraWorkflowState;
  jointState?: JointStateSnapshot;
}

export interface A3PSourceMetadata {
  zip: JSZip | null;
  xmlEntryName: string;
  xmlText: string;
  snapshot: string;
}

export interface A3PMethodSourceMetadata {
  statementsSnapshot: string;
  ownerTypeName?: string;
}

export const DEFAULT_A3P_XML_ENTRY = "programType.xml";
export const LEGACY_A3P_XML_ENTRY = "program.xml";

const A3P_SOURCE = Symbol("a3p-source");
const A3P_METHOD_SOURCE = Symbol("a3p-method-source");
type AliceProjectWithSource = AliceProject & { [A3P_SOURCE]?: A3PSourceMetadata };
type AliceMethodWithSource = AliceMethod & { [A3P_METHOD_SOURCE]?: A3PMethodSourceMetadata };

export function getA3PSource(project: AliceProject): A3PSourceMetadata | null {
  return (project as AliceProjectWithSource)[A3P_SOURCE] ?? null;
}

export function snapshotAliceProject(project: AliceProject): string {
  return JSON.stringify({
    version: project.version,
    projectName: project.projectName,
    sceneObjects: project.sceneObjects,
    methods: project.methods,
    types: project.types ?? [],
    jointHierarchy: project.jointHierarchy ?? [],
    boundingBoxes: project.boundingBoxes ?? {},
    textureRefs: project.textureRefs ?? [],
    importedAssets: project.importedAssets ?? [],
    textureAssignments: project.textureAssignments ?? [],
    cameraWorkflow: project.cameraWorkflow ?? null,
    jointState: project.jointState ?? null,
  });
}

export function snapshotAliceStatements(statements: AliceStatement[]): string {
  return JSON.stringify(statements);
}

export function attachA3PSource(project: AliceProject, source: A3PSourceMetadata): void {
  Object.defineProperty(project, A3P_SOURCE, {
    value: source,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

export function getA3PMethodSource(method: AliceMethod): A3PMethodSourceMetadata | null {
  return (method as AliceMethodWithSource)[A3P_METHOD_SOURCE] ?? null;
}

export function attachA3PMethodSource(method: AliceMethod, source: A3PMethodSourceMetadata): void {
  Object.defineProperty(method, A3P_METHOD_SOURCE, {
    value: source,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}
