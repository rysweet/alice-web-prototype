import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  readProject,
  writeProject,
  type AliceProjectArchive,
} from "../src/project-io";
import type { AliceObject, AliceProject } from "../src/a3p-parser";

interface ImportedProjectAsset {
  id: string;
  kind: "model" | "texture";
  name: string;
  fileName: string;
  resourcePath: string;
  contentType: string;
  byteLength: number;
}

interface MaterialBinding {
  target: "surface";
  textureResourceId: string;
}

type ImportedAliceObject = AliceObject & {
  modelResourceId?: string;
  materialBindings?: MaterialBinding[];
};

type ImportedAliceProject = Omit<AliceProject, "sceneObjects"> & {
  sceneObjects: ImportedAliceObject[];
  importedAssets: ImportedProjectAsset[];
};

const MODEL_BYTES = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
const TEXTURE_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function createImportedAssetProject(): ImportedAliceProject {
  return {
    version: "3.10.0.0",
    projectName: "AssetWorkflow",
    sceneObjects: [
      {
        name: "moonRover",
        typeName: "SModel",
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
        modelResourceId: "project/models/moon-rover.glb",
      },
      {
        name: "box",
        typeName: "SBox",
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
        materialBindings: [
          {
            target: "surface",
            textureResourceId: "project/textures/checker.png",
          },
        ],
      },
    ],
    methods: [],
    types: [],
    importedAssets: [
      {
        id: "project/models/moon-rover.glb",
        kind: "model",
        name: "Moon Rover",
        fileName: "moon-rover.glb",
        resourcePath: "resources/models/moon-rover.glb",
        contentType: "model/gltf-binary",
        byteLength: MODEL_BYTES.byteLength,
      },
      {
        id: "project/textures/checker.png",
        kind: "texture",
        name: "Checker",
        fileName: "checker.png",
        resourcePath: "resources/textures/checker.png",
        contentType: "image/png",
        byteLength: TEXTURE_BYTES.byteLength,
      },
    ],
  };
}

function createArchive(project = createImportedAssetProject()): AliceProjectArchive {
  return {
    project: project as AliceProject,
    manifest: null,
    resources: new Map([
      ["resources/models/moon-rover.glb", MODEL_BYTES],
      ["resources/textures/checker.png", TEXTURE_BYTES],
    ]),
    resourceEntries: [],
    thumbnail: null,
    versionInfo: {
      originalAliceVersion: project.version,
      detectedAliceVersion: project.version,
      manifestVersion: null,
      xmlVersion: null,
      versionSource: "default",
      migrated: false,
      migrationSteps: [],
    },
  };
}

function asImportedProject(project: AliceProject): ImportedAliceProject {
  return project as ImportedAliceProject;
}

describe("Project IO imported model and texture persistence", () => {
  it("writes imported asset resources and metadata into the project archive", async () => {
    const bytes = await writeProject(createArchive(), { generateThumbnailFromScene: false });
    const zip = await JSZip.loadAsync(bytes);

    const modelEntry = zip.file("resources/models/moon-rover.glb");
    const textureEntry = zip.file("resources/textures/checker.png");
    expect(modelEntry).not.toBeNull();
    expect(textureEntry).not.toBeNull();
    expect(Array.from(await modelEntry!.async("uint8array"))).toEqual(Array.from(MODEL_BYTES));
    expect(Array.from(await textureEntry!.async("uint8array"))).toEqual(Array.from(TEXTURE_BYTES));

    const xml = await zip.file("programType.xml")!.async("string");
    expect(xml).toContain("imported-assets");
    expect(xml).toContain('id="project/models/moon-rover.glb"');
    expect(xml).toContain('resourcePath="resources/models/moon-rover.glb"');
    expect(xml).toContain('modelResourceId="project/models/moon-rover.glb"');
    expect(xml).toContain("material-bindings");
    expect(xml).toContain('textureResourceId="project/textures/checker.png"');
  });

  it("round-trips imported asset descriptors, resources, and surface bindings through readProject", async () => {
    const bytes = await writeProject(createArchive(), { generateThumbnailFromScene: false });
    const archive = await readProject(bytes);
    const project = asImportedProject(archive.project);

    expect(project.importedAssets).toEqual([
      {
        id: "project/models/moon-rover.glb",
        kind: "model",
        name: "Moon Rover",
        fileName: "moon-rover.glb",
        resourcePath: "resources/models/moon-rover.glb",
        contentType: "model/gltf-binary",
        byteLength: MODEL_BYTES.byteLength,
      },
      {
        id: "project/textures/checker.png",
        kind: "texture",
        name: "Checker",
        fileName: "checker.png",
        resourcePath: "resources/textures/checker.png",
        contentType: "image/png",
        byteLength: TEXTURE_BYTES.byteLength,
      },
    ]);
    expect(Array.from(archive.resources.get("resources/models/moon-rover.glb") ?? []))
      .toEqual(Array.from(MODEL_BYTES));
    expect(Array.from(archive.resources.get("resources/textures/checker.png") ?? []))
      .toEqual(Array.from(TEXTURE_BYTES));
    expect(project.sceneObjects.find((object) => object.name === "moonRover")?.modelResourceId)
      .toBe("project/models/moon-rover.glb");
    expect(project.sceneObjects.find((object) => object.name === "box")?.materialBindings)
      .toEqual([
        {
          target: "surface",
          textureResourceId: "project/textures/checker.png",
        },
      ]);
  });
});
