import { describe, expect, it } from "vitest";

type ImportedAssetKind = "model" | "texture";

interface ImportedProjectAsset {
  id: string;
  kind: ImportedAssetKind;
  name: string;
  fileName: string;
  resourcePath: string;
  contentType: string;
  byteLength: number;
}

interface ImportedAssetUpload {
  kind: ImportedAssetKind;
  fileName: string;
  displayName?: string;
  bytes: Uint8Array;
}

interface ImportedAssetCreation {
  asset: ImportedProjectAsset;
  projectResourceId: string;
  archivePath: string;
  resourceBytes: Uint8Array;
}

interface MaterialBinding {
  target: "surface";
  textureResourceId: string;
}

interface SceneObjectLike {
  name: string;
  typeName: string;
  resourceType: string | null;
  materialBindings?: MaterialBinding[];
}

interface ImportedProjectAssetsModule {
  createImportedProjectAsset(
    upload: ImportedAssetUpload,
    existingAssets?: ImportedProjectAsset[],
    existingArchivePaths?: Iterable<string>,
  ): ImportedAssetCreation;
  projectResourceIdToArchivePath(projectResourceId: string): string;
  applySurfaceTextureBinding<T extends SceneObjectLike>(
    object: T,
    textureResourceId: string,
  ): T & { materialBindings: MaterialBinding[] };
}

async function loadImportedProjectAssetsModule(): Promise<ImportedProjectAssetsModule> {
  const modulePath = "../src/imported-project-assets";
  return await import(modulePath) as unknown as ImportedProjectAssetsModule;
}

const GLB_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("imported project asset records", () => {
  it("normalizes model filenames into project IDs, archive paths, content types, and descriptors", async () => {
    const { createImportedProjectAsset } = await loadImportedProjectAssetsModule();

    const result = createImportedProjectAsset({
      kind: "model",
      fileName: "Moon Rover.GLB",
      displayName: "Moon Rover",
      bytes: GLB_BYTES,
    });

    expect(result.projectResourceId).toBe("project/models/moon-rover.glb");
    expect(result.archivePath).toBe("resources/models/moon-rover.glb");
    expect(result.resourceBytes).toEqual(GLB_BYTES);
    expect(result.asset).toEqual({
      id: "project/models/moon-rover.glb",
      kind: "model",
      name: "Moon Rover",
      fileName: "moon-rover.glb",
      resourcePath: "resources/models/moon-rover.glb",
      contentType: "model/gltf-binary",
      byteLength: GLB_BYTES.byteLength,
    });
  });

  it("deduplicates texture asset IDs after filename sanitization", async () => {
    const { createImportedProjectAsset } = await loadImportedProjectAssetsModule();
    const existingAssets: ImportedProjectAsset[] = [
      {
        id: "project/textures/checker.png",
        kind: "texture",
        name: "Checker",
        fileName: "checker.png",
        resourcePath: "resources/textures/checker.png",
        contentType: "image/png",
        byteLength: PNG_BYTES.byteLength,
      },
    ];

    const result = createImportedProjectAsset({
      kind: "texture",
      fileName: "Checker.PNG",
      displayName: "Checker",
      bytes: PNG_BYTES,
    }, existingAssets);

    expect(result.asset).toEqual({
      id: "project/textures/checker-2.png",
      kind: "texture",
      name: "Checker",
      fileName: "checker-2.png",
      resourcePath: "resources/textures/checker-2.png",
      contentType: "image/png",
      byteLength: PNG_BYTES.byteLength,
    });
  });

  it("deduplicates against existing archive resources without imported asset descriptors", async () => {
    const { createImportedProjectAsset } = await loadImportedProjectAssetsModule();

    const result = createImportedProjectAsset({
      kind: "texture",
      fileName: "checker.png",
      bytes: PNG_BYTES,
    }, [], ["resources/textures/checker.png"]);

    expect(result.projectResourceId).toBe("project/textures/checker-2.png");
    expect(result.archivePath).toBe("resources/textures/checker-2.png");
    expect(result.asset.resourcePath).toBe("resources/textures/checker-2.png");
  });

  it("maps project resource IDs to archive resource paths", async () => {
    const { projectResourceIdToArchivePath } = await loadImportedProjectAssetsModule();

    expect(projectResourceIdToArchivePath("project/models/moon-rover.glb"))
      .toBe("resources/models/moon-rover.glb");
    expect(projectResourceIdToArchivePath("project/textures/checker.png"))
      .toBe("resources/textures/checker.png");
    expect(() => projectResourceIdToArchivePath("resources/models/moon-rover.glb"))
      .toThrow(/project resource/i);
    expect(() => projectResourceIdToArchivePath("project/audio/theme.wav"))
      .toThrow(/unsupported/i);
  });

  it("rejects unsafe filenames, unsupported extensions, and empty payloads", async () => {
    const { createImportedProjectAsset } = await loadImportedProjectAssetsModule();

    expect(() => createImportedProjectAsset({
      kind: "model",
      fileName: "../moon-rover.glb",
      bytes: GLB_BYTES,
    })).toThrow(/filename|path|traversal/i);
    expect(() => createImportedProjectAsset({
      kind: "texture",
      fileName: "folder/checker.png",
      bytes: PNG_BYTES,
    })).toThrow(/filename|path/i);
    expect(() => createImportedProjectAsset({
      kind: "model",
      fileName: "!!!.glb",
      bytes: GLB_BYTES,
    })).toThrow(/empty/i);
    expect(() => createImportedProjectAsset({
      kind: "texture",
      fileName: "checker.gif",
      bytes: PNG_BYTES,
    })).toThrow(/unsupported/i);
    expect(() => createImportedProjectAsset({
      kind: "model",
      fileName: "moon-rover.glb",
      bytes: new Uint8Array(),
    })).toThrow(/empty/i);
  });
});

describe("surface texture material binding", () => {
  it("adds or replaces the single surface texture binding on a scene object", async () => {
    const { applySurfaceTextureBinding } = await loadImportedProjectAssetsModule();
    const box: SceneObjectLike = {
      name: "box",
      typeName: "SBox",
      resourceType: null,
      materialBindings: [
        {
          target: "surface",
          textureResourceId: "project/textures/old-checker.png",
        },
      ],
    };

    const updated = applySurfaceTextureBinding(box, "project/textures/checker.png");

    expect(updated).toMatchObject({
      name: "box",
      typeName: "SBox",
      resourceType: null,
    });
    expect(updated.materialBindings).toEqual([
      {
        target: "surface",
        textureResourceId: "project/textures/checker.png",
      },
    ]);
  });
});
