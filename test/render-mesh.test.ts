import { describe, expect, it } from "vitest";
import {
  computeBoundingBox,
  computeVertexNormals,
  createBoxMesh,
  createCylinderMesh,
  createSphereMesh,
  MeshBuilder,
  type MeshVector3,
} from "../src/render-mesh";

function expectVectorClose(actual: MeshVector3, expected: MeshVector3, precision = 6): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

describe("render mesh", () => {
  it("builds indexed meshes and derives normals from vertex positions", () => {
    const builder = new MeshBuilder();
    const a = builder.addVertex({ x: 0, y: 0, z: 0 }, null, { u: 0, v: 0 });
    const b = builder.addVertex({ x: 1, y: 0, z: 0 }, null, { u: 1, v: 0 });
    const c = builder.addVertex({ x: 1, y: 1, z: 0 }, null, { u: 1, v: 1 });
    const d = builder.addVertex({ x: 0, y: 1, z: 0 }, null, { u: 0, v: 1 });
    builder.addQuad(a, b, c, d);

    const mesh = builder.build();

    expect(mesh.indices).toEqual([0, 1, 2, 0, 2, 3]);
    expect(mesh.vertices).toHaveLength(4);
    expect(mesh.normals).toHaveLength(4);
    mesh.normals.forEach((normal) => expectVectorClose(normal, { x: 0, y: 0, z: 1 }));
    expectVectorClose(mesh.bounds.min, { x: 0, y: 0, z: 0 });
    expectVectorClose(mesh.bounds.max, { x: 1, y: 1, z: 0 });
  });

  it("computes normals and bounds directly from vertex arrays", () => {
    const vertices = [
      { x: -1, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 2, z: 0 },
    ];

    const normals = computeVertexNormals(vertices, [0, 1, 2]);
    const bounds = computeBoundingBox(vertices);

    normals.forEach((normal) => expectVectorClose(normal, { x: 0, y: 0, z: 1 }));
    expectVectorClose(bounds.min, { x: -1, y: 0, z: 0 });
    expectVectorClose(bounds.max, { x: 1, y: 2, z: 0 });
    expectVectorClose(bounds.size, { x: 2, y: 2, z: 0 });
    expectVectorClose(bounds.center, { x: 0, y: 1, z: 0 });
  });

  it("creates box meshes with per-face geometry", () => {
    const mesh = createBoxMesh({ width: 2, height: 4, depth: 6 });

    expect(mesh.vertices).toHaveLength(24);
    expect(mesh.normals).toHaveLength(24);
    expect(mesh.indices).toHaveLength(36);
    expect(mesh.uvs).toHaveLength(24);
    expectVectorClose(mesh.bounds.min, { x: -1, y: -2, z: -3 });
    expectVectorClose(mesh.bounds.max, { x: 1, y: 2, z: 3 });
    expectVectorClose(mesh.normals[0]!, { x: 0, y: 0, z: 1 });
  });

  it("creates sphere meshes from latitude and longitude segments", () => {
    const mesh = createSphereMesh({ radius: 2, widthSegments: 8, heightSegments: 4 });

    expect(mesh.vertices).toHaveLength((8 + 1) * (4 + 1));
    expect(mesh.indices).toHaveLength(8 * (4 - 1) * 6);
    expectVectorClose(mesh.bounds.min, { x: -2, y: -2, z: -2 });
    expectVectorClose(mesh.bounds.max, { x: 2, y: 2, z: 2 });
    mesh.normals.filter((_, index) => index % 9 === 0).forEach((normal) => {
      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 6);
    });
  });

  it("creates closed cylinders with caps and tapered side normals", () => {
    const mesh = createCylinderMesh({ radiusTop: 1, radiusBottom: 0.5, height: 4, radialSegments: 8 });

    expect(mesh.vertices).toHaveLength(38);
    expect(mesh.indices).toHaveLength(96);
    expectVectorClose(mesh.bounds.min, { x: -1, y: -2, z: -1 });
    expectVectorClose(mesh.bounds.max, { x: 1, y: 2, z: 1 });
    const sideNormal = mesh.normals[0]!;
    expect(Math.hypot(sideNormal.x, sideNormal.y, sideNormal.z)).toBeCloseTo(1, 6);
    expect(sideNormal.y).toBeLessThan(0);
  });
});
