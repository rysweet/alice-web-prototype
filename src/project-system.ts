import type { AliceProject } from "./a3p-parser.js";
import { snapshotAliceProject } from "./a3p-parser.js";
import type { AliceProjectArchive, WriteProjectOptions } from "./project-io.js";
import { readProject, writeProject } from "./project-io.js";
import {
  createEmptyWorldProject,
  createProjectFromTemplate,
  getProjectTemplate,
  listProjectTemplates,
  type ProjectTemplateOptions,
} from "./project-template.js";
import { getCurrentAliceVersion } from "./project-migration.js";

export interface ProjectCreationRequest extends ProjectTemplateOptions {
  templateId?: string | null;
}

export interface ProjectStateDiffEntry {
  readonly path: string;
  readonly kind: "added" | "removed" | "changed";
  readonly before?: unknown;
  readonly after?: unknown;
}

export interface RecentProjectEntry {
  readonly path: string;
  readonly projectName: string;
  readonly openedAt: number;
  readonly version: string | null;
}

export interface AutoSaveScheduler {
  setInterval(callback: () => void, intervalMs: number): unknown;
  clearInterval(handle: unknown): void;
}

function createVersionInfo(version = getCurrentAliceVersion()) {
  return {
    originalAliceVersion: version,
    detectedAliceVersion: version,
    manifestVersion: null,
    xmlVersion: null,
    versionSource: "default" as const,
    migrated: false,
    migrationSteps: [],
  };
}

function createArchive(project: AliceProject): AliceProjectArchive {
  return {
    project,
    manifest: null,
    resources: new Map(),
    resourceEntries: [],
    thumbnail: null,
    versionInfo: createVersionInfo(project.version),
  };
}

function normalizeProjectName(project: AliceProject): string {
  return project.projectName.trim() || "Untitled";
}

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function parseSnapshot(project: AliceProject): JsonLike {
  return JSON.parse(snapshotAliceProject(project)) as JsonLike;
}

function isRecord(value: JsonLike): value is { [key: string]: JsonLike } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function diffValues(path: string, left: JsonLike | undefined, right: JsonLike | undefined, diffs: ProjectStateDiffEntry[]): void {
  if (left === undefined && right !== undefined) {
    diffs.push({ path, kind: "added", after: right });
    return;
  }
  if (left !== undefined && right === undefined) {
    diffs.push({ path, kind: "removed", before: left });
    return;
  }
  if (left === right) {
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      diffValues(`${path}[${index}]`, left[index], right[index], diffs);
    }
    return;
  }
  if (isRecord(left as JsonLike) && isRecord(right as JsonLike)) {
    const leftRecord = left as { [key: string]: JsonLike };
    const rightRecord = right as { [key: string]: JsonLike };
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
    for (const key of [...keys].sort()) {
      diffValues(path === "/" ? `/${key}` : `${path}/${key}`, leftRecord[key], rightRecord[key], diffs);
    }
    return;
  }
  diffs.push({ path, kind: "changed", before: left, after: right });
}

const DEFAULT_SCHEDULER: AutoSaveScheduler = {
  setInterval(callback, intervalMs) {
    return globalThis.setInterval(callback, intervalMs);
  },
  clearInterval(handle) {
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>);
  },
};

export class ProjectCreator {
  createBlank(request: ProjectTemplateOptions = {}): AliceProjectArchive {
    return createArchive(createEmptyWorldProject(request));
  }

  createFromTemplate(templateId: string, request: ProjectTemplateOptions = {}): AliceProjectArchive {
    return createProjectFromTemplate(templateId, request);
  }

  create(request: ProjectCreationRequest = {}): AliceProjectArchive {
    const templateId = request.templateId?.trim();
    if (!templateId || templateId === "blank") {
      return this.createBlank(request);
    }
    if (!getProjectTemplate(templateId)) {
      throw new Error(`Unknown project template: ${templateId}`);
    }
    return this.createFromTemplate(templateId, request);
  }

  listAvailableTemplates(locale: string | null = null) {
    return listProjectTemplates(locale);
  }
}

export class ProjectSaver {
  async saveProject(archive: AliceProjectArchive, options: WriteProjectOptions = {}): Promise<Uint8Array> {
    archive.project.projectName = normalizeProjectName(archive.project);
    return writeProject(archive, options);
  }

  async saveProjectState(project: AliceProject, options: WriteProjectOptions = {}): Promise<Uint8Array> {
    return this.saveProject(createArchive({ ...project, projectName: normalizeProjectName(project) }), options);
  }
}

export class ProjectRestorer {
  async restoreProject(data: ArrayBuffer | Uint8Array): Promise<AliceProjectArchive> {
    return readProject(data);
  }
}

export class ProjectDiff {
  diffProjects(left: AliceProject, right: AliceProject): ProjectStateDiffEntry[] {
    const diffs: ProjectStateDiffEntry[] = [];
    diffValues("/", parseSnapshot(left), parseSnapshot(right), diffs);
    return diffs;
  }

  diffArchives(left: AliceProjectArchive, right: AliceProjectArchive): ProjectStateDiffEntry[] {
    return this.diffProjects(left.project, right.project);
  }
}

export interface AutoSaveOptions<T> {
  intervalMs?: number;
  save: () => Promise<T> | T;
  scheduler?: AutoSaveScheduler;
}

export class AutoSave<T = Uint8Array> {
  private readonly save: () => Promise<T> | T;
  private readonly scheduler: AutoSaveScheduler;
  private handle: unknown | null = null;
  private currentIntervalMs: number;
  private inFlight: Promise<T> | null = null;
  private runs = 0;
  private lastSavedAt: number | null = null;

  constructor(options: AutoSaveOptions<T>) {
    this.save = options.save;
    this.scheduler = options.scheduler ?? DEFAULT_SCHEDULER;
    this.currentIntervalMs = options.intervalMs ?? 30_000;
  }

  get intervalMs(): number {
    return this.currentIntervalMs;
  }

  get isRunning(): boolean {
    return this.handle !== null;
  }

  get runCount(): number {
    return this.runs;
  }

  get lastRunAt(): number | null {
    return this.lastSavedAt;
  }

  start(): void {
    if (this.isRunning) {
      return;
    }
    this.handle = this.scheduler.setInterval(() => {
      void this.flush();
    }, this.currentIntervalMs);
  }

  stop(): void {
    if (!this.isRunning) {
      return;
    }
    this.scheduler.clearInterval(this.handle);
    this.handle = null;
  }

  setInterval(intervalMs: number): void {
    if (!(intervalMs > 0)) {
      throw new Error("Auto-save interval must be greater than zero.");
    }
    this.currentIntervalMs = intervalMs;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  async flush(): Promise<T> {
    if (!this.inFlight) {
      this.inFlight = Promise.resolve(this.save()).then((result) => {
        this.runs += 1;
        this.lastSavedAt = Date.now();
        return result;
      }).finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }
}

export class RecentProjects {
  private readonly maxEntries: number;
  private entries: RecentProjectEntry[];

  constructor(maxEntries = 10, initialEntries: readonly RecentProjectEntry[] = []) {
    this.maxEntries = Math.max(1, maxEntries);
    this.entries = [];
    for (const entry of initialEntries) {
      this.add(entry);
    }
  }

  list(): RecentProjectEntry[] {
    return [...this.entries];
  }

  add(entry: Omit<RecentProjectEntry, "openedAt"> & { openedAt?: number }): void {
    const normalized: RecentProjectEntry = {
      ...entry,
      projectName: entry.projectName.trim() || "Untitled",
      openedAt: entry.openedAt ?? Date.now(),
    };
    this.entries = this.entries.filter((candidate) => candidate.path !== normalized.path);
    this.entries.unshift(normalized);
    if (this.entries.length > this.maxEntries) {
      this.entries.length = this.maxEntries;
    }
  }

  remove(path: string): void {
    this.entries = this.entries.filter((entry) => entry.path !== path);
  }

  clear(): void {
    this.entries = [];
  }
}
