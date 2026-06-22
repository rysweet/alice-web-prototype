import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createAliceEvidenceArtifact,
  parseAliceEvidenceArtifact,
  prepareAliceEvidenceShare,
  serializeAliceEvidenceArtifact,
  summarizeAliceEvidenceArtifact,
  type AliceEvidenceArtifact,
  type AliceEvidenceArtifactInput,
  validateAliceEvidenceArtifact,
} from "../src/alice-evidence-artifact";

function baseArtifactInput(): AliceEvidenceArtifactInput {
  return {
    world: {
      name: "Wonderland demo",
      aliceVersion: "3.10.0.0",
      objectCount: 2,
    },
    run: {
      id: "run-2026-06-22T05-19-37-228Z",
      capturedAt: "2026-06-22T05:19:37.228Z",
    },
    visibleBehavior: {
      statusText: 'Loaded "Wonderland demo" (v3.10.0.0) - 2 objects.',
      viewport: {
        width: 1280,
        height: 720,
        canvasSnapshot: {
          available: false,
          reason: "metadata-only",
        },
      },
      camera: {
        mode: "orbit",
        position: { x: 0, y: 1.6, z: 6 },
        target: { x: 0, y: 1, z: 0 },
      },
      objects: [
        {
          name: "alice",
          typeName: "org.lgna.story.SBiped",
          visible: true,
          position: { x: 0, y: 0, z: 0 },
        },
        {
          name: "whiteRabbit",
          typeName: "org.lgna.story.SBiped",
          visible: true,
          position: { x: 1, y: 0, z: 0 },
        },
      ],
    },
    export: {
      method: "download",
      requestedAt: "2026-06-22T05:19:38.000Z",
      filename: "Wonderland demo Alice evidence.json",
      mimeType: "application/json",
    },
  };
}

describe("Alice evidence artifact", () => {
  it("creates a valid Alice/alice-web artifact with visible behavior and provenance", () => {
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());

    expect(artifact).toMatchObject({
      format: "alice-visible-behavior-evidence",
      version: 1,
      application: {
        name: "Alice",
        runtime: "alice-web",
      },
      world: {
        name: "Wonderland demo",
        aliceVersion: "3.10.0.0",
        objectCount: 2,
      },
      run: {
        id: "run-2026-06-22T05-19-37-228Z",
        capturedAt: "2026-06-22T05:19:37.228Z",
      },
      export: {
        method: "download",
        requestedAt: "2026-06-22T05:19:38.000Z",
        mimeType: "application/json",
      },
    });
    expect(artifact.visibleBehavior.objects).toHaveLength(2);
    expect(artifact.visibleBehavior.objects[0]).toMatchObject({
      name: "alice",
      typeName: "org.lgna.story.SBiped",
      visible: true,
    });
    expect(artifact.visibleBehavior.viewport.canvasSnapshot).toEqual({
      available: false,
      reason: "metadata-only",
    });
    expect(validateAliceEvidenceArtifact(artifact)).toEqual({ valid: true, errors: [] });
  });

  it("keeps exported filenames conservative and bounds visible object evidence", () => {
    const manyObjects = Array.from({ length: 205 }, (_, index) => ({
      name: `object${index + 1}`,
      typeName: "org.lgna.story.SModel",
      visible: true,
      position: { x: index, y: 0, z: 0 },
    }));
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      visibleBehavior: {
        ...baseArtifactInput().visibleBehavior,
        objects: manyObjects,
      },
      export: {
        ...baseArtifactInput().export,
        filename: "../Alice evidence: Wonderland demo?.json",
      },
    });

    expect(artifact.export.filename).toMatch(/^[a-z0-9][a-z0-9.-]*\.json$/);
    expect(artifact.export.filename).not.toContain("..");
    expect(artifact.export.filename.length).toBeLessThanOrEqual(120);
    expect(artifact.visibleBehavior.objects).toHaveLength(200);
    expect(artifact.visibleBehavior.objects[0]?.name).toBe("object1");
    expect(artifact.visibleBehavior.objects.at(-1)?.name).toBe("object200");
  });

  it("serializes deterministically as parseable JSON without canvas image data", () => {
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const serialized = serializeAliceEvidenceArtifact(artifact);

    expect(serialized).toBe(serializeAliceEvidenceArtifact(createAliceEvidenceArtifact(baseArtifactInput())));
    expect(JSON.parse(serialized)).toEqual(artifact);
    expect(parseAliceEvidenceArtifact(serialized)).toEqual(artifact);
    expect(summarizeAliceEvidenceArtifact(artifact)).toMatchObject({
      title: "Alice evidence for Wonderland demo",
      projectName: "Wonderland demo",
      captureCount: 1,
      objectCount: 2,
      lastCaptureLabel: "Visible behavior",
    });
    expect(serialized).toContain('"alice-web"');
    expect(serialized).not.toMatch(/data:image\//);
  });

  it("preserves native share details when the browser share path is used", () => {
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      export: {
        ...baseArtifactInput().export,
        method: "native-share",
        share: {
          available: true,
          outcome: "prepared",
        },
      },
    });

    expect(artifact.export).toMatchObject({
      method: "native-share",
      mimeType: "application/json",
      share: {
        available: true,
        outcome: "prepared",
      },
    });
    expect(validateAliceEvidenceArtifact(artifact).valid).toBe(true);
  });

  it("preserves runtime review evidence for camera comfort, captions, and gallery rubric", () => {
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: {
        cameraVrComfort: {
          schema_version: "alice.camera-vr-comfort-evidence/v1",
          status: "partial",
          trueHeadsetVrSupported: false,
          nativeVrSupported: false,
        },
        accessibilityRescueCaptions: {
          schema_version: "alice.accessibility-rescue-camera-captions/v1",
          status: "partial",
          captionChecks: [{ id: "camera-caption", present: true }],
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
        },
      },
    });

    expect(artifact.runtimeReview?.cameraVrComfort).toMatchObject({
      trueHeadsetVrSupported: false,
      nativeVrSupported: false,
    });
    expect(artifact.runtimeReview?.accessibilityRescueCaptions).toMatchObject({
      status: "partial",
    });
    expect(artifact.runtimeReview?.galleryWalkRubric).toMatchObject({
      liveStudioSupported: false,
    });
    expect(validateAliceEvidenceArtifact(artifact)).toEqual({ valid: true, errors: [] });
  });

  it("rejects runtime review evidence that claims unsupported parity is supported", () => {
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: {
        cameraVrComfort: {
          schema_version: "alice.camera-vr-comfort-evidence/v1",
          status: "partial",
          trueHeadsetVrSupported: false,
          nativeVrSupported: false,
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
        },
      },
    });

    const result = validateAliceEvidenceArtifact({
      ...artifact,
      runtimeReview: {
        ...artifact.runtimeReview,
        cameraVrComfort: {
          ...(artifact.runtimeReview?.cameraVrComfort as Record<string, unknown>),
          trueHeadsetVrSupported: true,
        },
        galleryWalkRubric: {
          ...(artifact.runtimeReview?.galleryWalkRubric as Record<string, unknown>),
          liveStudioSupported: true,
        },
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      "runtimeReview.cameraVrComfort.trueHeadsetVrSupported must be false.",
      "runtimeReview.galleryWalkRubric.liveStudioSupported must be false.",
    ]));
  });

  it("sanitizes caller-supplied runtime review evidence to preserve unsupported parity boundaries", () => {
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: {
        cameraVrComfort: {
          schema_version: "alice.camera-vr-comfort-evidence/v1",
          status: "partial",
          trueHeadsetVrSupported: true,
          nativeVrSupported: true,
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: true,
        },
      },
    });

    expect(artifact.runtimeReview?.cameraVrComfort).toMatchObject({
      trueHeadsetVrSupported: false,
      nativeVrSupported: false,
    });
    expect(artifact.runtimeReview?.galleryWalkRubric).toMatchObject({
      liveStudioSupported: false,
    });
    expect(validateAliceEvidenceArtifact(artifact)).toEqual({ valid: true, errors: [] });
  });

  it("prepares native share metadata from the pre-share artifact hash", () => {
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const staleSharedArtifact: AliceEvidenceArtifact = {
      ...artifact,
      export: {
        ...artifact.export,
        method: "native-share",
        share: {
          available: true,
          outcome: "completed",
          artifactHash: "sha256:stale",
        },
      },
    };
    const preShareArtifact: AliceEvidenceArtifact = {
      ...staleSharedArtifact,
      export: {
        ...staleSharedArtifact.export,
      },
    };
    delete preShareArtifact.export.share;
    const expectedHash = `sha256:${createHash("sha256")
      .update(serializeAliceEvidenceArtifact(preShareArtifact))
      .digest("hex")}`;

    const shared = prepareAliceEvidenceShare(staleSharedArtifact, {
      available: true,
      outcome: "prepared",
      preparedAt: "2026-06-22T05:59:03.111Z",
    });

    expect(shared.export.share).toMatchObject({
      available: true,
      outcome: "prepared",
      title: "Alice evidence for Wonderland demo",
      artifactHash: expectedHash,
      preparedAt: "2026-06-22T05:59:03.111Z",
    });
    expect(validateAliceEvidenceArtifact(shared)).toEqual({ valid: true, errors: [] });
  });

  it("rejects artifacts without Alice identity, export metadata, or visible behavior", () => {
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const result = validateAliceEvidenceArtifact({
      ...artifact,
      application: {
        name: "Other app",
        runtime: "browser-port",
      },
      visibleBehavior: {
        ...artifact.visibleBehavior,
        objects: [],
      },
      export: {
        ...artifact.export,
        filename: "alice-evidence.txt",
        mimeType: "text/plain",
      },
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/Alice/);
    expect(result.errors.join("\n")).toMatch(/alice-web/);
    expect(result.errors.join("\n")).toMatch(/visible behavior/i);
    expect(result.errors.join("\n")).toMatch(/application\/json/);
    expect(result.errors.join("\n")).toMatch(/\.json/);
  });
});
