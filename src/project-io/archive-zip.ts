import JSZip from "jszip";
import { assertNoDuplicateZipEntries } from "../zip-entry-validation.js";
import {
  A3PArchiveLimitError,
  type A3PArchiveReadBudget,
  assertA3PArchiveBytes,
  createA3PArchiveReadBudget,
  normalizeA3PParseLimits,
  readA3PZipObjectBytes,
  type A3PParseOptions,
} from "../a3p-parser/limits.js";
import { assertSafeWritablePath, validateArchivePath } from "./path-security.js";
import { ProjectIoError } from "./types.js";

export const MAX_EXTRACT_SIZE = 256 * 1024 * 1024;

export interface SafeZipEntry {
  path: string;
  entry: JSZip.JSZipObject;
  budget: A3PArchiveReadBudget;
}

const ZIP_READ_BUDGETS = new WeakMap<JSZip, A3PArchiveReadBudget>();

export async function loadProjectZip(
  data: ArrayBuffer | Uint8Array,
  options: A3PParseOptions = {},
): Promise<JSZip> {
  const limits = normalizeA3PParseLimits(options);
  assertA3PArchiveBytes(data, limits);

  try {
    assertNoDuplicateZipEntries(data);
    const zip = await JSZip.loadAsync(data);
    ZIP_READ_BUDGETS.set(zip, createA3PArchiveReadBudget(zip, limits));
    return zip;
  } catch (error) {
    if (error instanceof A3PArchiveLimitError) {
      throw error;
    }
    throw new ProjectIoError(
      "corrupted-archive",
      "Invalid or truncated .a3p archive.",
      error,
    );
  }
}

export function listSafeZipEntries(zip: JSZip): SafeZipEntry[] {
  const entries: SafeZipEntry[] = [];
  const budget = getZipReadBudget(zip);
  for (const [archivePath, entry] of Object.entries(zip.files)) {
    validateLoadedZipEntry(entry);
    validateArchivePath(archivePath);
    if (!entry.dir) {
      entries.push({ path: archivePath, entry, budget });
    }
  }
  return entries;
}

export async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const match = findSafeZipEntry(zip, path);
  if (!match) {
    return null;
  }

  try {
    const bytes = await readA3PZipObjectBytes(match.entry, match.path, match.budget);
    return new TextDecoder("utf-8").decode(bytes);
  } catch (error) {
    if (error instanceof A3PArchiveLimitError) {
      throw error;
    }
    throw new ProjectIoError(
      "corrupted-archive",
      `Failed to read ${match.path} from .a3p archive.`,
      error,
    );
  }
}

export async function readZipBytes(zip: JSZip, path: string): Promise<Uint8Array | null> {
  const match = findSafeZipEntry(zip, path);
  if (!match) {
    return null;
  }

  try {
    return await readA3PZipObjectBytes(match.entry, match.path, match.budget);
  } catch (error) {
    if (error instanceof A3PArchiveLimitError) {
      throw error;
    }
    throw new ProjectIoError(
      "corrupted-archive",
      `Failed to read ${match.path} from .a3p archive.`,
      error,
    );
  }
}

export function writeZipBytes(zip: JSZip, path: string, bytes: Uint8Array): void {
  zip.file(assertSafeWritablePath(path), bytes);
}

function findSafeZipEntry(zip: JSZip, path: string): SafeZipEntry | null {
  const safePath = validateArchivePath(path);
  const entry = zip.file(safePath);
  if (!entry) {
    return null;
  }
  validateLoadedZipEntry(entry);
  return { path: safePath, entry, budget: getZipReadBudget(zip) };
}

function validateLoadedZipEntry(entry: JSZip.JSZipObject): void {
  if (entry.unsafeOriginalName !== undefined) {
    validateArchivePath(entry.unsafeOriginalName);
  }
}

export function assertWithinExtractedSizeLimit(
  initialSize: number,
  entries: Array<{ path: string; size: number }>,
  maxExtractSize = MAX_EXTRACT_SIZE,
): number {
  let totalSize = initialSize;
  for (const entry of entries) {
    totalSize = addExtractedEntrySize(totalSize, entry, maxExtractSize);
  }
  return totalSize;
}

export function addExtractedEntrySize(
  currentSize: number,
  entry: { path: string; size: number },
  maxExtractSize = MAX_EXTRACT_SIZE,
): number {
  const totalSize = currentSize + entry.size;
  if (totalSize > maxExtractSize) {
    throw new ProjectIoError(
      "zip-bomb",
      `Archive extraction exceeds ${maxExtractSize} byte limit (ZIP bomb protection).`,
    );
  }
  return totalSize;
}

function getZipReadBudget(zip: JSZip): A3PArchiveReadBudget {
  const existing = ZIP_READ_BUDGETS.get(zip);
  if (existing) {
    return existing;
  }

  const budget = createA3PArchiveReadBudget(zip, normalizeA3PParseLimits());
  ZIP_READ_BUDGETS.set(zip, budget);
  return budget;
}
