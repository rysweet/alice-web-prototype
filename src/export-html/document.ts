import type { AliceProject } from "../a3p-parser.js";
import { buildEmbeddedTweedleSource } from "./tweedle.js";
import { createHtmlMarkup, normalizeViewport } from "./template.js";
import {
  DEFAULT_PREVIEW_VIEWPORT,
  DEFAULT_STANDALONE_VIEWPORT,
  type HtmlExportDocument,
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
  const title = options.title?.trim() || `${project.projectName || "LookingGlass Project"} — LookingGlass HTML Export`;
  const tweedleSource = options.tweedleSource?.trim() || buildEmbeddedTweedleSource(project);
  return {
    title,
    previewMode,
    tweedleSource,
    html: createHtmlMarkup(project, title, previewMode, viewport, tweedleSource),
  };
}
