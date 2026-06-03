import { beforeAll, describe, expect, it } from "vitest";
import { parseA3P, type AliceProject, type AliceStatement } from "../src/a3p-parser";
import { writeA3P } from "../src/a3p-writer";

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined" || typeof globalThis.XMLSerializer === "undefined") {
    const { JSDOM } = await import("jsdom");
    const window = new JSDOM().window;
    globalThis.DOMParser = window.DOMParser;
    globalThis.XMLSerializer = window.XMLSerializer;
  }
});

function projectWithStatements(statements: AliceStatement[]): AliceProject {
  const method = {
    name: "myAction",
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements,
  };
  return {
    version: "3.6.0.0",
    projectName: "StmtRoundTrip",
    sceneObjects: [],
    methods: [method],
    types: [
      {
        name: "Scene",
        superTypeName: "org.lgna.story.SScene",
        fields: [],
        methods: [method],
        constructors: [],
      },
    ],
  };
}

function findMethodStatements(project: AliceProject, methodName: string): AliceStatement[] {
  const sceneType = project.types?.find((t) => t.superTypeName?.includes("SScene"));
  const method = sceneType?.methods?.find((m) => m.name === methodName);
  return method?.statements ?? [];
}

describe("a3p statement round-trip", { timeout: 30_000 }, () => {
  // 1. Comment round-trip
  it("round-trips Comment statements", async () => {
    const project = projectWithStatements([
      { kind: "Comment", expression: "Hello, world!" },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("Comment");
    expect(stmts[0].expression).toBe("Hello, world!");
  });

  // 2. MethodCall round-trip (with object + method + args)
  it("round-trips MethodCall with object, method, and arguments", async () => {
    const project = projectWithStatements([
      { kind: "MethodCall", object: "myBunny", method: "say", arguments: ["Hello!"] },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("MethodCall");
    expect(stmts[0].method).toBe("say");
    expect(stmts[0].object).toBe("myBunny");
    expect(stmts[0].arguments).toEqual(["Hello!"]);
  });

  // 3. DoInOrder round-trip
  it("round-trips DoInOrder with nested statements", async () => {
    const project = projectWithStatements([
      {
        kind: "DoInOrder",
        body: [
          { kind: "Comment", expression: "first" },
          { kind: "Comment", expression: "second" },
        ],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("DoInOrder");
    expect(stmts[0].body).toHaveLength(2);
    expect(stmts[0].body![0].expression).toBe("first");
    expect(stmts[0].body![1].expression).toBe("second");
  });

  // 4. DoTogether round-trip
  it("round-trips DoTogether with nested statements", async () => {
    const project = projectWithStatements([
      {
        kind: "DoTogether",
        body: [
          { kind: "Comment", expression: "parallel1" },
          { kind: "Comment", expression: "parallel2" },
        ],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("DoTogether");
    expect(stmts[0].body).toHaveLength(2);
    expect(stmts[0].body![0].expression).toBe("parallel1");
  });

  // 5. WhileLoop round-trip
  it("round-trips WhileLoop with condition and body", async () => {
    const project = projectWithStatements([
      {
        kind: "WhileLoop",
        condition: "true",
        body: [{ kind: "Comment", expression: "looping" }],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("WhileLoop");
    expect(stmts[0].condition).toBe("true");
    expect(stmts[0].body).toHaveLength(1);
    expect(stmts[0].body![0].kind).toBe("Comment");
  });

  // 6. CountLoop round-trip
  it("round-trips CountLoop with count and body", async () => {
    const project = projectWithStatements([
      {
        kind: "CountLoop",
        count: 5,
        countExpression: "5",
        body: [{ kind: "Comment", expression: "counting" }],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("CountLoop");
    expect(stmts[0].count).toBe(5);
    expect(stmts[0].body).toHaveLength(1);
    expect(stmts[0].body![0].kind).toBe("Comment");
  });

  // 7. IfElse round-trip
  it("round-trips IfElse with condition, ifBody, and elseBody", async () => {
    const project = projectWithStatements([
      {
        kind: "IfElse",
        condition: "true",
        ifBody: [{ kind: "Comment", expression: "if-branch" }],
        elseBody: [{ kind: "Comment", expression: "else-branch" }],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("IfElse");
    expect(stmts[0].condition).toBe("true");
    expect(stmts[0].ifBody).toHaveLength(1);
    expect(stmts[0].ifBody![0].expression).toBe("if-branch");
    expect(stmts[0].elseBody).toHaveLength(1);
    expect(stmts[0].elseBody![0].expression).toBe("else-branch");
  });

  // 8. ForEachLoop round-trip
  it("round-trips ForEachLoop with item, collection, and body", async () => {
    const project = projectWithStatements([
      {
        kind: "ForEachLoop",
        itemName: "animal",
        itemType: "org.lgna.story.SBiped",
        collection: "myArray",
        body: [{ kind: "Comment", expression: "each item" }],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("ForEachLoop");
    expect(stmts[0].itemName).toBe("animal");
    expect(stmts[0].body).toHaveLength(1);
  });

  // 9. EachInArrayTogether round-trip
  it("round-trips EachInArrayTogether", async () => {
    const project = projectWithStatements([
      {
        kind: "EachInArrayTogether",
        itemName: "obj",
        collection: "items",
        body: [{ kind: "Comment", expression: "parallel each" }],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("EachInArrayTogether");
    expect(stmts[0].itemName).toBe("obj");
    expect(stmts[0].body).toHaveLength(1);
  });

  // 10. ReturnStatement round-trip
  it("round-trips ReturnStatement with expression", async () => {
    const method = {
      name: "getGreeting",
      isFunction: true,
      returnType: "java.lang.String",
      parameters: [],
      statements: [{ kind: "ReturnStatement", expression: "hello" } as AliceStatement],
    };
    const project: AliceProject = {
      version: "3.6.0.0",
      projectName: "ReturnTest",
      sceneObjects: [],
      methods: [method],
      types: [
        {
          name: "Scene",
          superTypeName: "org.lgna.story.SScene",
          fields: [],
          methods: [method],
          constructors: [],
        },
      ],
    };
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "getGreeting");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("ReturnStatement");
    expect(stmts[0].expression).toBe("hello");
  });

  // 11. VariableDeclaration round-trip
  it("round-trips VariableDeclaration with name, type, and value", async () => {
    const project = projectWithStatements([
      { kind: "VariableDeclaration", name: "count", varType: "java.lang.Integer", value: "42" },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("VariableDeclaration");
    expect(stmts[0].name).toBe("count");
    expect(stmts[0].varType).toBe("java.lang.Integer");
    expect(stmts[0].value).toBe("42");
  });

  // 12. Nested DoInOrder containing MethodCalls
  it("round-trips nested DoInOrder with MethodCall children", async () => {
    const project = projectWithStatements([
      {
        kind: "DoInOrder",
        body: [
          { kind: "MethodCall", object: "cat", method: "walk", arguments: [] },
          { kind: "MethodCall", object: "dog", method: "run", arguments: ["fast"] },
        ],
      },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("DoInOrder");
    expect(stmts[0].body).toHaveLength(2);
    expect(stmts[0].body![0].kind).toBe("MethodCall");
    expect(stmts[0].body![0].object).toBe("cat");
    expect(stmts[0].body![0].method).toBe("walk");
    expect(stmts[0].body![1].object).toBe("dog");
    expect(stmts[0].body![1].method).toBe("run");
    expect(stmts[0].body![1].arguments).toEqual(["fast"]);
  });

  // 13. syncMethodSignature creates body when missing
  it("creates body node for method with statements when syncing existing method without body", async () => {
    // First write a project with no statements (so method has no body in XML)
    const emptyProject = projectWithStatements([]);
    const emptyWritten = await writeA3P(emptyProject);
    const emptyReparsed = await parseA3P(emptyWritten);

    // Now add statements and re-write (triggers syncMethodSignature)
    const sceneType = emptyReparsed.types?.find((t) => t.superTypeName?.includes("SScene"));
    const method = sceneType?.methods?.find((m) => m.name === "myAction");
    if (method) {
      method.statements = [{ kind: "Comment", expression: "added after sync" }];
    }
    const rewritten = await writeA3P(emptyReparsed);
    const final = await parseA3P(rewritten);
    const stmts = findMethodStatements(final, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("Comment");
    expect(stmts[0].expression).toBe("added after sync");
  });

  // 14. syncMethodSignature clears statements when desired is empty
  it("clears statements when desired method has empty statements list", async () => {
    const project = projectWithStatements([
      { kind: "Comment", expression: "will be removed" },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);

    // Remove all statements
    const sceneType = reparsed.types?.find((t) => t.superTypeName?.includes("SScene"));
    const method = sceneType?.methods?.find((m) => m.name === "myAction");
    if (method) {
      method.statements = [];
    }
    const projectMethods = reparsed.methods.find((m) => m.name === "myAction");
    if (projectMethods) {
      projectMethods.statements = [];
    }

    const rewritten = await writeA3P(reparsed);
    const final = await parseA3P(rewritten);
    const stmts = findMethodStatements(final, "myAction");
    expect(stmts).toHaveLength(0);
  });

  // 15. Mixed statement types in single method
  it("round-trips mixed statement types in a single method", async () => {
    const project = projectWithStatements([
      { kind: "Comment", expression: "setup" },
      { kind: "MethodCall", object: "this", method: "doStuff", arguments: [] },
      { kind: "DoInOrder", body: [{ kind: "Comment", expression: "step1" }] },
      { kind: "CountLoop", count: 3, countExpression: "3", body: [] },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(4);
    expect(stmts[0].kind).toBe("Comment");
    expect(stmts[1].kind).toBe("MethodCall");
    expect(stmts[2].kind).toBe("DoInOrder");
    expect(stmts[3].kind).toBe("CountLoop");
    expect(stmts[3].count).toBe(3);
  });

  // 16. MethodCall with multiple arguments
  it("round-trips MethodCall with multiple arguments", async () => {
    const project = projectWithStatements([
      { kind: "MethodCall", object: "alice", method: "moveToward", arguments: ["target", "0.5", "2"] },
    ]);
    const written = await writeA3P(project);
    const reparsed = await parseA3P(written);
    const stmts = findMethodStatements(reparsed, "myAction");
    expect(stmts).toHaveLength(1);
    expect(stmts[0].kind).toBe("MethodCall");
    expect(stmts[0].method).toBe("moveToward");
    expect(stmts[0].object).toBe("alice");
    expect(stmts[0].arguments).toEqual(["target", "0.5", "2"]);
  });
});
