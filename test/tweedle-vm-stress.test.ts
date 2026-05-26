import { describe, expect, it } from "vitest";
import type { AliceMethod, AliceObject, AliceProject, AliceStatement } from "../src/a3p-parser";
import { parseTweedle } from "../src/tweedle-parser";
import { TweedleVM, executeProject } from "../src/tweedle-vm";

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

function procedure(name: string, statements: AliceStatement[]): AliceMethod {
  return { name, isFunction: false, returnType: "void", parameters: [], statements };
}

function functionMethod(
  name: string,
  returnType: string,
  parameters: Array<{ name: string; type: string }>,
  statements: AliceStatement[],
): AliceMethod {
  return { name, isFunction: true, returnType, parameters, statements };
}

function project(methods: AliceMethod[], sceneObjects: AliceObject[] = [object("bunny")]): AliceProject {
  return {
    version: "3.10",
    projectName: "StressProject",
    sceneObjects,
    methods,
  };
}

function methodCall(objectName: string, method: string, args: string[] = []): AliceStatement {
  return { kind: "MethodCall", object: objectName, method, arguments: args };
}

describe("tweedle-vm stress and edge cases", () => {
  it("survives recursive self-calls beyond the depth cap", () => {
    const ast = parseTweedle(`class DeepRecursion {
      WholeNumber recurse(WholeNumber remaining) {
        if (remaining <= 0) {
          return 0;
        }
        this.recurse(remaining - 1);
        return remaining;
      }
    }`);

    const result = new TweedleVM().execute(ast, {
      entryMethod: "recurse",
      arguments: ["150"],
      instanceName: "deepRecursion",
    });

    expect(result.execution_log.some((entry) => entry.kind === "skipped" && entry.detail.includes("Depth cap exceeded (100)"))).toBe(true);
    expect(result.returnValues.get("recurse")).toBe("150");
  });

  it("executes programs with more than one thousand sequential statements", () => {
    const statements = Array.from({ length: 1_200 }, (_, index) =>
      methodCall("bunny", `move${index}`),
    );

    const result = executeProject(project([procedure("run", statements)]));

    const methodCalls = result.execution_log.filter((entry) => entry.kind === "MethodCall");
    expect(methodCalls).toHaveLength(1_200);
    expect(methodCalls.at(0)?.detail).toContain("move0");
    expect(methodCalls.at(-1)?.detail).toContain("move1199");
  });

  it("executes doTogether with sixty branches while preserving branch isolation", () => {
    const setup: AliceStatement[] = [
      { kind: "VariableDeclaration", name: "x", varType: "Boolean", value: "false" },
      { kind: "VariableDeclaration", name: "seen", varType: "TextString", value: '"unset"' },
    ];
    const branches: AliceStatement[] = [
      { kind: "VariableAssignment", name: "x", value: "true" },
      {
        kind: "IfElse",
        condition: "x",
        ifBody: [{ kind: "VariableAssignment", name: "seen", value: '"updated"' }],
        elseBody: [{ kind: "VariableAssignment", name: "seen", value: '"original"' }],
      },
      ...Array.from({ length: 58 }, (_, index) => methodCall("bunny", `branch${index}`)),
    ];

    const run = functionMethod("run", "TextString", [], [
      ...setup,
      { kind: "DoTogether", body: branches },
      { kind: "ReturnStatement", expression: 'seen .. ":" .. x' },
    ]);

    const result = executeProject(project([run]));

    expect(result.execution_log.find((entry) => entry.kind === "DoTogether" && entry.detail.includes("60"))).toBeTruthy();
    expect(result.execution_log.filter((entry) => entry.kind === "MethodCall")).toHaveLength(58);
    expect(result.returnValues.get("run")).toBe("original:true");
  });

  it("stops infinite while loops at the iteration cap", () => {
    const run = functionMethod("run", "WholeNumber", [], [
      { kind: "VariableDeclaration", name: "count", varType: "WholeNumber", value: "0" },
      {
        kind: "WhileLoop",
        condition: "true",
        body: [{ kind: "VariableAssignment", name: "count", value: "count + 1" }],
      },
      { kind: "ReturnStatement", expression: "count" },
    ]);

    const result = executeProject(project([run]));

    expect(result.returnValues.get("run")).toBe("10000");
    expect(result.execution_log.filter((entry) => entry.kind === "VariableAssignment")).toHaveLength(10_000);
  });

  it("recovers from invalid statements and continues executing the remaining program", () => {
    const run = functionMethod("run", "TextString", [], [
      methodCall("bunny", "move"),
      { kind: "DefinitelyNotAStatement" },
      methodCall("bunny", "turn"),
      { kind: "ReturnStatement", expression: '"recovered"' },
    ]);

    const result = executeProject(project([run]));

    expect(result.execution_log.some((entry) => entry.kind === "skipped" && entry.detail.includes("DefinitelyNotAStatement"))).toBe(true);
    expect(result.execution_log.filter((entry) => entry.kind === "MethodCall")).toHaveLength(2);
    expect(result.returnValues.get("run")).toBe("recovered");
  });
});
