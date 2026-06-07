import JSZip from "jszip";
import { assertSafeWritablePath, validateArchivePath } from "./path-security.js";
import { ProjectIoError } from "./types.js";

export const MAX_EXTRACT_SIZE = 256 * 1024 * 1024;

export interface SafeZipEntry {
  path: string;
  entry: JSZip.JSZipObject;
}

export async function loadProjectZip(data: ArrayBuffer | Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(data);
  } catch (error) {
    throw new ProjectIoError(
      "corrupted-archive",
      "Invalid or truncated .a3p archive.",
      error,
    );
  }
}

export function listSafeZipEntries(zip: JSZip): SafeZipEntry[] {
  const entries: SafeZipEntry[] = [];
  for (const [archivePath, entry] of Object.entries(zip.files)) {
    validateArchivePath(archivePath);
    if (!entry.dir) {
      entries.push({ path: archivePath, entry });
    }
  }
  return entries;
}

export async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const safePath = validateArchivePath(path);
  const entry = zip.file(safePath);
  if (!entry) {
    return null;
  }

  try {
    return await entry.async("string");
  } catch (error) {
    throw new ProjectIoError(
      "corrupted-archive",
      `Failed to read ${safePath} from .a3p archive.`,
      error,
    );
  }
}

export async function readZipBytes(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const safePath = validateArchivePath(path);
  const entry = zip.file(safePath);
  if (!entry) {
    return null;
  }

  try {
    return await entry.async("uint8array");
  } catch (error) {
    throw new ProjectIoError(
      "corrupted-archive",
      `Failed to read ${safePath} from .a3p archive.`,
      error,
    );
  }
}

export function writeZipBytes(zip: JSZip, path: string, bytes: Uint8Array): void {
  zip.file(assertSafeWritablePath(path), bytes);
}

export function assertWithinExtractedSizeLimit(
  initialSize: number,
  entries: Array<{ path: string; size: number }>,
): void {
  let totalSize = initialSize;
  for (const entry of entries) {
    totalSize += entry.size;
    if (totalSize > MAX_EXTRACT_SIZE) {
      throw new ProjectIoError(
        "zip-bomb",
        `Archive extraction exceeds ${MAX_EXTRACT_SIZE} byte limit (ZIP bomb protection).`,
      );
    }
  }
}
