import * as THREE from "three";
import type { AliceProject, AliceObject } from "./a3p-parser";
import {
  BoxGeometry as SceneBoxGeometry,
  Model as SceneGraphModel,
  PlaneGeometry as ScenePlaneGeometry,
  SphereGeometry as SceneSphereGeometry,
  Transformable,
  createModel,
} from "./scenegraph";
import { markSceneOwnedGeometry, markSceneOwnedMaterials } from "./scene-disposal";
import { projectResourceIdToArchivePath } from "./imported-project-assets";

// ── Exported interfaces ───────────────────────────────────────────────

/** Configuration for a single light source. */
export interface LightConfig {
  type: "ambient" | "directional" | "point" | "hemisphere";
  color: number;
  intensity: number;
  position?: { x: number; y: number; z: number };
  /** Only used for hemisphere lights. */
  groundColor?: number;
}

/** Camera orbit control configuration (DOM-free — applied in main.ts). */
export interface CameraConfig {
  target: { x: number; y: number; z: number };
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  enableDamping: boolean;
}

/** Options for buildScene — all fields optional for backward compatibility. */
export interface SceneBuildOptions {
  lights?: LightConfig[];
  showGroundGrid?: boolean;
  showBoundingBoxes?: boolean;
  showJointSkeletons?: boolean;
  cameraTarget?: { x: number; y: number; z: number };
  cameraMinDistance?: number;
  cameraMaxDistance?: number;
  resources?: Map<string, Uint8Array>;
}

/** Post-build light management API. */
export interface SceneLights {
  /** Returns a snapshot copy of active lights. */
  readonly current: THREE.Light[];
  add(light: THREE.Light): void;
  remove(light: THREE.Light): boolean;
}

/** Extended return type from buildScene — superset of {scene, camera}. */
export interface SceneBuildResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameraConfig: CameraConfig;
  lights: SceneLights;
  sceneGraph: Transformable;
}

// ── Constants ─────────────────────────────────────────────────────────

const GROUND_COLOR = 0x4a7c3f;
const PROP_COLOR = 0xb5651d;
const MODEL_COLOR = 0xcc7722;
const DEFAULT_COLOR = 0x8888cc;
const SKELETON_COLOR = 0xffff00;
const MAX_SKELETON_SEGMENTS = 50;

// ── Cached geometries & materials (shared across meshes) ──────────────

let _groundGeo: THREE.PlaneGeometry | null = null;
let _groundMat: THREE.MeshLambertMaterial | null = null;
let _sphereGeo: THREE.SphereGeometry | null = null;
let _defaultMat: THREE.MeshLambertMaterial | null = null;
let _propMat: THREE.MeshLambertMaterial | null = null;
let _modelMat: THREE.MeshLambertMaterial | null = null;
let _skeletonMat: THREE.LineBasicMaterial | null = null;

function groundGeo(): THREE.PlaneGeometry {
  return (_groundGeo ??= new THREE.PlaneGeometry(200, 200));
}
function groundMat(): THREE.MeshLambertMaterial {
  return (_groundMat ??= new THREE.MeshLambertMaterial({ color: GROUND_COLOR }));
}
function sphereGeo(): THREE.SphereGeometry {
  return (_sphereGeo ??= new THREE.SphereGeometry(0.5, 16, 16));
}
function defaultMat(): THREE.MeshLambertMaterial {
  return (_defaultMat ??= new THREE.MeshLambertMaterial({ color: DEFAULT_COLOR }));
}
function propMat(): THREE.MeshLambertMaterial {
  return (_propMat ??= new THREE.MeshLambertMaterial({ color: PROP_COLOR }));
}
function modelMat(): THREE.MeshLambertMaterial {
  return (_modelMat ??= new THREE.MeshLambertMaterial({ color: MODEL_COLOR }));
}
function skeletonMat(): THREE.LineBasicMaterial {
  return (_skeletonMat ??= new THREE.LineBasicMaterial({ color: SKELETON_COLOR }));
}

// Skeleton templates — each entry is [x1,y1,z1, x2,y2,z2] normalized to entity size.
// Biped: 13 segments — humanoid stick figure
const BIPED_SEGMENTS: number[][] = [
  [0, 0.4, 0, 0, 0.65, 0],           // pelvis → chest
  [0, 0.65, 0, 0, 0.85, 0],          // chest → neck
  [0, 0.85, 0, 0, 1.0, 0],           // neck → head
  [-0.25, 0.65, 0, 0.25, 0.65, 0],   // shoulder bar
  [-0.25, 0.65, 0, -0.4, 0.45, 0],   // L shoulder → L elbow
  [-0.4, 0.45, 0, -0.45, 0.25, 0],   // L elbow → L hand
  [0.25, 0.65, 0, 0.4, 0.45, 0],     // R shoulder → R elbow
  [0.4, 0.45, 0, 0.45, 0.25, 0],     // R elbow → R hand
  [-0.15, 0.4, 0, 0.15, 0.4, 0],     // hip bar
  [-0.15, 0.4, 0, -0.2, 0.2, 0],     // L hip → L knee
  [-0.2, 0.2, 0, -0.2, 0.0, 0],      // L knee → L foot
  [0.15, 0.4, 0, 0.2, 0.2, 0],       // R hip → R knee
  [0.2, 0.2, 0, 0.2, 0.0, 0],        // R knee → R foot
];

// Quadruped: 10 segments — four-legged body
const QUADRUPED_SEGMENTS: number[][] = [
  [0, 0.5, -0.3, 0, 0.5, 0.0],              // spine back → mid
  [0, 0.5, 0.0, 0, 0.5, 0.3],               // spine mid → front
  [0, 0.5, 0.3, 0, 0.7, 0.45],              // front → neck
  [0, 0.7, 0.45, 0, 0.75, 0.55],            // neck → head
  [-0.2, 0.5, 0.3, -0.2, 0.25, 0.3],        // FL shoulder → knee
  [-0.2, 0.25, 0.3, -0.2, 0.0, 0.3],        // FL knee → hoof
  [0.2, 0.5, 0.3, 0.2, 0.25, 0.3],          // FR shoulder → knee
  [0.2, 0.25, 0.3, 0.2, 0.0, 0.3],          // FR knee → hoof
  [-0.2, 0.5, -0.3, -0.2, 0.0, -0.3],       // BL hip → hoof
  [0.2, 0.5, -0.3, 0.2, 0.0, -0.3],         // BR hip → hoof
];

// Flyer: 6 segments — bird/flying creature
const FLYER_SEGMENTS: number[][] = [
  [0, 0.5, -0.3, 0, 0.5, 0.3],              // tail → body front
  [0, 0.5, 0.3, 0, 0.55, 0.45],             // body → beak
  [0, 0.5, 0.0, -0.5, 0.5, 0.1],            // body → L wing tip
  [0, 0.5, 0.0, 0.5, 0.5, 0.1],             // body → R wing tip
  [0, 0.5, -0.3, -0.15, 0.55, -0.4],        // tail → L tail feather
  [0, 0.5, -0.3, 0.15, 0.55, -0.4],         // tail → R tail feather
];

// Prop / SJointedModel fallback: 3 segments — axis cross
const PROP_SEGMENTS: number[][] = [
  [-0.5, 0.5, 0, 0.5, 0.5, 0],              // X axis
  [0, 0.0, 0, 0, 1.0, 0],                    // Y axis
  [0, 0.5, -0.5, 0, 0.5, 0.5],              // Z axis
];

// ── Main entry point ──────────────────────────────────────────────────

/** Build a Three.js scene from parsed Alice project data. */
export function buildScene(project: AliceProject, opts?: SceneBuildOptions): SceneBuildResult {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);

  // Lights — custom config replaces defaults
  const trackedLights: THREE.Light[] = [];
  if (opts?.lights && opts.lights.length > 0) {
    for (const cfg of opts.lights) {
      const light = createLightFromConfig(cfg);
      scene.add(light);
      trackedLights.push(light);
    }
  } else {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    trackedLights.push(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 10, 7);
    directional.castShadow = true;
    scene.add(directional);
    trackedLights.push(directional);
  }

  // Camera — safe fallback for non-browser environments (SSR / Node tests)
  const w = typeof window !== "undefined" ? window.innerWidth : 1280;
  const h = typeof window !== "undefined" ? window.innerHeight : 720;
  const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
  camera.position.set(0, 5, 20);
  camera.lookAt(0, 0, 0);

  const sceneGraph = buildSceneGraph(project);

  // Scene objects with optional debug visualizations
  for (const obj of project.sceneObjects) {
    const mesh = createMeshForObject(obj, opts?.resources);
    if (!mesh) continue;
    scene.add(mesh);

    if (opts?.showBoundingBoxes && !obj.typeName.includes("SGround")) {
      const boxHelper = new THREE.BoxHelper(mesh, 0x00ff00);
      boxHelper.userData.debugType = "bbox";
      boxHelper.name = `${obj.name}_bbox`;
      markSceneOwnedGeometry(boxHelper.geometry);
      markSceneOwnedMaterials(boxHelper.material);
      scene.add(boxHelper);
    }

    if (opts?.showJointSkeletons) {
      const template = getSkeletonTemplate(obj.typeName);
      if (template) {
        const skeleton = createSkeletonVis(obj, template);
        skeleton.userData.debugType = "skeleton";
        skeleton.name = `${obj.name}_skeleton`;
        scene.add(skeleton);
      }
    }
  }

  // Ground grid
  if (opts?.showGroundGrid) {
    const grid = new THREE.GridHelper(200, 40, 0x888888, 0x444444);
    grid.position.y = 0.01;
    grid.userData.debugType = "grid";
    markSceneOwnedGeometry(grid.geometry);
    markSceneOwnedMaterials(grid.material);
    scene.add(grid);
  }

  const cameraConfig = buildCameraConfig(opts);
  const lights = createSceneLightsAPI(scene, trackedLights);

  return { scene, camera, cameraConfig, lights, sceneGraph };
}

// ── Light helpers ─────────────────────────────────────────────────────

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(10, value));
}

function createLightFromConfig(cfg: LightConfig): THREE.Light {
  const intensity = clampIntensity(cfg.intensity);
  switch (cfg.type) {
    case "ambient":
      return new THREE.AmbientLight(cfg.color, intensity);
    case "directional": {
      const light = new THREE.DirectionalLight(cfg.color, intensity);
      if (cfg.position) light.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
      light.castShadow = true;
      return light;
    }
    case "point": {
      const light = new THREE.PointLight(cfg.color, intensity);
      if (cfg.position) light.position.set(cfg.position.x, cfg.position.y, cfg.position.z);
      return light;
    }
    case "hemisphere":
      return new THREE.HemisphereLight(cfg.color, cfg.groundColor ?? 0x444444, intensity);
    default:
      return new THREE.AmbientLight(cfg.color, intensity);
  }
}

function createSceneLightsAPI(scene: THREE.Scene, tracked: THREE.Light[]): SceneLights {
  return {
    get current(): THREE.Light[] {
      return [...tracked];
    },
    add(light: THREE.Light): void {
      tracked.push(light);
      scene.add(light);
    },
    remove(light: THREE.Light): boolean {
      const idx = tracked.indexOf(light);
      if (idx === -1) return false;
      tracked.splice(idx, 1);
      scene.remove(light);
      return true;
    },
  };
}

// ── Camera config ─────────────────────────────────────────────────────

function buildCameraConfig(opts?: SceneBuildOptions): CameraConfig {
  const target = opts?.cameraTarget ?? { x: 0, y: 1, z: 0 };

  let minDist = opts?.cameraMinDistance ?? 1;
  let maxDist = opts?.cameraMaxDistance ?? 200;
  minDist = Math.max(0.1, minDist);
  maxDist = Math.max(0.1, maxDist);
  if (maxDist < minDist) {
    maxDist = minDist;
  }

  return {
    target,
    minDistance: minDist,
    maxDistance: maxDist,
    maxPolarAngle: Math.PI * 0.95,
    enableDamping: true,
  };
}

// ── Skeleton helpers ──────────────────────────────────────────────────

function getSkeletonTemplate(typeName: string): number[][] | null {
  if (typeName.includes("SBiped")) return BIPED_SEGMENTS;
  if (typeName.includes("SQuadruped")) return QUADRUPED_SEGMENTS;
  if (typeName.includes("SFlyer")) return FLYER_SEGMENTS;
  if (typeName.includes("SProp")) return PROP_SEGMENTS;
  if (typeName.includes("SJointedModel")) return PROP_SEGMENTS;
  return null;
}

function createSkeletonVis(obj: AliceObject, template: number[][]): THREE.LineSegments {
  const segments = template.length <= MAX_SKELETON_SEGMENTS ? template : template.slice(0, MAX_SKELETON_SEGMENTS);
  const positions = new Float32Array(segments.length * 6);

  const w = obj.size?.width ?? 1;
  const h = obj.size?.height ?? 1;
  const d = obj.size?.depth ?? 1;
  const px = obj.position?.x ?? 0;
  const py = obj.position?.y ?? 0;
  const pz = obj.position?.z ?? 0;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const base = i * 6;
    positions[base + 0] = seg[0] * w + px;
    positions[base + 1] = seg[1] * h + py;
    positions[base + 2] = seg[2] * d + pz;
    positions[base + 3] = seg[3] * w + px;
    positions[base + 4] = seg[4] * h + py;
    positions[base + 5] = seg[5] * d + pz;
  }

  const geometry = new THREE.BufferGeometry();
  markSceneOwnedGeometry(geometry);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geometry, skeletonMat());
}

// ── Scenegraph backing model ──────────────────────────────────────────

function buildSceneGraph(project: AliceProject): Transformable {
  const root = new Transformable(`${project.projectName || "scene"}.root`);
  for (const obj of project.sceneObjects) {
    const model = createSceneGraphModel(obj);
    if (model) {
      root.add(model);
    }
  }
  return root;
}

function createSceneGraphModel(obj: AliceObject): SceneGraphModel | null {
  if (obj.typeName.includes("SCamera")) {
    return null;
  }

  if (obj.typeName.includes("SGround")) {
    return createModel({
      name: obj.name,
      geometry: new ScenePlaneGeometry(200, 200),
      color: GROUND_COLOR,
      position: obj.position,
      orientation: obj.orientation,
    });
  }

  if (
    obj.typeName.includes("SProp") ||
    obj.typeName.includes("SModel") ||
    obj.typeName.includes("SJointedModel") ||
    obj.typeName.includes("SBiped") ||
    obj.typeName.includes("SFlyer") ||
    obj.typeName.includes("SQuadruped")
  ) {
    return createModel({
      name: obj.name,
      geometry: new SceneBoxGeometry(
        obj.size?.width ?? 1,
        obj.size?.height ?? 1,
        obj.size?.depth ?? 1,
      ),
      color: obj.typeName.includes("SProp") ? PROP_COLOR : MODEL_COLOR,
      position: obj.position,
      orientation: obj.orientation,
    });
  }

  return createModel({
    name: obj.name,
    geometry: new SceneSphereGeometry(0.5),
    color: DEFAULT_COLOR,
    position: obj.position,
    orientation: obj.orientation,
  });
}

// ── Mesh creation (existing logic, extended) ──────────────────────────

function createMeshForObject(obj: AliceObject, resources?: Map<string, Uint8Array>): THREE.Object3D | null {
  const typeName = obj.typeName;

  if (typeName.includes("SGround")) {
    return createGround(obj);
  }
  if (typeName.includes("SCamera")) {
    return null;
  }
  if (
    typeName.includes("SProp") ||
    typeName.includes("SModel") ||
    typeName.includes("SJointedModel") ||
    typeName.includes("SBiped") ||
    typeName.includes("SFlyer") ||
    typeName.includes("SQuadruped")
  ) {
    return createPropPlaceholder(obj, resources);
  }

  return createGenericPlaceholder(obj, resources);
}

function createGround(obj: AliceObject): THREE.Mesh {
  const mesh = new THREE.Mesh(groundGeo(), groundMat());
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.name = obj.name;
  return mesh;
}

function createPropPlaceholder(obj: AliceObject, resources?: Map<string, Uint8Array>): THREE.Mesh {
  const w = obj.size?.width ?? 1;
  const h = obj.size?.height ?? 1;
  const d = obj.size?.depth ?? 1;

  // BoxGeometry varies per object — cannot cache
  const geo = markSceneOwnedGeometry(new THREE.BoxGeometry(w, h, d));
  const mat = materialForObject(obj, obj.typeName.includes("SProp") ? propMat() : modelMat(), resources);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;

  applyTransform(mesh, obj);
  mesh.name = obj.name;
  return mesh;
}

function createGenericPlaceholder(obj: AliceObject, resources?: Map<string, Uint8Array>): THREE.Mesh {
  const mesh = new THREE.Mesh(sphereGeo(), materialForObject(obj, defaultMat(), resources));
  mesh.castShadow = true;

  applyTransform(mesh, obj);
  mesh.name = obj.name;
  return mesh;
}

function materialForObject(
  obj: AliceObject,
  fallback: THREE.MeshLambertMaterial,
  resources?: Map<string, Uint8Array>,
): THREE.MeshLambertMaterial {
  const textureResourceId = obj.materialBindings
    ?.find((binding) => binding.target === "surface")?.textureResourceId;
  if (!textureResourceId || !resources || typeof Blob === "undefined" || typeof URL === "undefined") {
    return fallback;
  }

  const resourceBytes = resources.get(projectResourceIdToArchivePath(textureResourceId));
  if (!resourceBytes) {
    return fallback;
  }

  const texture = textureFromBytes(resourceBytes, textureResourceId);
  const material = new THREE.MeshLambertMaterial({ map: texture });
  markSceneOwnedMaterials(material);
  return material;
}

function textureFromBytes(bytes: Uint8Array, textureResourceId: string): THREE.Texture {
  const blobBytes = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(blobBytes).set(bytes);
  const blob = new Blob([blobBytes], { type: textureContentType(textureResourceId) });
  const url = URL.createObjectURL(blob);
  const texture = new THREE.TextureLoader().load(url, () => URL.revokeObjectURL(url));
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function textureContentType(textureResourceId: string): string {
  const lower = textureResourceId.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function applyTransform(mesh: THREE.Object3D, obj: AliceObject): void {
  if (obj.position) {
    mesh.position.set(obj.position.x, obj.position.y, obj.position.z);
  }
  if (obj.orientation) {
    mesh.quaternion.set(obj.orientation.x, obj.orientation.y, obj.orientation.z, obj.orientation.w);
  }
}
