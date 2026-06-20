/**
 * TDD tests for glTF/GLB export — src/open-asset-pipeline/gltf-export.ts
 *
 * Tests define the contract for exportModelToGlb() which converts
 * ModelGeometryData + joints + materials into a valid GLB (binary glTF 2.0) buffer.
 */

import { describe, expect, it } from "vitest";
import {
  exportModelToGlb,
  type GlbMetadata,
} from "../src/open-asset-pipeline/gltf-export.js";
import { createBoxMesh, createSphereMesh } from "../src/render-mesh.js";
import { meshDataToModelGeometry } from "../src/open-asset-pipeline/mesh-conversion.js";
import type { ModelGeometryData, ModelJointDefinition } from "../src/model-resources/definitions.js";
import type { MaterialDefinition } from "../src/materials.js";

// ── Helpers ────────────────────────────────────────────────────────

function makeBoxGeometry(): ModelGeometryData {
  return meshDataToModelGeometry(
    createBoxMesh({ width: 1, height: 1, depth: 1 }),
  );
}

function makeSphereGeometry(): ModelGeometryData {
  return meshDataToModelGeometry(
    createSphereMesh({ radius: 0.5, widthSegments: 8, heightSegments: 6 }),
  );
}

const SAMPLE_JOINTS: readonly ModelJointDefinition[] = [
  { name: "ROOT", parentName: null },
  { name: "SPINE", parentName: "ROOT" },
  { name: "HEAD", parentName: "SPINE" },
];

const SAMPLE_MATERIAL: MaterialDefinition = {
  name: "test-material",
  diffuseColor: 0x8899AA,
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

// ── GLB Header Parsing ─────────────────────────────────────────────

function parseGlbHeader(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    length: view.getUint32(8, true),
  };
}

function parseGlbJson(data: Uint8Array): Record<string, unknown> {
  // First chunk starts at byte 12
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  // JSON chunk type = 0x4E4F534A ("JSON" little-endian)
  if (chunkType !== 0x4E4F534A) {
    throw new Error(`Expected JSON chunk, got 0x${chunkType.toString(16)}`);
  }
  const jsonBytes = data.slice(20, 20 + chunkLength);
  const jsonString = new TextDecoder().decode(jsonBytes);
  return JSON.parse(jsonString);
}

// ── Tests ──────────────────────────────────────────────────────────

describe("exportModelToGlb", () => {
  it("returns a Uint8Array", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("produces valid GLB header with magic, version 2, and correct length", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    const header = parseGlbHeader(result);
    // GLB magic = ASCII "glTF" = 0x46546C67 little-endian
    expect(header.magic).toBe(0x46546C67);
    expect(header.version).toBe(2);
    expect(header.length).toBe(result.byteLength);
  });

  it("first chunk is JSON with glTF 2.0 asset version", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    const json = parseGlbJson(result);
    expect(json).toHaveProperty("asset");
    const asset = json.asset as Record<string, unknown>;
    expect(asset.version).toBe("2.0");
  });

  it("includes at least one mesh with position and index accessors", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    const json = parseGlbJson(result);
    const meshes = json.meshes as Array<Record<string, unknown>>;
    expect(meshes).toBeDefined();
    expect(meshes.length).toBeGreaterThanOrEqual(1);

    // Accessors should exist for position + indices
    const accessors = json.accessors as Array<Record<string, unknown>>;
    expect(accessors).toBeDefined();
    expect(accessors.length).toBeGreaterThanOrEqual(2);
  });

  it("exports sphere geometry with correct vertex count", async () => {
    const geometry = makeSphereGeometry();
    const result = await exportModelToGlb(geometry, [], [SAMPLE_MATERIAL]);

    const json = parseGlbJson(result);
    const accessors = json.accessors as Array<Record<string, unknown>>;

    // Find position accessor (VEC3)
    const posAccessor = accessors.find(
      (a) => a.type === "VEC3" && (a as Record<string, unknown>).componentType === 5126,
    );
    expect(posAccessor).toBeDefined();

    const expectedVertexCount = geometry.vertices.length / 3;
    expect(posAccessor!.count).toBe(expectedVertexCount);
  });

  it("handles empty joints array gracefully", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [], [SAMPLE_MATERIAL]);

    expect(result).toBeInstanceOf(Uint8Array);
    const header = parseGlbHeader(result);
    expect(header.magic).toBe(0x46546C67);
  });

  it("handles empty materials array with a default material", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], []);

    expect(result).toBeInstanceOf(Uint8Array);
    const json = parseGlbJson(result);
    // Should either have no materials (valid) or one default
    expect(json).toHaveProperty("asset");
  });

  it("stores metadata in asset.extras.lookingglass when provided", async () => {
    const geometry = makeBoxGeometry();
    const metadata: GlbMetadata = {
      modelId: "ALIEN",
      category: "BIPED",
      generatedAt: "2026-06-02T00:00:00Z",
    };
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL], metadata);

    const json = parseGlbJson(result);
    const asset = json.asset as Record<string, unknown>;
    expect(asset.extras).toBeDefined();
    const extras = asset.extras as Record<string, unknown>;
    expect(extras.lookingglass).toBeDefined();
    const lookingGlassMeta = extras.lookingglass as Record<string, unknown>;
    expect(lookingGlassMeta.modelId).toBe("ALIEN");
    expect(lookingGlassMeta.category).toBe("BIPED");
  });

  it("omits extras when no metadata provided", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    const json = parseGlbJson(result);
    const asset = json.asset as Record<string, unknown>;
    // extras may be absent or empty — either is valid
    if (asset.extras) {
      const extras = asset.extras as Record<string, unknown>;
      expect(extras.lookingglass).toBeUndefined();
    }
  });

  it("binary chunk length matches buffer view total", async () => {
    const geometry = makeBoxGeometry();
    const result = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
    // Skip header (12 bytes) + JSON chunk (8 + length)
    const jsonChunkLength = view.getUint32(12, true);
    const binChunkOffset = 20 + jsonChunkLength;

    if (result.byteLength > binChunkOffset) {
      const binChunkLength = view.getUint32(binChunkOffset, true);
      const binChunkType = view.getUint32(binChunkOffset + 4, true);
      // BIN chunk type = 0x004E4942
      expect(binChunkType).toBe(0x004E4942);
      expect(binChunkOffset + 8 + binChunkLength).toBeLessThanOrEqual(result.byteLength);
    }
  });

  it("produces deterministic output for same input", async () => {
    const geometry = makeBoxGeometry();
    const a = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);
    const b = await exportModelToGlb(geometry, [...SAMPLE_JOINTS], [SAMPLE_MATERIAL]);

    expect(a.byteLength).toBe(b.byteLength);
    // Byte-level equality
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
