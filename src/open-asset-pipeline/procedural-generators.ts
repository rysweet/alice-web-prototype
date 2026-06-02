/**
 * Procedural Model Generators — Creates placeholder 3D geometry for each
 * Alice entity category using canonical joint hierarchies.
 *
 * Phase 1: Static geometry with structurally compatible joint metadata.
 * Geometry is simple but recognizable (capsule torso, sphere head, etc.).
 * Joints match the canonical definitions from story-resources.ts exactly.
 */

import {
  createBoxMesh,
  createSphereMesh,
  createCylinderMesh,
} from "../render-mesh.js";
import type { ModelJointDefinition } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";
import { meshDataToModelGeometry, mergeModelGeometry } from "./mesh-conversion.js";
import type {
  EntityCategory,
  ProceduralModelConfig,
  ProceduralModelResult,
  AssetLicense,
} from "./types.js";
import { PROCEDURAL_LICENSE } from "./types.js";

// ── Canonical joint definitions (from story-resources.ts) ──────────

function joint(name: string, parentName: string | null): ModelJointDefinition {
  return { name, parentName };
}

const BIPED_JOINTS: readonly ModelJointDefinition[] = [
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
];

const QUADRUPED_JOINTS: readonly ModelJointDefinition[] = [
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
];

const FLYER_JOINTS: readonly ModelJointDefinition[] = [
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
];

const SWIMMER_JOINTS: readonly ModelJointDefinition[] = [
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
];

const SLITHERER_JOINTS: readonly ModelJointDefinition[] = [
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
];

const PROP_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
];

const VEHICLE_JOINTS: readonly ModelJointDefinition[] = [
  joint("ROOT", null),
  joint("BACK_WHEELS", "ROOT"),
  joint("FRONT_RIGHT_WHEEL", "ROOT"),
  joint("FRONT_LEFT_WHEEL", "ROOT"),
];

/** Returns the canonical joint hierarchy for a given entity category. */
export function getCanonicalJoints(category: EntityCategory): readonly ModelJointDefinition[] {
  switch (category) {
    case "BIPED": return BIPED_JOINTS;
    case "QUADRUPED": return QUADRUPED_JOINTS;
    case "FLYER": return FLYER_JOINTS;
    case "SWIMMER": return SWIMMER_JOINTS;
    case "SLITHERER": return SLITHERER_JOINTS;
    case "PROP": return PROP_JOINTS;
    case "VEHICLE": return VEHICLE_JOINTS;
  }
}

// ── Geometry Generators ────────────────────────────────────────────

function defaultMaterial(color?: number): MaterialDefinition {
  return {
    name: "placeholder",
    diffuseColor: color ?? 0x9999CC,
    specularColor: 0x222222,
    emissiveColor: 0x000000,
    opacity: 1.0,
    shininess: 10,
    visible: true,
    wireframe: false,
    flatShading: false,
    ethereal: false,
    alphaBlended: false,
    clamped: false,
  };
}

function generateBipedGeometry(scale: number) {
  const s = scale;
  // Torso (cylinder)
  const torso = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.15 * s, radiusBottom: 0.18 * s, height: 0.6 * s, radialSegments: 8, center: { x: 0, y: 1.1 * s, z: 0 } }),
  );
  // Head (sphere)
  const head = meshDataToModelGeometry(
    createSphereMesh({ radius: 0.14 * s, widthSegments: 8, heightSegments: 6, center: { x: 0, y: 1.6 * s, z: 0 } }),
  );
  // Left leg
  const leftLeg = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.07 * s, radiusBottom: 0.06 * s, height: 0.7 * s, radialSegments: 6, center: { x: -0.1 * s, y: 0.35 * s, z: 0 } }),
  );
  // Right leg
  const rightLeg = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.07 * s, radiusBottom: 0.06 * s, height: 0.7 * s, radialSegments: 6, center: { x: 0.1 * s, y: 0.35 * s, z: 0 } }),
  );
  // Left arm
  const leftArm = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.05 * s, radiusBottom: 0.04 * s, height: 0.55 * s, radialSegments: 6, center: { x: -0.25 * s, y: 1.05 * s, z: 0 } }),
  );
  // Right arm
  const rightArm = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.05 * s, radiusBottom: 0.04 * s, height: 0.55 * s, radialSegments: 6, center: { x: 0.25 * s, y: 1.05 * s, z: 0 } }),
  );

  return mergeModelGeometry([torso, head, leftLeg, rightLeg, leftArm, rightArm]);
}

function generateQuadrupedGeometry(scale: number) {
  const s = scale;
  // Body (elongated box)
  const body = meshDataToModelGeometry(
    createBoxMesh({ width: 0.8 * s, height: 0.35 * s, depth: 0.3 * s, center: { x: 0, y: 0.65 * s, z: 0 } }),
  );
  // Head
  const head = meshDataToModelGeometry(
    createSphereMesh({ radius: 0.13 * s, widthSegments: 8, heightSegments: 6, center: { x: 0.5 * s, y: 0.8 * s, z: 0 } }),
  );
  // Four legs
  const fl = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.05 * s, radiusBottom: 0.04 * s, height: 0.45 * s, radialSegments: 6, center: { x: 0.25 * s, y: 0.225 * s, z: 0.1 * s } }),
  );
  const fr = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.05 * s, radiusBottom: 0.04 * s, height: 0.45 * s, radialSegments: 6, center: { x: 0.25 * s, y: 0.225 * s, z: -0.1 * s } }),
  );
  const bl = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.05 * s, radiusBottom: 0.04 * s, height: 0.45 * s, radialSegments: 6, center: { x: -0.25 * s, y: 0.225 * s, z: 0.1 * s } }),
  );
  const br = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.05 * s, radiusBottom: 0.04 * s, height: 0.45 * s, radialSegments: 6, center: { x: -0.25 * s, y: 0.225 * s, z: -0.1 * s } }),
  );

  return mergeModelGeometry([body, head, fl, fr, bl, br]);
}

function generateFlyerGeometry(scale: number) {
  const s = scale;
  // Body
  const body = meshDataToModelGeometry(
    createSphereMesh({ radius: 0.15 * s, widthSegments: 8, heightSegments: 6, center: { x: 0, y: 0.5 * s, z: 0 } }),
  );
  // Head
  const head = meshDataToModelGeometry(
    createSphereMesh({ radius: 0.08 * s, widthSegments: 6, heightSegments: 4, center: { x: 0.18 * s, y: 0.6 * s, z: 0 } }),
  );
  // Left wing (flat box)
  const leftWing = meshDataToModelGeometry(
    createBoxMesh({ width: 0.5 * s, height: 0.02 * s, depth: 0.2 * s, center: { x: 0, y: 0.55 * s, z: 0.25 * s } }),
  );
  // Right wing
  const rightWing = meshDataToModelGeometry(
    createBoxMesh({ width: 0.5 * s, height: 0.02 * s, depth: 0.2 * s, center: { x: 0, y: 0.55 * s, z: -0.25 * s } }),
  );
  // Tail
  const tail = meshDataToModelGeometry(
    createBoxMesh({ width: 0.04 * s, height: 0.02 * s, depth: 0.15 * s, center: { x: -0.2 * s, y: 0.48 * s, z: 0 } }),
  );

  return mergeModelGeometry([body, head, leftWing, rightWing, tail]);
}

function generateSwimmerGeometry(scale: number) {
  const s = scale;
  // Tapered body
  const body = meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.12 * s, radiusBottom: 0.04 * s, height: 0.9 * s, radialSegments: 8, center: { x: 0, y: 0, z: 0 } }),
  );
  // Head end
  const head = meshDataToModelGeometry(
    createSphereMesh({ radius: 0.12 * s, widthSegments: 8, heightSegments: 6, center: { x: 0, y: 0.45 * s, z: 0 } }),
  );
  // Fin (flat box)
  const fin = meshDataToModelGeometry(
    createBoxMesh({ width: 0.02 * s, height: 0.2 * s, depth: 0.15 * s, center: { x: 0, y: -0.35 * s, z: 0 } }),
  );

  return mergeModelGeometry([body, head, fin]);
}

function generateSlithererGeometry(scale: number) {
  const s = scale;
  const segments = [];
  // Body segments
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const radius = 0.06 * s * (1 - t * 0.5);
    segments.push(meshDataToModelGeometry(
      createSphereMesh({
        radius,
        widthSegments: 6,
        heightSegments: 4,
        center: { x: (t - 0.5) * 1.2 * s, y: 0.06 * s, z: 0 },
      }),
    ));
  }
  // Head
  segments.push(meshDataToModelGeometry(
    createSphereMesh({ radius: 0.08 * s, widthSegments: 6, heightSegments: 4, center: { x: -0.6 * s, y: 0.1 * s, z: 0 } }),
  ));

  return mergeModelGeometry(segments);
}

function generatePropGeometry(scale: number) {
  const s = scale;
  return meshDataToModelGeometry(
    createBoxMesh({ width: 0.5 * s, height: 0.5 * s, depth: 0.5 * s, center: { x: 0, y: 0.25 * s, z: 0 } }),
  );
}

function generateVehicleGeometry(scale: number) {
  const s = scale;
  // Body
  const body = meshDataToModelGeometry(
    createBoxMesh({ width: 1.5 * s, height: 0.4 * s, depth: 0.6 * s, center: { x: 0, y: 0.4 * s, z: 0 } }),
  );
  // Cabin
  const cabin = meshDataToModelGeometry(
    createBoxMesh({ width: 0.8 * s, height: 0.3 * s, depth: 0.55 * s, center: { x: 0.1 * s, y: 0.75 * s, z: 0 } }),
  );
  // Wheels (4 cylinders)
  const wheels = [
    { x: 0.5 * s, z: 0.35 * s },
    { x: 0.5 * s, z: -0.35 * s },
    { x: -0.5 * s, z: 0.35 * s },
    { x: -0.5 * s, z: -0.35 * s },
  ].map(pos => meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: 0.12 * s, radiusBottom: 0.12 * s, height: 0.08 * s, radialSegments: 8, center: { x: pos.x, y: 0.12 * s, z: pos.z } }),
  ));

  return mergeModelGeometry([body, cabin, ...wheels]);
}

// ── Public API ─────────────────────────────────────────────────────

/** Generates procedural placeholder geometry for a given category and scale. */
export function generateProceduralGeometry(category: EntityCategory, scale = 1.0) {
  switch (category) {
    case "BIPED": return generateBipedGeometry(scale);
    case "QUADRUPED": return generateQuadrupedGeometry(scale);
    case "FLYER": return generateFlyerGeometry(scale);
    case "SWIMMER": return generateSwimmerGeometry(scale);
    case "SLITHERER": return generateSlithererGeometry(scale);
    case "PROP": return generatePropGeometry(scale);
    case "VEHICLE": return generateVehicleGeometry(scale);
  }
}

/** Generates a complete procedural model (geometry + joints + materials + license). */
export function generateProceduralModel(config: ProceduralModelConfig): ProceduralModelResult {
  const scale = config.scale ?? 1.0;
  const geometry = generateProceduralGeometry(config.category, scale);
  const joints = [...getCanonicalJoints(config.category)];
  const materials = [defaultMaterial(config.color)];
  const license: AssetLicense = PROCEDURAL_LICENSE;

  return { geometry, joints, materials, license };
}
