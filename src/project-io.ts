/**
 * Full .a3p project read/write with manifest.json, program.xml, resources, thumbnails,
 * version detection, and migration-aware parsing.
 */
import JSZip from "jszip";
import {
  DEFAULT_A3P_XML_ENTRY,
  LEGACY_A3P_XML_ENTRY,
  parseA3PFromZip,
  readA3PXmlEntry,
  type AliceProject,
} from "./a3p-parser";
import {
  classifyProjectResource,
  detectProjectVersion,
  migrateProjectXml,
  synchronizeManifestVersion,
  type ProjectResourceKind,
  type ProjectVersionInfo,
} from "./project-migration";
import { writeA3P } from "./a3p-writer";

export type ProjectIoErrorCode =
  | "corrupted-archive"
  | "invalid-manifest"
  | "missing-program-xml"
  | "unsafe-path"
  | "xml-parse"
  | "zip-bomb";

export class ProjectIoError extends Error {
  readonly code: ProjectIoErrorCode;
  override readonly cause?: unknown;

  constructor(code: ProjectIoErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ProjectIoError";
    this.code = code;
    this.cause = cause;
  }
}

export interface ProjectResourceDescriptor {
  path: string;
  kind: ProjectResourceKind;
  size: number;
}

/** Complete archive contents returned by readProject(). */
export interface AliceProjectArchive {
  project: AliceProject;
  manifest: Record<string, unknown> | null;
  resources: Map<string, Uint8Array>;
  resourceEntries: ProjectResourceDescriptor[];
  thumbnail: Uint8Array | null;
  versionInfo: ProjectVersionInfo;
}

const MAX_EXTRACT_SIZE = 256 * 1024 * 1024; // 256 MB ZIP bomb protection
const SPECIAL_ENTRIES = new Set([
  DEFAULT_A3P_XML_ENTRY,
  LEGACY_A3P_XML_ENTRY,
  "manifest.json",
  "thumbnail.png",
  "version.txt",
]);

function validatePath(p: string): void {
  if (p.includes("..") || p.startsWith("/") || p.includes("\\")) {
    throw new ProjectIoError("unsafe-path", `Unsafe archive path rejected: "${p}"`);
  }
}

function originalXmlMarker(entryName: string): string {
  return `<!-- ${entryName} -->\n`;
}

function decodeStoredOriginalXml(bytes: Uint8Array): { entryName: string; xmlText: string } {
  const stored = new TextDecoder().decode(bytes);
  const match = stored.match(/^<!--\s+([^>]+?)\s+-->\n/);
  if (!match) {
    return { entryName: DEFAULT_A3P_XML_ENTRY, xmlText: stored };
  }
  return {
    entryName: match[1].trim(),
    xmlText: stored.slice(match[0].length),
  };
}

/**
 * Read an .a3p archive and return the parsed project, manifest, resources, thumbnail,
 * detected version metadata, and classified extracted resources.
 */
export async function readProject(
  data: ArrayBuffer | Uint8Array,
): Promise<AliceProjectArchive> {
  const zip = await loadZip(data);

  for (const archivePath of Object.keys(zip.files)) {
    validatePath(archivePath);
  }

  const manifest = await readManifest(zip);
  const xmlEntry = await readXmlEntry(zip);
  const versionText = await readOptionalText(zip, "version.txt");
  const thumbnail = await readThumbnail(zip);

  const migration = migrateProjectXml(
    xmlEntry.text,
    detectProjectVersion(versionText, manifest, xmlEntry.text),
  );
  const nextManifest = synchronizeManifestVersion(manifest, migration.versionInfo);

  zip.file(xmlEntry.name, migration.xmlText);
  zip.file("version.txt", migration.versionInfo.detectedAliceVersion);

  const project = await parseProject(zip);
  project.version = migration.versionInfo.detectedAliceVersion;

  const storedXmlBytes = new TextEncoder().encode(
    originalXmlMarker(xmlEntry.name) + migration.xmlText,
  );
  const resources = new Map<string, Uint8Array>();
  resources.set("__original_xml__", storedXmlBytes);

  const resourceRecords = await extractResources(zip, storedXmlBytes.length);
  for (const record of resourceRecords) {
    resources.set(record.path, record.bytes);
  }

  return {
    project,
    manifest: nextManifest,
    resources,
    resourceEntries: resourceRecords.map(({ path, bytes, kind }) => ({
      path,
      kind,
      size: bytes.length,
    })),
    thumbnail,
    versionInfo: migration.versionInfo,
  };
}

/**
 * Write an AliceProjectArchive back to .a3p ZIP format (Uint8Array).
 * Uses migrated XML when available, but can synthesize XML for brand-new/empty projects too.
 */
export async function writeProject(
  archive: AliceProjectArchive,
): Promise<Uint8Array> {
  for (const resourcePath of archive.resources.keys()) {
    if (resourcePath === "__original_xml__") continue;
    validatePath(resourcePath);
  }

  const storedOriginalXml = archive.resources.get("__original_xml__");
  const explicitProgramTypeXml = archive.resources.get(DEFAULT_A3P_XML_ENTRY);
  const explicitLegacyXml = archive.resources.get(LEGACY_A3P_XML_ENTRY);

  let xmlEntryName = DEFAULT_A3P_XML_ENTRY;
  let baseXmlText: string | null = null;

  if (storedOriginalXml) {
    const decoded = decodeStoredOriginalXml(storedOriginalXml);
    xmlEntryName = decoded.entryName;
    baseXmlText = decoded.xmlText;
  } else if (explicitProgramTypeXml) {
    xmlEntryName = DEFAULT_A3P_XML_ENTRY;
    baseXmlText = new TextDecoder().decode(explicitProgramTypeXml);
  } else if (explicitLegacyXml) {
    xmlEntryName = LEGACY_A3P_XML_ENTRY;
    baseXmlText = new TextDecoder().decode(explicitLegacyXml);
  }

  return writeA3P(archive.project, {
    xmlEntryName,
    baseXmlText,
    manifest: archive.manifest,
    thumbnail: archive.thumbnail,
    resources: archive.resources,
    preserveSourceEntries: false,
  });
}

async function loadZip(data: ArrayBuffer | Uint8Array): Promise<JSZip> {
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

async function readManifest(zip: JSZip): Promise<Record<string, unknown> | null> {
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) {
    return null;
  }

  let manifestText: string;
  try {
    manifestText = await manifestEntry.async("string");
  } catch (error) {
    throw new ProjectIoError(
      "corrupted-archive",
      "Failed to read manifest.json from .a3p archive.",
      error,
    );
  }

  try {
    return JSON.parse(manifestText) as Record<string, unknown>;
  } catch (error) {
    throw new ProjectIoError(
      "invalid-manifest",
      "manifest.json is not valid JSON.",
      error,
    );
  }
}

async function readOptionalText(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path);
  if (!entry) {
    return null;
  }
  try {
    return await entry.async("string");
  } catch (error) {
    throw new ProjectIoError(
      "corrupted-archive",
      `Failed to read ${path} from .a3p archive.`,
      error,
    );
  }
}

async function readThumbnail(zip: JSZip): Promise<Uint8Array | null> {
  const thumbEntry = zip.file("thumbnail.png");
  if (!thumbEntry) {
    return null;
  }
  try {
    return await thumbEntry.async("uint8array");
  } catch (error) {
    throw new ProjectIoError(
      "corrupted-archive",
      "Failed to read thumbnail.png from .a3p archive.",
      error,
    );
  }
}

async function readXmlEntry(zip: JSZip): Promise<{ name: string; text: string }> {
  try {
    return await readA3PXmlEntry(zip);
  } catch (error) {
    if (error instanceof Error && error.message.includes(DEFAULT_A3P_XML_ENTRY)) {
      throw new ProjectIoError(
        "missing-program-xml",
        "No programType.xml or program.xml found in .a3p archive.",
        error,
      );
    }
    throw new ProjectIoError(
      "corrupted-archive",
      "Failed to read project XML from .a3p archive.",
      error,
    );
  }
}

async function parseProject(zip: JSZip): Promise<AliceProject> {
  try {
    return await parseA3PFromZip(zip);
  } catch (error) {
    if (error instanceof ProjectIoError) {
      throw error;
    }
    if (error instanceof Error && error.message.includes(DEFAULT_A3P_XML_ENTRY)) {
      throw new ProjectIoError(
        "missing-program-xml",
        "No programType.xml or program.xml found in .a3p archive.",
        error,
      );
    }
    throw new ProjectIoError(
      "xml-parse",
      "Project XML could not be parsed from the .a3p archive.",
      error,
    );
  }
}

async function extractResources(
  zip: JSZip,
  initialSize: number,
): Promise<Array<{ path: string; bytes: Uint8Array; kind: ProjectResourceKind }>> {
  const resourceEntries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
  for (const [archivePath, entry] of Object.entries(zip.files)) {
    if (entry.dir || SPECIAL_ENTRIES.has(archivePath)) continue;
    resourceEntries.push({ path: archivePath, entry });
  }

  const extractedResources = await Promise.all(
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
          `Failed to extract resource \"${path}\" from .a3p archive.`,
          error,
        );
      }
    }),
  );

  let totalSize = initialSize;
  for (const { bytes } of extractedResources) {
    totalSize += bytes.length;
    if (totalSize > MAX_EXTRACT_SIZE) {
      throw new ProjectIoError(
        "zip-bomb",
        `Archive extraction exceeds ${MAX_EXTRACT_SIZE} byte limit (ZIP bomb protection).`,
      );
    }
  }

  return extractedResources;
}
