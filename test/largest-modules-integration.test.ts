import { describe, expect, it } from "vitest";
import type { AliceProject } from "../src/a3p-parser.js";
import {
  ClassDeclaration,
  ExpressionStatement,
  MethodDeclaration,
  MethodInvocation,
} from "../src/ast-nodes.js";
import { MutableListData, SimulatedActionTrigger, StringState } from "../src/croquet";
import { Transformable } from "../src/scenegraph.js";
import { createEntityForType, SBiped, Scene as StoryScene, SProgram, SProp } from "../src/story-api";
import { parseTweedle } from "../src/tweedle-parser.js";
import { executeProject } from "../src/tweedle-vm.js";

describe("largest modules integration", () => {
  it("connects AST traversal with croquet selection state", () => {
    const ast = parseTweedle(`class Workflow {
      void run() {
        this.say("hello");
      }
    }`) as unknown as ClassDeclaration;
    const visited = new MutableListData<string>();
    const selectedNode = new StringState("none", { name: "selectedNode" });

    ast.traverse((node) => {
      visited.add("type" in node ? String(node.type) : node.constructor.name);
    });
    selectedNode.setValue("MethodDeclaration", SimulatedActionTrigger.create("ast traversal"));

    expect(ast.methods[0]).toBeInstanceOf(MethodDeclaration);
    expect(ast.methods[0].body[0]).toBeInstanceOf(ExpressionStatement);
    expect((ast.methods[0].body[0] as ExpressionStatement).expression).toBeInstanceOf(MethodInvocation);
    expect(visited.toArray()).toContain("ClassDeclaration");
    expect(visited.toArray()).toContain("MethodDeclaration");
    expect(visited.toArray()).toContain("MethodInvocation");
    expect(selectedNode.value).toBe("MethodDeclaration");
  });

  it("keeps story runtime entities and scenegraph mirrors aligned", () => {
    const program = new SProgram();
    const runtimeScene = new StoryScene();
    const hero = createEntityForType("org.lgna.story.SBiped") as SBiped;
    const goal = new SProp();
    goal.position = { x: 4, y: 1, z: -2 };

    runtimeScene.addEntity("hero", hero);
    runtimeScene.addEntity("goal", goal);
    program.setActiveScene(runtimeScene);

    hero.move("FORWARD", 2);
    hero.turn("LEFT", 0.25);
    hero.moveToward(goal, 1);

    const root = new Transformable("root").setTranslation(1, 0, 0);
    const mirror = new Transformable("hero-mirror").setTranslation(
      hero.position.x,
      hero.position.y,
      hero.position.z,
    );
    root.add(mirror);

    const world = mirror.getWorldTransform();

    expect(program.activeScene).toBe(runtimeScene);
    expect(hero.imp.isActive).toBe(true);
    expect(hero.imp.getProperty("position")?.value).toEqual(hero.position);
    expect(world.translation.x).toBeCloseTo(hero.position.x + 1);
    expect(world.translation.y).toBeCloseTo(hero.position.y);
    expect(world.translation.z).toBeCloseTo(hero.position.z);
  });

  it("projects VM execution results into croquet and scenegraph editor state", () => {
    const project: AliceProject = {
      version: "3.6.0.0",
      projectName: "LargestModulesWorkflow",
      sceneObjects: [
        {
          name: "hero",
          typeName: "org.lgna.story.SBiped",
          resourceType: null,
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
          size: { width: 1, height: 1, depth: 1 },
        },
        {
          name: "goal",
          typeName: "org.lgna.story.SProp",
          resourceType: null,
          position: { x: 3, y: 0, z: -1 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
          size: { width: 1, height: 1, depth: 1 },
        },
      ],
      methods: [
        {
          name: "awardPoints",
          isFunction: false,
          returnType: "void",
          parameters: [{ name: "amount", type: "WholeNumber" }],
          statements: [
            { kind: "VariableAssignment", name: "hero.score", value: "amount" },
            { kind: "VariableAssignment", name: "goal.status", value: '"started"' },
          ],
        },
        {
          name: "runScenario",
          isFunction: false,
          returnType: "void",
          parameters: [],
          statements: [
            { kind: "MethodCall", object: "hero", method: "move", arguments: ["FORWARD", "1.0"] },
            { kind: "VariableAssignment", name: "hero.state", value: '"ready"' },
            { kind: "MethodCall", object: "this", method: "awardPoints", arguments: ["7"] },
          ],
        },
        {
          name: "reportState",
          isFunction: true,
          returnType: "TextString",
          parameters: [],
          statements: [
            { kind: "ReturnStatement", expression: 'hero.state .. ":" .. hero.score .. ":" .. goal.status' },
          ],
        },
      ],
    };
    const execution = executeProject(project);
    const logKinds = new MutableListData<string>();
    const vmReport = new StringState("pending", { name: "vmReport" });

    execution.execution_log.forEach((entry) => logKinds.add(entry.kind));
    vmReport.setValue(String(execution.returnValues.get("reportState")), SimulatedActionTrigger.create("vm execution"));

    const marker = new Transformable("execution-marker").setTranslation(
      execution.execution_log.filter((entry) => entry.kind === "MethodCall").length,
      0,
      0,
    );

    expect(vmReport.value).toBe("ready:7:started");
    expect(logKinds.toArray()).toContain("MethodCall");
    expect(logKinds.toArray()).toContain("VariableAssignment");
    expect(marker.getWorldTransform().translation.x).toBeGreaterThanOrEqual(2);
  });
});
