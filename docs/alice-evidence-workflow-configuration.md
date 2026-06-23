---
title: "Alice evidence workflow configuration"
description: Configuration defaults and operational rules for browser-created Alice runtime evidence files.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Alice evidence workflow configuration

The Alice evidence workflow runs in the browser. It does not require server
storage, uploads, authentication changes, telemetry, database configuration,
camera capture, microphone capture, or headset hardware.

## Required setup

Use the existing project scripts:

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build
npm run dev
```

## Browser defaults

| Setting | Value |
| --- | --- |
| Evidence panel | Alice browser sidebar |
| Required user action | Capture, export, and share each require a button selection |
| Stable export path | JSON download |
| Optional share path | Native browser file sharing |
| Camera/VR evidence | Browser-rendered WebXR fallback and camera comfort status |
| True headset/native VR | Unsupported and exported as `trueHeadsetVrSupported: false` |
| Workshop live studio | Unsupported and exported as `liveStudioSupported: false` |
| Accessibility/caption evidence | Runtime-review ARIA/live, camera, scene-object, keyboard, and high-contrast caption evidence |
| Gallery/review evidence | Runtime-review gallery item, rubric, prompt, and live-studio unsupported evidence |
| MIME type | `application/json` |
| File extension | `.json` |
| Max filename length | 120 characters |
| Object evidence limit | 200 objects |
| Blob URL lifecycle | Revoked after download starts |

World names, object names, run IDs, timestamps, and filenames are treated as
user-controlled text and rendered with text content.

## Captured data limits

Alice captures bounded visible-scene evidence:

| Evidence area | Captured |
| --- | --- |
| World | Name, Alice version, object count |
| Run | Generated run ID and capture timestamp |
| Viewport | Width, height, snapshot availability metadata |
| Camera | Mode, position, target |
| Objects | Name, type name, visibility, position |
| Camera/VR comfort | WebXR status, keyboard camera movement availability, reduced-motion support, unsupported true headset/native VR |
| Accessibility/captions | ARIA/live caption, camera caption, scene-object caption, keyboard review, high-contrast review |
| Gallery/review | Gallery item count, review prompts, rubric criteria, live-studio unsupported status |

Alice does not capture secrets, environment values, absolute paths, hostnames,
dependency versions, full project dumps, screenshots, image bytes, camera frames,
audio, raw user transcript text, permission internals, cookies, tokens, or media
files.

## Browser capability defaults

Alice uses safe defaults when browser capability information is missing:

| Capability | Default evidence |
| --- | --- |
| No browser WebXR report is available to the server route | `runtimeReview.cameraVrComfort.browserWebXrStatus: "unknown"` and visible desktop camera fallback |
| Browser WebXR detection runs and finds `navigator.xr` missing or unsupported | `runtimeReview.cameraVrComfort.browserWebXrStatus: "unsupported"` and visible desktop camera fallback |
| Reduced-motion media query unavailable | `reducedMotionRespected: true` when Alice avoids motion-heavy auto-start behavior |
| Keyboard camera controls unavailable | `keyboardMovementAvailable: false` with visible status text |
| Captions unavailable | `runtimeReview.accessibilityRescueCaptions.status: "partial"` with visible caption text |
| Gallery has no selectable item | `runtimeReview.galleryWalkRubric.galleryItemCount: 1` starter review prompt |

The runtime must not ask for camera, microphone, or VR permissions on page load.
WebXR/camera evidence is collected from visible UI state and explicit user
actions only.

## Stable selector contract

Executable browser tests and EatMe scenario evidence use stable selectors:

| Selector | Purpose |
| --- | --- |
| `[data-testid="alice-evidence-panel"]` | Overall evidence workflow |
| `[data-testid="alice-camera-vr-comfort-panel"]` | Camera/WebXR comfort and fallback evidence |
| `[data-testid="alice-evidence-export-button"]` | Validated JSON download |
| `[data-testid="alice-evidence-summary"]` | Text-rendered evidence summary |

Do not rename these selectors without updating browser-contract tests and
scenario documentation in the same change.

## Validation commands

Use the configured project validation with the saved Node memory preference:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm run build
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run test:gadugi
NODE_OPTIONS=--max-old-space-size=32768 npm run test:e2e
NODE_OPTIONS=--max-old-space-size=32768 npm run test:coverage
```

If a pre-commit configuration file is present, run `pre-commit run --all-files`
before handoff.

## Related docs

- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Alice evidence artifact API](./alice-evidence-artifact-api.md)
- [Tutorial: Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md)
