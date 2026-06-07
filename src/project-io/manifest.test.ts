import { describe, expect, it } from "vitest";
import { ProjectIoError } from "../project-io.js";
import {
  parseManifestText,
  serializeManifest,
  syncManifestVersion,
} from "./manifest.js";

const versionInfo = {
  originalAliceVersion: "3.1.10.0.0",
  detectedAliceVersion: "3.10.0.0",
  manifestVersion: "3.1.10.0.0",
  xmlVersion: "3.1.10.0.0",
  versionSource: "manifest" as const,
  migrated: true,
  migrationSteps: ["3.10.0.0: align archive version with current reader"],
};

describe("project-io/manifest", () => {
  it("parses manifest JSON and returns null for missing manifests", () => {
    expect(parseManifestText(null)).toBeNull();
    expect(parseManifestText('{"aliceVersion":"3.1.10.0.0","name":"Demo"}')).toEqual({
      aliceVersion: "3.1.10.0.0",
      name: "Demo",
    });
  });

  it("wraps invalid manifest JSON in a ProjectIoError", () => {
    try {
      parseManifestText("{not json}");
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectIoError);
      expect((error as ProjectIoError).code).toBe("invalid-manifest");
      return;
    }
    throw new Error("Expected invalid manifest rejection");
  });

  it("serializes manifests with stable pretty JSON", () => {
    expect(serializeManifest({ aliceVersion: "3.10.0.0", name: "Demo" })).toBe(
      '{\n  "aliceVersion": "3.10.0.0",\n  "name": "Demo"\n}',
    );
  });

  it("synchronizes the first known manifest version field without mutating input", () => {
    const manifest = {
      aliceVersion: "3.1.10.0.0",
      projectVersion: "3.2.0.0",
      createdWith: { version: "3.3.0.0" },
    };

    const nextManifest = syncManifestVersion(manifest, versionInfo);

    expect(nextManifest).toEqual({
      aliceVersion: "3.10.0.0",
      projectVersion: "3.2.0.0",
      createdWith: { version: "3.3.0.0" },
    });
    expect(manifest.aliceVersion).toBe("3.1.10.0.0");
  });

  it("does not invent manifest version fields when none are present", () => {
    expect(syncManifestVersion({ projectName: "No Version" }, versionInfo)).toEqual({
      projectName: "No Version",
    });
  });
});
