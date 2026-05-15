import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseA3P, type AliceObject, type AliceStatement } from "../src/a3p-parser";
import {
  createExecutionState,
  executeStatements,
  type ExecutionState,
  type ExecutionResult,
  type Vec3,
  type EventLogEntry,
} from "../src/statement-executor";

// Polyfill DOMParser for Node.js (vitest runs in Node)
beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a minimal AliceObject for seeding execution state. */
function obj(name: string, typeName = "org.lgna.story.SBiped"): AliceObject {
  return { name, typeName, resourceType: null, position: null, orientation: null, size: null };
}

/** Build an AliceObject with an explicit position. */
function objAt(name: string, pos: { x: number; y: number; z: number }): AliceObject {
  return { name, typeName: "org.lgna.story.SBiped", resourceType: null, position: pos, orientation: null, size: null };
}

/** Shorthand for a MethodCall statement. */
function methodCall(objectName: string, method: string, args: string[] = []): AliceStatement {
  return { kind: "MethodCall", object: objectName, method, arguments: args };
}

// ── Unit Tests ─────────────────────────────────────────────────────────

describe("statement-executor", () => {
  describe("createExecutionState", () => {
    it("creates state with objects from scene", () => {
      const state = createExecutionState([obj("bunny"), obj("ground", "org.lgna.story.SGround")]);

      expect(state.objects.size).toBe(2);
      expect(state.objects.has("bunny")).toBe(true);
      expect(state.objects.has("ground")).toBe(true);
      expect(state.eventLog).toEqual([]);
      expect(state.statementsExecuted).toBe(0);
      expect(state.depth).toBe(0);
    });

    it("defaults position to {x:0, y:0, z:0} when parser has null", () => {
      const state = createExecutionState([obj("bunny")]);
      const bunny = state.objects.get("bunny")!;
      expect(bunny.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("preserves parser-extracted position when present", () => {
      const state = createExecutionState([objAt("bunny", { x: 1, y: 2, z: 3 })]);
      const bunny = state.objects.get("bunny")!;
      expect(bunny.position).toEqual({ x: 1, y: 2, z: 3 });
    });

    it("returns empty state for empty scene", () => {
      const state = createExecutionState([]);
      expect(state.objects.size).toBe(0);
      expect(state.eventLog).toEqual([]);
      expect(state.statementsExecuted).toBe(0);
    });
  });

  describe("empty statements", () => {
    it("returns 0 executed and empty log for empty array", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements([], state);

      expect(result.statementsExecuted).toBe(0);
      expect(result.eventLog).toEqual([]);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe("MethodCall — move", () => {
    it("increments z position by 1 for named object", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("bunny", "move")],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 1 });
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0]).toMatchObject({
        action: "move",
        object: "bunny",
      });
    });

    it("accumulates multiple moves", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("bunny", "move"), methodCall("bunny", "move"), methodCall("bunny", "move")],
        state,
      );

      expect(result.statementsExecuted).toBe(3);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 3 });
    });

    it("ignores arguments (unconditional z+1)", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{ kind: "MethodCall", object: "bunny", method: "move", arguments: ["FORWARD", "1.0"] }],
        state,
      );

      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 1 });
    });
  });

  describe("MethodCall — turn", () => {
    it("logs event without mutating position", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("bunny", "turn")],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0].action).toBe("turn");
      expect(result.eventLog[0].object).toBe("bunny");
    });
  });

  describe("MethodCall — say", () => {
    it("logs say event", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("bunny", "say")],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0].action).toBe("say");
      expect(result.eventLog[0].object).toBe("bunny");
    });
  });

  describe("MethodCall — unknown method", () => {
    it("logs as generic call", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("bunny", "doSomethingWeird")],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0].action).toBe("call");
      expect(result.eventLog[0].object).toBe("bunny");
      expect(result.eventLog[0].method).toBe("doSomethingWeird");
    });
  });

  describe("MethodCall — object: 'this'", () => {
    it("logs call but skips position mutation", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("this", "move")],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0].object).toBe("this");
      // bunny position unchanged — "this" is not a named object
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe("MethodCall — unknown object", () => {
    it("logs call for nonexistent object without crashing", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [methodCall("ghost", "move")],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      // Should not crash, should log the call
    });
  });

  describe("CountLoop", () => {
    it("executes body N times", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "CountLoop",
          count: 3,
          body: [methodCall("bunny", "move")],
        }],
        state,
      );

      // 1 loop statement + 3 body executions = 4 total
      expect(result.statementsExecuted).toBe(4);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 3 });
      expect(result.eventLog).toHaveLength(3); // 3 move events
    });

    it("handles count of 0", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "CountLoop",
          count: 0,
          body: [methodCall("bunny", "move")],
        }],
        state,
      );

      // Only the loop statement itself is counted
      expect(result.statementsExecuted).toBe(1);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
      expect(result.eventLog).toHaveLength(0);
    });

    it("handles missing body gracefully", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{ kind: "CountLoop", count: 5 }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(0);
    });

    it("caps iterations at 10,000", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "CountLoop",
          count: 999_999,
          body: [methodCall("bunny", "turn")],
        }],
        state,
      );

      // Should cap at 10,000 iterations + 1 loop statement
      expect(result.statementsExecuted).toBeLessThanOrEqual(10_001);
      expect(result.eventLog.length).toBeLessThanOrEqual(10_000);
    });
  });

  describe("IfElse", () => {
    it("executes ifBody when condition is 'true'", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "IfElse",
          condition: "true",
          ifBody: [methodCall("bunny", "move")],
          elseBody: [methodCall("bunny", "turn")],
        }],
        state,
      );

      expect(result.statementsExecuted).toBeGreaterThanOrEqual(2); // if + move
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 1 });
      // Should have move event, not turn event
      const actions = result.eventLog.map(e => e.action);
      expect(actions).toContain("move");
      expect(actions).not.toContain("turn");
    });

    it("executes elseBody when condition is not 'true'", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "IfElse",
          condition: "false",
          ifBody: [methodCall("bunny", "move")],
          elseBody: [methodCall("bunny", "turn")],
        }],
        state,
      );

      expect(result.statementsExecuted).toBeGreaterThanOrEqual(2); // if + turn
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
      const actions = result.eventLog.map(e => e.action);
      expect(actions).toContain("turn");
      expect(actions).not.toContain("move");
    });

    it("treats 'unknown' condition as false path", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "IfElse",
          condition: "unknown",
          ifBody: [methodCall("bunny", "move")],
          elseBody: [methodCall("bunny", "say")],
        }],
        state,
      );

      const actions = result.eventLog.map(e => e.action);
      expect(actions).toContain("say");
      expect(actions).not.toContain("move");
    });

    it("handles missing elseBody gracefully", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "IfElse",
          condition: "false",
          ifBody: [methodCall("bunny", "move")],
          // no elseBody
        }],
        state,
      );

      // Should not crash; bunny doesn't move
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
    });

    it("handles missing ifBody gracefully", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{
          kind: "IfElse",
          condition: "true",
          // no ifBody
          elseBody: [methodCall("bunny", "move")],
        }],
        state,
      );

      // Should not crash; bunny doesn't move (true path is empty)
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  describe("EventListener", () => {
    it("logs registration event", () => {
      const state = createExecutionState([]);
      const result = executeStatements(
        [{ kind: "EventListener", event: "SceneActivation" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0]).toMatchObject({
        action: "registerEvent",
        event: "SceneActivation",
      });
    });

    it("logs with missing event name", () => {
      const state = createExecutionState([]);
      const result = executeStatements(
        [{ kind: "EventListener" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0].action).toBe("registerEvent");
    });
  });

  describe("ReturnStatement", () => {
    it("logs return expression", () => {
      const state = createExecutionState([]);
      const result = executeStatements(
        [{ kind: "ReturnStatement", expression: "42" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0]).toMatchObject({
        action: "return",
        detail: "42",
      });
    });

    it("handles unknown expression", () => {
      const state = createExecutionState([]);
      const result = executeStatements(
        [{ kind: "ReturnStatement", expression: "unknown" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog[0].action).toBe("return");
    });
  });

  describe("Comment", () => {
    it("is silently skipped (no event log)", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{ kind: "Comment", expression: "this is a comment" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(0);
    });
  });

  describe("VariableDeclaration", () => {
    it("logs declaration", () => {
      const state = createExecutionState([]);
      const result = executeStatements(
        [{ kind: "VariableDeclaration", name: "count", varType: "Integer", value: "0" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0]).toMatchObject({
        action: "declare",
        name: "count",
      });
    });
  });

  describe("unknown statement kind", () => {
    it("logs as skipped without crashing", () => {
      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements(
        [{ kind: "FooBarStatement" }],
        state,
      );

      expect(result.statementsExecuted).toBe(1);
      expect(result.eventLog).toHaveLength(1);
      expect(result.eventLog[0].action).toBe("skipped");
      expect(result.eventLog[0].detail).toContain("FooBarStatement");
    });
  });

  describe("security limits", () => {
    it("enforces total statement execution cap (50,000)", () => {
      const state = createExecutionState([obj("bunny")]);
      // Nested loops: 200 * 300 = 60,000 body executions → should cap at 50,000
      const result = executeStatements(
        [{
          kind: "CountLoop",
          count: 200,
          body: [{
            kind: "CountLoop",
            count: 300,
            body: [methodCall("bunny", "turn")],
          }],
        }],
        state,
      );

      expect(result.statementsExecuted).toBeLessThanOrEqual(50_000);
    });

    it("enforces recursion depth cap (100)", () => {
      // Build deeply nested structure
      let stmt: AliceStatement = methodCall("bunny", "move");
      for (let i = 0; i < 150; i++) {
        stmt = { kind: "CountLoop", count: 1, body: [stmt] };
      }

      const state = createExecutionState([obj("bunny")]);
      const result = executeStatements([stmt], state);

      // Should not throw; should log skip entries for depth-exceeded statements
      expect(result.statementsExecuted).toBeGreaterThan(0);
      // Bunny shouldn't have moved 150 times deep — depth cap should prevent it
      const moveEvents = result.eventLog.filter(e => e.action === "move");
      expect(moveEvents.length).toBeLessThanOrEqual(100);
    });
  });

  describe("mixed statement sequence", () => {
    it("executes a realistic sequence of mixed statements", () => {
      const state = createExecutionState([obj("bunny"), obj("frog")]);
      const stmts: AliceStatement[] = [
        { kind: "Comment", expression: "Setup" },
        methodCall("bunny", "move"),
        methodCall("frog", "move"),
        {
          kind: "CountLoop",
          count: 2,
          body: [methodCall("bunny", "turn")],
        },
        {
          kind: "IfElse",
          condition: "true",
          ifBody: [methodCall("frog", "say")],
          elseBody: [],
        },
        { kind: "ReturnStatement", expression: "done" },
      ];

      const result = executeStatements(stmts, state);

      // Comment(1) + move(1) + move(1) + loop(1) + 2×turn(2) + if(1) + say(1) + return(1) = 9
      expect(result.statementsExecuted).toBe(9);
      expect(result.objects.get("bunny")?.position).toEqual({ x: 0, y: 0, z: 1 });
      expect(result.objects.get("frog")?.position).toEqual({ x: 0, y: 0, z: 1 });

      const actions = result.eventLog.map(e => e.action);
      expect(actions).toContain("move");
      expect(actions).toContain("turn");
      expect(actions).toContain("say");
      expect(actions).toContain("return");
    });
  });

  // ── Integration: Real .a3p project ─────────────────────────────────

  describe("integration with real .a3p", () => {
    const AMAZON_MIN_A3P = path.resolve(
      __dirname,
      "../../alice/core/resources/target/distribution/application/starter-projects/amazonMinimum.a3p",
    );
    const fileExists = fs.existsSync(AMAZON_MIN_A3P);

    it.skipIf(!fileExists)("parses and executes statements from amazonMinimum.a3p", async () => {
      const data = fs.readFileSync(AMAZON_MIN_A3P);
      const project = await parseA3P(data);

      // Seed execution state from real scene objects
      const state = createExecutionState(project.sceneObjects);
      expect(state.objects.size).toBeGreaterThan(0);

      // Collect all statements from all methods
      const allStatements = project.methods.flatMap(m => m.statements);

      const result = executeStatements(allStatements, state);

      // Should execute without errors
      expect(result.statementsExecuted).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.eventLog)).toBe(true);
      // Event log entries should all have an action field
      for (const entry of result.eventLog) {
        expect(typeof entry.action).toBe("string");
        expect(entry.action.length).toBeGreaterThan(0);
      }
    });

    const AMAZON_FULL_A3P = path.resolve(
      __dirname,
      "../../alice/core/resources/target/distribution/application/starter-projects/amazonFull.a3p",
    );
    const fullExists = fs.existsSync(AMAZON_FULL_A3P);

    it.skipIf(!fullExists)("handles complex project (amazonFull.a3p) without exceeding limits", async () => {
      const data = fs.readFileSync(AMAZON_FULL_A3P);
      const project = await parseA3P(data);

      const state = createExecutionState(project.sceneObjects);
      const allStatements = project.methods.flatMap(m => m.statements);

      const result = executeStatements(allStatements, state);

      // Must not exceed security caps
      expect(result.statementsExecuted).toBeLessThanOrEqual(50_000);
      expect(Array.isArray(result.eventLog)).toBe(true);
    });
  });
});
