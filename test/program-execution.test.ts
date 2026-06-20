import { describe, expect, it } from "vitest";
import {
  BreakpointManager,
  ConsoleOutput,
  ExecutionContext,
  ProgramRunner,
  StepController,
  WatchExpression,
  type AliceProgramDefinition,
} from "../src/program-execution";

const sampleProgram: AliceProgramDefinition = {
  entry: "main",
  methods: [
    {
      name: "main",
      body: [
        { id: "main-1", kind: "assign", name: "count", value: 1 },
        { id: "main-2", kind: "call", method: "helper", args: [{ var: "count" }], assignTo: "result" },
        { id: "main-3", kind: "print", expression: { var: "result" } },
      ],
    },
    {
      name: "helper",
      parameters: ["input"],
      body: [
        { id: "helper-1", kind: "assign", name: "doubled", value: { mul: [{ var: "input" }, 2] } },
        { id: "helper-2", kind: "return", expression: { add: [{ var: "doubled" }, 1] } },
      ],
    },
  ],
};

describe("program-execution", () => {
  it("maintains variable bindings and call stacks in execution contexts", () => {
    const context = new ExecutionContext();
    context.pushFrame("main", { count: 1, label: "outer" });
    context.pushFrame("helper", { input: 2, label: "inner" });

    expect(context.getVariable("count")).toBe(1);
    expect(context.getVariable("input")).toBe(2);
    expect(context.visibleBindings()).toEqual({ count: 1, label: "inner", input: 2 });
    expect(context.snapshot().map((frame) => frame.methodName)).toEqual(["main", "helper"]);
  });

  it("captures console output", () => {
    const consoleOutput = new ConsoleOutput();
    consoleOutput.print("Hello Alice");
    consoleOutput.print(42);

    expect(consoleOutput.getLines()).toEqual(["Hello Alice", "42"]);
  });

  it("evaluates watch expressions in the current scope", () => {
    const context = new ExecutionContext();
    context.pushFrame("main", { count: 3, offset: 4, label: "ready" });

    expect(new WatchExpression().evaluate("count + offset", context)).toBe(7);
    expect(new WatchExpression().evaluate("(count + offset) * 2 >= 14", context)).toBe(true);
    expect(new WatchExpression().evaluate("label === \"ready\"", context)).toBe(true);
    expect(new WatchExpression().evaluate("count === 3 || missing === 1", context)).toBe(true);
    expect(new WatchExpression().evaluate("count === 4 && missing === 1", context)).toBe(false);
  });

  it("evaluates repeated watch expressions against the latest bindings", () => {
    const watches = new WatchExpression();
    const first = new ExecutionContext();
    first.pushFrame("main", { count: 3 });
    const second = new ExecutionContext();
    second.pushFrame("main", { count: 8 });

    expect(watches.evaluate("count + 1", first)).toBe(4);
    expect(watches.evaluate("count + 1", second)).toBe(9);
  });

  it("rejects unsupported watch expressions without executing them", () => {
    const context = new ExecutionContext();
    const sentinel = "__aliceDebuggerExpressionPwned";
    const globals = globalThis as Record<string, unknown>;
    delete globals[sentinel];
    context.pushFrame("main", { count: 3 });

    expect(() => new WatchExpression().evaluate(`globalThis.${sentinel} = true`, context))
      .toThrow(/Unsupported debugger expression/);
    expect(globals[sentinel]).toBeUndefined();
  });

  it("rejects non-primitive watch bindings before coercion can execute code", () => {
    const context = new ExecutionContext();
    let coerced = false;
    const maliciousValue = {
      valueOf() {
        coerced = true;
        return 3;
      },
    };
    context.pushFrame("main", { count: maliciousValue as unknown as number });

    expect(() => new WatchExpression().evaluate("count + 1", context))
      .toThrow(/binding 'count' has unsupported value type 'object'/);
    expect(coerced).toBe(false);
  });

  it("supports plain and conditional breakpoints", () => {
    const manager = new BreakpointManager();
    manager.set("helper-1");
    manager.set("helper-2", "doubled === 2");
    const runner = new ProgramRunner(sampleProgram, () => 1);
    const helperOne = runner.getEvents().find((event) => event.statement.id === "helper-1")!;
    const helperTwo = runner.getEvents().find((event) => event.statement.id === "helper-2")!;

    expect(manager.has("helper-1")).toBe(true);
    expect(manager.shouldPause(helperOne)).toBe(true);
    expect(manager.shouldPause(helperTwo)).toBe(true);
    expect(manager.remove("helper-1")).toBe(true);
    expect(manager.has("helper-1")).toBe(false);
  });

  it("runs programs, captures output, and records profiler timings", () => {
    let tick = 0;
    const runner = new ProgramRunner(sampleProgram, () => {
      tick += 1;
      return tick;
    });

    const completed = runner.run();

    expect(completed.reason).toBe("completed");
    expect(runner.getConsoleLines()).toEqual(["3"]);
    expect(runner.getProfilerEntries()).toEqual([
      { statementId: "helper-1", executions: 1, totalMs: 1 },
      { statementId: "helper-2", executions: 1, totalMs: 1 },
      { statementId: "main-1", executions: 1, totalMs: 1 },
      { statementId: "main-2", executions: 1, totalMs: 5 },
      { statementId: "main-3", executions: 1, totalMs: 1 },
    ]);
  });

  it("steps into, over, out, and continues through a program", () => {
    const runner = new ProgramRunner(sampleProgram, () => 1);
    runner.breakpoints.set("helper-1");
    const controller = new StepController(runner);

    const first = controller.stepInto();
    expect(first.statement?.id).toBe("main-1");

    const second = controller.stepInto();
    expect(second.statement?.id).toBe("main-2");

    const third = controller.stepInto();
    expect(third.statement?.id).toBe("helper-1");
    expect(third.callStack.map((frame) => frame.methodName)).toEqual(["main", "helper"]);

    const steppedOut = controller.stepOut();
    expect(steppedOut.statement?.id).toBe("main-3");
    expect(steppedOut.callStack.map((frame) => frame.methodName)).toEqual(["main"]);

    const completed = controller.continue();
    expect(completed.reason).toBe("completed");
    expect(completed.complete).toBe(true);
  });

  it("pauses runner execution at configured breakpoints and evaluates watches on paused state", () => {
    const runner = new ProgramRunner(sampleProgram, () => 1);
    runner.breakpoints.set("helper-2", "doubled === 2");

    const paused = runner.continue();
    expect(paused.reason).toBe("breakpoint");
    expect(paused.statement?.id).toBe("helper-2");

    const value = runner.watches.evaluate("input + doubled", runner.getCurrentContext());
    expect(value).toBe(3);

    const afterBreak = runner.stepOver();
    expect(afterBreak.statement?.id).toBe("main-3");
  });

  it("rejects malicious breakpoint conditions without executing them", () => {
    const sentinel = "__aliceBreakpointConditionPwned";
    const globals = globalThis as Record<string, unknown>;
    delete globals[sentinel];
    const runner = new ProgramRunner(sampleProgram, () => 1);
    runner.breakpoints.set("helper-2", `globalThis.${sentinel} = true`);

    expect(() => runner.continue()).toThrow(/Unsupported debugger expression/);
    expect(globals[sentinel]).toBeUndefined();
  });
});
