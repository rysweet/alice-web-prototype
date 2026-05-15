import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { parseA3P, type AliceProject, type AliceObject } from "../src/a3p-parser";

// Polyfill DOMParser for Node.js (vitest runs in Node)
beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

// Path to a real .a3p file in the Alice repo
const AMAZON_A3P = path.resolve(
  __dirname,
  "../../alice/worktrees/feat/issue-551-write-characterization-tests-for-virtualmachinejav/core/resources/src/application/resources/starter-projects/amazonFull.a3p"
);
const SMOKE_A3P = path.resolve(
  __dirname,
  "../../alice/netbeans/target/ant-jar-command-line-smoke/jar-command-line-world.a3p"
);

// ─── Synthetic minimal .a3p for isolated unit tests ──────────────────
async function createSyntheticA3P(): Promise<Uint8Array> {
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
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
            <property name="fields">
              <collection type="java.util.ArrayList">
                <node key="f2" type="org.lgna.project.ast.UserField" uuid="fff">
                  <property name="name"><value type="java.lang.String">ground</value></property>
                  <property name="valueType">
                    <node key="gt" type="org.lgna.project.ast.JavaType" uuid="ggg">
                      <type name="org.lgna.story.SGround"/>
                    </node>
                  </property>
                </node>
                <node key="f3" type="org.lgna.project.ast.UserField" uuid="hhh">
                  <property name="name"><value type="java.lang.String">camera</value></property>
                  <property name="valueType">
                    <node key="ct" type="org.lgna.project.ast.JavaType" uuid="iii">
                      <type name="org.lgna.story.SCamera"/>
                    </node>
                  </property>
                </node>
                <node key="f4" type="org.lgna.project.ast.UserField" uuid="jjj">
                  <property name="name"><value type="java.lang.String">bananaTree</value></property>
                  <property name="valueType">
                    <node key="bt" type="org.lgna.project.ast.NamedUserType" uuid="kkk">
                      <property name="name"><value type="java.lang.String">BananaTree</value></property>
                      <property name="superType">
                        <node key="bts" type="org.lgna.project.ast.JavaType" uuid="lll">
                          <type name="org.lgna.story.SProp"/>
                        </node>
                      </property>
                      <property name="fields"><collection type="java.util.ArrayList"/></property>
                      <property name="methods"><collection type="java.util.ArrayList"/></property>
                      <property name="constructors"><collection type="java.util.ArrayList"/></property>
                    </node>
                  </property>
                  <property name="initializer">
                    <node type="org.lgna.project.ast.InstanceCreation" uuid="mmm">
                      <resourceReference name="org.lgna.story.resources.prop.BananaTreeResource"/>
                    </node>
                  </property>
                </node>
              </collection>
            </property>
            <property name="methods"><collection type="java.util.ArrayList"/></property>
            <property name="constructors"><collection type="java.util.ArrayList"/></property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
</node>`;

  const zip = new JSZip();
  zip.file("version.txt", "3.10.0.0");
  zip.file("programType.xml", xml);
  return zip.generateAsync({ type: "uint8array" });
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("a3p-parser", () => {
  describe("synthetic .a3p", () => {
    let project: AliceProject;

    beforeAll(async () => {
      const data = await createSyntheticA3P();
      project = await parseA3P(data);
    });

    it("reads the version string", () => {
      expect(project.version).toBe("3.10.0.0");
    });

    it("extracts the project name", () => {
      expect(project.projectName).toBe("Program");
    });

    it("finds scene objects", () => {
      expect(project.sceneObjects.length).toBe(3);
      const names = project.sceneObjects.map((o) => o.name);
      expect(names).toContain("ground");
      expect(names).toContain("camera");
      expect(names).toContain("bananaTree");
    });

    it("identifies object types", () => {
      const ground = project.sceneObjects.find((o) => o.name === "ground")!;
      expect(ground.typeName).toContain("SGround");
    });

    it("extracts resource type", () => {
      const tree = project.sceneObjects.find((o) => o.name === "bananaTree")!;
      expect(tree.resourceType).toContain("BananaTreeResource");
    });
  });

  // Real file tests – skipped if files don't exist
  describe("real amazonFull.a3p", () => {
    let project: AliceProject;
    const fileExists = fs.existsSync(AMAZON_A3P);

    beforeAll(async () => {
      if (!fileExists) return;
      const data = fs.readFileSync(AMAZON_A3P);
      project = await parseA3P(data);
    });

    it.skipIf(!fileExists)("parses version", () => {
      expect(project.version).toMatch(/^3\.\d/);
    });

    it.skipIf(!fileExists)("finds many scene objects", () => {
      expect(project.sceneObjects.length).toBeGreaterThan(10);
    });

    it.skipIf(!fileExists)("extracts positions for some objects", () => {
      const withPos = project.sceneObjects.filter((o) => o.position !== null);
      expect(withPos.length).toBeGreaterThan(0);
    });

    it.skipIf(!fileExists)("finds ground and camera", () => {
      const names = project.sceneObjects.map((o) => o.name);
      expect(names).toContain("ground");
      expect(names).toContain("camera");
    });
  });

  describe("real smoke .a3p (UTF-16BE)", () => {
    let project: AliceProject;
    const fileExists = fs.existsSync(SMOKE_A3P);

    beforeAll(async () => {
      if (!fileExists) return;
      const data = fs.readFileSync(SMOKE_A3P);
      project = await parseA3P(data);
    });

    it.skipIf(!fileExists)("handles UTF-16 encoded XML", () => {
      expect(project.projectName).toBe("Program");
    });

    it.skipIf(!fileExists)("reads version", () => {
      expect(project.version).toMatch(/^3\./);
    });
  });

  describe("method extraction from built starter project", () => {
    const BUILT_A3P = path.resolve(
      __dirname,
      "../../alice/core/resources/target/distribution/application/starter-projects/amazonMinimum.a3p",
    );
    let project: AliceProject;
    const fileExists = fs.existsSync(BUILT_A3P);

    beforeAll(async () => {
      if (!fileExists) return;
      const data = fs.readFileSync(BUILT_A3P);
      project = await parseA3P(data);
    });

    it.skipIf(!fileExists)("extracts methods from scene type", () => {
      expect(project.methods.length).toBeGreaterThan(0);
    });

    it.skipIf(!fileExists)("finds performCustomSetup method", () => {
      const setup = project.methods.find((m) => m.name === "performCustomSetup");
      expect(setup).toBeDefined();
    });

    it.skipIf(!fileExists)("methods have statement arrays", () => {
      for (const m of project.methods) {
        expect(Array.isArray(m.statements)).toBe(true);
      }
    });

    it.skipIf(!fileExists)("performGeneratedSetUp has method call statements", () => {
      const gen = project.methods.find((m) => m.name === "performGeneratedSetUp");
      if (gen) {
        expect(gen.statements.length).toBeGreaterThan(0);
      }
    });

    it.skipIf(!fileExists)("methods are typed as procedure or function", () => {
      for (const m of project.methods) {
        expect(typeof m.isFunction).toBe("boolean");
        expect(typeof m.returnType).toBe("string");
      }
    });
  });
});
