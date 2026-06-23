import type {
  ImportedProjectAsset,
  ImportedProjectAssetKind,
  MaterialBinding,
} from "./a3p-parser.js";

export type { ImportedProjectAsset, ImportedProjectAssetKind, MaterialBinding };

export interface ImportedAssetUpload {
  kind: ImportedProjectAssetKind;
  fileName: string;
  displayName?: string;
  bytes: Uint8Array;
}

export interface ImportedAssetCreation {
  asset: ImportedProjectAsset;
  projectResourceId: string;
  archivePath: string;
  resourceBytes: Uint8Array;
}

type SceneObjectWithMaterialBindings = {
  materialBindings?: MaterialBinding[];
};

const MODEL_EXTENSIONS = new Set([".gltf", ".glb"]);
const TEXTURE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const ENCODED_PATH_CONTROL_RE = /%(?:2e|2f|5c)/i;
const WINDOWS_DRIVE_PREFIX_RE = /^[A-Za-z]:/;

const CONTENT_TYPES: Record<string, string> = {
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export function createImportedProjectAsset(
  upload: ImportedAssetUpload,
  existingAssets: ImportedProjectAsset[] = [],
  existingArchivePaths: Iterable<string> = [],
): ImportedAssetCreation {
  if (upload.bytes.byteLength === 0) {
    throw new Error("Imported asset payload must not be empty");
  }

  const parsed = parseSafeFilename(upload.fileName);
  assertSupportedExtension(upload.kind, parsed.extension);

  const baseSlug = slugify(parsed.baseName);
  if (!baseSlug) {
    throw new Error("Imported asset filename becomes empty after sanitization");
  }

  const fileName = dedupeFileName(
    baseSlug,
    parsed.extension,
    upload.kind,
    existingAssets,
    existingArchivePaths,
  );
  const projectResourceId = projectResourceIdFor(upload.kind, fileName);
  const archivePath = projectResourceIdToArchivePath(projectResourceId);
  const displayName = upload.displayName?.trim() || titleFromBaseName(parsed.baseName);

  return {
    projectResourceId,
    archivePath,
    resourceBytes: upload.bytes,
    asset: {
      id: projectResourceId,
      kind: upload.kind,
      name: displayName,
      fileName,
      resourcePath: archivePath,
      contentType: CONTENT_TYPES[parsed.extension]!,
      byteLength: upload.bytes.byteLength,
    },
  };
}

export function projectResourceIdToArchivePath(projectResourceId: string): string {
  if (!projectResourceId.startsWith("project/")) {
    throw new Error(`Expected a project resource ID, got "${projectResourceId}"`);
  }

  if (projectResourceId.startsWith("project/models/")) {
    return `resources/models/${projectResourceId.slice("project/models/".length)}`;
  }

  if (projectResourceId.startsWith("project/textures/")) {
    return `resources/textures/${projectResourceId.slice("project/textures/".length)}`;
  }

  throw new Error(`Unsupported project resource ID "${projectResourceId}"`);
}

export function archivePathToProjectResourceId(archivePath: string): string {
  if (archivePath.startsWith("resources/models/")) {
    return `project/models/${archivePath.slice("resources/models/".length)}`;
  }

  if (archivePath.startsWith("resources/textures/")) {
    return `project/textures/${archivePath.slice("resources/textures/".length)}`;
  }

  throw new Error(`Unsupported archive resource path "${archivePath}"`);
}

export function applySurfaceTextureBinding<T extends SceneObjectWithMaterialBindings>(
  object: T,
  textureResourceId: string,
): T & { materialBindings: MaterialBinding[] } {
  if (!textureResourceId.startsWith("project/textures/")) {
    throw new Error(`Expected a texture project resource ID, got "${textureResourceId}"`);
  }

  return {
    ...object,
    materialBindings: [
      ...(object.materialBindings ?? []).filter((binding) => binding.target !== "surface"),
      {
        target: "surface",
        textureResourceId,
      },
    ],
  };
}

function projectResourceIdFor(kind: ImportedProjectAssetKind, fileName: string): string {
  return kind === "model"
    ? `project/models/${fileName}`
    : `project/textures/${fileName}`;
}

function parseSafeFilename(fileName: string): { baseName: string; extension: string } {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw new Error("Imported asset filename must not be empty");
  }

  if (ENCODED_PATH_CONTROL_RE.test(trimmed)) {
    throw new Error("Imported asset filename must not contain encoded path traversal or separators");
  }

  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error("Imported asset filename must not contain path traversal or separators");
  }

  if (WINDOWS_DRIVE_PREFIX_RE.test(trimmed)) {
    throw new Error("Imported asset filename must not be an absolute path");
  }

  const extensionStart = trimmed.lastIndexOf(".");
  if (extensionStart <= 0 || extensionStart === trimmed.length - 1) {
    throw new Error("Imported asset filename must include a supported extension");
  }

  return {
    baseName: trimmed.slice(0, extensionStart),
    extension: trimmed.slice(extensionStart).toLowerCase(),
  };
}

function assertSupportedExtension(kind: ImportedProjectAssetKind, extension: string): void {
  const supported = kind === "model" ? MODEL_EXTENSIONS : TEXTURE_EXTENSIONS;
  if (!supported.has(extension)) {
    throw new Error(`Unsupported ${kind} asset extension "${extension}"`);
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleFromBaseName(baseName: string): string {
  return baseName
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeFileName(
  baseSlug: string,
  extension: string,
  kind: ImportedProjectAssetKind,
  existingAssets: ImportedProjectAsset[],
  existingArchivePaths: Iterable<string>,
): string {
  const existingIds = new Set(existingAssets.map((asset) => asset.id));
  const existingPaths = new Set(existingArchivePaths);
  let suffix = 1;
  let candidate = `${baseSlug}${extension}`;

  while (
    existingIds.has(projectResourceIdFor(kind, candidate))
    || existingPaths.has(projectResourceIdToArchivePath(projectResourceIdFor(kind, candidate)))
  ) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}${extension}`;
  }

  return candidate;
}
