import JSZip from "jszip";
import {
  A3PArchiveLimitError,
  readA3PZipObjectBytes,
} from "../a3p-parser/limits.js";
import { classifyProjectResource } from "../project-migration.js";
import {
  addExtractedEntrySize,
  MAX_EXTRACT_SIZE,
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
  maxExtractSize = entries[0]?.budget.limits.maxTotalUncompressedBytes ?? MAX_EXTRACT_SIZE,
): Promise<ProjectResourceRecord[]> {
  const resources: ProjectResourceRecord[] = [];
  let totalSize = addExtractedEntrySize(0, { path: "__initial__", size: initialSize }, maxExtractSize);

  for (const { path, entry, budget } of entries) {
    if (isProjectIoSpecialPath(path)) {
      continue;
    }

    let bytes: Uint8Array;
    try {
      bytes = await readA3PZipObjectBytes(entry, path, budget);
    } catch (error) {
      if (error instanceof A3PArchiveLimitError) {
        throw error;
      }
      throw new ProjectIoError(
        "corrupted-archive",
        `Failed to extract resource "${path}" from .a3p archive.`,
        error,
      );
    }
    totalSize = addExtractedEntrySize(totalSize, { path, size: bytes.length }, maxExtractSize);
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
