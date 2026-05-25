import { beforeAll, describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ProjectManager } from "../src/project-manager.js";

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

const SYNTHETIC_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="aaa" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="bbb">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields">
    <collection type="java.util.ArrayList">
      <node key="f1" type="org.lgna.project.ast.UserField" uuid="ccc">
        <property name="name"><value type="java.lang.String">myScene</value></property>
        <property name="valueType">
          <node key="st" type="org.lgna.project.ast.NamedUserType" uuid="ddd">
            <property name="name"><value type="java.lang.String">Scene</value></property>
            <property name="superType">
              <node key="st2" type="org.lgna.project.ast.JavaType" uuid="eee">
                <type name="org.lgna.story.SScene"/>
              </node>
            </property>
            <property name="fields"><collection type="java.util.ArrayList"/></property>
            <property name="methods"><collection type="java.util.ArrayList"/></property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
</node>`;

async function buildSyntheticZip(projectName = "ParityProject"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("version.txt", "3.6.0.0");
  zip.file("programType.xml", SYNTHETIC_XML);
  zip.file("manifest.json", JSON.stringify({ projectName, createdBy: "test" }));
  zip.file("resources/example.txt", "hello");
  return zip.generateAsync({ type: "uint8array" });
}

describe("ProjectManager parity operations", () => {
  it("creates automatic backups on save and keeps history", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();

    await pm.open(data, "project.a3p");
    pm.markDirty();
    pm.currentArchive!.manifest = { changed: true };
    await pm.save();

    const backups = pm.getBackups("project.a3p");
    expect(backups).toHaveLength(1);
    expect(backups[0].fileName).toBe("project.a3p");
    expect(backups[0].data).toBeInstanceOf(Uint8Array);
  });

  it("recovers a corrupted project from the latest backup", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("Recoverable");

    await pm.open(data, "recoverable.a3p");
    pm.markDirty();
    pm.currentArchive!.manifest = { changed: true };
    await pm.save();

    const recovered = await pm.recoverCorruptedProject(
      new Uint8Array([0, 1, 2, 3]),
      "recoverable.a3p",
    );

    expect(recovered.source).toBe("backup");
    expect(recovered.backup).not.toBeNull();
    expect(recovered.archive.project.projectName).toBe("Program");
    expect(pm.currentArchive?.project.projectName).toBe("Program");
  });

  it("exports the current archive as a standalone Java project", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("Standalone Demo");

    await pm.open(data, "standalone.a3p");
    pm.currentArchive!.project.methods.push({
      name: "sayHello",
      isFunction: true,
      returnType: "TextString",
      parameters: [{ name: "name", type: "TextString" }],
      statements: [],
    });

    const exported = pm.exportToStandaloneJavaProject("org.alice.demo");
    const mainSource = exported.files.get(
      `src/main/java/org/alice/demo/Program.java`,
    );

    expect(exported.packageName).toBe("org.alice.demo");
    expect(exported.files.has("pom.xml")).toBe(true);
    expect(exported.files.has("build.gradle")).toBe(true);
    expect(exported.files.has("settings.gradle")).toBe(true);
    expect(typeof mainSource).toBe("string");
    expect(String(mainSource)).toContain("package org.alice.demo;");
    expect(String(mainSource)).toContain("public static String sayHello(String name)");
    expect(exported.files.has("src/main/resources/programType.xml")).toBe(true);
    expect(exported.files.has("src/main/resources/resources/example.txt")).toBe(true);
    expect(exported.files.has("src/main/resources/standalone-project.json")).toBe(true);
  });
});
