/**
 * Procedural Model Generators — public facade for procedural asset generation.
 *
 * Focused modules own joints, helpers, feature builders, profile generators,
 * and fallback generators. This file preserves the historical public API.
 */

import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";
import type {
  ProceduralModelConfig,
  ProceduralModelResult,
  AssetLicense,
} from "./types.js";
import { PROCEDURAL_LICENSE } from "./types.js";
import { getModelProfile } from "./model-profiles.js";
import { defaultMaterial, makeMaterial } from "./procedural-geometry-helpers.js";
import { generateFromProfile } from "./procedural-profile-generators.js";
import { generateProceduralGeometry } from "./procedural-fallback-generators.js";
import { getCanonicalJoints } from "./procedural-joints.js";

export { generateProceduralGeometry } from "./procedural-fallback-generators.js";
export { getCanonicalJoints } from "./procedural-joints.js";

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
