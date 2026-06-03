/**
 * glTF/GLB Export — Converts ModelGeometryData + joints + materials
 * into valid GLB (binary glTF 2.0) buffers using @gltf-transform/core.
 */

import { Document, NodeIO } from "@gltf-transform/core";
import type { ModelGeometryData, ModelJointDefinition } from "../model-resources/definitions.js";
import type { MaterialDefinition } from "../materials.js";

// ── Types ──────────────────────────────────────────────────────────

export interface GlbMetadata {
  readonly modelId: string;
  readonly category: string;
  readonly generatedAt: string;
}

// ── Helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: number): [number, number, number] {
  return [
    ((hex >> 16) & 0xFF) / 255,
    ((hex >> 8) & 0xFF) / 255,
    (hex & 0xFF) / 255,
  ];
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Exports model geometry, joints, and materials as a GLB (binary glTF 2.0) buffer.
 * Returns a Uint8Array containing the complete GLB file.
 */
export async function exportModelToGlb(
  geometry: ModelGeometryData,
  joints: readonly ModelJointDefinition[],
  materials: readonly MaterialDefinition[],
  metadata?: GlbMetadata,
): Promise<Uint8Array> {
  const doc = new Document();

  // Asset info
  doc.getRoot().getAsset().version = "2.0";
  doc.getRoot().getAsset().generator = "alice-web-prototype";

  if (metadata) {
    const extras = doc.getRoot().getAsset().extras as Record<string, unknown> ?? {};
    extras.alice = {
      modelId: metadata.modelId,
      category: metadata.category,
      generatedAt: metadata.generatedAt,
    };
    doc.getRoot().getAsset().extras = extras;
  }

  // Create buffer
  const buffer = doc.createBuffer("main");

  // Build position accessor
  const positionData = new Float32Array(geometry.vertices);
  const positionAccessor = doc.createAccessor("POSITION")
    .setType("VEC3")
    .setArray(positionData)
    .setBuffer(buffer);

  // Build index accessor
  const indexData = new Uint16Array(geometry.indices);
  const indexAccessor = doc.createAccessor("INDEX")
    .setType("SCALAR")
    .setArray(indexData)
    .setBuffer(buffer);

  // Build normals accessor (if available)
  let normalAccessor;
  if (geometry.normals && geometry.normals.length > 0) {
    const normalData = new Float32Array(geometry.normals);
    normalAccessor = doc.createAccessor("NORMAL")
      .setType("VEC3")
      .setArray(normalData)
      .setBuffer(buffer);
  }

  // Build UV accessor (if available)
  let uvAccessor;
  if (geometry.uvs && geometry.uvs.length > 0) {
    const uvData = new Float32Array(geometry.uvs);
    uvAccessor = doc.createAccessor("TEXCOORD_0")
      .setType("VEC2")
      .setArray(uvData)
      .setBuffer(buffer);
  }

  // Create material
  let gltfMaterial;
  if (materials.length > 0) {
    const mat = materials[0]!;
    const [r, g, b] = hexToRgb(mat.diffuseColor);
    gltfMaterial = doc.createMaterial(mat.name ?? "material")
      .setBaseColorFactor([r, g, b, mat.opacity]);
  }

  // Create mesh primitive
  const primitive = doc.createPrimitive()
    .setAttribute("POSITION", positionAccessor)
    .setIndices(indexAccessor);

  if (normalAccessor) {
    primitive.setAttribute("NORMAL", normalAccessor);
  }
  if (uvAccessor) {
    primitive.setAttribute("TEXCOORD_0", uvAccessor);
  }
  if (gltfMaterial) {
    primitive.setMaterial(gltfMaterial);
  }

  // Create mesh
  const mesh = doc.createMesh("mesh").addPrimitive(primitive);

  // Create main node
  const mainNode = doc.createNode("root").setMesh(mesh);

  // Create joint nodes (if any)
  if (joints.length > 0) {
    const jointNodeMap = new Map<string, ReturnType<Document["createNode"]>>();
    for (const joint of joints) {
      const jNode = doc.createNode(joint.name);
      jointNodeMap.set(joint.name, jNode);
    }
    // Build parent-child relationships
    for (const joint of joints) {
      const jNode = jointNodeMap.get(joint.name)!;
      if (joint.parentName) {
        const parentNode = jointNodeMap.get(joint.parentName);
        if (parentNode) {
          parentNode.addChild(jNode);
        }
      }
    }
    // Attach root joints to main node
    for (const joint of joints) {
      if (!joint.parentName) {
        const jNode = jointNodeMap.get(joint.name)!;
        mainNode.addChild(jNode);
      }
    }
  }

  // Create scene
  const scene = doc.createScene("scene").addChild(mainNode);
  doc.getRoot().setDefaultScene(scene);

  // Write to GLB
  const io = new NodeIO();
  const glb = await io.writeBinary(doc);
  return glb;
}
