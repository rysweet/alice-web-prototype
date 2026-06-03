/**
 * Procedural Model Generators — Creates recognizable 3D geometry for each
 * Alice entity using per-model profiles that define proportions, colors,
 * and distinctive features (ears, wings, horns, tails, etc.).
 *
 * Each of the 145 models gets unique proportions and colors so they are
 * visually distinguishable. Joints match the canonical definitions from
 * story-resources.ts exactly.
 */

import {
  createBoxMesh,
  createSphereMesh,
  createCylinderMesh,
} from "../render-mesh.js";
import type { ModelGeometryData, ModelJointDefinition } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";
import { meshDataToModelGeometry, mergeModelGeometry } from "./mesh-conversion.js";
import type {
  EntityCategory,
  ProceduralModelConfig,
  ProceduralModelResult,
  AssetLicense,
} from "./types.js";
import { PROCEDURAL_LICENSE } from "./types.js";
import { getModelProfile } from "./model-profiles.js";
import type { ModelProfile, DistinctiveFeature } from "./model-profiles.js";

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

// ── Material helpers ───────────────────────────────────────────────

function makeMaterial(name: string, color: number): MaterialDefinition {
  return {
    name,
    diffuseColor: color,
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

function defaultMaterial(color?: number): MaterialDefinition {
  return makeMaterial("primary", color ?? 0x9999CC);
}

// ── Mesh shorthand helpers ─────────────────────────────────────────

function box(w: number, h: number, d: number, cx: number, cy: number, cz: number): ModelGeometryData {
  return meshDataToModelGeometry(
    createBoxMesh({ width: w, height: h, depth: d, center: { x: cx, y: cy, z: cz } }),
  );
}

function sphere(r: number, cx: number, cy: number, cz: number, ws = 8, hs = 6): ModelGeometryData {
  return meshDataToModelGeometry(
    createSphereMesh({ radius: r, widthSegments: ws, heightSegments: hs, center: { x: cx, y: cy, z: cz } }),
  );
}

function cyl(rt: number, rb: number, h: number, cx: number, cy: number, cz: number, rs = 8): ModelGeometryData {
  return meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: rt, radiusBottom: rb, height: h, radialSegments: rs, center: { x: cx, y: cy, z: cz } }),
  );
}

// ── Feature geometry builders ──────────────────────────────────────

function buildFeatureGeometry(
  feature: DistinctiveFeature,
  s: number,
  headY: number,
  bodyY: number,
  bodyWidth: number,
  bodyDepth: number,
): ModelGeometryData[] {
  const fs = feature.scale * s;
  const ox = feature.offset?.x ?? 0;
  const oy = feature.offset?.y ?? 0;
  const oz = feature.offset?.z ?? 0;
  const parts: ModelGeometryData[] = [];

  switch (feature.type) {
    case "horn":
      parts.push(cyl(0.01 * fs, 0.04 * fs, 0.2 * fs, ox, headY + 0.15 * fs + oy, oz));
      break;
    case "antlers":
      parts.push(cyl(0.015 * fs, 0.025 * fs, 0.18 * fs, -0.06 * fs + ox, headY + 0.12 * fs + oy, oz));
      parts.push(cyl(0.015 * fs, 0.025 * fs, 0.18 * fs, 0.06 * fs + ox, headY + 0.12 * fs + oy, oz));
      parts.push(box(0.06 * fs, 0.015 * fs, 0.015 * fs, -0.06 * fs + ox, headY + 0.2 * fs + oy, oz));
      parts.push(box(0.06 * fs, 0.015 * fs, 0.015 * fs, 0.06 * fs + ox, headY + 0.2 * fs + oy, oz));
      break;
    case "ears":
      parts.push(sphere(0.04 * fs, -0.1 * fs + ox, headY + 0.1 * fs + oy, oz, 6, 4));
      parts.push(sphere(0.04 * fs, 0.1 * fs + ox, headY + 0.1 * fs + oy, oz, 6, 4));
      break;
    case "tail":
      parts.push(cyl(0.03 * fs, 0.015 * fs, 0.25 * fs, -bodyWidth * 0.6 + ox, bodyY * 0.8 + oy, oz, 6));
      break;
    case "wings":
      parts.push(box(0.08 * fs, 0.5 * fs, 0.02 * fs, ox, bodyY + 0.1 * fs + oy, bodyDepth * 0.5 + 0.25 * fs + oz));
      parts.push(box(0.08 * fs, 0.5 * fs, 0.02 * fs, ox, bodyY + 0.1 * fs + oy, -bodyDepth * 0.5 - 0.25 * fs + oz));
      break;
    case "hump":
      parts.push(sphere(0.12 * fs, ox, bodyY + 0.2 * fs + oy, oz));
      break;
    case "trunk":
      parts.push(cyl(0.04 * fs, 0.02 * fs, 0.3 * fs, bodyWidth * 0.45 + ox, headY - 0.2 * fs + oy, oz, 6));
      break;
    case "mane":
      parts.push(sphere(0.12 * fs, ox, headY - 0.02 * fs + oy, oz));
      break;
    case "tusks":
      parts.push(cyl(0.015 * fs, 0.008 * fs, 0.12 * fs, bodyWidth * 0.3 + ox, headY - 0.12 * fs + oy, 0.04 * fs + oz, 6));
      parts.push(cyl(0.015 * fs, 0.008 * fs, 0.12 * fs, bodyWidth * 0.3 + ox, headY - 0.12 * fs + oy, -0.04 * fs + oz, 6));
      break;
    case "beak":
      parts.push(cyl(0.03 * fs, 0.005 * fs, 0.12 * fs, bodyWidth * 0.3 + 0.08 * fs + ox, headY - 0.02 * fs + oy, oz, 6));
      break;
    case "crest":
      parts.push(box(0.02 * fs, 0.1 * fs, 0.06 * fs, ox, headY + 0.12 * fs + oy, oz));
      break;
    case "fin":
      parts.push(box(0.02 * fs, 0.15 * fs, 0.1 * fs, ox, bodyY + 0.15 * fs + oy, oz));
      break;
    case "collar":
      parts.push(cyl(0.12 * fs, 0.08 * fs, 0.04 * fs, ox, headY - 0.08 * fs + oy, oz, 8));
      break;
    case "hat":
      parts.push(cyl(0.08 * fs, 0.08 * fs, 0.15 * fs, ox, headY + 0.12 * fs + oy, oz, 8));
      parts.push(cyl(0.14 * fs, 0.14 * fs, 0.02 * fs, ox, headY + 0.05 * fs + oy, oz, 8));
      break;
    case "cape":
      parts.push(box(0.02 * fs, 0.4 * fs, 0.3 * fs, -0.08 * fs + ox, bodyY + oy, oz));
      break;
    case "crown":
      parts.push(cyl(0.09 * fs, 0.08 * fs, 0.06 * fs, ox, headY + 0.1 * fs + oy, oz, 8));
      break;
    case "armor":
      // Slightly wider torso overlay
      parts.push(cyl(0.17 * fs, 0.19 * fs, 0.3 * fs, ox, bodyY + 0.15 * fs + oy, oz, 8));
      break;
    case "sword":
      parts.push(box(0.02 * fs, 0.5 * fs, 0.01 * fs, bodyWidth * 0.4 + ox, bodyY * 0.6 + oy, oz));
      break;
    case "staff":
      parts.push(cyl(0.015 * fs, 0.015 * fs, 0.8 * fs, bodyWidth * 0.35 + ox, bodyY * 0.6 + oy, oz, 6));
      parts.push(sphere(0.04 * fs, bodyWidth * 0.35 + ox, bodyY + 0.35 * fs + oy, oz, 6, 4));
      break;
    case "shield":
      parts.push(box(0.02 * fs, 0.25 * fs, 0.2 * fs, -bodyWidth * 0.35 + ox, bodyY + 0.05 * fs + oy, oz));
      break;
    case "mushroom_cap":
      parts.push(sphere(0.2 * fs, ox, bodyY + 0.25 * fs + oy, oz));
      break;
    case "flat_top":
      parts.push(cyl(0.2 * fs, 0.2 * fs, 0.04 * fs, ox, bodyY + 0.02 * fs + oy, oz, 8));
      break;
    case "canopy":
      parts.push(sphere(0.3 * fs, ox, bodyY + 0.4 * fs + oy, oz, 8, 6));
      break;
    case "chimney":
      parts.push(cyl(0.04 * fs, 0.04 * fs, 0.2 * fs, ox, bodyY + 0.15 * fs + oy, oz, 6));
      break;
    case "rotor":
      parts.push(box(0.8 * fs, 0.01 * fs, 0.04 * fs, ox, bodyY + 0.15 * fs + oy, oz));
      parts.push(box(0.04 * fs, 0.01 * fs, 0.8 * fs, ox, bodyY + 0.15 * fs + oy, oz));
      break;
    case "balloon":
      parts.push(sphere(0.35 * fs, ox, bodyY + 0.7 * fs + oy, oz, 10, 8));
      break;
    case "mast":
      parts.push(cyl(0.02 * fs, 0.02 * fs, 0.6 * fs, ox, bodyY + 0.35 * fs + oy, oz, 6));
      break;
    case "sail":
      parts.push(box(0.01 * fs, 0.35 * fs, 0.25 * fs, ox, bodyY + 0.4 * fs + oy, oz));
      break;
    case "periscope":
      parts.push(cyl(0.02 * fs, 0.02 * fs, 0.2 * fs, ox, bodyY + 0.15 * fs + oy, oz, 6));
      parts.push(sphere(0.025 * fs, ox, bodyY + 0.27 * fs + oy, oz, 6, 4));
      break;
    case "funnel":
      parts.push(cyl(0.04 * fs, 0.06 * fs, 0.15 * fs, ox, bodyY + 0.12 * fs + oy, oz, 6));
      break;
    case "smokestack":
      parts.push(cyl(0.05 * fs, 0.06 * fs, 0.2 * fs, 0.15 * fs + ox, bodyY + 0.15 * fs + oy, oz, 6));
      break;
    case "propeller":
      parts.push(box(0.04 * fs, 0.2 * fs, 0.01 * fs, bodyWidth * 0.5 + 0.02 * fs + ox, bodyY + oy, oz));
      break;
    case "pontoons":
      parts.push(cyl(0.04 * fs, 0.04 * fs, 0.5 * fs, ox, bodyY - 0.1 * fs + oy, 0.15 * fs + oz, 6));
      parts.push(cyl(0.04 * fs, 0.04 * fs, 0.5 * fs, ox, bodyY - 0.1 * fs + oy, -0.15 * fs + oz, 6));
      break;
    case "cabin_tall":
      parts.push(box(0.2 * fs, 0.15 * fs, bodyDepth * 0.8, 0.1 * fs + ox, bodyY + 0.12 * fs + oy, oz));
      break;
    case "flatbed":
      parts.push(box(bodyWidth * 0.5, 0.02 * fs, bodyDepth * 0.9, -bodyWidth * 0.2 + ox, bodyY - 0.05 * fs + oy, oz));
      break;
    case "light_bar":
      parts.push(box(bodyWidth * 0.3, 0.03 * fs, bodyDepth * 0.3, 0.05 * fs + ox, bodyY + 0.17 * fs + oy, oz));
      break;
    case "bumper":
      parts.push(box(bodyWidth * 0.15, 0.06 * fs, bodyDepth * 0.9, bodyWidth * 0.5 + ox, bodyY - 0.08 * fs + oy, oz));
      break;
    case "spoiler":
      parts.push(box(0.04 * fs, 0.06 * fs, bodyDepth * 0.7, -bodyWidth * 0.45 + ox, bodyY + 0.1 * fs + oy, oz));
      break;
    case "tank":
      parts.push(cyl(bodyDepth * 0.35, bodyDepth * 0.35, bodyWidth * 0.8, ox, bodyY + 0.05 * fs + oy, oz, 8));
      break;
    case "box_car":
      parts.push(box(bodyWidth * 0.9, 0.2 * fs, bodyDepth * 0.85, ox, bodyY + 0.1 * fs + oy, oz));
      break;
    case "wheels_large":
      parts.push(cyl(0.12 * fs, 0.12 * fs, 0.06 * fs, bodyWidth * 0.35 + ox, 0.12 * fs + oy, bodyDepth * 0.5 + oz, 8));
      parts.push(cyl(0.12 * fs, 0.12 * fs, 0.06 * fs, bodyWidth * 0.35 + ox, 0.12 * fs + oy, -bodyDepth * 0.5 + oz, 8));
      break;
    case "piano_keys":
      parts.push(box(bodyWidth * 0.8, 0.02 * fs, bodyDepth * 0.15, ox, bodyY - 0.02 * fs + oy, bodyDepth * 0.35 + oz));
      break;
    case "screen":
      parts.push(box(bodyWidth * 0.85, bodyY * 0.7, 0.01 * fs, ox, bodyY * 0.6 + oy, bodyDepth * 0.4 + oz));
      break;
    case "cushion":
      parts.push(sphere(bodyWidth * 0.2, ox, bodyY + 0.05 * fs + oy, oz));
      break;
    case "shelf":
      for (let i = 0; i < Math.min(feature.scale, 5); i++) {
        parts.push(box(bodyWidth * 0.95, 0.02 * fs, bodyDepth * 0.9, ox, bodyY * 0.2 * (i + 1) + oy, oz));
      }
      break;
    case "barrel":
      parts.push(cyl(0.1 * fs, 0.1 * fs, 0.2 * fs, ox, bodyY + oy, oz, 8));
      break;
    case "spout":
      parts.push(cyl(0.03 * fs, 0.02 * fs, 0.08 * fs, bodyWidth * 0.3 + ox, bodyY + 0.1 * fs + oy, oz, 6));
      parts.push(cyl(0.03 * fs, 0.02 * fs, 0.08 * fs, -bodyWidth * 0.3 + ox, bodyY + 0.1 * fs + oy, oz, 6));
      break;
    case "glow":
      parts.push(sphere(0.08 * fs, ox, bodyY + 0.05 * fs + oy, oz, 6, 4));
      break;
    // No default — exhaustive switch on the union type
  }
  return parts;
}

// ── Profile-driven geometry generators ─────────────────────────────

function generateBipedFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const bd = p.body.depth;
  const lThick = p.limbs.thickness;
  const lLen = p.limbs.length;
  const hSize = p.head.size;
  const hOff = p.head.yOffset;

  const torsoH = 0.6 * s * bh;
  const torsoY = 1.1 * s * bh;
  const headR = 0.14 * s * hSize;
  const headY = torsoY + torsoH * 0.5 + headR + 0.05 * s + hOff * s;
  const legH = 0.7 * s * lLen;

  const parts: ModelGeometryData[] = [];

  // Torso
  parts.push(cyl(0.15 * s * bw, 0.18 * s * bw, torsoH, 0, torsoY, 0, 8));

  // Head
  if (p.head.shape === "elongated") {
    parts.push(cyl(headR * 0.8, headR, headR * 1.8, 0, headY, 0, 8));
  } else if (p.head.shape === "flat") {
    parts.push(box(headR * 2, headR * 1.5, headR * 2, 0, headY, 0));
  } else if (p.head.shape === "pointed") {
    parts.push(cyl(headR * 0.3, headR, headR * 2, 0, headY, 0, 8));
  } else {
    parts.push(sphere(headR, 0, headY, 0));
  }

  // Limbs (skip if thickness is 0 — e.g. ghost)
  if (lThick > 0.01) {
    const armThick = 0.05 * s * lThick;
    const legThick = 0.07 * s * lThick;
    const armH = 0.55 * s * lLen;
    const armSpread = 0.25 * s * bw;
    const legSpread = 0.1 * s * bw;
    const legBaseY = legH * 0.5;

    parts.push(cyl(legThick, legThick * 0.85, legH, -legSpread, legBaseY, 0, 6));
    parts.push(cyl(legThick, legThick * 0.85, legH, legSpread, legBaseY, 0, 6));
    parts.push(cyl(armThick, armThick * 0.8, armH, -armSpread, torsoY - 0.05 * s, 0, 6));
    parts.push(cyl(armThick, armThick * 0.8, armH, armSpread, torsoY - 0.05 * s, 0, 6));
  } else {
    // Ghost-like: flowing base
    parts.push(cyl(0.18 * s * bw, 0.25 * s * bw, 0.6 * s * bh, 0, 0.3 * s * bh, 0, 8));
  }

  // Features
  const bodyWidth = 0.18 * s * bw;
  const bodyDepth = 0.18 * s * bd;
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, headY, torsoY, bodyWidth, bodyDepth));
  }

  return mergeModelGeometry(parts);
}

function generateQuadrupedFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const bd = p.body.depth;
  const lThick = p.limbs.thickness;
  const lLen = p.limbs.length;
  const hSize = p.head.size;
  const hOff = p.head.yOffset;

  const bodyW = 0.8 * s * bw;
  const bodyH = 0.35 * s * bh;
  const bodyD = 0.3 * s * bd;
  const legH = 0.45 * s * lLen;
  const bodyY = legH + bodyH * 0.5;
  const headR = 0.13 * s * hSize;
  const neckLen = 0.15 * s * bh;
  const headX = bodyW * 0.5 + neckLen;
  const headY = bodyY + bodyH * 0.3 + hOff * s;

  const parts: ModelGeometryData[] = [];

  // Body
  parts.push(box(bodyW, bodyH, bodyD, 0, bodyY, 0));

  // Neck
  parts.push(cyl(0.06 * s * bw, 0.08 * s * bw, neckLen, bodyW * 0.4, bodyY + bodyH * 0.3, 0, 6));

  // Head
  if (p.head.shape === "elongated") {
    parts.push(cyl(headR * 0.7, headR * 0.9, headR * 2, headX, headY, 0, 8));
  } else if (p.head.shape === "pointed") {
    parts.push(cyl(headR * 0.2, headR * 0.9, headR * 2.2, headX, headY, 0, 8));
  } else {
    parts.push(sphere(headR, headX, headY, 0));
  }

  // Four legs
  const legThick = 0.05 * s * lThick;
  const legSpreadX = bodyW * 0.35;
  const legSpreadZ = bodyD * 0.35;
  parts.push(cyl(legThick, legThick * 0.8, legH, legSpreadX, legH * 0.5, legSpreadZ, 6));
  parts.push(cyl(legThick, legThick * 0.8, legH, legSpreadX, legH * 0.5, -legSpreadZ, 6));
  parts.push(cyl(legThick, legThick * 0.8, legH, -legSpreadX, legH * 0.5, legSpreadZ, 6));
  parts.push(cyl(legThick, legThick * 0.8, legH, -legSpreadX, legH * 0.5, -legSpreadZ, 6));

  // Features
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, headY, bodyY, bodyW, bodyD));
  }

  return mergeModelGeometry(parts);
}

function generateFlyerFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const lLen = p.limbs.length;
  const lThick = p.limbs.thickness;
  const hSize = p.head.size;

  const bodyR = 0.15 * s * bw;
  const bodyY = 0.5 * s * bh;
  const headR = 0.08 * s * hSize;
  const headX = bodyR + headR * 0.3;
  const headY = bodyY + bodyR * 0.4;

  const parts: ModelGeometryData[] = [];

  // Body
  parts.push(sphere(bodyR, 0, bodyY, 0));

  // Head
  if (p.head.shape === "elongated") {
    parts.push(cyl(headR * 0.6, headR, headR * 2, headX, headY, 0, 6));
  } else if (p.head.shape === "flat") {
    parts.push(box(headR * 2, headR * 1.2, headR * 2.2, headX, headY, 0));
  } else {
    parts.push(sphere(headR, headX, headY, 0));
  }

  // Wings (default, may be overridden by feature)
  const hasWingFeature = p.features.some(f => f.type === "wings");
  if (!hasWingFeature) {
    const wingW = 0.5 * s * bw;
    parts.push(box(wingW, 0.02 * s, 0.2 * s * bw, 0, bodyY + 0.05 * s, 0.25 * s * bw));
    parts.push(box(wingW, 0.02 * s, 0.2 * s * bw, 0, bodyY + 0.05 * s, -0.25 * s * bw));
  }

  // Legs
  if (lThick > 0.01 && lLen > 0.01) {
    const legH = 0.2 * s * lLen;
    const legR = 0.02 * s * lThick;
    parts.push(cyl(legR, legR * 0.7, legH, 0, bodyY - bodyR - legH * 0.3, 0.04 * s, 6));
    parts.push(cyl(legR, legR * 0.7, legH, 0, bodyY - bodyR - legH * 0.3, -0.04 * s, 6));
  }

  // Tail (default small)
  const hasTailFeature = p.features.some(f => f.type === "tail");
  if (!hasTailFeature) {
    parts.push(box(0.04 * s, 0.02 * s, 0.15 * s, -bodyR - 0.05 * s, bodyY - 0.02 * s, 0));
  }

  // Features
  const bodyWidth = bodyR;
  const bodyDepth = bodyR;
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, headY, bodyY, bodyWidth, bodyDepth));
  }

  return mergeModelGeometry(parts);
}

function generateSwimmerFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const bd = p.body.depth;
  const hSize = p.head.size;

  const bodyLen = 0.9 * s * bd;
  const bodyR = 0.12 * s * bw;
  const headR = bodyR * hSize;

  const parts: ModelGeometryData[] = [];

  // Tapered body
  parts.push(cyl(bodyR, bodyR * 0.3, bodyLen, 0, 0, 0, 8));

  // Head
  if (p.head.shape === "pointed") {
    parts.push(cyl(0.01 * s, headR, headR * 1.5, 0, bodyLen * 0.5 + headR * 0.5, 0, 8));
  } else {
    parts.push(sphere(headR, 0, bodyLen * 0.5, 0));
  }

  // Side fins
  parts.push(box(0.02 * s, 0.08 * s * bh, 0.1 * s, 0, bodyLen * 0.2, bodyR + 0.05 * s));
  parts.push(box(0.02 * s, 0.08 * s * bh, 0.1 * s, 0, bodyLen * 0.2, -bodyR - 0.05 * s));

  // Features
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, bodyLen * 0.5, 0, bodyR, bodyR));
  }

  return mergeModelGeometry(parts);
}

function generateSlithererFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const bd = p.body.depth;
  const hSize = p.head.size;
  const thick = p.limbs.thickness;

  const segCount = 8;
  const totalLen = 1.2 * s * bd;
  const baseR = 0.06 * s * bw * thick;

  const parts: ModelGeometryData[] = [];

  // Body segments with gentle S-curve
  for (let i = 0; i < segCount; i++) {
    const t = i / (segCount - 1);
    const radius = baseR * (1 - t * 0.5);
    const x = (t - 0.5) * totalLen;
    const sineOff = Math.sin(t * Math.PI * 2) * 0.05 * s * bw;
    parts.push(sphere(radius, x, baseR + sineOff, 0, 6, 4));
  }

  // Head
  const headR = 0.08 * s * hSize;
  const headX = -totalLen * 0.5 - headR * 0.5;
  const headY = baseR + 0.04 * s * bh;
  if (p.head.shape === "flat") {
    parts.push(box(headR * 2, headR * 1.2, headR * 2.5, headX, headY, 0));
  } else {
    parts.push(sphere(headR, headX, headY, 0, 6, 4));
  }

  // Features
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, headY, baseR, totalLen * 0.5, baseR));
  }

  return mergeModelGeometry(parts);
}

function generatePropFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const bd = p.body.depth;

  const w = 0.5 * s * bw;
  const h = 0.5 * s * bh;
  const d = 0.5 * s * bd;
  const bodyY = h * 0.5;

  const parts: ModelGeometryData[] = [];

  // Props that are basically "no head" get a shaped body
  if (bh > 1.5) {
    // Tall prop (tree trunk, castle tower)
    parts.push(cyl(w * 0.3, w * 0.4, h, 0, bodyY, 0, 8));
  } else if (bw > 1.5) {
    // Wide prop (fence, sofa)
    parts.push(box(w, h, d, 0, bodyY, 0));
  } else if (bh < 0.5 && bw < 0.5) {
    // Small prop (fire hydrant)
    parts.push(cyl(w * 0.5, w * 0.6, h, 0, bodyY, 0, 6));
  } else {
    // Standard box
    parts.push(box(w, h, d, 0, bodyY, 0));
  }

  // Chair/table: add legs
  if (p.id === "CHAIR" || p.id === "TABLE" || p.id === "DESK") {
    const legH = h * 0.6;
    const lw = w * 0.4;
    const ld = d * 0.4;
    parts.push(cyl(0.02 * s, 0.02 * s, legH, -lw, legH * 0.5, ld, 4));
    parts.push(cyl(0.02 * s, 0.02 * s, legH, lw, legH * 0.5, ld, 4));
    parts.push(cyl(0.02 * s, 0.02 * s, legH, -lw, legH * 0.5, -ld, 4));
    parts.push(cyl(0.02 * s, 0.02 * s, legH, lw, legH * 0.5, -ld, 4));
    // Table top
    parts.push(box(w, 0.03 * s, d, 0, legH + 0.015 * s, 0));
  }

  // Chair back
  if (p.id === "CHAIR") {
    parts.push(box(w * 0.9, h * 0.5, 0.02 * s, 0, h * 0.8, -d * 0.45));
  }

  // Lamp: base + pole + shade
  if (p.id === "LAMP") {
    parts.push(cyl(w * 0.5, w * 0.5, 0.03 * s, 0, 0.015 * s, 0, 6));
    parts.push(cyl(0.015 * s, 0.015 * s, h * 0.8, 0, h * 0.4, 0, 6));
    parts.push(cyl(w * 0.1, w * 0.5, h * 0.2, 0, h * 0.85, 0, 8));
  }

  // Well: cylinder ring
  if (p.id === "WELL") {
    parts.push(cyl(w * 0.5, w * 0.5, h, 0, bodyY, 0, 8));
    parts.push(cyl(w * 0.35, w * 0.35, h * 1.02, 0, bodyY, 0, 8)); // inner hole effect
  }

  // Boulder: irregular spheres
  if (p.id === "BOULDER") {
    parts.push(sphere(w * 0.5, 0, w * 0.35, 0, 6, 5));
    parts.push(sphere(w * 0.35, w * 0.15, w * 0.25, w * 0.1, 5, 4));
  }

  // Features
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, bodyY + h * 0.5, bodyY, w, d));
  }

  return mergeModelGeometry(parts);
}

function generateVehicleFromProfile(p: ModelProfile, s: number): ModelGeometryData {
  const bh = p.body.height;
  const bw = p.body.width;
  const bd = p.body.depth;

  const bodyW = 1.5 * s * bw;
  const bodyH = 0.4 * s * bh;
  const bodyD = 0.6 * s * bd;
  const bodyY = 0.4 * s * bh;

  const parts: ModelGeometryData[] = [];

  // Detect vehicle sub-type by features and proportions
  const hasWings = p.features.some(f => f.type === "wings");
  const hasRotor = p.features.some(f => f.type === "rotor");
  const hasBalloon = p.features.some(f => f.type === "balloon");
  const hasMast = p.features.some(f => f.type === "mast");
  const hasSmokestack = p.features.some(f => f.type === "smokestack");
  const isAircraft = hasWings || hasRotor || hasBalloon;
  const isWatercraft = hasMast || p.id === "CANOE" || p.id === "ROWBOAT"
    || p.id === "SPEEDBOAT" || p.id === "YACHT" || p.id === "SUBMARINE";
  const isTrain = hasSmokestack || p.id === "CABOOSE" || p.id === "COAL_CAR"
    || p.id === "FREIGHT_CAR" || p.id === "LOCOMOTIVE" || p.id === "PASSENGER_CAR"
    || p.id === "TANK_CAR";

  if (isAircraft) {
    // Fuselage
    parts.push(cyl(bodyD * 0.3, bodyD * 0.3, bodyW * 0.8, 0, bodyY, 0, 8));
    // Nose cone
    parts.push(cyl(0.01 * s, bodyD * 0.3, bodyD * 0.4, bodyW * 0.45, bodyY, 0, 8));
    // Tail fin
    parts.push(box(0.04 * s, bodyH * 0.5, bodyD * 0.3, -bodyW * 0.38, bodyY + bodyH * 0.3, 0));
    if (hasBalloon) {
      // Gondola basket instead
      parts.push(box(bodyW * 0.2, bodyH * 0.3, bodyD * 0.5, 0, bodyY * 0.3, 0));
    }
  } else if (isWatercraft) {
    // Hull (tapered cylinder on its side)
    parts.push(cyl(bodyD * 0.4, bodyD * 0.15, bodyW, 0, bodyY * 0.6, 0, 8));
    // Deck
    parts.push(box(bodyW * 0.9, 0.03 * s, bodyD * 0.7, 0, bodyY * 0.85, 0));
  } else if (isTrain) {
    // Rail car body
    parts.push(box(bodyW * 0.9, bodyH, bodyD * 0.85, 0, bodyY, 0));
    // Wheels (train-style)
    const wR = 0.1 * s;
    parts.push(cyl(wR, wR, 0.06 * s, bodyW * 0.3, wR, bodyD * 0.5, 8));
    parts.push(cyl(wR, wR, 0.06 * s, bodyW * 0.3, wR, -bodyD * 0.5, 8));
    parts.push(cyl(wR, wR, 0.06 * s, -bodyW * 0.3, wR, bodyD * 0.5, 8));
    parts.push(cyl(wR, wR, 0.06 * s, -bodyW * 0.3, wR, -bodyD * 0.5, 8));
  } else {
    // Standard automobile
    parts.push(box(bodyW, bodyH, bodyD, 0, bodyY, 0));
    // Cabin
    const cabinW = bodyW * 0.55;
    const cabinH = 0.3 * s * bh;
    parts.push(box(cabinW, cabinH, bodyD * 0.9, bodyW * 0.05, bodyY + bodyH * 0.5 + cabinH * 0.5, 0));
    // Wheels
    const wR = 0.12 * s;
    parts.push(cyl(wR, wR, 0.08 * s, bodyW * 0.33, wR, bodyD * 0.5, 8));
    parts.push(cyl(wR, wR, 0.08 * s, bodyW * 0.33, wR, -bodyD * 0.5, 8));
    parts.push(cyl(wR, wR, 0.08 * s, -bodyW * 0.33, wR, bodyD * 0.5, 8));
    parts.push(cyl(wR, wR, 0.08 * s, -bodyW * 0.33, wR, -bodyD * 0.5, 8));
  }

  // Features
  for (const feat of p.features) {
    parts.push(...buildFeatureGeometry(feat, s, bodyY + bodyH * 0.5, bodyY, bodyW * 0.5, bodyD * 0.5));
  }

  return mergeModelGeometry(parts);
}

// ── Fallback category-only generators (when no profile found) ──────

function generateBipedGeometry(scale: number) {
  const s = scale;
  return mergeModelGeometry([
    cyl(0.15 * s, 0.18 * s, 0.6 * s, 0, 1.1 * s, 0, 8),
    sphere(0.14 * s, 0, 1.6 * s, 0),
    cyl(0.07 * s, 0.06 * s, 0.7 * s, -0.1 * s, 0.35 * s, 0, 6),
    cyl(0.07 * s, 0.06 * s, 0.7 * s, 0.1 * s, 0.35 * s, 0, 6),
    cyl(0.05 * s, 0.04 * s, 0.55 * s, -0.25 * s, 1.05 * s, 0, 6),
    cyl(0.05 * s, 0.04 * s, 0.55 * s, 0.25 * s, 1.05 * s, 0, 6),
  ]);
}

function generateQuadrupedGeometry(scale: number) {
  const s = scale;
  return mergeModelGeometry([
    box(0.8 * s, 0.35 * s, 0.3 * s, 0, 0.65 * s, 0),
    sphere(0.13 * s, 0.5 * s, 0.8 * s, 0),
    cyl(0.05 * s, 0.04 * s, 0.45 * s, 0.25 * s, 0.225 * s, 0.1 * s, 6),
    cyl(0.05 * s, 0.04 * s, 0.45 * s, 0.25 * s, 0.225 * s, -0.1 * s, 6),
    cyl(0.05 * s, 0.04 * s, 0.45 * s, -0.25 * s, 0.225 * s, 0.1 * s, 6),
    cyl(0.05 * s, 0.04 * s, 0.45 * s, -0.25 * s, 0.225 * s, -0.1 * s, 6),
  ]);
}

function generateFlyerGeometry(scale: number) {
  const s = scale;
  return mergeModelGeometry([
    sphere(0.15 * s, 0, 0.5 * s, 0),
    sphere(0.08 * s, 0.18 * s, 0.6 * s, 0, 6, 4),
    box(0.5 * s, 0.02 * s, 0.2 * s, 0, 0.55 * s, 0.25 * s),
    box(0.5 * s, 0.02 * s, 0.2 * s, 0, 0.55 * s, -0.25 * s),
    box(0.04 * s, 0.02 * s, 0.15 * s, -0.2 * s, 0.48 * s, 0),
  ]);
}

function generateSwimmerGeometry(scale: number) {
  const s = scale;
  return mergeModelGeometry([
    cyl(0.12 * s, 0.04 * s, 0.9 * s, 0, 0, 0, 8),
    sphere(0.12 * s, 0, 0.45 * s, 0),
    box(0.02 * s, 0.2 * s, 0.15 * s, 0, -0.35 * s, 0),
  ]);
}

function generateSlithererGeometry(scale: number) {
  const s = scale;
  const parts: ModelGeometryData[] = [];
  for (let i = 0; i < 6; i++) {
    const t = i / 5;
    const radius = 0.06 * s * (1 - t * 0.5);
    parts.push(sphere(radius, (t - 0.5) * 1.2 * s, 0.06 * s, 0, 6, 4));
  }
  parts.push(sphere(0.08 * s, -0.6 * s, 0.1 * s, 0, 6, 4));
  return mergeModelGeometry(parts);
}

function generatePropGeometry(scale: number) {
  const s = scale;
  return box(0.5 * s, 0.5 * s, 0.5 * s, 0, 0.25 * s, 0);
}

function generateVehicleGeometry(scale: number) {
  const s = scale;
  return mergeModelGeometry([
    box(1.5 * s, 0.4 * s, 0.6 * s, 0, 0.4 * s, 0),
    box(0.8 * s, 0.3 * s, 0.55 * s, 0.1 * s, 0.75 * s, 0),
    cyl(0.12 * s, 0.12 * s, 0.08 * s, 0.5 * s, 0.12 * s, 0.35 * s, 8),
    cyl(0.12 * s, 0.12 * s, 0.08 * s, 0.5 * s, 0.12 * s, -0.35 * s, 8),
    cyl(0.12 * s, 0.12 * s, 0.08 * s, -0.5 * s, 0.12 * s, 0.35 * s, 8),
    cyl(0.12 * s, 0.12 * s, 0.08 * s, -0.5 * s, 0.12 * s, -0.35 * s, 8),
  ]);
}

// ── Profile-aware dispatch ─────────────────────────────────────────

function generateFromProfile(p: ModelProfile, scale: number): ModelGeometryData {
  switch (p.category) {
    case "BIPED": return generateBipedFromProfile(p, scale);
    case "QUADRUPED": return generateQuadrupedFromProfile(p, scale);
    case "FLYER": return generateFlyerFromProfile(p, scale);
    case "SWIMMER": return generateSwimmerFromProfile(p, scale);
    case "SLITHERER": return generateSlithererFromProfile(p, scale);
    case "PROP": return generatePropFromProfile(p, scale);
    case "VEHICLE": return generateVehicleFromProfile(p, scale);
  }
}

// ── Public API ─────────────────────────────────────────────────────

/** Generates procedural geometry for a given category and scale (fallback). */
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

/** Generates a complete procedural model with per-model profile-driven geometry. */
export function generateProceduralModel(config: ProceduralModelConfig): ProceduralModelResult {
  const scale = config.scale ?? 1.0;
  const profile = getModelProfile(config.id);

  let geometry: ModelGeometryData;
  let materials: MaterialDefinition[];

  if (profile) {
    geometry = generateFromProfile(profile, scale);
    materials = [
      makeMaterial("primary", profile.primaryColor),
      makeMaterial("accent", profile.secondaryColor),
    ];
  } else {
    geometry = generateProceduralGeometry(config.category, scale);
    materials = [defaultMaterial(config.color)];
  }

  const joints = [...getCanonicalJoints(config.category)];
  const license: AssetLicense = PROCEDURAL_LICENSE;

  return { geometry, joints, materials, license };
}
