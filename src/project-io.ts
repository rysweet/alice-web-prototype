import type JSZip from "jszip";
import {
  A3PArchiveLimitError,
  DEFAULT_A3P_XML_ENTRY,
  parseA3PFromZip,
  readA3PXmlEntry,
  type AliceProject,
  type AliceMethod,
  type AliceStatement,
  type A3PParseOptions,
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
  AUDIO_MANIFEST_KEY,
  ProjectAudioError,
  applyProjectAudioWorkflowManifest,
  serializeProjectAudioWorkflowManifest,
  type ProjectAudioWorkflowState,
} from "./project-audio.js";
import {
  validateAliceWorkflowState,
  type AliceWorkflowState,
} from "./alice-workflow-state.js";
import {
  ORIGINAL_XML_RESOURCE_PATH,
  ProjectIoError,
  type AliceProjectArchive,
  type ProjectIoErrorCode,
  type ProjectResourceDescriptor,
  type WriteProjectOptions,
} from "./project-io/types.js";
import { synchronizeManifestVersion } from "./project-migration.js";

export type ReadProjectOptions = A3PParseOptions;

export {
  ProjectIoError,
  type AliceProjectArchive,
  type ProjectIoErrorCode,
  type ProjectResourceDescriptor,
  type WriteProjectOptions,
};
export { generateThumbnailFromProjectScene };
export {
  exportClassBehaviorPackage,
  importClassBehaviorPackage,
  parseClassBehaviorPackage,
  serializeClassBehaviorPackage,
  type AliceClassBehaviorPackage,
  type ClassBehaviorConflictStrategy,
  type ClassBehaviorImportResult,
} from "./project-io/class-behavior-package.js";

/**
 * Read an .a3p archive and return the parsed project, manifest, resources, thumbnail,
 * detected version metadata, and classified extracted resources.
 */
export async function readProject(
  data: ArrayBuffer | Uint8Array,
  options: ReadProjectOptions = {},
): Promise<AliceProjectArchive> {
  const zip = await loadProjectZip(data, options);
  const safeEntries = listSafeZipEntries(zip);

  const manifest = parseManifestText(await readZipText(zip, "manifest.json"));
  const xmlEntry = await readXmlEntry(zip, options);
  const versionText = await readZipText(zip, "version.txt");
  const thumbnail = await readProjectThumbnail(zip);
  const migration = migrateProjectArchiveXml(xmlEntry.text, versionText, manifest, {
    hasArchiveResources: hasExternalArchiveResources(safeEntries.map((entry) => entry.path), xmlEntry.name),
  });
  const nextManifest = synchronizeManifestVersion(manifest, migration.versionInfo);

  zip.file(xmlEntry.name, migration.xmlText);
  zip.file("version.txt", migration.versionInfo.detectedAliceVersion);

  const project = await parseProject(zip, options);
  project.version = migration.versionInfo.detectedAliceVersion;
  const aliceWorkflowMethods = readAliceWorkflowMethods(nextManifest);
  if (aliceWorkflowMethods) {
    project.methods = aliceWorkflowMethods;
  }

  function hasExternalArchiveResources(entryPaths: readonly string[], xmlEntryName: string): boolean {
    const archiveMetadata = new Set([
      xmlEntryName,
      "manifest.json",
      "version.txt",
      "thumbnail.png",
    ]);
    return entryPaths.some((path) => !archiveMetadata.has(path));
  }

  const storedXmlBytes = encodeOriginalXml({
    entryName: xmlEntry.name,
    xmlText: migration.xmlText,
  });
  const resources = new Map<string, Uint8Array>();
  resources.set(ORIGINAL_XML_RESOURCE_PATH, storedXmlBytes);

  const resourceRecords = await extractProjectResources(safeEntries, storedXmlBytes.length);
  for (const record of resourceRecords) {
    resources.set(record.path, record.bytes);
  }
  const aliceAudio = readAliceAudioState(nextManifest, resources);
  const aliceWorkflow = readAliceWorkflowState(nextManifest);

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
    ...(aliceAudio ? { aliceAudio } : {}),
    ...(aliceWorkflow ? { aliceWorkflow } : {}),
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
  const manifest = buildManifestForWrite(archive);

  return writeA3P(archive.project, {
    xmlEntryName: originalXml?.entryName ?? DEFAULT_A3P_XML_ENTRY,
    baseXmlText: originalXml?.xmlText ?? null,
    manifest,
    thumbnail,
    resources: archive.resources,
    preserveSourceEntries: false,
  });
}

function buildManifestForWrite(archive: AliceProjectArchive): Record<string, unknown> | null {
  const baseManifest = archive.manifest ?? null;
  if (!archive.aliceAudio && !archive.aliceWorkflow) {
    return baseManifest;
  }

  return {
    ...(baseManifest ?? {}),
    ...(archive.aliceAudio
      ? { [AUDIO_MANIFEST_KEY]: serializeProjectAudioWorkflowManifest(archive.aliceAudio) }
      : {}),
    ...(archive.aliceWorkflow
      ? {
        aliceWorkflow: validateAliceWorkflowState(archive.aliceWorkflow),
        aliceWorkflowMethods: archive.project.methods.map(cloneAliceWorkflowMethod),
      }
      : {}),
  };
}

function readAliceAudioState(
  manifest: Record<string, unknown> | null,
  resources: Map<string, Uint8Array>,
): ProjectAudioWorkflowState | null {
  const audioManifest = manifest?.[AUDIO_MANIFEST_KEY];
  if (!audioManifest || typeof audioManifest !== "object" || Array.isArray(audioManifest)) {
    return null;
  }
  if (!("schemaVersion" in audioManifest)) {
    return null;
  }
  try {
    return applyProjectAudioWorkflowManifest(audioManifest, resources);
  } catch (error) {
    if (error instanceof ProjectAudioError && error.message.includes("missing audio resource bytes")) {
      throw new ProjectIoError("missing-audio-resource", error.message, error);
    }
    throw new ProjectIoError("invalid-manifest", "Invalid aliceAudio manifest.", error);
  }
}

function readAliceWorkflowState(
  manifest: Record<string, unknown> | null,
): AliceWorkflowState | null {
  const workflowManifest = manifest?.aliceWorkflow;
  if (!workflowManifest || typeof workflowManifest !== "object" || Array.isArray(workflowManifest)) {
    return null;
  }

  if (!("schemaVersion" in workflowManifest)) {
    return null;
  }
  try {
    return validateAliceWorkflowState(workflowManifest);
  } catch (error) {
    throw new ProjectIoError("invalid-manifest", "Invalid aliceWorkflow manifest.", error);
  }
}

function readAliceWorkflowMethods(
  manifest: Record<string, unknown> | null,
): AliceMethod[] | null {
  const workflowMethods = manifest?.aliceWorkflowMethods;
  if (workflowMethods === undefined) {
    return null;
  }
  if (!Array.isArray(workflowMethods)) {
    throw new ProjectIoError("invalid-manifest", "aliceWorkflowMethods must be an array.");
  }
  try {
    return workflowMethods.map((method, index) => validateAliceWorkflowMethod(method, `aliceWorkflowMethods[${index}]`));
  } catch (error) {
    if (error instanceof ProjectIoError) {
      throw error;
    }
    throw new ProjectIoError("invalid-manifest", "Invalid aliceWorkflowMethods manifest.", error);
  }
}

function validateAliceWorkflowMethod(value: unknown, path: string): AliceMethod {
  assertManifestRecord(value, path);
  const method = value as Record<string, unknown>;
  return {
    name: readManifestString(method.name, `${path}.name`),
    isFunction: readManifestBoolean(method.isFunction, `${path}.isFunction`),
    returnType: readManifestString(method.returnType, `${path}.returnType`),
    parameters: readManifestParameters(method.parameters, `${path}.parameters`),
    statements: readManifestStatements(method.statements, `${path}.statements`),
  };
}

function cloneAliceWorkflowMethod(method: AliceMethod): AliceMethod {
  return {
    name: method.name,
    isFunction: method.isFunction,
    returnType: method.returnType,
    parameters: method.parameters.map((parameter) => ({ name: parameter.name, type: parameter.type })),
    statements: method.statements.map(cloneAliceWorkflowStatement),
  };
}

function cloneAliceWorkflowStatement(statement: AliceStatement): AliceStatement {
  return {
    ...statement,
    arguments: statement.arguments ? [...statement.arguments] : undefined,
    body: statement.body?.map(cloneAliceWorkflowStatement),
    ifBody: statement.ifBody?.map(cloneAliceWorkflowStatement),
    elseBody: statement.elseBody?.map(cloneAliceWorkflowStatement),
    tryBody: statement.tryBody?.map(cloneAliceWorkflowStatement),
    catchBody: statement.catchBody?.map(cloneAliceWorkflowStatement),
    cases: statement.cases?.map((entry) => ({
      value: entry.value,
      body: entry.body.map(cloneAliceWorkflowStatement),
    })),
    defaultCase: statement.defaultCase?.map(cloneAliceWorkflowStatement) ?? statement.defaultCase,
  };
}

function readManifestParameters(value: unknown, path: string): Array<{ name: string; type: string }> {
  if (!Array.isArray(value)) {
    throw new ProjectIoError("invalid-manifest", `${path} must be an array.`);
  }
  return value.map((parameter, index) => {
    assertManifestRecord(parameter, `${path}[${index}]`);
    return {
      name: readManifestString(parameter.name, `${path}[${index}].name`),
      type: readManifestString(parameter.type, `${path}[${index}].type`),
    };
  });
}

function readManifestStatements(value: unknown, path: string): AliceStatement[] {
  if (!Array.isArray(value)) {
    throw new ProjectIoError("invalid-manifest", `${path} must be an array.`);
  }
  return value.map((statement, index) => validateAliceWorkflowStatement(statement, `${path}[${index}]`));
}

function validateAliceWorkflowStatement(value: unknown, path: string): AliceStatement {
  assertManifestRecord(value, path);
  const statement = value as Record<string, unknown>;
  const result: AliceStatement = {
    kind: readManifestString(statement.kind, `${path}.kind`),
  };
  copyOptionalString(statement, result, "object", path);
  copyOptionalString(statement, result, "method", path);
  copyOptionalString(statement, result, "collection", path);
  copyOptionalString(statement, result, "condition", path);
  copyOptionalString(statement, result, "event", path);
  copyOptionalString(statement, result, "expression", path);
  copyOptionalString(statement, result, "name", path);
  copyOptionalString(statement, result, "varType", path);
  copyOptionalString(statement, result, "value", path);
  copyOptionalString(statement, result, "countExpression", path);
  if (statement.arguments !== undefined) {
    result.arguments = readManifestStringArray(statement.arguments, `${path}.arguments`);
  }
  if (statement.count !== undefined) {
    result.count = readManifestNumber(statement.count, `${path}.count`);
  }
  if (statement.body !== undefined) {
    result.body = readManifestStatements(statement.body, `${path}.body`);
  }
  if (statement.ifBody !== undefined) {
    result.ifBody = readManifestStatements(statement.ifBody, `${path}.ifBody`);
  }
  if (statement.elseBody !== undefined) {
    result.elseBody = readManifestStatements(statement.elseBody, `${path}.elseBody`);
  }
  return result;
}

function assertManifestRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProjectIoError("invalid-manifest", `${path} must be an object.`);
  }
}

function readManifestString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new ProjectIoError("invalid-manifest", `${path} must be a string.`);
  }
  return value;
}

function readManifestBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProjectIoError("invalid-manifest", `${path} must be a boolean.`);
  }
  return value;
}

function readManifestNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectIoError("invalid-manifest", `${path} must be a finite number.`);
  }
  return value;
}

function readManifestStringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) {
    throw new ProjectIoError("invalid-manifest", `${path} must be an array.`);
  }
  return value.map((entry, index) => readManifestString(entry, `${path}[${index}]`));
}

function copyOptionalString(
  source: Record<string, unknown>,
  target: AliceStatement,
  key: keyof AliceStatement,
  path: string,
): void {
  if (source[key] !== undefined) {
    target[key] = readManifestString(source[key], `${path}.${String(key)}`) as never;
  }
}

async function readXmlEntry(
  zip: JSZip,
  options: ReadProjectOptions,
): Promise<{ name: string; text: string }> {
  try {
    return await readA3PXmlEntry(zip, options);
  } catch (error) {
    if (error instanceof A3PArchiveLimitError) {
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
      "corrupted-archive",
      "Failed to read project XML from .a3p archive.",
      error,
    );
  }
}

async function parseProject(zip: JSZip, options: ReadProjectOptions): Promise<AliceProject> {
  try {
    return await parseA3PFromZip(zip, options);
  } catch (error) {
    if (error instanceof A3PArchiveLimitError) {
      throw error;
    }
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
