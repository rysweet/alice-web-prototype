import { beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  PARSED_A3P_STATEMENT_KINDS,
  parseA3P,
  type AliceMethod,
  type AliceProject,
  type AliceStatement,
} from "../src/a3p-parser";
import { LOWERED_A3P_STATEMENT_KINDS, SUPPORTED_A3P_STATEMENT_KINDS, writeA3P } from "../src/a3p-writer";

const COLLECTION_LOOP_KINDS = [
  "ForEachInArrayLoop",
  "ForEachInIterableLoop",
  "EachInArrayTogether",
  "EachInIterableTogether",
] as const;
let testUuid = 0;

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined" || typeof globalThis.XMLSerializer === "undefined") {
    const { JSDOM } = await import("jsdom");
    const window = new JSDOM().window;
    globalThis.DOMParser = window.DOMParser;
    globalThis.XMLSerializer = window.XMLSerializer;
  }
});

function createSyntheticProject(method: AliceMethod): AliceProject {
  return {
    version: "3.10062",
    projectName: "StatementCoverage",
    sceneObjects: [
      {
        name: "tree",
        typeName: "org.lgna.story.SThing",
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
      },
    ],
    methods: [method],
    types: [
      {
        name: "Program",
        superTypeName: "org.lgna.story.SScene",
        methods: [method],
        fields: [{ name: "tree", typeName: "org.lgna.story.SThing" }],
        constructors: [],
      },
    ],
  };
}

function summarizeStatement(statement: AliceStatement): unknown {
  return {
    kind: statement.kind,
    object: statement.object ?? null,
    method: statement.method ?? null,
    arguments: statement.arguments ?? [],
    count: statement.count ?? null,
    expression: statement.expression ?? null,
    condition: statement.condition ?? null,
    itemType: statement.itemType ?? null,
    itemName: statement.itemName ?? null,
    collection: statement.collection ?? null,
    name: statement.name ?? null,
    varType: statement.varType ?? null,
    value: statement.value ?? null,
    body: (statement.body ?? []).map(summarizeStatement),
    ifBody: (statement.ifBody ?? []).map(summarizeStatement),
    elseBody: (statement.elseBody ?? []).map(summarizeStatement),
  };
}

async function createParsedProjectWithCollectionLoop(kind: string): Promise<AliceProject> {
  const method: AliceMethod = {
    name: "parsedCollectionLoop",
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: [{ kind: "Comment", expression: "placeholder" }],
  };
  const zip = await JSZip.loadAsync(await writeA3P(createSyntheticProject(method)));
  const xml = await zip.file("programType.xml")!.async("string");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const collection = findMethodStatementsCollection(doc, method.name);

  while (collection.firstChild) collection.removeChild(collection.firstChild);
  collection.appendChild(createCollectionLoopNode(doc, kind));
  zip.file("programType.xml", new XMLSerializer().serializeToString(doc));

  return parseA3P(await zip.generateAsync({ type: "uint8array" }));
}

function createCollectionLoopNode(doc: Document, kind: string): Element {
  const loopNode = createTypedNode(doc, `org.lgna.project.ast.${kind}`);
  appendValueProperty(doc, loopNode, "isEnabled", "java.lang.Boolean", "true");

  const bodyProperty = doc.createElement("property");
  bodyProperty.setAttribute("name", "body");
  const bodyNode = createTypedNode(doc, "org.lgna.project.ast.BlockStatement");
  const statementsProperty = doc.createElement("property");
  statementsProperty.setAttribute("name", "statements");
  const statementsCollection = doc.createElement("collection");
  statementsCollection.setAttribute("type", "java.util.ArrayList");
  const commentNode = createTypedNode(doc, "org.lgna.project.ast.Comment");
  appendValueProperty(doc, commentNode, "text", "java.lang.String", "inside collection loop");
  statementsCollection.appendChild(commentNode);
  statementsProperty.appendChild(statementsCollection);
  bodyNode.appendChild(statementsProperty);
  bodyProperty.appendChild(bodyNode);
  loopNode.appendChild(bodyProperty);

  return loopNode;
}

function createTypedNode(doc: Document, type: string): Element {
  const node = doc.createElement("node");
  node.setAttribute("type", type);
  testUuid += 1;
  node.setAttribute("uuid", `test-${testUuid}`);
  return node;
}

function expectedCollectionLoopSummary(kind: string): unknown {
  return {
    kind,
    object: null,
    method: null,
    arguments: [],
    count: null,
    expression: null,
    condition: null,
    itemType: "Object",
    itemName: "item",
    collection: "unknown",
    name: null,
    varType: null,
    value: null,
    body: [
      {
        kind: "Comment",
        object: null,
        method: null,
        arguments: [],
        count: null,
        expression: "inside collection loop",
        condition: null,
        itemType: null,
        itemName: null,
        collection: null,
        name: null,
        varType: null,
        value: null,
        body: [],
        ifBody: [],
        elseBody: [],
      },
    ],
    ifBody: [],
    elseBody: [],
  };
}

function appendValueProperty(doc: Document, parent: Element, name: string, type: string, value: string): void {
  const property = doc.createElement("property");
  property.setAttribute("name", name);
  const valueNode = doc.createElement("value");
  valueNode.setAttribute("type", type);
  valueNode.appendChild(doc.createTextNode(value));
  property.appendChild(valueNode);
  parent.appendChild(property);
}

function findMethodStatementsCollection(doc: Document, methodName: string): Element {
  const nodes = doc.getElementsByTagName("node");
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.getAttribute("type") !== "org.lgna.project.ast.UserMethod") continue;
    if (propertyText(node, "name") !== methodName) continue;

    const bodyNode = propertyNode(node, "body");
    const statementsProperty = bodyNode ? propertyElement(bodyNode, "statements") : null;
    const collection = statementsProperty ? directChild(statementsProperty, "collection") : null;
    if (collection) return collection;
  }

  throw new Error(`Could not find statements collection for ${methodName}`);
}

function findSceneType(project: AliceProject) {
  return project.types?.find((type) => type.superTypeName?.includes("SScene")) ?? null;
}

function renameSceneField(project: AliceProject, fromName: string, toName: string): void {
  const sceneObject = project.sceneObjects.find((object) => object.name === fromName);
  if (sceneObject) {
    sceneObject.name = toName;
  }

  const field = findSceneType(project)?.fields?.find((candidate) => candidate.name === fromName);
  if (field) {
    field.name = toName;
  }
}

function addSceneMethod(project: AliceProject, method: AliceMethod): void {
  project.methods.push(method);
  const sceneType = findSceneType(project);
  if (sceneType) {
    sceneType.methods = [...(sceneType.methods ?? []), method];
  }
}

function propertyText(parent: Element, name: string): string | null {
  const property = propertyElement(parent, name);
  const value = property ? directChild(property, "value") : null;
  return value?.textContent?.trim() ?? null;
}

function propertyNode(parent: Element, name: string): Element | null {
  const property = propertyElement(parent, name);
  return property ? directChild(property, "node") : null;
}

function propertyElement(parent: Element, name: string): Element | null {
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes[index] as Element;
    if (child.nodeType === 1 && child.tagName === "property" && child.getAttribute("name") === name) {
      return child;
    }
  }
  return null;
}

function directChild(parent: Element, tagName: string): Element | null {
  for (let index = 0; index < parent.childNodes.length; index += 1) {
    const child = parent.childNodes[index] as Element;
    if (child.nodeType === 1 && child.tagName === tagName) return child;
  }
  return null;
}

describe("a3p statement serialization", () => {
  it("keeps writer statement kind categories explicit", () => {
    const parsed = new Set<string>(PARSED_A3P_STATEMENT_KINDS);
    const supported = new Set<string>(SUPPORTED_A3P_STATEMENT_KINDS);
    const lowered = new Set<string>(LOWERED_A3P_STATEMENT_KINDS);

    expect([...supported].every((kind) => parsed.has(kind))).toBe(true);
    expect([...parsed].filter((kind) => !supported.has(kind))).toEqual([
      "ForEachInArrayLoop",
      "ForEachInIterableLoop",
      "EachInArrayTogether",
      "EachInIterableTogether",
    ]);
    expect([...lowered]).toEqual(["VariableAssignment", "EventListener"]);
    expect([...lowered].every((kind) => !parsed.has(kind))).toBe(true);
  });

  it("preserves supported nested statement bodies through round-trip", async () => {
    const method: AliceMethod = {
      name: "exerciseStatements",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [
        {
          kind: "DoInOrder",
          body: [
            { kind: "MethodCall", object: "this", method: "say", arguments: ["start"] },
            {
              kind: "DoTogether",
              body: [
                { kind: "MethodCall", object: "hero", method: "move", arguments: ["FORWARD", "1.0"] },
                {
                  kind: "WhileLoop",
                  condition: "unknown",
                  body: [{ kind: "MethodCall", object: "villain", method: "turn", arguments: ["LEFT", "0.25"] }],
                },
              ],
            },
          ],
        },
        {
          kind: "CountLoop",
          count: 1,
          body: [{ kind: "MethodCall", object: "hero", method: "hop", arguments: ["2.0"] }],
        },
        {
          kind: "IfElse",
          condition: "unknown",
          ifBody: [{ kind: "MethodCall", object: "hero", method: "say", arguments: ["yes"] }],
          elseBody: [{ kind: "Comment", expression: "else branch" }],
        },
        { kind: "ReturnStatement", expression: "unknown" },
        { kind: "VariableDeclaration", name: "unknown", varType: "Object", value: "" },
      ],
    };

    const reparsed = await parseA3P(await writeA3P(createSyntheticProject(method)));
    const roundTripped = reparsed.methods.find((candidate) => candidate.name === method.name);

    expect(roundTripped?.statements.map(summarizeStatement)).toEqual(method.statements.map(summarizeStatement));
  });

  it("lowers supported TS-only runtime statements without unknown placeholders", async () => {
    const method: AliceMethod = {
      name: "tsOnlyRuntimeStatements",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [
        { kind: "VariableAssignment", name: "hero.state", value: '"ready"' },
        { kind: "EventListener", event: "SceneActivation" },
      ],
    };

    const written = await writeA3P(createSyntheticProject(method));
    const xml = await JSZip.loadAsync(written).then(async (zip) => zip.file("programType.xml")?.async("string"));
    const reparsed = await parseA3P(written);
    const roundTripped = reparsed.methods.find((candidate) => candidate.name === method.name);

    expect(xml).not.toContain("org.lgna.project.ast.VariableAssignment");
    expect(xml).not.toContain("org.lgna.project.ast.EventListener");
    expect(xml).not.toContain("unknown");
    expect(roundTripped?.statements.map((statement) => statement.kind)).toEqual(["Comment", "Comment"]);
    expect(roundTripped?.statements[0]?.expression).toBe('VariableAssignment:hero.state="ready"');
    expect(roundTripped?.statements[1]?.expression).toBe("EventListener:SceneActivation");
  });

  it("fails visibly instead of dropping unsupported statements", async () => {
    const method: AliceMethod = {
      name: "unsupported",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "UnknownFutureStatement" }],
    };

    await expect(writeA3P(createSyntheticProject(method))).rejects.toThrow("Unsupported A3P statement kind");
  });

  it("fails loudly for parser-recognized loops whose collection expressions are not preserved", async () => {
    for (const kind of COLLECTION_LOOP_KINDS) {
      const method: AliceMethod = {
        name: `unsupported${kind}`,
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{ kind }],
      };

      await expect(writeA3P(createSyntheticProject(method))).rejects.toThrow("item and collection expressions are not preserved");
    }
  });

  it("preserves parsed collection loop XML when unrelated project data changes", async () => {
    for (const kind of COLLECTION_LOOP_KINDS) {
      const original = await createParsedProjectWithCollectionLoop(kind);
      const originalMethod = original.methods.find((candidate) => candidate.name === "parsedCollectionLoop");
      expect(originalMethod?.statements.map(summarizeStatement)).toEqual([expectedCollectionLoopSummary(kind)]);

      original.projectName = `StatementCoverageRenamed${kind}`;
      const written = await writeA3P(original);
      const xml = await JSZip.loadAsync(written).then(async (zip) => zip.file("programType.xml")?.async("string"));
      const reparsed = await parseA3P(written);
      const reparsedMethod = reparsed.methods.find((candidate) => candidate.name === "parsedCollectionLoop");

      expect(xml).toContain(`org.lgna.project.ast.${kind}`);
      expect(reparsed.projectName).toBe(`StatementCoverageRenamed${kind}`);
      expect(reparsedMethod?.statements.map(summarizeStatement)).toEqual(
        originalMethod?.statements.map(summarizeStatement),
      );
    }
  });

  it("preserves parsed collection loop XML when scene fields and methods change", async () => {
    for (const kind of COLLECTION_LOOP_KINDS) {
      const original = await createParsedProjectWithCollectionLoop(kind);
      const originalMethod = original.methods.find((candidate) => candidate.name === "parsedCollectionLoop");
      const renamedField = `treeRenamed${kind}`;
      const addedMethodName = `addedBeside${kind}`;

      renameSceneField(original, "tree", renamedField);
      addSceneMethod(original, {
        name: addedMethodName,
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [],
      });

      const written = await writeA3P(original);
      const xml = await JSZip.loadAsync(written).then(async (zip) => zip.file("programType.xml")?.async("string"));
      const reparsed = await parseA3P(written);
      const reparsedMethod = reparsed.methods.find((candidate) => candidate.name === "parsedCollectionLoop");
      const reparsedSceneType = findSceneType(reparsed);

      expect(xml).toContain(`org.lgna.project.ast.${kind}`);
      expect(reparsed.sceneObjects.map((object) => object.name)).toContain(renamedField);
      expect((reparsedSceneType?.fields ?? []).map((field) => field.name)).toContain(renamedField);
      expect(reparsed.methods.map((method) => method.name)).toContain(addedMethodName);
      expect((reparsedSceneType?.methods ?? []).map((method) => method.name)).toContain(addedMethodName);
      expect(reparsedMethod?.statements.map(summarizeStatement)).toEqual(
        originalMethod?.statements.map(summarizeStatement),
      );
    }
  });

  it("rejects unsupported TS-only loop lowering directly", async () => {
    await expect(writeA3P(createSyntheticProject({
      name: "missingForEachMetadata",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "ForEachLoop", body: [] }],
    }))).rejects.toThrow("ForEachLoop cannot be lowered");

    await expect(writeA3P(createSyntheticProject({
      name: "completeForEachMetadata",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "ForEachLoop", itemType: "Object", itemName: "item", collection: "items", body: [] }],
    }))).rejects.toThrow("ForEachLoop cannot be lowered");
  });

  it("validates required fields instead of emitting unknown statement values", async () => {
    await expect(writeA3P(createSyntheticProject({
      name: "missingMethodName",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "MethodCall", object: "this" }],
    }))).rejects.toThrow("MethodCall.method is required");

    await expect(writeA3P(createSyntheticProject({
      name: "missingAssignmentName",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "VariableAssignment", value: "ready" }],
    }))).rejects.toThrow("VariableAssignment.name is required");

    await expect(writeA3P(createSyntheticProject({
      name: "missingEvent",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "EventListener" }],
    }))).rejects.toThrow("EventListener.event is required");
  });
});
