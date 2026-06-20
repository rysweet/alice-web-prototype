/** Distinctive feature geometry builders for profile-driven models. */

import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { DistinctiveFeature } from "./model-profiles.js";
import { box, cyl, sphere } from "./procedural-geometry-helpers.js";

const MAX_SHELF_FEATURE_PARTS = 5;
type FeatureBuilder = (ctx: FeatureBuildContext) => ModelGeometryData[];

interface FeatureBuildContext {
  readonly feature: DistinctiveFeature;
  readonly fs: number;
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly headY: number;
  readonly bodyY: number;
  readonly bodyWidth: number;
  readonly bodyDepth: number;
}

/** Builds the mesh parts for one distinctive profile feature. */
export function buildFeatureGeometry(
  feature: DistinctiveFeature,
  s: number,
  headY: number,
  bodyY: number,
  bodyWidth: number,
  bodyDepth: number,
): ModelGeometryData[] {
  const ctx: FeatureBuildContext = {
    feature,
    fs: feature.scale * s,
    ox: feature.offset?.x ?? 0,
    oy: feature.offset?.y ?? 0,
    oz: feature.offset?.z ?? 0,
    headY,
    bodyY,
    bodyWidth,
    bodyDepth,
  };

  return FEATURE_BUILDERS[feature.type](ctx);
}

function buildCreatureFeature(ctx: FeatureBuildContext): ModelGeometryData[] {
  const { fs, ox, oy, oz, headY, bodyY, bodyWidth, bodyDepth } = ctx;
  switch (ctx.feature.type) {
    case "horn": return [cyl(0.01 * fs, 0.04 * fs, 0.2 * fs, ox, headY + 0.15 * fs + oy, oz)];
    case "antlers": return [
      cyl(0.015 * fs, 0.025 * fs, 0.18 * fs, -0.06 * fs + ox, headY + 0.12 * fs + oy, oz),
      cyl(0.015 * fs, 0.025 * fs, 0.18 * fs, 0.06 * fs + ox, headY + 0.12 * fs + oy, oz),
      box(0.06 * fs, 0.015 * fs, 0.015 * fs, -0.06 * fs + ox, headY + 0.2 * fs + oy, oz),
      box(0.06 * fs, 0.015 * fs, 0.015 * fs, 0.06 * fs + ox, headY + 0.2 * fs + oy, oz),
    ];
    case "ears": return [
      sphere(0.04 * fs, -0.1 * fs + ox, headY + 0.1 * fs + oy, oz, 6, 4),
      sphere(0.04 * fs, 0.1 * fs + ox, headY + 0.1 * fs + oy, oz, 6, 4),
    ];
    case "tail": return [cyl(0.03 * fs, 0.015 * fs, 0.25 * fs, -bodyWidth * 0.6 + ox, bodyY * 0.8 + oy, oz, 6)];
    case "wings": return [
      box(0.08 * fs, 0.5 * fs, 0.02 * fs, ox, bodyY + 0.1 * fs + oy, bodyDepth * 0.5 + 0.25 * fs + oz),
      box(0.08 * fs, 0.5 * fs, 0.02 * fs, ox, bodyY + 0.1 * fs + oy, -bodyDepth * 0.5 - 0.25 * fs + oz),
    ];
    case "hump": return [sphere(0.12 * fs, ox, bodyY + 0.2 * fs + oy, oz)];
    case "trunk": return [cyl(0.04 * fs, 0.02 * fs, 0.3 * fs, bodyWidth * 0.45 + ox, headY - 0.2 * fs + oy, oz, 6)];
    case "mane": return [sphere(0.12 * fs, ox, headY - 0.02 * fs + oy, oz)];
    case "shell": return [sphere(0.16 * fs, ox, bodyY + 0.12 * fs + oy, oz, 8, 6)];
    case "tusks": return [
      cyl(0.015 * fs, 0.008 * fs, 0.12 * fs, bodyWidth * 0.3 + ox, headY - 0.12 * fs + oy, 0.04 * fs + oz, 6),
      cyl(0.015 * fs, 0.008 * fs, 0.12 * fs, bodyWidth * 0.3 + ox, headY - 0.12 * fs + oy, -0.04 * fs + oz, 6),
    ];
    case "beak": return [cyl(0.03 * fs, 0.005 * fs, 0.12 * fs, bodyWidth * 0.3 + 0.08 * fs + ox, headY - 0.02 * fs + oy, oz, 6)];
    case "crest": return [box(0.02 * fs, 0.1 * fs, 0.06 * fs, ox, headY + 0.12 * fs + oy, oz)];
    case "fin": return [box(0.02 * fs, 0.15 * fs, 0.1 * fs, ox, bodyY + 0.15 * fs + oy, oz)];
    case "collar": return [cyl(0.12 * fs, 0.08 * fs, 0.04 * fs, ox, headY - 0.08 * fs + oy, oz, 8)];
    default: return unsupportedFeature(ctx.feature.type);
  }
}

function buildCostumeFeature(ctx: FeatureBuildContext): ModelGeometryData[] {
  const { fs, ox, oy, oz, headY, bodyY, bodyWidth } = ctx;
  switch (ctx.feature.type) {
    case "hat": return [
      cyl(0.08 * fs, 0.08 * fs, 0.15 * fs, ox, headY + 0.12 * fs + oy, oz, 8),
      cyl(0.14 * fs, 0.14 * fs, 0.02 * fs, ox, headY + 0.05 * fs + oy, oz, 8),
    ];
    case "cape": return [box(0.02 * fs, 0.4 * fs, 0.3 * fs, -0.08 * fs + ox, bodyY + oy, oz)];
    case "crown": return [cyl(0.09 * fs, 0.08 * fs, 0.06 * fs, ox, headY + 0.1 * fs + oy, oz, 8)];
    case "armor": return [cyl(0.17 * fs, 0.19 * fs, 0.3 * fs, ox, bodyY + 0.15 * fs + oy, oz, 8)];
    case "sword": return [box(0.02 * fs, 0.5 * fs, 0.01 * fs, bodyWidth * 0.4 + ox, bodyY * 0.6 + oy, oz)];
    case "staff": return [
      cyl(0.015 * fs, 0.015 * fs, 0.8 * fs, bodyWidth * 0.35 + ox, bodyY * 0.6 + oy, oz, 6),
      sphere(0.04 * fs, bodyWidth * 0.35 + ox, bodyY + 0.35 * fs + oy, oz, 6, 4),
    ];
    case "shield": return [box(0.02 * fs, 0.25 * fs, 0.2 * fs, -bodyWidth * 0.35 + ox, bodyY + 0.05 * fs + oy, oz)];
    default: return unsupportedFeature(ctx.feature.type);
  }
}

function buildVehicleFeature(ctx: FeatureBuildContext): ModelGeometryData[] {
  const { fs, ox, oy, oz, bodyY, bodyWidth, bodyDepth } = ctx;
  switch (ctx.feature.type) {
    case "propeller": return [box(0.04 * fs, 0.2 * fs, 0.01 * fs, bodyWidth * 0.5 + 0.02 * fs + ox, bodyY + oy, oz)];
    case "pontoons": return [
      cyl(0.04 * fs, 0.04 * fs, 0.5 * fs, ox, bodyY - 0.1 * fs + oy, 0.15 * fs + oz, 6),
      cyl(0.04 * fs, 0.04 * fs, 0.5 * fs, ox, bodyY - 0.1 * fs + oy, -0.15 * fs + oz, 6),
    ];
    case "cabin_tall": return [box(0.2 * fs, 0.15 * fs, bodyDepth * 0.8, 0.1 * fs + ox, bodyY + 0.12 * fs + oy, oz)];
    case "flatbed": return [box(bodyWidth * 0.5, 0.02 * fs, bodyDepth * 0.9, -bodyWidth * 0.2 + ox, bodyY - 0.05 * fs + oy, oz)];
    case "light_bar": return [box(bodyWidth * 0.3, 0.03 * fs, bodyDepth * 0.3, 0.05 * fs + ox, bodyY + 0.17 * fs + oy, oz)];
    case "bumper": return [box(bodyWidth * 0.15, 0.06 * fs, bodyDepth * 0.9, bodyWidth * 0.5 + ox, bodyY - 0.08 * fs + oy, oz)];
    case "spoiler": return [box(0.04 * fs, 0.06 * fs, bodyDepth * 0.7, -bodyWidth * 0.45 + ox, bodyY + 0.1 * fs + oy, oz)];
    case "tank": return [cyl(bodyDepth * 0.35, bodyDepth * 0.35, bodyWidth * 0.8, ox, bodyY + 0.05 * fs + oy, oz, 8)];
    case "box_car": return [box(bodyWidth * 0.9, 0.2 * fs, bodyDepth * 0.85, ox, bodyY + 0.1 * fs + oy, oz)];
    case "wheels_large": return [
      cyl(0.12 * fs, 0.12 * fs, 0.06 * fs, bodyWidth * 0.35 + ox, 0.12 * fs + oy, bodyDepth * 0.5 + oz, 8),
      cyl(0.12 * fs, 0.12 * fs, 0.06 * fs, bodyWidth * 0.35 + ox, 0.12 * fs + oy, -bodyDepth * 0.5 + oz, 8),
    ];
    default: return unsupportedFeature(ctx.feature.type);
  }
}

function buildObjectFeature(ctx: FeatureBuildContext): ModelGeometryData[] {
  const { fs, ox, oy, oz, bodyY, bodyWidth, bodyDepth } = ctx;
  switch (ctx.feature.type) {
    case "mushroom_cap": return [sphere(0.2 * fs, ox, bodyY + 0.25 * fs + oy, oz)];
    case "flat_top": return [cyl(0.2 * fs, 0.2 * fs, 0.04 * fs, ox, bodyY + 0.02 * fs + oy, oz, 8)];
    case "canopy": return [sphere(0.3 * fs, ox, bodyY + 0.4 * fs + oy, oz, 8, 6)];
    case "chimney": return [cyl(0.04 * fs, 0.04 * fs, 0.2 * fs, ox, bodyY + 0.15 * fs + oy, oz, 6)];
    case "rotor": return [
      box(0.8 * fs, 0.01 * fs, 0.04 * fs, ox, bodyY + 0.15 * fs + oy, oz),
      box(0.04 * fs, 0.01 * fs, 0.8 * fs, ox, bodyY + 0.15 * fs + oy, oz),
    ];
    case "balloon": return [sphere(0.35 * fs, ox, bodyY + 0.7 * fs + oy, oz, 10, 8)];
    case "mast": return [cyl(0.02 * fs, 0.02 * fs, 0.6 * fs, ox, bodyY + 0.35 * fs + oy, oz, 6)];
    case "sail": return [box(0.01 * fs, 0.35 * fs, 0.25 * fs, ox, bodyY + 0.4 * fs + oy, oz)];
    case "periscope": return [
      cyl(0.02 * fs, 0.02 * fs, 0.2 * fs, ox, bodyY + 0.15 * fs + oy, oz, 6),
      sphere(0.025 * fs, ox, bodyY + 0.27 * fs + oy, oz, 6, 4),
    ];
    case "funnel": return [cyl(0.04 * fs, 0.06 * fs, 0.15 * fs, ox, bodyY + 0.12 * fs + oy, oz, 6)];
    case "smokestack": return [cyl(0.05 * fs, 0.06 * fs, 0.2 * fs, 0.15 * fs + ox, bodyY + 0.15 * fs + oy, oz, 6)];
    case "piano_keys": return [box(bodyWidth * 0.8, 0.02 * fs, bodyDepth * 0.15, ox, bodyY - 0.02 * fs + oy, bodyDepth * 0.35 + oz)];
    case "screen": return [box(bodyWidth * 0.85, bodyY * 0.7, 0.01 * fs, ox, bodyY * 0.6 + oy, bodyDepth * 0.4 + oz)];
    case "cushion": return [sphere(bodyWidth * 0.2, ox, bodyY + 0.05 * fs + oy, oz)];
    case "shelf": return buildShelfFeature(ctx);
    case "barrel": return [cyl(0.1 * fs, 0.1 * fs, 0.2 * fs, ox, bodyY + oy, oz, 8)];
    case "spout": return [
      cyl(0.03 * fs, 0.02 * fs, 0.08 * fs, bodyWidth * 0.3 + ox, bodyY + 0.1 * fs + oy, oz, 6),
      cyl(0.03 * fs, 0.02 * fs, 0.08 * fs, -bodyWidth * 0.3 + ox, bodyY + 0.1 * fs + oy, oz, 6),
    ];
    case "glow": return [sphere(0.08 * fs, ox, bodyY + 0.05 * fs + oy, oz, 6, 4)];
    default: return unsupportedFeature(ctx.feature.type);
  }
}

const FEATURE_BUILDERS: Record<DistinctiveFeature["type"], FeatureBuilder> = {
  horn: buildCreatureFeature,
  antlers: buildCreatureFeature,
  ears: buildCreatureFeature,
  tail: buildCreatureFeature,
  wings: buildCreatureFeature,
  hump: buildCreatureFeature,
  trunk: buildCreatureFeature,
  mane: buildCreatureFeature,
  shell: buildCreatureFeature,
  tusks: buildCreatureFeature,
  beak: buildCreatureFeature,
  crest: buildCreatureFeature,
  fin: buildCreatureFeature,
  collar: buildCreatureFeature,
  hat: buildCostumeFeature,
  cape: buildCostumeFeature,
  crown: buildCostumeFeature,
  armor: buildCostumeFeature,
  sword: buildCostumeFeature,
  staff: buildCostumeFeature,
  shield: buildCostumeFeature,
  propeller: buildVehicleFeature,
  pontoons: buildVehicleFeature,
  cabin_tall: buildVehicleFeature,
  flatbed: buildVehicleFeature,
  light_bar: buildVehicleFeature,
  bumper: buildVehicleFeature,
  spoiler: buildVehicleFeature,
  tank: buildVehicleFeature,
  box_car: buildVehicleFeature,
  wheels_large: buildVehicleFeature,
  mushroom_cap: buildObjectFeature,
  flat_top: buildObjectFeature,
  canopy: buildObjectFeature,
  chimney: buildObjectFeature,
  rotor: buildObjectFeature,
  balloon: buildObjectFeature,
  mast: buildObjectFeature,
  sail: buildObjectFeature,
  periscope: buildObjectFeature,
  funnel: buildObjectFeature,
  smokestack: buildObjectFeature,
  piano_keys: buildObjectFeature,
  screen: buildObjectFeature,
  cushion: buildObjectFeature,
  shelf: buildObjectFeature,
  barrel: buildObjectFeature,
  spout: buildObjectFeature,
  glow: buildObjectFeature,
};

function buildShelfFeature(ctx: FeatureBuildContext): ModelGeometryData[] {
  const { fs, ox, oy, oz, bodyY, bodyWidth, bodyDepth } = ctx;
  const parts: ModelGeometryData[] = [];
  const shelfLevels = Math.min(ctx.feature.scale, MAX_SHELF_FEATURE_PARTS);
  for (let i = 0; i < shelfLevels; i++) {
    parts.push(box(bodyWidth * 0.95, 0.02 * fs, bodyDepth * 0.9, ox, bodyY * 0.2 * (i + 1) + oy, oz));
  }
  return parts;
}

function unsupportedFeature(type: DistinctiveFeature["type"]): never {
  throw new Error(`Unsupported procedural feature type: ${type}`);
}
