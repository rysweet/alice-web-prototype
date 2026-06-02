/**
 * Open-Source Asset Pipeline — Types
 *
 * Defines the pluggable ModelProvider interface and configuration types
 * for the open-source asset pipeline that replaces proprietary 3D models
 * with CC0/open-source alternatives and procedural placeholders.
 */

import type { ModelGeometryData, ModelJointDefinition, ModelResourceDefinition } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";

// ── License & Provenance ───────────────────────────────────────────

export interface AssetLicense {
  readonly spdxId: string;
  readonly name: string;
  readonly sourceUrl?: string;
  readonly author?: string;
  readonly attribution?: string;
}

export const CC0_LICENSE: AssetLicense = Object.freeze({
  spdxId: "CC0-1.0",
  name: "Creative Commons Zero v1.0 Universal",
});

export const PROCEDURAL_LICENSE: AssetLicense = Object.freeze({
  spdxId: "MIT",
  name: "Procedurally generated — MIT License",
  author: "alice-web-prototype",
});

// ── Entity Categories ──────────────────────────────────────────────

export type EntityCategory =
  | "BIPED"
  | "QUADRUPED"
  | "FLYER"
  | "SWIMMER"
  | "SLITHERER"
  | "PROP"
  | "VEHICLE";

// ── Procedural Generation ──────────────────────────────────────────

export interface ProceduralModelConfig {
  readonly category: EntityCategory;
  readonly id: string;
  readonly name: string;
  readonly modelName: string;
  readonly scale?: number;
  /** Packed hex color (e.g. 0x8CA6D9 for light blue) */
  readonly color?: number;
}

export interface ProceduralModelResult {
  readonly geometry: ModelGeometryData;
  readonly joints: readonly ModelJointDefinition[];
  readonly materials: readonly MaterialDefinition[];
  readonly license: AssetLicense;
}

// ── glTF Import ────────────────────────────────────────────────────

export interface GltfImportOptions {
  readonly url: string;
  readonly jointNameMap?: Readonly<Record<string, string>>;
  readonly scale?: number;
  readonly flipZ?: boolean;
  /** Reserved for provenance tracking in future phases. */
  readonly license?: AssetLicense;
}

export interface GltfImportResult {
  readonly geometry: ModelGeometryData;
  readonly joints: readonly ModelJointDefinition[];
  readonly materials: readonly MaterialDefinition[];
}

// ── Model Provider ─────────────────────────────────────────────────

export type ModelSourceType = "procedural" | "gltf" | "url";

export interface ModelProviderSource {
  readonly type: ModelSourceType;
  readonly category: EntityCategory;
  readonly url?: string;
  readonly gltfOptions?: GltfImportOptions;
  readonly proceduralConfig?: ProceduralModelConfig;
  readonly license: AssetLicense;
}

export interface ModelProviderOptions {
  readonly sources?: readonly ModelProviderSource[];
  readonly fallbackToProcedural?: boolean;
}

// ── Blender Pipeline ───────────────────────────────────────────────

export interface BlenderExportConfig {
  readonly outputDir: string;
  readonly format: "gltf" | "glb";
  readonly applyModifiers?: boolean;
  readonly exportAnimations?: boolean;
  readonly jointNamePrefix?: string;
  readonly targetCategory?: EntityCategory;
}
