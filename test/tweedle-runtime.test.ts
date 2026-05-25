import { describe, expect, it } from "vitest";
import type { AliceMethod, AliceProject } from "../src/a3p-parser.js";
import {
  createTweedleRuntimeEnvironment,
  registerRuntimeObject,
  resolveRuntimeClassMethod,
  resolveTopLevelRuntimeMethod,
} from "../src/tweedle-runtime.js";

function method(name: string, parameters: string[] = []): AliceMethod {
  return {
    name,
    isFunction: false,
    returnType: "void",
    parameters: parameters.map((parameter) => ({ name: parameter, type: "Object" })),
    statements: [],
  };
}

describe("tweedle runtime", () => {
  it("builds a runtime environment with global scope, class registry, and method table", () => {
    const project: AliceProject = {
      version: "3.10",
      projectName: "RuntimeProject",
      sceneObjects: [],
      methods: [method("boot"), method("boot", ["payload"])],
      types: [
        {
          name: "Animal",
          methods: [method("speak")],
          constructors: [method("Animal")],
          fields: [{ name: "sound", initializer: '"growl"' }],
        },
      ],
    };

    const runtime = createTweedleRuntimeEnvironment(project);

    expect(runtime.globalScope.size).toBe(0);
    expect(runtime.classRegistry.get("Animal")).toMatchObject({
      name: "Animal",
      superTypeName: null,
    });
    expect(runtime.methodTable.get("boot")).toHaveLength(2);
  });

  it("resolves class methods using the runtime class registry", () => {
    const runtime = createTweedleRuntimeEnvironment({
      version: "3.10",
      projectName: "DispatchProject",
      sceneObjects: [],
      methods: [],
      types: [
        {
          name: "Animal",
          methods: [method("speak"), method("rename", ["value"])],
        },
        {
          name: "Dog",
          superTypeName: "Animal",
          methods: [method("speak"), method("fetch", ["thing"])],
        },
      ],
    });

    expect(resolveRuntimeClassMethod(runtime, "Dog", "speak", 0)?.name).toBe("speak");
    expect(resolveRuntimeClassMethod(runtime, "Dog", "rename", 1)?.name).toBe("rename");
    expect(resolveRuntimeClassMethod(runtime, "Dog", "fetch", 1)?.name).toBe("fetch");
    expect(resolveRuntimeClassMethod(runtime, "Dog", "fetch", 0)).toBeNull();
  });

  it("registers runtime objects in the global scope and top-level method table", () => {
    const runtime = createTweedleRuntimeEnvironment<{ name: string; typeName: string; fields: Map<string, unknown> }>({
      version: "3.10",
      projectName: "GlobalsProject",
      sceneObjects: [],
      methods: [method("run"), method("run", ["payload"])],
    });
    const bunny = { name: "bunny", typeName: "Dog", fields: new Map<string, unknown>() };

    registerRuntimeObject(runtime, bunny);

    expect(runtime.objectTable.get("bunny")).toBe(bunny);
    expect(runtime.globalScope.get("bunny")).toBe(bunny);
    expect(resolveTopLevelRuntimeMethod(runtime, "run", 1)?.parameters).toHaveLength(1);
    expect(resolveTopLevelRuntimeMethod(runtime, "run", 0)?.parameters).toHaveLength(0);
  });
});
