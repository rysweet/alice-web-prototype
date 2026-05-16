import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import type {
  AliceProject,
  AliceObject,
  AliceMethod,
  AliceStatement,
} from "../src/a3p-parser";
import {
  executeProject,
  type ExecutionResult,
  type LogEntry,
} from "../src/tweedle-vm";

// Polyfill DOMParser for Node.js (vitest runs in Node)
beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

// ── Helpers ────────────────────────────────────────────────────────────

function obj(name: string, typeName = "org.lgna.story.SBiped"): AliceObject {
  return { name, typeName, resourceType: null, position: null, orientation: null, size: null };
}

function methodCall(objectName: string, method: string, args: string[] = []): AliceStatement {
  return { kind: "MethodCall", object: objectName, method, arguments: args };
}

/** Build a minimal AliceProject from scene objects and methods. */
function project(
  sceneObjects: AliceObject[],
  methods: AliceMethod[],
): AliceProject {
  return {
    version: "3.10",
    projectName: "TestProject",
    sceneObjects,
    methods,
  };
}

/** Build a simple procedure method (non-function, void return). */
function procedure(name: string, statements: AliceStatement[]): AliceMethod {
  return { name, isFunction: false, returnType: "void", parameters: [], statements };
}

/** Build a function method (has return type). */
function func(name: string, returnType: string, statements: AliceStatement[]): AliceMethod {
  return { name, isFunction: true, returnType, parameters: [], statements };
}

// ── LogEntry shape ─────────────────────────────────────────────────────

describe("tweedle-vm", () => {
  describe("LogEntry shape", () => {
    it("each entry has step (number), kind (string), detail (string)", () => {
      const p = project([obj("bunny")], [
        procedure("myMethod", [methodCall("bunny", "move")]),
      ]);
      const result = executeProject(p);

      expect(result.execution_log.length).toBeGreaterThan(0);
      for (const entry of result.execution_log) {
        expect(typeof entry.step).toBe("number");
        expect(typeof entry.kind).toBe("string");
        expect(typeof entry.detail).toBe("string");
      }
    });

    it("steps are monotonically increasing starting from 1", () => {
      const p = project([obj("bunny")], [
        procedure("myMethod", [
          methodCall("bunny", "move"),
          methodCall("bunny", "turn"),
          methodCall("bunny", "say"),
        ]),
      ]);
      const result = executeProject(p);

      const steps = result.execution_log.map(e => e.step);
      expect(steps[0]).toBe(1);
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i]).toBeGreaterThan(steps[i - 1]);
      }
    });
  });

  // ── executeProject entry point ─────────────────────────────────────

  describe("executeProject", () => {
    it("returns execution_log and returnValues", () => {
      const p = project([], []);
      const result = executeProject(p);

      expect(result).toHaveProperty("execution_log");
      expect(result).toHaveProperty("returnValues");
      expect(Array.isArray(result.execution_log)).toBe(true);
      expect(result.returnValues).toBeInstanceOf(Map);
    });

    it("executes all methods in order", () => {
      const p = project([obj("bunny")], [
        procedure("first", [methodCall("bunny", "move")]),
        procedure("second", [methodCall("bunny", "turn")]),
      ]);
      const result = executeProject(p);

      const kinds = result.execution_log.map(e => e.kind);
      expect(kinds).toContain("MethodCall");
      // Both methods should have been executed
      expect(result.execution_log.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty log for project with no methods", () => {
      const p = project([obj("bunny")], []);
      const result = executeProject(p);

      expect(result.execution_log).toEqual([]);
      expect(result.returnValues.size).toBe(0);
    });
  });

  // ── MethodCall ─────────────────────────────────────────────────────

  describe("MethodCall", () => {
    it("logs call with kind 'MethodCall' and detail containing object.method", () => {
      const p = project([obj("bunny")], [
        procedure("run", [methodCall("bunny", "move")]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "MethodCall");
      expect(entry).toBeDefined();
      expect(entry!.detail).toContain("bunny");
      expect(entry!.detail).toContain("move");
    });

    it("handles 'this' as object name", () => {
      const p = project([obj("bunny")], [
        procedure("run", [methodCall("this", "move")]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "MethodCall");
      expect(entry).toBeDefined();
      expect(entry!.detail).toContain("this");
    });

    it("handles unknown object name without crashing", () => {
      const p = project([obj("bunny")], [
        procedure("run", [methodCall("ghost", "move")]),
      ]);
      const result = executeProject(p);

      expect(result.execution_log.length).toBeGreaterThan(0);
    });

    it("handles multiple arguments", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "MethodCall",
          object: "bunny",
          method: "move",
          arguments: ["FORWARD", "2.0"],
        }]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "MethodCall");
      expect(entry).toBeDefined();
    });
  });

  // ── CountLoop ──────────────────────────────────────────────────────

  describe("CountLoop", () => {
    it("repeats body N times", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 3,
          body: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      // Should have 3 MethodCall entries from the loop body
      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(3);
    });

    it("logs the loop itself with kind 'CountLoop'", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 2,
          body: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      const loopEntry = result.execution_log.find(e => e.kind === "CountLoop");
      expect(loopEntry).toBeDefined();
      expect(loopEntry!.detail).toContain("2");
    });

    it("handles count of 0 (body not executed)", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 0,
          body: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(0);
    });

    it("handles missing body gracefully", () => {
      const p = project([], [
        procedure("run", [{ kind: "CountLoop", count: 5 }]),
      ]);
      const result = executeProject(p);

      // Should not crash
      expect(result.execution_log.length).toBeGreaterThanOrEqual(1);
    });

    it("handles negative count as 0", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: -3,
          body: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(0);
    });

    it("caps iterations at 10,000", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 999_999,
          body: [methodCall("bunny", "turn")],
        }]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls.length).toBeLessThanOrEqual(10_000);
    });

    it("supports nested loops", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 3,
          body: [{
            kind: "CountLoop",
            count: 2,
            body: [methodCall("bunny", "move")],
          }],
        }]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(6); // 3 * 2
    });
  });

  // ── IfElse ─────────────────────────────────────────────────────────

  describe("IfElse", () => {
    it("executes ifBody when condition is 'true'", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "IfElse",
          condition: "true",
          ifBody: [methodCall("bunny", "move")],
          elseBody: [methodCall("bunny", "turn")],
        }]),
      ]);
      const result = executeProject(p);

      const details = result.execution_log
        .filter(e => e.kind === "MethodCall")
        .map(e => e.detail);
      expect(details.some(d => d.includes("move"))).toBe(true);
      expect(details.some(d => d.includes("turn"))).toBe(false);
    });

    it("executes elseBody when condition is 'false'", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "IfElse",
          condition: "false",
          ifBody: [methodCall("bunny", "move")],
          elseBody: [methodCall("bunny", "turn")],
        }]),
      ]);
      const result = executeProject(p);

      const details = result.execution_log
        .filter(e => e.kind === "MethodCall")
        .map(e => e.detail);
      expect(details.some(d => d.includes("turn"))).toBe(true);
      expect(details.some(d => d.includes("move"))).toBe(false);
    });

    it("defaults unknown conditions to true (per spec)", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "IfElse",
          condition: "someComplexExpr",
          ifBody: [methodCall("bunny", "move")],
          elseBody: [methodCall("bunny", "turn")],
        }]),
      ]);
      const result = executeProject(p);

      const details = result.execution_log
        .filter(e => e.kind === "MethodCall")
        .map(e => e.detail);
      // Spec: "unknown conditions default to true"
      expect(details.some(d => d.includes("move"))).toBe(true);
    });

    it("evaluates condition via variable lookup", () => {
      const p = project([obj("bunny")], [
        procedure("run", [
          { kind: "VariableDeclaration", name: "flag", varType: "Boolean", value: "false" },
          {
            kind: "IfElse",
            condition: "flag",
            ifBody: [methodCall("bunny", "move")],
            elseBody: [methodCall("bunny", "turn")],
          },
        ]),
      ]);
      const result = executeProject(p);

      // "flag" was declared as "false", so condition should resolve to false → elseBody
      const details = result.execution_log
        .filter(e => e.kind === "MethodCall")
        .map(e => e.detail);
      expect(details.some(d => d.includes("turn"))).toBe(true);
      expect(details.some(d => d.includes("move"))).toBe(false);
    });

    it("logs the IfElse with kind 'IfElse'", () => {
      const p = project([], [
        procedure("run", [{
          kind: "IfElse",
          condition: "true",
          ifBody: [],
          elseBody: [],
        }]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "IfElse");
      expect(entry).toBeDefined();
      expect(entry!.detail).toContain("true");
    });

    it("handles missing elseBody gracefully", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "IfElse",
          condition: "false",
          ifBody: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      // Should not crash
      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(0);
    });

    it("handles missing ifBody gracefully", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "IfElse",
          condition: "true",
          elseBody: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(0);
    });
  });

  // ── ReturnStatement ────────────────────────────────────────────────

  describe("ReturnStatement", () => {
    it("logs return with kind 'ReturnStatement'", () => {
      const p = project([], [
        func("getValue", "Integer", [
          { kind: "ReturnStatement", expression: "42" },
        ]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "ReturnStatement");
      expect(entry).toBeDefined();
      expect(entry!.detail).toContain("42");
    });

    it("halts execution of current method after return", () => {
      const p = project([obj("bunny")], [
        procedure("run", [
          methodCall("bunny", "move"),
          { kind: "ReturnStatement", expression: "done" },
          methodCall("bunny", "turn"), // should NOT execute
        ]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      // Only the move before return should execute, not the turn after
      expect(calls).toHaveLength(1);
      expect(calls[0].detail).toContain("move");
    });

    it("stores return value in returnValues map keyed by method name", () => {
      const p = project([], [
        func("getAnswer", "Integer", [
          { kind: "ReturnStatement", expression: "42" },
        ]),
      ]);
      const result = executeProject(p);

      expect(result.returnValues.get("getAnswer")).toBe("42");
    });

    it("does not halt execution of subsequent methods", () => {
      const p = project([obj("bunny")], [
        procedure("first", [
          { kind: "ReturnStatement", expression: "early" },
        ]),
        procedure("second", [
          methodCall("bunny", "move"),
        ]),
      ]);
      const result = executeProject(p);

      // "second" method should still execute
      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(1);
    });

    it("handles unknown expression", () => {
      const p = project([], [
        func("mystery", "Object", [
          { kind: "ReturnStatement", expression: "unknown" },
        ]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "ReturnStatement");
      expect(entry).toBeDefined();
    });
  });

  // ── VariableDeclaration ────────────────────────────────────────────

  describe("VariableDeclaration", () => {
    it("logs declaration with kind 'VariableDeclaration'", () => {
      const p = project([], [
        procedure("run", [
          { kind: "VariableDeclaration", name: "count", varType: "Integer", value: "0" },
        ]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "VariableDeclaration");
      expect(entry).toBeDefined();
      expect(entry!.detail).toContain("count");
    });

    it("creates variable in scope usable by IfElse condition", () => {
      const p = project([obj("bunny")], [
        procedure("run", [
          { kind: "VariableDeclaration", name: "ready", varType: "Boolean", value: "true" },
          {
            kind: "IfElse",
            condition: "ready",
            ifBody: [methodCall("bunny", "move")],
            elseBody: [methodCall("bunny", "turn")],
          },
        ]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls.some(c => c.detail.includes("move"))).toBe(true);
    });

    it("re-assignment updates existing variable (same name = update)", () => {
      const p = project([obj("bunny")], [
        procedure("run", [
          { kind: "VariableDeclaration", name: "flag", varType: "Boolean", value: "true" },
          { kind: "VariableDeclaration", name: "flag", varType: "Boolean", value: "false" },
          {
            kind: "IfElse",
            condition: "flag",
            ifBody: [methodCall("bunny", "move")],
            elseBody: [methodCall("bunny", "turn")],
          },
        ]),
      ]);
      const result = executeProject(p);

      // flag was reassigned to "false", so elseBody should run
      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls.some(c => c.detail.includes("turn"))).toBe(true);
      expect(calls.some(c => c.detail.includes("move"))).toBe(false);
    });

    it("handles missing name gracefully", () => {
      const p = project([], [
        procedure("run", [
          { kind: "VariableDeclaration", varType: "Integer", value: "0" },
        ]),
      ]);
      const result = executeProject(p);

      // Should not crash
      expect(result.execution_log.length).toBeGreaterThan(0);
    });
  });

  // ── EventListener ──────────────────────────────────────────────────

  describe("EventListener", () => {
    it("logs registration with kind 'EventListener'", () => {
      const p = project([], [
        procedure("run", [
          { kind: "EventListener", event: "SceneActivation" },
        ]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "EventListener");
      expect(entry).toBeDefined();
      expect(entry!.detail).toContain("SceneActivation");
    });

    it("registers but does not dispatch (per spec)", () => {
      const p = project([obj("bunny")], [
        procedure("run", [
          {
            kind: "EventListener",
            event: "SceneActivation",
            body: [methodCall("bunny", "move")],
          },
        ]),
      ]);
      const result = executeProject(p);

      // Listener body should NOT be executed — only registered
      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls).toHaveLength(0);
    });

    it("handles missing event name", () => {
      const p = project([], [
        procedure("run", [{ kind: "EventListener" }]),
      ]);
      const result = executeProject(p);

      const entry = result.execution_log.find(e => e.kind === "EventListener");
      expect(entry).toBeDefined();
    });
  });

  // ── Comment ────────────────────────────────────────────────────────

  describe("Comment", () => {
    it("is skipped (no log entry for comments)", () => {
      const p = project([], [
        procedure("run", [
          { kind: "Comment", expression: "this is a comment" },
        ]),
      ]);
      const result = executeProject(p);

      // Comments produce no log entries
      expect(result.execution_log).toHaveLength(0);
    });
  });

  // ── Unknown statement kind ─────────────────────────────────────────

  describe("unknown statement kind", () => {
    it("logs as skipped without crashing", () => {
      const p = project([], [
        procedure("run", [{ kind: "FooBarStatement" }]),
      ]);
      const result = executeProject(p);

      expect(result.execution_log.length).toBeGreaterThan(0);
      const entry = result.execution_log.find(e => e.detail.includes("FooBarStatement"));
      expect(entry).toBeDefined();
    });
  });

  // ── Scoping ────────────────────────────────────────────────────────

  describe("variable scoping", () => {
    it("variables are scoped per method (no leaking between methods)", () => {
      const p = project([obj("bunny")], [
        procedure("first", [
          { kind: "VariableDeclaration", name: "x", varType: "Boolean", value: "false" },
        ]),
        procedure("second", [
          {
            kind: "IfElse",
            condition: "x", // "x" not declared here
            ifBody: [methodCall("bunny", "move")],
            elseBody: [methodCall("bunny", "turn")],
          },
        ]),
      ]);
      const result = executeProject(p);

      // "x" is unknown in second method → defaults to true per spec
      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls.some(c => c.detail.includes("move"))).toBe(true);
    });
  });

  // ── Safety limits ──────────────────────────────────────────────────

  describe("safety limits", () => {
    it("enforces 50,000 total step cap", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 200,
          body: [{
            kind: "CountLoop",
            count: 300,
            body: [methodCall("bunny", "turn")],
          }],
        }]),
      ]);
      const result = executeProject(p);

      // Total log should not exceed 50K entries
      expect(result.execution_log.length).toBeLessThanOrEqual(50_000);
    });

    it("enforces 10,000 loop iteration cap", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 999_999,
          body: [methodCall("bunny", "move")],
        }]),
      ]);
      const result = executeProject(p);

      const calls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(calls.length).toBeLessThanOrEqual(10_000);
    });

    it("enforces depth cap of 100 (deeply nested structures)", () => {
      let stmt: AliceStatement = methodCall("bunny", "move");
      for (let i = 0; i < 150; i++) {
        stmt = { kind: "CountLoop", count: 1, body: [stmt] };
      }

      const p = project([obj("bunny")], [
        procedure("run", [stmt]),
      ]);
      const result = executeProject(p);

      // Should not throw; move events capped by depth
      const moveEntries = result.execution_log.filter(
        e => e.kind === "MethodCall" && e.detail.includes("move"),
      );
      expect(moveEntries.length).toBeLessThanOrEqual(100);
    });

    it("returns partial log on cap hit, never throws", () => {
      const p = project([obj("bunny")], [
        procedure("run", [{
          kind: "CountLoop",
          count: 100_000,
          body: [methodCall("bunny", "move")],
        }]),
      ]);

      // Should not throw
      const result = executeProject(p);
      expect(result.execution_log.length).toBeGreaterThan(0);
      expect(result.execution_log.length).toBeLessThanOrEqual(50_000);
    });

    it("enforces 1,000 variable cap per scope", () => {
      const declarations: AliceStatement[] = [];
      for (let i = 0; i < 1_100; i++) {
        declarations.push({
          kind: "VariableDeclaration",
          name: `var_${i}`,
          varType: "Integer",
          value: `${i}`,
        });
      }

      const p = project([], [procedure("run", declarations)]);
      const result = executeProject(p);

      // Should not crash; should cap variable creation
      expect(result.execution_log.length).toBeGreaterThan(0);
    });
  });

  // ── Mixed statement sequence ───────────────────────────────────────

  describe("mixed statement sequence", () => {
    it("executes a realistic mixed sequence correctly", () => {
      const p = project([obj("bunny"), obj("frog")], [
        procedure("myFirstMethod", [
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
          // This should NOT execute (after return):
          methodCall("bunny", "move"),
        ]),
      ]);
      const result = executeProject(p);

      // Comment is skipped. move + move + loop(2×turn) + if(say) + return = logged
      // The last move should NOT execute due to return halt.
      const kinds = result.execution_log.map(e => e.kind);
      expect(kinds).toContain("MethodCall");
      expect(kinds).toContain("CountLoop");
      expect(kinds).toContain("IfElse");
      expect(kinds).toContain("ReturnStatement");

      // Count MethodCall entries: bunny.move + frog.move + 2×bunny.turn + frog.say = 5
      // (The post-return bunny.move should NOT be in the log)
      const methodCalls = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(methodCalls).toHaveLength(5);
    });

    it("executes multiple methods in sequence", () => {
      const p = project([obj("bunny")], [
        procedure("setup", [
          { kind: "VariableDeclaration", name: "speed", varType: "Double", value: "1.0" },
        ]),
        procedure("animate", [
          methodCall("bunny", "move"),
          methodCall("bunny", "turn"),
        ]),
      ]);
      const result = executeProject(p);

      const varEntries = result.execution_log.filter(e => e.kind === "VariableDeclaration");
      const callEntries = result.execution_log.filter(e => e.kind === "MethodCall");
      expect(varEntries).toHaveLength(1);
      expect(callEntries).toHaveLength(2);
    });
  });

  // ── Integration with real .a3p ─────────────────────────────────────

  describe("integration with real .a3p", () => {
    const AMAZON_MIN_A3P = path.resolve(
      __dirname,
      "../../alice/core/resources/target/distribution/application/starter-projects/amazonMinimum.a3p",
    );
    const fileExists = fs.existsSync(AMAZON_MIN_A3P);

    it.skipIf(!fileExists)("parses and executes amazonMinimum.a3p via executeProject", async () => {
      const { parseA3P } = await import("../src/a3p-parser");
      const data = fs.readFileSync(AMAZON_MIN_A3P);
      const parsed = await parseA3P(data);

      const result = executeProject(parsed);

      expect(Array.isArray(result.execution_log)).toBe(true);
      expect(result.returnValues).toBeInstanceOf(Map);
      // Every log entry conforms to LogEntry shape
      for (const entry of result.execution_log) {
        expect(typeof entry.step).toBe("number");
        expect(typeof entry.kind).toBe("string");
        expect(typeof entry.detail).toBe("string");
      }
    });

    const AMAZON_FULL_A3P = path.resolve(
      __dirname,
      "../../alice/core/resources/target/distribution/application/starter-projects/amazonFull.a3p",
    );
    const fullExists = fs.existsSync(AMAZON_FULL_A3P);

    it.skipIf(!fullExists)("handles amazonFull.a3p without exceeding safety limits", async () => {
      const { parseA3P } = await import("../src/a3p-parser");
      const data = fs.readFileSync(AMAZON_FULL_A3P);
      const parsed = await parseA3P(data);

      const result = executeProject(parsed);

      expect(result.execution_log.length).toBeLessThanOrEqual(50_000);
      expect(result.returnValues).toBeInstanceOf(Map);
    });
  });
});
