/**
 * Open-Source Asset Pipeline — Barrel export.
 *
 * Provides open-source 3D model alternatives for Alice's proprietary assets.
 * See issue #86: https://github.com/rysweet/alice-web-prototype/issues/86
 */

// Types & licenses
export {
  type AssetLicense,
  type EntityCategory,
  type ProceduralModelConfig,
  type ProceduralModelResult,
  type GltfImportOptions,
  type GltfImportResult,
  type ModelSourceType,
  type ModelProviderSource,
  type ModelProviderOptions,
  type BlenderExportConfig,
  CC0_LICENSE,
  PROCEDURAL_LICENSE,
} from "./open-asset-pipeline/types.js";

// Mesh conversion utilities
export {
  meshDataToModelGeometry,
  mergeModelGeometry,
} from "./open-asset-pipeline/mesh-conversion.js";

// Procedural geometry generators
export {
  generateProceduralGeometry,
  generateProceduralModel,
  getCanonicalJoints,
} from "./open-asset-pipeline/procedural-generators.js";

// glTF import
export {
  mapJointName,
  extractJointsFromSkeleton,
  convertGltfPrimitives,
  importGltfData,
  type GltfMeshPrimitive,
  type GltfSkeleton,
} from "./open-asset-pipeline/gltf-loader.js";

// Model provider (lazy definitions for ModelResourceCatalog)
export {
  createProceduralDefinitions,
  createAllProceduralDefinitions,
  createModelDefinitions,
  getOpenSourcePipelineSummary,
} from "./open-asset-pipeline/model-provider.js";

// Blender pipeline
export {
  getBlenderJointMap,
  generateBlenderExportScript,
  getAssetSourceGuide,
} from "./open-asset-pipeline/blender-pipeline.js";
