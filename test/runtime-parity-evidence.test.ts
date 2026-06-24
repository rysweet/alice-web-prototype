import { describe, expect, it } from "vitest";
import {
  createAccessibilityRescueCaptionEvidence,
  createCameraVrComfortEvidence,
  createPlayerComfortSessionEvidence,
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

  it("records submitted headset player comfort and revision-loop evidence", () => {
    const playerComfortSession = createPlayerComfortSessionEvidence({
      mode: "headset",
      sessionLabel: "Quest browser session A",
      playerAlias: "student player",
      observerAlias: "studio observer",
      headsetEvidenceArtifact: "recordings/quest-session-a.mp4",
      comfort: {
        orientationObservation: "Player found the start direction after the visible arrow cue.",
        locomotionComfort: "Player tolerated point-click movement and stopped before smooth turning.",
        discoverabilityCue: "Player used the glowing doorway cue to decide where to move next.",
        stopOrContinueDecision: "Observer stopped the run after one mild discomfort report.",
      },
      revisionLoop: {
        beforeObservation: "Before revision, the doorway cue was missed twice by the player.",
        revisionChange: "Author increased the doorway glow and added a slower camera turn.",
        afterObservation: "After revision, the player found the doorway without a verbal prompt.",
      },
    });
    const evidence = createCameraVrComfortEvidence({ camera, playerComfortSession });

    expect(evidence.status).toBe("partial");
    expect(evidence.nativeVrSupported).toBe(false);
    expect(evidence.playerComfortPlaytest).toMatchObject({
      truePlayerComfortPlaytestSupported: true,
      headsetSessionEvidence: "observed-headset-player-session",
      revisionLoopEvidence: "observed-before-after-revision",
    });
    expect(evidence.playerComfortPlaytest.observedSession?.revisionLoop.revisionChange)
      .toContain("doorway glow");
    expect(evidence.playerComfortPlaytest.unsupportedReason).toContain("native Alice desktop VR support remains unsupported");
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
