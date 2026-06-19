import { describe, expect, it } from "vitest";
import type { AliceProjectArchive } from "../src/project-io.js";
import { generateStandaloneJavaProject } from "../src/standalone-project.js";
import { createMinimalProject } from "./test-utils.js";

function createArchive(): AliceProjectArchive {
  const project = createMinimalProject();
  project.projectName = "Standalone Demo";
  project.methods.push({
    name: "sayHello",
    isFunction: true,
    returnType: "TextString",
    parameters: [{ name: "name", type: "TextString" }],
    statements: [{ kind: "Return", expression: "name" }],
  });
  project.types = [
    {
      name: "Program",
      superTypeName: "org.lgna.story.SProgram",
      fields: [{ name: "myScene", typeName: "Scene", initializer: null }],
      methods: [],
      constructors: [],
    },
    {
      name: "Scene",
      superTypeName: "org.lgna.story.SScene",
      fields: [{ name: "hero name", typeName: "TextString", initializer: "hero" }],
      methods: [{
        name: "setupScene",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{ kind: "MethodCall", object: "hero", method: "say", arguments: ["hello"] }],
      }],
      constructors: [],
    },
  ];

  const encoder = new TextEncoder();
  return {
    project,
    manifest: { projectName: project.projectName, createdBy: "test" },
    resources: new Map([
      ["__original_xml__", encoder.encode("<program />")],
      ["resources/example.txt", encoder.encode("hello")],
      ["folder/friendly note.txt", encoder.encode("alpha")],
      ["folder/friendly_note.txt", encoder.encode("beta")],
      ["../unsafe\\note.txt", encoder.encode("gamma")],
    ]),
    resourceEntries: [],
    thumbnail: null,
    versionInfo: {
      originalAliceVersion: project.version,
      detectedAliceVersion: project.version,
      manifestVersion: project.version,
      xmlVersion: project.version,
      versionSource: "default",
      migrated: false,
      migrationSteps: [],
    },
  };
}

describe("standalone project generation", () => {
  it("generates Maven and Gradle files plus Java source layout", () => {
    const generated = generateStandaloneJavaProject(createArchive(), {
      packageName: "org.alice.demo",
    });

    expect(generated.buildFiles).toEqual(["pom.xml", "build.gradle", "settings.gradle"]);
    expect(generated.javaSources).toContain("src/main/java/org/alice/demo/Program.java");
    expect(generated.javaSources).toContain("src/main/java/org/alice/demo/Scene.java");

    const programSource = String(generated.files.get("src/main/java/org/alice/demo/Program.java"));
    const sceneSource = String(generated.files.get("src/main/java/org/alice/demo/Scene.java"));

    expect(programSource).toContain("package org.alice.demo;");
    expect(programSource).toContain("public class Program extends org.lgna.story.SProgram");
    expect(programSource).toContain("public static String sayHello(String name)");
    expect(programSource).toContain("public static void main(String[] args)");
    expect(sceneSource).toContain("public class Scene extends org.lgna.story.SScene");
    expect(sceneSource).toContain("private String hero_name = \"\";");
    expect(sceneSource).toContain("// hero.say(hello)");

    expect(String(generated.files.get("pom.xml"))).toContain("<mainClass>org.alice.demo.Program</mainClass>");
    expect(String(generated.files.get("build.gradle"))).toContain("mainClass = \"org.alice.demo.Program\"");
    expect(String(generated.files.get("settings.gradle"))).toContain("rootProject.name = \"standalone-demo\"");
    expect(generated.files.has("src/main/resources/manifest.json")).toBe(true);
    expect(generated.files.has("src/main/resources/programType.xml")).toBe(true);
    expect(generated.files.has("src/main/resources/standalone-project.json")).toBe(true);
  });

  it("accepts strict Maven-compatible version strings", () => {
    for (const version of ["1.2.3", "1.2.3-SNAPSHOT", "2026.06.19_rc-1"]) {
      const generated = generateStandaloneJavaProject(createArchive(), {
        packageName: "org.alice.demo",
        version,
      });

      expect(String(generated.files.get("pom.xml"))).toContain(`<version>${version}</version>`);
      expect(String(generated.files.get("build.gradle"))).toContain(`version = "${version}"`);
    }
  });

  it("rejects malicious version strings before rendering POM XML", () => {
    expect(() => generateStandaloneJavaProject(createArchive(), {
      packageName: "org.alice.demo",
      buildSystem: "maven",
      version: "1.0.0</version><name>Injected</name><version>1.0.0",
    })).toThrow(/Maven version/);

    expect(() => generateStandaloneJavaProject(createArchive(), {
      packageName: "org.alice.demo",
      buildSystem: "maven",
      version: "1.0.0&injected",
    })).toThrow(/Maven version/);
  });

  it("sanitizes duplicate and unsafe resource paths for packaging", () => {
    const generated = generateStandaloneJavaProject(createArchive(), {
      packageName: "org.alice.demo",
    });

    const packagedResources = generated.resourceFiles.filter((path) => path.includes("example") || path.includes("friendly") || path.includes("unsafe") || path.includes("parent"));
    expect(packagedResources).toContain("src/main/resources/resources/example.txt");
    expect(packagedResources).toContain("src/main/resources/folder/friendly_note.txt");
    expect(packagedResources).toContain("src/main/resources/folder/friendly_note-2.txt");
    expect(packagedResources).toContain("src/main/resources/parent/unsafe/note.txt");
    expect(packagedResources.every((path) => !path.includes("\\"))).toBe(true);

    const descriptor = JSON.parse(String(generated.files.get("src/main/resources/standalone-project.json"))) as {
      resources: Array<{ sourcePath: string; packagedPath: string }>;
    };
    expect(descriptor.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourcePath: "resources/example.txt", packagedPath: "resources/example.txt" }),
      expect.objectContaining({ sourcePath: "folder/friendly note.txt", packagedPath: "folder/friendly_note.txt" }),
      expect.objectContaining({ sourcePath: "folder/friendly_note.txt", packagedPath: "folder/friendly_note-2.txt" }),
      expect.objectContaining({ sourcePath: "../unsafe\\note.txt", packagedPath: "parent/unsafe/note.txt" }),
    ]));
  });

  it("can emit Gradle-only standalone projects", () => {
    const generated = generateStandaloneJavaProject(createArchive(), {
      packageName: "org.alice.demo",
      buildSystem: "gradle",
    });

    expect(generated.buildFiles).toEqual(["build.gradle", "settings.gradle"]);
    expect(generated.files.has("pom.xml")).toBe(false);
    expect(generated.files.has("build.gradle")).toBe(true);
  });
});
