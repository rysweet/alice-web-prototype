import { describe, expect, it } from "vitest";
import { createImportedProjectAsset } from "../src/imported-project-assets.js";

const GLB_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("imported project asset path security closure", () => {
  it.each([
    ["model", "moon%2Frover.glb", GLB_BYTES],
    ["model", "%2e%2e%2fmoon-rover.glb", GLB_BYTES],
    ["model", "/tmp/moon-rover.glb", GLB_BYTES],
    ["model", "C:moon-rover.glb", GLB_BYTES],
    ["texture", "checker%5Cboard.png", PNG_BYTES],
    ["texture", "%2E%2E%5Cchecker.png", PNG_BYTES],
    ["texture", "../checker.png", PNG_BYTES],
    ["texture", "C:\\checker.png", PNG_BYTES],
  ] as const)(
    "rejects unsafe traversal, absolute, or encoded path sequences before creating %s resources: %s",
    (kind, fileName, bytes) => {
      expect(() =>
        createImportedProjectAsset({
          kind,
          fileName,
          bytes,
        }),
      ).toThrow(/encoded|separator|traversal|path/i);
    },
  );

  it("keeps accepted imported asset metadata scoped to project-owned archive resources", () => {
    const model = createImportedProjectAsset({
      kind: "model",
      fileName: "Moon Rover.GLB",
      displayName: "Moon Rover",
      bytes: GLB_BYTES,
    });
    const texture = createImportedProjectAsset({
      kind: "texture",
      fileName: "Checker Board.PNG",
      displayName: "Checker Board",
      bytes: PNG_BYTES,
    });

    expect([model, texture]).toEqual([
      expect.objectContaining({
        projectResourceId: "project/models/moon-rover.glb",
        archivePath: "resources/models/moon-rover.glb",
        asset: expect.objectContaining({
          id: "project/models/moon-rover.glb",
          resourcePath: "resources/models/moon-rover.glb",
          contentType: "model/gltf-binary",
          byteLength: GLB_BYTES.byteLength,
        }),
      }),
      expect.objectContaining({
        projectResourceId: "project/textures/checker-board.png",
        archivePath: "resources/textures/checker-board.png",
        asset: expect.objectContaining({
          id: "project/textures/checker-board.png",
          resourcePath: "resources/textures/checker-board.png",
          contentType: "image/png",
          byteLength: PNG_BYTES.byteLength,
        }),
      }),
    ]);
  });
});
