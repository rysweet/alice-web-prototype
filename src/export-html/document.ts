import type { AliceProject } from "../a3p-parser.js";
import { buildEmbeddedTweedleSource } from "./tweedle.js";
import { createHtmlMarkup, normalizeViewport } from "./template.js";
import {
  DEFAULT_PREVIEW_VIEWPORT,
  DEFAULT_STANDALONE_VIEWPORT,
  type HtmlExportDocument,
  type HtmlExportMetadata,
  type HtmlExportOptions,
} from "./types.js";

export function exportProjectToHtml(project: AliceProject, options: HtmlExportOptions = {}): string {
  return createHtmlExportDocument(project, options).html;
}

export function createHtmlExportDocument(
  project: AliceProject,
  options: HtmlExportOptions = {},
): HtmlExportDocument {
  const previewMode = options.previewMode ?? false;
  const viewport = normalizeViewport(options.viewport, previewMode ? DEFAULT_PREVIEW_VIEWPORT : DEFAULT_STANDALONE_VIEWPORT);
  const title = options.title?.trim() || `${project.projectName || "Alice Project"} — Alice HTML Export`;
  const tweedleSource = options.tweedleSource?.trim() || buildEmbeddedTweedleSource(project);
  const packageName = options.packageName?.trim() || "alice-web";
  const runtimeIdentity = options.runtimeIdentity?.trim() || "alice-web-player";
  const metadata = normalizeMetadata(options.metadata);
  return {
    schemaVersion: "alice-web.player-document/v1",
    title,
    previewMode,
    tweedleSource,
    packageName,
    runtimeIdentity,
    entrypoint: "index.html",
    metadata,
    html: createHtmlMarkup(project, title, previewMode, viewport, tweedleSource, {
      packageName,
      runtimeIdentity,
      metadata,
    }),
  };
}

function normalizeMetadata(metadata: HtmlExportOptions["metadata"] = {}): HtmlExportMetadata {
  return {
    ...(metadata.description?.trim() ? { description: metadata.description.trim() } : {}),
    ...(metadata.canonicalUrl?.trim() ? { canonicalUrl: metadata.canonicalUrl.trim() } : {}),
    ...(metadata.preview?.trim() ? { preview: metadata.preview.trim() } : {}),
  };
}
