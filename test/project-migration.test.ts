import { describe, expect, it } from "vitest";
import {
  classifyProjectResource,
  detectProjectVersion,
  getCurrentAliceVersion,
  migrateProjectXml,
  synchronizeManifestVersion,
} from "../src/project-migration.js";

const CURRENT_VERSION = getCurrentAliceVersion();

const LEGACY_XML = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" version="3.1.10.0.0">
  <resource type="org.lgna.story.resources.dresser.Dresser"/>
  <resource type="org.lgna.story.resources.biped.Bunny"/>
  <method isVarArgs="false" name="getModelAtMouseLocation"><declaringClass name="org.lgna.story.event.MouseClickEvent"/><parameters/></method>
  <method isVarArgs="true" name="getDistanceTo"><declaringClass name="org.lgna.story.STurnable"/><parameters><type name="org.lgna.story.STurnable"/></parameters></method>
</node>`;

describe("project-migration", () => {
  it("prefers version.txt over manifest and xml metadata", () => {
    const info = detectProjectVersion(
      " 3.6.0.0 ",
      { aliceVersion: "3.7.0.0" },
      '<node version="3.8.0.0"></node>',
    );

    expect(info.originalAliceVersion).toBe("3.6.0.0");
    expect(info.detectedAliceVersion).toBe("3.6.0.0");
    expect(info.manifestVersion).toBe("3.7.0.0");
    expect(info.xmlVersion).toBe("3.8.0.0");
    expect(info.versionSource).toBe("version.txt");
    expect(info.migrated).toBe(false);
  });

  it("falls back to the current reader when no valid Alice version is present", () => {
    const info = detectProjectVersion(
      "not-a-version",
      { version: "still-not-a-version" },
      '<node version="also-not-a-version"></node>',
    );

    expect(info.originalAliceVersion).toBe("not-a-version");
    expect(info.detectedAliceVersion).toBe(CURRENT_VERSION);
    expect(info.versionSource).toBe("default");
    expect(info.migrationSteps).toEqual([]);
  });

  it("applies legacy xml migration rules and aligns the archive version", () => {
    const migration = migrateProjectXml(
      LEGACY_XML,
      detectProjectVersion("3.1.10.0.0", null, LEGACY_XML),
    );

    expect(migration.versionInfo.migrated).toBe(true);
    expect(migration.versionInfo.detectedAliceVersion).toBe(CURRENT_VERSION);
    expect(migration.versionInfo.migrationSteps).toEqual([
      "3.1.20.0.0: move dresser resources into the prop package",
      "3.1.35.0.0: rename legacy resource classes to *Resource forms",
      "3.4.0.0: update mouse click event references",
      "3.9.0.0: widen getDistanceTo parameter type to SThing",
      `${CURRENT_VERSION}: align archive version with current reader`,
    ]);
    expect(migration.xmlText).toContain("org.lgna.story.resources.prop.Dresser");
    expect(migration.xmlText).toContain("org.lgna.story.resources.biped.BunnyResource");
    expect(migration.xmlText).toContain("MouseClickOnObjectEvent");
    expect(migration.xmlText).toContain("org.lgna.story.SThing");
  });

  it("keeps Alice 2 conversion bounded and explicit instead of pretending automatic migration", () => {
    const alice2Xml = `<?xml version="1.0" encoding="UTF-8"?><node version="2.4.3"><element class="edu.cmu.cs.stage3.alice.core.World"/></node>`;
    const versionInfo = detectProjectVersion("2.4.3", null, alice2Xml);
    const migration = migrateProjectXml(alice2Xml, versionInfo);

    expect(versionInfo).toMatchObject({
      originalAliceVersion: "2.4.3",
      detectedAliceVersion: "2.4.3",
      versionSource: "version.txt",
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: expect.stringContaining("automatic Alice 2 conversion is not supported"),
    });
    expect(migration.xmlText).toBe(alice2Xml);
    expect(migration.versionInfo.migrated).toBe(false);
    expect(migration.versionInfo.detectedAliceVersion).toBe("2.4.3");
    expect(migration.versionInfo.migrationSteps).toEqual([
      expect.stringContaining("automatic Alice 2 conversion is not supported"),
    ]);
  });

  it("detects nested Alice 2 manifest metadata as guidance-only", () => {
    const alice2Xml = `<?xml version="1.0" encoding="UTF-8"?><node><element class="edu.cmu.cs.stage3.alice.core.World"/></node>`;
    const versionInfo = detectProjectVersion(null, {
      project: {
        createdWith: {
          version: "2.4.3",
        },
      },
    }, alice2Xml);
    const migration = migrateProjectXml(alice2Xml, versionInfo);

    expect(versionInfo).toMatchObject({
      originalAliceVersion: "2.4.3",
      detectedAliceVersion: "2.4.3",
      versionSource: "manifest",
      migrationSupport: "alice-2-guidance-only",
    });
    expect(migration.xmlText).toBe(alice2Xml);
    expect(migration.versionInfo).toMatchObject({
      detectedAliceVersion: "2.4.3",
      migrated: false,
      migrationSupport: "alice-2-guidance-only",
      unsupportedReason: expect.stringContaining("automatic Alice 2 conversion is not supported"),
    });
  });

  it("prefers explicit Alice 3 XML over unrelated nested Alice 2 manifest strings", () => {
    const alice3Xml = `<?xml version="1.0" encoding="UTF-8"?><node version="3.4.0.0"><element class="org.lgna.story.SScene"/></node>`;
    const versionInfo = detectProjectVersion(null, {
      dependencies: [
        {
          name: "Unrelated tool",
          version: "2.4.3",
        },
      ],
    }, alice3Xml);
    const migration = migrateProjectXml(alice3Xml, versionInfo);

    expect(versionInfo).toMatchObject({
      originalAliceVersion: "3.4.0.0",
      detectedAliceVersion: "3.4.0.0",
      versionSource: "xml",
      migrationSupport: "alice-3-reader-migration",
    });
    expect(migration.versionInfo.migrationSupport).toBe("alice-3-reader-migration");
    expect(migration.versionInfo.detectedAliceVersion).toBe(CURRENT_VERSION);
  });

  it("falls through invalid direct manifest metadata to nested Alice 2 guidance", () => {
    const alice2Xml = `<?xml version="1.0" encoding="UTF-8"?><node></node>`;
    const versionInfo = detectProjectVersion(null, {
      aliceVersion: "unknown",
      project: {
        createdWith: {
          version: "2.4.3",
        },
      },
    }, alice2Xml);

    expect(versionInfo).toMatchObject({
      originalAliceVersion: "2.4.3",
      detectedAliceVersion: "2.4.3",
      versionSource: "manifest",
      migrationSupport: "alice-2-guidance-only",
    });
  });

  it("treats caller-supplied Alice 2 version info as guidance-only even without support metadata", () => {
    const alice2Xml = `<?xml version="1.0" encoding="UTF-8"?><node version="2.4.3"></node>`;
    const migration = migrateProjectXml(alice2Xml, {
      originalAliceVersion: "2.4.3",
      detectedAliceVersion: "2.4.3",
      manifestVersion: null,
      xmlVersion: "2.4.3",
      versionSource: "xml",
      migrated: false,
      migrationSteps: [],
    });

    expect(migration.xmlText).toBe(alice2Xml);
    expect(migration.versionInfo.detectedAliceVersion).toBe("2.4.3");
    expect(migration.versionInfo.migrationSupport).toBe("alice-2-guidance-only");
    expect(migration.versionInfo.migrationSteps).toEqual([
      expect.stringContaining("automatic Alice 2 conversion is not supported"),
    ]);
  });

  it("updates nested manifest version metadata when direct version fields are absent", () => {
    const manifest = synchronizeManifestVersion(
      {
        projectName: "Legacy Project",
        createdWith: { version: "3.2.0.0", product: "Alice" },
      },
      {
        originalAliceVersion: "3.2.0.0",
        detectedAliceVersion: CURRENT_VERSION,
        manifestVersion: "3.2.0.0",
        xmlVersion: "3.2.0.0",
        versionSource: "manifest",
        migrated: true,
        migrationSteps: [],
      },
    );

    expect(manifest).toEqual({
      projectName: "Legacy Project",
      createdWith: { version: CURRENT_VERSION, product: "Alice" },
    });
  });

  it("synchronizes the first known direct manifest version field without mutating input", () => {
    const manifest = {
      aliceVersion: "3.1.10.0.0",
      projectVersion: "3.2.0.0",
      createdWith: { version: "3.3.0.0" },
    };

    const nextManifest = synchronizeManifestVersion(manifest, {
      originalAliceVersion: "3.1.10.0.0",
      detectedAliceVersion: CURRENT_VERSION,
      manifestVersion: "3.1.10.0.0",
      xmlVersion: "3.1.10.0.0",
      versionSource: "manifest",
      migrated: true,
      migrationSteps: [],
    });

    expect(nextManifest).toEqual({
      aliceVersion: CURRENT_VERSION,
      projectVersion: "3.2.0.0",
      createdWith: { version: "3.3.0.0" },
    });
    expect(manifest.aliceVersion).toBe("3.1.10.0.0");
  });

  it("does not invent manifest version fields when none are present", () => {
    expect(synchronizeManifestVersion(
      { projectName: "No Version" },
      {
        originalAliceVersion: "3.1.10.0.0",
        detectedAliceVersion: CURRENT_VERSION,
        manifestVersion: null,
        xmlVersion: null,
        versionSource: "default",
        migrated: true,
        migrationSteps: [],
      },
    )).toEqual({ projectName: "No Version" });
  });

  it("classifies project resources by extension", () => {
    expect(classifyProjectResource("gallery/scene.PNG")).toBe("image");
    expect(classifyProjectResource("audio/theme.MP3")).toBe("audio");
    expect(classifyProjectResource("models/horse.a3r")).toBe("model");
    expect(classifyProjectResource("notes/readme.txt")).toBe("other");
  });
});
