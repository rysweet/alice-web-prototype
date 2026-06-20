/** Prop and vehicle profile-driven procedural geometry generators. */

import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { ModelProfile } from "./model-profiles.js";
import { mergeModelGeometry } from "./mesh-conversion.js";
import { buildFeatureGeometry } from "./procedural-feature-builders.js";
import { box, cyl, sphere } from "./procedural-geometry-helpers.js";

export function generatePropFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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

export function generateVehicleFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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
