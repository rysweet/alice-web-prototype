/** Shared material and mesh helpers for procedural generators. */

import {
  createBoxMesh,
  createSphereMesh,
  createCylinderMesh,
} from "../render-mesh.js";
import type { ModelGeometryData } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";
import { meshDataToModelGeometry } from "./mesh-conversion.js";

// ── Material helpers ───────────────────────────────────────────────

export function makeMaterial(name: string, color: number): MaterialDefinition {
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

export function defaultMaterial(color?: number): MaterialDefinition {
  return makeMaterial("primary", color ?? 0x9999CC);
}

// ── Mesh shorthand helpers ─────────────────────────────────────────

export function box(w: number, h: number, d: number, cx: number, cy: number, cz: number): ModelGeometryData {
  return meshDataToModelGeometry(
    createBoxMesh({ width: w, height: h, depth: d, center: { x: cx, y: cy, z: cz } }),
  );
}

export function sphere(r: number, cx: number, cy: number, cz: number, ws = 8, hs = 6): ModelGeometryData {
  return meshDataToModelGeometry(
    createSphereMesh({ radius: r, widthSegments: ws, heightSegments: hs, center: { x: cx, y: cy, z: cz } }),
  );
}

export function cyl(rt: number, rb: number, h: number, cx: number, cy: number, cz: number, rs = 8): ModelGeometryData {
  return meshDataToModelGeometry(
    createCylinderMesh({ radiusTop: rt, radiusBottom: rb, height: h, radialSegments: rs, center: { x: cx, y: cy, z: cz } }),
  );
}
