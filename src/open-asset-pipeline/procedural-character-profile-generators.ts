/** Character and creature profile-driven procedural geometry generators. */

import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { ModelProfile } from "./model-profiles.js";
import { mergeModelGeometry } from "./mesh-conversion.js";
import { buildFeatureGeometry } from "./procedural-feature-builders.js";
import { box, cyl, sphere } from "./procedural-geometry-helpers.js";

export function generateBipedFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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

export function generateQuadrupedFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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

export function generateFlyerFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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

export function generateSwimmerFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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

export function generateSlithererFromProfile(p: ModelProfile, s: number): ModelGeometryData {
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
