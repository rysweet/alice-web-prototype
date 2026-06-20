/** Category-only fallback procedural geometry generators. */

import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { EntityCategory } from "./types.js";
import { mergeModelGeometry } from "./mesh-conversion.js";
import { box, cyl, sphere } from "./procedural-geometry-helpers.js";

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
