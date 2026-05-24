/**
 * Project lifecycle manager: create, open, save, recover, and export.
 */
import { readProject, writeProject, type AliceProjectArchive } from "./project-io";
import type { AliceProject } from "./a3p-parser";
import { getCurrentAliceVersion } from "./project-migration";

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

export interface StandaloneJavaProject {
  projectName: string;
  packageName: string;
  mainClassName: string;
  files: Map<string, string | Uint8Array>;
}

const MAX_RECENT_FILES = 10;
const MAX_BACKUPS_PER_FILE = 10;

function cloneBytes(data: ArrayBuffer | Uint8Array): Uint8Array {
  if (data instanceof Uint8Array) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.slice(0));
}

function sanitizeJavaIdentifier(value: string, fallback: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_]/g, "_");
  const withPrefix = /^[A-Za-z_]/.test(cleaned) ? cleaned : `_${cleaned}`;
  return withPrefix.length > 0 ? withPrefix : fallback;
}

function sanitizePackageName(packageName: string): string {
  return packageName
    .split(".")
    .map((segment, index) => sanitizeJavaIdentifier(segment, index === 0 ? "alice" : "pkg"))
    .join(".");
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
    const result = await writeProject(this._archive);
    this._dirty = false;
    this._lastSavedData = new Uint8Array(result);
    if (this._fileName) {
      this._addRecentFile(this._fileName, this._archive);
    }
    return result;
  }

  exportToStandaloneJavaProject(
    packageName = "org.alice.generated",
  ): StandaloneJavaProject {
    if (!this._archive) {
      throw new Error("No project is open. Cannot export a Java project.");
    }

    const safePackageName = sanitizePackageName(packageName);
    const packagePath = safePackageName.replace(/\./g, "/");
    const mainClassName = sanitizeJavaIdentifier(
      this._archive.project.projectName || "AliceProject",
      "AliceProject",
    );
    const files = new Map<string, string | Uint8Array>();
    const methods = this._archive.project.methods
      .map((method) => {
        const returnType = method.isFunction ? mapJavaType(method.returnType) : "void";
        const parameters = method.parameters
          .map((parameter) => `${mapJavaType(parameter.type)} ${sanitizeJavaIdentifier(parameter.name, "arg")}`)
          .join(", ");
        const defaultReturn = method.isFunction ? `\n    return ${defaultJavaValue(method.returnType)};` : "";
        return `  public static ${returnType} ${sanitizeJavaIdentifier(method.name, "method")}` +
          `(${parameters}) {${defaultReturn}\n  }`;
      })
      .join("\n\n");

    const javaSource = `package ${safePackageName};\n\npublic final class ${mainClassName} {\n  private ${mainClassName}() {}\n\n  public static void main(String[] args) {\n    System.out.println(\"Alice project: ${escapeJavaString(this._archive.project.projectName)}\");\n    System.out.println(\"Scene objects: ${this._archive.project.sceneObjects.length}\");\n    System.out.println(\"Methods: ${this._archive.project.methods.length}\");\n  }${methods ? `\n\n${methods}` : ""}\n}\n`;

    files.set(
      `src/main/java/${packagePath}/${mainClassName}.java`,
      javaSource,
    );
    files.set(
      "pom.xml",
      buildPomXml(this._archive.project.projectName, safePackageName, mainClassName),
    );

    if (this._archive.manifest) {
      files.set(
        "src/main/resources/manifest.json",
        JSON.stringify(this._archive.manifest, null, 2),
      );
    }

    const originalXml = this._archive.resources.get("__original_xml__");
    if (originalXml) {
      files.set(
        "src/main/resources/programType.xml",
        new TextDecoder().decode(originalXml),
      );
    }

    for (const [path, bytes] of this._archive.resources) {
      if (path === "__original_xml__") continue;
      files.set(`src/main/resources/${path}`, new Uint8Array(bytes));
    }

    return {
      projectName: this._archive.project.projectName,
      packageName: safePackageName,
      mainClassName,
      files,
    };
  }

  close(): void {
    this._archive = null;
    this._fileName = null;
    this._dirty = false;
    this._lastSavedData = null;
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

function escapeJavaString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function mapJavaType(typeName: string): string {
  switch (typeName) {
    case "WholeNumber":
      return "int";
    case "DecimalNumber":
      return "double";
    case "Boolean":
      return "boolean";
    case "TextString":
      return "String";
    case "void":
      return "void";
    default:
      return sanitizeJavaIdentifier(typeName, "Object");
  }
}

function defaultJavaValue(typeName: string): string {
  switch (typeName) {
    case "WholeNumber":
      return "0";
    case "DecimalNumber":
      return "0.0";
    case "Boolean":
      return "false";
    case "TextString":
      return '""';
    default:
      return "null";
  }
}

function buildPomXml(
  projectName: string,
  packageName: string,
  mainClassName: string,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>${packageName}</groupId>\n  <artifactId>${sanitizeJavaIdentifier(projectName.toLowerCase() || "alice-project", "alice-project")}</artifactId>\n  <version>1.0.0-SNAPSHOT</version>\n  <properties>\n    <maven.compiler.source>17</maven.compiler.source>\n    <maven.compiler.target>17</maven.compiler.target>\n    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>\n  </properties>\n  <build>\n    <plugins>\n      <plugin>\n        <groupId>org.codehaus.mojo</groupId>\n        <artifactId>exec-maven-plugin</artifactId>\n        <version>3.5.0</version>\n        <configuration>\n          <mainClass>${packageName}.${mainClassName}</mainClass>\n        </configuration>\n      </plugin>\n    </plugins>\n  </build>\n</project>\n`;
}
