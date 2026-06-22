---
title: "Alice evidence artifact API"
description: TypeScript and JSON contract for browser-created Alice runtime evidence artifacts.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Alice evidence artifact API

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
      "keyboardMovementAvailable": true,
      "reducedMotionRespected": true,
      "trueHeadsetVrSupported": false,
      "nativeVrSupported": false,
      "cameraMode": "orbit",
      "evidenceCodes": ["desktop-camera-fallback", "true-vr-unsupported"]
    },
    "accessibilityRescueCaptions": {
      "schema_version": "alice.accessibility-rescue-camera-captions/v1",
      "status": "partial",
      "ariaLiveCaption": "Loaded Program.",
      "cameraCaption": "Camera orbit view at 0.00, 1.60, 6.00.",
      "objectCaption": "Scene contains alice.",
      "keyboardReviewAvailable": true,
      "highContrastReviewAvailable": true
    },
    "galleryWalkRubric": {
      "schema_version": "alice.gallery-walk-rubric-evidence/v1",
      "status": "partial",
      "projectName": "Program",
      "galleryItemCount": 1,
      "reviewWorkflowSupported": true,
      "rubricRecordingSupported": true,
      "liveStudioSupported": false
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
  browserWebXrStatus: "supported" | "degraded" | "unsupported" | "unknown";
  desktopCameraAvailable: boolean;
  keyboardMovementAvailable: boolean;
  reducedMotionRespected: boolean;
  trueHeadsetVrSupported: false;
  nativeVrSupported: false;
  cameraMode: string;
  evidenceCodes: string[];
}

interface AliceAccessibilityCaptionsEvidence {
  schema_version: "alice.accessibility-rescue-camera-captions/v1";
  status: "partial";
  ariaLiveCaption: string;
  cameraCaption: string;
  objectCaption: string;
  keyboardReviewAvailable: boolean;
  highContrastReviewAvailable: boolean;
}

interface AliceGalleryReviewEvidence {
  schema_version: "alice.gallery-walk-rubric-evidence/v1";
  status: "partial";
  projectName: string;
  galleryItemCount: number;
  reviewWorkflowSupported: boolean;
  rubricRecordingSupported: boolean;
  liveStudioSupported: false;
}

interface AliceEvidenceRuntimeReview {
  cameraVrComfort?: AliceCameraVrComfortEvidence;
  accessibilityRescueCaptions?: AliceAccessibilityCaptionsEvidence;
  galleryWalkRubric?: AliceGalleryReviewEvidence;
}
```

These fields are deterministic and browser-safe. They record availability,
counts, fixed labels, selected gallery names, and review prompts. They do not
record camera frames, audio, raw user transcript text, tokens, local paths,
permission internals, cookies, or backend data.

## Validation rules

| Area | Rule |
| --- | --- |
| Identity | `application.name` is `Alice`; `application.runtime` is `alice-web` |
| Format | `format` is `alice-visible-behavior-evidence`; `version` is `1` |
| World | Name and Alice version are non-empty; object count is positive |
| Run | ID is non-empty; capture time parses as a timestamp |
| Visible behavior | Status, viewport, camera, and at least one object are required |
| Objects | Name, type name, visibility, and finite position values are required |
| Runtime review | Optional `runtimeReview` sections are objects when present |
| Camera/VR comfort | `runtimeReview.cameraVrComfort` records browser camera evidence; `trueHeadsetVrSupported` and `nativeVrSupported` are always `false` |
| Accessibility/captions | `runtimeReview.accessibilityRescueCaptions` records aria-live, camera, and scene-object captions plus keyboard/high-contrast review booleans |
| Gallery/review | `runtimeReview.galleryWalkRubric` records gallery item count, rubric support, and `liveStudioSupported: false` |
| Export | Method is `download` or `native-share`; filename is a safe `.json` name; MIME type is `application/json` |
| Size | Object evidence is bounded to 200 entries; rubric criteria and evidence lists are bounded by implementation constants |

The artifact does not include secrets, absolute paths, hostnames, environment
values, full project data, image bytes, screenshots, media bytes, raw user
transcripts, or `data:` URLs.

## Serialization

`serializeAliceEvidenceArtifact` emits deterministic pretty JSON with two-space
indentation and one trailing newline. This makes downloaded files easy to inspect
and stable in tests.

## Related docs

- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Alice evidence workflow configuration](./alice-evidence-workflow-configuration.md)
- [Tutorial: Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md)
- [Alice WebXR and camera comfort evidence](./webxr-vr.md)
