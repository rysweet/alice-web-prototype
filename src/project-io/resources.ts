import JSZip from "jszip";
import { classifyProjectResource } from "../project-migration.js";
import { assertWithinExtractedSizeLimit, listSafeZipEntries, writeZipBytes } from "./archive-zip.js";
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
  zip: JSZip,
  initialSize: number,
): Promise<ProjectResourceRecord[]> {
  const resourceEntries = listSafeZipEntries(zip).filter(({ path }) => !isProjectIoSpecialPath(path));

  const resources = await Promise.all(
    resourceEntries.map(async ({ path, entry }) => {
      try {
        return {
          path,
          bytes: await entry.async("uint8array"),
          kind: classifyProjectResource(path),
        };
      } catch (error) {
        throw new ProjectIoError(
          "corrupted-archive",
          `Failed to extract resource "${path}" from .a3p archive.`,
          error,
        );
      }
    }),
  );

  assertWithinExtractedSizeLimit(
    initialSize,
    resources.map((resource) => ({
      path: resource.path,
      size: resource.bytes.length,
    })),
  );

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
