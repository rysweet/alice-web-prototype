import { describe, expect, it } from "vitest";
import {
  createAccessibilityRescueCaptionEvidence,
  createCameraVrComfortEvidence,
  createGalleryWalkRubricEvidence,
  createRuntimeParityEvidence,
} from "../src/runtime-parity-evidence";
import { createDefaultCameraWorkflowState } from "../src/camera-workflow";

const camera = createDefaultCameraWorkflowState().camera;

describe("runtime parity evidence", () => {
  it("records browser camera comfort without claiming true headset VR support", () => {
    const evidence = createCameraVrComfortEvidence({
      camera,
      webxrReport: {
        status: "unsupported",
        immersiveVrSupported: false,
        referenceSpaces: { preferred: "local-floor", available: [] },
        input: { controllersSupported: false, handsSupported: false, gamepadsSupported: false },
        evidence: [
          {
            code: "immersive-vr-unsupported",
            severity: "unsupported",
            message: "Browser does not support immersive-vr.",
          },
        ],
      },
    });

    expect(evidence.status).toBe("partial");
    expect(evidence.desktopCameraAvailable).toBe(true);
    expect(evidence.keyboardMovementAvailable).toBe("unknown");
    expect(evidence.reducedMotionRespected).toBe("unknown");
    expect(evidence.trueHeadsetVrSupported).toBe(false);
    expect(evidence.nativeVrSupported).toBe(false);
    expect(evidence.evidenceCodes).toContain("immersive-vr-unsupported");
    expect(evidence.browserWebXrSession).toMatchObject({
      sessionState: "unmeasured",
      referenceSpaceType: "unknown",
      inputSourceCount: "unknown",
      locomotionMode: "unknown",
      locomotionEvidenceCodes: [],
      locomotionObserved: false,
      locomotionResult: "not-observed",
      locomotionDeltaMeters: null,
      locomotionEvidenceSource: "not-observed",
      headsetSessionObserved: false,
      nativeVrObserved: false,
    });
    expect(evidence.playerComfortPlaytest).toMatchObject({
      truePlayerComfortPlaytestSupported: false,
      headsetSessionEvidence: "not-observed",
      revisionLoopEvidence: "not-observed",
    });
    expect(evidence.unsupportedReason).toContain("true headset/native VR remains unsupported");
  });

  it("records browser WebXR session and locomotion evidence without claiming true headset playtesting", () => {
    const evidence = createCameraVrComfortEvidence({
      camera,
      webXRSessionState: "active",
      webXRReferenceSpaceType: "local-floor",
      webXRInputSourceCount: 2,
      locomotionMode: "combined",
      locomotionEvidenceCodes: ["invalid-movement-target"],
    });

    expect(evidence.trueHeadsetVrSupported).toBe(false);
    expect(evidence.nativeVrSupported).toBe(false);
    expect(evidence.browserWebXrSession).toMatchObject({
      sessionState: "active",
      referenceSpaceType: "local-floor",
      inputSourceCount: 2,
      locomotionMode: "combined",
      locomotionEvidenceCodes: ["invalid-movement-target"],
    });
    expect(evidence.playerComfortPlaytest).toMatchObject({
      truePlayerComfortPlaytestSupported: false,
      headsetSessionEvidence: "browser-webxr-session-only",
      revisionLoopEvidence: "not-observed",
    });
    expect(evidence.playerComfortPlaytest.unsupportedReason).toContain("true headset player comfort playtesting");
  });

  it("records explicit browser WebXR locomotion observations without upgrading headset/native support", () => {
    const evidence = createCameraVrComfortEvidence({
      camera,
      browserWebXRLocomotionObservation: {
        observed: true,
        evidenceSource: "browser-webxr-locomotion-api",
        sessionState: "not-started",
        referenceSpaceType: "unknown",
        inputSourceCount: 1,
        locomotionMode: "combined",
        locomotionEvidenceCodes: [],
        locomotionResult: "movement",
        deltaMeters: { x: 0.5, y: 0, z: -1 },
        clamped: false,
        headsetSessionObserved: false,
        nativeVrObserved: false,
        unsupportedReason: "No headset/native VR session was observed.",
      },
    });

    expect(evidence.trueHeadsetVrSupported).toBe(false);
    expect(evidence.nativeVrSupported).toBe(false);
    expect(evidence.browserWebXrSession).toMatchObject({
      sessionState: "not-started",
      inputSourceCount: 1,
      locomotionMode: "combined",
      locomotionObserved: true,
      locomotionResult: "movement",
      locomotionDeltaMeters: { x: 0.5, y: 0, z: -1 },
      locomotionEvidenceSource: "browser-webxr-locomotion-api",
      headsetSessionObserved: false,
      nativeVrObserved: false,
    });
  });

  it("creates accessibility rescue captions from camera and scene objects", () => {
    const evidence = createAccessibilityRescueCaptionEvidence({
      camera,
      statusText: "Loaded Bunny World.",
      project: {
        version: "3.10",
        projectName: "Bunny World",
        sceneObjects: [
          { name: "bunny", typeName: "org.lgna.story.SBiped", resourceType: null, position: null, orientation: null, size: null },
        ],
        methods: [],
      },
    });

    expect(evidence.status).toBe("partial");
    expect(evidence.ariaLiveCaption).toBe("Loaded Bunny World.");
    expect(evidence.cameraCaption).toContain("Camera orbit view");
    expect(evidence.objectCaption).toContain("bunny");
    expect(evidence.captionChecks.every((check) => check.present)).toBe(true);
    expect(evidence.captionChecks.find((check) => check.id === "aria-live-status")?.channel).toBe("aria-live");
    expect(evidence.keyboardReviewAvailable).toBe("unknown");
    expect(evidence.highContrastReviewAvailable).toBe("unknown");
  });

  it("creates gallery walk rubric evidence with live studio runtime support", () => {
    const evidence = createGalleryWalkRubricEvidence({
      project: {
        version: "3.10",
        projectName: "Review World",
        sceneObjects: [
          { name: "hero", typeName: "org.lgna.story.SBiped", resourceType: null, position: null, orientation: null, size: null },
          { name: "goal", typeName: "org.lgna.story.SProp", resourceType: null, position: null, orientation: null, size: null },
        ],
        methods: [],
      },
    });

    expect(evidence.reviewWorkflowSupported).toBe(true);
    expect(evidence.rubricRecordingSupported).toBe(false);
    expect(evidence.liveStudioSupported).toBe(true);
    expect(evidence.liveStudio).toMatchObject({
      supported: true,
      synchronizationSupported: true,
      participantOrchestrationSupported: true,
      handoffSupported: true,
    });
    expect(evidence.galleryItems.map((item) => item.title)).toEqual(["hero", "goal"]);
    expect(evidence.rubric.map((criterion) => criterion.id)).toContain("accessibility-captions");
  });

  it("bundles the three runtime parity evidence sections", () => {
    const evidence = createRuntimeParityEvidence({ camera });

    expect(evidence.cameraVrComfort.schema_version).toBe("alice.camera-vr-comfort-evidence/v1");
    expect(evidence.accessibilityRescueCaptions.schema_version).toBe("alice.accessibility-rescue-camera-captions/v1");
    expect(evidence.galleryWalkRubric.schema_version).toBe("alice.gallery-walk-rubric-evidence/v1");
  });
});
