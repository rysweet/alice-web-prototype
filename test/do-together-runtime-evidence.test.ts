import { describe, expect, it } from "vitest";
import type { LogEntry } from "../src/tweedle-vm-core-types.js";
import { executeProject } from "../src/tweedle-vm.js";
import { parseTweedle } from "../src/tweedle-parser.js";
import { TweedleVM } from "../src/tweedle-vm.js";
import { ProjectRunner } from "../src/project-runner.js";
import { TweedleCompiler } from "../src/tweedle-compiler.js";
import type { AliceMethod, AliceObject, AliceProject, AliceStatement } from "../src/a3p-parser.js";

interface DoTogetherActionEvidence {
  actionId: string;
  branchIndex: number;
  statementKind: string;
  groupId: string;
  windowId: string;
  startedAtStep: number;
  completedAtStep: number;
}

interface DoTogetherEvidence {
  kind: "DoTogether";
  groupId: string;
  windowId: string;
  actionCount: number;
  activeWindow: {
    startedAtStep: number;
    completedAtStep: number;
  };
  actions: DoTogetherActionEvidence[];
}

type EvidenceLogEntry = LogEntry & {
  doTogetherEvidence?: DoTogetherEvidence;
};

interface StructuredRunResult {
  execution_log?: EvidenceLogEntry[];
}

function object(name: string): AliceObject {
  return {
    name,
    typeName: "org.lgna.story.SBiped",
    resourceType: null,
    position: null,
    orientation: null,
    size: null,
  };
}

function methodCall(objectName: string, method: string): AliceStatement {
  return { kind: "MethodCall", object: objectName, method, arguments: [] };
}

function procedure(name: string, statements: AliceStatement[]): AliceMethod {
  return { name, isFunction: false, returnType: "void", parameters: [], statements };
}

function project(statements: AliceStatement[]): AliceProject {
  return {
    version: "3.10",
    projectName: "AliceDoTogetherEvidence",
    sceneObjects: [object("bunny"), object("snowperson")],
    methods: [procedure("run", statements)],
  };
}

function doTogetherEvidenceFrom(log: readonly EvidenceLogEntry[]): DoTogetherEvidence {
  const entry = log.find((candidate) => candidate.kind === "DoTogether");
  expect(entry, "Alice VM must log the do-together statement").toBeDefined();
  if (!entry) {
    throw new Error("Missing DoTogether log entry");
  }

  expect(entry.doTogetherEvidence, "DoTogether log entry must include structured Alice runtime evidence").toBeDefined();
  if (!entry.doTogetherEvidence) {
    throw new Error("Missing doTogetherEvidence");
  }

  return entry.doTogetherEvidence;
}

function expectTwoActionSharedWindowEvidence(evidence: DoTogetherEvidence): void {
  expect(evidence.kind).toBe("DoTogether");
  expect(evidence.groupId).toMatch(/^do-together-\d+$/);
  expect(evidence.windowId).toBe(`${evidence.groupId}-window`);
  expect(evidence.actionCount).toBe(2);
  expect(evidence.actions).toHaveLength(2);
  expect(evidence.activeWindow.startedAtStep).toBeGreaterThan(0);
  expect(evidence.activeWindow.completedAtStep).toBeGreaterThanOrEqual(evidence.activeWindow.startedAtStep);

  const branchIndexes = evidence.actions.map((action) => action.branchIndex);
  expect(branchIndexes).toEqual([0, 1]);
  expect(new Set(evidence.actions.map((action) => action.actionId)).size).toBe(2);

  for (const action of evidence.actions) {
    expect(action.actionId).toBe(`${evidence.groupId}-action-${action.branchIndex}`);
    expect(action.statementKind).toBe("MethodCall");
    expect(action.groupId).toBe(evidence.groupId);
    expect(action.windowId).toBe(evidence.windowId);
    expect(action.startedAtStep).toBeGreaterThanOrEqual(evidence.activeWindow.startedAtStep);
    expect(action.completedAtStep).toBeGreaterThanOrEqual(action.startedAtStep);
    expect(action.completedAtStep).toBeLessThanOrEqual(evidence.activeWindow.completedAtStep);
  }

  const latestStart = Math.max(...evidence.actions.map((action) => action.startedAtStep));
  const earliestCompletion = Math.min(...evidence.actions.map((action) => action.completedAtStep));
  expect(latestStart).toBeLessThanOrEqual(earliestCompletion);
}

function compileAliceSource(source: string) {
  const unit = new TweedleCompiler().compile(source, "Main.tweedle");
  expect(unit.errors).toEqual([]);
  return unit;
}

const AUTHORED_DO_TOGETHER_SOURCE = `class Main {
  void main() {
    doTogether {
      this.firstAction();
      this.secondAction();
    }
  }

  void firstAction() {
    this.say("first Alice action");
  }

  void secondAction() {
    this.say("second Alice action");
  }
}`;

describe("Alice do-together runtime evidence", () => {
  it("records exactly two direct do-together actions in one shared active window at the VM boundary", () => {
    const result = executeProject(project([
      {
        kind: "DoTogether",
        body: [
          methodCall("bunny", "move"),
          methodCall("snowperson", "turn"),
        ],
      },
    ]));

    const evidence = doTogetherEvidenceFrom(result.execution_log as EvidenceLogEntry[]);
    expectTwoActionSharedWindowEvidence(evidence);
  });

  it("preserves do-together evidence when authored Tweedle source runs through the Alice VM", () => {
    const ast = parseTweedle(AUTHORED_DO_TOGETHER_SOURCE);
    const result = new TweedleVM().execute(ast, {
      entryMethod: "main",
      instanceName: "main",
    });

    const evidence = doTogetherEvidenceFrom(result.execution_log as EvidenceLogEntry[]);
    expectTwoActionSharedWindowEvidence(evidence);
  });

  it("keeps the project runner result aligned with the VM execution log evidence shape", async () => {
    const unit = compileAliceSource(AUTHORED_DO_TOGETHER_SOURCE);
    const result = await new ProjectRunner({ loggingLevel: "debug", tickMs: 1 }).run(unit);
    expect(result.success).toBe(true);

    const structuredResult = result as typeof result & StructuredRunResult;
    expect(structuredResult.execution_log, "ProjectRunner must preserve the structured Alice VM execution_log").toBeDefined();
    if (!structuredResult.execution_log) {
      throw new Error("Missing structured execution_log");
    }

    const evidence = doTogetherEvidenceFrom(structuredResult.execution_log);
    expectTwoActionSharedWindowEvidence(evidence);
  });
});
