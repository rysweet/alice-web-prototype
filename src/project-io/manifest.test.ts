import { describe, expect, it } from "vitest";
import { ProjectIoError } from "../project-io.js";
import { parseManifestText, serializeManifest } from "./manifest.js";

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
});
