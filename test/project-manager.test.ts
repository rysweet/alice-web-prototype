import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import JSZip from "jszip";
import {
  ProjectManager,
  type RecentFile,
} from "../src/project-manager";
import type { AliceProjectArchive } from "../src/project-io";
import type { AliceProject } from "../src/a3p-parser";

// Polyfill DOMParser for Node.js (vitest runs in Node)
beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

// ---------------------------------------------------------------------------
// Synthetic .a3p archive builder (reused from project-io tests)
// ---------------------------------------------------------------------------

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
            <property name="fields">
              <collection type="java.util.ArrayList">
                <node key="f2" type="org.lgna.project.ast.UserField" uuid="fff">
                  <property name="name"><value type="java.lang.String">ground</value></property>
                  <property name="valueType">
                    <node key="gt" type="org.lgna.project.ast.JavaType" uuid="ggg">
                      <type name="org.lgna.story.SGround"/>
                    </node>
                  </property>
                  <property name="initializer">
                    <node key="ctor" type="org.lgna.project.ast.InstanceCreation" uuid="hhh">
                      <property name="type">
                        <node key="ct" type="org.lgna.project.ast.JavaType" uuid="iii">
                          <type name="org.lgna.story.SGround"/>
                        </node>
                      </property>
                    </node>
                  </property>
                </node>
              </collection>
            </property>
            <property name="methods"><collection type="java.util.ArrayList"/></property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
</node>`;

async function buildSyntheticZip(projectName = "TestProject"): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("version.txt", "3.6.0.0");
  zip.file("programType.xml", SYNTHETIC_XML);
  zip.file(
    "manifest.json",
    JSON.stringify({
      projectName,
      createdBy: "test",
    }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

// ---------------------------------------------------------------------------
// ProjectManager — create
// ---------------------------------------------------------------------------

describe("ProjectManager — create", () => {
  it("creates a new empty project", () => {
    const pm = new ProjectManager();
    const archive = pm.create();
    expect(archive).not.toBeNull();
    expect(archive.project.projectName).toBe("Untitled");
    expect(archive.project.version).toBe("3.10.0.0");
    expect(archive.project.sceneObjects).toEqual([]);
    expect(archive.project.methods).toEqual([]);
    expect(archive.resources.size).toBe(0);
    expect(archive.manifest).toBeNull();
    expect(archive.thumbnail).toBeNull();
  });

  it("create sets the current project", () => {
    const pm = new ProjectManager();
    pm.create();
    expect(pm.isOpen).toBe(true);
    expect(pm.currentArchive).not.toBeNull();
  });

  it("create marks project as not dirty", () => {
    const pm = new ProjectManager();
    pm.create();
    expect(pm.isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectManager — open
// ---------------------------------------------------------------------------

describe("ProjectManager — open", () => {
  it("opens an .a3p archive from binary data", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("OpenTest");
    await pm.open(data, "test.a3p");
    expect(pm.isOpen).toBe(true);
    expect(pm.currentArchive).not.toBeNull();
    expect(pm.currentArchive!.project.sceneObjects.length).toBeGreaterThan(0);
  });

  it("sets fileName on open", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "myproject.a3p");
    expect(pm.fileName).toBe("myproject.a3p");
  });

  it("open resets dirty flag", async () => {
    const pm = new ProjectManager();
    pm.create();
    pm.markDirty();
    const data = await buildSyntheticZip();
    await pm.open(data, "clean.a3p");
    expect(pm.isDirty).toBe(false);
  });

  it("opening a new project closes the previous one", async () => {
    const pm = new ProjectManager();
    pm.create();
    const data = await buildSyntheticZip();
    await pm.open(data, "second.a3p");
    expect(pm.isOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProjectManager — save
// ---------------------------------------------------------------------------

describe("ProjectManager — save", () => {
  it("save returns Uint8Array of .a3p data", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");
    const saved = await pm.save();
    expect(saved).toBeInstanceOf(Uint8Array);
    expect(saved.length).toBeGreaterThan(0);
  });

  it("saveAs assigns a new file name and updates recent files", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("RenamedProject");
    await pm.open(data, "original.a3p");
    pm.markDirty();

    const saved = await pm.saveAs("renamed.a3p");

    expect(saved).toBeInstanceOf(Uint8Array);
    expect(pm.fileName).toBe("renamed.a3p");
    expect(pm.isDirty).toBe(false);
    expect(pm.recentFiles[0]?.fileName).toBe("renamed.a3p");
  });

  it("saveAs rejects blank file names", async () => {
    const pm = new ProjectManager();
    pm.create();

    await expect(pm.saveAs("   ")).rejects.toThrow("non-empty file name");
  });

  it("save can synthesize a brand-new empty project", async () => {
    const pm = new ProjectManager();
    pm.create();

    const saved = await pm.save();
    const reopened = new ProjectManager();
    await reopened.open(saved, "empty.a3p");

    expect(reopened.currentArchive!.project.projectName).toBe("Untitled");
    expect(reopened.currentArchive!.project.sceneObjects).toEqual([]);
  });

  it("save clears dirty flag", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");
    pm.markDirty();
    expect(pm.isDirty).toBe(true);
    await pm.save();
    expect(pm.isDirty).toBe(false);
  });

  it("save throws if no project is loaded", async () => {
    const pm = new ProjectManager();
    await expect(pm.save()).rejects.toThrow();
  });

  it("round-trips through save/open", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("RoundTrip");
    await pm.open(data, "round.a3p");
    const saved = await pm.save();

    const pm2 = new ProjectManager();
    await pm2.open(saved, "reopened.a3p");
    expect(pm2.currentArchive!.project.sceneObjects.length).toBe(
      pm.currentArchive!.project.sceneObjects.length,
    );
  });

  it("save generates a thumbnail from scene contents when one is missing", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("ThumbnailRoundTrip");
    await pm.open(data, "thumb.a3p");

    pm.currentArchive!.project.sceneObjects.push({
      name: "hero",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.BunnyResource",
      position: { x: 2, y: 0, z: -1 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1.2, height: 2, depth: 1 },
    });
    pm.currentArchive!.thumbnail = null;

    const saved = await pm.save();
    const reopened = new ProjectManager();
    await reopened.open(saved, "thumb-reopened.a3p");

    expect(reopened.currentArchive!.thumbnail).not.toBeNull();
    expect(reopened.currentArchive!.thumbnail![0]).toBe(0x89);
  });
});

// ---------------------------------------------------------------------------
// ProjectManager — close
// ---------------------------------------------------------------------------

describe("ProjectManager — close", () => {
  it("close clears state to null", () => {
    const pm = new ProjectManager();
    pm.create();
    pm.close();
    expect(pm.isOpen).toBe(false);
    expect(pm.currentArchive).toBeNull();
    expect(pm.fileName).toBeNull();
  });

  it("close resets dirty flag", () => {
    const pm = new ProjectManager();
    pm.create();
    pm.markDirty();
    pm.close();
    expect(pm.isDirty).toBe(false);
  });

  it("close is idempotent (no error when nothing is open)", () => {
    const pm = new ProjectManager();
    expect(() => pm.close()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ProjectManager — dirty tracking
// ---------------------------------------------------------------------------

describe("ProjectManager — dirty tracking", () => {
  it("starts not dirty after create", () => {
    const pm = new ProjectManager();
    pm.create();
    expect(pm.isDirty).toBe(false);
  });

  it("markDirty() sets dirty flag", () => {
    const pm = new ProjectManager();
    pm.create();
    pm.markDirty();
    expect(pm.isDirty).toBe(true);
  });

  it("markDirty() throws when no project is open", () => {
    const pm = new ProjectManager();
    expect(() => pm.markDirty()).toThrow();
  });

  it("clearDirty() resets dirty flag", () => {
    const pm = new ProjectManager();
    pm.create();
    pm.markDirty();
    pm.clearDirty();
    expect(pm.isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectManager — recent files
// ---------------------------------------------------------------------------

describe("ProjectManager — recent files", () => {
  it("starts with empty recent files", () => {
    const pm = new ProjectManager();
    expect(pm.recentFiles).toEqual([]);
  });

  it("open adds to recent files", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "first.a3p");
    expect(pm.recentFiles.length).toBe(1);
    expect(pm.recentFiles[0].fileName).toBe("first.a3p");
  });

  it("most recent file is first in the list", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "first.a3p");
    await pm.open(data, "second.a3p");
    expect(pm.recentFiles[0].fileName).toBe("second.a3p");
    expect(pm.recentFiles[1].fileName).toBe("first.a3p");
  });

  it("re-opening same file moves it to front (no duplicates)", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "first.a3p");
    await pm.open(data, "second.a3p");
    await pm.open(data, "first.a3p");
    expect(pm.recentFiles.length).toBe(2);
    expect(pm.recentFiles[0].fileName).toBe("first.a3p");
  });

  it("caps recent files at 10 (LRU eviction)", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    for (let i = 0; i < 15; i++) {
      await pm.open(data, `file-${i}.a3p`);
    }
    expect(pm.recentFiles.length).toBe(10);
    // Oldest files evicted
    expect(pm.recentFiles.map((r) => r.fileName)).not.toContain("file-0.a3p");
    expect(pm.recentFiles.map((r) => r.fileName)).not.toContain("file-4.a3p");
    // Most recent file is first
    expect(pm.recentFiles[0].fileName).toBe("file-14.a3p");
  });

  it("recent files include timestamp and project metadata", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    const before = Date.now();
    await pm.open(data, "test.a3p");
    const after = Date.now();
    const entry = pm.recentFiles[0];
    expect(entry.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry.timestamp).toBeLessThanOrEqual(after);
    expect(entry.projectName).toBe("Program");
    expect(entry.projectVersion).toBe("3.10.0.0");
    expect(entry.resourceCount).toBe(0);
    expect(entry.thumbnailPresent).toBe(false);
    expect(entry.migrated).toBe(true);
  });

  it("clearRecentFiles() empties the list", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");
    pm.clearRecentFiles();
    expect(pm.recentFiles).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ProjectManager — edge cases
// ---------------------------------------------------------------------------

describe("ProjectManager — edge cases", () => {
  it("open with invalid data throws", async () => {
    const pm = new ProjectManager();
    const bad = new Uint8Array([0, 1, 2, 3]);
    await expect(pm.open(bad, "bad.a3p")).rejects.toThrow();
    expect(pm.isOpen).toBe(false);
  });

  it("save after close throws", async () => {
    const pm = new ProjectManager();
    pm.create();
    pm.close();
    await expect(pm.save()).rejects.toThrow();
  });

  it("currentArchive is null before any open/create", () => {
    const pm = new ProjectManager();
    expect(pm.currentArchive).toBeNull();
    expect(pm.isOpen).toBe(false);
    expect(pm.isDirty).toBe(false);
    expect(pm.fileName).toBeNull();
  });
});
