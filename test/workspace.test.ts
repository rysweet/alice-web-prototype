import { describe, expect, it } from "vitest";
import type { AliceProject } from "../src/a3p-parser";
import {
  DEFAULT_WORKSPACE_PERSPECTIVE,
  WorkspaceManager,
  restoreWorkspace,
  serializeWorkspace,
  type SerializedWorkspace,
} from "../src/workspace";

function createProject(projectName: string): AliceProject {
  return {
    version: "3.10.0.0",
    projectName,
    sceneObjects: [],
    methods: [],
  };
}

describe("WorkspaceManager", () => {
  it("tracks the current project, perspective, and selection without leaking external mutations", () => {
    const project = createProject("Starter Project");
    const workspace = new WorkspaceManager();

    workspace.openWindow({
      windowId: "main",
      project,
      perspectiveId: DEFAULT_WORKSPACE_PERSPECTIVE,
      selection: {
        kind: "scene-object",
        id: "ground",
        path: ["scene", "ground"],
        metadata: { source: "gallery" },
      },
    });
    project.projectName = "Mutated Outside Workspace";

    expect(workspace.currentProject?.projectName).toBe("Starter Project");
    expect(workspace.currentPerspective).toBe("scene-setup");
    expect(workspace.currentSelection).toEqual({
      kind: "scene-object",
      id: "ground",
      path: ["scene", "ground"],
      metadata: { source: "gallery" },
    });
  });

  it("serializes and restores multi-window state", () => {
    const workspace = new WorkspaceManager();
    workspace.openWindow({
      windowId: "main",
      project: createProject("Main Story"),
      perspectiveId: "code-editor",
      selection: { kind: "method", id: "myFirstMethod" },
      timestamp: 10,
    });
    workspace.openWindow({
      windowId: "secondary",
      title: "Secondary Preview",
      project: createProject("Preview Story"),
      perspectiveId: "events",
      selection: { kind: "event", id: "whenGreenFlagClicked" },
      timestamp: 20,
    });

    const restored = restoreWorkspace(serializeWorkspace(workspace));

    expect(restored.listWindows().map((window) => window.windowId)).toEqual([
      "main",
      "secondary",
    ]);
    expect(restored.current?.windowId).toBe("secondary");

    restored.switchWindow("main");
    expect(restored.currentProject?.projectName).toBe("Main Story");
    expect(restored.currentPerspective).toBe("code-editor");
    expect(restored.currentSelection?.id).toBe("myFirstMethod");
  });

  it("supports switching and closing windows while keeping a valid current window", () => {
    const workspace = new WorkspaceManager();
    workspace.openWindow({ windowId: "one", project: createProject("One") });
    workspace.openWindow({ windowId: "two", project: createProject("Two") });
    workspace.openWindow({ windowId: "three", project: createProject("Three") });

    workspace.switchWindow("two");
    const afterClose = workspace.closeWindow("two");

    expect(afterClose?.windowId).toBe("three");
    expect(workspace.listWindows().map((window) => window.windowId)).toEqual([
      "one",
      "three",
    ]);

    workspace.closeWindow("one");
    expect(workspace.current?.windowId).toBe("three");

    workspace.closeWindow("three");
    expect(workspace.current).toBeNull();
  });

  it("falls back to the first restored window when the saved current window is missing", () => {
    const serialized: SerializedWorkspace = {
      version: 1,
      currentWindowId: "missing-window",
      windows: [
        {
          windowId: "alpha",
          title: "Alpha",
          project: createProject("Alpha Story"),
          perspectiveId: "scene-setup",
          selection: null,
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    };

    const restored = restoreWorkspace(serialized);

    expect(restored.current?.windowId).toBe("alpha");
    expect(restored.currentProject?.projectName).toBe("Alpha Story");
  });

  it("throws when operations require a current window and none is open", () => {
    const workspace = new WorkspaceManager();

    expect(() => workspace.updatePerspective("events")).toThrow(
      "No workspace window is open.",
    );
    expect(() => workspace.switchWindow("missing")).toThrow(
      "Unknown workspace window: missing",
    );
  });
});
