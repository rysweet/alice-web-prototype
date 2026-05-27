import { describe, expect, it } from "vitest";
import {
  CountLoopExecutor,
  DoInOrderExecutor,
  DoTogetherExecutor,
  ForEachInArrayExecutor,
  ForEachTogetherExecutor,
  IfElseExecutor,
  LocalVariableScope,
  ReturnExecutor,
  WhileLoopExecutor,
} from "../src/control-flow.js";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe("control-flow", () => {
  it("executes do-in-order statements sequentially", async () => {
    const calls: string[] = [];
    const executor = new DoInOrderExecutor<string, { prefix: string }>(async (statement, state) => {
      calls.push(`${state.prefix}:start:${statement}`);
      await delay(1);
      calls.push(`${state.prefix}:end:${statement}`);
    });

    await executor.execute(["first", "second"], { prefix: "scene" });

    expect(calls).toEqual([
      "scene:start:first",
      "scene:end:first",
      "scene:start:second",
      "scene:end:second",
    ]);
  });

  it("executes do-together statements concurrently and waits for all of them", async () => {
    const finished: string[] = [];
    const executor = new DoTogetherExecutor<number, {}>(async (statement) => {
      await delay(5 - statement);
      finished.push(`done:${statement}`);
    });

    await executor.execute([1, 2, 3], {});

    expect(finished).toHaveLength(3);
    expect(new Set(finished)).toEqual(new Set(["done:1", "done:2", "done:3"]));
  });

  it("repeats count loops and while loops until their stop conditions are met", async () => {
    const countValues: number[] = [];
    const whileValues: number[] = [];
    const countLoop = new CountLoopExecutor<{ total: number }>((index, state) => {
      countValues.push(index);
      state.total += 1;
    });
    const whileLoop = new WhileLoopExecutor<{ remaining: number }>(
      (state) => state.remaining > 0,
      (_index, state) => {
        whileValues.push(state.remaining);
        state.remaining -= 1;
      },
    );

    expect(await countLoop.execute(3, { total: 0 })).toBe(3);
    expect(await whileLoop.execute({ remaining: 3 })).toBe(3);
    expect(countValues).toEqual([0, 1, 2]);
    expect(whileValues).toEqual([3, 2, 1]);
  });

  it("supports sequential and concurrent for-each execution", async () => {
    const ordered: string[] = [];
    const concurrent: string[] = [];
    const forEach = new ForEachInArrayExecutor<string, {}>((item, index) => {
      ordered.push(`${index}:${item}`);
    });
    const forEachTogether = new ForEachTogetherExecutor<string, {}>(async (item, index) => {
      await delay(3 - index);
      concurrent.push(`${index}:${item}`);
    });

    expect(await forEach.execute(["alpha", "beta", "gamma"], {})).toBe(3);
    expect(await forEachTogether.execute(["alpha", "beta", "gamma"], {})).toBe(3);
    expect(ordered).toEqual(["0:alpha", "1:beta", "2:gamma"]);
    expect(new Set(concurrent)).toEqual(new Set(["0:alpha", "1:beta", "2:gamma"]));
  });

  it("branches with if/else and propagates return signals", async () => {
    const branches: string[] = [];
    const ifElse = new IfElseExecutor<{ value: number }>(
      (state) => {
        branches.push(`if:${state.value}`);
      },
      (state) => {
        branches.push(`else:${state.value}`);
      },
    );
    const returns = new ReturnExecutor<string>();

    expect(await ifElse.execute(true, { value: 1 })).toBe(true);
    expect(await ifElse.execute(false, { value: 2 })).toBe(false);
    expect(
      returns.capture(() => {
        returns.return("finished early");
      }),
    ).toBe("finished early");
    expect(branches).toEqual(["if:1", "else:2"]);
  });

  it("creates, reads, writes, and shadows local variables across scopes", () => {
    const root = new LocalVariableScope();
    root.create("score", 10);
    const child = root.child({ message: "hi" });
    child.create("lives", 3);

    expect(child.read<number>("score")).toBe(10);
    expect(child.read<string>("message")).toBe("hi");
    expect(child.read<number>("lives")).toBe(3);

    child.write("score", 15);
    child.create("scoreCopy", child.read<number>("score"));

    const shadow = child.child();
    shadow.create("score", 99);

    expect(root.read<number>("score")).toBe(15);
    expect(child.read<number>("scoreCopy")).toBe(15);
    expect(shadow.read<number>("score")).toBe(99);
    expect(shadow.snapshot()).toEqual({ message: "hi", lives: 3, score: 99, scoreCopy: 15 });
  });
});
