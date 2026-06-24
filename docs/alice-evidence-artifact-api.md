---
title: "Alice evidence artifact API"
description: TypeScript and JSON contract for browser-created Alice runtime evidence artifacts.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Alice evidence artifact API

LookingGlass is the repository/project nickname for this Alice web codebase.
The runtime, API, package metadata, and generated evidence artifacts use Alice /
`alice-web` identity.

Alice browser evidence files are JSON artifacts created from visible runtime
behavior. They are designed for browser export, Playwright/E2E verification, and
EatMe parity evidence. They are not screenshots, videos, telemetry events, or
tamper-proof attestations.

## TypeScript module

The pure browser-safe helpers live in `src/alice-evidence-artifact.ts` and are
also exported from the root Alice API as `AliceEvidenceArtifact`.

```typescript
import { AliceEvidenceArtifact } from "alice-web";

const artifact = AliceEvidenceArtifact.createAliceEvidenceArtifact(input);
const json = AliceEvidenceArtifact.serializeAliceEvidenceArtifact(artifact);
const parsed = AliceEvidenceArtifact.parseAliceEvidenceArtifact(json);
const result = AliceEvidenceArtifact.validateAliceEvidenceArtifact(parsed);
const summary = AliceEvidenceArtifact.summarizeAliceEvidenceArtifact(parsed);
```

`validateAliceEvidenceArtifact` returns `{ valid: boolean; errors: string[] }`.
Callers check `valid` before exporting or trusting metadata.

## JSON shape

```json
{
  "format": "alice-visible-behavior-evidence",
  "version": 1,
  "application": {
    "name": "Alice",
    "runtime": "alice-web"
  },
  "world": {
    "name": "Program",
    "aliceVersion": "3.10.0.0",
    "objectCount": 2
  },
  "run": {
    "id": "run-2026-06-22T05-19-37-228Z",
    "capturedAt": "2026-06-22T05:19:37.228Z"
  },
  "visibleBehavior": {
    "statusText": "Loaded \"Program\" (v3.10.0.0) - 2 objects.",
    "viewport": {
      "width": 1280,
      "height": 720,
      "canvasSnapshot": {
        "available": false,
        "reason": "structured-scene-metadata",
        "width": 1280,
        "height": 720,
        "mimeType": "image/png"
      }
    },
    "camera": {
      "mode": "orbit",
      "position": { "x": 0, "y": 1.6, "z": 6 },
      "target": { "x": 0, "y": 1, "z": 0 }
    },
    "objects": [
      {
        "name": "alice",
        "typeName": "org.lgna.story.SBiped",
        "visible": true,
        "position": { "x": 0, "y": 0, "z": 0 }
      }
    ]
  },
  "runtimeReview": {
    "cameraVrComfort": {
      "schema_version": "alice.camera-vr-comfort-evidence/v1",
      "status": "partial",
      "browserWebXrStatus": "unsupported",
      "desktopCameraAvailable": true,
      "keyboardMovementAvailable": "unknown",
      "reducedMotionRespected": "unknown",
      "trueHeadsetVrSupported": false,
      "nativeVrSupported": false,
      "cameraMode": "orbit",
      "evidenceCodes": ["desktop-camera-fallback", "true-vr-unsupported"],
      "browserWebXrSession": {
        "sessionState": "not-started",
        "referenceSpaceType": "unknown",
        "inputSourceCount": 1,
        "locomotionMode": "combined",
        "locomotionEvidenceCodes": [],
        "locomotionObserved": true,
        "locomotionResult": "movement",
        "locomotionDeltaMeters": { "x": 0.75, "y": 0, "z": -1.5 },
        "locomotionEvidenceSource": "browser-webxr-locomotion-api",
        "headsetSessionObserved": false,
        "nativeVrObserved": false
      },
      "comfortChecks": {
        "discreteMovementStep": true,
        "stableHorizon": true,
        "noForcedHeadset": true
      },
      "unsupportedReason": "Alice records browser WebXR and desktop camera comfort evidence only; true headset/native VR remains unsupported."
    },
    "accessibilityRescueCaptions": {
      "schema_version": "alice.accessibility-rescue-camera-captions/v1",
      "status": "partial",
      "ariaLiveCaption": "Loaded Program.",
      "cameraCaption": "Camera orbit view at 0.00, 1.60, 6.00.",
      "objectCaption": "Scene contains alice.",
      "keyboardReviewAvailable": "unknown",
      "highContrastReviewAvailable": "unknown",
      "captionChecks": [
        {
          "id": "aria-live-status",
          "present": true,
          "channel": "aria-live",
          "text": "Loaded Program."
        },
        {
          "id": "camera-caption",
          "present": true,
          "channel": "visible-text",
          "text": "Camera orbit view at 0.00, 1.60, 6.00."
        }
      ]
    },
    "galleryWalkRubric": {
      "schema_version": "alice.gallery-walk-rubric-evidence/v1",
      "status": "partial",
      "projectName": "Program",
      "galleryItemCount": 1,
      "reviewWorkflowSupported": false,
      "rubricRecordingSupported": false,
      "liveStudioSupported": true,
      "unsupportedLiveStudioReason": "Alice provides web gallery review and rubric evidence, not a synchronized live workshop studio.",
      "rubric": [
        {
          "id": "visible-world",
          "label": "Visible world evidence",
          "maxScore": 4,
          "evidenceRequired": "The project has visible Alice objects and runnable scene evidence."
        }
      ],
      "galleryItems": [
        {
          "id": "scene-object-1",
          "title": "alice",
          "reviewPrompt": "Review how alice supports the story, game goal, or scene composition."
        }
      ]
    }
  },
  "export": {
    "method": "download",
    "requestedAt": "2026-06-22T05:19:38.000Z",
    "filename": "program-alice-evidence.json",
    "mimeType": "application/json"
  }
}
```

Native sharing uses the same core shape with `export.method: "native-share"` and
`export.share`:

```json
{
  "available": true,
  "outcome": "prepared",
  "title": "Alice evidence for Program",
  "summary": "Alice alice-web evidence for Program: 1 capture, 2 objects.",
  "artifactHash": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "preparedAt": "2026-06-22T05:19:39.000Z"
}
```

Share outcomes are `prepared`, `completed`, or `unavailable`.

## TypeScript field contracts

```typescript
interface AliceCameraVrComfortEvidence {
  schema_version: "alice.camera-vr-comfort-evidence/v1";
  status: "partial";
  browserWebXrStatus?: "supported" | "degraded" | "unsupported" | "unknown";
  desktopCameraAvailable?: boolean;
  keyboardMovementAvailable?: boolean | "unknown";
  reducedMotionRespected?: boolean | "unknown";
  trueHeadsetVrSupported: false;
  nativeVrSupported: false;
  cameraMode?: string;
  evidenceCodes?: string[];
  browserWebXrSession?: {
    sessionState?: "idle" | "unsupported" | "starting" | "active" | "ended" | "failed" | "not-started" | "unmeasured";
    referenceSpaceType?: string | "unknown";
    inputSourceCount?: number | "unknown";
    locomotionMode?: string | "unknown";
    locomotionEvidenceCodes?: string[];
    locomotionObserved?: boolean;
    locomotionResult?: "none" | "movement" | "not-observed";
    locomotionDeltaMeters?: { x: number; y: number; z: number } | null;
    locomotionEvidenceSource?: "browser-webxr-locomotion-api" | "not-observed";
    headsetSessionObserved?: false;
    nativeVrObserved?: false;
  };
  comfortChecks?: {
    discreteMovementStep?: boolean;
    stableHorizon?: boolean;
    noForcedHeadset?: boolean;
  };
  unsupportedReason?: string;
}

interface AliceAccessibilityCaptionsEvidence {
  schema_version: "alice.accessibility-rescue-camera-captions/v1";
  status: "partial";
  ariaLiveCaption?: string;
  cameraCaption?: string;
  objectCaption?: string;
  keyboardReviewAvailable?: boolean | "unknown";
  highContrastReviewAvailable?: boolean | "unknown";
  captionChecks?: {
    id: string;
    present: boolean;
    channel?: "aria-live" | "visible-text";
    text?: string;
  }[];
}

interface AliceGalleryReviewEvidence {
  schema_version: "alice.gallery-walk-rubric-evidence/v1";
  status: "partial";
  projectName?: string;
  galleryItemCount?: number;
  reviewWorkflowSupported?: false;
  rubricRecordingSupported?: false;
  liveStudioSupported: boolean;
  liveStudio?: {
    supported?: boolean;
    synchronizationSupported?: boolean;
    participantOrchestrationSupported?: boolean;
    handoffSupported?: boolean;
    activeSessionId?: string | null;
    stage?: string;
    participantCount?: number;
    syncRevision?: number;
    handoffReady?: boolean;
  };
  unsupportedLiveStudioReason?: string;
  rubric?: {
    id: string;
    label: string;
    maxScore: number;
    evidenceRequired: string;
  }[];
  galleryItems?: {
    id: string;
    title: string;
    reviewPrompt: string;
  }[];
}

interface AliceEvidenceRuntimeReview {
  cameraVrComfort?: AliceCameraVrComfortEvidence;
  accessibilityRescueCaptions?: AliceAccessibilityCaptionsEvidence;
  galleryWalkRubric?: AliceGalleryReviewEvidence;
}
```

These fields are deterministic and browser-safe. Runtime review sections are
optional and bounded: parse helpers sanitize undocumented runtime review fields,
raw validation rejects them, known arrays are capped by implementation
constants, and runtime review strings are trimmed and length-bounded. Runtime
review strings are contract fields supplied by the caller; callers must not put
camera frames, audio, raw user transcript text, tokens, local paths, permission
internals, cookies, or backend data in those fields.

## Validation rules

| Area | Rule |
| --- | --- |
| Identity | `application.name` is `Alice`; `application.runtime` is `alice-web` |
| Format | `format` is `alice-visible-behavior-evidence`; `version` is `1` |
| World | Name and Alice version are non-empty; object count is positive |
| Run | ID is non-empty; capture time parses as a timestamp |
| Visible behavior | Status, viewport, camera, and at least one object are required |
| Objects | Name, type name, visibility, and finite position values are required |
| Runtime review | Optional `runtimeReview` sections are sanitized to documented fields when present |
| Camera/VR comfort | `runtimeReview.cameraVrComfort` records browser camera evidence; `trueHeadsetVrSupported` and `nativeVrSupported` are always `false` |
| Accessibility/captions | `runtimeReview.accessibilityRescueCaptions` records aria-live, camera, and scene-object captions plus keyboard/high-contrast review booleans |
| Gallery/review | `runtimeReview.galleryWalkRubric` records gallery item count, rubric support, and local live studio synchronization/handoff evidence |
| Export | Method is `download` or `native-share`; filename is a safe `.json` name; MIME type is `application/json` |
| Size | Object evidence is bounded to 200 entries; rubric criteria and evidence lists are bounded by implementation constants |

Generated Alice runtime evidence does not intentionally include secrets,
absolute paths, hostnames, environment values, full project data, image bytes,
screenshots, media bytes, raw user transcripts, or `data:` URLs. Caller-supplied
allowed string fields are trimmed and structurally bounded, but are not
content-filtered; callers must not place secrets, paths, tokens, hostnames, or
transcripts in them.

## Serialization

`serializeAliceEvidenceArtifact` emits deterministic pretty JSON with two-space
indentation and one trailing newline. This makes downloaded files easy to inspect
and stable in tests.

## Related docs

- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Alice evidence workflow configuration](./alice-evidence-workflow-configuration.md)
- [Tutorial: Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md)
- [Alice WebXR and camera comfort evidence](./webxr-vr.md)
