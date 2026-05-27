import { applySceneEnvironment, Scene, type SceneEnvironmentOptions } from "./story-api/scene";
import { SCamera, SGround, SSun, SThing } from "./story-api/expanded-entities";
import type { GroundImp } from "./story-api/expanded-implementation";

export interface SceneProperties extends SceneEnvironmentOptions {
  readonly groundColor?: string;
}

export interface SceneSetupContext {
  readonly scene: Scene;
  readonly ground: SGround;
  readonly camera: SCamera;
  readonly sun: SSun;
  readonly propertyManager: ScenePropertyManager;
}

export interface SceneActivationHandlers {
  readonly onActivated?: (context: SceneSetupContext) => void;
  readonly onDeactivated?: (context: SceneSetupContext) => void;
}

export interface CreateDefaultSceneOptions {
  readonly groundName?: string;
  readonly cameraName?: string;
  readonly sunName?: string;
  readonly activate?: boolean;
  readonly properties?: SceneProperties;
}

export type SceneSetupMethod = (context: SceneSetupContext) => void;
export type SceneEventRegistration = (context: SceneSetupContext) => void | (() => void);

const DEFAULT_SCENE_PROPERTIES: SceneProperties = {
  atmosphereColor: "#87CEEB",
  fogDensity: 0.01,
  ambientLightColor: "#DDEEFF",
  fromAboveLightColor: "#FFFFFF",
  fromBelowLightColor: "#87CEEB",
  groundColor: "#5C8C3B",
};

function assertNonEmptyString(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  return normalized;
}

export class ScenePropertyManager {
  #groundColor: string | undefined;

  constructor(
    public readonly scene: Scene,
    public readonly ground: SGround,
  ) {}

  apply(properties: SceneProperties): this {
    applySceneEnvironment(this.scene, properties);
    if (properties.groundColor !== undefined) {
      this.setGroundColor(properties.groundColor);
    }
    return this;
  }

  setAtmosphereColor(color: string): this {
    this.scene.setAtmosphereColor(assertNonEmptyString(color, "atmosphereColor"));
    return this;
  }

  setFogDensity(density: number): this {
    this.scene.setFogDensity(density);
    return this;
  }

  setAmbientLightColor(color: string): this {
    this.scene.setAmbientLightColor(assertNonEmptyString(color, "ambientLightColor"));
    return this;
  }

  setFromAboveLightColor(color: string): this {
    this.scene.setFromAboveLightColor(assertNonEmptyString(color, "fromAboveLightColor"));
    return this;
  }

  setFromBelowLightColor(color: string): this {
    this.scene.setFromBelowLightColor(assertNonEmptyString(color, "fromBelowLightColor"));
    return this;
  }

  setGroundColor(color: string): this {
    const normalized = assertNonEmptyString(color, "groundColor");
    (this.ground.imp as GroundImp).paint.value = normalized;
    this.#groundColor = normalized;
    return this;
  }

  snapshot(): SceneProperties {
    return {
      atmosphereColor: this.scene.getAtmosphereColor(),
      fogDensity: this.scene.getFogDensity(),
      ambientLightColor: this.scene.getAmbientLightColor(),
      fromAboveLightColor: this.scene.getFromAboveLightColor(),
      fromBelowLightColor: this.scene.getFromBelowLightColor(),
      groundColor: this.#groundColor,
    };
  }
}

export function createDefaultScene(options: CreateDefaultSceneOptions = {}): SceneSetupContext {
  const scene = new Scene();
  const ground = new SGround();
  const camera = new SCamera();
  const sun = new SSun();
  const propertyManager = new ScenePropertyManager(scene, ground);
  const context: SceneSetupContext = {
    scene,
    ground,
    camera,
    sun,
    propertyManager,
  };

  scene.addEntity(options.groundName ?? "ground", ground);
  scene.addEntity(options.cameraName ?? "camera", camera);
  scene.addEntity(options.sunName ?? "sun", sun);
  propertyManager.apply(options.properties ?? DEFAULT_SCENE_PROPERTIES);
  if (options.activate) {
    scene.activate();
  }
  return context;
}

export function initializeEventListeners(
  context: SceneSetupContext,
  registrations: readonly SceneEventRegistration[],
): () => void {
  const cleanups = registrations
    .map((registration) => registration(context))
    .filter((cleanup): cleanup is () => void => typeof cleanup === "function");
  return () => {
    for (const cleanup of cleanups.slice().reverse()) {
      cleanup();
    }
  };
}

export function performGeneratedSetUp(
  context: SceneSetupContext,
  generatedSetUp?: SceneSetupMethod,
): SceneSetupContext {
  generatedSetUp?.(context);
  return context;
}

export function performCustomSetup(
  context: SceneSetupContext,
  customSetUp?: SceneSetupMethod,
): SceneSetupContext {
  customSetUp?.(context);
  return context;
}

export function handleActiveChanged(
  context: SceneSetupContext,
  active: boolean,
  handlers: SceneActivationHandlers = {},
): boolean {
  if (active) {
    context.scene.activate();
    handlers.onActivated?.(context);
    return true;
  }
  context.scene.deactivate();
  handlers.onDeactivated?.(context);
  return false;
}

export function addSceneEntity(
  context: SceneSetupContext,
  name: string,
  entity: SThing,
): SThing {
  context.scene.addEntity(name, entity);
  return entity;
}
