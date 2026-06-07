import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_A3P_XML_ENTRY,
  getA3PSource,
  type AliceProject,
} from "../a3p-parser.js";
import { serializeManifest } from "../project-io/manifest.js";
import { assertSafeWritablePath } from "../project-io/path-security.js";
import { writeProjectResources } from "../project-io/resources.js";
import { writeProjectThumbnail } from "../project-io/thumbnails.js";
import { appendCommentToMethod, buildProjectXml, ensureXmlTools } from "./document.js";
import { findSceneTypeDefinition } from "./xml-tools.js";
import { type ProjectModification, type WriteA3POptions } from "./types.js";

export async function writeA3P(project: AliceProject, options: WriteA3POptions = {}): Promise<Uint8Array> {
  await ensureXmlTools();
  const source = getA3PSource(project);
  const xmlEntryName = assertSafeWritablePath(
    options.xmlEntryName ?? source?.xmlEntryName ?? DEFAULT_A3P_XML_ENTRY,
  );
  const baseXmlText = options.baseXmlText ?? source?.xmlText ?? null;
  const zip = new JSZip();

  if (options.resources) {
    writeExplicitResources(zip, options.resources);
  } else if (options.preserveSourceEntries !== false && source?.zip) {
    await copySourceEntries(zip, source.zip, new Set([xmlEntryName, "version.txt"]));
  }

  zip.file("version.txt", project.version);
  zip.file(xmlEntryName, buildProjectXml(project, baseXmlText));

  if (options.manifest !== undefined && options.manifest !== null) {
    zip.file("manifest.json", serializeManifest(options.manifest));
  }
  writeProjectThumbnail(zip, options.thumbnail ?? null);

  return zip.generateAsync({ type: "uint8array" });
}

export async function modifyAndWriteA3P(
  inputPath: string,
  outputPath: string,
  modifications: ProjectModification,
): Promise<{ bytesWritten: number; modificationsApplied: string[] }> {
  await ensureXmlTools();
  const data = fs.readFileSync(inputPath);
  const project = await (await import("../a3p-parser.js")).parseA3P(data);
  const source = getA3PSource(project);
  let baseXmlText = source?.xmlText ?? null;
  const applied: string[] = [];

  if (modifications.addCommentToMethod && modifications.commentText) {
    baseXmlText = appendCommentToMethod(baseXmlText, modifications.addCommentToMethod, modifications.commentText);
    applied.push(`added-comment:${modifications.addCommentToMethod}:${modifications.commentText}`);
  }

  if (modifications.addObject) {
    project.sceneObjects.push({
      name: modifications.addObject.name,
      typeName: modifications.addObject.className,
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
    });
    const sceneType = findSceneTypeDefinition(project.types);
    if (sceneType) {
      sceneType.fields = [
        ...(sceneType.fields ?? []),
        { name: modifications.addObject.name, typeName: modifications.addObject.className },
      ];
    }
    applied.push(`added-object:${modifications.addObject.name}:${modifications.addObject.className}`);
  }

  const output = await writeA3P(project, { baseXmlText });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  return { bytesWritten: output.length, modificationsApplied: applied };
}

async function copySourceEntries(target: JSZip, sourceZip: JSZip, skip: Set<string>): Promise<void> {
  for (const [entryName, entry] of Object.entries(sourceZip.files)) {
    if (skip.has(entryName) || entry.dir) continue;
    target.file(assertSafeWritablePath(entryName), await entry.async("uint8array"));
  }
}

function writeExplicitResources(zip: JSZip, resources: Map<string, Uint8Array>): void {
  writeProjectResources(zip, resources);
}
