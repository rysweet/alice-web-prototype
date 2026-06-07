import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ProjectIoError } from "../project-io.js";
import { MAX_EXTRACT_SIZE, listSafeZipEntries } from "./archive-zip.js";
import {
  SPECIAL_PROJECT_IO_PATHS,
  extractProjectResources,
  isProjectIoSpecialPath,
  writeProjectResources,
} from "./resources.js";

function expectUnsafe(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectIoError);
    expect((error as ProjectIoError).code).toBe("unsafe-path");
    return;
  }
  throw new Error("Expected unsafe resource path rejection");
}

describe("project-io/resources", () => {
  it("centralizes special Project IO paths", () => {
    expect(SPECIAL_PROJECT_IO_PATHS.has("__original_xml__")).toBe(true);
    expect(isProjectIoSpecialPath("programType.xml")).toBe(true);
    expect(isProjectIoSpecialPath("program.xml")).toBe(true);
    expect(isProjectIoSpecialPath("manifest.json")).toBe(true);
    expect(isProjectIoSpecialPath("thumbnail.png")).toBe(true);
    expect(isProjectIoSpecialPath("version.txt")).toBe(true);
    expect(isProjectIoSpecialPath("resources/program.xml")).toBe(false);
  });

  it("extracts only non-special resource entries and classifies them", async () => {
    const zip = new JSZip();
    zip.file("programType.xml", "<node />");
    zip.file("manifest.json", "{}");
    zip.file("thumbnail.png", new Uint8Array([0x89]));
    zip.file("version.txt", "3.10.0.0");
    zip.file("resources/models/bunny.a3r", new Uint8Array([1, 2, 3]));
    zip.file("resources/textures/fur.png", new Uint8Array([4, 5]));
    zip.file("resources/audio/hop.wav", new Uint8Array([6]));
    zip.file("resources/notes.txt", new Uint8Array([7, 8, 9, 10]));

    const resources = await extractProjectResources(listSafeZipEntries(zip), 0);

    expect(resources).toEqual(expect.arrayContaining([
      { path: "resources/models/bunny.a3r", kind: "model", bytes: new Uint8Array([1, 2, 3]) },
      { path: "resources/textures/fur.png", kind: "image", bytes: new Uint8Array([4, 5]) },
      { path: "resources/audio/hop.wav", kind: "audio", bytes: new Uint8Array([6]) },
      { path: "resources/notes.txt", kind: "other", bytes: new Uint8Array([7, 8, 9, 10]) },
    ]));
    expect(resources.map((resource) => resource.path)).not.toContain("manifest.json");
    expect(resources.map((resource) => resource.path)).not.toContain("thumbnail.png");
  });

  it("writes resources while filtering internal Project IO entries", () => {
    const zip = new JSZip();
    writeProjectResources(zip, new Map([
      ["__original_xml__", new Uint8Array([1])],
      ["programType.xml", new Uint8Array([2])],
      ["manifest.json", new Uint8Array([3])],
      ["thumbnail.png", new Uint8Array([4])],
      ["version.txt", new Uint8Array([5])],
      ["resources/data/config.json", new Uint8Array([6])],
    ]));

    expect(zip.file("__original_xml__")).toBeNull();
    expect(zip.file("programType.xml")).toBeNull();
    expect(zip.file("manifest.json")).toBeNull();
    expect(zip.file("thumbnail.png")).toBeNull();
    expect(zip.file("version.txt")).toBeNull();
    expect(zip.file("resources/data/config.json")).not.toBeNull();
  });

  it("rejects unsafe resource paths before adding them to ZIP output", () => {
    expectUnsafe(() => writeProjectResources(new JSZip(), new Map([
      ["resources/../../evil.txt", new Uint8Array([0])],
    ])));
  });

  it("enforces extraction limits while reading resources", async () => {
    const zip = new JSZip();
    zip.file("resources/too-large.bin", new Uint8Array([1]));

    await expect(extractProjectResources(listSafeZipEntries(zip), MAX_EXTRACT_SIZE)).rejects.toMatchObject({
      code: "zip-bomb",
    });
  });
});
