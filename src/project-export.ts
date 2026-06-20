import JSZip from "jszip";
import { ImageData, createCanvas } from "canvas";
import type { AliceProject } from "./a3p-parser.js";
import { writeA3P, type WriteA3POptions } from "./a3p-writer.js";
import {
  createHtmlExportDocument,
  type HtmlExportDocument,
  type HtmlExportOptions,
} from "./export-html.js";
import { assertSafeWritablePath } from "./project-io/path-security.js";

export interface ProjectExportResource {
  path: string;
  bytes: Uint8Array | string;
  mimeType?: string;
}

export interface StandaloneHtmlExport {
  title: string;
  html: string;
  document: HtmlExportDocument;
  embeddedResources: Record<string, string>;
}

export interface ScreenshotCaptureOptions {
  width?: number;
  height?: number;
  backgroundColor?: string;
  label?: string;
  pixels?: Uint8ClampedArray;
}

export interface ScreenshotImage {
  bytes: Uint8Array;
  mimeType: "image/png";
  width: number;
  height: number;
}

export interface VideoExportOptions extends ScreenshotCaptureOptions {
  frameCount?: number;
  fps?: number;
  labels?: string[];
}

export interface VideoFrame extends ScreenshotImage {
  index: number;
  timestampMs: number;
}

export interface VideoExport {
  fps: number;
  frames: VideoFrame[];
}

export interface ProjectPackagingOptions {
  a3p?: WriteA3POptions;
  html?: HtmlExportOptions;
  resources?: ProjectExportResource[];
  dependencies?: string[];
  thumbnail?: ScreenshotCaptureOptions;
}

export interface PackagedProject {
  archive: Uint8Array;
  manifest: {
    projectName: string;
    dependencies: string[];
    resourceCount: number;
    generatedEntries: string[];
  };
  entryNames: string[];
}

export class A3PExporter {
  async export(project: AliceProject, options: WriteA3POptions = {}): Promise<Uint8Array> {
    return writeA3P(project, options);
  }
}

export class HTMLExporter {
  async export(
    project: AliceProject,
    options: HtmlExportOptions & { resources?: ProjectExportResource[] } = {},
  ): Promise<StandaloneHtmlExport> {
    const { resources = [], ...htmlOptions } = options;
    const document = createHtmlExportDocument(project, htmlOptions);
    const embeddedResources = Object.fromEntries(
      resources.map((resource) => [resource.path, resourceToDataUrl(resource)]),
    );
    const html = injectBeforeBodyEnd(
      document.html,
      buildResourceScript(embeddedResources),
    );

    return {
      title: document.title,
      html,
      document,
      embeddedResources,
    };
  }
}

export class ScreenshotCapture {
  async capture(options: ScreenshotCaptureOptions = {}): Promise<ScreenshotImage> {
    const width = normalizeDimension(options.width, 1280);
    const height = normalizeDimension(options.height, 720);
    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");

    context.fillStyle = options.backgroundColor ?? "#1f2937";
    context.fillRect(0, 0, width, height);

    if (options.pixels && options.pixels.length === width * height * 4) {
      context.putImageData(new ImageData(options.pixels, width, height), 0, 0);
    }

    if (options.label?.trim()) {
      context.fillStyle = "rgba(255, 255, 255, 0.92)";
      context.font = `${Math.max(16, Math.round(width / 28))}px sans-serif`;
      context.fillText(options.label.trim(), 24, Math.max(36, Math.round(height / 12)));
    }

    return {
      bytes: new Uint8Array(canvas.toBuffer("image/png")),
      mimeType: "image/png",
      width,
      height,
    };
  }
}

export class VideoExporter {
  constructor(private readonly screenshotCapture = new ScreenshotCapture()) {
  }

  async record(project: AliceProject, options: VideoExportOptions = {}): Promise<VideoExport> {
    const frameCount = Math.max(1, Math.floor(options.frameCount ?? 1));
    const fps = Math.max(1, Math.floor(options.fps ?? 30));
    const frames: VideoFrame[] = [];

    for (let index = 0; index < frameCount; index += 1) {
      const screenshot = await this.screenshotCapture.capture({
        ...options,
        label: options.labels?.[index] ?? `${project.projectName || "Project"} frame ${index + 1}`,
      });
      frames.push({
        ...screenshot,
        index,
        timestampMs: Math.round((index * 1000) / fps),
      });
    }

    return { fps, frames };
  }
}

export class ProjectPackager {
  constructor(
    private readonly a3pExporter = new A3PExporter(),
    private readonly htmlExporter = new HTMLExporter(),
    private readonly screenshotCapture = new ScreenshotCapture(),
  ) {
  }

  async packageProject(
    project: AliceProject,
    options: ProjectPackagingOptions = {},
  ): Promise<PackagedProject> {
    const zip = new JSZip();
    const slug = slugify(project.projectName || "project");
    const resources = (options.resources ?? []).map(validateResourcePath);
    const a3p = await this.a3pExporter.export(project, options.a3p);
    const html = await this.htmlExporter.export(project, {
      ...options.html,
      resources,
    });
    const thumbnail = await this.screenshotCapture.capture(options.thumbnail);

    const generatedEntries = [
      addZipFile(zip, `${slug}.a3p`, a3p),
      addZipFile(zip, `${slug}.html`, html.html),
      addZipFile(zip, "thumbnail.png", thumbnail.bytes),
    ];

    for (const resource of resources) {
      addZipFile(zip, resource.path, normalizeResourceBytes(resource.bytes));
    }

    const dependencies = [...new Set(options.dependencies ?? [])].sort();
    const manifest = {
      projectName: project.projectName || "Project",
      dependencies,
      resourceCount: resources.length,
      generatedEntries,
    };
    addZipFile(zip, "manifest.json", JSON.stringify(manifest, null, 2));

    const archive = await zip.generateAsync({ type: "uint8array" });
    return {
      archive,
      manifest,
      entryNames: Object.keys(zip.files).sort(),
    };
  }
}

function buildResourceScript(resources: Record<string, string>): string {
  if (Object.keys(resources).length === 0) {
    return "";
  }
  return `<script id="alice-export-resources" type="application/json">${escapeScriptText(JSON.stringify(resources))}</script>`;
}

function addZipFile(zip: JSZip, path: string, bytes: Uint8Array | string): string {
  const safePath = assertSafeWritablePath(path);
  zip.file(safePath, bytes);
  return safePath;
}

function validateResourcePath(resource: ProjectExportResource): ProjectExportResource {
  return {
    ...resource,
    path: assertSafeWritablePath(resource.path),
  };
}

function injectBeforeBodyEnd(html: string, injectedMarkup: string): string {
  if (!injectedMarkup) {
    return html;
  }
  return html.includes("</body>")
    ? html.replace("</body>", `${injectedMarkup}</body>`)
    : `${html}${injectedMarkup}`;
}

function resourceToDataUrl(resource: ProjectExportResource): string {
  const mimeType = resource.mimeType ?? inferMimeType(resource.path);
  return `data:${mimeType};base64,${Buffer.from(normalizeResourceBytes(resource.bytes)).toString("base64")}`;
}

function normalizeResourceBytes(bytes: Uint8Array | string): Uint8Array {
  return typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
}

function inferMimeType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".txt")) return "text/plain;charset=utf-8";
  return "application/octet-stream";
}

function normalizeDimension(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(1, Math.round(value));
}

function slugify(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "project";
}

function escapeScriptText(value: string): string {
  return value.replace(/<\//g, "<\\/");
}
