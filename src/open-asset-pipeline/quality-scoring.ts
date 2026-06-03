/**
 * Quality Scoring — Heuristic metrics for procedural 3D model quality.
 *
 * Three sub-scores (0–100 each) averaged into an overall quality score:
 * - Silhouette: bounding-box coverage ratio (non-degenerate geometry check)
 * - Joint placement: how many joints fall within the geometry bounds
 * - Proportions: category-appropriate aspect ratios (height/width/depth)
 */

import type { ModelGeometryData, ModelJointDefinition } from "../model-resources/definitions.js";
import type { EntityCategory } from "./types.js";

// ── Helpers ────────────────────────────────────────────────────────

interface Bounds {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

function computeBounds(geometry: ModelGeometryData): Bounds | null {
  const verts = geometry.vertices;
  if (!verts || verts.length < 3) return null;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let validCount = 0;

  for (let i = 0; i + 2 < verts.length; i += 3) {
    const x = verts[i]!;
    const y = verts[i + 1]!;
    const z = verts[i + 2]!;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    validCount++;
  }

  if (validCount < 2) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ── Expected proportion ratios per category ────────────────────────

interface ProportionTarget {
  heightToWidth: number;  // Y-extent / X-extent
  heightToDepth: number;  // Y-extent / Z-extent
}

const PROPORTION_TARGETS: Record<EntityCategory, ProportionTarget> = {
  BIPED:     { heightToWidth: 3.5, heightToDepth: 3.0 },
  QUADRUPED: { heightToWidth: 1.2, heightToDepth: 0.8 },
  FLYER:     { heightToWidth: 0.5, heightToDepth: 0.8 },
  SWIMMER:   { heightToWidth: 2.5, heightToDepth: 2.5 },
  SLITHERER: { heightToWidth: 0.15, heightToDepth: 0.5 },
  PROP:      { heightToWidth: 1.0, heightToDepth: 1.0 },
  VEHICLE:   { heightToWidth: 0.35, heightToDepth: 0.6 },
};

// ── Public API ─────────────────────────────────────────────────────

/**
 * Scores the silhouette coverage of geometry.
 * Measures how much of the bounding box is "filled" by using vertex distribution.
 * Returns 0–100.
 */
export function scoreSilhouette(geometry: ModelGeometryData): number {
  const bounds = computeBounds(geometry);
  if (!bounds) return 0;

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const depth = bounds.maxZ - bounds.minZ;

  // Degenerate check: at least 2 dimensions must be non-zero
  const nonZeroDims = [width, height, depth].filter(d => d > 1e-6).length;
  if (nonZeroDims < 2) return 0;

  // Score based on vertex count relative to bounding box volume
  const vertexCount = geometry.vertices.length / 3;
  const bbVolume = Math.max(width, 0.01) * Math.max(height, 0.01) * Math.max(depth, 0.01);
  const vertexDensity = vertexCount / bbVolume;

  // Normalize: ~100 vertices per unit^3 is "good"
  const densityScore = clamp(vertexDensity / 100 * 60, 0, 60);

  // Bonus for having reasonable dimensions (not collapsed)
  const dimensionScore = nonZeroDims === 3 ? 40 : 20;

  return clamp(Math.round(densityScore + dimensionScore), 0, 100);
}

/**
 * Scores joint placement validity within geometry bounds.
 * Joints with localTransform.position should fall near/within the bounding box.
 * Returns 0–100.
 */
export function scoreJointPlacement(
  geometry: ModelGeometryData,
  joints: readonly ModelJointDefinition[],
): number {
  const bounds = computeBounds(geometry);
  if (!bounds) return 0;
  if (joints.length === 0) return 0;

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const depth = bounds.maxZ - bounds.minZ;
  const diagonal = Math.sqrt(width * width + height * height + depth * depth);
  if (diagonal < 1e-6) return 0;

  // For joints with position data, check proximity to bounding box
  const jointsWithPos = joints.filter(j => j.localTransform?.position);
  if (jointsWithPos.length === 0) {
    // No position data — give a neutral score based on joint count matching
    return clamp(Math.round(50 * Math.min(joints.length / 3, 1)), 0, 100);
  }

  let insideCount = 0;
  const margin = diagonal * 0.3; // Allow joints slightly outside bounds

  for (const joint of jointsWithPos) {
    const pos = joint.localTransform!.position;
    const withinX = pos.x >= bounds.minX - margin && pos.x <= bounds.maxX + margin;
    const withinY = pos.y >= bounds.minY - margin && pos.y <= bounds.maxY + margin;
    const withinZ = pos.z >= bounds.minZ - margin && pos.z <= bounds.maxZ + margin;
    if (withinX && withinY && withinZ) insideCount++;
  }

  const ratio = insideCount / jointsWithPos.length;
  return clamp(Math.round(ratio * 100), 0, 100);
}

/**
 * Scores geometry proportions against category-appropriate aspect ratios.
 * Returns 0–100.
 */
export function scoreProportions(
  geometry: ModelGeometryData,
  category: EntityCategory,
): number {
  const bounds = computeBounds(geometry);
  if (!bounds) return 0;

  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const depth = Math.max(bounds.maxZ - bounds.minZ, 1e-6);

  const target = PROPORTION_TARGETS[category];
  const actualHW = height / width;
  const actualHD = height / depth;

  // Score each ratio: exponential decay from target
  const hwScore = Math.exp(-Math.abs(Math.log(actualHW / target.heightToWidth)));
  const hdScore = Math.exp(-Math.abs(Math.log(actualHD / target.heightToDepth)));

  const combined = (hwScore + hdScore) / 2;
  return clamp(Math.round(combined * 100), 0, 100);
}

/** Quality score result with overall and sub-scores. */
export interface QualityScoreResult {
  readonly overall: number;
  readonly silhouette: number;
  readonly jointPlacement: number;
  readonly proportions: number;
}

/**
 * Computes the aggregate quality score for a model.
 * Overall = Math.round(average of three sub-scores).
 */
export function computeQualityScore(
  geometry: ModelGeometryData,
  joints: readonly ModelJointDefinition[],
  category: EntityCategory,
): QualityScoreResult {
  const silhouette = scoreSilhouette(geometry);
  const jointPlacement = scoreJointPlacement(geometry, joints);
  const proportions = scoreProportions(geometry, category);
  const overall = Math.round((silhouette + jointPlacement + proportions) / 3);

  return { overall, silhouette, jointPlacement, proportions };
}
