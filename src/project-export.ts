import { createHash } from "node:crypto";
import JSZip from "jszip";
import { ImageData, createCanvas } from "canvas";
import type { AliceProject } from "./a3p-parser.js";
import { writeA3P, type WriteA3POptions } from "./a3p-writer.js";
import {
  createHtmlExportDocument,
  type HtmlExportDocument,
  type HtmlExportMetadata,
  type HtmlExportOptions,
} from "./export-html.js";
import { assertSafeWritablePath, validateArchivePath } from "./project-io/path-security.js";
import {
  generateTypeScriptSource,
  type TypeScriptSource,
  type TypeScriptSourceManifest,
} from "./code-generation/typescript-source.js";

const ALICE_PRODUCT = "Alice";
const ALICE_WEB_PACKAGE = "alice-web";
const ALICE_WEB_PLAYER = "alice-web-player";
const ZIP_MIME_TYPE = "application/zip";

const WEB_PACKAGE_ARTIFACTS = {
  entrypoint: "index.html",
  manifest: "manifest.json",
  share: "share.json",
  preview: "preview.png",
  project: "project/project.json",
  validation: "validation.json",
} as const;

const REQUIRED_WEB_PACKAGE_FILES = Object.values(WEB_PACKAGE_ARTIFACTS);
const RESERVED_WEB_PACKAGE_PATHS = new Set<string>(REQUIRED_WEB_PACKAGE_FILES);
const RESERVED_WEB_PACKAGE_PATHS_BY_LOWERCASE = new Map(
  REQUIRED_WEB_PACKAGE_FILES.map((path) => [path.toLowerCase(), path] as const),
);
const FORBIDDEN_IDENTITY_RE = /LookingGlass|lookingglass|alice-standalone-player/;
const ENCODED_PATH_CONTROL_RE = /%(?:2e|2f|5c)/i;
const URL_CONTROL_OR_SPACE_RE = /[\u0000-\u0020\u007f]/u;
const SAFE_PACKAGE_FILENAME_RE = /^[a-z0-9][a-z0-9._-]*\.zip$/i;

export function isReservedWebPackagePath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return [...RESERVED_WEB_PACKAGE_PATHS].some((reserved) => {
    const lowerReserved = reserved.toLowerCase();
    return lowerPath === lowerReserved
      || lowerPath.startsWith(`${lowerReserved}/`)
      || lowerReserved.startsWith(`${lowerPath}/`);
  });
}

function conflictsWithReservedWebPackageArtifact(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return [...RESERVED_WEB_PACKAGE_PATHS].some((reserved) => {
    const lowerReserved = reserved.toLowerCase();
    return (lowerPath === lowerReserved && path !== reserved)
      || lowerPath.startsWith(`${lowerReserved}/`)
      || lowerReserved.startsWith(`${lowerPath}/`);
  });
}

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

export interface WebPackageOptions {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  resources?: ProjectExportResource[];
  teacher?: TeacherShareMetadata;
}

export type TeacherShareRemixPolicy = "allowed" | "with-attribution" | "not-allowed";

export interface TeacherShareMetadata {
  audience?: string;
  lessonFocus?: string;
  remix?: TeacherShareRemixPolicy;
  attribution?: string;
  tags?: string[];
  standards?: string[];
}

export interface WebPackageReference {
  filename: string;
  mimeType: typeof ZIP_MIME_TYPE;
  sizeBytes: number;
  sha256: string;
}

export interface ExportedWebPackage {
  schema_version: "alice-web.export-web-package-result/v1";
  status: "exported";
  runtime: typeof ALICE_WEB_PACKAGE;
  package: WebPackageReference & { base64: string };
  manifest: AliceWebPackageManifest;
  artifacts: typeof WEB_PACKAGE_ARTIFACTS;
  validation: AliceWebValidationDocument;
}

export interface ValidateWebPackageInput {
  packageBase64: string;
}

export interface WebPackageValidationError {
  code: string;
  message: string;
  path?: string;
}

export interface WebPackageValidation {
  schema_version: "alice-web.validate-web-package-result/v1";
  status: "valid" | "invalid";
  valid: boolean;
  runtime?: typeof ALICE_WEB_PACKAGE;
  package?: WebPackageReference;
  manifest?: AliceWebPackageManifest;
  evidence: string[];
  errors: WebPackageValidationError[];
}

export interface ShareArtifactsInput extends WebPackageOptions {
  packageBase64: string;
}

export interface ShareArtifacts {
  schema_version: "alice-web.share-artifacts-result/v1";
  status: "shared";
  runtime: typeof ALICE_WEB_PACKAGE;
  share: AliceWebShareDocument & { package: WebPackageReference };
  artifacts: {
    share: typeof WEB_PACKAGE_ARTIFACTS.share;
    preview: typeof WEB_PACKAGE_ARTIFACTS.preview;
    entrypoint: typeof WEB_PACKAGE_ARTIFACTS.entrypoint;
    package: string;
  };
  validation: Pick<WebPackageValidation, "valid" | "errors">;
}

export class WebPackageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebPackageInputError";
  }
}

export class InvalidWebPackageError extends Error {
  constructor(readonly validation: WebPackageValidation) {
    super("web package validation failed");
    this.name = "InvalidWebPackageError";
  }
}

interface AliceWebPackageManifest {
  schemaVersion: "alice-web.package/v1";
  product: typeof ALICE_PRODUCT;
  packageName: typeof ALICE_WEB_PACKAGE;
  runtimeIdentity: typeof ALICE_WEB_PLAYER;
  entrypoint: typeof WEB_PACKAGE_ARTIFACTS.entrypoint;
  preview: typeof WEB_PACKAGE_ARTIFACTS.preview;
  share: typeof WEB_PACKAGE_ARTIFACTS.share;
  validation: typeof WEB_PACKAGE_ARTIFACTS.validation;
  project: typeof WEB_PACKAGE_ARTIFACTS.project;
  package: {
    filename: string;
    mimeType: typeof ZIP_MIME_TYPE;
  };
}

interface AliceWebShareDocument {
  schemaVersion: "alice-web.share/v1";
  product: typeof ALICE_PRODUCT;
  runtimeIdentity: typeof ALICE_WEB_PLAYER;
  title: string;
  description?: string;
  canonicalUrl?: string;
  teacher?: AliceWebTeacherShareMetadata;
  preview: typeof WEB_PACKAGE_ARTIFACTS.preview;
  package: {
    filename: string;
    mimeType: typeof ZIP_MIME_TYPE;
  };
  delivery: {
    mode: "browser-download-fallback";
    nativeWebShare: false;
    requiresUserDownload: true;
  };
  links: {
    html: typeof WEB_PACKAGE_ARTIFACTS.entrypoint;
    package: string;
    preview: typeof WEB_PACKAGE_ARTIFACTS.preview;
  };
}

interface AliceWebTeacherShareMetadata {
  schemaVersion: "alice-web.teacher-share/v1";
  audience?: string;
  lessonFocus?: string;
  remix: TeacherShareRemixPolicy;
  attribution?: string;
  tags: string[];
  standards: string[];
}

interface AliceWebValidationDocument {
  schemaVersion: "alice-web.validation/v1";
  valid: boolean;
  errors: WebPackageValidationError[];
  evidence: string[];
}

export interface TypeScriptSourceArchive {
  archive: Uint8Array;
  manifest: TypeScriptSourceManifest;
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

export async function exportWebPackage(
  project: AliceProject,
  options: WebPackageOptions = {},
): Promise<ExportedWebPackage> {
  const normalized = normalizeWebPackageOptions(project, options);
  const resources = (options.resources ?? []).map(validateResourcePath);
  const filename = `${slugify(normalized.title)}.alice-web.zip`;
  const preview = await new ScreenshotCapture().capture({
    width: 960,
    height: 540,
    label: normalized.title,
  });
  const htmlDocument = createHtmlExportDocument(project, {
    title: normalized.title,
    packageName: ALICE_WEB_PACKAGE,
    runtimeIdentity: ALICE_WEB_PLAYER,
    metadata: {
      ...normalized.metadata,
      preview: WEB_PACKAGE_ARTIFACTS.preview,
    },
  });
  const html = injectBeforeBodyEnd(
    htmlDocument.html,
    buildResourceScript(Object.fromEntries(
      resources.map((resource) => [resource.path, resourceToDataUrl(resource)]),
    )),
  );
  const manifest = buildPackageManifest(filename);
  const share = buildShareDocument(normalized, filename);
  const validation = buildValidationDocument(Boolean(share.teacher));

  const zip = new JSZip();
  addZipFile(zip, WEB_PACKAGE_ARTIFACTS.entrypoint, html);
  addZipFile(zip, WEB_PACKAGE_ARTIFACTS.manifest, JSON.stringify(manifest, null, 2));
  addZipFile(zip, WEB_PACKAGE_ARTIFACTS.share, JSON.stringify(share, null, 2));
  addZipFile(zip, WEB_PACKAGE_ARTIFACTS.preview, preview.bytes);
  addZipFile(zip, WEB_PACKAGE_ARTIFACTS.project, JSON.stringify(project, null, 2));
  addZipFile(zip, WEB_PACKAGE_ARTIFACTS.validation, JSON.stringify(validation, null, 2));
  for (const resource of resources) {
    if (isReservedWebPackagePath(resource.path)) {
      throw new WebPackageInputError(`resource path conflicts with web package artifact: ${resource.path}`);
    }
    addZipFile(zip, resource.path, normalizeResourceBytes(resource.bytes));
  }

  const archive = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });
  const packageReference = buildPackageReference(filename, archive);

  return {
    schema_version: "alice-web.export-web-package-result/v1",
    status: "exported",
    runtime: ALICE_WEB_PACKAGE,
    package: {
      ...packageReference,
      base64: Buffer.from(archive).toString("base64"),
    },
    manifest,
    artifacts: WEB_PACKAGE_ARTIFACTS,
    validation,
  };
}

export async function validateWebPackage(input: ValidateWebPackageInput): Promise<WebPackageValidation> {
  const evidence: string[] = [];
  const errors: WebPackageValidationError[] = [];
  const decoded = decodeBase64Package(input.packageBase64);
  if (!decoded.ok) {
    errors.push({ code: "invalid-base64", message: decoded.error });
    return buildValidationResult(evidence, errors);
  }
  evidence.push("base64-decodes");

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(decoded.bytes);
    evidence.push("zip-readable");
  } catch {
    errors.push({ code: "invalid-zip", message: "packageBase64 must decode to a readable ZIP package" });
    return buildValidationResult(evidence, errors);
  }

  const entryNames = Object.keys(zip.files);
  if (zipPathsAreSafe(zip)) {
    evidence.push("safe-zip-paths");
  } else {
    errors.push({ code: "unsafe-zip-path", message: "package contains an unsafe ZIP path" });
  }

  const duplicateRequiredFiles = findDuplicateRequiredFiles(decoded.bytes);
  if (duplicateRequiredFiles.length === 0) {
    evidence.push("no-duplicate-required-files");
  } else {
    for (const path of duplicateRequiredFiles) {
      errors.push({ code: "duplicate-required-file", message: `${path} appears more than once`, path });
    }
  }

  const missing = REQUIRED_WEB_PACKAGE_FILES.filter((path) => !zip.file(path));
  if (missing.length === 0) {
    evidence.push("required-files-present");
  } else {
    for (const path of missing) {
      errors.push({ code: "missing-required-file", message: `${path} is required`, path });
    }
  }

  const manifest = await readJsonEntry<AliceWebPackageManifest>(zip, WEB_PACKAGE_ARTIFACTS.manifest, errors);
  const share = await readJsonEntry<AliceWebShareDocument>(zip, WEB_PACKAGE_ARTIFACTS.share, errors);
  const validationDoc = await readJsonEntry<AliceWebValidationDocument>(zip, WEB_PACKAGE_ARTIFACTS.validation, errors);
  const project = await readJsonEntry<Record<string, unknown>>(zip, WEB_PACKAGE_ARTIFACTS.project, errors);
  const html = await readTextEntry(zip, WEB_PACKAGE_ARTIFACTS.entrypoint, errors);
  const preview = await zip.file(WEB_PACKAGE_ARTIFACTS.preview)?.async("uint8array");

  if (hasAliceWebIdentity(manifest, share, validationDoc, html)) {
    evidence.push("alice-web-identity");
  } else {
    errors.push({ code: "invalid-identity", message: "package must use Alice/alice-web runtime identity" });
  }

  if (containsForbiddenRepositoryIdentity([manifest, share, validationDoc, project, html])) {
    errors.push({
      code: "forbidden-repository-identity",
      message: "generated packages must not expose repository nicknames or stale player identity",
    });
  }

  if (html?.includes("window.AlicePlayer") && html.includes(ALICE_WEB_PLAYER) && html.includes("alice-project-data")) {
    evidence.push("entrypoint-playable");
  } else if (!missing.includes(WEB_PACKAGE_ARTIFACTS.entrypoint)) {
    errors.push({
      code: "entrypoint-not-playable",
      message: "index.html must expose window.AlicePlayer and embedded Alice project data",
      path: WEB_PACKAGE_ARTIFACTS.entrypoint,
    });
  }

  if (preview && Array.from(preview.slice(0, 4)).join(",") !== "137,80,78,71") {
    errors.push({ code: "invalid-preview", message: "preview.png must be a PNG image", path: WEB_PACKAGE_ARTIFACTS.preview });
  }
  if (share && Object.prototype.hasOwnProperty.call(share, "canonicalUrl")) {
    const canonicalUrl = (share as { canonicalUrl?: unknown }).canonicalUrl;
    if (typeof canonicalUrl !== "string" || !isSafeHttpUrl(canonicalUrl)) {
      errors.push({
        code: "invalid-canonical-url",
        message: "share canonicalUrl must be a valid http or https URL",
        path: WEB_PACKAGE_ARTIFACTS.share,
      });
    }
  }

  if (share && Object.prototype.hasOwnProperty.call(share, "teacher")) {
    const teacherErrors = validateTeacherShareMetadata(share.teacher);
    if (teacherErrors.length === 0) {
      evidence.push("teacher-share-metadata");
    } else {
      errors.push(...teacherErrors);
    }
  }
  if (share && Object.prototype.hasOwnProperty.call(share, "canonicalUrl")) {
    const urlError = validatePackageCanonicalUrl(share.canonicalUrl);
    if (urlError) {
      errors.push(urlError);
    }
  }

  const filename = validatedPackageFilename(manifest, errors);
  if (!manifest?.package || manifest.package.filename !== filename || manifest.package.mimeType !== ZIP_MIME_TYPE) {
    errors.push({
      code: "invalid-package-reference",
      message: "manifest package must include the validated ZIP filename and application/zip MIME type",
      path: WEB_PACKAGE_ARTIFACTS.manifest,
    });
  }
  if (share) {
    const deliveryErrors = validateShareDelivery(share);
    errors.push(...deliveryErrors);
    if (deliveryErrors.length === 0) {
      evidence.push("browser-download-fallback");
    }
    const shareLinkErrors = validateSharePackageLinks(share, filename);
    errors.push(...shareLinkErrors);
    if (shareLinkErrors.length === 0) {
      evidence.push("share-package-links-match");
    }
  }
  return buildValidationResult(evidence, errors, {
    runtime: manifest?.packageName === ALICE_WEB_PACKAGE ? ALICE_WEB_PACKAGE : undefined,
    package: buildPackageReference(filename, decoded.bytes),
    ...(manifest ? { manifest } : {}),
  });
}

function validatedPackageFilename(
  manifest: AliceWebPackageManifest | null,
  errors: WebPackageValidationError[],
): string {
  const fallback = `${ALICE_WEB_PACKAGE}.zip`;
  const candidate = manifest?.package?.filename;
  if (candidate === undefined) {
    if (manifest) {
      errors.push({
        code: "invalid-package-filename",
        message: "manifest package filename must be a safe ZIP filename",
        path: WEB_PACKAGE_ARTIFACTS.manifest,
      });
    }
    return fallback;
  }
  if (typeof candidate !== "string") {
    errors.push({
      code: "invalid-package-filename",
      message: "manifest package filename must be a safe ZIP filename",
      path: WEB_PACKAGE_ARTIFACTS.manifest,
    });
    return fallback;
  }
  try {
    if (ENCODED_PATH_CONTROL_RE.test(candidate)) {
      throw new Error("package filename must not contain encoded path controls");
    }
    const safe = assertSafeWritablePath(candidate);
    if (
      safe.includes("/")
      || RESERVED_WEB_PACKAGE_PATHS.has(safe)
      || !safe.toLowerCase().endsWith(".zip")
      || !SAFE_PACKAGE_FILENAME_RE.test(safe)
    ) {
      throw new Error("package filename must be a non-reserved ZIP basename");
    }
    return safe;
  } catch {
    errors.push({
      code: "invalid-package-filename",
      message: "manifest package filename must be a safe ZIP filename",
      path: WEB_PACKAGE_ARTIFACTS.manifest,
    });
    return fallback;
  }
}

export async function generateShareArtifacts(input: ShareArtifactsInput): Promise<ShareArtifacts> {
  const validation = await validateWebPackage({ packageBase64: input.packageBase64 });
  if (!validation.valid || !validation.package) {
    throw new InvalidWebPackageError(validation);
  }

  const title = input.title?.trim() || validation.package.filename.replace(/\.alice-web\.zip$/, "") || "Alice Project";
  const normalized = normalizeWebPackageOptions({ projectName: title }, input);
  const share = {
    ...buildShareDocument(normalized, validation.package.filename),
    package: validation.package,
  };

  return {
    schema_version: "alice-web.share-artifacts-result/v1",
    status: "shared",
    runtime: ALICE_WEB_PACKAGE,
    share,
    artifacts: {
      share: WEB_PACKAGE_ARTIFACTS.share,
      preview: WEB_PACKAGE_ARTIFACTS.preview,
      entrypoint: WEB_PACKAGE_ARTIFACTS.entrypoint,
      package: validation.package.filename,
    },
    validation: {
      valid: validation.valid,
      errors: validation.errors,
    },
  };
}

export class TypeScriptExporter {
  constructor(
    private readonly generator: (project: AliceProject) => TypeScriptSource = generateTypeScriptSource,
  ) {
  }

  async export(project: AliceProject): Promise<TypeScriptSourceArchive> {
    const generated = this.generator(project);
    validateGeneratedSource(generated);

    const zip = new JSZip();
    const packageEntries = buildTypeScriptPackageEntries(generated);
    for (const entry of packageEntries) {
      addDeterministicZipFile(zip, `alice-web-typescript-source/${entry.path}`, entry.content);
    }

    const archive = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
    });
    return {
      archive,
      manifest: generated.manifest,
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

function addDeterministicZipFile(zip: JSZip, path: string, bytes: Uint8Array | string): string {
  const safePath = assertSafeWritablePath(path);
  zip.file(safePath, bytes, {
    createFolders: false,
    date: new Date(0),
  });
  return safePath;
}

function validateGeneratedSource(generated: TypeScriptSource): void {
  if (generated.entries.length === 0) {
    throw new Error("TypeScript source export cannot create an empty archive.");
  }

  const seen = new Set<string>();
  for (const entry of generated.entries) {
    const safePath = assertSafeWritablePath(entry.path);
    if (safePath !== entry.path) {
      throw new Error(`TypeScript source entry path changed during validation: ${entry.path}`);
    }
    if (seen.has(entry.path)) {
      throw new Error(`TypeScript source export contains duplicate entry: ${entry.path}`);
    }
    if (entry.content.trim().length === 0) {
      throw new Error(`TypeScript source export contains empty entry: ${entry.path}`);
    }
    seen.add(entry.path);
  }

  if (generated.manifest.files.length !== generated.entries.length) {
    throw new Error("TypeScript source manifest files must match generated entries.");
  }
  for (const file of generated.manifest.files) {
    if (!seen.has(file)) {
      throw new Error(`TypeScript source manifest references missing entry: ${file}`);
    }
  }
}

function buildTypeScriptPackageEntries(generated: TypeScriptSource): TypeScriptSourceEntry[] {
  const entries: TypeScriptSourceEntry[] = [
    { path: "manifest.json", content: `${JSON.stringify(generated.manifest, null, 2)}\n` },
    { path: "package.json", content: `${JSON.stringify(createTypeScriptPackageJson(generated.manifest), null, 2)}\n` },
    { path: "tsconfig.json", content: `${JSON.stringify(createTypeScriptTsconfig(), null, 2)}\n` },
    { path: "README.md", content: createTypeScriptReadme(generated.manifest) },
    ...generated.entries,
  ];
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

interface TypeScriptSourceEntry {
  path: string;
  content: string;
}

function createTypeScriptPackageJson(manifest: TypeScriptSourceManifest): Record<string, unknown> {
  return {
    name: "alice-web-typescript-source",
    private: true,
    type: "module",
    description: "Alice web TypeScript source export for an Alice project.",
    scripts: {
      typecheck: "tsc --noEmit",
    },
    devDependencies: {
      typescript: "^5.7.0",
    },
    alice: {
      product: manifest.product,
      runtime: manifest.runtime,
      projectName: manifest.projectName,
      entryPoint: manifest.entryPoint,
    },
  };
}

function createTypeScriptTsconfig(): Record<string, unknown> {
  return {
    compilerOptions: {
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ["src/**/*.ts"],
  };
}

function createTypeScriptReadme(manifest: TypeScriptSourceManifest): string {
  return [
    "# Alice web TypeScript source export",
    "",
    `Project: ${manifest.projectName}`,
    "",
    "This archive contains readable TypeScript source generated from an Alice project.",
    "It is intended for source handoff, review, and type-checking outside the running Alice web server.",
    "",
    "## Contents",
    "",
    "- `manifest.json` describes the deterministic export metadata.",
    "- `src/project.ts` assembles the generated Alice project.",
    "- `src/scene.ts` describes scene objects and runtime call recording.",
    "- `src/procedures/*.ts` contains generated Alice procedure and function source.",
    "- `src/runtime.ts` contains the small local runtime shim and explicit unsupported-behavior error.",
    "",
    "Run `npm install` and `npm run typecheck` in this directory to type-check the generated source.",
    "Unsupported Alice runtime behavior throws `UnsupportedAliceRuntimeBehavior` instead of being silently omitted.",
    "",
  ].join("\n");
}

function validateResourcePath(resource: ProjectExportResource): ProjectExportResource {
  if (ENCODED_PATH_CONTROL_RE.test(resource.path)) {
    throw new WebPackageInputError(`resource path must not contain encoded path controls: ${resource.path}`);
  }
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
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gltf")) return "model/gltf+json";
  if (path.endsWith(".glb")) return "model/gltf-binary";
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

function normalizeWebPackageOptions(
  project: Pick<AliceProject, "projectName">,
  options: WebPackageOptions,
): { title: string; metadata: Omit<HtmlExportMetadata, "preview">; teacher?: AliceWebTeacherShareMetadata } {
  const title = options.title?.trim() || project.projectName?.trim() || "Alice Project";
  const description = options.description?.trim();
  const canonicalUrl = options.canonicalUrl?.trim();
  if (canonicalUrl) {
    if (!isSafeHttpUrl(canonicalUrl)) {
      throw new WebPackageInputError("canonicalUrl must be a valid http or https URL");
    }
  }
  return {
    title,
    metadata: {
      ...(description ? { description } : {}),
      ...(canonicalUrl ? { canonicalUrl } : {}),
    },
    ...(options.teacher !== undefined ? { teacher: normalizeTeacherShareMetadata(options.teacher) } : {}),
  };
}

function normalizeTeacherShareMetadata(input: unknown): AliceWebTeacherShareMetadata {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new WebPackageInputError("teacher must be a JSON object");
  }
  const metadata = input as TeacherShareMetadata;
  const audience = normalizeOptionalText(metadata.audience, "teacher.audience");
  const lessonFocus = normalizeOptionalText(metadata.lessonFocus, "teacher.lessonFocus");
  const attribution = normalizeOptionalText(metadata.attribution, "teacher.attribution");
  const remix = metadata.remix ?? "allowed";
  if (typeof remix !== "string" || !["allowed", "with-attribution", "not-allowed"].includes(remix)) {
    throw new WebPackageInputError("teacher.remix must be allowed, with-attribution, or not-allowed");
  }
  return {
    schemaVersion: "alice-web.teacher-share/v1",
    ...(audience ? { audience } : {}),
    ...(lessonFocus ? { lessonFocus } : {}),
    remix,
    ...(attribution ? { attribution } : {}),
    tags: normalizeTextList(metadata.tags, "teacher.tags"),
    standards: normalizeTextList(metadata.standards, "teacher.standards"),
  };
}

function normalizeOptionalText(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new WebPackageInputError(`${fieldName} must be a string`);
  }
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTextList(values: unknown, fieldName: string): string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) {
    throw new WebPackageInputError(`${fieldName} must be an array of strings`);
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") {
      throw new WebPackageInputError(`${fieldName} must be an array of strings`);
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}

function validateTeacherShareMetadata(value: unknown): WebPackageValidationError[] {
  const errors: WebPackageValidationError[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [{
      code: "invalid-teacher-share-metadata",
      message: "teacher metadata must be an object",
      path: WEB_PACKAGE_ARTIFACTS.share,
    }];
  }
  const metadata = value as Partial<AliceWebTeacherShareMetadata>;
  for (const [fieldName, fieldValue] of Object.entries({
    audience: metadata.audience,
    lessonFocus: metadata.lessonFocus,
    attribution: metadata.attribution,
  })) {
    if (fieldValue !== undefined && typeof fieldValue !== "string") {
      errors.push({
        code: "invalid-teacher-share-metadata",
        message: `teacher ${fieldName} must be a string`,
        path: WEB_PACKAGE_ARTIFACTS.share,
      });
    }
  }
  if (metadata.schemaVersion !== "alice-web.teacher-share/v1") {
    errors.push({
      code: "invalid-teacher-share-metadata",
      message: "teacher metadata must use alice-web.teacher-share/v1",
      path: WEB_PACKAGE_ARTIFACTS.share,
    });
  }
  if (!["allowed", "with-attribution", "not-allowed"].includes(metadata.remix ?? "")) {
    errors.push({
      code: "invalid-teacher-share-metadata",
      message: "teacher remix policy must be allowed, with-attribution, or not-allowed",
      path: WEB_PACKAGE_ARTIFACTS.share,
    });
  }
  if (!Array.isArray(metadata.tags) || !metadata.tags.every((tag) => typeof tag === "string")) {
    errors.push({
      code: "invalid-teacher-share-metadata",
      message: "teacher tags must be strings",
      path: WEB_PACKAGE_ARTIFACTS.share,
    });
  }
  if (!Array.isArray(metadata.standards) || !metadata.standards.every((standard) => typeof standard === "string")) {
    errors.push({
      code: "invalid-teacher-share-metadata",
      message: "teacher standards must be strings",
      path: WEB_PACKAGE_ARTIFACTS.share,
    });
  }
  return errors;
}

function validatePackageCanonicalUrl(value: unknown): WebPackageValidationError | null {
  if (typeof value !== "string") {
    return {
      code: "invalid-canonical-url",
      message: "share canonicalUrl must be a valid http or https URL",
      path: WEB_PACKAGE_ARTIFACTS.share,
    };
  }
  if (isSafeHttpUrl(value)) {
    return null;
  }
  return {
    code: "invalid-canonical-url",
    message: "share canonicalUrl must be a valid http or https URL",
    path: WEB_PACKAGE_ARTIFACTS.share,
  };
}

function isSafeHttpUrl(value: string): boolean {
  if (URL_CONTROL_OR_SPACE_RE.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.href === value && (parsed.protocol === "http:" || parsed.protocol === "https:");
  } catch {
    return false;
  }
}

function validateShareDelivery(share: AliceWebShareDocument): WebPackageValidationError[] {
  if (
    share.delivery?.mode === "browser-download-fallback"
    && share.delivery.nativeWebShare === false
    && share.delivery.requiresUserDownload === true
  ) {
    return [];
  }
  return [{
    code: "invalid-share-delivery",
    message: "share delivery must be browser-download-fallback with nativeWebShare false and requiresUserDownload true",
    path: WEB_PACKAGE_ARTIFACTS.share,
  }];
}

function validateSharePackageLinks(share: AliceWebShareDocument, filename: string): WebPackageValidationError[] {
  const errors: WebPackageValidationError[] = [];
  if (!share.package || share.package.filename !== filename || share.package.mimeType !== ZIP_MIME_TYPE) {
    errors.push({
      code: "invalid-share-package-link",
      message: "share package metadata must match the validated ZIP filename and application/zip MIME type",
      path: WEB_PACKAGE_ARTIFACTS.share,
    });
  }
  if (!share.links || share.links.package !== filename || share.links.html !== WEB_PACKAGE_ARTIFACTS.entrypoint || share.links.preview !== WEB_PACKAGE_ARTIFACTS.preview) {
    errors.push({
      code: "invalid-share-package-link",
      message: "share links must point to the package, HTML entrypoint, and preview artifacts",
      path: WEB_PACKAGE_ARTIFACTS.share,
    });
  }
  return errors;
}

function buildPackageManifest(filename: string): AliceWebPackageManifest {
  return {
    schemaVersion: "alice-web.package/v1",
    product: ALICE_PRODUCT,
    packageName: ALICE_WEB_PACKAGE,
    runtimeIdentity: ALICE_WEB_PLAYER,
    entrypoint: WEB_PACKAGE_ARTIFACTS.entrypoint,
    preview: WEB_PACKAGE_ARTIFACTS.preview,
    share: WEB_PACKAGE_ARTIFACTS.share,
    validation: WEB_PACKAGE_ARTIFACTS.validation,
    project: WEB_PACKAGE_ARTIFACTS.project,
    package: {
      filename,
      mimeType: ZIP_MIME_TYPE,
    },
  };
}

function buildShareDocument(
  normalized: { title: string; metadata: Omit<HtmlExportMetadata, "preview">; teacher?: AliceWebTeacherShareMetadata },
  filename: string,
): AliceWebShareDocument {
  return {
    schemaVersion: "alice-web.share/v1",
    product: ALICE_PRODUCT,
    runtimeIdentity: ALICE_WEB_PLAYER,
    title: normalized.title,
    ...normalized.metadata,
    ...(normalized.teacher ? { teacher: normalized.teacher } : {}),
    preview: WEB_PACKAGE_ARTIFACTS.preview,
    package: {
      filename,
      mimeType: ZIP_MIME_TYPE,
    },
    delivery: {
      mode: "browser-download-fallback",
      nativeWebShare: false,
      requiresUserDownload: true,
    },
    links: {
      html: WEB_PACKAGE_ARTIFACTS.entrypoint,
      package: filename,
      preview: WEB_PACKAGE_ARTIFACTS.preview,
    },
  };
}

function buildValidationDocument(hasTeacherMetadata = false): AliceWebValidationDocument {
  return {
    schemaVersion: "alice-web.validation/v1",
    valid: true,
    errors: [],
    evidence: [
      "required-files-present",
      "entrypoint-playable",
      "alice-web-identity",
      ...(hasTeacherMetadata ? ["teacher-share-metadata"] : []),
    ],
  };
}

function buildPackageReference(filename: string, bytes: Uint8Array): WebPackageReference {
  return {
    filename,
    mimeType: ZIP_MIME_TYPE,
    sizeBytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function decodeBase64Package(base64: string): { ok: true; bytes: Uint8Array } | { ok: false; error: string } {
  const trimmed = base64.trim();
  if (!trimmed || trimmed.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) {
    return { ok: false, error: "packageBase64 must be valid base64" };
  }
  const bytes = Buffer.from(trimmed, "base64");
  if (bytes.length === 0 || bytes.toString("base64") !== trimmed.replace(/=+$/, "") + "=".repeat((4 - (trimmed.replace(/=+$/, "").length % 4)) % 4)) {
    return { ok: false, error: "packageBase64 must be valid base64" };
  }
  return { ok: true, bytes };
}

function buildValidationResult(
  evidence: string[],
  errors: WebPackageValidationError[],
  details: {
    runtime?: typeof ALICE_WEB_PACKAGE;
    package?: WebPackageReference;
    manifest?: AliceWebPackageManifest;
  } = {},
): WebPackageValidation {
  const valid = errors.length === 0;
  return {
    schema_version: "alice-web.validate-web-package-result/v1",
    status: valid ? "valid" : "invalid",
    valid,
    ...(details.runtime ? { runtime: details.runtime } : {}),
    ...(details.package ? { package: details.package } : {}),
    ...(details.manifest ? { manifest: details.manifest } : {}),
    evidence,
    errors,
  };
}

async function readJsonEntry<T>(zip: JSZip, path: string, errors: WebPackageValidationError[]): Promise<T | null> {
  const text = await readTextEntry(zip, path, errors);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    errors.push({ code: "invalid-json", message: `${path} must contain valid JSON`, path });
    return null;
  }
}

async function readTextEntry(zip: JSZip, path: string, errors: WebPackageValidationError[]): Promise<string | null> {
  const file = zip.file(path);
  if (!file) return null;
  try {
    return await file.async("string");
  } catch {
    errors.push({ code: "unreadable-entry", message: `${path} could not be read`, path });
    return null;
  }
}

function hasAliceWebIdentity(
  manifest: AliceWebPackageManifest | null,
  share: AliceWebShareDocument | null,
  validation: AliceWebValidationDocument | null,
  html: string | null,
): boolean {
  return (
    manifest?.schemaVersion === "alice-web.package/v1" &&
    manifest.product === ALICE_PRODUCT &&
    manifest.packageName === ALICE_WEB_PACKAGE &&
    manifest.runtimeIdentity === ALICE_WEB_PLAYER &&
    share?.schemaVersion === "alice-web.share/v1" &&
    share.product === ALICE_PRODUCT &&
    share.runtimeIdentity === ALICE_WEB_PLAYER &&
    validation?.schemaVersion === "alice-web.validation/v1" &&
    html !== null &&
    html.includes(ALICE_WEB_PLAYER)
  );
}

function containsForbiddenRepositoryIdentity(values: unknown[]): boolean {
  return values.some((value) => {
    if (value === null || value === undefined) return false;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return FORBIDDEN_IDENTITY_RE.test(text);
  });
}

function zipPathsAreSafe(zip: JSZip): boolean {
  for (const [path, file] of Object.entries(zip.files)) {
    const originalName = readUnsafeOriginalName(file) ?? path;
    if (
      ENCODED_PATH_CONTROL_RE.test(originalName)
      || ENCODED_PATH_CONTROL_RE.test(path)
      || conflictsWithReservedWebPackageArtifact(path)
      || conflictsWithReservedWebPackageArtifact(originalName)
    ) {
      return false;
    }
    try {
      const validate = file.dir ? validateArchivePath : assertSafeWritablePath;
      if (validate(originalName) !== originalName || (path && validate(path) !== path)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

function readUnsafeOriginalName(file: JSZip.JSZipObject): string | null {
  const value = (file as JSZip.JSZipObject & { unsafeOriginalName?: unknown }).unsafeOriginalName;
  return typeof value === "string" ? value : null;
}

function findDuplicateRequiredFiles(bytes: Uint8Array): string[] {
  const buffer = Buffer.from(bytes);
  const counts = new Map<string, number>();
  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) break;
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8");
    const canonicalRequiredName = RESERVED_WEB_PACKAGE_PATHS_BY_LOWERCASE.get(name.toLowerCase());
    if (canonicalRequiredName) {
      counts.set(canonicalRequiredName, (counts.get(canonicalRequiredName) ?? 0) + 1);
    }
    offset = nameEnd + extraLength + commentLength - 1;
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name]) => name);
}
