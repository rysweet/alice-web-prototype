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
    expect(evidence.keyboardMovementAvailable).toBe(true);
    expect(evidence.trueHeadsetVrSupported).toBe(false);
    expect(evidence.nativeVrSupported).toBe(false);
    expect(evidence.evidenceCodes).toContain("immersive-vr-unsupported");
    expect(evidence.unsupportedReason).toContain("true headset/native VR remains unsupported");
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
  });

  it("creates gallery walk rubric evidence while keeping live studio unsupported", () => {
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
    expect(evidence.rubricRecordingSupported).toBe(true);
    expect(evidence.liveStudioSupported).toBe(false);
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
