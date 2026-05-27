import { describe, expect, it } from "vitest";
import { InteractiveRunner, ProjectRunner } from "../src/project-runner.js";
import { TweedleCompiler } from "../src/tweedle-compiler.js";

function compileProject(source: string) {
  const unit = new TweedleCompiler().compile(source, "Main.tweedle");
  expect(unit.errors).toEqual([]);
  return unit;
}

describe("project-runner", () => {
  it("loads and runs a compiled project end-to-end", async () => {
    const unit = compileProject(`class Main {
  void main() {
    this.helper();
  }

  void helper() {
    this.say("Hello from Alice");
  }
}`);

    const runner = new ProjectRunner({ loggingLevel: "debug", tickMs: 1 });
    const result = await runner.run(unit);

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("completed");
    expect(result.output).toEqual(["Hello from Alice"]);
    expect(result.log.map((entry) => entry.methodName)).toEqual(["main", "helper"]);
    expect(result.log[1]?.message).toContain("say: Hello from Alice");
  });

  it("stops before executing configured breakpoints", async () => {
    const unit = compileProject(`class Main {
  void main() {
    this.helper();
  }

  void helper() {
    this.say("Paused");
  }
}`);

    const runner = new ProjectRunner({ breakpoints: ["Main.helper"], tickMs: 1 });
    const result = await runner.run(unit);

    expect(result.success).toBe(true);
    expect(result.completionReason).toBe("breakpoint");
    expect(result.stoppedAtBreakpoint).toContain("Main.helper");
    expect(result.output).toEqual([]);
    expect(result.log).toHaveLength(1);
  });

  it("supports step-by-step interactive execution", () => {
    const unit = compileProject(`class Main {
  void main() {
    WholeNumber count <- 1;
    this.say("Hi");
  }
}`);

    const runner = new InteractiveRunner(unit);

    const first = runner.step();
    const second = runner.step();
    const third = runner.step();

    expect(first?.statementType).toBe("LocalVariableDeclaration");
    expect(second?.message).toContain("say: Hi");
    expect(third).toBeNull();
    expect(runner.isComplete).toBe(true);
    expect(runner.getOutput()).toEqual(["Hi"]);
  });

  it("reuses a loaded project across multiple runs", async () => {
    const unit = compileProject(`class Main {
  void main() {
    this.say("Again");
  }
}`);
    const runner = new ProjectRunner({ tickMs: 1 });

    runner.loadProject(unit);
    const first = await runner.run();
    const second = await runner.run();

    expect(first.output).toEqual(["Again"]);
    expect(second.output).toEqual(["Again"]);
  });
});
