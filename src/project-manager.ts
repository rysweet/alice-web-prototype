/**
 * Project lifecycle manager: create, open, save, close with dirty tracking
 * and LRU recent files (capped at 10).
 */
import { readProject, writeProject, type AliceProjectArchive } from "./project-io";
import type { AliceProject } from "./a3p-parser";

export interface RecentFile {
  fileName: string;
  timestamp: number;
}

const MAX_RECENT_FILES = 10;

export class ProjectManager {
  private _archive: AliceProjectArchive | null = null;
  private _fileName: string | null = null;
  private _dirty = false;
  private _recentFiles: RecentFile[] = [];

  get isOpen(): boolean {
    return this._archive !== null;
  }

  get isDirty(): boolean {
    return this._dirty;
  }

  get currentArchive(): AliceProjectArchive | null {
    return this._archive;
  }

  get fileName(): string | null {
    return this._fileName;
  }

  get recentFiles(): RecentFile[] {
    return [...this._recentFiles];
  }

  create(): AliceProjectArchive {
    const project: AliceProject = {
      version: "3.6.0.0",
      projectName: "Untitled",
      sceneObjects: [],
      methods: [],
    };
    const archive: AliceProjectArchive = {
      project,
      manifest: null,
      resources: new Map(),
      thumbnail: null,
    };
    this._archive = archive;
    this._fileName = null;
    this._dirty = false;
    return archive;
  }

  async open(data: ArrayBuffer | Uint8Array, fileName: string): Promise<void> {
    const archive = await readProject(data);
    this._archive = archive;
    this._fileName = fileName;
    this._dirty = false;
    this._addRecentFile(fileName);
  }

  async save(): Promise<Uint8Array> {
    if (!this._archive) {
      throw new Error(
        "No project is loaded. Open or create a project before saving.",
      );
    }
    const result = await writeProject(this._archive);
    this._dirty = false;
    return result;
  }

  close(): void {
    this._archive = null;
    this._fileName = null;
    this._dirty = false;
  }

  markDirty(): void {
    if (!this._archive) {
      throw new Error("No project is open. Cannot mark as dirty.");
    }
    this._dirty = true;
  }

  clearDirty(): void {
    this._dirty = false;
  }

  clearRecentFiles(): void {
    this._recentFiles = [];
  }

  private _lastTimestamp = 0;

  private _addRecentFile(fileName: string): void {
    this._recentFiles = this._recentFiles.filter(
      (r) => r.fileName !== fileName,
    );
    const timestamp = Math.max(Date.now(), this._lastTimestamp + 1);
    this._lastTimestamp = timestamp;
    this._recentFiles.unshift({ fileName, timestamp });
    if (this._recentFiles.length > MAX_RECENT_FILES) {
      this._recentFiles = this._recentFiles.slice(0, MAX_RECENT_FILES);
    }
  }
}
