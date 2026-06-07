import { EventSystem } from "../events.js";
import { TemplateLibrary } from "../project-templates.js";
import type { AliceProject } from "../a3p-parser.js";

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
  eventSystem: EventSystem;
  templateLibrary: TemplateLibrary;
}

export const DEFAULT_POSITION: Position = { x: 0, y: 0, z: 0 };

export function createInitialServerState(): ServerState {
  const sceneObjects = new Map<string, SceneObject>();

  return {
    launched: false,
    projectPath: null,
    projectName: "Program",
    sceneObjects,
    procedures: new Map([["myFirstMethod", []]]),
    parsedProject: null,
    eventSystem: new EventSystem({
      hasObject: (name) => sceneObjects.has(name),
      getObjectPosition: (name) => sceneObjects.get(name)?.position ?? null,
    }),
    templateLibrary: new TemplateLibrary(),
  };
}

export function buildCurrentProject(state: ServerState): AliceProject {
  if (state.parsedProject) return state.parsedProject;
  return {
    version: "3.10",
    projectName: state.projectName,
    sceneObjects: Array.from(state.sceneObjects.values()).map((o) => ({
      name: o.name,
      typeName: o.className,
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
    })),
    methods: Array.from(state.procedures.entries()).map(([name, stmts]) => ({
      name,
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: stmts.map((s) => ({
        kind: "MethodCall" as const,
        object: "this",
        method: s,
        arguments: [],
      })),
    })),
  };
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
