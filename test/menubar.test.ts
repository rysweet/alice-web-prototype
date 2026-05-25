import { beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { Clipboard } from "../src/clipboard";
import { IdeMenuBarModel } from "../src/menubar";
import { ProjectManager } from "../src/project-manager";
import { TutorialSystem } from "../src/tutorial-system";
import { UndoRedoManager, type Command } from "../src/undo-redo";

const SYNTHETIC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="aaa" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="bbb">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields"><collection type="java.util.ArrayList"/></property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
</node>`;

beforeAll(() => {
  if (typeof globalThis.DOMParser === "undefined") {
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

async function buildSyntheticZip(projectName = "MenuProject"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("version.txt", "3.6.0.0");
  zip.file("programType.xml", SYNTHETIC_XML);
  zip.file("manifest.json", JSON.stringify({ projectName, createdBy: "menubar-test" }));
  return zip.generateAsync({ type: "uint8array" });
}

class CountingCommand implements Command {
  executeCount = 0;
  undoCount = 0;

  get description(): string {
    return "count";
  }

  execute(): void {
    this.executeCount += 1;
  }

  undo(): void {
    this.undoCount += 1;
  }
}

describe("IdeMenuBarModel", () => {
  it("builds file, edit, window, and help menus in parity order", () => {
    const model = new IdeMenuBarModel({
      projectManager: new ProjectManager(),
      undoRedoManager: new UndoRedoManager(),
      clipboard: new Clipboard(),
      fileActions: {
        requestOpen: async () => null,
        requestSaveAsFileName: async () => null,
      },
      tutorialSystem: new TutorialSystem([]),
    });

    expect(model.menus.map((menu) => menu.id)).toEqual([
      "file",
      "edit",
      "window",
      "help",
    ]);
    expect(model.fileMenu.items.map((item) => item.id)).toEqual([
      "new",
      "open",
      "save",
      "save-as",
      "export",
      "close",
    ]);
    expect(model.editMenu.items.map((item) => item.id)).toEqual([
      "undo",
      "redo",
      "cut",
      "copy",
      "paste",
    ]);
    expect(model.windowMenu.items.map((item) => item.id)).toEqual([
      "scene-setup",
      "code-editor",
      "events",
    ]);
    expect(model.helpMenu.items.map((item) => item.id)).toEqual([
      "about",
      "tutorial",
    ]);
  });

  it("runs the file menu workflow for new, open, save, save-as, export, and close", async () => {
    const projectManager = new ProjectManager();
    const consumedSaves: Array<{ fileName: string; size: number }> = [];
    const exports: string[] = [];
    const model = new IdeMenuBarModel({
      projectManager,
      undoRedoManager: new UndoRedoManager(),
      clipboard: new Clipboard(),
      fileActions: {
        requestOpen: async () => ({
          data: await buildSyntheticZip("OpenedProject"),
          fileName: "opened.a3p",
        }),
        requestSaveAsFileName: async () => "saved-from-menu.a3p",
        consumeSavedProject: async (fileName, data) => {
          consumedSaves.push({ fileName, size: data.length });
        },
        handleExport: async (project) => {
          exports.push(project.mainClassName);
        },
      },
    });

    await model.getMenuItem("new").execute();
    expect(projectManager.isOpen).toBe(true);
    projectManager.currentArchive!.project.projectName = "MenuStory";
    projectManager.markDirty();

    await model.getMenuItem("save").execute();
    expect(projectManager.fileName).toBe("saved-from-menu.a3p");
    expect(consumedSaves).toHaveLength(1);
    expect(consumedSaves[0]?.size).toBeGreaterThan(0);

    await model.getMenuItem("open").execute();
    expect(projectManager.fileName).toBe("opened.a3p");
    expect(projectManager.currentArchive!.manifest?.projectName).toBe("OpenedProject");

    await model.getMenuItem("save-as").execute();
    expect(consumedSaves).toHaveLength(2);
    expect(projectManager.fileName).toBe("saved-from-menu.a3p");

    await model.getMenuItem("export").execute();
    expect(exports).toEqual(["Program"]);

    await model.getMenuItem("close").execute();
    expect(projectManager.isOpen).toBe(false);
  });

  it("wires undo, redo, cut, copy, and paste through menu actions", async () => {
    const undoRedoManager = new UndoRedoManager();
    const command = new CountingCommand();
    undoRedoManager.execute(command);

    const clipboard = new Clipboard();
    clipboard.copyCode("hero.jump();");
    const editCalls: string[] = [];
    const model = new IdeMenuBarModel({
      projectManager: new ProjectManager(),
      undoRedoManager,
      clipboard,
      clipboardActions: {
        canCut: () => true,
        canCopy: () => true,
        canPaste: (currentClipboard) => !currentClipboard.isEmpty,
        cut: async () => {
          editCalls.push("cut");
        },
        copy: async () => {
          editCalls.push("copy");
        },
        paste: async (currentClipboard) => {
          editCalls.push(`paste:${currentClipboard.pasteCode()}`);
        },
      },
    });

    model.refresh();
    expect(model.getMenuItem("undo").enabled).toBe(true);
    expect(model.getMenuItem("redo").enabled).toBe(false);

    await model.getMenuItem("undo").execute();
    expect(command.undoCount).toBe(1);
    expect(model.getMenuItem("redo").enabled).toBe(true);

    await model.getMenuItem("redo").execute();
    expect(command.executeCount).toBe(2);

    await model.getMenuItem("cut").execute();
    await model.getMenuItem("copy").execute();
    await model.getMenuItem("paste").execute();
    expect(editCalls).toEqual(["cut", "copy", "paste:hero.jump();"]);
  });

  it("switches perspectives from the window menu and tracks checked state", async () => {
    const model = new IdeMenuBarModel({
      projectManager: new ProjectManager(),
      undoRedoManager: new UndoRedoManager(),
      clipboard: new Clipboard(),
      perspectives: [
        { id: "scene", label: "Scene" },
        { id: "code", label: "Code" },
      ],
      initialPerspectiveId: "scene",
    });

    expect(model.currentPerspective).toBe("scene");
    expect(model.getMenuItem("scene").checked).toBe(true);
    expect(model.getMenuItem("code").checked).toBe(false);

    await model.getMenuItem("code").execute();

    expect(model.currentPerspective).toBe("code");
    expect(model.getMenuItem("scene").checked).toBe(false);
    expect(model.getMenuItem("code").checked).toBe(true);
  });

  it("builds help menu dialogs for about and tutorial", async () => {
    const tutorialSystem = new TutorialSystem([
      {
        id: "add-ground",
        instructionText: "Add the ground.",
        expectedAction: { type: "add-object", target: "ground" },
        hints: ["Open the gallery."],
        hintDelayMs: 0,
      },
    ]);
    const aboutCalls: string[] = [];
    const tutorialCalls: string[] = [];
    const model = new IdeMenuBarModel({
      projectManager: new ProjectManager(),
      undoRedoManager: new UndoRedoManager(),
      clipboard: new Clipboard(),
      tutorialSystem,
      about: {
        applicationName: "Alice Web Prototype",
        version: "test-version",
      },
      onAbout: async (about) => {
        aboutCalls.push(`${about.applicationName}:${about.version}:${about.helpTopicIds.length}`);
      },
      onTutorial: async (tutorial) => {
        tutorialCalls.push(`${tutorial.currentStepId}:${tutorial.availableHints.join(",")}`);
      },
    });

    await model.getMenuItem("about").execute();
    await model.getMenuItem("tutorial").execute();

    expect(aboutCalls).toHaveLength(1);
    expect(aboutCalls[0]).toMatch(/^Alice Web Prototype:test-version:\d+$/);
    expect(tutorialCalls).toEqual(["add-ground:Open the gallery."]);
  });
});
