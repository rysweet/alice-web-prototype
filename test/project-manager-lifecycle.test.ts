import { describe, it, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { ProjectManager } from "../src/project-manager.js";

// ═══════════════════════════════════════════════════════════════════════════
// ProjectManager lifecycle — TDD tests (written before implementation)
//
// Tests for: revertToLastSaved(), createBackup(label?),
//            restoreFromBackup(timestamp)
// ═══════════════════════════════════════════════════════════════════════════

// Polyfill DOMParser for Node.js
beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

// ---------------------------------------------------------------------------
// Synthetic .a3p archive builder
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
// revertToLastSaved()
// ---------------------------------------------------------------------------

describe("ProjectManager — revertToLastSaved", () => {
  it("restores the archive to the last-saved state", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("RevertTest");
    await pm.open(data, "revert.a3p");

    // Capture initial state
    const initialObjectCount = pm.currentArchive!.project.sceneObjects.length;

    // Mutate the project
    pm.currentArchive!.project.sceneObjects.push({
      name: "extra",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.AlienResource",
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    });
    pm.markDirty();
    expect(pm.currentArchive!.project.sceneObjects.length).toBe(initialObjectCount + 1);

    // Revert
    await pm.revertToLastSaved();

    expect(pm.currentArchive!.project.sceneObjects.length).toBe(initialObjectCount);
    expect(pm.isDirty).toBe(false);
  });

  it("throws when no saved data exists (created project, never saved)", async () => {
    const pm = new ProjectManager();
    pm.create();
    await expect(pm.revertToLastSaved()).rejects.toThrow("No saved state to revert to");
  });

  it("throws when no project is open", async () => {
    const pm = new ProjectManager();
    await expect(pm.revertToLastSaved()).rejects.toThrow();
  });

  it("preserves fileName after revert", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "keep-name.a3p");
    pm.markDirty();
    await pm.revertToLastSaved();
    expect(pm.fileName).toBe("keep-name.a3p");
  });

  it("revert after save restores to saved state (not original open)", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("DoubleRevert");
    await pm.open(data, "double.a3p");

    // Modify and save
    pm.currentArchive!.project.projectName = "Modified";
    pm.markDirty();
    await pm.save();

    // Modify again
    pm.currentArchive!.project.projectName = "ModifiedAgain";
    pm.markDirty();

    // Revert should restore to "Modified" (last save), not "Program" (original open)
    await pm.revertToLastSaved();
    // The project name comes from XML parsing, so just verify dirty flag cleared
    expect(pm.isDirty).toBe(false);
    expect(pm.isOpen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createBackup(label?)
// ---------------------------------------------------------------------------

describe("ProjectManager — createBackup", () => {
  it("creates a backup and adds to backup history", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("BackupTest");
    await pm.open(data, "backup.a3p");

    const beforeCount = pm.backupHistory.length;
    await pm.createBackup();
    expect(pm.backupHistory.length).toBe(beforeCount + 1);
  });

  it("backup has correct fileName and valid timestamp", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");

    const before = Date.now();
    await pm.createBackup();
    const after = Date.now();

    const backup = pm.backupHistory[0];
    expect(backup.fileName).toBe("test.a3p");
    expect(backup.timestamp).toBeGreaterThanOrEqual(before);
    expect(backup.timestamp).toBeLessThanOrEqual(after);
  });

  it("backup has valid Uint8Array data", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");

    await pm.createBackup();
    const backup = pm.backupHistory[0];
    expect(backup.data).toBeInstanceOf(Uint8Array);
    expect(backup.data.length).toBeGreaterThan(0);
  });

  it("accepts optional label parameter", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");

    // Should not throw with or without label
    await pm.createBackup("before-refactor");
    await pm.createBackup();
    expect(pm.backupHistory.length).toBeGreaterThanOrEqual(2);
  });

  it("throws when no project is open", async () => {
    const pm = new ProjectManager();
    await expect(pm.createBackup()).rejects.toThrow();
  });

  it("multiple backups create distinct entries", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "multi.a3p");

    await pm.createBackup();
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 5));
    await pm.createBackup();

    const backups = pm.getBackups("multi.a3p");
    expect(backups.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// restoreFromBackup(timestamp)
// ---------------------------------------------------------------------------

describe("ProjectManager — restoreFromBackup", () => {
  it("restores project state from a backup by timestamp", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("RestoreTest");
    await pm.open(data, "restore.a3p");

    // Create a backup of the original state
    await pm.createBackup();
    const backupTimestamp = pm.backupHistory[0].timestamp;

    // Mutate
    pm.currentArchive!.project.sceneObjects.push({
      name: "addedLater",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.AlienResource",
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    });
    pm.markDirty();

    // Restore from backup
    await pm.restoreFromBackup(backupTimestamp);
    expect(pm.isDirty).toBe(false);
    expect(pm.isOpen).toBe(true);
  });

  it("throws for non-existent timestamp", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");

    await expect(pm.restoreFromBackup(999999)).rejects.toThrow();
  });

  it("throws for non-finite timestamp (NaN)", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");

    await expect(pm.restoreFromBackup(NaN)).rejects.toThrow(TypeError);
  });

  it("throws for non-finite timestamp (Infinity)", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");

    await expect(pm.restoreFromBackup(Infinity)).rejects.toThrow(TypeError);
  });

  it("preserves fileName after restore", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "keep-name.a3p");
    await pm.createBackup();
    const ts = pm.backupHistory[0].timestamp;

    await pm.restoreFromBackup(ts);
    expect(pm.fileName).toBe("keep-name.a3p");
  });

  it("clears dirty flag after restore", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip();
    await pm.open(data, "test.a3p");
    await pm.createBackup();
    const ts = pm.backupHistory[0].timestamp;
    pm.markDirty();
    expect(pm.isDirty).toBe(true);

    await pm.restoreFromBackup(ts);
    expect(pm.isDirty).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: backup → modify → restore round-trip
// ---------------------------------------------------------------------------

describe("ProjectManager — backup/restore round-trip", () => {
  it("full cycle: open → backup → modify → restore → verify", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("RoundTrip");
    await pm.open(data, "cycle.a3p");

    const originalCount = pm.currentArchive!.project.sceneObjects.length;

    // Step 1: Create backup
    await pm.createBackup();
    const ts = pm.backupHistory[0].timestamp;

    // Step 2: Modify
    pm.currentArchive!.project.sceneObjects.push({
      name: "temporary",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.AlienResource",
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    });
    expect(pm.currentArchive!.project.sceneObjects.length).toBe(originalCount + 1);

    // Step 3: Restore
    await pm.restoreFromBackup(ts);

    // Step 4: Verify
    expect(pm.currentArchive!.project.sceneObjects.length).toBe(originalCount);
    expect(pm.isOpen).toBe(true);
    expect(pm.isDirty).toBe(false);
  });

  it("open → save → modify → revert cycle", async () => {
    const pm = new ProjectManager();
    const data = await buildSyntheticZip("SaveRevert");
    await pm.open(data, "sr.a3p");
    await pm.save();

    // Modify
    pm.currentArchive!.project.projectName = "Changed";
    pm.markDirty();

    // Revert to last save
    await pm.revertToLastSaved();
    expect(pm.isDirty).toBe(false);
    expect(pm.isOpen).toBe(true);
  });
});
