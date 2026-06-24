import type { AliceProject } from "./a3p-parser.js";
import type { CameraWorkflowState } from "./camera-workflow.js";
import { createLiveStudioEvidence, type LiveWorkshopStudioSession } from "./live-studio.js";
import type { WebXRCapabilityReport, WebXREvidenceCode } from "./webxr-capabilities.js";
import type { WebXRLocomotionMode } from "./webxr-locomotion.js";
import type { WebXRSessionState } from "./webxr-session.js";

export const CAMERA_VR_COMFORT_SCHEMA_VERSION = "alice.camera-vr-comfort-evidence/v1" as const;
export const ACCESSIBILITY_RESCUE_CAPTIONS_SCHEMA_VERSION = "alice.accessibility-rescue-camera-captions/v1" as const;
export const GALLERY_WALK_RUBRIC_SCHEMA_VERSION = "alice.gallery-walk-rubric-evidence/v1" as const;

export type RuntimeParityStatus = "partial";
export type RuntimeParityMeasuredBoolean = boolean | "unknown";
export type RuntimeParityMeasuredNumber = number | "unknown";
export type WebXRSessionEvidenceState = WebXRSessionState | "not-started" | "unmeasured";

export interface BrowserWebXRLocomotionObservation {
  readonly observed: true;
  readonly evidenceSource: "browser-webxr-locomotion-api";
  readonly sessionState: WebXRSessionEvidenceState;
  readonly referenceSpaceType: string | "unknown";
  readonly inputSourceCount: number;
  readonly locomotionMode: WebXRLocomotionMode;
  readonly locomotionEvidenceCodes: readonly WebXREvidenceCode[];
  readonly locomotionResult: "none" | "movement";
  readonly deltaMeters: { readonly x: number; readonly y: number; readonly z: number };
  readonly clamped: boolean;
  readonly headsetSessionObserved: false;
  readonly nativeVrObserved: false;
  readonly unsupportedReason: string;
}

export interface CameraVrComfortEvidence {
  readonly schema_version: typeof CAMERA_VR_COMFORT_SCHEMA_VERSION;
  readonly status: RuntimeParityStatus;
  readonly browserWebXrStatus: WebXRCapabilityReport["status"] | "unknown";
  readonly desktopCameraAvailable: boolean;
  readonly keyboardMovementAvailable: RuntimeParityMeasuredBoolean;
  readonly reducedMotionRespected: RuntimeParityMeasuredBoolean;
  readonly trueHeadsetVrSupported: false;
  readonly nativeVrSupported: false;
  readonly cameraMode: string;
  readonly evidenceCodes: readonly WebXREvidenceCode[];
  readonly browserWebXrSession: {
    readonly sessionState: WebXRSessionEvidenceState;
    readonly referenceSpaceType: string | "unknown";
    readonly inputSourceCount: RuntimeParityMeasuredNumber;
    readonly locomotionMode: WebXRLocomotionMode | "unknown";
    readonly locomotionEvidenceCodes: readonly WebXREvidenceCode[];
    readonly locomotionObserved: boolean;
    readonly locomotionResult: "none" | "movement" | "not-observed";
    readonly locomotionDeltaMeters: { readonly x: number; readonly y: number; readonly z: number } | null;
    readonly locomotionEvidenceSource: BrowserWebXRLocomotionObservation["evidenceSource"] | "not-observed";
    readonly headsetSessionObserved: false;
    readonly nativeVrObserved: false;
  };
  readonly playerComfortPlaytest: {
    readonly truePlayerComfortPlaytestSupported: false;
    readonly headsetSessionEvidence: "not-observed" | "browser-webxr-session-only";
    readonly revisionLoopEvidence: "not-observed";
    readonly unsupportedReason: string;
  };
  readonly comfortChecks: {
    readonly discreteMovementStep: boolean;
    readonly stableHorizon: boolean;
    readonly noForcedHeadset: boolean;
  };
  readonly unsupportedReason: string;
}

export interface AccessibilityRescueCaptionEvidence {
  readonly schema_version: typeof ACCESSIBILITY_RESCUE_CAPTIONS_SCHEMA_VERSION;
  readonly status: RuntimeParityStatus;
  readonly ariaLiveCaption: string;
  readonly cameraCaption: string;
  readonly objectCaption: string;
  readonly keyboardReviewAvailable: RuntimeParityMeasuredBoolean;
  readonly highContrastReviewAvailable: RuntimeParityMeasuredBoolean;
  readonly captionChecks: readonly {
    readonly id: string;
    readonly present: boolean;
    readonly channel: "aria-live" | "visible-text";
    readonly text: string;
  }[];
}

export interface GalleryWalkRubricEvidence {
  readonly schema_version: typeof GALLERY_WALK_RUBRIC_SCHEMA_VERSION;
  readonly status: RuntimeParityStatus;
  readonly projectName: string;
  readonly galleryItemCount: number;
  readonly reviewWorkflowSupported: true;
  readonly rubricRecordingSupported: false;
  readonly liveStudioSupported: true;
  readonly liveStudio: ReturnType<typeof createLiveStudioEvidence>;
  readonly rubric: readonly {
    readonly id: string;
    readonly label: string;
    readonly maxScore: number;
    readonly evidenceRequired: string;
  }[];
  readonly galleryItems: readonly {
    readonly id: string;
    readonly title: string;
    readonly reviewPrompt: string;
  }[];
}

export interface RuntimeParityEvidence {
  readonly cameraVrComfort: CameraVrComfortEvidence;
  readonly accessibilityRescueCaptions: AccessibilityRescueCaptionEvidence;
  readonly galleryWalkRubric: GalleryWalkRubricEvidence;
}

export function createCameraVrComfortEvidence(input: {
  readonly camera: CameraWorkflowState["camera"];
  readonly webxrReport?: WebXRCapabilityReport | null;
  readonly keyboardMovementAvailable?: boolean;
  readonly reducedMotionRespected?: boolean;
  readonly webXRSessionState?: WebXRSessionEvidenceState;
  readonly webXRReferenceSpaceType?: string | null;
  readonly webXRInputSourceCount?: number;
  readonly locomotionMode?: WebXRLocomotionMode;
  readonly locomotionEvidenceCodes?: readonly WebXREvidenceCode[];
  readonly browserWebXRLocomotionObservation?: BrowserWebXRLocomotionObservation | null;
}): CameraVrComfortEvidence {
  const webxrReport = input.webxrReport ?? null;
  const locomotionObservation = input.browserWebXRLocomotionObservation ?? null;
  const sessionState = input.webXRSessionState ?? locomotionObservation?.sessionState ?? "unmeasured";
  const suppliedInputSourceCount = input.webXRInputSourceCount ?? locomotionObservation?.inputSourceCount;
  const inputSourceCount: RuntimeParityMeasuredNumber = typeof suppliedInputSourceCount === "number"
    && Number.isInteger(suppliedInputSourceCount)
    && suppliedInputSourceCount >= 0
    ? suppliedInputSourceCount
    : "unknown";
  const locomotionEvidenceCodes = input.locomotionEvidenceCodes ?? [];
  return {
    schema_version: CAMERA_VR_COMFORT_SCHEMA_VERSION,
    status: "partial",
    browserWebXrStatus: webxrReport?.status ?? "unknown",
    desktopCameraAvailable: true,
    keyboardMovementAvailable: input.keyboardMovementAvailable ?? "unknown",
    reducedMotionRespected: input.reducedMotionRespected ?? "unknown",
    trueHeadsetVrSupported: false,
    nativeVrSupported: false,
    cameraMode: input.camera.mode,
    evidenceCodes: webxrReport?.evidence.map((item) => item.code) ?? ["desktop-camera-fallback", "true-vr-unsupported"],
    browserWebXrSession: {
      sessionState,
      referenceSpaceType: input.webXRReferenceSpaceType?.trim() || locomotionObservation?.referenceSpaceType || "unknown",
      inputSourceCount,
      locomotionMode: input.locomotionMode ?? locomotionObservation?.locomotionMode ?? "unknown",
      locomotionEvidenceCodes: locomotionObservation?.locomotionEvidenceCodes ?? locomotionEvidenceCodes,
      locomotionObserved: locomotionObservation?.observed ?? false,
      locomotionResult: locomotionObservation?.locomotionResult ?? "not-observed",
      locomotionDeltaMeters: locomotionObservation?.deltaMeters ?? null,
      locomotionEvidenceSource: locomotionObservation?.evidenceSource ?? "not-observed",
      headsetSessionObserved: false,
      nativeVrObserved: false,
    },
    playerComfortPlaytest: {
      truePlayerComfortPlaytestSupported: false,
      headsetSessionEvidence: sessionState === "active" ? "browser-webxr-session-only" : "not-observed",
      revisionLoopEvidence: "not-observed",
      unsupportedReason: "Alice web can report browser WebXR session and locomotion evidence; true headset player comfort playtesting still requires observed headset sessions, player notes, and a revision loop.",
    },
    comfortChecks: {
      discreteMovementStep: true,
      stableHorizon: true,
      noForcedHeadset: true,
    },
    unsupportedReason: "Alice web records browser WebXR and desktop camera comfort evidence only; true headset/native VR remains unsupported.",
  };
}

export function createAccessibilityRescueCaptionEvidence(input: {
  readonly camera: CameraWorkflowState["camera"];
  readonly project?: AliceProject | null;
  readonly statusText?: string;
  readonly keyboardReviewAvailable?: boolean;
  readonly highContrastReviewAvailable?: boolean;
}): AccessibilityRescueCaptionEvidence {
  const objectNames = (input.project?.sceneObjects ?? [])
    .map((object) => object.name.trim())
    .filter(Boolean);
  const objectCaption = objectNames.length > 0
    ? `Scene contains ${objectNames.slice(0, 4).join(", ")}${objectNames.length > 4 ? ", and more" : ""}.`
    : "Scene has no authored objects yet.";
  const cameraCaption = `Camera ${input.camera.mode} view at ${formatNumber(input.camera.position.x)}, ${formatNumber(input.camera.position.y)}, ${formatNumber(input.camera.position.z)}.`;
  const ariaLiveCaption = input.statusText?.trim() || "Alice web scene is ready for accessible review.";

  return {
    schema_version: ACCESSIBILITY_RESCUE_CAPTIONS_SCHEMA_VERSION,
    status: "partial",
    ariaLiveCaption,
    cameraCaption,
    objectCaption,
    keyboardReviewAvailable: input.keyboardReviewAvailable ?? "unknown",
    highContrastReviewAvailable: input.highContrastReviewAvailable ?? "unknown",
    captionChecks: [
      { id: "aria-live-status", present: true, channel: "aria-live", text: ariaLiveCaption },
      { id: "camera-caption", present: true, channel: "visible-text", text: cameraCaption },
      { id: "scene-object-caption", present: true, channel: "visible-text", text: objectCaption },
    ],
  };
}

export function createGalleryWalkRubricEvidence(input: {
  readonly project?: AliceProject | null;
  readonly liveStudio?: LiveWorkshopStudioSession | null;
}): GalleryWalkRubricEvidence {
  const projectName = input.project?.projectName?.trim() || "Alice web project";
  const objects = input.project?.sceneObjects ?? [];
  const galleryItems = objects.length > 0
    ? objects.slice(0, 12).map((object, index) => ({
        id: `scene-object-${index + 1}`,
        title: object.name,
        reviewPrompt: `Review how ${object.name} supports the story, game goal, or scene composition.`,
      }))
    : [{
        id: "starter-project",
        title: projectName,
        reviewPrompt: "Review the starter scene and add at least one visible object before final scoring.",
      }];

  return {
    schema_version: GALLERY_WALK_RUBRIC_SCHEMA_VERSION,
    status: "partial",
    projectName,
    galleryItemCount: galleryItems.length,
    reviewWorkflowSupported: true,
    rubricRecordingSupported: false,
    liveStudioSupported: true,
    liveStudio: createLiveStudioEvidence(input.liveStudio ?? null),
    rubric: [
      {
        id: "visible-world",
        label: "Visible world evidence",
        maxScore: 4,
        evidenceRequired: "The project has visible Alice objects and runnable scene evidence.",
      },
      {
        id: "camera-framing",
        label: "Camera framing and comfort",
        maxScore: 4,
        evidenceRequired: "The author can describe the camera view and comfort checks.",
      },
      {
        id: "accessibility-captions",
        label: "Accessibility captions",
        maxScore: 4,
        evidenceRequired: "The review includes text captions for status, camera, and scene objects.",
      },
    ],
    galleryItems,
  };
}

export function createRuntimeParityEvidence(input: {
  readonly camera: CameraWorkflowState["camera"];
  readonly project?: AliceProject | null;
  readonly statusText?: string;
  readonly webxrReport?: WebXRCapabilityReport | null;
  readonly keyboardMovementAvailable?: boolean;
  readonly reducedMotionRespected?: boolean;
  readonly webXRSessionState?: WebXRSessionEvidenceState;
  readonly webXRReferenceSpaceType?: string | null;
  readonly webXRInputSourceCount?: number;
  readonly locomotionMode?: WebXRLocomotionMode;
  readonly locomotionEvidenceCodes?: readonly WebXREvidenceCode[];
  readonly browserWebXRLocomotionObservation?: BrowserWebXRLocomotionObservation | null;
  readonly keyboardReviewAvailable?: boolean;
  readonly highContrastReviewAvailable?: boolean;
  readonly liveStudio?: LiveWorkshopStudioSession | null;
}): RuntimeParityEvidence {
  return {
    cameraVrComfort: createCameraVrComfortEvidence({
      camera: input.camera,
      webxrReport: input.webxrReport,
      keyboardMovementAvailable: input.keyboardMovementAvailable,
      reducedMotionRespected: input.reducedMotionRespected,
      webXRSessionState: input.webXRSessionState,
      webXRReferenceSpaceType: input.webXRReferenceSpaceType,
      webXRInputSourceCount: input.webXRInputSourceCount,
      locomotionMode: input.locomotionMode,
      locomotionEvidenceCodes: input.locomotionEvidenceCodes,
      browserWebXRLocomotionObservation: input.browserWebXRLocomotionObservation,
    }),
    accessibilityRescueCaptions: createAccessibilityRescueCaptionEvidence({
      camera: input.camera,
      project: input.project,
      statusText: input.statusText,
      keyboardReviewAvailable: input.keyboardReviewAvailable,
      highContrastReviewAvailable: input.highContrastReviewAvailable,
    }),
    galleryWalkRubric: createGalleryWalkRubricEvidence({
      project: input.project,
      liveStudio: input.liveStudio,
    }),
  };
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}
