import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProjectPersistence,
  diffSnapshots,
  type JsonValue,
  type PersistenceStateSnapshot,
  type PersistenceStateStore,
} from "../src/persistence.js";

class MemoryStateStore<T extends JsonValue> implements PersistenceStateStore<T> {
  private state: PersistenceStateSnapshot<T> = { projects: [], versions: [] };

  async loadState(): Promise<PersistenceStateSnapshot<T>> {
    return JSON.parse(JSON.stringify(this.state)) as PersistenceStateSnapshot<T>;
  }

  async saveState(state: PersistenceStateSnapshot<T>): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state)) as PersistenceStateSnapshot<T>;
  }
}

describe("persistence", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves projects offline with version history", async () => {
    const persistence = new ProjectPersistence({
      store: new MemoryStateStore(),
      now: createNow([100, 200]),
      createVersionId: (projectId, sequence) => `${projectId}-v${sequence}`,
    });

    await persistence.saveProject("project-1", "Starter", {
      sceneObjects: [{ name: "ground" }],
      methods: [],
    });
    const secondSave = await persistence.saveProject("project-1", "Starter", {
      sceneObjects: [{ name: "ground" }, { name: "rabbit" }],
      methods: [{ name: "myFirstMethod" }],
    });

    const loaded = await persistence.loadProject("project-1");
    const projects = await persistence.listProjects();
    const versions = await persistence.getProjectVersions("project-1");

    expect(loaded).toEqual({
      sceneObjects: [{ name: "ground" }, { name: "rabbit" }],
      methods: [{ name: "myFirstMethod" }],
    });
    expect(projects).toHaveLength(1);
    expect(projects[0].latestVersionId).toBe("project-1-v2");
    expect(versions.map((version) => version.versionId)).toEqual([
      "project-1-v2",
      "project-1-v1",
    ]);
    expect(secondSave.version.diff).toEqual([
      {
        path: "$.methods[0]",
        kind: "added",
        after: { name: "myFirstMethod" },
      },
      {
        path: "$.sceneObjects[1]",
        kind: "added",
        after: { name: "rabbit" },
      },
    ]);
  });

  it("diffs nested versions between saves", async () => {
    const persistence = new ProjectPersistence({
      store: new MemoryStateStore(),
      now: createNow([10, 20]),
      createVersionId: (projectId, sequence) => `${projectId}-v${sequence}`,
    });

    await persistence.saveProject("project-1", "Story", {
      sceneObjects: [{ name: "rabbit", color: "white" }],
      methods: [],
    });
    await persistence.saveProject("project-1", "Story", {
      sceneObjects: [{ name: "rabbit", color: "blue" }],
      methods: [{ name: "jump" }],
    });

    const diff = await persistence.diffProjectVersions(
      "project-1",
      "project-1-v1",
      "project-1-v2",
    );

    expect(diff).toEqual([
      {
        path: "$.methods[0]",
        kind: "added",
        after: { name: "jump" },
      },
      {
        path: "$.sceneObjects[0].color",
        kind: "changed",
        before: "white",
        after: "blue",
      },
    ]);
  });

  it("auto-saves on a configurable interval and skips unchanged snapshots", async () => {
    vi.useFakeTimers();

    let snapshot = {
      sceneObjects: [{ name: "ground" }],
      methods: [],
    } satisfies JsonValue;
    const persistence = new ProjectPersistence({
      store: new MemoryStateStore(),
      now: createNow([100, 200, 300]),
      createVersionId: (projectId, sequence) => `${projectId}-v${sequence}`,
      defaultAutoSaveIntervalMs: 500,
    });
    const autoSaver = persistence.createAutoSaver({
      projectId: "project-1",
      name: "Autosave Story",
      capture: () => snapshot,
      intervalMs: 25,
    });

    autoSaver.start();
    await vi.advanceTimersByTimeAsync(24);
    expect(await persistence.getProjectVersions("project-1")).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1);
    expect(await persistence.getProjectVersions("project-1")).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(25);
    expect(await persistence.getProjectVersions("project-1")).toHaveLength(1);

    snapshot = {
      sceneObjects: [{ name: "ground" }, { name: "rabbit" }],
      methods: [],
    };
    await vi.advanceTimersByTimeAsync(25);

    const projects = await persistence.listProjects();
    const versions = await persistence.getProjectVersions("project-1");
    autoSaver.stop();

    expect(versions).toHaveLength(2);
    expect(projects[0].autoSaveIntervalMs).toBe(25);
  });

  it("prunes old versions when a max storage budget is exceeded", async () => {
    const persistence = new ProjectPersistence({
      store: new MemoryStateStore(),
      now: createNow([10, 20, 30, 40]),
      createVersionId: (projectId, sequence) => `${projectId}-v${sequence}`,
      maxBytes: 1_100,
    });

    await persistence.saveProject("project-1", "Budgeted", {
      content: "a".repeat(240),
    });
    await persistence.saveProject("project-1", "Budgeted", {
      content: "b".repeat(240),
    });
    const thirdSave = await persistence.saveProject("project-1", "Budgeted", {
      content: "c".repeat(240),
    });

    const versions = await persistence.getProjectVersions("project-1");

    expect(thirdSave.quota.prunedVersions).toBeGreaterThan(0);
    expect(versions[0]?.versionId).toBe("project-1-v3");
    expect(versions.map((version) => version.versionId)).not.toContain("project-1-v1");
    expect(versions.length).toBeLessThan(3);
  });

  it("computes structural diffs directly", () => {
    const diff = diffSnapshots(
      {
        sceneObjects: [{ name: "rabbit", color: "white" }],
        methods: [],
      },
      {
        sceneObjects: [{ name: "rabbit", color: "blue" }],
        methods: [{ name: "jump" }],
      },
    );

    expect(diff).toEqual([
      {
        path: "$.methods[0]",
        kind: "added",
        after: { name: "jump" },
      },
      {
        path: "$.sceneObjects[0].color",
        kind: "changed",
        before: "white",
        after: "blue",
      },
    ]);
  });
});

function createNow(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}
