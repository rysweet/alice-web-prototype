import type { AliceProject } from "./a3p-parser";
import type { IdePerspectiveId } from "./menubar";

export interface WorkspaceSelection {
  kind: string;
  id: string;
  path?: readonly string[];
  metadata?: Record<string, unknown>;
}

export interface WorkspaceWindowState {
  windowId: string;
  title: string;
  project: AliceProject | null;
  perspectiveId: IdePerspectiveId;
  selection: WorkspaceSelection | null;
  createdAt: number;
  updatedAt: number;
}

export interface SerializedWorkspace {
  version: 1;
  currentWindowId: string | null;
  windows: readonly WorkspaceWindowState[];
}

export interface OpenWorkspaceWindowOptions {
  windowId?: string;
  title?: string;
  project?: AliceProject | null;
  perspectiveId?: IdePerspectiveId;
  selection?: WorkspaceSelection | null;
  timestamp?: number;
}

export interface WorkspaceManagerOptions {
  defaultPerspectiveId?: IdePerspectiveId;
  createWindowId?: () => string;
}

export const WORKSPACE_SCHEMA_VERSION = 1;
export const DEFAULT_WORKSPACE_PERSPECTIVE: IdePerspectiveId = "scene-setup";

let nextWindowId = 0;

function createDefaultWindowId(): string {
  nextWindowId += 1;
  return `workspace-${nextWindowId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneProject(project: AliceProject | null): AliceProject | null {
  return project ? deepClone(project) : null;
}

function cloneSelection(selection: WorkspaceSelection | null): WorkspaceSelection | null {
  if (!selection) {
    return null;
  }
  return {
    kind: selection.kind,
    id: selection.id,
    path: selection.path ? [...selection.path] : undefined,
    metadata: selection.metadata ? deepClone(selection.metadata) : undefined,
  };
}

function cloneWindowState(window: WorkspaceWindowState): WorkspaceWindowState {
  return {
    windowId: window.windowId,
    title: window.title,
    project: cloneProject(window.project),
    perspectiveId: window.perspectiveId,
    selection: cloneSelection(window.selection),
    createdAt: window.createdAt,
    updatedAt: window.updatedAt,
  };
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeProject(project: unknown): AliceProject | null {
  if (!isRecord(project)) {
    return null;
  }
  if (
    typeof project.version !== "string" ||
    typeof project.projectName !== "string" ||
    !Array.isArray(project.sceneObjects) ||
    !Array.isArray(project.methods)
  ) {
    return null;
  }
  return cloneProject(project as unknown as AliceProject);
}

function normalizeSelection(selection: unknown): WorkspaceSelection | null {
  if (!isRecord(selection)) {
    return null;
  }
  if (typeof selection.kind !== "string" || typeof selection.id !== "string") {
    return null;
  }
  return {
    kind: selection.kind,
    id: selection.id,
    path: Array.isArray(selection.path)
      ? selection.path.filter((entry): entry is string => typeof entry === "string")
      : undefined,
    metadata: isRecord(selection.metadata) ? deepClone(selection.metadata) : undefined,
  };
}

function normalizeTitle(
  title: unknown,
  project: AliceProject | null,
  windowId: string,
): string {
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  const projectName = project?.projectName?.trim();
  return projectName || windowId;
}

function normalizePerspectiveId(
  perspectiveId: unknown,
  fallback: IdePerspectiveId,
): IdePerspectiveId {
  return typeof perspectiveId === "string" && perspectiveId.trim()
    ? perspectiveId
    : fallback;
}

export class WorkspaceManager {
  private readonly windows = new Map<string, WorkspaceWindowState>();
  private readonly defaultPerspectiveId: IdePerspectiveId;
  private readonly createWindowId: () => string;
  private currentId: string | null = null;

  constructor(options: WorkspaceManagerOptions = {}) {
    this.defaultPerspectiveId =
      options.defaultPerspectiveId ?? DEFAULT_WORKSPACE_PERSPECTIVE;
    this.createWindowId = options.createWindowId ?? createDefaultWindowId;
  }

  get size(): number {
    return this.windows.size;
  }

  get currentWindowId(): string | null {
    return this.currentId;
  }

  get current(): WorkspaceWindowState | null {
    const current = this.currentId ? this.windows.get(this.currentId) ?? null : null;
    return current ? cloneWindowState(current) : null;
  }

  get currentProject(): AliceProject | null {
    return this.current?.project ?? null;
  }

  get currentPerspective(): IdePerspectiveId | null {
    return this.current?.perspectiveId ?? null;
  }

  get currentSelection(): WorkspaceSelection | null {
    return this.current?.selection ?? null;
  }

  listWindows(): WorkspaceWindowState[] {
    return Array.from(this.windows.values(), (window) => cloneWindowState(window));
  }

  getWindow(windowId: string): WorkspaceWindowState | null {
    const window = this.windows.get(windowId);
    return window ? cloneWindowState(window) : null;
  }

  openWindow(options: OpenWorkspaceWindowOptions = {}): WorkspaceWindowState {
    const timestamp = normalizeTimestamp(options.timestamp, Date.now());
    const requestedWindowId = options.windowId?.trim();
    const windowId = requestedWindowId || this.createWindowId();
    if (this.windows.has(windowId)) {
      throw new Error(`Workspace window already exists: ${windowId}`);
    }
    const project = cloneProject(options.project ?? null);
    const window: WorkspaceWindowState = {
      windowId,
      title: normalizeTitle(options.title, project, windowId),
      project,
      perspectiveId: options.perspectiveId ?? this.defaultPerspectiveId,
      selection: cloneSelection(options.selection ?? null),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.windows.set(windowId, window);
    this.currentId = windowId;
    return cloneWindowState(window);
  }

  switchWindow(windowId: string): WorkspaceWindowState {
    const window = this.windows.get(windowId);
    if (!window) {
      throw new Error(`Unknown workspace window: ${windowId}`);
    }
    this.currentId = windowId;
    return cloneWindowState(window);
  }

  closeWindow(windowId: string): WorkspaceWindowState | null {
    if (!this.windows.has(windowId)) {
      throw new Error(`Unknown workspace window: ${windowId}`);
    }
    this.windows.delete(windowId);
    if (this.currentId === windowId) {
      this.currentId = Array.from(this.windows.keys()).at(-1) ?? null;
    }
    return this.current;
  }

  updateProject(project: AliceProject | null, windowId?: string): WorkspaceWindowState {
    return this.patchWindow(this.requireWindowId(windowId), {
      project: cloneProject(project),
    });
  }

  updatePerspective(
    perspectiveId: IdePerspectiveId,
    windowId?: string,
  ): WorkspaceWindowState {
    return this.patchWindow(this.requireWindowId(windowId), {
      perspectiveId,
    });
  }

  updateSelection(
    selection: WorkspaceSelection | null,
    windowId?: string,
  ): WorkspaceWindowState {
    return this.patchWindow(this.requireWindowId(windowId), {
      selection: cloneSelection(selection),
    });
  }

  toJSON(): SerializedWorkspace {
    return {
      version: WORKSPACE_SCHEMA_VERSION,
      currentWindowId: this.currentId,
      windows: this.listWindows(),
    };
  }

  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  static fromJSON(
    serialized: string | SerializedWorkspace,
    options: WorkspaceManagerOptions = {},
  ): WorkspaceManager {
    const parsed =
      typeof serialized === "string"
        ? (JSON.parse(serialized) as SerializedWorkspace)
        : serialized;
    const manager = new WorkspaceManager(options);
    const rawWindows = Array.isArray(parsed.windows) ? parsed.windows : [];

    for (const rawWindow of rawWindows) {
      if (!isRecord(rawWindow)) {
        continue;
      }
      const timestamp = normalizeTimestamp(rawWindow.updatedAt, Date.now());
      const windowId =
        typeof rawWindow.windowId === "string" && rawWindow.windowId.trim()
          ? rawWindow.windowId
          : manager.createWindowId();
      if (manager.windows.has(windowId)) {
        continue;
      }
      const project = normalizeProject(rawWindow.project);
      const window: WorkspaceWindowState = {
        windowId,
        title: normalizeTitle(rawWindow.title, project, windowId),
        project,
        perspectiveId: normalizePerspectiveId(
          rawWindow.perspectiveId,
          manager.defaultPerspectiveId,
        ),
        selection: normalizeSelection(rawWindow.selection),
        createdAt: normalizeTimestamp(rawWindow.createdAt, timestamp),
        updatedAt: timestamp,
      };
      manager.windows.set(windowId, window);
    }

    const restoredCurrentId =
      typeof parsed.currentWindowId === "string" ? parsed.currentWindowId : null;
    manager.currentId =
      restoredCurrentId && manager.windows.has(restoredCurrentId)
        ? restoredCurrentId
        : Array.from(manager.windows.keys())[0] ?? null;
    return manager;
  }

  private patchWindow(
    windowId: string,
    patch: Partial<Omit<WorkspaceWindowState, "windowId" | "createdAt">>,
  ): WorkspaceWindowState {
    const current = this.windows.get(windowId);
    if (!current) {
      throw new Error(`Unknown workspace window: ${windowId}`);
    }
    const updated: WorkspaceWindowState = {
      windowId,
      title:
        patch.title === undefined
          ? current.title
          : normalizeTitle(patch.title, patch.project ?? current.project, windowId),
      project:
        patch.project === undefined ? current.project : cloneProject(patch.project),
      perspectiveId: patch.perspectiveId ?? current.perspectiveId,
      selection:
        patch.selection === undefined
          ? current.selection
          : cloneSelection(patch.selection),
      createdAt: current.createdAt,
      updatedAt: Date.now(),
    };
    this.windows.set(windowId, updated);
    return cloneWindowState(updated);
  }

  private requireWindowId(windowId?: string): string {
    const resolved = windowId ?? this.currentId;
    if (!resolved) {
      throw new Error("No workspace window is open.");
    }
    if (!this.windows.has(resolved)) {
      throw new Error(`Unknown workspace window: ${resolved}`);
    }
    return resolved;
  }
}

export function serializeWorkspace(workspace: WorkspaceManager): string {
  return workspace.serialize();
}

export function restoreWorkspace(
  serialized: string | SerializedWorkspace,
  options: WorkspaceManagerOptions = {},
): WorkspaceManager {
  return WorkspaceManager.fromJSON(serialized, options);
}
