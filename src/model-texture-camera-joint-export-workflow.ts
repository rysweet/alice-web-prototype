import type { AliceProject } from "./a3p-parser.js";
import {
  createDefaultCameraWorkflowState,
  validateCameraWorkflowState,
  type CameraWorkflowState,
} from "./camera-workflow.js";
import {
  archivePathToProjectResourceId,
  createImportedProjectAsset,
} from "./imported-project-assets.js";
import {
  JointStateStore,
  type JointStateSnapshot,
  type JointTransform,
} from "./joint-system.js";
import * as ProjectExport from "./project-export.js";
import { writeProject, type AliceProjectArchive } from "./project-io.js";
import type { JointNode } from "./story-api";

export type WorkflowResourceKind = "model" | "texture";

export interface WorkflowResource {
  readonly kind: WorkflowResourceKind;
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

export interface TextureAssignment {
  readonly objectName: string;
  readonly texturePath: string;
  readonly materialName?: string;
}

export interface WorkflowState {
  readonly project: AliceProject;
  readonly resources: readonly WorkflowResource[];
  readonly textureAssignments: readonly TextureAssignment[];
  readonly cameraWorkflow: CameraWorkflowState;
  readonly jointState?: JointStateSnapshot;
}

export const SUPPORTED_MODEL_EXTENSIONS = [".glb", ".gltf"] as const;
export const SUPPORTED_TEXTURE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp"] as const;

export function createWorkflowState(input: { readonly project: AliceProject }): WorkflowState {
  const project = cloneProject(input.project);
  return {
    project,
    resources: [],
    textureAssignments: (project.textureAssignments ?? []).map((assignment) => ({ ...assignment })),
    cameraWorkflow: project.cameraWorkflow
      ? validateCameraWorkflowState(project.cameraWorkflow)
      : createDefaultCameraWorkflowState(),
  };
}

export async function importModelAsset(
  state: WorkflowState,
  input: { readonly fileName: string; readonly bytes: Uint8Array; readonly objectName?: string },
): Promise<WorkflowState> {
  const creation = createImportedProjectAsset({
    kind: "model",
    fileName: input.fileName,
    bytes: copyBytes(input.bytes),
  }, state.project.importedAssets ?? []);
  const project = cloneProject(state.project);
  project.importedAssets = [...(project.importedAssets ?? []), creation.asset];

  if (input.objectName) {
    const object = project.sceneObjects.find((candidate) => candidate.name === input.objectName);
    if (!object) {
      throw new Error(`Scene object "${input.objectName}" was not found for imported model assignment`);
    }
    object.modelResourceId = creation.projectResourceId;
  }

  return {
    ...cloneState(state),
    project,
    resources: [
      ...cloneResources(state.resources),
      {
        kind: "model",
        path: creation.archivePath,
        fileName: creation.asset.fileName,
        mimeType: creation.asset.contentType,
        bytes: copyBytes(creation.resourceBytes),
      },
    ],
  };
}

export async function importTextureAsset(
  state: WorkflowState,
  input: { readonly fileName: string; readonly bytes: Uint8Array },
): Promise<WorkflowState> {
  const creation = createImportedProjectAsset({
    kind: "texture",
    fileName: input.fileName,
    bytes: copyBytes(input.bytes),
  }, state.project.importedAssets ?? []);
  const project = cloneProject(state.project);
  project.importedAssets = [...(project.importedAssets ?? []), creation.asset];

  return {
    ...cloneState(state),
    project,
    resources: [
      ...cloneResources(state.resources),
      {
        kind: "texture",
        path: creation.archivePath,
        fileName: creation.asset.fileName,
        mimeType: creation.asset.contentType,
        bytes: copyBytes(creation.resourceBytes),
      },
    ],
  };
}

export function assignTextureToModel(
  state: WorkflowState,
  input: { readonly objectName: string; readonly texturePath: string; readonly materialName?: string },
): WorkflowState {
  const texture = state.resources.find((resource) => resource.kind === "texture" && resource.path === input.texturePath);
  if (!texture) {
    throw new Error(`Texture resource "${input.texturePath}" was not imported`);
  }

  const project = cloneProject(state.project);
  const object = project.sceneObjects.find((candidate) => candidate.name === input.objectName);
  if (!object) {
    throw new Error(`Scene object "${input.objectName}" was not found for texture assignment`);
  }
  const textureResourceId = archivePathToProjectResourceId(input.texturePath);
  object.materialBindings = [
    ...(object.materialBindings ?? []).filter((binding) => binding.target !== "surface"),
    { target: "surface", textureResourceId },
  ];

  const assignment: TextureAssignment = {
    objectName: input.objectName,
    texturePath: input.texturePath,
    ...(input.materialName !== undefined ? { materialName: input.materialName } : {}),
  };
  return {
    ...cloneState(state),
    project,
    textureAssignments: [
      ...state.textureAssignments.filter((candidate) =>
        !(candidate.objectName === input.objectName && candidate.materialName === input.materialName)
      ),
      assignment,
    ],
  };
}

export function setCameraWorkflowState(state: WorkflowState, cameraWorkflow: CameraWorkflowState): WorkflowState {
  return {
    ...cloneState(state),
    cameraWorkflow: validateCameraWorkflowState(cameraWorkflow),
  };
}

export function registerJointObject(
  state: WorkflowState,
  input: { readonly objectName: string; readonly className: string; readonly hierarchy: readonly JointNode[] },
): WorkflowState {
  const store = new JointStateStore();
  store.registerObject(input);
  const current = cloneState(state);
  return {
    ...current,
    jointState: mergeJointState(current.jointState, store.toJSON()),
  };
}

export function applyJointPose(
  state: WorkflowState,
  input: {
    readonly objectName: string;
    readonly poseName: string;
    readonly joints: Record<string, Partial<JointTransform>>;
  },
): WorkflowState {
  const current = cloneState(state);
  const jointState = cloneJointState(current.jointState);
  const object = jointState.objects[input.objectName];
  if (!object) {
    throw new Error(`Unknown jointed object: ${input.objectName}`);
  }

  const poseEntries = Object.entries(input.joints);
  if (poseEntries.length === 0) {
    throw new Error(`Pose "${input.poseName}" must include at least one joint`);
  }
  for (const [jointName, transform] of poseEntries) {
    const joint = object.joints[jointName];
    if (!joint) {
      throw new Error(`Unknown joint "${jointName}" for ${input.objectName}`);
    }
    validatePartialJointTransform(transform, jointName);
    object.joints[jointName] = {
      ...joint,
      currentTransform: {
        position: transform.position ?? joint.currentTransform.position,
        orientation: transform.orientation ?? joint.currentTransform.orientation,
      },
    };
  }
  object.poses[input.poseName] = Object.fromEntries(
    poseEntries.map(([jointName, transform]) => [jointName, clonePartialTransform(transform)]),
  );

  return {
    ...current,
    jointState,
  };
}

export async function exportA3pArchive(state: WorkflowState): Promise<Uint8Array> {
  return writeProject(createArchive(state), { generateThumbnailFromScene: false });
}

export async function exportWebPackage(
  state: WorkflowState,
  options: ProjectExport.WebPackageOptions = {},
): Promise<ProjectExport.ExportedWebPackage> {
  const project = projectPayload(state);
  return ProjectExport.exportWebPackage(project, {
    ...options,
    resources: [
      ...(options.resources ?? []),
      ...state.resources.map((resource) => ({
        path: resource.path,
        bytes: copyBytes(resource.bytes),
        mimeType: resource.mimeType,
      })),
    ],
  });
}

export async function generateShareArtifacts(
  input: ProjectExport.ShareArtifactsInput,
): Promise<ProjectExport.ShareArtifacts> {
  return ProjectExport.generateShareArtifacts(input);
}

function createArchive(state: WorkflowState): AliceProjectArchive {
  return {
    project: projectPayload(state),
    manifest: null,
    resources: new Map(state.resources.map((resource) => [resource.path, copyBytes(resource.bytes)])),
    resourceEntries: [],
    thumbnail: null,
    versionInfo: {
      originalAliceVersion: state.project.version,
      detectedAliceVersion: state.project.version,
      manifestVersion: null,
      xmlVersion: null,
      versionSource: "default",
      migrated: false,
      migrationSteps: [],
    },
  };
}

function projectPayload(state: WorkflowState): AliceProject {
  return {
    ...cloneProject(state.project),
    cameraWorkflow: validateCameraWorkflowState(state.cameraWorkflow),
    textureAssignments: state.textureAssignments.map((assignment) => ({ ...assignment })),
    ...(state.jointState ? { jointState: cloneJointState(state.jointState) } : {}),
  } as AliceProject;
}

function cloneState(state: WorkflowState): WorkflowState {
  return {
    project: cloneProject(state.project),
    resources: cloneResources(state.resources),
    textureAssignments: state.textureAssignments.map((assignment) => ({ ...assignment })),
    cameraWorkflow: validateCameraWorkflowState(state.cameraWorkflow),
    ...(state.jointState ? { jointState: cloneJointState(state.jointState) } : {}),
  };
}

function cloneProject(project: AliceProject): AliceProject {
  return JSON.parse(JSON.stringify(project)) as AliceProject;
}

function cloneResources(resources: readonly WorkflowResource[]): WorkflowResource[] {
  return resources.map((resource) => ({
    ...resource,
    bytes: copyBytes(resource.bytes),
  }));
}

function copyBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function mergeJointState(
  current: JointStateSnapshot | undefined,
  next: JointStateSnapshot,
): JointStateSnapshot {
  return {
    schema_version: "alice.joint-state/v1",
    runtime: "alice-web",
    objects: {
      ...(current ? cloneJointState(current).objects : {}),
      ...cloneJointState(next).objects,
    },
  };
}

function cloneJointState(state: JointStateSnapshot | undefined): JointStateSnapshot {
  if (!state) {
    return {
      schema_version: "alice.joint-state/v1",
      runtime: "alice-web",
      objects: {},
    };
  }
  return JSON.parse(JSON.stringify(state)) as JointStateSnapshot;
}

function clonePartialTransform(transform: Partial<JointTransform>): Partial<JointTransform> {
  return {
    ...(transform.position ? { position: { ...transform.position } } : {}),
    ...(transform.orientation ? { orientation: { ...transform.orientation } } : {}),
  };
}

function validatePartialJointTransform(transform: Partial<JointTransform>, jointName: string): void {
  if (!transform.position && !transform.orientation) {
    throw new Error(`Joint "${jointName}" pose must include position or orientation`);
  }
  if (transform.position) {
    assertFiniteNumbers(transform.position, ["x", "y", "z"], `joint "${jointName}" position`);
  }
  if (transform.orientation) {
    assertFiniteNumbers(transform.orientation, ["x", "y", "z", "w"], `joint "${jointName}" orientation`);
  }
}

function assertFiniteNumbers(
  value: object,
  keys: readonly string[],
  fieldName: string,
): void {
  for (const key of keys) {
    const field = (value as Record<string, unknown>)[key];
    if (typeof field !== "number" || !Number.isFinite(field)) {
      throw new Error(`${fieldName}.${key} must be finite`);
    }
  }
}
