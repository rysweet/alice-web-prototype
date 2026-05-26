import { describe, expect, it } from "vitest";
import {
  ArrayLiteralExpression,
  BlockStatement,
  ClassDeclaration,
  FieldDeclaration,
  ForEachLoop,
  IntegerLiteral,
  LocalVariableDeclarationStatement,
  MethodDeclaration,
  StringLiteral,
  simpleTypeRef,
} from "../src/ast-nodes.js";
import { ExpressionCascade } from "../src/cascade-menus.js";
import { CodeEditor } from "../src/code-editor.js";
import {
  createCurriculumMetadata,
  createCurriculumProgress,
  getMissingConceptsForLesson,
  isLessonUnlocked,
  recordDemonstratedConcept,
} from "../src/curriculum.js";
import { EntityEventSystem } from "../src/entity-events.js";
import { runGradingPipeline } from "../src/grading-pipeline.js";
import { ProjectManager } from "../src/project-manager.js";
import {
  ProjectPersistence,
  type JsonValue,
  type PersistenceStateSnapshot,
  type PersistenceStateStore,
} from "../src/persistence.js";
import { SceneEditor } from "../src/scene-editor.js";
import { MoveDirection } from "../src/story-api/index.js";
import { TypeBrowser } from "../src/type-browser.js";
import type { AliceProject } from "../src/a3p-parser.js";

class MemoryStateStore<T extends JsonValue> implements PersistenceStateStore<T> {
  private state: PersistenceStateSnapshot<T> = { projects: [], versions: [] };

  async loadState(): Promise<PersistenceStateSnapshot<T>> {
    return JSON.parse(JSON.stringify(this.state)) as PersistenceStateSnapshot<T>;
  }

  async saveState(state: PersistenceStateSnapshot<T>): Promise<void> {
    this.state = JSON.parse(JSON.stringify(state)) as PersistenceStateSnapshot<T>;
  }
}

describe("cross-module integrations", () => {
  it("keeps scene editor state in sync with entity event actions", () => {
    const editor = new SceneEditor();
    editor.placeObject("hero", "org.lgna.story.SBox", { position: { x: 0, y: 0, z: 0 } });
    editor.placeObject("crate", "org.lgna.story.SBox", { position: { x: 0, y: 0, z: -2 } });

    const system = new EntityEventSystem({
      hero: editor.getObject("hero")!,
      crate: editor.getObject("crate")!,
    });
    system.bindKeyPressedMove("hero", "w", MoveDirection.FORWARD, 2);
    system.bindProximityResponse("hero", "crate", 0.5, [
      { entity: "target", action: { kind: "say", text: "Reached" } },
    ]);

    const moveResult = system.fireKeyPressed({ type: "keyPressed", key: "w" });
    const proximityResult = system.fireProximity({ type: "proximity", sourceObject: "hero" });

    expect(moveResult.triggered).toHaveLength(1);
    expect(editor.getProperty("hero", "position")).toEqual({ x: 0, y: 0, z: -2 });
    expect(proximityResult.triggered).toHaveLength(1);
    expect((editor.getObject("crate") as { lastSpokenText?: string }).lastSpokenText).toBe("Reached");
  });

  it("surfaces code editor local changes through cascade menus", () => {
    const { type, method } = createActorType();
    const editor = new CodeEditor(method);
    const loopBodyList = editor.findStatementList(["body", "0:body"]);

    editor.insertStatement(
      { list: loopBodyList, index: 1 },
      new LocalVariableDeclarationStatement(
        "distance",
        simpleTypeRef("WholeNumber"),
        new IntegerLiteral(3),
        false,
      ),
    );

    const model = editor.getMethodBodyVisualModel();
    const cascade = new ExpressionCascade(new TypeBrowser([type]));
    const menu = cascade.buildMenu({
      desiredType: simpleTypeRef("WholeNumber"),
      currentType: type,
      code: method,
      block: new BlockStatement((loopBodyList.owner as ForEachLoop).body),
      statementIndex: 2,
    });

    expect(model.lists.map((list) => list.path.join(">"))).toContain("body>0:body");
    expect(menu.options.map((option) => option.label)).toEqual(
      expect.arrayContaining(["count: WholeNumber", "distance: WholeNumber", "score"]),
    );
  });

  it("persists project manager snapshots as versioned persistence records", async () => {
    const manager = new ProjectManager();
    manager.create();
    manager.currentArchive!.project.projectName = "Persistence Story";
    manager.markDirty();

    const firstSave = await manager.saveAs("story.a3p");
    const persistence = new ProjectPersistence<JsonValue>({
      store: new MemoryStateStore(),
      now: createNow([10, 20]),
      createVersionId: (projectId, sequence) => `${projectId}-v${sequence}`,
    });

    await persistence.saveProject(
      manager.fileName!,
      manager.currentArchive!.project.projectName,
      manager.currentArchive!.project as unknown as JsonValue,
    );

    manager.currentArchive!.project.methods.push({
      name: "jump",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [],
    });
    manager.markDirty();
    const secondSave = await manager.save();

    await persistence.saveProject(
      manager.fileName!,
      manager.currentArchive!.project.projectName,
      manager.currentArchive!.project as unknown as JsonValue,
    );

    const reopened = new ProjectManager();
    await reopened.open(secondSave, "story.a3p");
    const versions = await persistence.getProjectVersions("story.a3p");
    const diff = await persistence.diffProjectVersions("story.a3p", "story.a3p-v1", "story.a3p-v2");

    expect(firstSave.length).toBeGreaterThan(0);
    expect(reopened.currentArchive!.project.projectName).toBe("Persistence Story");
    expect(manager.recentFiles[0]?.fileName).toBe("story.a3p");
    expect(versions.map((version) => version.versionId)).toEqual(["story.a3p-v2", "story.a3p-v1"]);
    expect(diff).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "$.methods[0]", kind: "added" }),
      ]),
    );
  });

  it("translates grading pipeline evidence into curriculum progress", () => {
    const curriculum = createCurriculumMetadata();
    const pipeline = runGradingPipeline(createPipelineProject(), ["first-lesson", "events", "loops"]);
    let progress = createCurriculumProgress();

    if (pipeline.results.find((result) => result.dimension === "first-lesson")?.passed) {
      progress = recordDemonstratedConcept(progress, "scene");
      progress = recordDemonstratedConcept(progress, "object");
    }
    if (pipeline.input.executionLog.some((entry) => entry.kind === "MethodCall")) {
      progress = recordDemonstratedConcept(progress, "method");
    }
    if (pipeline.input.executionLog.length >= 2) {
      progress = recordDemonstratedConcept(progress, "sequence");
    }
    if (pipeline.results.find((result) => result.dimension === "loops")?.passed) {
      progress = recordDemonstratedConcept(progress, "loop");
    }

    expect(isLessonUnlocked(curriculum, progress, "first-animation")).toBe(true);
    expect(getMissingConceptsForLesson(curriculum, progress, "control-flow").map((concept) => concept.id)).toEqual([
      "condition",
    ]);
  });
});

function createActorType(): { type: ClassDeclaration; method: MethodDeclaration } {
  const loop = new ForEachLoop(
    simpleTypeRef("String"),
    "item",
    new ArrayLiteralExpression([new StringLiteral("a")]),
    [new LocalVariableDeclarationStatement("count", simpleTypeRef("WholeNumber"), new IntegerLiteral(1), false)],
  );
  const method = new MethodDeclaration("act", { type: "VoidTypeRef" }, [], [loop], false);
  const type = new ClassDeclaration(
    "Actor",
    "SThing",
    null,
    null,
    [],
    [method],
    [
      new FieldDeclaration("name", simpleTypeRef("String"), new StringLiteral("alice"), false, false),
      new FieldDeclaration("score", simpleTypeRef("WholeNumber"), new IntegerLiteral(10), false, false),
    ],
  );
  return { type, method };
}

function createPipelineProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Pipeline Story",
    sceneObjects: [
      {
        name: "ground",
        typeName: "org.lgna.story.SGround",
        resourceType: null,
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        size: { width: 10, height: 0.1, depth: 10 },
      },
      {
        name: "camera",
        typeName: "org.lgna.story.SCamera",
        resourceType: null,
        position: { x: 0, y: 5, z: 10 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        size: null,
      },
      {
        name: "bunny",
        typeName: "org.lgna.story.SBiped",
        resourceType: null,
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        size: { width: 1, height: 2, depth: 1 },
      },
    ],
    methods: [
      {
        name: "storyStart",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          { kind: "MethodCall", object: "this", method: "move", arguments: ["FORWARD", "1"] },
          { kind: "MethodCall", object: "this", method: "turn", arguments: ["LEFT", "0.25"] },
          {
            kind: "CountLoop",
            count: 2,
            body: [{ kind: "MethodCall", object: "this", method: "move", arguments: ["FORWARD", "1"] }],
          },
        ],
      },
      {
        name: "handleSceneStart",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{ kind: "SceneActivationEvent", event: "sceneActivated" }],
      },
    ],
  };
}

function createNow(values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return value;
  };
}
