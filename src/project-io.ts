/**
 * Full .a3p project read/write with manifest.json, program.xml, resources, and thumbnails.
 * Buffer-based (ArrayBuffer | Uint8Array in, Uint8Array out).
 * Uses XML pass-through: original program XML is stored in resources as __original_xml__.
 */
import JSZip from "jszip";
import {
  DEFAULT_A3P_XML_ENTRY,
  LEGACY_A3P_XML_ENTRY,
  parseA3PFromZip,
  readA3PXmlEntry,
  type AliceProject,
} from "./a3p-parser";
import { writeA3P } from "./a3p-writer";

/** Complete archive contents returned by readProject(). */
export interface AliceProjectArchive {
  project: AliceProject;
  manifest: Record<string, unknown> | null;
  resources: Map<string, Uint8Array>;
  thumbnail: Uint8Array | null;
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
  if (p.includes("..") || p.startsWith("/")) {
    throw new Error(`Unsafe archive path rejected: "${p}"`);
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
 * Read an .a3p archive and return the parsed project, manifest, resources, and thumbnail.
 * Stores the original XML in resources under the key "__original_xml__" for round-trip fidelity.
 */
export async function readProject(
  data: ArrayBuffer | Uint8Array,
): Promise<AliceProjectArchive> {
  const zip = await JSZip.loadAsync(data);

  for (const archivePath of Object.keys(zip.files)) {
    validatePath(archivePath);
  }

  const manifestEntry = zip.file("manifest.json");
  const thumbEntry = zip.file("thumbnail.png");

  const [project, xmlEntry, manifestText, thumbnail] = await Promise.all([
    parseA3PFromZip(zip),
    readA3PXmlEntry(zip),
    manifestEntry ? manifestEntry.async("string") : Promise.resolve(null),
    thumbEntry ? thumbEntry.async("uint8array") : Promise.resolve(null),
  ]);

  const storedXmlBytes = new TextEncoder().encode(
    originalXmlMarker(xmlEntry.name) + xmlEntry.text,
  );
  const manifest: Record<string, unknown> | null = manifestText
    ? JSON.parse(manifestText) as Record<string, unknown>
    : null;

  const resources = new Map<string, Uint8Array>();
  resources.set("__original_xml__", storedXmlBytes);

  const resourceEntries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
  for (const [archivePath, entry] of Object.entries(zip.files)) {
    if (entry.dir || SPECIAL_ENTRIES.has(archivePath)) continue;
    resourceEntries.push({ path: archivePath, entry });
  }

  const extractedResources = await Promise.all(
    resourceEntries.map(async ({ path, entry }) => ({
      path,
      bytes: await entry.async("uint8array"),
    })),
  );

  let totalSize = storedXmlBytes.length;
  for (const { path, bytes } of extractedResources) {
    totalSize += bytes.length;
    if (totalSize > MAX_EXTRACT_SIZE) {
      throw new Error(
        `Archive extraction exceeds ${MAX_EXTRACT_SIZE} byte limit (ZIP bomb protection)`,
      );
    }
    resources.set(path, bytes);
  }

  return { project, manifest, resources, thumbnail };
}

/**
 * Write an AliceProjectArchive back to .a3p ZIP format (Uint8Array).
 * Uses stored XML when available, but can synthesize XML for brand-new/empty projects too.
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
