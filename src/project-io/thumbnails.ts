import JSZip from "jszip";
import type { AliceProject } from "../a3p-parser.js";
import { readZipBytes, writeZipBytes } from "./archive-zip.js";
import type { AliceProjectArchive, WriteProjectOptions } from "./types.js";

export async function readProjectThumbnail(zip: JSZip): Promise<Uint8Array | null> {
  return readZipBytes(zip, "thumbnail.png");
}

export function writeProjectThumbnail(zip: JSZip, thumbnail: Uint8Array | null): void {
  if (thumbnail !== null) {
    writeZipBytes(zip, "thumbnail.png", thumbnail);
  }
}

export async function generateThumbnailFromProjectScene(
  project: AliceProject,
): Promise<Uint8Array | null> {
  if (project.sceneObjects.length === 0) {
    return null;
  }
  const { renderSceneToPng } = await import("../scene-renderer.js");
  const rendered = await renderSceneToPng(project, { width: 640, height: 480 });
  return new Uint8Array(rendered.png);
}

export async function resolveThumbnailForWrite(
  archive: AliceProjectArchive,
  options: WriteProjectOptions & {
    generateThumbnail?: (project: AliceProject) => Promise<Uint8Array | null>;
  } = {},
): Promise<Uint8Array | null> {
  if (archive.thumbnail !== null) {
    return archive.thumbnail;
  }

  if (options.generateThumbnailFromScene !== true) {
    return null;
  }

  const generateThumbnail = options.generateThumbnail ?? generateThumbnailFromProjectScene;
  const thumbnail = await generateThumbnail(archive.project);
  if (thumbnail !== null) {
    archive.thumbnail = thumbnail;
  }
  return thumbnail;
}
