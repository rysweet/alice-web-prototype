import * as fs from "fs";
import { createInitialServerState, type ServerState } from "./state.js";
import { evidenceService, type EvidenceService } from "./evidence-service.js";
import { projectService, type ProjectService } from "./project-service.js";
import { screenshotService, type ScreenshotService } from "./screenshot-service.js";
import { templateService, type TemplateService } from "./template-service.js";

export interface ServerOptions {
  port: number;
  evidenceDir: string;
  projectPath?: string;
  allowedProjectDirs?: readonly string[];
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
}

export function createServerContext(options: ServerOptions): ServerContext {
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  return {
    options,
    evidenceDir: options.evidenceDir,
    allowedProjectDirs: options.allowedProjectDirs ?? [process.cwd()],
    state: createInitialServerState(),
    evidenceService,
    projectService,
    screenshotService,
    templateService,
  };
}
