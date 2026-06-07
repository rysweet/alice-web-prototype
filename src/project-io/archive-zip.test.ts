import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ProjectIoError } from "../project-io.js";
import {
  MAX_EXTRACT_SIZE,
  assertWithinExtractedSizeLimit,
  listSafeZipEntries,
  loadProjectZip,
  readZipBytes,
  readZipText,
  writeZipBytes,
} from "./archive-zip.js";

async function createZip(entries: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, value] of Object.entries(entries)) {
    zip.file(path, value);
  }
  return zip.generateAsync({ type: "uint8array" });
}

async function expectProjectIoError(
  action: () => Promise<unknown> | unknown,
  code: ProjectIoError["code"],
): Promise<void> {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectIoError);
    expect((error as ProjectIoError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ProjectIoError(${code})`);
}

describe("project-io/archive-zip", () => {
  it("wraps invalid ZIP input as a corrupted archive", async () => {
    await expectProjectIoError(
      () => loadProjectZip(new Uint8Array([0, 1, 2, 3])),
      "corrupted-archive",
    );
  });

  it("loads valid ZIP input and enumerates validated archive entries", async () => {
    const zip = await loadProjectZip(await createZip({
      "programType.xml": "<node />",
      "resources/data/config.json": new Uint8Array([1, 2, 3]),
    }));

    expect(listSafeZipEntries(zip).map((entry) => entry.path)).toEqual([
      "programType.xml",
      "resources/data/config.json",
    ]);
  });

  it("rejects unsafe archive entries during safe enumeration", async () => {
    for (const path of [
      "../programType.xml",
      "./programType.xml",
      "resources/../evil.png",
      "resources//evil.png",
      "resources\\evil.png",
    ]) {
      const zip = await JSZip.loadAsync(await createZip({
        [path]: "<node />",
      }));

      await expectProjectIoError(() => listSafeZipEntries(zip), "unsafe-path");
    }
  });

  it("reads and writes ZIP text and bytes through validated paths", async () => {
    const zip = new JSZip();
    writeZipBytes(zip, "resources/data/config.bin", new Uint8Array([1, 2, 3]));
    zip.file("manifest.json", '{"projectName":"Demo"}');

    expect(await readZipBytes(zip, "resources/data/config.bin")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await readZipText(zip, "manifest.json")).toBe('{"projectName":"Demo"}');
  });

  it("keeps ZIP bomb size checks centralized", async () => {
    await expectProjectIoError(
      () => assertWithinExtractedSizeLimit(1, [
        { path: "resources/huge.bin", size: MAX_EXTRACT_SIZE },
      ]),
      "zip-bomb",
    );
  });
});
