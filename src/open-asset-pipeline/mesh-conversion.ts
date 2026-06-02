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
    allVertices.push(...part.vertices);
    if (hasNormals && part.normals) allNormals.push(...part.normals);
    if (hasUvs && part.uvs) allUvs.push(...part.uvs);

    for (const idx of part.indices) {
      allIndices.push(idx + vertexOffset);
    }
    vertexOffset += part.vertices.length / 3;
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < allVertices.length; i += 3) {
    minX = Math.min(minX, allVertices[i]!);
    minY = Math.min(minY, allVertices[i + 1]!);
    minZ = Math.min(minZ, allVertices[i + 2]!);
    maxX = Math.max(maxX, allVertices[i]!);
    maxY = Math.max(maxY, allVertices[i + 1]!);
    maxZ = Math.max(maxZ, allVertices[i + 2]!);
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
