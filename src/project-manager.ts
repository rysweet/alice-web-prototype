/**
 * Project lifecycle manager: create, open, save, recover, and export.
 */
import { readProject, writeProject, type AliceProjectArchive } from "./project-io";
import type { AliceProject } from "./a3p-parser";
import { getCurrentAliceVersion } from "./project-migration";
import {
  generateStandaloneJavaProject,
  type StandaloneJavaProject,
} from "./standalone-project.js";

export interface RecentFile {
  fileName: string;
  timestamp: number;
  projectName: string | null;
  projectVersion: string | null;
  resourceCount: number;
  thumbnailPresent: boolean;
  migrated: boolean;
}

export interface ProjectBackup {
  fileName: string;
  timestamp: number;
  data: Uint8Array;
}

export interface RecoveryResult {
  archive: AliceProjectArchive;
  source: "input" | "backup";
  backup: ProjectBackup | null;
}

export type { StandaloneJavaProject } from "./standalone-project.js";

const MAX_RECENT_FILES = 10;
const MAX_BACKUPS_PER_FILE = 10;

function cloneBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.slice(0));
}

export class ProjectManager {
  private _archive: AliceProjectArchive | null = null;
  private _fileName: string | null = null;
  private _dirty = false;
  private _recentFiles: RecentFile[] = [];
  private _backupHistory: ProjectBackup[] = [];
  private _lastSavedData: Uint8Array | null = null;

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

  get backupHistory(): ProjectBackup[] {
    return this._backupHistory.map((backup) => ({
      ...backup,
      data: new Uint8Array(backup.data),
    }));
  }

  create(): AliceProjectArchive {
    const project: AliceProject = {
      version: getCurrentAliceVersion(),
      projectName: "Untitled",
      sceneObjects: [],
      methods: [],
    };
    const archive: AliceProjectArchive = {
      project,
      manifest: null,
      resources: new Map(),
      resourceEntries: [],
      thumbnail: null,
      versionInfo: {
        originalAliceVersion: project.version,
        detectedAliceVersion: project.version,
        manifestVersion: null,
        xmlVersion: null,
        versionSource: "default",
        migrated: false,
        migrationSteps: [],
      },
    };
    this._archive = archive;
    this._fileName = null;
    this._dirty = false;
    this._lastSavedData = null;
    return archive;
  }

  async open(data: ArrayBuffer | Uint8Array, fileName: string): Promise<void> {
    const archive = await readProject(data);
    this._archive = archive;
    this._fileName = fileName;
    this._dirty = false;
    this._lastSavedData = cloneBytes(data);
    this._addRecentFile(fileName, archive);
  }

  async recoverCorruptedProject(
    data: ArrayBuffer | Uint8Array,
    fileName: string,
  ): Promise<RecoveryResult> {
    try {
      await this.open(data, fileName);
      return {
        archive: this._archive!,
        source: "input",
        backup: null,
      };
    } catch (error) {
      const backup = this._findLatestBackup(fileName);
      if (!backup) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to recover '${fileName}': ${message}`);
      }
      const archive = await readProject(backup.data);
      this._archive = archive;
      this._fileName = fileName;
      this._dirty = false;
      this._lastSavedData = new Uint8Array(backup.data);
      this._addRecentFile(fileName, archive);
      return {
        archive,
        source: "backup",
        backup: {
          ...backup,
          data: new Uint8Array(backup.data),
        },
      };
    }
  }

  async save(): Promise<Uint8Array> {
    if (!this._archive) {
      throw new Error(
        "No project is loaded. Open or create a project before saving.",
      );
    }
    if (this._fileName && this._lastSavedData) {
      this._addBackup(this._fileName, this._lastSavedData);
    }
    const result = await this._serializeCurrentArchive();
    this._dirty = false;
    this._lastSavedData = new Uint8Array(result);
    if (this._fileName) {
      this._addRecentFile(this._fileName, this._archive);
    }
    return result;
  }

  async saveAs(fileName: string): Promise<Uint8Array> {
    if (!this._archive) {
      throw new Error(
        "No project is loaded. Open or create a project before saving.",
      );
    }
    const normalizedFileName = fileName.trim();
    if (!normalizedFileName) {
      throw new Error("A non-empty file name is required for Save As.");
    }
    const result = await this._serializeCurrentArchive();
    this._fileName = normalizedFileName;
    this._dirty = false;
    this._lastSavedData = new Uint8Array(result);
    this._addRecentFile(this._fileName, this._archive);
    return result;
  }

  exportToStandaloneJavaProject(
    packageName = "org.alice.generated",
  ): StandaloneJavaProject {
    if (!this._archive) {
      throw new Error("No project is open. Cannot export a Java project.");
    }

    return generateStandaloneJavaProject(this._archive, {
      packageName,
      buildSystem: "both",
    });
  }

  close(): void {
    this._archive = null;
    this._fileName = null;
    this._dirty = false;
    this._lastSavedData = null;
  }

  async revertToLastSaved(): Promise<void> {
    if (!this._archive) {
      throw new Error("No project is open. Cannot revert.");
    }
    if (!this._lastSavedData) {
      throw new Error("No saved state to revert to");
    }
    const archive = await readProject(this._lastSavedData);
    this._archive = archive;
    this._dirty = false;
  }

  async createBackup(_label?: string): Promise<void> {
    if (!this._archive) {
      throw new Error("No project is open. Cannot create backup.");
    }
    const data = await this._serializeCurrentArchive();
    this._addBackup(this._fileName ?? "Untitled", data);
  }

  async restoreFromBackup(timestamp: number): Promise<void> {
    if (!Number.isFinite(timestamp)) {
      throw new TypeError(`timestamp must be a finite number, got ${timestamp}`);
    }
    const backup = this._backupHistory.find((b) => b.timestamp === timestamp);
    if (!backup) {
      throw new Error(`No backup found with timestamp ${timestamp}`);
    }
    const archive = await readProject(backup.data);
    this._archive = archive;
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

  clearBackups(fileName?: string): void {
    if (!fileName) {
      this._backupHistory = [];
      return;
    }
    this._backupHistory = this._backupHistory.filter(
      (backup) => backup.fileName !== fileName,
    );
  }

  private async _serializeCurrentArchive(): Promise<Uint8Array> {
    return writeProject(this._archive!, {
      generateThumbnailFromScene: this._archive!.thumbnail == null,
    });
  }

  getBackups(fileName?: string): ProjectBackup[] {
    return this.backupHistory.filter(
      (backup) => fileName == null || backup.fileName === fileName,
    );
  }

  private _findLatestBackup(fileName: string): ProjectBackup | null {
    return this._backupHistory.find((backup) => backup.fileName === fileName) ?? null;
  }

  private _addBackup(fileName: string, data: Uint8Array): void {
    const backup: ProjectBackup = {
      fileName,
      timestamp: Date.now(),
      data: new Uint8Array(data),
    };
    const fileBackups = this._backupHistory.filter(
      (entry) => entry.fileName === fileName,
    );
    const otherBackups = this._backupHistory.filter(
      (entry) => entry.fileName !== fileName,
    );
    fileBackups.unshift(backup);
    this._backupHistory = [
      ...otherBackups,
      ...fileBackups.slice(0, MAX_BACKUPS_PER_FILE),
    ].sort((a, b) => b.timestamp - a.timestamp);
  }

  private _addRecentFile(fileName: string, archive: AliceProjectArchive | null = this._archive): void {
    this._recentFiles = this._recentFiles.filter(
      (r) => r.fileName !== fileName,
    );
    this._recentFiles.unshift({
      fileName,
      timestamp: Date.now(),
      projectName: archive?.project.projectName ?? null,
      projectVersion: archive?.versionInfo.detectedAliceVersion ?? archive?.project.version ?? null,
      resourceCount: archive?.resourceEntries.length ?? 0,
      thumbnailPresent: archive?.thumbnail !== null,
      migrated: archive?.versionInfo.migrated ?? false,
    });
    if (this._recentFiles.length > MAX_RECENT_FILES) {
      this._recentFiles = this._recentFiles.slice(0, MAX_RECENT_FILES);
    }
  }
}
