// @vitest-environment jsdom
/**
 * Tutorial parity tests — verifies the TS port can support each
 * Alice.org tutorial workflow end-to-end.
 *
 * These were originally standalone scripts in tutorial-tests/.
 * Converted to vitest so regressions are caught in CI.
 */
import { beforeAll, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type { AliceProject } from "../src/a3p-parser.js";
import { executeProject, type LogEntry } from "../src/tweedle-vm.js";
import { parseTweedle } from "../src/tweedle-parser.js";

// Lazy imports resolved in beforeAll
let Alice: typeof import("../src/index.js");

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    globalThis.DOMParser = dom.window.DOMParser;
    globalThis.XMLSerializer = dom.window.XMLSerializer;
    globalThis.CustomEvent = dom.window.CustomEvent as typeof CustomEvent;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.Event = dom.window.Event as typeof Event;
    globalThis.EventTarget = dom.window.EventTarget as typeof EventTarget;
  }
  Alice = await import("../src/index.js");
});

function sceneObject(
  name: string,
  typeName: string,
  position = { x: 0, y: 0, z: 0 },
  orientation = { x: 0, y: 0, z: 0, w: 1 },
  size = { width: 1, height: 1, depth: 1 },
  resourceType: string | null = null,
) {
  return { name, typeName, resourceType, position: { ...position }, orientation: { ...orientation }, size: { ...size } };
}

function createBaseArchive(projectName: string) {
  return Alice.ProjectTemplate.createProjectFromTemplate("empty-world", { projectName });
}

describe("tutorial parity", () => {
  // ── Tutorial 1: Getting Started ──────────────────────────────────────
  describe("Tutorial 1 — gallery search and scene creation", () => {
    it("searches gallery for bunny", () => {
      const results = Alice.GalleryUi.searchGallery("bunny");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.displayName.toLowerCase().includes("bunny"))).toBe(true);
    });

    it("creates gallery scene integration and adds model", () => {
      const integration = new Alice.GalleryUi.GallerySceneIntegration({ eventTarget: new EventTarget() });
      const entity = integration.addModelToScene("BUNNY", { x: 1, y: 0, z: -2 });
      expect(entity.model.geometry.vertices.length).toBeGreaterThan(0);
    });

    it("round-trips a project with scene objects", async () => {
      const archive = createBaseArchive("Tutorial1World");
      archive.project.sceneObjects.push(sceneObject("bunny", "org.lgna.story.SBiped", { x: 1, y: 0.45, z: -2 }));
      const bytes = await Alice.ProjectIo.writeProject(archive as Parameters<typeof Alice.ProjectIo.writeProject>[0]);
      expect(bytes.length).toBeGreaterThan(0);
      const roundTrip = await Alice.ProjectIo.readProject(new Uint8Array(bytes));
      expect(roundTrip.project.sceneObjects.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Tutorial 2: Your First Animation ─────────────────────────────────
  describe("Tutorial 2 — move, turn, say animation", () => {
    it("executes move/turn/say and produces correct transforms", () => {
      const archive = createBaseArchive("Tutorial2World");
      archive.project.sceneObjects.push(sceneObject("bunny", "org.lgna.story.SBiped"));
      archive.project.methods.push({
        name: "animateHello",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          { kind: "MethodCall", object: "bunny", method: "move", arguments: ["FORWARD", "2", "1"] },
          { kind: "MethodCall", object: "bunny", method: "turn", arguments: ["LEFT", "0.25", "1"] },
          { kind: "MethodCall", object: "bunny", method: "say", arguments: ['"Hello World"'] },
        ],
      });

      const runtime = Alice.VmSceneBridge.createVmSceneRuntime(archive.project);
      const execution = runtime.executeProject();
      expect(execution.execution_log.length).toBeGreaterThan(0);

      // Step through 2 seconds of animation
      runtime.animationLoop.step(1000);
      runtime.animationLoop.step(1000);

      const transform = runtime.bridge.getNodeForEntity("bunny")!.worldTransform;
      expect(transform.position.z).toBeCloseTo(-2, 0);

      const bubble = runtime.bridge.getSpeechBubbleElement("bunny")?.textContent ?? "";
      expect(bubble).toContain("Hello World");
    });
  });

  // ── Tutorial 3: DoInOrder / DoTogether ───────────────────────────────
  describe("Tutorial 3 — DoInOrder and DoTogether", () => {
    function buildProject(kind: "DoInOrder" | "DoTogether") {
      const archive = createBaseArchive(`Tutorial3-${kind}`);
      archive.project.sceneObjects.push(sceneObject("character1", "org.lgna.story.SBiped"));
      archive.project.sceneObjects.push(sceneObject("character2", "org.lgna.story.SBiped", { x: 2, y: 0, z: 0 }));
      archive.project.methods.push({
        name: "run",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{
          kind,
          body: [
            { kind: "MethodCall", object: "character1", method: "move", arguments: ["FORWARD", "2", "1"] },
            { kind: "MethodCall", object: "character2", method: "move", arguments: ["FORWARD", "2", "1"] },
          ],
        }],
      });
      return archive.project;
    }

    it("DoInOrder sequences cross-entity animations", () => {
      const runtime = Alice.VmSceneBridge.createVmSceneRuntime(buildProject("DoInOrder"));
      runtime.executeProject();
      runtime.animationLoop.step(500);

      const posA = runtime.bridge.getNodeForEntity("character1")!.worldTransform.position;
      const posB = runtime.bridge.getNodeForEntity("character2")!.worldTransform.position;

      // character1 should be mid-move, character2 should not have started
      expect(posA.z).toBeCloseTo(-1, 0);
      expect(posB.z).toBeCloseTo(0, 0);
    });

    it("DoTogether moves both characters simultaneously", () => {
      const runtime = Alice.VmSceneBridge.createVmSceneRuntime(buildProject("DoTogether"));
      runtime.executeProject();
      runtime.animationLoop.step(500);

      const posA = runtime.bridge.getNodeForEntity("character1")!.worldTransform.position;
      const posB = runtime.bridge.getNodeForEntity("character2")!.worldTransform.position;

      // Both should be mid-move
      expect(posA.z).toBeCloseTo(-1, 0);
      expect(posB.z).toBeCloseTo(-1, 0);
    });
  });

  // ── Tutorial 4: Control Structures ───────────────────────────────────
  describe("Tutorial 4 — loops and conditionals", () => {
    it("executes CountLoop, WhileLoop, and IfElse correctly", () => {
      const archive = createBaseArchive("Tutorial4World");
      archive.project.sceneObjects.push(sceneObject("bunny", "org.lgna.story.SBiped"));
      archive.project.methods.push({
        name: "run",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          { kind: "VariableDeclaration", name: "steps", varType: "Number", value: "0" },
          { kind: "CountLoop", count: 5, body: [
            { kind: "MethodCall", object: "bunny", method: "move", arguments: ["FORWARD", "1"] },
          ] },
          { kind: "WhileLoop", condition: "steps < 3", body: [
            { kind: "MethodCall", object: "bunny", method: "move", arguments: ["FORWARD", "1"] },
            { kind: "VariableAssignment", name: "steps", value: "steps + 1" },
          ] },
          { kind: "IfElse", condition: "steps == 3", ifBody: [
            { kind: "MethodCall", object: "bunny", method: "say", arguments: ['"loop-ok"'] },
          ], elseBody: [
            { kind: "MethodCall", object: "bunny", method: "say", arguments: ['"loop-bad"'] },
          ] },
        ],
      });

      const runtime = Alice.VmSceneBridge.createVmSceneRuntime(archive.project);
      const execution = runtime.executeProject();
      const finalPos = runtime.bridge.getNodeForEntity("bunny")!.worldTransform.position;
      const bubble = runtime.bridge.getSpeechBubbleElement("bunny")?.textContent ?? "";

      // 5 (count) + 3 (while) = 8 meters forward (instant moves)
      expect(finalPos.z).toBeCloseTo(-8, 0);
      expect(bubble).toContain("loop-ok");
    });
  });

  // ── Tutorial 5: Custom Methods and Parameters ────────────────────────
  describe("Tutorial 5 — custom types and methods", () => {
    it("executes custom hop(distance) method on user-defined type", () => {
      const archive = createBaseArchive("Tutorial5World");
      archive.project.types = [
        ...(archive.project.types ?? []),
        {
          name: "TutorialBunny",
          superTypeName: "org.lgna.story.SBiped",
          fields: [],
          constructors: [],
          methods: [{
            name: "hop",
            isFunction: false,
            returnType: "void",
            parameters: [{ name: "distance", type: "Number" }],
            statements: [
              { kind: "MethodCall", object: "this", method: "move", arguments: ["FORWARD", "distance", "1"] },
            ],
          }],
        },
      ];
      archive.project.sceneObjects.push(sceneObject("hopper", "TutorialBunny"));
      archive.project.methods.push({
        name: "run",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          { kind: "MethodCall", object: "hopper", method: "hop", arguments: ["1"] },
          { kind: "MethodCall", object: "hopper", method: "hop", arguments: ["2"] },
        ],
      });

      const runtime = Alice.VmSceneBridge.createVmSceneRuntime(archive.project);
      runtime.executeProject();
      runtime.animationLoop.step(3000);

      const pos = runtime.bridge.getNodeForEntity("hopper")!.worldTransform.position;
      expect(pos.z).toBeCloseTo(-3, 0);
    });
  });

  // ── Tutorial 6: Events and Interaction ───────────────────────────────
  describe("Tutorial 6 — event registration and dispatch", () => {
    it("registers scene-level mouse and key listeners", () => {
      const scene = new Alice.StoryApi.SScene();
      expect(() => scene.addMouseClickOnObjectListener(() => {})).not.toThrow();
      expect(() => scene.addKeyPressListener(() => {})).not.toThrow();
    });

    it("produces mouse click events on objects", () => {
      const hero = new Alice.StoryApi.SBox();
      hero.setName("hero");
      const listener = new Alice.StoryApiEvents.MouseClickOnObjectListener();
      listener.mouseDown({ x: 0, y: 0, z: 0 }, [hero]);
      const click = listener.mouseUp({ x: 0, y: 0, z: 0 }, 100, [hero]);
      expect(click).toBeDefined();
      expect(click!.targetName).toBe("hero");
    });

    it("binds and resolves keyboard shortcuts", () => {
      const keyListener = new Alice.StoryApiEvents.KeyListener();
      keyListener.bindShortcut("Ctrl+K", "commandPalette");
      const keyPress = keyListener.keyDown("k", { ctrl: true });
      expect(keyPress.shortcuts).toContain("commandPalette");
    });
  });

  // ── Tutorial 7: Functions and Return Values ──────────────────────────
  describe("Tutorial 7 — functions in conditions", () => {
    it("evaluates built-in distance and facing functions", () => {
      const hero = new Alice.StoryApi.SProp();
      const target = new Alice.StoryApi.SProp();
      target.position = { x: 3, y: 0, z: -4 };
      hero.turnToFace(target);

      expect(hero.getDistanceTo(target)).toBeCloseTo(5, 3);
      expect(hero.isFacing(target)).toBe(true);
    });

    it("executes custom function and uses return value in IfElse", () => {
      const declaration = parseTweedle(`class FunctionProbe {
        Boolean alwaysFalse() {
          return false;
        }
        void run() {
          if (alwaysFalse()) {
            this.state <- "if-branch";
          } else {
            this.state <- "else-branch";
          }
        }
      }`);

      const vm = new Alice.TweedleVm.TweedleVM();

      // Direct function execution returns false
      const funcResult = vm.execute(declaration, { entryMethod: "alwaysFalse" });
      expect(String(funcResult.returnValues.get("alwaysFalse"))).toContain("false");

      // run() should take the else branch because alwaysFalse() returns false
      const runResult = vm.execute(declaration, { entryMethod: "run" });
      const assignLog = runResult.execution_log.find((e) => e.kind === "VariableAssignment")?.detail ?? "";
      expect(assignLog).not.toContain("if-branch");
    });
  });

  // ── Tutorial 8: Scene Editor — Positioning ───────────────────────────
  describe("Tutorial 8 — scene editor placement and vehicle system", () => {
    it("places objects with position, orientation, and size", () => {
      const editor = new Alice.SceneEditor.SceneEditor();
      editor.placeObject("platform", "org.lgna.story.SProp", {
        position: { x: 10, y: 0, z: -5 },
        size: { width: 4, height: 1, depth: 4 },
        select: false,
      });
      editor.placeObject("rider", "org.lgna.story.SBiped", {
        position: { x: 0, y: 0, z: 0 },
        select: false,
      });

      expect(editor.getProperty("platform", "position")).toEqual({ x: 10, y: 0, z: -5 });
    });

    it("parents rider to platform via vehicle system", () => {
      const editor = new Alice.SceneEditor.SceneEditor();
      editor.placeObject("platform", "org.lgna.story.SProp", {
        position: { x: 10, y: 0, z: -5 },
        size: { width: 4, height: 1, depth: 4 },
        select: false,
      });
      editor.placeObject("rider", "org.lgna.story.SBiped", {
        position: { x: 0, y: 0, z: 0 },
        select: false,
      });

      const rider = editor.getObject("rider") as import("../src/story-api/expanded-entities-base-core.js").SThing;
      const platform = editor.getObject("platform") as import("../src/story-api/expanded-entities-base-core.js").SThing;
      Alice.VehicleSystem.setVehicle(rider, platform);
      Alice.VehicleSystem.setPositionInVehicleSpace(rider, { x: 1, y: 1, z: -2 });

      const transform = Alice.VehicleSystem.getVehicleTransform(rider);
      expect(transform.absolutePosition.x).toBeCloseTo(11, 0);
      expect(transform.absolutePosition.y).toBeCloseTo(1, 0);
      expect(transform.absolutePosition.z).toBeCloseTo(-7, 0);
    });
  });

  // ── Tutorial 9: Save, Load, Round-Trip ───────────────────────────────
  describe("Tutorial 9 — save/load with custom types", () => {
    it("round-trips custom types and methods through .a3p", async () => {
      const archive = createBaseArchive("Tutorial9World");
      archive.project.types = [
        ...(archive.project.types ?? []),
        {
          name: "TutorialBunny",
          superTypeName: "org.lgna.story.SBiped",
          fields: [],
          constructors: [],
          methods: [{
            name: "hop",
            isFunction: false,
            returnType: "void",
            parameters: [{ name: "distance", type: "Number" }],
            statements: [
              { kind: "MethodCall", object: "this", method: "move", arguments: ["FORWARD", "distance", "1"] },
            ],
          }],
        },
      ];
      archive.project.sceneObjects.push(sceneObject("hero", "TutorialBunny", { x: 1, y: 0, z: -2 }));
      archive.project.methods.push({
        name: "run",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [
          { kind: "MethodCall", object: "hero", method: "hop", arguments: ["1.5"] },
          { kind: "MethodCall", object: "hero", method: "say", arguments: ['"round-trip works"'] },
        ],
      });

      const bytes = await Alice.ProjectIo.writeProject(archive as Parameters<typeof Alice.ProjectIo.writeProject>[0]);
      const roundTrip = await Alice.ProjectIo.readProject(new Uint8Array(bytes));

      // Verify custom type survived
      const bunnyType = roundTrip.project.types?.find((t) => t.name === "TutorialBunny");
      expect(bunnyType).toBeDefined();
      const hopMethod = bunnyType!.methods?.find((m) => m.name === "hop");
      expect(hopMethod).toBeDefined();
      expect(hopMethod!.statements?.length).toBeGreaterThan(0);
      expect(hopMethod!.parameters?.length).toBe(1);

      // Verify scene object survived
      const hero = roundTrip.project.sceneObjects.find((o) => o.name === "hero");
      expect(hero).toBeDefined();
      expect(hero!.typeName).toBe("TutorialBunny");

      // Execute the round-tripped project
      const runtime = Alice.VmSceneBridge.createVmSceneRuntime(roundTrip.project);
      const exec = runtime.executeProject();

      // Verify the VM dispatched statements including the custom method
      expect(exec.execution_log.length).toBeGreaterThan(0);
      const hopCall = exec.execution_log.find(e => e.detail?.includes("hop"));
      expect(hopCall).toBeDefined();
      const moveCall = exec.execution_log.find(e => e.detail?.includes("move"));
      expect(moveCall).toBeDefined();

      runtime.animationLoop.step(1500);

      const heroPos = runtime.bridge.getNodeForEntity("hero")!.worldTransform.position;
      // The saved initial z position is restored before hop(1.5) moves forward.
      expect(heroPos.z).toBeCloseTo(-3.5, 0);

      const bubble = runtime.bridge.getSpeechBubbleElement("hero")?.textContent ?? "";
      expect(bubble).toContain("round-trip works");
    });
  });
});
