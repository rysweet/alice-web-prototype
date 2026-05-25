export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ProjectDiffEntry {
  readonly path: string;
  readonly kind: "added" | "removed" | "changed";
  readonly before?: JsonValue;
  readonly after?: JsonValue;
}

export interface StoredProjectRecord<T extends JsonValue = JsonValue> {
  readonly projectId: string;
  readonly name: string;
  readonly currentSnapshot: T;
  readonly latestVersionId: string;
  readonly updatedAt: number;
  readonly sizeBytes: number;
  readonly versionCount: number;
  readonly autoSaveIntervalMs: number | null;
}

export interface StoredProjectVersion<T extends JsonValue = JsonValue> {
  readonly versionId: string;
  readonly projectId: string;
  readonly sequence: number;
  readonly savedAt: number;
  readonly snapshot: T;
  readonly snapshotSizeBytes: number;
  readonly diff: readonly ProjectDiffEntry[];
}

export interface PersistenceStateSnapshot<T extends JsonValue = JsonValue> {
  readonly projects: readonly StoredProjectRecord<T>[];
  readonly versions: readonly StoredProjectVersion<T>[];
}

export interface PersistenceStateStore<T extends JsonValue = JsonValue> {
  loadState(): Promise<PersistenceStateSnapshot<T>>;
  saveState(state: PersistenceStateSnapshot<T>): Promise<void>;
}

export interface ProjectSaveResult<T extends JsonValue = JsonValue> {
  readonly project: StoredProjectRecord<T>;
  readonly version: StoredProjectVersion<T>;
  readonly createdVersion: boolean;
  readonly quota: StorageQuotaInfo;
}

export interface StorageQuotaInfo {
  readonly usageBytes: number;
  readonly quotaBytes: number | null;
  readonly remainingBytes: number | null;
  readonly utilization: number | null;
  readonly maxBytes: number | null;
  readonly prunedVersions: number;
}

export interface SaveProjectOptions {
  readonly forceVersion?: boolean;
  readonly autoSaveIntervalMs?: number | null;
}

export interface ProjectPersistenceOptions<T extends JsonValue = JsonValue> {
  readonly store?: PersistenceStateStore<T>;
  readonly now?: () => number;
  readonly createVersionId?: (projectId: string, sequence: number) => string;
  readonly maxBytes?: number | null;
  readonly quotaProvider?: () => Promise<{ usage: number; quota: number } | null>;
  readonly defaultAutoSaveIntervalMs?: number;
}

export interface AutoSaveOptions<T extends JsonValue = JsonValue> {
  readonly projectId: string;
  readonly name: string;
  readonly capture: () => T;
  readonly intervalMs?: number;
  readonly forceVersion?: boolean;
}

const DATABASE_NAME = "alice-project-persistence";
const STORE_NAME = "state";
const STATE_KEY = "singleton";
export const DEFAULT_AUTO_SAVE_INTERVAL_MS = 30_000;

export class IndexedDbStateStore<T extends JsonValue = JsonValue>
  implements PersistenceStateStore<T>
{
  constructor(
    private readonly options: {
      readonly dbName?: string;
      readonly storeName?: string;
      readonly indexedDB?: IDBFactory;
    } = {},
  ) {}

  async loadState(): Promise<PersistenceStateSnapshot<T>> {
    const db = await this.openDatabase();
    try {
      const tx = db.transaction(this.storeName, "readonly");
      const store = tx.objectStore(this.storeName);
      const record = await requestToPromise<{ id: string; state: PersistenceStateSnapshot<T> } | undefined>(
        store.get(STATE_KEY),
      );
      await transactionToPromise(tx);
      return normalizeState(record?.state);
    } finally {
      db.close();
    }
  }

  async saveState(state: PersistenceStateSnapshot<T>): Promise<void> {
    const db = await this.openDatabase();
    try {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put({ id: STATE_KEY, state });
      await transactionToPromise(tx);
    } finally {
      db.close();
    }
  }

  private get indexedDbFactory(): IDBFactory {
    const factory = this.options.indexedDB ?? globalThis.indexedDB;
    if (!factory) {
      throw new Error("IndexedDB is not available in this environment.");
    }
    return factory;
  }

  private get dbName(): string {
    return this.options.dbName ?? DATABASE_NAME;
  }

  private get storeName(): string {
    return this.options.storeName ?? STORE_NAME;
  }

  private async openDatabase(): Promise<IDBDatabase> {
    const request = this.indexedDbFactory.open(this.dbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName, { keyPath: "id" });
      }
    };
    return requestToPromise(request);
  }
}

export class ProjectPersistence<T extends JsonValue = JsonValue> {
  private readonly store: PersistenceStateStore<T>;
  private readonly now: () => number;
  private readonly createVersionId: (projectId: string, sequence: number) => string;
  private readonly maxBytes: number | null;
  private readonly quotaProvider: () => Promise<{ usage: number; quota: number } | null>;
  private readonly defaultAutoSaveIntervalMs: number;

  constructor(options: ProjectPersistenceOptions<T> = {}) {
    this.store = options.store ?? new IndexedDbStateStore<T>();
    this.now = options.now ?? (() => Date.now());
    this.createVersionId = options.createVersionId ?? ((projectId, sequence) => `${projectId}-${sequence}-${this.now()}`);
    this.maxBytes = options.maxBytes ?? null;
    this.quotaProvider = options.quotaProvider ?? defaultQuotaProvider;
    this.defaultAutoSaveIntervalMs = validateInterval(
      options.defaultAutoSaveIntervalMs ?? DEFAULT_AUTO_SAVE_INTERVAL_MS,
    );
  }

  async saveProject(
    projectId: string,
    name: string,
    snapshot: T,
    options: SaveProjectOptions = {},
  ): Promise<ProjectSaveResult<T>> {
    const normalizedProjectId = normalizeIdentifier(projectId, "projectId");
    const normalizedName = normalizeName(name);
    const nextSnapshot = cloneJson(snapshot);
    const nextSizeBytes = estimateSerializedSize(nextSnapshot);
    const nextState = cloneState(await this.store.loadState());
    const previousProject = nextState.projects.find((project) => project.projectId === normalizedProjectId) ?? null;
    const previousVersion = previousProject
      ? nextState.versions.find((version) => version.versionId === previousProject.latestVersionId) ?? null
      : null;
    const diff = previousVersion ? diffSnapshots(previousVersion.snapshot, nextSnapshot) : [];
    const nextAutoSaveIntervalMs =
      options.autoSaveIntervalMs === undefined
        ? previousProject?.autoSaveIntervalMs ?? null
        : options.autoSaveIntervalMs;
    const createdVersion =
      previousVersion == null || options.forceVersion === true || diff.length > 0;
    const savedAt = this.now();
    const sequence = previousVersion?.sequence ?? 0;
    const version = createdVersion
      ? {
          versionId: this.createVersionId(normalizedProjectId, sequence + 1),
          projectId: normalizedProjectId,
          sequence: sequence + 1,
          savedAt,
          snapshot: nextSnapshot,
          snapshotSizeBytes: nextSizeBytes,
          diff,
        }
      : previousVersion;

    if (createdVersion) {
      nextState.versions.push(version);
    }

    const versionCount = nextState.versions.filter(
      (candidate) => candidate.projectId === normalizedProjectId,
    ).length;
    const projectRecord: StoredProjectRecord<T> = {
      projectId: normalizedProjectId,
      name: normalizedName,
      currentSnapshot: nextSnapshot,
      latestVersionId: version.versionId,
      updatedAt: createdVersion ? savedAt : previousProject?.updatedAt ?? savedAt,
      sizeBytes: nextSizeBytes,
      versionCount,
      autoSaveIntervalMs: nextAutoSaveIntervalMs,
    };
    nextState.projects = nextState.projects.filter(
      (project) => project.projectId !== normalizedProjectId,
    );
    nextState.projects.push(projectRecord);

    const { state: quotaManagedState, prunedVersions } = pruneStateToQuota(
      nextState,
      this.maxBytes,
    );
    await this.store.saveState(quotaManagedState);

    const persistedProject = quotaManagedState.projects
      .find((project) => project.projectId === normalizedProjectId);
    const persistedVersion = quotaManagedState.versions.find(
      (candidate) => candidate.versionId === version.versionId,
    ) ?? version;
    if (!persistedProject) {
      throw new Error(`Project ${normalizedProjectId} was pruned unexpectedly.`);
    }

    return {
      project: cloneProjectRecord(persistedProject),
      version: cloneProjectVersion(persistedVersion),
      createdVersion,
      quota: await this.buildQuotaInfo(quotaManagedState, prunedVersions),
    };
  }

  async loadProject(projectId: string): Promise<T | null> {
    const state = normalizeState(await this.store.loadState());
    const project = state.projects.find(
      (candidate) => candidate.projectId === projectId,
    );
    return project ? cloneJson(project.currentSnapshot) : null;
  }

  async listProjects(): Promise<StoredProjectRecord<T>[]> {
    const state = normalizeState(await this.store.loadState());
    return [...state.projects]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map(cloneProjectRecord);
  }

  async getProjectVersions(projectId: string): Promise<StoredProjectVersion<T>[]> {
    const state = normalizeState(await this.store.loadState());
    return state.versions
      .filter((version) => version.projectId === projectId)
      .sort((left, right) => right.sequence - left.sequence)
      .map(cloneProjectVersion);
  }

  async diffProjectVersions(
    projectId: string,
    leftVersionId: string,
    rightVersionId: string,
  ): Promise<ProjectDiffEntry[]> {
    const versions = await this.getProjectVersions(projectId);
    const left = versions.find((version) => version.versionId === leftVersionId);
    const right = versions.find((version) => version.versionId === rightVersionId);
    if (!left || !right) {
      throw new Error(`Project ${projectId} is missing one of the requested versions.`);
    }
    return diffSnapshots(left.snapshot, right.snapshot);
  }

  async deleteProject(projectId: string): Promise<void> {
    const state = cloneState(await this.store.loadState());
    state.projects = state.projects.filter((project) => project.projectId !== projectId);
    state.versions = state.versions.filter((version) => version.projectId !== projectId);
    await this.store.saveState(state);
  }

  async getQuotaInfo(): Promise<StorageQuotaInfo> {
    return this.buildQuotaInfo(normalizeState(await this.store.loadState()), 0);
  }

  createAutoSaver(options: AutoSaveOptions<T>): ProjectAutoSaver<T> {
    return new ProjectAutoSaver(this, options, this.defaultAutoSaveIntervalMs);
  }

  private async buildQuotaInfo(
    state: PersistenceStateSnapshot<T>,
    prunedVersions: number,
  ): Promise<StorageQuotaInfo> {
    const usageBytes = estimateStateSize(state);
    const externalEstimate = await this.quotaProvider();
    const quotaBytes = this.maxBytes ?? externalEstimate?.quota ?? null;
    const remainingBytes = quotaBytes == null ? null : Math.max(quotaBytes - usageBytes, 0);
    return {
      usageBytes,
      quotaBytes,
      remainingBytes,
      utilization: quotaBytes == null || quotaBytes === 0 ? null : usageBytes / quotaBytes,
      maxBytes: this.maxBytes,
      prunedVersions,
    };
  }
}

export class ProjectAutoSaver<T extends JsonValue = JsonValue> {
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSerializedSnapshot: string | null = null;

  constructor(
    private readonly persistence: ProjectPersistence<T>,
    private readonly options: AutoSaveOptions<T>,
    defaultIntervalMs: number,
  ) {
    this.intervalMs = validateInterval(options.intervalMs ?? defaultIntervalMs);
  }

  start(): this {
    if (this.timer == null) {
      this.timer = setInterval(() => {
        void this.flushIfChanged();
      }, this.intervalMs);
    }
    return this;
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async flush(): Promise<ProjectSaveResult<T>> {
    const snapshot = cloneJson(this.options.capture());
    const result = await this.persistence.saveProject(
      this.options.projectId,
      this.options.name,
      snapshot,
      {
        autoSaveIntervalMs: this.intervalMs,
        forceVersion: this.options.forceVersion,
      },
    );
    this.lastSerializedSnapshot = JSON.stringify(snapshot);
    return result;
  }

  async flushIfChanged(): Promise<ProjectSaveResult<T> | null> {
    const snapshot = cloneJson(this.options.capture());
    const serialized = JSON.stringify(snapshot);
    if (serialized === this.lastSerializedSnapshot) {
      return null;
    }
    const result = await this.persistence.saveProject(
      this.options.projectId,
      this.options.name,
      snapshot,
      {
        autoSaveIntervalMs: this.intervalMs,
        forceVersion: this.options.forceVersion,
      },
    );
    this.lastSerializedSnapshot = serialized;
    return result;
  }
}

export function diffSnapshots(
  previous: JsonValue,
  next: JsonValue,
): ProjectDiffEntry[] {
  const diff: ProjectDiffEntry[] = [];
  diffJson(previous, next, "$", diff);
  return diff;
}

function diffJson(
  previous: JsonValue | undefined,
  next: JsonValue | undefined,
  path: string,
  diff: ProjectDiffEntry[],
): void {
  if (previous === undefined && next !== undefined) {
    diff.push({ path, kind: "added", after: cloneMaybeJson(next) });
    return;
  }
  if (previous !== undefined && next === undefined) {
    diff.push({ path, kind: "removed", before: cloneMaybeJson(previous) });
    return;
  }
  if (previous === next) {
    return;
  }
  if (Array.isArray(previous) && Array.isArray(next)) {
    const length = Math.max(previous.length, next.length);
    for (let index = 0; index < length; index += 1) {
      diffJson(previous[index], next[index], `${path}[${index}]`, diff);
    }
    return;
  }
  if (isJsonObject(previous) && isJsonObject(next)) {
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of [...keys].sort()) {
      diffJson(
        previous[key],
        next[key],
        path === "$" ? `$.${key}` : `${path}.${key}`,
        diff,
      );
    }
    return;
  }
  diff.push({
    path,
    kind: "changed",
    before: cloneMaybeJson(previous),
    after: cloneMaybeJson(next),
  });
}

function cloneMaybeJson(value: JsonValue | undefined): JsonValue | undefined {
  return value === undefined ? undefined : cloneJson(value);
}

function isJsonObject(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return normalized;
}

function normalizeName(value: string): string {
  return normalizeIdentifier(value, "name");
}

function validateInterval(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Auto-save interval must be a positive finite number, got ${value}.`);
  }
  return value;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function estimateSerializedSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function cloneProjectRecord<T extends JsonValue>(
  project: StoredProjectRecord<T>,
): StoredProjectRecord<T> {
  return {
    ...project,
    currentSnapshot: cloneJson(project.currentSnapshot),
  };
}

function cloneProjectVersion<T extends JsonValue>(
  version: StoredProjectVersion<T>,
): StoredProjectVersion<T> {
  return {
    ...version,
    snapshot: cloneJson(version.snapshot),
    diff: version.diff.map((entry) => ({
      ...entry,
      before: cloneMaybeJson(entry.before),
      after: cloneMaybeJson(entry.after),
    })),
  };
}

function normalizeState<T extends JsonValue>(
  state: PersistenceStateSnapshot<T> | null | undefined,
): PersistenceStateSnapshot<T> {
  return {
    projects: state?.projects?.map(cloneProjectRecord) ?? [],
    versions: state?.versions?.map(cloneProjectVersion) ?? [],
  };
}

function cloneState<T extends JsonValue>(
  state: PersistenceStateSnapshot<T>,
): { projects: StoredProjectRecord<T>[]; versions: StoredProjectVersion<T>[] } {
  return {
    projects: state.projects.map(cloneProjectRecord),
    versions: state.versions.map(cloneProjectVersion),
  };
}

function estimateStateSize<T extends JsonValue>(state: PersistenceStateSnapshot<T>): number {
  return estimateSerializedSize(state);
}

function pruneStateToQuota<T extends JsonValue>(
  state: { projects: StoredProjectRecord<T>[]; versions: StoredProjectVersion<T>[] },
  maxBytes: number | null,
): {
  state: { projects: StoredProjectRecord<T>[]; versions: StoredProjectVersion<T>[] };
  prunedVersions: number;
} {
  if (maxBytes == null) {
    return { state, prunedVersions: 0 };
  }
  let prunedVersions = 0;
  const latestVersionIds = new Set(state.projects.map((project) => project.latestVersionId));
  const removable = [...state.versions]
    .filter((version) => !latestVersionIds.has(version.versionId))
    .sort((left, right) => left.savedAt - right.savedAt || left.sequence - right.sequence);

  while (estimateStateSize(state) > maxBytes && removable.length > 0) {
    const version = removable.shift();
    if (!version) {
      break;
    }
    state.versions = state.versions.filter(
      (candidate) => candidate.versionId !== version.versionId,
    );
    prunedVersions += 1;
  }

  state.projects = state.projects.map((project) => ({
    ...project,
    versionCount: state.versions.filter(
      (version) => version.projectId === project.projectId,
    ).length,
  }));

  return { state, prunedVersions };
}

async function defaultQuotaProvider(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || navigator.storage?.estimate == null) {
    return null;
  }
  const estimate = await navigator.storage.estimate();
  if (estimate.usage == null || estimate.quota == null) {
    return null;
  }
  return { usage: estimate.usage, quota: estimate.quota };
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionToPromise(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}
