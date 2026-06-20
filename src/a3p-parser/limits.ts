import type JSZip from "jszip";

const MIB = 1024 * 1024;

export interface A3PParseLimits {
  maxArchiveBytes: number;
  maxEntries: number;
  maxEntryUncompressedBytes: number;
  maxTotalUncompressedBytes: number;
  maxXmlTextBytes: number;
}

export interface A3PParseOptions {
  limits?: Partial<A3PParseLimits>;
}

export const DEFAULT_A3P_PARSE_LIMITS: A3PParseLimits = Object.freeze({
  maxArchiveBytes: 256 * MIB,
  maxEntries: 4096,
  maxEntryUncompressedBytes: 128 * MIB,
  maxTotalUncompressedBytes: 256 * MIB,
  maxXmlTextBytes: 32 * MIB,
});

export type A3PArchiveLimitKind =
  | "archive-bytes"
  | "entry-count"
  | "entry-uncompressed-bytes"
  | "total-uncompressed-bytes"
  | "xml-text-bytes"
  | "invalid-limit";

export class A3PArchiveLimitError extends Error {
  readonly kind: A3PArchiveLimitKind;

  constructor(kind: A3PArchiveLimitKind, message: string) {
    super(message);
    this.name = "A3PArchiveLimitError";
    this.kind = kind;
  }
}

export interface A3PArchiveReadBudget {
  readonly limits: A3PParseLimits;
  readonly countedEntrySizes: Map<string, number>;
  totalUncompressedBytes: number;
}

export interface A3PZipEntryReadOptions {
  maxBytes?: number;
  createMaxBytesError?: (path: string, size: number, maxBytes: number) => Error;
}

export function normalizeA3PParseLimits(options: A3PParseOptions = {}): A3PParseLimits {
  const limits = {
    ...DEFAULT_A3P_PARSE_LIMITS,
    ...options.limits,
  };

  return {
    maxArchiveBytes: normalizeLimit("maxArchiveBytes", limits.maxArchiveBytes),
    maxEntries: normalizeLimit("maxEntries", limits.maxEntries),
    maxEntryUncompressedBytes: normalizeLimit(
      "maxEntryUncompressedBytes",
      limits.maxEntryUncompressedBytes,
    ),
    maxTotalUncompressedBytes: normalizeLimit(
      "maxTotalUncompressedBytes",
      limits.maxTotalUncompressedBytes,
    ),
    maxXmlTextBytes: normalizeLimit("maxXmlTextBytes", limits.maxXmlTextBytes),
  };
}

export function assertA3PArchiveBytes(
  data: ArrayBuffer | Uint8Array,
  limits: A3PParseLimits,
): void {
  const archiveBytes = data.byteLength;
  if (archiveBytes > limits.maxArchiveBytes) {
    throw new A3PArchiveLimitError(
      "archive-bytes",
      `A3P archive size ${archiveBytes} bytes exceeds ${limits.maxArchiveBytes} byte limit.`,
    );
  }
}

export function createA3PArchiveReadBudget(zip: JSZip, limits: A3PParseLimits): A3PArchiveReadBudget {
  const entries = Object.entries(zip.files);
  if (entries.length > limits.maxEntries) {
    throw new A3PArchiveLimitError(
      "entry-count",
      `A3P archive entry count ${entries.length} exceeds ${limits.maxEntries} entry limit.`,
    );
  }

  const budget: A3PArchiveReadBudget = {
    limits,
    countedEntrySizes: new Map(),
    totalUncompressedBytes: 0,
  };

  for (const [path, entry] of entries) {
    if (entry.dir) continue;
    const knownSize = getKnownUncompressedSize(entry);
    if (knownSize === null) continue;
    assertEntryUncompressedSize(path, knownSize, limits);
    addUncompressedSizeToBudget(budget, path, knownSize);
  }

  return budget;
}

export async function readA3PZipEntryBytes(
  zip: JSZip,
  path: string,
  budget: A3PArchiveReadBudget,
  options: A3PZipEntryReadOptions = {},
): Promise<Uint8Array | null> {
  const entry = zip.file(path);
  if (!entry) return null;

  return readA3PZipObjectBytes(entry, path, budget, options);
}

export async function readA3PZipObjectBytes(
  entry: JSZip.JSZipObject,
  path: string,
  budget: A3PArchiveReadBudget,
  options: A3PZipEntryReadOptions = {},
): Promise<Uint8Array> {
  const knownSize = getKnownUncompressedSize(entry);
  if (knownSize !== null) {
    assertEntryUncompressedSize(path, knownSize, budget.limits);
    assertAdditionalReadLimit(path, knownSize, options);
  }

  return readZipObjectBytesBounded(entry, path, budget, options);
}

export function assertA3PXmlTextSize(
  path: string,
  size: number,
  limits: A3PParseLimits,
  unit = "bytes",
): void {
  if (size > limits.maxXmlTextBytes) {
    throw new A3PArchiveLimitError(
      "xml-text-bytes",
      `A3P XML text size for ${path} is ${size} ${unit} and exceeds ${limits.maxXmlTextBytes} byte limit.`,
    );
  }
}

function normalizeLimit(name: keyof A3PParseLimits, value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    throw new A3PArchiveLimitError(
      "invalid-limit",
      `Invalid A3P parse limit ${name}: expected a positive finite number.`,
    );
  }
  return Math.floor(value);
}

export function getKnownA3PZipEntryUncompressedSize(entry: JSZip.JSZipObject): number | null {
  return getKnownUncompressedSize(entry);
}

function getKnownUncompressedSize(entry: JSZip.JSZipObject): number | null {
  const data = (entry as { _data?: unknown })._data;
  if (!data || typeof data !== "object") return null;
  const size = (data as { uncompressedSize?: unknown }).uncompressedSize;
  return typeof size === "number" && Number.isFinite(size) ? size : null;
}

function assertEntryUncompressedSize(
  path: string,
  size: number,
  limits: A3PParseLimits,
): void {
  if (size > limits.maxEntryUncompressedBytes) {
    throw new A3PArchiveLimitError(
      "entry-uncompressed-bytes",
      `A3P entry ${path} uncompressed size ${size} bytes exceeds ${limits.maxEntryUncompressedBytes} byte limit.`,
    );
  }
}

function addUncompressedSizeToBudget(
  budget: A3PArchiveReadBudget,
  path: string,
  size: number,
): void {
  const previouslyCounted = budget.countedEntrySizes.get(path) ?? 0;
  if (size <= previouslyCounted) return;

  budget.totalUncompressedBytes += size - previouslyCounted;
  budget.countedEntrySizes.set(path, size);

  if (budget.totalUncompressedBytes > budget.limits.maxTotalUncompressedBytes) {
    throw new A3PArchiveLimitError(
      "total-uncompressed-bytes",
      `A3P archive total uncompressed size ${budget.totalUncompressedBytes} bytes exceeds ${budget.limits.maxTotalUncompressedBytes} byte limit.`,
    );
  }
}

function assertAdditionalReadLimit(
  path: string,
  size: number,
  options: A3PZipEntryReadOptions,
): void {
  if (options.maxBytes !== undefined && size > options.maxBytes) {
    throw createAdditionalReadLimitError(path, size, options);
  }
}

function createAdditionalReadLimitError(
  path: string,
  size: number,
  options: A3PZipEntryReadOptions,
): Error {
  const maxBytes = options.maxBytes ?? 0;
  return options.createMaxBytesError?.(path, size, maxBytes)
    ?? new A3PArchiveLimitError(
      "entry-uncompressed-bytes",
      `A3P entry ${path} read size ${size} bytes exceeds ${maxBytes} byte limit.`,
    );
}

function readZipObjectBytesBounded(
  entry: JSZip.JSZipObject,
  path: string,
  budget: A3PArchiveReadBudget,
  options: A3PZipEntryReadOptions,
): Promise<Uint8Array> {
  const stream = getInternalStream(entry);
  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  return new Promise((resolve, reject) => {
    let settled = false;

    const fail = (error: unknown): void => {
      if (settled) return;
      settled = true;
      stream.pause();
      reject(error);
    };

    stream.on("data", (chunk) => {
      if (settled) return;
      try {
        totalSize += chunk.length;
        assertEntryUncompressedSize(path, totalSize, budget.limits);
        assertAdditionalReadLimit(path, totalSize, options);
        addUncompressedSizeToBudget(budget, path, totalSize);
        chunks.push(chunk);
      } catch (error) {
        fail(error);
      }
    });
    stream.on("error", fail);
    stream.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(concatenateChunks(chunks, totalSize));
    });
    stream.resume();
  });
}

interface InternalZipStream {
  on(event: "data", callback: (chunk: Uint8Array) => void): InternalZipStream;
  on(event: "error", callback: (error: unknown) => void): InternalZipStream;
  on(event: "end", callback: () => void): InternalZipStream;
  pause(): InternalZipStream;
  resume(): InternalZipStream;
}

function getInternalStream(entry: JSZip.JSZipObject): InternalZipStream {
  const internalStream = (entry as { internalStream?: (type: "uint8array") => unknown }).internalStream;
  if (!internalStream) {
    throw new Error("JSZip entry streaming is unavailable; bounded A3P extraction cannot continue.");
  }
  return internalStream.call(entry, "uint8array") as InternalZipStream;
}

function concatenateChunks(chunks: Uint8Array[], totalSize: number): Uint8Array {
  const output = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
