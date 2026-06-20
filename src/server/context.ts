import * as fs from "fs";
import * as path from "path";
import { createInitialServerState, type ServerState } from "./state.js";
import { evidenceService, type EvidenceService } from "./evidence-service.js";
import { projectService, type ProjectService } from "./project-service.js";
import { screenshotService, type ScreenshotService } from "./screenshot-service.js";
import {
  createLocalApiSecurity,
  type LocalApiSecurity,
} from "./security.js";
import { templateService, type TemplateService } from "./template-service.js";

export interface ServerOptions {
  port: number;
  evidenceDir: string;
  projectPath?: string;
  allowedProjectDirs?: readonly string[];
  localApiToken?: string;
  allowedHosts?: readonly string[];
  allowedOrigins?: readonly string[];
}

export interface ServerContext {
  options: ServerOptions;
  evidenceDir: string;
  allowedProjectDirs: readonly string[];
  state: ServerState;
  evidenceService: EvidenceService;
  projectService: ProjectService;
  screenshotService: ScreenshotService;
  templateService: TemplateService;
  localApiSecurity: LocalApiSecurity;
}

export function createServerContext(options: ServerOptions): ServerContext {
  fs.mkdirSync(options.evidenceDir, { recursive: true });
  const allowedProjectDirs = options.allowedProjectDirs
    ?? [
      process.cwd(),
      ...(options.projectPath ? [path.dirname(options.projectPath)] : []),
    ];

  return {
    options,
    evidenceDir: options.evidenceDir,
    allowedProjectDirs,
    state: createInitialServerState(),
    evidenceService,
    projectService,
    screenshotService,
    templateService,
    localApiSecurity: createLocalApiSecurity({
      token: options.localApiToken,
      allowedHosts: options.allowedHosts,
      allowedOrigins: options.allowedOrigins,
    }),
  };
}
