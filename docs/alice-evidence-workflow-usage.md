---
title: "Alice evidence workflow usage"
description: Browser workflow for capturing visible Alice camera/VR comfort, accessibility/caption, and static gallery/rubric review evidence.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: how-to
---

# Alice evidence workflow usage

Alice captures browser-visible runtime evidence into a deterministic JSON
artifact. The evidence covers what the page renders and exposes to browser tests:
scene state, camera/WebXR comfort fallback, accessibility and captions, and
static gallery/rubric review prompts.

Evidence export is not media capture, telemetry, classroom sharing, or a claim of
native VR parity. True headset/native VR and workshop live studio remain
unsupported and are reported explicitly in the artifact.

## Browser flow

1. Open an Alice world in the browser.
2. Use the camera controls and WebXR fallback status until the visible state is
   ready to prove. Accessibility captions and static gallery/rubric review evidence are
   also available through the runtime review artifact and local HTTP APIs.
3. Select **Capture visible behavior**.
4. Review the evidence status, summary, and capture list.
5. Select **Export evidence** to download the JSON artifact.

The browser validates the artifact before export. If validation fails, Alice
shows an evidence status message and does not create a success-shaped file.

## Runtime evidence sections

The evidence workflow summarizes three browser-facing evidence sections.

| Section | What the user sees or API returns | What the artifact records |
| --- | --- | --- |
| Camera and WebXR comfort | Camera mode, keyboard movement availability, reduced-motion status, WebXR fallback status, and unsupported true VR text | `runtimeReview.cameraVrComfort` with fallback, comfort, keyboard, reduced-motion, and unsupported headset/native VR fields |
| Accessibility and captions | `/api/accessibility/rescue-camera-captions` returns ARIA/live, camera, scene-object, keyboard, and high-contrast caption checks | `runtimeReview.accessibilityRescueCaptions` with bounded text evidence, not raw user transcript text |
| Gallery and review | `/api/review/gallery-walk-rubric` returns gallery items, review prompts, rubric criteria, and live-studio unsupported status | `runtimeReview.galleryWalkRubric` with bounded gallery and review metadata |

All panel text is rendered through text APIs. Alice does not render evidence
summaries with raw HTML.

## Evidence file contents

The exported JSON includes:

| Area | Fields |
| --- | --- |
| Identity | `application.name: "Alice"`, `application.runtime: "alice-web"` |
| Format | `format: "alice-visible-behavior-evidence"`, `version: 1` |
| World | World name, Alice version, object count |
| Run | Run ID and capture timestamp |
| Visible behavior | Status text, viewport metadata, camera metadata, bounded object summaries |
| Camera/VR comfort | WebXR fallback status, camera movement evidence, reduced-motion evidence, `trueHeadsetVrSupported: false`, `nativeVrSupported: false` |
| Accessibility/captions | ARIA/live caption, camera caption, scene-object caption, keyboard/high-contrast review evidence |
| Gallery/review | Gallery item count, review prompts, rubric criteria, live-studio unsupported status |
| Export | Download/native-share method, timestamp, filename, MIME type |

Generated capture evidence is metadata only and does not intentionally embed
screenshots, image bytes, media files, raw user transcripts, local paths,
tokens, or `data:` URLs. Caller-supplied allowed strings are trimmed and
length-bounded, but are not content-filtered; callers must not put secrets,
paths, tokens, hostnames, or transcripts in them.

## Export

Select **Export evidence** after capture. Alice downloads a safe `.json` file
with Alice identity in the filename, for example:

```text
program-alice-evidence.json
```

Filenames are normalized to lowercase letters, numbers, dots, and hyphens, then
bounded to 120 characters.

## Share

Select **Share evidence** after capture when native sharing is available. Alice
creates a validated JSON file and passes it to the browser share prompt. If the
browser cannot share files, Alice keeps export available and shows a status
message.

Sharing does not upload the file to an Alice server or third-party service.

## Stable browser selectors

| Selector | Purpose |
| --- | --- |
| `[data-testid="alice-evidence-panel"]` | Evidence workflow panel |
| `[data-testid="alice-evidence-status"]` | Evidence status text |
| `[data-testid="alice-evidence-capture-button"]` | Captures visible behavior |
| `[data-testid="alice-evidence-export-button"]` | Downloads the evidence JSON file |
| `[data-testid="alice-evidence-share-button"]` | Uses native browser sharing when available |
| `[data-testid="alice-evidence-summary"]` | Shows captured/exported object details |
| `[data-testid="alice-camera-vr-comfort-panel"]` | Camera/WebXR comfort and fallback evidence |
| `[data-testid="alice-camera-vr-comfort-status"]` | Visible comfort status |
| `[data-testid="alice-camera-keyboard-movement"]` | Keyboard/camera movement evidence |
| `[data-testid="alice-camera-reduced-motion"]` | Reduced-motion evidence |
| `[data-testid="alice-true-vr-unsupported"]` | Explicit true headset/native VR unsupported statement |

Tests and external scenario runners assert these selectors and text content, not
browser-specific permission prompt wording.

## Unsupported capabilities

Alice reports unsupported capabilities explicitly:

| Capability | Artifact field | Required value | Rationale |
| --- | --- | --- | --- |
| True headset/native VR | `runtimeReview.cameraVrComfort.trueHeadsetVrSupported` | `false` | The browser evidence proves WebXR/camera comfort and fallback behavior, not native headset parity |
| Workshop live studio | `runtimeReview.galleryWalkRubric.liveStudioSupported` | `true` | The runtime evidence workflow exposes local synchronized facilitator studio, roster orchestration, and handoff evidence |

Unsupported fields are part of the successful artifact. They prevent parity
matrices from treating browser fallback evidence as true VR or live studio
support.

## Related docs

- [Alice evidence artifact API](./alice-evidence-artifact-api.md)
- [Alice evidence workflow configuration](./alice-evidence-workflow-configuration.md)
- [Tutorial: Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md)
- [Alice WebXR and camera comfort evidence](./webxr-vr.md)
