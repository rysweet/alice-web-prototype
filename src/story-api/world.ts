import type { AliceProject } from "../a3p-parser";
import { collectEntityDiagnostics, describeEntity } from "./entities";
import {
  createSceneFromProject,
  describeScene,
  snapshotScene,
  type Scene,
  type SceneSnapshot,
} from "./scene";
import { createDefaultTransform, type Position, type Size } from "./types";

export interface StoryWorldSummary {
  readonly projectName: string;
  readonly objectCount: number;
  readonly methodCount: number;
  readonly entityNames: string[];
  readonly snapshot: SceneSnapshot;
}

export interface StoryEntitySummary {
  readonly name: string;
  readonly typeName: string;
  readonly diagnostics: ReturnType<typeof collectEntityDiagnostics>;
}

export const STORY_API_MODULES = Object.freeze([
  "entities",
  "implementation",
  "scene",
  "types",
  "world",
] as const);

export function listStoryApiModules(): readonly string[] {
  return STORY_API_MODULES;
}

export function createDefaultStoryTransform(): {
  position: Position;
  size: Size;
} {
  const transform = createDefaultTransform();
  return {
    position: transform.position,
    size: transform.size,
  };
}

export function summarizeSceneEntities(scene: Scene): StoryEntitySummary[] {
  const summaries: StoryEntitySummary[] = [];
  for (const [name, entity] of scene.entities) {
    summaries.push({
      name,
      typeName: entity.constructor.name,
      diagnostics: collectEntityDiagnostics(entity),
    });
  }
  return summaries;
}

export function buildStoryWorld(project: AliceProject): {
  scene: Scene;
  summary: StoryWorldSummary;
} {
  const scene = createSceneFromProject(project);
  return {
    scene,
    summary: summarizeStoryWorld(project, scene),
  };
}

export function summarizeStoryWorld(project: AliceProject, scene: Scene = createSceneFromProject(project)): StoryWorldSummary {
  const snapshot = snapshotScene(scene);
  return {
    projectName: project.projectName,
    objectCount: project.sceneObjects.length,
    methodCount: project.methods.length,
    entityNames: snapshot.entityNames,
    snapshot,
  };
}

export function describeStoryWorld(project: AliceProject, scene?: Scene): string {
  const summary = summarizeStoryWorld(project, scene ?? createSceneFromProject(project));
  return `${summary.projectName}: ${summary.objectCount} objects, ${summary.methodCount} methods`;
}

export function projectCanBuildStoryWorld(project: AliceProject): boolean {
  return Array.isArray(project.sceneObjects) && Array.isArray(project.methods);
}

export function requireStoryWorld(project: AliceProject): StoryWorldSummary {
  if (!projectCanBuildStoryWorld(project)) {
    throw new TypeError("project does not have the data needed to build a story world");
  }
  return summarizeStoryWorld(project);
}

export function collectStoryWorldDiagnostics(project: AliceProject, scene: Scene = createSceneFromProject(project)): {
  readonly world: StoryWorldSummary;
  readonly entities: StoryEntitySummary[];
} {
  return {
    world: summarizeStoryWorld(project, scene),
    entities: summarizeSceneEntities(scene),
  };
}

export function listStoryWorldEntityNames(project: AliceProject): string[] {
  return project.sceneObjects.map((object) => object.name);
}

export function describeStoryScene(project: AliceProject): string {
  const scene = createSceneFromProject(project);
  return describeScene(scene);
}

export function describeStoryEntities(project: AliceProject): string[] {
  const scene = createSceneFromProject(project);
  const descriptions: string[] = [];
  for (const entity of scene.entities.values()) {
    descriptions.push(describeEntity(entity));
  }
  return descriptions;
}

export function projectUsesStoryApiType(project: AliceProject, typeName: string): boolean {
  return project.sceneObjects.some((object) => object.typeName === typeName)
    || (project.types ?? []).some((type) => type.name === typeName || type.superTypeName === typeName);
}

export function countStoryApiUserTypes(project: AliceProject): number {
  return project.types?.length ?? 0;
}

export function createStorySceneSnapshot(project: AliceProject): SceneSnapshot {
  return snapshotScene(createSceneFromProject(project));
}

export function compareStoryWorlds(left: AliceProject, right: AliceProject): {
  readonly projectNameChanged: boolean;
  readonly objectCountDelta: number;
  readonly methodCountDelta: number;
} {
  return {
    projectNameChanged: left.projectName !== right.projectName,
    objectCountDelta: right.sceneObjects.length - left.sceneObjects.length,
    methodCountDelta: right.methods.length - left.methods.length,
  };
}

export function hasStoryWorldEntities(project: AliceProject): boolean {
  return project.sceneObjects.length > 0;
}

export function getStoryWorldMethodNames(project: AliceProject): string[] {
  return project.methods.map((method) => method.name);
}

export function summarizeStoryWorldMethods(project: AliceProject): string {
  const names = getStoryWorldMethodNames(project);
  return names.length > 0 ? names.join(", ") : "<no methods>";
}
