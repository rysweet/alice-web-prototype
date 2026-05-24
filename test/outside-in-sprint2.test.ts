import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { readProject, writeProject } from "../src/project-io";
import { parseA3P } from "../src/a3p-parser";
import { linear, easeIn, easeOut, easeInOut, lerpVec3, nlerp, lerpScalar, Tween } from "../src/animation";

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

const XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
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

async function makeSyntheticA3P(opts?: { noXml?: boolean; pathTraversal?: boolean; manifest?: object; thumbnail?: Uint8Array; extraResources?: Record<string, Uint8Array> }) {
  const zip = new JSZip();
  zip.file("version.txt", "3.10062");
  if (!opts?.noXml) zip.file("programType.xml", XML);
  if (opts?.manifest) zip.file("manifest.json", JSON.stringify(opts.manifest));
  if (opts?.thumbnail) zip.file("thumbnail.png", opts.thumbnail);
  if (opts?.pathTraversal) zip.file("../evil.txt", "pwned");
  if (opts?.extraResources) {
    for (const [k, v] of Object.entries(opts.extraResources)) {
      zip.file(k, v);
    }
  }
  return zip.generateAsync({ type: "uint8array" });
}

describe("Outside-in: Full integration - animation + project-io + a3p-parser", () => {
  // === SCENARIO 1: Happy path round-trip ===
  describe("Scenario 1: Full .a3p round-trip", () => {
    it("reads a synthetic .a3p, round-trips through write→read", async () => {
      const buf = await makeSyntheticA3P({
        manifest: { format: "a3p", version: "3.10062" },
        thumbnail: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
        extraResources: { "resources/texture.png": new Uint8Array([1, 2, 3]) },
      });
      
      // Read
      const archive = await readProject(buf);
      expect(archive.project.version).toBe("3.10062");
      expect(archive.project.projectName).toBe("Program");
      expect(archive.project.sceneObjects.some(o => o.name === "ground")).toBe(true);
      expect(archive.manifest).not.toBeNull();
      expect(archive.manifest!.format).toBe("a3p");
      expect(archive.thumbnail).not.toBeNull();
      expect(archive.resources.has("__original_xml__")).toBe(true);
      expect(archive.resources.has("resources/texture.png")).toBe(true);
      
      // Write
      const written = await writeProject(archive);
      expect(written).toBeInstanceOf(Uint8Array);
      
      // Re-read
      const archive2 = await readProject(written);
      expect(archive2.project.version).toBe("3.10062");
      expect(archive2.project.sceneObjects.length).toBe(archive.project.sceneObjects.length);
      expect(archive2.manifest!.format).toBe("a3p");
      expect(archive2.thumbnail).not.toBeNull();
    });
  });

  // === SCENARIO 2: Edge cases ===
  describe("Scenario 2: Security and error edge cases", () => {
    it("rejects path traversal in archive", async () => {
      const buf = await makeSyntheticA3P({ pathTraversal: true });
      await expect(readProject(buf)).rejects.toThrow(/Unsafe archive path/);
    });

    it("rejects archive with no programType.xml", async () => {
      const buf = await makeSyntheticA3P({ noXml: true });
      await expect(readProject(buf)).rejects.toThrow(/programType.xml/);
    });

    it("writeProject synthesizes XML for a brand-new empty project", async () => {
      const bytes = await writeProject({
        project: { version: "1.0", projectName: "X", sceneObjects: [], methods: [] },
        manifest: null,
        resources: new Map(),
        thumbnail: null,
      });
      const archive = await readProject(bytes);
      expect(archive.project.projectName).toBe("X");
      expect(archive.project.sceneObjects).toEqual([]);
    });
  });

  // === SCENARIO 3: Animation tween chained with project data ===
  describe("Scenario 3: Animation system integration", () => {
    it("tweens a scene object position from parsed project", async () => {
      const buf = await makeSyntheticA3P();
      const proj = await parseA3P(buf);
      
      const groundObj = proj.sceneObjects.find(o => o.name === "ground");
      expect(groundObj).toBeDefined();
      
      // Create animation for the ground object
      const startPos = groundObj!.position ?? { x: 0, y: 0, z: 0 };
      const endPos = { x: 10, y: 5, z: -3 };
      
      const tween = new Tween({
        from: startPos,
        to: endPos,
        durationMs: 2000,
        easing: easeInOut,
        interpolate: lerpVec3,
      });
      
      // Simulate 60fps for 2 seconds
      let state;
      for (let i = 0; i < 120; i++) {
        state = tween.update(2000 / 120);
      }
      expect(state!.complete).toBe(true);
      expect(state!.value.x).toBeCloseTo(10, 5);
      expect(state!.value.y).toBeCloseTo(5, 5);
      expect(state!.value.z).toBeCloseTo(-3, 5);
    });

    it("handles opacity animation with easeIn", () => {
      const tw = new Tween({
        from: 1.0,
        to: 0.0,
        durationMs: 500,
        easing: easeIn,
        interpolate: lerpScalar,
      });
      
      const mid = tw.update(250);
      expect(mid.value).toBeGreaterThan(0);
      expect(mid.value).toBeLessThan(1);
      // easeIn at t=0.5 → 0.25, so value = 1 + (0-1)*0.25 = 0.75
      expect(mid.value).toBeCloseTo(0.75, 5);
      
      const end = tw.update(250);
      expect(end.complete).toBe(true);
      expect(end.value).toBeCloseTo(0, 5);
    });

    it("quaternion nlerp for orientation animation", () => {
      const from = { x: 0, y: 0, z: 0, w: 1 };
      const to = { x: 0.707, y: 0, z: 0, w: 0.707 }; // ~90° around X
      
      const tw = new Tween({
        from, to,
        durationMs: 1000,
        easing: linear,
        interpolate: nlerp,
      });
      
      const mid = tw.update(500);
      // Should be normalized
      const len = Math.sqrt(mid.value.x**2 + mid.value.y**2 + mid.value.z**2 + mid.value.w**2);
      expect(len).toBeCloseTo(1, 5);
    });
  });

  // === SCENARIO 4: a3p-parser joint/bbox/texture extraction ===
  describe("Scenario 4: Model resource extraction", () => {
    it("parseA3P returns joint hierarchy array", async () => {
      const buf = await makeSyntheticA3P();
      const proj = await parseA3P(buf);
      expect(proj.jointHierarchy).toBeDefined();
      expect(Array.isArray(proj.jointHierarchy)).toBe(true);
    });

    it("parseA3P returns bounding boxes record", async () => {
      const buf = await makeSyntheticA3P();
      const proj = await parseA3P(buf);
      expect(proj.boundingBoxes).toBeDefined();
      expect(typeof proj.boundingBoxes).toBe("object");
    });

    it("parseA3P returns texture refs array", async () => {
      const buf = await makeSyntheticA3P();
      const proj = await parseA3P(buf);
      expect(proj.textureRefs).toBeDefined();
      expect(Array.isArray(proj.textureRefs)).toBe(true);
    });
  });
});
