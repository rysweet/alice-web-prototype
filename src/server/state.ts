import { EventSystem } from "../events.js";
import { JointStateStore } from "../joint-system.js";
import { TemplateLibrary } from "../project-templates.js";
import type { AliceProject, AliceStatement } from "../a3p-parser.js";
import {
  createDefaultCameraWorkflowState,
  type CameraWorkflowState,
} from "../camera-workflow.js";
import type { AliceProjectArchive } from "../project-io.js";
import {
  createDefaultProjectAudioState,
  createEmptyProjectAudioState,
  type ProjectAudioState,
  type ProjectAudioWorkflowState,
} from "../project-audio.js";

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface SceneObject {
  name: string;
  className: string;
  position: Position;
}

export interface MethodParam {
  name: string;
  type: string;
  defaultValue?: string;
}

export interface ServerState {
  launched: boolean;
  projectPath: string | null;
  projectName: string;
  sceneObjects: Map<string, SceneObject>;
  procedures: Map<string, string[]>;
  parsedProject: AliceProject | null;
  cameraWorkflow: CameraWorkflowState;
  projectArchive: AliceProjectArchive | null;
  resources: Map<string, Uint8Array>;
  projectAudio: ProjectAudioState;
  aliceAudio: ProjectAudioWorkflowState;
  eventSystem: EventSystem;
  templateLibrary: TemplateLibrary;
  jointState: JointStateStore;
}

export const DEFAULT_POSITION: Position = { x: 0, y: 0, z: 0 };

export function createInitialServerState(): ServerState {
  const sceneObjects = new Map<string, SceneObject>();

  return {
    launched: false,
    projectPath: null,
    projectName: "Program",
    sceneObjects,
    procedures: createDefaultProcedures(),
    parsedProject: null,
    cameraWorkflow: createDefaultCameraWorkflowState(),
    projectArchive: null,
    resources: new Map(),
    projectAudio: createEmptyProjectAudioState(),
    aliceAudio: createDefaultProjectAudioState(),
    eventSystem: new EventSystem({
      hasObject: (name) => sceneObjects.has(name),
      getObjectPosition: (name) => sceneObjects.get(name)?.position ?? null,
    }),
    templateLibrary: new TemplateLibrary(),
    jointState: new JointStateStore(),
  };
}

export function createDefaultProcedures(): Map<string, string[]> {
  return new Map([["myFirstMethod", []]]);
}

export function buildCurrentProject(state: ServerState): AliceProject {
  const baseProject: AliceProject = state.parsedProject
    ? cloneProject(state.parsedProject)
    : {
      version: "3.10",
      projectName: state.projectName,
      sceneObjects: [],
      methods: [],
    };

  baseProject.projectName = state.projectName;

  const sceneObjectsByName = new Map(baseProject.sceneObjects.map((object) => [object.name, object]));
  for (const object of state.sceneObjects.values()) {
    const existing = sceneObjectsByName.get(object.name);
    sceneObjectsByName.set(object.name, {
      ...existing,
      name: object.name,
      typeName: object.className,
      resourceType: existing?.resourceType ?? null,
      position: object.position,
      orientation: existing?.orientation ?? null,
      size: existing?.size ?? null,
    });
  }
  baseProject.sceneObjects = Array.from(sceneObjectsByName.values());

  const methodsByName = new Map(baseProject.methods.map((method) => [method.name, method]));
  for (const [name, statements] of state.procedures.entries()) {
    if (state.parsedProject && statements.length === 0 && methodsByName.has(name)) {
      continue;
    }
    const existing = methodsByName.get(name);
    const nextStatements = mergeProcedureStatements(existing?.statements ?? [], statements);
    methodsByName.set(name, {
      name,
      isFunction: existing?.isFunction ?? false,
      returnType: existing?.returnType ?? "void",
      parameters: existing?.parameters ?? [],
      statements: nextStatements,
    });
  }
  baseProject.methods = Array.from(methodsByName.values());
  syncSceneTypeMethods(baseProject, baseProject.methods, new Set(state.procedures.keys()));
  return baseProject;
}

function mergeProcedureStatements(existing: AliceStatement[], methods: string[]): AliceStatement[] {
  return [
    ...existing,
    ...methods.map((method) => ({
      kind: "MethodCall" as const,
      object: "this",
      method,
      arguments: [],
    })),
  ];
}

function syncSceneTypeMethods(
  project: AliceProject,
  methods: AliceProject["methods"],
  serverProcedureNames: Set<string>,
): void {
  const sceneType = project.types?.find((type) => type.superTypeName?.includes("SScene"));
  if (!sceneType?.methods) return;

  const methodsByName = new Map(sceneType.methods.map((method) => [method.name, method]));
  for (const method of methods) {
    if (!serverProcedureNames.has(method.name) && !methodsByName.has(method.name)) {
      continue;
    }
    methodsByName.set(method.name, method);
  }
  sceneType.methods = Array.from(methodsByName.values());
}

function cloneProject(project: AliceProject): AliceProject {
  return JSON.parse(JSON.stringify(project)) as AliceProject;
}

export function ensureCurrentProject(state: ServerState): AliceProject {
  if (!state.parsedProject) {
    state.parsedProject = buildCurrentProject(state);
  }
  return state.parsedProject;
}

export function addSceneObjectToCurrentProject(
  state: ServerState,
  input: { name: string; className: string },
): void {
  const project = ensureCurrentProject(state);
  if (project.sceneObjects.some((object) => object.name === input.name)) {
    return;
  }
  project.sceneObjects.push({
    name: input.name,
    typeName: input.className,
    resourceType: null,
    position: null,
    orientation: null,
    size: null,
  });
}

export function seedDefaultSceneObjects(state: ServerState): void {
  if (state.sceneObjects.size !== 0) return;

  const ground: SceneObject = {
    name: "ground",
    className: "org.lgna.story.SGround",
    position: { ...DEFAULT_POSITION },
  };
  const camera: SceneObject = {
    name: "camera",
    className: "org.lgna.story.SCamera",
    position: { ...DEFAULT_POSITION },
  };
  state.sceneObjects.set("ground", ground);
  state.sceneObjects.set("camera", camera);
}

export function syncServerSceneObjectsFromProject(state: ServerState, project: AliceProject): void {
  state.sceneObjects.clear();
  for (const object of project.sceneObjects) {
    state.sceneObjects.set(object.name, {
      name: object.name,
      className: object.typeName,
      position: object.position ?? { ...DEFAULT_POSITION },
    });
  }
}

export function syncServerProceduresFromProject(state: ServerState, project: AliceProject | null): void {
  if (!project) {
    state.procedures = createDefaultProcedures();
    return;
  }

  const sceneType = project.types?.find((type) => type.superTypeName?.includes("SScene"));
  const sceneMethods = sceneType?.methods ?? (project.types?.length ? [] : project.methods);
  state.procedures = new Map(sceneMethods.map((method) => [method.name, []]));
}

export function parseMethodParams(
  raw: unknown,
): { ok: true; params: MethodParam[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: true, params: [] };
  const params: MethodParam[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object" || !p.name || typeof p.name !== "string" || !p.name.trim()) {
      return { ok: false, error: "Each parameter must have a non-empty name" };
    }
    const trimmedName = p.name.trim();
    params.push({
      name: trimmedName,
      type: p.type ?? "Object",
      ...(p.defaultValue !== undefined ? { defaultValue: p.defaultValue } : {}),
    });
  }
  return { ok: true, params };
}

export function registerMethod(
  state: ServerState,
  methodName: string,
  isFunction: boolean,
  returnType: string,
  params: MethodParam[],
): void {
  state.procedures.set(methodName, []);
  if (state.parsedProject) {
    state.parsedProject.methods.push({
      name: methodName,
      isFunction,
      returnType,
      parameters: params,
      statements: [],
    });
  }
}
