/**
 * Full .a3p project read/write with manifest.json, program.xml, resources, and thumbnails.
 * Buffer-based (ArrayBuffer | Uint8Array in, Uint8Array out).
 * Uses XML pass-through: original programType.xml is stored in resources as __original_xml__
 * and written back on round-trip.
 */
import JSZip from "jszip";
import { parseA3PFromZip, type AliceProject } from "./a3p-parser";

/** Complete archive contents returned by readProject(). */
export interface AliceProjectArchive {
  project: AliceProject;
  manifest: Record<string, unknown> | null;
  resources: Map<string, Uint8Array>;
  thumbnail: Uint8Array | null;
}

const MAX_EXTRACT_SIZE = 256 * 1024 * 1024; // 256 MB ZIP bomb protection
const ORIGINAL_XML_MARKER = "<!-- programType.xml -->\n";
const SPECIAL_ENTRIES = new Set([
  "programType.xml",
  "manifest.json",
  "thumbnail.png",
  "version.txt",
]);

function validatePath(p: string): void {
  if (p.includes("..") || p.startsWith("/")) {
    throw new Error(`Unsafe archive path rejected: "${p}"`);
  }
}

/**
 * Read an .a3p archive and return the parsed project, manifest, resources, and thumbnail.
 * Stores the original XML in resources under the key "__original_xml__" for round-trip fidelity.
 */
export async function readProject(
  data: ArrayBuffer | Uint8Array,
): Promise<AliceProjectArchive> {
  const zip = await JSZip.loadAsync(data);

  // Security: validate all paths (files AND directories) before extracting
  for (const path of Object.keys(zip.files)) {
    validatePath(path);
  }

  // Parse project model + read XML/manifest/thumbnail in parallel
  const xmlEntry = zip.file("programType.xml");
  if (!xmlEntry) {
    throw new Error("No programType.xml found in .a3p archive");
  }
  const manifestEntry = zip.file("manifest.json");
  const thumbEntry = zip.file("thumbnail.png");

  const [project, xmlText, manifestText, thumbnail] = await Promise.all([
    parseA3PFromZip(zip),
    xmlEntry.async("string"),
    manifestEntry ? manifestEntry.async("string") : Promise.resolve(null),
    thumbEntry ? thumbEntry.async("uint8array") : Promise.resolve(null),
  ]);

  const storedXml = ORIGINAL_XML_MARKER + xmlText;
  const manifest: Record<string, unknown> | null = manifestText
    ? JSON.parse(manifestText) as Record<string, unknown>
    : null;

  // Collect all non-special resources + __original_xml__
  const resources = new Map<string, Uint8Array>();
  const storedXmlBytes = new TextEncoder().encode(storedXml);
  resources.set("__original_xml__", storedXmlBytes);

  // Extract resources in parallel instead of sequential awaits
  const resourceEntries: Array<{ path: string; entry: JSZip.JSZipObject }> = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || SPECIAL_ENTRIES.has(path)) continue;
    resourceEntries.push({ path, entry });
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
 * Uses __original_xml__ or an explicit programType.xml entry as the XML source.
 * Throws if neither is available.
 */
export async function writeProject(
  archive: AliceProjectArchive,
): Promise<Uint8Array> {
  // Validate all resource paths
  for (const path of archive.resources.keys()) {
    if (path === "__original_xml__") continue;
    validatePath(path);
  }

  const zip = new JSZip();

  // Write version
  zip.file("version.txt", archive.project.version);

  // Write programType.xml from pass-through or explicit entry
  const originalXml = archive.resources.get("__original_xml__");
  const explicitXml = archive.resources.get("programType.xml");
  if (originalXml) {
    let xmlContent = new TextDecoder().decode(originalXml);
    // Strip provenance marker before writing to ZIP
    if (xmlContent.startsWith(ORIGINAL_XML_MARKER)) {
      xmlContent = xmlContent.substring(ORIGINAL_XML_MARKER.length);
    }
    zip.file("programType.xml", xmlContent);
  } else if (explicitXml) {
    zip.file("programType.xml", explicitXml);
  } else {
    throw new Error(
      "Cannot write project: no XML source available. " +
        "Provide __original_xml__ or programType.xml in resources.",
    );
  }

  // Write manifest if present
  if (archive.manifest !== null) {
    zip.file("manifest.json", JSON.stringify(archive.manifest, null, 2));
  }

  // Write thumbnail if present
  if (archive.thumbnail !== null) {
    zip.file("thumbnail.png", archive.thumbnail);
  }

  // Write all other resources
  for (const [path, bytes] of archive.resources) {
    if (path === "__original_xml__") continue;
    if (SPECIAL_ENTRIES.has(path)) continue;
    zip.file(path, bytes);
  }

  return zip.generateAsync({ type: "uint8array" }).catch((err) => {
    throw new Error(
      `Failed to generate project archive: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}
