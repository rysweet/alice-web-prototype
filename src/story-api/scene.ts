export * from "./expanded-scene";

import type { AliceProject } from "../a3p-parser";
import { createEntityForType, Scene } from "./expanded-scene";
import type { SThing } from "./expanded-entities";

export interface SceneEnvironmentOptions {
  readonly atmosphereColor?: string;
  readonly fogDensity?: number;
  readonly ambientLightColor?: string;
  readonly fromAboveLightColor?: string;
  readonly fromBelowLightColor?: string;
}

export interface SceneSnapshot extends SceneEnvironmentOptions {
  readonly entityNames: string[];
  readonly entityTypes: Record<string, string>;
  readonly fogDensity: number;
  readonly isActive: boolean;
}

export function normalizeSceneEnvironment(
  options: SceneEnvironmentOptions,
): SceneEnvironmentOptions {
  const normalized: {
    atmosphereColor?: string;
    fogDensity?: number;
    ambientLightColor?: string;
    fromAboveLightColor?: string;
    fromBelowLightColor?: string;
  } = {};
  if (typeof options.atmosphereColor === "string" && options.atmosphereColor.trim()) {
    normalized.atmosphereColor = options.atmosphereColor;
  }
  if (Number.isFinite(options.fogDensity) && (options.fogDensity ?? 0) >= 0) {
    normalized.fogDensity = options.fogDensity;
  }
  if (typeof options.ambientLightColor === "string" && options.ambientLightColor.trim()) {
    normalized.ambientLightColor = options.ambientLightColor;
  }
  if (typeof options.fromAboveLightColor === "string" && options.fromAboveLightColor.trim()) {
    normalized.fromAboveLightColor = options.fromAboveLightColor;
  }
  if (typeof options.fromBelowLightColor === "string" && options.fromBelowLightColor.trim()) {
    normalized.fromBelowLightColor = options.fromBelowLightColor;
  }
  return normalized;
}

export function applySceneEnvironment(
  scene: Scene,
  options: SceneEnvironmentOptions,
): Scene {
  const normalized = normalizeSceneEnvironment(options);
  if (normalized.atmosphereColor !== undefined) {
    scene.setAtmosphereColor(normalized.atmosphereColor);
  }
  if (normalized.fogDensity !== undefined) {
    scene.setFogDensity(normalized.fogDensity);
  }
  if (normalized.ambientLightColor !== undefined) {
    scene.setAmbientLightColor(normalized.ambientLightColor);
  }
  if (normalized.fromAboveLightColor !== undefined) {
    scene.setFromAboveLightColor(normalized.fromAboveLightColor);
  }
  if (normalized.fromBelowLightColor !== undefined) {
    scene.setFromBelowLightColor(normalized.fromBelowLightColor);
  }
  return scene;
}

export function clearSceneEnvironment(scene: Scene): Scene {
  scene.atmosphereColor = undefined;
  scene.fogDensity = undefined;
  scene.ambientLightColor = undefined;
  scene.fromAboveLightColor = undefined;
  scene.fromBelowLightColor = undefined;
  return scene;
}

export function copySceneEnvironment(source: Scene, target: Scene): Scene {
  return applySceneEnvironment(target, {
    atmosphereColor: source.getAtmosphereColor(),
    fogDensity: source.getFogDensity(),
    ambientLightColor: source.getAmbientLightColor(),
    fromAboveLightColor: source.getFromAboveLightColor(),
    fromBelowLightColor: source.getFromBelowLightColor(),
  });
}

export function snapshotScene(scene: Scene): SceneSnapshot {
  const entityNames: string[] = [];
  const entityTypes: Record<string, string> = {};
  for (const [name, entity] of scene.entities) {
    entityNames.push(name);
    const typeName = entity.constructor.name;
    if (name === "__proto__") {
      Object.defineProperty(entityTypes, name, {
        value: typeName,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    } else {
      entityTypes[name] = typeName;
    }
  }

  return {
    entityNames,
    entityTypes,
    isActive: scene.isActive,
    atmosphereColor: scene.getAtmosphereColor(),
    fogDensity: scene.getFogDensity(),
    ambientLightColor: scene.getAmbientLightColor(),
    fromAboveLightColor: scene.getFromAboveLightColor(),
    fromBelowLightColor: scene.getFromBelowLightColor(),
  };
}

export function listSceneEntities(scene: Scene): Array<{ name: string; typeName: string }> {
  const entities: Array<{ name: string; typeName: string }> = [];
  for (const [name, entity] of scene.entities) {
    entities.push({ name, typeName: entity.constructor.name });
  }
  return entities;
}

export function sceneContainsEntity(scene: Scene, name: string): boolean {
  return scene.entities.has(name);
}

export function requireSceneEntity<T extends SThing>(
  scene: Scene,
  name: string,
  ctor?: new (...args: any[]) => T,
): T {
  const entity = scene.getEntity(name);
  if (!entity) {
    throw new TypeError(`entity "${name}" not found`);
  }
  if (ctor && !(entity instanceof ctor)) {
    throw new TypeError(`entity "${name}" is not a ${ctor.name}`);
  }
  return entity as T;
}

export function upsertSceneEntity(scene: Scene, name: string, entity: SThing): SThing {
  if (sceneContainsEntity(scene, name)) {
    scene.removeEntity(name);
  }
  scene.addEntity(name, entity);
  return entity;
}

export function removeSceneEntities(scene: Scene, names: readonly string[]): number {
  let removed = 0;
  for (const name of names) {
    if (scene.removeEntity(name)) {
      removed += 1;
    }
  }
  return removed;
}

export function populateSceneFromProject(scene: Scene, project: AliceProject): Scene {
  for (const object of project.sceneObjects) {
    if (!scene.entities.has(object.name)) {
      scene.addEntity(object.name, createEntityForType(object.typeName));
    }
  }
  return scene;
}

export function createSceneFromProject(project: AliceProject): Scene {
  const scene = new Scene();
  populateSceneFromProject(scene, project);
  return scene;
}

export function describeScene(scene: Scene): string {
  const snapshot = snapshotScene(scene);
  return `${snapshot.entityNames.length} entities, active=${snapshot.isActive}, fog=${snapshot.fogDensity}`;
}
