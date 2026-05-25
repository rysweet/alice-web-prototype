// ═══════════════════════════════════════════════════════════════════════════
// scene-manager.ts — Multi-scene orchestration for the Alice web prototype
//
// Tracks scene activation/deactivation, transition metadata, per-scene camera
// state, and atmosphere/background settings for headless tests and UI wiring.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from "three";
import type { AliceProject } from "./a3p-parser.js";
import { buildScene, type SceneBuildOptions, type SceneBuildResult } from "./scene-builder.js";

export type SceneTransitionCallback = (fromScene: string, toScene: string) => void;
export type SceneLifecycleCallback = (scene: ManagedScene) => void;

export interface SceneTransitionState {
  fromScene: string | null;
  toScene: string;
  kind: "cut" | "fade" | "crossfade";
  durationMs: number;
  sequence: number;
}

export interface SceneCameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  fov: number;
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  enableDamping: boolean;
}

export interface SceneAtmosphereState {
  backgroundColor: number | string | null;
  atmosphereColor: number | string | null;
  fogColor: number | string | null;
  fogDensity: number;
  fogNear: number;
  fogFar: number;
}

export interface SceneLifecycleState {
  isActive: boolean;
  activationCount: number;
  deactivationCount: number;
}

export interface ManagedScene extends SceneBuildResult {
  readonly name: string;
  readonly cameraState: SceneCameraState;
  readonly atmosphere: SceneAtmosphereState;
  readonly lifecycle: SceneLifecycleState;
}

export interface SceneManagerSceneOptions extends SceneBuildOptions {
  camera?: Partial<SceneCameraState>;
  atmosphere?: Partial<SceneAtmosphereState>;
  onActivate?: SceneLifecycleCallback;
  onDeactivate?: SceneLifecycleCallback;
}

interface SceneRecord extends ManagedScene {
  readonly onActivateCallbacks: SceneLifecycleCallback[];
  readonly onDeactivateCallbacks: SceneLifecycleCallback[];
}

const DEFAULT_ATMOSPHERE: Readonly<SceneAtmosphereState> = Object.freeze({
  backgroundColor: 0x87ceeb,
  atmosphereColor: 0x87ceeb,
  fogColor: null,
  fogDensity: 0,
  fogNear: 1,
  fogFar: 1000,
});

function cloneVector(value: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { ...value };
}

function normalizeTransition(
  transition: Partial<Omit<SceneTransitionState, "fromScene" | "toScene" | "sequence">> | undefined,
  fromScene: string | null,
  toScene: string,
  sequence: number,
): SceneTransitionState {
  return {
    fromScene,
    toScene,
    kind: transition?.kind ?? "cut",
    durationMs: Math.max(0, transition?.durationMs ?? 0),
    sequence,
  };
}

function createCameraState(result: SceneBuildResult, overrides?: Partial<SceneCameraState>): SceneCameraState {
  const state: SceneCameraState = {
    position: {
      x: result.camera.position.x,
      y: result.camera.position.y,
      z: result.camera.position.z,
    },
    target: cloneVector(result.cameraConfig.target),
    fov: result.camera.fov,
    minDistance: result.cameraConfig.minDistance,
    maxDistance: result.cameraConfig.maxDistance,
    maxPolarAngle: result.cameraConfig.maxPolarAngle,
    enableDamping: result.cameraConfig.enableDamping,
  };
  return { ...state, ...overrides, position: overrides?.position ? cloneVector(overrides.position) : state.position, target: overrides?.target ? cloneVector(overrides.target) : state.target };
}

function createAtmosphereState(overrides?: Partial<SceneAtmosphereState>): SceneAtmosphereState {
  return {
    ...DEFAULT_ATMOSPHERE,
    ...overrides,
  };
}

function applyCameraState(record: SceneRecord): void {
  const { camera, cameraConfig } = record;
  const state = record.cameraState;
  camera.position.set(state.position.x, state.position.y, state.position.z);
  camera.fov = state.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(state.target.x, state.target.y, state.target.z);
  cameraConfig.target = cloneVector(state.target);
  cameraConfig.minDistance = state.minDistance;
  cameraConfig.maxDistance = state.maxDistance;
  cameraConfig.maxPolarAngle = state.maxPolarAngle;
  cameraConfig.enableDamping = state.enableDamping;
}

function applyAtmosphere(record: SceneRecord): void {
  const { scene, atmosphere } = record;
  const backgroundColor = atmosphere.backgroundColor ?? atmosphere.atmosphereColor;
  scene.background = backgroundColor === null ? null : new THREE.Color(backgroundColor);

  if (atmosphere.fogDensity > 0) {
    const fogColor = (atmosphere.fogColor ?? backgroundColor ?? DEFAULT_ATMOSPHERE.backgroundColor) as THREE.ColorRepresentation;
    scene.fog = new THREE.FogExp2(fogColor, atmosphere.fogDensity);
  } else if (atmosphere.fogColor !== null) {
    scene.fog = new THREE.Fog(atmosphere.fogColor, atmosphere.fogNear, atmosphere.fogFar);
  } else {
    scene.fog = null;
  }
}

export class SceneManager {
  private readonly scenes = new Map<string, SceneRecord>();
  private activeName: string | null = null;
  private readonly transitionCallbacks: SceneTransitionCallback[] = [];
  private transitionSequence = 0;
  private _lastTransition: SceneTransitionState | null = null;

  get sceneNames(): string[] {
    return [...this.scenes.keys()];
  }

  get activeSceneName(): string | null {
    return this.activeName;
  }

  get sceneCount(): number {
    return this.scenes.size;
  }

  get lastTransition(): SceneTransitionState | null {
    return this._lastTransition;
  }

  addScene(name: string, project: AliceProject, options?: SceneManagerSceneOptions): void {
    if (this.scenes.has(name)) {
      throw new Error(`Scene "${name}" already exists`);
    }

    const result = buildScene(project, options);
    const record: SceneRecord = {
      ...result,
      name,
      cameraState: createCameraState(result, options?.camera),
      atmosphere: createAtmosphereState(options?.atmosphere),
      lifecycle: {
        isActive: false,
        activationCount: 0,
        deactivationCount: 0,
      },
      onActivateCallbacks: options?.onActivate ? [options.onActivate] : [],
      onDeactivateCallbacks: options?.onDeactivate ? [options.onDeactivate] : [],
    };

    applyCameraState(record);
    applyAtmosphere(record);
    this.scenes.set(name, record);

    if (this.activeName === null) {
      this.activeName = name;
      this.activateScene(record);
    }
  }

  removeScene(name: string): boolean {
    const record = this.scenes.get(name);
    if (!record) return false;

    const wasActive = this.activeName === name;
    if (wasActive) {
      this.deactivateScene(record);
    }

    this.scenes.delete(name);

    if (wasActive) {
      const next = this.scenes.values().next().value as SceneRecord | undefined;
      if (next) {
        this.activeName = next.name;
        this.activateScene(next);
      } else {
        this.activeName = null;
      }
    }

    return true;
  }

  getScene(name: string): ManagedScene | null {
    return this.scenes.get(name) ?? null;
  }

  getActiveScene(): ManagedScene | null {
    if (this.activeName === null) return null;
    return this.scenes.get(this.activeName) ?? null;
  }

  getActiveCamera(): THREE.PerspectiveCamera | null {
    return this.getActiveScene()?.camera ?? null;
  }

  getSceneCameraState(name: string): SceneCameraState | null {
    const scene = this.scenes.get(name);
    if (!scene) return null;
    return {
      ...scene.cameraState,
      position: cloneVector(scene.cameraState.position),
      target: cloneVector(scene.cameraState.target),
    };
  }

  setSceneCamera(name: string, updates: Partial<SceneCameraState>): void {
    const scene = this.scenes.get(name);
    if (!scene) {
      throw new Error(`Scene "${name}" does not exist`);
    }
    scene.cameraState.position = updates.position ? cloneVector(updates.position) : scene.cameraState.position;
    scene.cameraState.target = updates.target ? cloneVector(updates.target) : scene.cameraState.target;
    scene.cameraState.fov = updates.fov ?? scene.cameraState.fov;
    scene.cameraState.minDistance = updates.minDistance ?? scene.cameraState.minDistance;
    scene.cameraState.maxDistance = updates.maxDistance ?? scene.cameraState.maxDistance;
    scene.cameraState.maxPolarAngle = updates.maxPolarAngle ?? scene.cameraState.maxPolarAngle;
    scene.cameraState.enableDamping = updates.enableDamping ?? scene.cameraState.enableDamping;
    applyCameraState(scene);
  }

  getSceneAtmosphere(name: string): SceneAtmosphereState | null {
    const scene = this.scenes.get(name);
    if (!scene) return null;
    return { ...scene.atmosphere };
  }

  setSceneAtmosphere(name: string, updates: Partial<SceneAtmosphereState>): void {
    const scene = this.scenes.get(name);
    if (!scene) {
      throw new Error(`Scene "${name}" does not exist`);
    }
    Object.assign(scene.atmosphere, updates);
    applyAtmosphere(scene);
  }

  setActive(
    name: string,
    transition?: Partial<Omit<SceneTransitionState, "fromScene" | "toScene" | "sequence">>,
  ): void {
    const next = this.scenes.get(name);
    if (!next) {
      throw new Error(`Scene "${name}" does not exist`);
    }
    if (this.activeName === name) return;

    const previousName = this.activeName;
    const previous = previousName ? this.scenes.get(previousName) ?? null : null;
    if (previous) {
      this.deactivateScene(previous);
    }

    this.activeName = name;
    this.transitionSequence += 1;
    this._lastTransition = normalizeTransition(transition, previousName, name, this.transitionSequence);
    this.activateScene(next);

    if (previousName !== null) {
      for (const cb of this.transitionCallbacks) {
        cb(previousName, name);
      }
    }
  }

  onSceneActivate(name: string, callback: SceneLifecycleCallback): () => void {
    const scene = this.requireScene(name);
    scene.onActivateCallbacks.push(callback);
    return () => this.removeLifecycleCallback(scene.onActivateCallbacks, callback);
  }

  onSceneDeactivate(name: string, callback: SceneLifecycleCallback): () => void {
    const scene = this.requireScene(name);
    scene.onDeactivateCallbacks.push(callback);
    return () => this.removeLifecycleCallback(scene.onDeactivateCallbacks, callback);
  }

  onTransition(callback: SceneTransitionCallback): void {
    this.transitionCallbacks.push(callback);
  }

  offTransition(callback: SceneTransitionCallback): void {
    const idx = this.transitionCallbacks.indexOf(callback);
    if (idx !== -1) {
      this.transitionCallbacks.splice(idx, 1);
    }
  }

  private requireScene(name: string): SceneRecord {
    const scene = this.scenes.get(name);
    if (!scene) {
      throw new Error(`Scene "${name}" does not exist`);
    }
    return scene;
  }

  private activateScene(scene: SceneRecord): void {
    scene.lifecycle.isActive = true;
    scene.lifecycle.activationCount += 1;
    applyCameraState(scene);
    applyAtmosphere(scene);
    for (const callback of scene.onActivateCallbacks) {
      callback(scene);
    }
  }

  private deactivateScene(scene: SceneRecord): void {
    if (!scene.lifecycle.isActive) {
      return;
    }
    scene.lifecycle.isActive = false;
    scene.lifecycle.deactivationCount += 1;
    for (const callback of scene.onDeactivateCallbacks) {
      callback(scene);
    }
  }

  private removeLifecycleCallback(callbacks: SceneLifecycleCallback[], callback: SceneLifecycleCallback): void {
    const idx = callbacks.indexOf(callback);
    if (idx !== -1) {
      callbacks.splice(idx, 1);
    }
  }
}
