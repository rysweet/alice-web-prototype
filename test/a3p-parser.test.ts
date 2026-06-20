import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { parseA3P, type AliceProject, type AliceObject } from "../src/a3p-parser";
import type { JointNode, BoundingBox, Vec3 } from "../src/story-api";
import {
  REPOSITORY_A3P_FIXTURE,
  optionalExternalA3PFixtureExists,
  readRequiredA3PFixture,
} from "./fixtures/a3p-fixtures";

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

  describe("repository .a3p fixture", () => {
    let project: AliceProject;

    beforeAll(async () => {
      project = await parseA3P(readRequiredA3PFixture());
    });

    it("requires the sanitized repository fixture", () => {
      expect(fs.existsSync(REPOSITORY_A3P_FIXTURE)).toBe(true);
    });

    it("parses version and project identity", () => {
      expect(project.version).toBe("3.10.0.0");
      expect(project.projectName).toBe("Program");
    });

    it("finds the scene objects and sanitized resource type", () => {
      expect(project.sceneObjects.map((o) => o.name)).toEqual(["ground", "camera", "bunny"]);
      const bunny = project.sceneObjects.find((o) => o.name === "bunny");
      expect(bunny?.typeName).toBe("org.lgna.story.SBiped");
      expect(bunny?.resourceType).toBe("org.lgna.story.resources.biped.BunnyResource");
    });

    it("extracts scene methods with executable statements", () => {
      expect(project.methods.map((method) => method.name)).toEqual(
        expect.arrayContaining(["performCustomSetup", "performGeneratedSetUp"]),
      );
      const statements = project.methods.flatMap((method) => method.statements);
      expect(statements.map((statement) => statement.kind)).toEqual(
        expect.arrayContaining(["Comment", "MethodCall", "CountLoop"]),
      );
    });

    it("keeps custom types in the repository fixture", () => {
      const sanitizedBunny = project.types?.find((type) => type.name === "SanitizedBunny");
      expect(sanitizedBunny?.superTypeName).toBe("org.lgna.story.SBiped");
      expect((sanitizedBunny?.fields ?? []).map((field) => field.name)).toContain("nickname");
      expect((sanitizedBunny?.methods ?? []).map((method) => method.name)).toContain("hop");
    });
  });

  // Optional external file tests – skipped unless explicitly enabled and files exist.
  describe("optional external amazonFull.a3p", () => {
    let project: AliceProject;
    const fileExists = optionalExternalA3PFixtureExists(AMAZON_A3P);

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

  describe("optional external smoke .a3p (UTF-16BE)", () => {
    let project: AliceProject;
    const fileExists = optionalExternalA3PFixtureExists(SMOKE_A3P);

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
    const fileExists = optionalExternalA3PFixtureExists(BUILT_A3P);

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

  // ─── Sprint 2: Joint Hierarchy ────────────────────────────────────

  describe("joint hierarchy extraction", () => {
    async function createA3PWithJoints(): Promise<Uint8Array> {
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
            <property name="fields"><collection type="java.util.ArrayList"/></property>
            <property name="methods"><collection type="java.util.ArrayList"/></property>
            <property name="constructors"><collection type="java.util.ArrayList"/></property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
  <node key="j1" type="org.lgna.story.resourceutilities.JointImplementation" uuid="j1u">
    <property name="jointName"><value type="java.lang.String">ROOT</value></property>
    <property name="positionX"><value type="java.lang.Double">0.0</value></property>
    <property name="positionY"><value type="java.lang.Double">1.0</value></property>
    <property name="positionZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationX"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationY"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationW"><value type="java.lang.Double">1.0</value></property>
  </node>
  <node key="j2" type="org.lgna.story.resourceutilities.JointImplementation" uuid="j2u">
    <property name="jointName"><value type="java.lang.String">SPINE_BASE</value></property>
    <property name="parent"><value type="java.lang.String">ROOT</value></property>
    <property name="positionX"><value type="java.lang.Double">0.0</value></property>
    <property name="positionY"><value type="java.lang.Double">0.5</value></property>
    <property name="positionZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationX"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationY"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationW"><value type="java.lang.Double">1.0</value></property>
  </node>
  <node key="j3" type="org.lgna.story.resourceutilities.JointImplementation" uuid="j3u">
    <property name="jointName"><value type="java.lang.String">LEFT_SHOULDER</value></property>
    <property name="parent"><value type="java.lang.String">SPINE_BASE</value></property>
    <property name="positionX"><value type="java.lang.Double">-0.5</value></property>
    <property name="positionY"><value type="java.lang.Double">0.0</value></property>
    <property name="positionZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationX"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationY"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationW"><value type="java.lang.Double">1.0</value></property>
  </node>
  <node key="j4" type="org.lgna.story.resourceutilities.JointImplementation" uuid="j4u">
    <property name="jointName"><value type="java.lang.String">RIGHT_SHOULDER</value></property>
    <property name="parent"><value type="java.lang.String">SPINE_BASE</value></property>
    <property name="positionX"><value type="java.lang.Double">0.5</value></property>
    <property name="positionY"><value type="java.lang.Double">0.0</value></property>
    <property name="positionZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationX"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationY"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationW"><value type="java.lang.Double">1.0</value></property>
  </node>
</node>`;

      const zip = new JSZip();
      zip.file("version.txt", "3.10.0.0");
      zip.file("programType.xml", xml);
      return zip.generateAsync({ type: "uint8array" });
    }

    let project: AliceProject;

    beforeAll(async () => {
      const data = await createA3PWithJoints();
      project = await parseA3P(data);
    });

    it("returns jointHierarchy array", () => {
      expect(project.jointHierarchy).toBeDefined();
      expect(Array.isArray(project.jointHierarchy)).toBe(true);
    });

    it("has a root joint with no parent", () => {
      const roots = project.jointHierarchy!;
      expect(roots.length).toBeGreaterThan(0);
      const root = roots.find((j) => j.name === "ROOT");
      expect(root).toBeDefined();
      expect(root!.parentName).toBeNull();
    });

    it("builds correct parent-child relationships", () => {
      const root = project.jointHierarchy!.find((j) => j.name === "ROOT")!;
      expect(root.children.length).toBeGreaterThan(0);

      const spine = root.children.find((c) => c.name === "SPINE_BASE");
      expect(spine).toBeDefined();
      expect(spine!.parentName).toBe("ROOT");
    });

    it("nests grandchildren correctly", () => {
      const root = project.jointHierarchy!.find((j) => j.name === "ROOT")!;
      const spine = root.children.find((c) => c.name === "SPINE_BASE")!;
      expect(spine.children.length).toBe(2);

      const leftShoulder = spine.children.find((c) => c.name === "LEFT_SHOULDER");
      const rightShoulder = spine.children.find((c) => c.name === "RIGHT_SHOULDER");
      expect(leftShoulder).toBeDefined();
      expect(rightShoulder).toBeDefined();
      expect(leftShoulder!.parentName).toBe("SPINE_BASE");
      expect(rightShoulder!.parentName).toBe("SPINE_BASE");
    });

    it("extracts local transform position", () => {
      const root = project.jointHierarchy!.find((j) => j.name === "ROOT")!;
      expect(root.localTransform.position).toEqual({ x: 0, y: 1, z: 0 });

      const spine = root.children.find((c) => c.name === "SPINE_BASE")!;
      expect(spine.localTransform.position).toEqual({ x: 0, y: 0.5, z: 0 });

      const leftShoulder = spine.children.find((c) => c.name === "LEFT_SHOULDER")!;
      expect(leftShoulder.localTransform.position).toEqual({ x: -0.5, y: 0, z: 0 });
    });

    it("extracts local transform orientation as quaternion", () => {
      const root = project.jointHierarchy!.find((j) => j.name === "ROOT")!;
      expect(root.localTransform.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    });
  });

  describe("joint hierarchy edge cases", () => {
    it("returns empty array when no JointImplementation nodes exist", async () => {
      const data = await createSyntheticA3P();
      const project = await parseA3P(data);

      expect(project.jointHierarchy).toBeDefined();
      expect(project.jointHierarchy!.length).toBe(0);
    });

    it("caps recursion depth at 64 levels", async () => {
      // Create a deeply nested chain of joints
      let jointsXml = "";
      for (let i = 0; i < 70; i++) {
        const name = `JOINT_${i}`;
        const parent = i === 0 ? "" : `<property name="parent"><value type="java.lang.String">JOINT_${i - 1}</value></property>`;
        jointsXml += `
  <node key="dj${i}" type="org.lgna.story.resourceutilities.JointImplementation" uuid="dj${i}u">
    <property name="jointName"><value type="java.lang.String">${name}</value></property>
    ${parent}
    <property name="positionX"><value type="java.lang.Double">0.0</value></property>
    <property name="positionY"><value type="java.lang.Double">0.0</value></property>
    <property name="positionZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationX"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationY"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationZ"><value type="java.lang.Double">0.0</value></property>
    <property name="orientationW"><value type="java.lang.Double">1.0</value></property>
  </node>`;
      }

      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="aaa" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="bbb">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields"><collection type="java.util.ArrayList"/></property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
  ${jointsXml}
</node>`;

      const zip = new JSZip();
      zip.file("version.txt", "3.10.0.0");
      zip.file("programType.xml", xml);
      const data = await zip.generateAsync({ type: "uint8array" });

      const project = await parseA3P(data);
      expect(project.jointHierarchy).toBeDefined();

      // Walk depth and verify it doesn't exceed 64
      function maxDepth(nodes: JointNode[], depth: number): number {
        if (nodes.length === 0) return depth;
        return Math.max(...nodes.map((n) => maxDepth(n.children, depth + 1)));
      }
      const depth = maxDepth(project.jointHierarchy!, 0);
      expect(depth).toBeLessThanOrEqual(64);
    });
  });

  // ─── Sprint 2: Bounding Boxes ────────────────────────────────────

  describe("bounding box extraction", () => {
    async function createA3PWithBounds(): Promise<Uint8Array> {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="aaa" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="bbb">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields"><collection type="java.util.ArrayList"/></property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
  <node key="bb1" type="org.lgna.story.resourceutilities.ModelResourceInfo" uuid="bb1u">
    <property name="resourceName"><value type="java.lang.String">BunnyResource</value></property>
    <property name="boundingBoxMinX"><value type="java.lang.Double">-0.3</value></property>
    <property name="boundingBoxMinY"><value type="java.lang.Double">0.0</value></property>
    <property name="boundingBoxMinZ"><value type="java.lang.Double">-0.2</value></property>
    <property name="boundingBoxMaxX"><value type="java.lang.Double">0.3</value></property>
    <property name="boundingBoxMaxY"><value type="java.lang.Double">1.5</value></property>
    <property name="boundingBoxMaxZ"><value type="java.lang.Double">0.2</value></property>
  </node>
  <node key="bb2" type="org.lgna.story.resourceutilities.ModelResourceInfo" uuid="bb2u">
    <property name="resourceName"><value type="java.lang.String">TreeResource</value></property>
    <property name="boundingBoxMinX"><value type="java.lang.Double">-1.0</value></property>
    <property name="boundingBoxMinY"><value type="java.lang.Double">0.0</value></property>
    <property name="boundingBoxMinZ"><value type="java.lang.Double">-1.0</value></property>
    <property name="boundingBoxMaxX"><value type="java.lang.Double">1.0</value></property>
    <property name="boundingBoxMaxY"><value type="java.lang.Double">5.0</value></property>
    <property name="boundingBoxMaxZ"><value type="java.lang.Double">1.0</value></property>
  </node>
</node>`;

      const zip = new JSZip();
      zip.file("version.txt", "3.10.0.0");
      zip.file("programType.xml", xml);
      return zip.generateAsync({ type: "uint8array" });
    }

    let project: AliceProject;

    beforeAll(async () => {
      const data = await createA3PWithBounds();
      project = await parseA3P(data);
    });

    it("returns boundingBoxes record", () => {
      expect(project.boundingBoxes).toBeDefined();
      expect(typeof project.boundingBoxes).toBe("object");
    });

    it("extracts bounding box keyed by resource name", () => {
      const bb = project.boundingBoxes!;
      expect(bb["BunnyResource"]).toBeDefined();
      expect(bb["TreeResource"]).toBeDefined();
    });

    it("extracts correct min coordinates", () => {
      const bunny = project.boundingBoxes!["BunnyResource"];
      expect(bunny.min).toEqual({ x: -0.3, y: 0, z: -0.2 });
    });

    it("extracts correct max coordinates", () => {
      const bunny = project.boundingBoxes!["BunnyResource"];
      expect(bunny.max).toEqual({ x: 0.3, y: 1.5, z: 0.2 });
    });

    it("extracts multiple bounding boxes", () => {
      const tree = project.boundingBoxes!["TreeResource"];
      expect(tree.min).toEqual({ x: -1, y: 0, z: -1 });
      expect(tree.max).toEqual({ x: 1, y: 5, z: 1 });
    });

    it("returns empty record when no bounding data exists", async () => {
      const data = await createSyntheticA3P();
      const p = await parseA3P(data);
      expect(p.boundingBoxes).toBeDefined();
      expect(Object.keys(p.boundingBoxes!).length).toBe(0);
    });
  });

  // ─── Sprint 2: Texture References ────────────────────────────────

  describe("texture reference extraction", () => {
    async function createA3PWithTextures(): Promise<Uint8Array> {
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="aaa" version="3.10062">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="superType">
    <node key="2" type="org.lgna.project.ast.JavaType" uuid="bbb">
      <type name="org.lgna.story.SProgram"/>
    </node>
  </property>
  <property name="fields"><collection type="java.util.ArrayList"/></property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"/></property>
  <node key="tr1" type="org.lgna.story.resourceutilities.TextureReference" uuid="tr1u">
    <property name="texturePath"><value type="java.lang.String">resources/textures/skin.png</value></property>
  </node>
  <node key="tr2" type="org.lgna.story.resourceutilities.TextureReference" uuid="tr2u">
    <property name="texturePath"><value type="java.lang.String">resources/textures/eye.png</value></property>
  </node>
</node>`;

      const zip = new JSZip();
      zip.file("version.txt", "3.10.0.0");
      zip.file("programType.xml", xml);
      // Also add image files in the ZIP (second source of texture refs)
      zip.file("resources/textures/skin.png", new Uint8Array([0x89, 0x50]));
      zip.file("resources/textures/eye.png", new Uint8Array([0x89, 0x50]));
      zip.file("resources/textures/extra.jpg", new Uint8Array([0xff, 0xd8]));
      return zip.generateAsync({ type: "uint8array" });
    }

    let project: AliceProject;

    beforeAll(async () => {
      const data = await createA3PWithTextures();
      project = await parseA3P(data);
    });

    it("returns textureRefs array", () => {
      expect(project.textureRefs).toBeDefined();
      expect(Array.isArray(project.textureRefs)).toBe(true);
    });

    it("includes texture paths from XML references", () => {
      expect(project.textureRefs).toContain("resources/textures/skin.png");
      expect(project.textureRefs).toContain("resources/textures/eye.png");
    });

    it("includes texture paths from ZIP image entries", () => {
      expect(project.textureRefs).toContain("resources/textures/extra.jpg");
    });

    it("deduplicates texture references", () => {
      // skin.png appears in both XML and ZIP — should only appear once
      const skinCount = project.textureRefs!.filter((r) => r === "resources/textures/skin.png").length;
      expect(skinCount).toBe(1);
    });

    it("sorts texture references alphabetically", () => {
      const refs = project.textureRefs!;
      const sorted = [...refs].sort();
      expect(refs).toEqual(sorted);
    });

    it("returns empty array when no textures exist", async () => {
      const data = await createSyntheticA3P();
      const p = await parseA3P(data);
      expect(p.textureRefs).toBeDefined();
      expect(p.textureRefs!.length).toBe(0);
    });
  });

  // ─── Sprint 2: Backward Compatibility ──────────────────────────

  describe("backward compatibility", () => {
    it("existing synthetic test still works with new optional fields", async () => {
      const data = await createSyntheticA3P();
      const project = await parseA3P(data);

      // Original assertions still hold
      expect(project.version).toBe("3.10.0.0");
      expect(project.projectName).toBe("Program");
      expect(project.sceneObjects.length).toBe(3);

      // New fields are present but harmlessly empty
      expect(project.jointHierarchy).toBeDefined();
      expect(project.boundingBoxes).toBeDefined();
      expect(project.textureRefs).toBeDefined();
    });

    it("destructuring only original fields still works", async () => {
      const data = await createSyntheticA3P();
      const { version, projectName, sceneObjects, methods } = await parseA3P(data);

      expect(version).toBe("3.10.0.0");
      expect(projectName).toBe("Program");
      expect(sceneObjects.length).toBe(3);
      expect(Array.isArray(methods)).toBe(true);
    });
  });
});
