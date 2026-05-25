import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import {
  DEFAULT_GRADING_DIMENSIONS,
  gradeA3P,
} from "../src/grading-pipeline";

function javaType(typeName: string, uuid: string): string {
  return `<node type="org.lgna.project.ast.JavaType" uuid="${uuid}"><type name="${typeName}"/></node>`;
}

function userParameter(name: string, typeName: string, uuid: string): string {
  return `<node type="org.lgna.project.ast.UserParameter" uuid="${uuid}">
    <property name="name"><value type="java.lang.String">${name}</value></property>
    <property name="valueType">${javaType(typeName, `${uuid}-type`)}</property>
  </node>`;
}

function expressionStatement(methodName: string, uuid: string): string {
  return `<node type="org.lgna.project.ast.ExpressionStatement" uuid="${uuid}">
    <property name="expression">
      <node type="org.lgna.project.ast.MethodInvocation" uuid="${uuid}-expr">
        <property name="method">
          <node type="org.lgna.project.ast.JavaMethod" uuid="${uuid}-method">
            <property name="name"><value type="java.lang.String">${methodName}</value></property>
          </node>
        </property>
      </node>
    </property>
  </node>`;
}

function simpleStatement(typeName: string, uuid: string): string {
  return `<node type="${typeName}" uuid="${uuid}"/>`;
}

function userMethod(options: {
  name: string;
  uuid: string;
  returnType?: string;
  parameters?: string[];
  statements?: string[];
}): string {
  const {
    name,
    uuid,
    returnType = "void",
    parameters = [],
    statements = [],
  } = options;

  return `<node type="org.lgna.project.ast.UserMethod" uuid="${uuid}">
    <property name="name"><value type="java.lang.String">${name}</value></property>
    <property name="returnType">${javaType(returnType, `${uuid}-return`)}</property>
    <property name="requiredParameters"><collection type="java.util.ArrayList">${parameters.join("")}</collection></property>
    <property name="body">
      <node type="org.lgna.project.ast.BlockStatement" uuid="${uuid}-body">
        <property name="statements"><collection type="java.util.ArrayList">${statements.join("")}</collection></property>
      </node>
    </property>
  </node>`;
}

function buildPipelineFixtureXml(): string {
  const methods = [
    userMethod({
      name: "moveBunny",
      uuid: "move-bunny",
      statements: [expressionStatement("move", "move-bunny-call")],
    }),
    userMethod({
      name: "handleSceneStart",
      uuid: "handle-scene-start",
      statements: [simpleStatement("org.lgna.project.ast.SceneActivationEvent", "scene-event")],
    }),
    userMethod({
      name: "declareCounter",
      uuid: "declare-counter",
      statements: [simpleStatement("org.lgna.project.ast.LocalDeclarationStatement", "declare-counter-statement")],
    }),
    userMethod({
      name: "repeatMove",
      uuid: "repeat-move",
      statements: [simpleStatement("org.lgna.project.ast.CountLoop", "repeat-loop")],
    }),
    userMethod({
      name: "computeScore",
      uuid: "compute-score",
      returnType: "java.lang.Number",
      parameters: [userParameter("amount", "java.lang.Number", "amount-parameter")],
      statements: [simpleStatement("org.lgna.project.ast.ReturnStatement", "compute-score-return")],
    }),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="program" type="org.lgna.project.ast.NamedUserType" uuid="program" version="3.10062">
  <property name="name"><value type="java.lang.String">PipelineProgram</value></property>
  <property name="superType">${javaType("org.lgna.story.SProgram", "program-super")}</property>
  <property name="fields">
    <collection type="java.util.ArrayList">
      <node type="org.lgna.project.ast.UserField" uuid="scene-field">
        <property name="name"><value type="java.lang.String">myScene</value></property>
        <property name="valueType">
          <node type="org.lgna.project.ast.NamedUserType" uuid="scene-type">
            <property name="name"><value type="java.lang.String">Scene</value></property>
            <property name="superType">${javaType("org.lgna.story.SScene", "scene-super")}</property>
            <property name="fields">
              <collection type="java.util.ArrayList">
                <node type="org.lgna.project.ast.UserField" uuid="ground-field">
                  <property name="name"><value type="java.lang.String">ground</value></property>
                  <property name="valueType">${javaType("org.lgna.story.SGround", "ground-type")}</property>
                </node>
                <node type="org.lgna.project.ast.UserField" uuid="camera-field">
                  <property name="name"><value type="java.lang.String">camera</value></property>
                  <property name="valueType">${javaType("org.lgna.story.SCamera", "camera-type")}</property>
                </node>
                <node type="org.lgna.project.ast.UserField" uuid="bunny-field">
                  <property name="name"><value type="java.lang.String">bunny</value></property>
                  <property name="valueType">${javaType("org.lgna.story.SBiped", "bunny-type")}</property>
                </node>
              </collection>
            </property>
            <property name="methods"><collection type="java.util.ArrayList">${methods}</collection></property>
            <property name="constructors"><collection type="java.util.ArrayList"/></property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
</node>`;
}

async function createPipelineFixtureA3P(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("version.txt", "3.10.0.0");
  zip.file("programType.xml", buildPipelineFixtureXml());
  return zip.generateAsync({ type: "uint8array" });
}

describe("grading pipeline A3P flow", () => {
  it("grades an A3P file from parse through HTML report generation", async () => {
    const result = await gradeA3P(await createPipelineFixtureA3P());

    expect(result.project.projectName).toBe("PipelineProgram");
    expect(Array.from(result.input.scene.entities.keys())).toEqual(
      expect.arrayContaining(["ground", "camera", "bunny"]),
    );

    expect(result.ast.methodCount).toBe(5);
    expect(result.ast.functionCount).toBe(1);
    expect(result.ast.parameterCount).toBe(1);
    expect(result.ast.variableCount).toBe(1);
    expect(result.ast.loopCount).toBe(1);
    expect(result.ast.eventCount).toBe(1);
    expect(result.ast.methodCallCount).toBe(1);
    expect(result.ast.statementCount).toBe(5);

    expect(result.input.executionLog.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        "MethodCall",
        "SceneActivationEvent",
        "VariableDeclaration",
        "CountLoop",
        "ReturnStatement",
      ]),
    );
    expect(result.input.eventRegistrations).toEqual([
      {
        eventType: "SceneActivationEvent",
        handlerName: "handleSceneStart",
      },
    ]);
    expect(result.input.declaredMethods).toEqual([
      "moveBunny",
      "handleSceneStart",
      "declareCounter",
      "repeatMove",
      "computeScore",
    ]);

    expect(result.results.map((grade) => grade.dimension)).toEqual([
      ...DEFAULT_GRADING_DIMENSIONS,
    ]);
    for (const grade of result.results) {
      expect(grade.passed).toBe(true);
      expect(grade.score).toBe(1);
    }

    expect(result.reportHtml).toContain("Grading report for PipelineProgram");
    expect(result.reportHtml).toContain("6/6 dimensions passed");
    expect(result.reportHtml).toContain("first-lesson");
    expect(result.reportHtml).toContain("event-handlers");
    expect(result.reportHtml).toContain("variable-declarations");
    expect(result.reportHtml).toContain("loop-statements");
    expect(result.reportHtml).toContain("functions");
    expect(result.reportHtml).toContain("parameters");
  });
});
