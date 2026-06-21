import type { AliceProject } from "../a3p-parser.js";
import type { ProjectAudioWorkflowState } from "../project-audio.js";
import type { ProjectResourceKind, ProjectVersionInfo } from "../project-migration.js";

export type ProjectIoErrorCode =
  | "corrupted-archive"
  | "invalid-manifest"
  | "missing-audio-resource"
  | "missing-program-xml"
  | "unsafe-path"
  | "xml-parse"
  | "zip-bomb";

export class ProjectIoError extends Error {
  readonly code: ProjectIoErrorCode;
  override readonly cause?: unknown;

  constructor(code: ProjectIoErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ProjectIoError";
    this.code = code;
    this.cause = cause;
  }
}

export const ORIGINAL_XML_RESOURCE_PATH = "__original_xml__";

export const SPECIAL_PROJECT_IO_PATHS = new Set([
  ORIGINAL_XML_RESOURCE_PATH,
  "programType.xml",
  "program.xml",
  "manifest.json",
  "thumbnail.png",
  "version.txt",
]);

export interface ProjectResourceDescriptor {
  path: string;
  kind: ProjectResourceKind;
  size: number;
}

export interface ProjectResourceRecord {
  path: string;
  kind: ProjectResourceKind;
  bytes: Uint8Array;
}

/** Complete archive contents returned by readProject(). */
export interface AliceProjectArchive {
  project: AliceProject;
  manifest: Record<string, unknown> | null;
  resources: Map<string, Uint8Array>;
  resourceEntries: ProjectResourceDescriptor[];
  thumbnail: Uint8Array | null;
  versionInfo: ProjectVersionInfo;
  aliceAudio?: ProjectAudioWorkflowState;
}

export interface WriteProjectOptions {
  generateThumbnailFromScene?: boolean;
}
