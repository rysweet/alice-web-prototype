/**
 * glTF Loader — Loads glTF/GLB models and converts to Alice ModelGeometryData.
 *
 * Uses Three.js GLTFLoader (already a project dependency). Converts
 * Three.js BufferGeometry to flat arrays matching ModelGeometryData,
 * and extracts skeleton bone hierarchies as ModelJointDefinition[].
 *
 * Phase 1: Static geometry with joint metadata extraction.
 * Skin weights/inverse bind matrices are not preserved (deformation
 * requires extending ModelGeometryData in a future phase).
 */

import type { ModelGeometryData, ModelJointDefinition } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";
import type { GltfImportOptions, GltfImportResult } from "./types.js";
import { mergeModelGeometry } from "./mesh-conversion.js";

// ── Joint name mapping ─────────────────────────────────────────────

const DEFAULT_GLTF_TO_ALICE_JOINT_MAP: Record<string, string> = {
  // Mixamo / common glTF bone names → Alice canonical names
  "Hips": "ROOT",
  "mixamorigHips": "ROOT",
  "Spine": "SPINE_BASE",
  "mixamorigSpine": "SPINE_BASE",
  "Spine1": "SPINE_MIDDLE",
  "mixamorigSpine1": "SPINE_MIDDLE",
  "Spine2": "SPINE_UPPER",
  "mixamorigSpine2": "SPINE_UPPER",
  "Neck": "NECK",
  "mixamorigNeck": "NECK",
  "Head": "HEAD",
  "mixamorigHead": "HEAD",
  "LeftShoulder": "LEFT_CLAVICLE",
  "mixamorigLeftShoulder": "LEFT_CLAVICLE",
  "LeftArm": "LEFT_SHOULDER",
  "mixamorigLeftArm": "LEFT_SHOULDER",
  "LeftForeArm": "LEFT_ELBOW",
  "mixamorigLeftForeArm": "LEFT_ELBOW",
  "LeftHand": "LEFT_WRIST",
  "mixamorigLeftHand": "LEFT_WRIST",
  "RightShoulder": "RIGHT_CLAVICLE",
  "mixamorigRightShoulder": "RIGHT_CLAVICLE",
  "RightArm": "RIGHT_SHOULDER",
  "mixamorigRightArm": "RIGHT_SHOULDER",
  "RightForeArm": "RIGHT_ELBOW",
  "mixamorigRightForeArm": "RIGHT_ELBOW",
  "RightHand": "RIGHT_WRIST",
  "mixamorigRightHand": "RIGHT_WRIST",
  "LeftUpLeg": "LEFT_HIP",
  "mixamorigLeftUpLeg": "LEFT_HIP",
  "LeftLeg": "LEFT_KNEE",
  "mixamorigLeftLeg": "LEFT_KNEE",
  "LeftFoot": "LEFT_ANKLE",
  "mixamorigLeftFoot": "LEFT_ANKLE",
  "LeftToeBase": "LEFT_FOOT",
  "mixamorigLeftToeBase": "LEFT_FOOT",
  "RightUpLeg": "RIGHT_HIP",
  "mixamorigRightUpLeg": "RIGHT_HIP",
  "RightLeg": "RIGHT_KNEE",
  "mixamorigRightLeg": "RIGHT_KNEE",
  "RightFoot": "RIGHT_ANKLE",
  "mixamorigRightFoot": "RIGHT_ANKLE",
  "RightToeBase": "RIGHT_FOOT",
  "mixamorigRightToeBase": "RIGHT_FOOT",
};

/** Maps a glTF/Mixamo bone name to Alice's canonical joint name. Falls back to UPPER_SNAKE_CASE. */
export function mapJointName(
  gltfName: string,
  customMap?: Readonly<Record<string, string>>,
): string {
  if (customMap && gltfName in customMap) {
    return customMap[gltfName]!;
  }
  if (gltfName in DEFAULT_GLTF_TO_ALICE_JOINT_MAP) {
    return DEFAULT_GLTF_TO_ALICE_JOINT_MAP[gltfName]!;
  }
  // Convert camelCase/PascalCase to UPPER_SNAKE_CASE as fallback
  return gltfName
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .toUpperCase();
}

// ── Geometry extraction ────────────────────────────────────────────

export interface GltfMeshPrimitive {
  readonly positions: Float32Array;
  readonly normals?: Float32Array;
  readonly uvs?: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  /** Reserved for applying node transforms in a future phase. */
  readonly worldMatrix?: readonly number[];
}

export interface GltfSkeleton {
  readonly bones: ReadonlyArray<{
    readonly name: string;
    readonly parentIndex: number;
  }>;
}

function extractGeometryFromPrimitive(
  primitive: GltfMeshPrimitive,
  scale: number,
  flipZ: boolean,
): ModelGeometryData {
  const posCount = primitive.positions.length / 3;
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const zSign = flipZ ? -1 : 1;

  for (let i = 0; i < posCount; i++) {
    vertices.push(
      primitive.positions[i * 3]! * scale,
      primitive.positions[i * 3 + 1]! * scale,
      primitive.positions[i * 3 + 2]! * scale * zSign,
    );
  }

  if (primitive.normals) {
    for (let i = 0; i < posCount; i++) {
      normals.push(
        primitive.normals[i * 3]!,
        primitive.normals[i * 3 + 1]!,
        primitive.normals[i * 3 + 2]! * zSign,
      );
    }
  }

  if (primitive.uvs) {
    for (let i = 0; i < posCount; i++) {
      uvs.push(primitive.uvs[i * 2]!, primitive.uvs[i * 2 + 1]!);
    }
  }

  const indices = primitive.indices
    ? [...primitive.indices]
    : Array.from({ length: posCount }, (_, i) => i);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertices.length; i += 3) {
    minX = Math.min(minX, vertices[i]!);
    minY = Math.min(minY, vertices[i + 1]!);
    minZ = Math.min(minZ, vertices[i + 2]!);
    maxX = Math.max(maxX, vertices[i]!);
    maxY = Math.max(maxY, vertices[i + 1]!);
    maxZ = Math.max(maxZ, vertices[i + 2]!);
  }

  return {
    vertices,
    indices,
    ...(normals.length > 0 ? { normals } : {}),
    ...(uvs.length > 0 ? { uvs } : {}),
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
  };
}

/** Extracts ModelJointDefinition[] from a parsed glTF skeleton, mapping names via the joint map. */
export function extractJointsFromSkeleton(
  skeleton: GltfSkeleton,
  jointNameMap?: Readonly<Record<string, string>>,
): ModelJointDefinition[] {
  const bones = skeleton.bones;
  const mappedNames = bones.map(b => mapJointName(b.name, jointNameMap));

  return bones.map((bone, index) => ({
    name: mappedNames[index]!,
    parentName: bone.parentIndex >= 0 ? mappedNames[bone.parentIndex]! : null,
  }));
}

/** Converts glTF mesh primitives into a single ModelGeometryData, applying scale and optional Z-flip. */
export function convertGltfPrimitives(
  primitives: readonly GltfMeshPrimitive[],
  options: Pick<GltfImportOptions, "scale" | "flipZ"> = {},
): ModelGeometryData {
  const scale = options.scale ?? 1.0;
  const flipZ = options.flipZ ?? false;

  const parts = primitives.map(p => extractGeometryFromPrimitive(p, scale, flipZ));
  return parts.length === 1 ? parts[0]! : mergeModelGeometry(parts);
}

/**
 * High-level glTF import that takes pre-parsed mesh and skeleton data.
 * This separates the Three.js-dependent parsing from the pure conversion logic.
 */
export function importGltfData(
  primitives: readonly GltfMeshPrimitive[],
  skeleton: GltfSkeleton | null,
  options: GltfImportOptions,
): GltfImportResult {
  const geometry = convertGltfPrimitives(primitives, options);
  const joints = skeleton
    ? extractJointsFromSkeleton(skeleton, options.jointNameMap)
    : [];
  const materials: MaterialDefinition[] = [];

  return { geometry, joints, materials };
}
