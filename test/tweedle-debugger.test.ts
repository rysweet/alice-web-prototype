import { describe, expect, it } from "vitest";
import { ExecutionContext, ProgramRunner } from "../src/program-execution.js";
import {
  Breakpoint,
  DebugConsole,
  StackFrame,
  StepController,
  TweedleDebugger,
  VariableInspector,
  WatchList,
  type DebuggerProgram,
} from "../src/tweedle-debugger.js";

const program: DebuggerProgram = {
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
  lines: {
    "main-1": 1,
    "main-2": 2,
    "main-3": 3,
    "helper-1": 10,
    "helper-2": 11,
  },
};

describe("tweedle-debugger", () => {
  it("creates line, conditional, and exception breakpoints", () => {
    expect(Breakpoint.line(10)).toMatchObject({ kind: "line", line: 10 });
    expect(Breakpoint.conditional(11, "count === 1")).toMatchObject({
      kind: "conditional",
      line: 11,
      condition: "count === 1",
    });
    expect(Breakpoint.exception("RuntimeError")).toMatchObject({
      kind: "exception",
      exceptionName: "RuntimeError",
    });
  });

  it("inspects locals and evaluates watch expressions", () => {
    const frames = [
      new StackFrame("main", { count: 1 }),
      new StackFrame("helper", { doubled: 2 }),
    ];
    const inspector = new VariableInspector();
    const watches = new WatchList();
    const context = new ExecutionContext();
    context.pushFrame("main", { count: 1, doubled: 2 });
    watches.add("count + doubled");

    expect(inspector.inspect(frames[1]!, "doubled")).toBe(2);
    expect(inspector.inspectVisible(frames, "count")).toBe(1);
    expect(watches.evaluate(context)).toEqual([
      { expression: "count + doubled", value: 3, error: null },
    ]);
  });

  it("surfaces unsupported watch expressions as errors without executing them", () => {
    const sentinel = "__aliceTweedleDebuggerWatchPwned";
    const globals = globalThis as Record<string, unknown>;
    delete globals[sentinel];
    const watches = new WatchList();
    const context = new ExecutionContext();
    context.pushFrame("main", { count: 1 });
    watches.add(`globalThis.${sentinel} = true`);

    const [result] = watches.evaluate(context);

    expect(result?.value).toBeUndefined();
    expect(result?.error).toMatch(/Unsupported debugger expression/);
    expect(globals[sentinel]).toBeUndefined();
  });

  it("supports arithmetic and comparison expressions in debugger watches and conditions", () => {
    const debuggerInstance = new TweedleDebugger(program, () => 1);
    debuggerInstance.watches.add("(input + doubled) >= 3");
    debuggerInstance.setBreakpoint(Breakpoint.conditional(11, "doubled / input === 2"));

    const paused = debuggerInstance.continue();

    expect(paused.reason).toBe("breakpoint");
    expect(paused.watches).toEqual([
      { expression: "(input + doubled) >= 3", value: true, error: null },
    ]);
  });

  it("steps through execution with the wrapper step controller", () => {
    const runner = new ProgramRunner(program, () => 1);
    const controller = new StepController(runner);

    expect(controller.stepInto().statement?.id).toBe("main-1");
    expect(controller.stepInto().statement?.id).toBe("main-2");
    expect(controller.stepInto().statement?.id).toBe("helper-1");
  });

  it("drives debugging sessions with line breakpoints and watches", () => {
    const debuggerInstance = new TweedleDebugger(program, () => 1);
    debuggerInstance.watches.add("input + doubled");
    debuggerInstance.setBreakpoint(Breakpoint.conditional(11, "doubled === 2"));

    const paused = debuggerInstance.continue();

    expect(paused.reason).toBe("breakpoint");
    expect(paused.statementId).toBe("helper-2");
    expect(paused.line).toBe(11);
    expect(paused.stackFrames.map((frame) => frame.methodName)).toEqual(["main", "helper"]);
    expect(paused.watches).toEqual([
      { expression: "input + doubled", value: 3, error: null },
    ]);
    expect(debuggerInstance.inspectVariable("doubled")).toBe(2);

    const stepped = debuggerInstance.stepOver();
    expect(stepped.statementId).toBe("main-3");
  });

  it("exposes console output through the debug console", () => {
    const debuggerInstance = new TweedleDebugger(program, () => 1);

    const completed = debuggerInstance.continue();
    expect(completed.complete).toBe(true);

    const consoleView = new DebugConsole(() => debuggerInstance.getSnapshot().consoleLines as string[]);
    expect(consoleView.getLines()).toEqual(["3"]);
    expect(consoleView.latest()).toBe("3");
  });
});
