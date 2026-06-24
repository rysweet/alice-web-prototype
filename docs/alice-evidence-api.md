---
title: Alice evidence API
description: Current TypeScript API for browser-created Alice runtime evidence artifacts.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Alice evidence API

Alice browser evidence files are JSON artifacts created from visible runtime
behavior. The helpers live in `src/alice-evidence-artifact.ts` and are exported
from the root API as `AliceEvidenceArtifact`.

```typescript
import { AliceEvidenceArtifact } from "./src/index.js";

const artifact = AliceEvidenceArtifact.createAliceEvidenceArtifact(input);
const json = AliceEvidenceArtifact.serializeAliceEvidenceArtifact(artifact);
const parsed = AliceEvidenceArtifact.parseAliceEvidenceArtifact(json);
const summary = AliceEvidenceArtifact.summarizeAliceEvidenceArtifact(parsed);
```

## Artifact identity

Every artifact has these exact identity fields:

| Field | Value |
| --- | --- |
| `format` | `alice-visible-behavior-evidence` |
| `version` | `1` |
| `application.name` | `Alice` |
| `application.runtime` | `alice-web` |

Callers do not pass application identity. `createAliceEvidenceArtifact()` sets
it so generated evidence remains Alice / `alice-web`.

## JSON shape

The artifact includes the base visible behavior fields plus three browser
runtime evidence groups:

| Field | Purpose |
| --- | --- |
| `visibleBehavior` | Scene status, viewport metadata, camera metadata, and bounded object summaries |
| `runtimeReview.cameraVrComfort` | WebXR fallback, camera movement, reduced-motion, keyboard movement, and explicit true headset/native VR unsupported evidence |
| `runtimeReview.accessibilityRescueCaptions` | ARIA/live-region, camera, scene-object, keyboard, and high-contrast caption review evidence |
| `runtimeReview.galleryWalkRubric` | Gallery item count, review prompts, rubric criteria, and explicit live-studio unsupported evidence |
| `export` | Download/native-share method, timestamp, filename, MIME type, and optional share metadata |

See [Alice evidence artifact API](./alice-evidence-artifact-api.md#json-shape)
for the complete JSON example.

Native sharing uses `export.method: "native-share"` and attaches
`export.share`. `export.share.artifactHash` is a SHA-256 digest of the canonical
serialized artifact before `export.share` is attached.

```json
{
  "available": true,
  "outcome": "prepared",
  "title": "Alice evidence for Program",
  "summary": "Alice alice-web evidence for Program: 1 capture, 2 objects.",
  "artifactHash": "sha256:0123456789abcdef...",
  "preparedAt": "2026-06-22T05:19:39.000Z"
}
```

## Helpers

| Helper | Behavior |
| --- | --- |
| `createAliceEvidenceArtifact(input)` | Normalizes input, sets Alice identity, bounds visible objects, and returns an artifact |
| `validateAliceEvidenceArtifact(value)` | Returns `{ valid, errors }` without throwing |
| `serializeAliceEvidenceArtifact(artifact)` | Validates and emits deterministic pretty JSON with a trailing newline |
| `parseAliceEvidenceArtifact(json)` | Parses JSON and throws `AliceEvidenceArtifactError` if invalid |
| `summarizeAliceEvidenceArtifact(artifact)` | Returns safe plain-text summary fields for UI or logs |
| `prepareAliceEvidenceShare(artifact, input?)` | Replaces stale share metadata, hashes the pre-share artifact, and validates the result |

## Validation rules

| Area | Rule |
| --- | --- |
| Identity | `application.name` is `Alice`; `application.runtime` is `alice-web` |
| Format | `format` is `alice-visible-behavior-evidence`; `version` is `1` |
| World | Name and Alice version are non-empty; object count is positive |
| Run | ID is non-empty; capture time parses as a timestamp |
| Visible behavior | Status, viewport, camera, and at least one object are required |
| Objects | Name, type name, visibility, and finite position values are required |
| Camera/VR comfort | Browser camera evidence is recorded; `trueHeadsetVrSupported` and `nativeVrSupported` are always `false` |
| Accessibility/captions | ARIA, camera, and scene-object caption evidence is explicit |
| Gallery/review | Gallery item, rubric, review status, and local live studio evidence are explicit |
| Export | Method is `download` or `native-share`; filename is a safe `.json` name; MIME type is `application/json` |
| Share | Outcome is `prepared`, `completed`, or `unavailable`; hash is `sha256:` plus 64 lowercase hex characters |

Artifacts do not include secrets, local absolute paths, full project bytes,
image bytes, screenshots, raw user transcripts, camera frames, audio, or `data:`
URLs. Browser code renders summaries with text APIs.

## Runtime review HTTP APIs

The local server also exposes bounded read-only review evidence:

| Endpoint | Evidence |
| --- | --- |
| `GET /api/vr/camera-comfort` | Browser camera comfort evidence; true headset/native VR remains `false` |
| `GET /api/accessibility/rescue-camera-captions` | ARIA/live, camera, and scene-object caption checks |
| `GET /api/review/gallery-walk-rubric` | Gallery items, review prompts, rubric criteria, and `liveStudioSupported: true` with synchronized studio evidence |
| `POST /api/workshops/live-studio/start` | Starts a server-authoritative facilitator live studio snapshot for the current project |
| `POST /api/workshops/live-studio/:id/participants` | Adds facilitator, participant, or observer roster entries and increments the sync revision |
| `POST /api/workshops/live-studio/:id/handoff` | Creates the live workshop handoff packet for the next facilitator |
| `POST /api/community/shares` | Validates a web package and records a teacher-community share in the local community platform store |
| `GET /api/review/runtime-parity` | Bundles all three sections |

## Related docs

- [Alice evidence export workflow](./alice-evidence-workflow.md)
- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Project IO usage guide](./project-io-usage.md)
