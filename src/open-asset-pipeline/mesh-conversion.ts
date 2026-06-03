/**
 * Mesh Conversion — Bridges MeshData (structured vectors) and ModelGeometryData (flat arrays).
 */

import type { MeshData } from "../render-mesh.js";
import type { ModelGeometryData } from "../model-resources/definitions.js";

/** Converts structured MeshData (vectors) into flat-array ModelGeometryData. */
export function meshDataToModelGeometry(mesh: MeshData): ModelGeometryData {
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (const v of mesh.vertices) {
    vertices.push(v.x, v.y, v.z);
  }
  for (const n of mesh.normals) {
    normals.push(n.x, n.y, n.z);
  }
  for (const uv of mesh.uvs) {
    uvs.push(uv.u, uv.v);
  }

  return {
    vertices,
    indices: [...mesh.indices],
    normals,
    uvs,
    bounds: {
      min: { x: mesh.bounds.min.x, y: mesh.bounds.min.y, z: mesh.bounds.min.z },
      max: { x: mesh.bounds.max.x, y: mesh.bounds.max.y, z: mesh.bounds.max.z },
    },
  };
}

/** Merges multiple ModelGeometryData parts into a single geometry, adjusting index offsets. */
export function mergeModelGeometry(parts: readonly ModelGeometryData[]): ModelGeometryData {
  if (parts.length === 0) {
    return { vertices: [], indices: [], normals: [], uvs: [], bounds: null };
  }
  if (parts.length === 1) {
    const p = parts[0]!;
    return {
      vertices: [...p.vertices],
      indices: [...p.indices],
      normals: p.normals ? [...p.normals] : undefined,
      uvs: p.uvs ? [...p.uvs] : undefined,
      bounds: p.bounds
        ? { min: { ...p.bounds.min }, max: { ...p.bounds.max } }
        : p.bounds,
    };
  }

  const allVertices: number[] = [];
  const allIndices: number[] = [];
  const allNormals: number[] = [];
  const allUvs: number[] = [];
  let vertexOffset = 0;

  // Only include normals/uvs if ALL parts provide them to prevent misalignment
  const hasNormals = parts.every(p => p.normals && p.normals.length > 0);
  const hasUvs = parts.every(p => p.uvs && p.uvs.length > 0);

  for (const part of parts) {
    // Avoid push(...spread) which overflows the call stack for large arrays (>65K elements)
    for (let i = 0; i < part.vertices.length; i++) allVertices.push(part.vertices[i]!);
    if (hasNormals && part.normals) {
      for (let i = 0; i < part.normals.length; i++) allNormals.push(part.normals[i]!);
    }
    if (hasUvs && part.uvs) {
      for (let i = 0; i < part.uvs.length; i++) allUvs.push(part.uvs[i]!);
    }

    for (const idx of part.indices) {
      allIndices.push(idx + vertexOffset);
    }
    vertexOffset += part.vertices.length / 3;
  }

  // Compute merged bounds: use part bounds when available (O(parts) vs O(vertices))
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  const allHaveFiniteBounds = parts.every(p =>
    p.bounds != null &&
    Number.isFinite(p.bounds.min.x) && Number.isFinite(p.bounds.min.y) && Number.isFinite(p.bounds.min.z) &&
    Number.isFinite(p.bounds.max.x) && Number.isFinite(p.bounds.max.y) && Number.isFinite(p.bounds.max.z),
  );

  if (allHaveFiniteBounds) {
    for (const part of parts) {
      const b = part.bounds!;
      if (b.min.x < minX) minX = b.min.x;
      if (b.min.y < minY) minY = b.min.y;
      if (b.min.z < minZ) minZ = b.min.z;
      if (b.max.x > maxX) maxX = b.max.x;
      if (b.max.y > maxY) maxY = b.max.y;
      if (b.max.z > maxZ) maxZ = b.max.z;
    }
  } else {
    for (let i = 0; i < allVertices.length; i += 3) {
      const vx = allVertices[i]!;
      const vy = allVertices[i + 1]!;
      const vz = allVertices[i + 2]!;
      if (vx < minX) minX = vx;
      if (vy < minY) minY = vy;
      if (vz < minZ) minZ = vz;
      if (vx > maxX) maxX = vx;
      if (vy > maxY) maxY = vy;
      if (vz > maxZ) maxZ = vz;
    }
  }

  return {
    vertices: allVertices,
    indices: allIndices,
    normals: allNormals.length > 0 ? allNormals : undefined,
    uvs: allUvs.length > 0 ? allUvs : undefined,
    bounds: {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    },
  };
}
