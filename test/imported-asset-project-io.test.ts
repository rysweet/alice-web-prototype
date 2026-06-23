import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  parseA3P,
} from "../src/a3p-parser";
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

function duplicateCentralDirectoryEntry(bytes: Uint8Array, targetName: string): Buffer {
  const buffer = Buffer.from(bytes);
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  let offset = centralDirectoryOffset;
  while (offset < centralDirectoryEnd) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("central directory entry missing");
    }
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    const recordEnd = nameEnd + extraLength + commentLength;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    if (name === targetName) {
      const duplicate = buffer.subarray(offset, recordEnd);
      const next = Buffer.concat([
        buffer.subarray(0, eocdOffset),
        duplicate,
        buffer.subarray(eocdOffset),
      ]);
      const nextEocdOffset = eocdOffset + duplicate.length;
      next.writeUInt16LE(next.readUInt16LE(nextEocdOffset + 8) + 1, nextEocdOffset + 8);
      next.writeUInt16LE(next.readUInt16LE(nextEocdOffset + 10) + 1, nextEocdOffset + 10);
      next.writeUInt32LE(next.readUInt32LE(nextEocdOffset + 12) + duplicate.length, nextEocdOffset + 12);
      return next;
    }
    offset = recordEnd;
  }
  throw new Error(`central directory entry not found: ${targetName}`);
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) !== 0x06054b50) continue;
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === buffer.length) {
      return offset;
    }
  }
  throw new Error("end of central directory not found");
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

  it.each([
    "programType.xml",
    "resources/textures/checker.png",
  ])("rejects duplicate central-directory entry %s before JSZip normalizes it", async (entryName) => {
    const archive = createArchive();
    const bytes = await writeProject(archive, { generateThumbnailFromScene: false });
    const duplicated = duplicateCentralDirectoryEntry(bytes, entryName);

    await expect(readProject(duplicated)).rejects.toThrow(/corrupted|Invalid or truncated/i);
  });

  it("rejects duplicate manifest central-directory entries before JSZip normalizes them", async () => {
    const archive = createArchive();
    archive.manifest = { projectName: "AssetWorkflow" };
    const bytes = await writeProject(archive, { generateThumbnailFromScene: false });
    const duplicated = duplicateCentralDirectoryEntry(bytes, "manifest.json");

    await expect(readProject(duplicated)).rejects.toThrow(/corrupted|Invalid or truncated/i);
  });

  it("rejects duplicate project XML entries in parseA3P before JSZip normalizes them", async () => {
    const archive = createArchive();
    const bytes = await writeProject(archive, { generateThumbnailFromScene: false });
    const duplicated = duplicateCentralDirectoryEntry(bytes, "programType.xml");

    await expect(parseA3P(duplicated)).rejects.toThrow(/duplicate entry|central directory|corrupted ZIP/i);
  });
});
