import { describe, expect, it } from "vitest";
import type { AliceProject } from "../src/a3p-parser.js";
import { parseA3P } from "../src/a3p-parser.js";
import { validateProject } from "../src/project-validation.js";
import { parseTweedle, TweedleParseError } from "../src/tweedle-parser.js";
import { executeProject } from "../src/tweedle-vm.js";

function emptyProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "ErrorPaths",
    sceneObjects: [],
    methods: [],
  };
}

describe("major module error paths", () => {
  it("parser reports malformed Tweedle with meaningful location details", () => {
    try {
      parseTweedle("class Demo { void run() { WholeNumber value = 1; } }");
      throw new Error("expected parse failure");
    } catch (error) {
      expect(error).toBeInstanceOf(TweedleParseError);
      const parseError = error as TweedleParseError;
      expect(parseError.message).toContain("Unexpected character '='");
      expect(parseError.expected).toContain("<- or ==");
      expect(parseError.line).toBeGreaterThan(0);
      expect(parseError.column).toBeGreaterThan(0);
    }
  });

  it("vm surfaces division by zero as a runtime error", () => {
    expect(() => executeProject({
      version: "3.10.0.0",
      projectName: "DivisionByZero",
      sceneObjects: [],
      methods: [
        {
          name: "run",
          isFunction: true,
          returnType: "Number",
          parameters: [],
          statements: [{ kind: "ReturnStatement", expression: "4 / 0" }],
        },
      ],
    })).toThrowError(new TypeError("division by zero"));
  });

  it("vm surfaces null receiver method calls as runtime errors", () => {
    expect(() => executeProject({
      version: "3.10.0.0",
      projectName: "NullReference",
      sceneObjects: [],
      methods: [
        {
          name: "run",
          isFunction: false,
          returnType: "void",
          parameters: [],
          statements: [
            { kind: "VariableDeclaration", name: "target", varType: "Object", value: "null" },
            { kind: "MethodCall", object: "target", method: "move", arguments: [] },
          ],
        },
      ],
    })).toThrowError(new TypeError("null reference: target"));
  });

  it("a3p parser rejects empty input with the same parse-focused error shape", async () => {
    await expect(parseA3P(new Uint8Array())).rejects.toThrow(/Failed to parse \.a3p archive: corrupted ZIP data/);
  });

  it("a3p parser rejects corrupt ZIP input with a parse-focused error", async () => {
    const corrupted = new Uint8Array([0, 1, 2, 3, 4, 5]);
    await expect(parseA3P(corrupted)).rejects.toThrow(/Failed to parse \.a3p archive: corrupted ZIP data/);
  });

  it("project validation reports circular type hierarchies", async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<project key="root">
  <node key="program" type="org.lgna.project.ast.NamedUserType">
    <property name="name"><value type="java.lang.String">Program</value></property>
    <property name="fields"><collection type="java.util.ArrayList"/></property>
    <property name="methods"><collection type="java.util.ArrayList"/></property>
    <property name="constructors"><collection type="java.util.ArrayList"/></property>
    <property name="superType">
      <node key="sprogram" type="org.lgna.project.ast.JavaType"><type name="org.lgna.story.SProgram"/></node>
    </property>
  </node>
  <node key="cycle-a" type="org.lgna.project.ast.NamedUserType">
    <property name="name"><value type="java.lang.String">CycleA</value></property>
    <property name="fields"><collection type="java.util.ArrayList"/></property>
    <property name="methods"><collection type="java.util.ArrayList"/></property>
    <property name="constructors"><collection type="java.util.ArrayList"/></property>
    <property name="superType"><node key="cycle-b"/></property>
  </node>
  <node key="cycle-b" type="org.lgna.project.ast.NamedUserType">
    <property name="name"><value type="java.lang.String">CycleB</value></property>
    <property name="fields"><collection type="java.util.ArrayList"/></property>
    <property name="methods"><collection type="java.util.ArrayList"/></property>
    <property name="constructors"><collection type="java.util.ArrayList"/></property>
    <property name="superType"><node key="cycle-a"/></property>
  </node>
</project>`;

    const result = await validateProject(emptyProject(), { xmlText: xml });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.code === "circular-type-hierarchy")).toBe(true);
    expect(result.errors.some((error) => error.message.includes("CycleA -> CycleB -> CycleA"))).toBe(true);
  });
});
