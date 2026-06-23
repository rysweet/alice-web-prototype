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
          evidenceCodes: many.map((index) => index % 2 === 0 ? "webxr-unavailable" : "immersive-vr-unsupported"),
        },
        accessibilityRescueCaptions: {
          schema_version: "alice.accessibility-rescue-camera-captions/v1",
          status: "partial",
          keyboardReviewAvailable: "unknown",
          highContrastReviewAvailable: "unknown",
          captionChecks: many.map((index) => ({
            id: ["aria-live-status", "camera-caption", "scene-object-caption"][index % 3],
            present: true,
          })),
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          rubric: many.map((index) => ({
            id: ["visible-world", "camera-framing", "accessibility-captions"][index % 3],
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
          captionChecks: [{ id: "camera-caption", present: "yes" as unknown as boolean }],
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          reviewWorkflowSupported: "true" as unknown as false,
          rubricRecordingSupported: "true" as unknown as false,
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
    expect(artifact.runtimeReview?.galleryWalkRubric?.reviewWorkflowSupported).toBe(false);
    expect(artifact.runtimeReview?.galleryWalkRubric?.rubricRecordingSupported).toBe(false);
  });

  it("sanitizes malformed parsed and serialized runtime review evidence", () => {
    const many = Array.from({ length: 75 }, (_, index) => index);
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const oversized = {
      ...artifact,
      runtimeReview: {
        rawDomDump: "<main>secret</main>",
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
          cameraCaption: "x".repeat(600),
          captionChecks: many.map((index) => ({ id: `caption-${index}`, present: index === 0 ? "yes" : true })),
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          reviewerToken: "hidden",
          projectName: "x".repeat(600),
          reviewWorkflowSupported: true,
          rubricRecordingSupported: true,
          rubric: many.map((index) => ({
            id: `rubric-${index}`,
            label: `Rubric ${index}`,
            ...(index === 0 ? {} : { maxScore: 4 }),
            evidenceRequired: "Evidence",
          })),
          galleryItems: many.map((index) => ({ id: `item-${index}`, title: `Item ${index}`, reviewPrompt: "Review" })),
        },
      },
    };

    const validation = validateAliceEvidenceArtifact(oversized);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      "runtimeReview.rawDomDump is not supported.",
      "runtimeReview.cameraVrComfort.secretBackendPath is not supported.",
      "runtimeReview.cameraVrComfort.desktopCameraAvailable must be boolean.",
      "runtimeReview.cameraVrComfort.keyboardMovementAvailable must be true, false, or unknown.",
      "runtimeReview.cameraVrComfort.evidenceCodes must include 50 items or fewer.",
      "runtimeReview.cameraVrComfort.evidenceCodes[0] must be one of: secure-context-required, webxr-unavailable, immersive-vr-unsupported, session-request-failed, reference-space-unavailable, reference-space-local-fallback, input-sources-unavailable, controller-missing-target-ray, controller-missing-grip, controller-missing-gamepad, hand-tracking-unsupported, hand-pose-unavailable, invalid-movement-target, non-finite-pose, locomotion-disabled, desktop-camera-fallback, true-vr-unsupported, keyboard-camera-movement, reduced-motion-respected.",
      "runtimeReview.cameraVrComfort.comfortChecks.discreteMovementStep must be boolean.",
      "runtimeReview.accessibilityRescueCaptions.rawDomDump is not supported.",
      "runtimeReview.accessibilityRescueCaptions.keyboardReviewAvailable must be true, false, or unknown.",
      "runtimeReview.accessibilityRescueCaptions.cameraCaption must be 500 characters or fewer.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks must include 50 items or fewer.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks[0].id must be one of: aria-live-status, camera-caption, scene-object-caption.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks[0].present must be boolean.",
      "runtimeReview.galleryWalkRubric.reviewerToken is not supported.",
      "runtimeReview.galleryWalkRubric.projectName must be 500 characters or fewer.",
      "runtimeReview.galleryWalkRubric.reviewWorkflowSupported must be false.",
      "runtimeReview.galleryWalkRubric.rubricRecordingSupported must be false.",
      "runtimeReview.galleryWalkRubric.rubric must include 50 items or fewer.",
      "runtimeReview.galleryWalkRubric.rubric[0].id must be one of: visible-world, camera-framing, accessibility-captions.",
      "runtimeReview.galleryWalkRubric.rubric[0].maxScore must be a non-negative integer.",
      "runtimeReview.galleryWalkRubric.galleryItems must include 50 items or fewer.",
    ]));
    const parsed = parseAliceEvidenceArtifact(JSON.stringify(oversized));
    const serialized = serializeAliceEvidenceArtifact(oversized as unknown as AliceEvidenceArtifact);
    expect(parsed.runtimeReview?.cameraVrComfort?.evidenceCodes).toEqual([]);
    expect(parsed.runtimeReview?.accessibilityRescueCaptions?.captionChecks).toEqual([]);
    expect(parsed.runtimeReview?.accessibilityRescueCaptions?.cameraCaption).toHaveLength(500);
    expect(parsed.runtimeReview?.galleryWalkRubric?.projectName).toHaveLength(500);
    expect(parsed.runtimeReview?.galleryWalkRubric?.reviewWorkflowSupported).toBe(false);
    expect(parsed.runtimeReview?.galleryWalkRubric?.rubricRecordingSupported).toBe(false);
    expect(parsed.runtimeReview?.galleryWalkRubric?.rubric).toEqual([]);
    expect(parsed.runtimeReview?.galleryWalkRubric?.galleryItems).toHaveLength(50);
    expect(serialized).not.toContain("rawDomDump");
    expect(serialized).not.toContain("secretBackendPath");
    expect(serialized).not.toContain("reviewerToken");
    expect(validateAliceEvidenceArtifact(parsed)).toEqual({ valid: true, errors: [] });
  });

  it("rejects prior malformed runtime review edge cases before sanitizing parse output", () => {
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const malformed = {
      ...artifact,
      runtimeReview: {
        cameraVrComfort: null,
        accessibilityRescueCaptions: {
          schema_version: "alice.accessibility-rescue-camera-captions/v1",
          status: "partial",
          captionChecks: [
            null,
            { id: "camera-caption", present: true, channel: "raw-html", text: "Unsafe" },
          ],
        },
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          reviewWorkflowSupported: true,
          rubricRecordingSupported: true,
          unsupportedLiveStudioReason: "x".repeat(600),
          rubric: [null],
          galleryItems: [null],
        },
      },
    };

    expect(validateAliceEvidenceArtifact(malformed).errors).toEqual(expect.arrayContaining([
      "runtimeReview.cameraVrComfort must be an object.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks[0] must be an object.",
      "runtimeReview.accessibilityRescueCaptions.captionChecks[1].channel must be one of: aria-live, visible-text.",
      "runtimeReview.galleryWalkRubric.reviewWorkflowSupported must be false.",
      "runtimeReview.galleryWalkRubric.rubricRecordingSupported must be false.",
      "runtimeReview.galleryWalkRubric.unsupportedLiveStudioReason must be 500 characters or fewer.",
      "runtimeReview.galleryWalkRubric.rubric[0] must be an object.",
      "runtimeReview.galleryWalkRubric.galleryItems[0] must be an object.",
    ]));

    const parsed = parseAliceEvidenceArtifact(JSON.stringify(malformed));
    expect(parsed.runtimeReview?.cameraVrComfort).toEqual({
      schema_version: "alice.camera-vr-comfort-evidence/v1",
      status: "partial",
      trueHeadsetVrSupported: false,
      nativeVrSupported: false,
    });
    expect(parsed.runtimeReview?.accessibilityRescueCaptions?.captionChecks).toEqual([
      { id: "camera-caption", present: true, text: "Unsafe" },
    ]);
    expect(parsed.runtimeReview?.galleryWalkRubric?.reviewWorkflowSupported).toBe(false);
    expect(parsed.runtimeReview?.galleryWalkRubric?.rubricRecordingSupported).toBe(false);
    expect(parsed.runtimeReview?.galleryWalkRubric?.unsupportedLiveStudioReason).toHaveLength(500);
    expect(parsed.runtimeReview?.galleryWalkRubric?.rubric).toEqual([]);
    expect(parsed.runtimeReview?.galleryWalkRubric?.galleryItems).toEqual([]);
    expect(validateAliceEvidenceArtifact(parsed)).toEqual({ valid: true, errors: [] });
  });

  it("validates runtime review string bounds after trimming whitespace", () => {
    const artifact = createAliceEvidenceArtifact(baseArtifactInput());
    const padded = {
      ...artifact,
      runtimeReview: {
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          unsupportedLiveStudioReason: `ok${" ".repeat(600)}`,
        },
      },
    };
    const overlong = {
      ...artifact,
      runtimeReview: {
        galleryWalkRubric: {
          schema_version: "alice.gallery-walk-rubric-evidence/v1",
          status: "partial",
          liveStudioSupported: false,
          unsupportedLiveStudioReason: "x".repeat(600),
        },
      },
    };

    expect(validateAliceEvidenceArtifact(padded)).toEqual({ valid: true, errors: [] });
    expect(parseAliceEvidenceArtifact(JSON.stringify(padded)).runtimeReview?.galleryWalkRubric?.unsupportedLiveStudioReason)
      .toBe("ok");
    expect(validateAliceEvidenceArtifact(overlong).errors).toEqual(expect.arrayContaining([
      "runtimeReview.galleryWalkRubric.unsupportedLiveStudioReason must be 500 characters or fewer.",
    ]));
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
