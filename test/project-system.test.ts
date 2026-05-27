import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import type { AutoSaveScheduler } from "../src/project-system.js";
import {
  AutoSave,
  ProjectCreator,
  ProjectDiff,
  ProjectRestorer,
  ProjectSaver,
  RecentProjects,
} from "../src/project-system.js";

class FakeScheduler implements AutoSaveScheduler {
  callback: (() => void) | null = null;

  setInterval(callback: () => void): unknown {
    this.callback = callback;
    return 1;
  }

  clearInterval(): void {
    this.callback = null;
  }

  tick(): void {
    this.callback?.();
  }
}

describe("project-system", () => {
  it("creates blank and template-backed archives", () => {
    const creator = new ProjectCreator();

    const blank = creator.create({ projectName: "Blank" });
    const templated = creator.create({ templateId: "empty-world", projectName: "Template" });

    expect(blank.project.projectName).toBe("Blank");
    expect(templated.project.projectName).toBe("Template");
    expect(creator.listAvailableTemplates().some((template) => template.id === "empty-world")).toBe(true);
  });

  it("saves restores and diffs project archives", async () => {
    const creator = new ProjectCreator();
    const saver = new ProjectSaver();
    const restorer = new ProjectRestorer();
    const diff = new ProjectDiff();
    const archive = creator.create({ projectName: "RoundTrip" });
    archive.project.sceneObjects.push({
      name: "bunny",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.BunnyResource",
      position: { x: 1, y: 2, z: 3 },
      orientation: null,
      size: null,
    });

    const bytes = await saver.saveProject(archive);
    const restored = await restorer.restoreProject(bytes);
    const changes = diff.diffProjects(
      archive.project,
      {
        ...archive.project,
        projectName: "Changed",
      },
    );

    expect(restored.project.projectName).toBe("RoundTrip");
    expect(restored.project.sceneObjects[0]?.name).toBe("bunny");
    expect(changes.some((entry) => entry.path === "/projectName" && entry.kind === "changed")).toBe(true);

    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file("programType.xml") ?? zip.file("program.xml")).toBeTruthy();
  });

  it("auto-saves through a configurable scheduler and tracks recent projects as an mru", async () => {
    const scheduler = new FakeScheduler();
    const saved: string[] = [];
    const autoSave = new AutoSave({
      intervalMs: 5,
      scheduler,
      save: async () => {
        saved.push(`save-${saved.length + 1}`);
        return saved.at(-1)!;
      },
    });

    autoSave.start();
    scheduler.tick();
    await autoSave.flush();
    autoSave.setInterval(10);
    autoSave.stop();

    const recent = new RecentProjects(2);
    recent.add({ path: "a3p/one.a3p", projectName: "One", version: "3.10.0.0", openedAt: 1 });
    recent.add({ path: "a3p/two.a3p", projectName: "Two", version: "3.10.0.0", openedAt: 2 });
    recent.add({ path: "a3p/one.a3p", projectName: "One again", version: "3.10.0.0", openedAt: 3 });

    expect(saved.length).toBeGreaterThan(0);
    expect(autoSave.runCount).toBeGreaterThan(0);
    expect(autoSave.isRunning).toBe(false);
    expect(recent.list().map((entry) => entry.path)).toEqual(["a3p/one.a3p", "a3p/two.a3p"]);
  });
});
