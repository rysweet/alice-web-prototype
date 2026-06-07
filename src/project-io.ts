import type JSZip from "jszip";
import {
  DEFAULT_A3P_XML_ENTRY,
  parseA3PFromZip,
  readA3PXmlEntry,
  type AliceProject,
} from "./a3p-parser.js";
import { writeA3P } from "./a3p-writer.js";
import { listSafeZipEntries, loadProjectZip, readZipText } from "./project-io/archive-zip.js";
import { parseManifestText } from "./project-io/manifest.js";
import { migrateProjectArchiveXml } from "./project-io/migration.js";
import { extractProjectResources } from "./project-io/resources.js";
import {
  generateThumbnailFromProjectScene,
  readProjectThumbnail,
  resolveThumbnailForWrite,
} from "./project-io/thumbnails.js";
import {
  encodeOriginalXml,
  selectOriginalXmlForWrite,
} from "./project-io/xml-pass-through.js";
import {
  ORIGINAL_XML_RESOURCE_PATH,
  ProjectIoError,
  type AliceProjectArchive,
  type ProjectIoErrorCode,
  type ProjectResourceDescriptor,
  type WriteProjectOptions,
} from "./project-io/types.js";
import { synchronizeManifestVersion } from "./project-migration.js";

export {
  ProjectIoError,
  type AliceProjectArchive,
  type ProjectIoErrorCode,
  type ProjectResourceDescriptor,
  type WriteProjectOptions,
};
export { generateThumbnailFromProjectScene };

/**
 * Read an .a3p archive and return the parsed project, manifest, resources, thumbnail,
 * detected version metadata, and classified extracted resources.
 */
export async function readProject(
  data: ArrayBuffer | Uint8Array,
): Promise<AliceProjectArchive> {
  const zip = await loadProjectZip(data);
  listSafeZipEntries(zip);

  const manifest = parseManifestText(await readZipText(zip, "manifest.json"));
  const xmlEntry = await readXmlEntry(zip);
  const versionText = await readZipText(zip, "version.txt");
  const thumbnail = await readProjectThumbnail(zip);
  const migration = migrateProjectArchiveXml(xmlEntry.text, versionText, manifest);
  const nextManifest = synchronizeManifestVersion(manifest, migration.versionInfo);

  zip.file(xmlEntry.name, migration.xmlText);
  zip.file("version.txt", migration.versionInfo.detectedAliceVersion);

  const project = await parseProject(zip);
  project.version = migration.versionInfo.detectedAliceVersion;

  const storedXmlBytes = encodeOriginalXml({
    entryName: xmlEntry.name,
    xmlText: migration.xmlText,
  });
  const resources = new Map<string, Uint8Array>();
  resources.set(ORIGINAL_XML_RESOURCE_PATH, storedXmlBytes);

  const resourceRecords = await extractProjectResources(zip, storedXmlBytes.length);
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
  options: WriteProjectOptions = {},
): Promise<Uint8Array> {
  const originalXml = selectOriginalXmlForWrite(archive.resources);
  const thumbnail = await resolveThumbnailForWrite(archive, options);

  return writeA3P(archive.project, {
    xmlEntryName: originalXml?.entryName ?? DEFAULT_A3P_XML_ENTRY,
    baseXmlText: originalXml?.xmlText ?? null,
    manifest: archive.manifest,
    thumbnail,
    resources: archive.resources,
    preserveSourceEntries: false,
  });
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
