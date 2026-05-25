import { expect } from "vitest";
import type { AliceMethod, AliceProject, AliceStatement } from "../src/a3p-parser.js";
import { encodeAstNode, type AstSerializableNode } from "../src/ast-serialization.js";
import { AbstractNode } from "../src/ast-nodes.js";
import { Scene, SBox } from "../src/story-api";
import type { ClassDecl } from "../src/tweedle-parser.js";
import { parseTweedle } from "../src/tweedle-parser.js";
import { TweedleVM, type ExecutionResult, type TweedleExecutionOptions } from "../src/tweedle-vm.js";

export interface TweedleMethodSpec {
  name: string;
  returnType?: string;
  parameters?: string[];
  body?: string[];
  isStatic?: boolean;
  visibility?: string | null;
}

export interface ParseAndExecuteResult {
  ast: ClassDecl;
  result: ExecutionResult;
}

function cloneJson<T>(value: T): T {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeXml(xml: string): string {
  return xml.replace(/>\s+</g, "><").trim();
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([left], [right]) => String(left).localeCompare(String(right)))
      .map(([key, entryValue]) => [key, canonicalize(entryValue)]);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .filter((key) => key !== "id" && key !== "parent")
      .sort()
      .map((key) => [key, canonicalize(record[key])]);
    return Object.fromEntries(entries);
  }
  return String(value);
}

function trySerializeAst(value: unknown): string | null {
  if (!(value instanceof AbstractNode)) {
    return null;
  }
  try {
    return normalizeXml(encodeAstNode(value as AstSerializableNode));
  } catch {
    return null;
  }
}

export function createMinimalProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Program",
    sceneObjects: [],
    methods: [],
    types: [
      {
        name: "Program",
        superTypeName: "org.lgna.story.SProgram",
        fields: [{ name: "myScene", typeName: "Scene", resourceType: null, initializer: null }],
        methods: [],
        constructors: [],
      },
      {
        name: "Scene",
        superTypeName: "org.lgna.story.SScene",
        fields: [],
        methods: [],
        constructors: [],
      },
    ],
  };
}

export function createSceneWithEntities(names: string[]): Scene {
  const scene = new Scene();
  for (const [index, name] of names.entries()) {
    const entity = new SBox();
    entity.name = name;
    entity.position = { x: index * 2, y: 0, z: 0 };
    scene.addEntity(name, entity);
  }
  return scene;
}

export function createProcedureWithStatements(stmts: AliceStatement[], name = "myFirstMethod"): AliceMethod {
  return {
    name,
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: cloneJson(stmts),
  };
}

export function createTweedleSource(className: string, methods: Array<TweedleMethodSpec | string>): string {
  const renderedMethods = methods.map((method) => {
    if (typeof method === "string") {
      return method.trim();
    }
    const visibility = method.visibility ? `${method.visibility} ` : "";
    const isStatic = method.isStatic ? "static " : "";
    const returnType = method.returnType ?? "void";
    const parameters = method.parameters?.join(", ") ?? "";
    const body = method.body?.length
      ? `\n${method.body.map((line) => `    ${line}`).join("\n")}\n`
      : "\n";
    return `${visibility}${isStatic}${returnType} ${method.name}(${parameters}) {${body}  }`;
  });

  return `class ${className} {\n${renderedMethods.map((method) => `  ${method}`).join("\n\n")}\n}`;
}

export function parseAndExecute(source: string, options: TweedleExecutionOptions = {}): ParseAndExecuteResult {
  const ast = parseTweedle(source);
  const vm = new TweedleVM();
  const result = vm.execute(ast, options);
  return { ast, result };
}

export function assertAstEquals(a: unknown, b: unknown): void {
  const serializedA = trySerializeAst(a);
  const serializedB = trySerializeAst(b);
  if (serializedA !== null && serializedB !== null) {
    expect(serializedA).toBe(serializedB);
    return;
  }
  expect(canonicalize(a)).toEqual(canonicalize(b));
}
