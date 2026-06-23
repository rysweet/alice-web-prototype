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
  type AliceEvidenceRuntimeReview,
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
    const untrustedRuntimeReview = {
      cameraVrComfort: {
        schema_version: "alice.camera-vr-comfort-evidence/v1",
        status: "partial",
        trueHeadsetVrSupported: false,
        nativeVrSupported: false,
        secretBackendPath: "/tmp/alice",
      },
      accessibilityRescueCaptions: {
        schema_version: "alice.accessibility-rescue-camera-captions/v1",
        status: "partial",
        captionChecks: [{ id: "camera-caption", present: true }],
        rawDomDump: "<main>hidden</main>",
      },
      galleryWalkRubric: {
        schema_version: "alice.gallery-walk-rubric-evidence/v1",
        status: "partial",
        liveStudioSupported: false,
        reviewerToken: "hidden",
      },
    } as unknown as AliceEvidenceRuntimeReview;
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: untrustedRuntimeReview,
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
    expect(JSON.stringify(artifact.runtimeReview)).not.toContain("secretBackendPath");
    expect(JSON.stringify(artifact.runtimeReview)).not.toContain("rawDomDump");
    expect(JSON.stringify(artifact.runtimeReview)).not.toContain("reviewerToken");
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
          ...(artifact.runtimeReview?.cameraVrComfort as unknown as Record<string, unknown>),
          trueHeadsetVrSupported: true,
        },
        galleryWalkRubric: {
          ...(artifact.runtimeReview?.galleryWalkRubric as unknown as Record<string, unknown>),
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
    const untrustedRuntimeReview = {
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
    } as unknown as AliceEvidenceRuntimeReview;
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: untrustedRuntimeReview,
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

  it("bounds caller-supplied runtime review arrays", () => {
    const many = Array.from({ length: 75 }, (_, index) => index);
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: {
        cameraVrComfort: {
          schema_version: "alice.camera-vr-comfort-evidence/v1",
          status: "partial",
          trueHeadsetVrSupported: false,
          nativeVrSupported: false,
          keyboardMovementAvailable: "unknown",
          reducedMotionRespected: "unknown",
          evidenceCodes: many.map((index) => `code-${index}`),
        },
        accessibilityRescueCaptions: {
          schema_version: "alice.accessibility-rescue-camera-captions/v1",
          status: "partial",
          keyboardReviewAvailable: "unknown",
          highContrastReviewAvailable: "unknown",
          captionChecks: many.map((index) => ({ id: `caption-${index}`, present: true })),
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          rubric: many.map((index) => ({
            id: `rubric-${index}`,
            label: `Rubric ${index}`,
            maxScore: 4,
            evidenceRequired: `Evidence ${index}`,
          })),
          galleryItems: many.map((index) => ({
            id: `item-${index}`,
            title: `Item ${index}`,
            reviewPrompt: `Review item ${index}`,
          })),
        },
      },
    });

    expect(artifact.runtimeReview?.cameraVrComfort?.keyboardMovementAvailable).toBe("unknown");
    expect(artifact.runtimeReview?.cameraVrComfort?.reducedMotionRespected).toBe("unknown");
    expect(artifact.runtimeReview?.accessibilityRescueCaptions?.keyboardReviewAvailable).toBe("unknown");
    expect(artifact.runtimeReview?.accessibilityRescueCaptions?.highContrastReviewAvailable).toBe("unknown");
    expect(artifact.runtimeReview?.cameraVrComfort?.evidenceCodes).toHaveLength(50);
    expect(artifact.runtimeReview?.accessibilityRescueCaptions?.captionChecks).toHaveLength(50);
    expect(artifact.runtimeReview?.galleryWalkRubric?.rubric).toHaveLength(50);
    expect(artifact.runtimeReview?.galleryWalkRubric?.galleryItems).toHaveLength(50);
    expect(validateAliceEvidenceArtifact(artifact)).toEqual({ valid: true, errors: [] });
  });

  it("does not coerce malformed measured runtime flags to true", () => {
    const artifact = createAliceEvidenceArtifact({
      ...baseArtifactInput(),
      runtimeReview: {
        cameraVrComfort: {
          schema_version: "alice.camera-vr-comfort-evidence/v1",
          status: "partial",
          trueHeadsetVrSupported: false,
          nativeVrSupported: false,
          desktopCameraAvailable: "false" as unknown as boolean,
          keyboardMovementAvailable: "false" as unknown as boolean,
          reducedMotionRespected: "false" as unknown as boolean,
          comfortChecks: {
            discreteMovementStep: "false" as unknown as boolean,
            stableHorizon: "false" as unknown as boolean,
            noForcedHeadset: "false" as unknown as boolean,
          },
        },
        accessibilityRescueCaptions: {
          schema_version: "alice.accessibility-rescue-camera-captions/v1",
          status: "partial",
          keyboardReviewAvailable: "false" as unknown as boolean,
          highContrastReviewAvailable: "false" as unknown as boolean,
          captionChecks: [{ id: "caption", present: "yes" as unknown as boolean }],
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          reviewWorkflowSupported: "true" as unknown as boolean,
          rubricRecordingSupported: "true" as unknown as boolean,
        },
      },
    });

    expect(artifact.runtimeReview?.cameraVrComfort?.desktopCameraAvailable).toBeUndefined();
    expect(artifact.runtimeReview?.cameraVrComfort?.keyboardMovementAvailable).toBe("unknown");
    expect(artifact.runtimeReview?.cameraVrComfort?.reducedMotionRespected).toBe("unknown");
    expect(artifact.runtimeReview?.cameraVrComfort?.comfortChecks).toEqual({
      discreteMovementStep: false,
      stableHorizon: false,
      noForcedHeadset: false,
    });
    expect(artifact.runtimeReview?.accessibilityRescueCaptions?.keyboardReviewAvailable).toBe("unknown");
    expect(artifact.runtimeReview?.accessibilityRescueCaptions?.highContrastReviewAvailable).toBe("unknown");
    expect(artifact.runtimeReview?.accessibilityRescueCaptions?.captionChecks?.[0]?.present).toBe(false);
    expect(artifact.runtimeReview?.galleryWalkRubric?.reviewWorkflowSupported).toBeUndefined();
    expect(artifact.runtimeReview?.galleryWalkRubric?.rubricRecordingSupported).toBeUndefined();
  });

  it("rejects malformed parsed runtime review evidence", () => {
    const many = Array.from({ length: 75 }, (_, index) => index);
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const oversized = {
      ...artifact,
      runtimeReview: {
        cameraVrComfort: {
          schema_version: "alice.camera-vr-comfort-evidence/v1",
          status: "partial",
          trueHeadsetVrSupported: false,
          nativeVrSupported: false,
          secretBackendPath: "/tmp/secret",
          desktopCameraAvailable: "false",
          keyboardMovementAvailable: "false",
          evidenceCodes: many.map((index) => `code-${index}`),
          comfortChecks: {
            discreteMovementStep: "false",
          },
        },
        accessibilityRescueCaptions: {
          schema_version: "alice.accessibility-rescue-camera-captions/v1",
          status: "partial",
          rawDomDump: "<main>secret</main>",
          keyboardReviewAvailable: "false",
          captionChecks: many.map((index) => ({ id: `caption-${index}`, present: index === 0 ? "yes" : true })),
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          reviewerToken: "hidden",
          reviewWorkflowSupported: "true",
          rubric: many.map((index) => ({ id: `rubric-${index}`, label: `Rubric ${index}`, maxScore: 4, evidenceRequired: "Evidence" })),
          galleryItems: many.map((index) => ({ id: `item-${index}`, title: `Item ${index}`, reviewPrompt: "Review" })),
        },
      },
    };

    const validation = validateAliceEvidenceArtifact(oversized);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      "runtimeReview.cameraVrComfort.secretBackendPath is not supported.",
      "runtimeReview.cameraVrComfort.desktopCameraAvailable must be boolean.",
      "runtimeReview.cameraVrComfort.keyboardMovementAvailable must be true, false, or unknown.",
      "runtimeReview.cameraVrComfort.evidenceCodes must include 50 items or fewer.",
      "runtimeReview.cameraVrComfort.comfortChecks.discreteMovementStep must be boolean.",
      "runtimeReview.accessibilityRescueCaptions.rawDomDump is not supported.",
      "runtimeReview.accessibilityRescueCaptions.keyboardReviewAvailable must be true, false, or unknown.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks must include 50 items or fewer.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks[0].present must be boolean.",
      "runtimeReview.galleryWalkRubric.reviewerToken is not supported.",
      "runtimeReview.galleryWalkRubric.reviewWorkflowSupported must be boolean.",
      "runtimeReview.galleryWalkRubric.rubric must include 50 items or fewer.",
      "runtimeReview.galleryWalkRubric.galleryItems must include 50 items or fewer.",
    ]));
    expect(() => parseAliceEvidenceArtifact(JSON.stringify(oversized))).toThrow(/50 items or fewer/);
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
