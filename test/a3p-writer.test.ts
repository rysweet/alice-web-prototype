import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { parseA3P } from "../src/a3p-parser";
import { modifyAndWriteA3P } from "../src/a3p-writer";

const ALICE_HOME = process.env.ALICE_HOME ?? path.resolve(__dirname, "../../alice");
const STARTER_A3P = path.join(
  ALICE_HOME,
  "core/resources/target/distribution/application/starter-projects/amazonMinimum.a3p",
);
const OUTPUT_DIR = path.resolve(__dirname, "../.test-roundtrip");

describe("a3p-writer round-trip", () => {
  const fileExists = fs.existsSync(STARTER_A3P);

  beforeAll(() => {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  it.skipIf(!fileExists)("modifies and writes .a3p back", async () => {
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    const result = await modifyAndWriteA3P(STARTER_A3P, outputPath, {
      addCommentToMethod: "performCustomSetup",
      commentText: "round-trip proof",
    });

    expect(result.bytesWritten).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);
    expect(fs.statSync(outputPath).size).toBeGreaterThan(100);
  });

  it.skipIf(!fileExists)("modified .a3p is re-parseable", async () => {
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    if (!fs.existsSync(outputPath)) return;

    const data = fs.readFileSync(outputPath);
    const project = await parseA3P(data);

    expect(project.projectName).toBeTruthy();
    expect(project.sceneObjects.length).toBeGreaterThan(0);
    expect(project.methods.length).toBeGreaterThan(0);
  });

  it.skipIf(!fileExists)("preserves scene objects through round-trip", async () => {
    const original = await parseA3P(fs.readFileSync(STARTER_A3P));
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    if (!fs.existsSync(outputPath)) return;

    const modified = await parseA3P(fs.readFileSync(outputPath));
    expect(modified.sceneObjects.length).toBe(original.sceneObjects.length);
    expect(modified.projectName).toBe(original.projectName);
  });

  it.skipIf(!fileExists)("preserves methods through round-trip", async () => {
    const original = await parseA3P(fs.readFileSync(STARTER_A3P));
    const outputPath = path.join(OUTPUT_DIR, "modified.a3p");
    if (!fs.existsSync(outputPath)) return;

    const modified = await parseA3P(fs.readFileSync(outputPath));
    const origNames = original.methods.map((m) => m.name).sort();
    const modNames = modified.methods.map((m) => m.name).sort();
    expect(modNames).toEqual(origNames);
  });
});

describe("generateUserMethodXml", () => {
  // Import will fail until implementation exists — that's TDD
  let generateUserMethodXml: typeof import("../src/a3p-writer")["generateUserMethodXml"];

  beforeAll(async () => {
    const mod = await import("../src/a3p-writer");
    generateUserMethodXml = mod.generateUserMethodXml;
  });

  it("generates valid XML for a void procedure with no parameters", () => {
    const xml = generateUserMethodXml({
      name: "wave",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [],
    });

    // Must contain UserMethod type
    expect(xml).toContain('type="org.lgna.project.ast.UserMethod"');
    // Must have method name
    expect(xml).toContain(">wave</value>");
    // Must have isFunction = false
    expect(xml).toContain(">false</value>");
    // Must have void return type
    expect(xml).toContain(">void</value>");
    // Must have empty statements collection
    expect(xml).toContain('type="org.lgna.project.ast.Statement[]"');
    // Must have empty parameters collection
    expect(xml).toContain('type="org.lgna.project.ast.UserParameter[]"');
    // Must have UUID attributes
    expect(xml).toMatch(/uuid="[0-9a-f-]{36}"/);
  });

  it("generates valid XML for a function with return type", () => {
    const xml = generateUserMethodXml({
      name: "getSpeed",
      isFunction: true,
      returnType: "java.lang.Double",
      parameters: [],
      statements: [],
    });

    expect(xml).toContain(">true</value>"); // isFunction
    expect(xml).toContain(">java.lang.Double</value>"); // returnType in JavaType node
    expect(xml).toContain('type="org.lgna.project.ast.JavaType"'); // returnType wrapper
    expect(xml).toContain('<property name="class">'); // JavaType uses "class" property
  });

  it("generates parameter nodes with correct structure", () => {
    const xml = generateUserMethodXml({
      name: "move",
      isFunction: false,
      returnType: "void",
      parameters: [
        { name: "distance", type: "java.lang.Double" },
        { name: "direction", type: "java.lang.Integer" },
      ],
      statements: [],
    });

    // Must contain UserParameter nodes
    expect(xml).toContain('type="org.lgna.project.ast.UserParameter"');
    // Must have parameter names
    expect(xml).toContain(">distance</value>");
    expect(xml).toContain(">direction</value>");
    // Must have parameter types via JavaType
    expect(xml).toContain(">java.lang.Double</value>");
    expect(xml).toContain(">java.lang.Integer</value>");
    // Parameter types use valueType property
    expect(xml).toContain('<property name="valueType">');
    // Each parameter gets its own UUID
    const uuidMatches = xml.match(/type="org\.lgna\.project\.ast\.UserParameter" uuid="([^"]+)"/g);
    expect(uuidMatches).toHaveLength(2);
  });

  it("XML-escapes method and parameter names for defense-in-depth", () => {
    // Even though validation should prevent this, escapeXml provides defense-in-depth
    const xml = generateUserMethodXml({
      name: "test<injection>",
      isFunction: false,
      returnType: "void",
      parameters: [{ name: 'param"evil', type: "java.lang.Double" }],
      statements: [],
    });

    // Names must be escaped
    expect(xml).toContain("test&lt;injection&gt;");
    expect(xml).toContain("param&quot;evil");
    // Raw dangerous chars must NOT appear unescaped in value text
    expect(xml).not.toContain(">test<injection>");
    expect(xml).not.toContain('>param"evil<');  });

  it("generates unique UUIDs for method and each parameter", () => {
    const xml = generateUserMethodXml({
      name: "multi",
      isFunction: false,
      returnType: "void",
      parameters: [
        { name: "a", type: "java.lang.Double" },
        { name: "b", type: "java.lang.Double" },
      ],
      statements: [],
    });

    // Extract all UUIDs
    const uuids = [...xml.matchAll(/uuid="([0-9a-f-]{36})"/g)].map((m) => m[1]);
    // Method UUID + 2 parameter UUIDs = at least 3
    expect(uuids.length).toBeGreaterThanOrEqual(3);
    // All unique
    const unique = new Set(uuids);
    expect(unique.size).toBe(uuids.length);
  });

  it("includes empty BlockStatement body", () => {
    const xml = generateUserMethodXml({
      name: "empty",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [],
    });

    expect(xml).toContain('type="org.lgna.project.ast.BlockStatement"');
    expect(xml).toContain('<property name="statements">');
    expect(xml).toContain('type="org.lgna.project.ast.Statement[]"');
  });
});
