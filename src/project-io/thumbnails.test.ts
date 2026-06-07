import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  generateThumbnailFromProjectScene,
  readProjectThumbnail,
  resolveThumbnailForWrite,
  writeProjectThumbnail,
} from "./thumbnails.js";
import type { AliceProjectArchive } from "../project-io.js";
import type { AliceProject } from "../a3p-parser.js";

function createProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Thumbnail Contract",
    sceneObjects: [],
    methods: [],
    types: [],
  };
}

function createArchive(project = createProject()): AliceProjectArchive {
  return {
    project,
    manifest: null,
    resources: new Map(),
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

describe("project-io/thumbnails", () => {
  it("reads thumbnail.png when present and returns null when absent", async () => {
    const emptyZip = new JSZip();
    expect(await readProjectThumbnail(emptyZip)).toBeNull();

    const zip = new JSZip();
    zip.file("thumbnail.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(await readProjectThumbnail(zip)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("writes thumbnail.png only when thumbnail bytes are available", () => {
    const zipWithoutThumbnail = new JSZip();
    writeProjectThumbnail(zipWithoutThumbnail, null);
    expect(zipWithoutThumbnail.file("thumbnail.png")).toBeNull();

    const zipWithThumbnail = new JSZip();
    writeProjectThumbnail(zipWithThumbnail, new Uint8Array([1, 2, 3]));
    expect(zipWithThumbnail.file("thumbnail.png")).not.toBeNull();
  });

  it("returns existing archive thumbnails without invoking generation", async () => {
    const archive = createArchive();
    archive.thumbnail = new Uint8Array([1, 2, 3]);

    const thumbnail = await resolveThumbnailForWrite(archive, {
      generateThumbnailFromScene: true,
      generateThumbnail: async () => {
        throw new Error("generation should not run");
      },
    });

    expect(thumbnail).toEqual(new Uint8Array([1, 2, 3]));
    expect(archive.thumbnail).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("mutates archive.thumbnail when write-time generation creates a thumbnail", async () => {
    const archive = createArchive();
    const generated = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const thumbnail = await resolveThumbnailForWrite(archive, {
      generateThumbnailFromScene: true,
      generateThumbnail: async () => generated,
    });

    expect(thumbnail).toBe(generated);
    expect(archive.thumbnail).toBe(generated);
  });

  it("does not generate thumbnails for empty scenes", async () => {
    expect(await generateThumbnailFromProjectScene(createProject())).toBeNull();
  });
});
