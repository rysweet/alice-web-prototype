import JSZip from "jszip";
import { classifyProjectResource } from "../project-migration.js";
import {
  addExtractedEntrySize,
  type SafeZipEntry,
  writeZipBytes,
} from "./archive-zip.js";
import {
  ProjectIoError,
  SPECIAL_PROJECT_IO_PATHS,
  type ProjectResourceRecord,
} from "./types.js";

export { SPECIAL_PROJECT_IO_PATHS };

export function isProjectIoSpecialPath(path: string): boolean {
  return SPECIAL_PROJECT_IO_PATHS.has(path);
}

export async function extractProjectResources(
  entries: SafeZipEntry[],
  initialSize: number,
): Promise<ProjectResourceRecord[]> {
  const resources: ProjectResourceRecord[] = [];
  let totalSize = initialSize;

  for (const { path, entry } of entries) {
    if (isProjectIoSpecialPath(path)) {
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = await entry.async("uint8array");
    } catch (error) {
      throw new ProjectIoError(
        "corrupted-archive",
        `Failed to extract resource "${path}" from .a3p archive.`,
        error,
      );
    }
    totalSize = addExtractedEntrySize(totalSize, { path, size: bytes.length });
    resources.push({
      path,
      bytes,
      kind: classifyProjectResource(path),
    });
  }

  return resources;
}

export function writeProjectResources(zip: JSZip, resources: Map<string, Uint8Array>): void {
  const orderedResources = [...resources.entries()]
    .filter(([resourcePath]) => !isProjectIoSpecialPath(resourcePath))
    .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath));

  for (const [resourcePath, bytes] of orderedResources) {
    writeZipBytes(zip, resourcePath, bytes);
  }
}
