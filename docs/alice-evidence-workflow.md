---
title: Alice evidence export workflow
description: Browser capture, export, and share workflow for Alice runtime evidence.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: how-to
---

# Alice evidence export workflow

This document describes the Alice evidence export workflow in the browser UI.
The selectors below are the stable contract shared by `src/index.html`,
`src/main.ts`, tests, and documentation.

Evidence export records what Alice can state safely: product identity,
runtime identity, project and scene summaries, camera/WebXR comfort fallback,
accessibility/caption evidence, gallery/review evidence, explicit unsupported
boundaries, user-triggered capture entries, bounded metadata, validation status,
and share details. It must not include secrets, tokens, local absolute paths, raw
image payloads, raw transcript text, camera frames, audio, or large project
blobs.

## Contents

- [Quick start](#quick-start)
- [Browser workflow](#browser-workflow)
- [Browser UI contract](#browser-ui-contract)
- [Export an evidence file](#export-an-evidence-file)
- [Share evidence](#share-evidence)
- [Read the status and summary](#read-the-status-and-summary)
- [Use evidence with server workflows](#use-evidence-with-server-workflows)
- [Tutorial: capture evidence for a lesson check](#tutorial-capture-evidence-for-a-lesson-check)
- [Configuration](#configuration)
- [Safety rules](#safety-rules)
- [Related docs](#related-docs)

## Quick start

1. Open Alice in the browser.
2. Create or open a project.
3. Use **Capture evidence** after the scene reaches the state to record.
4. Review the evidence summary shown in the page.
5. Use **Export evidence** to download the JSON file, or **Share evidence** to
   share it through the browser when file sharing is available.

The exported JSON must always identify the application as Alice:

```json
{
  "application": {
    "name": "Alice",
    "runtime": "alice-web"
  }
}
```

## Browser workflow

The browser owns the user-facing capture, export, share, status, and summary
controls. Each control must be an explicit user action.

| Control | Required behavior |
| --- | --- |
| **Capture evidence** | Adds a bounded capture entry from the current Alice project and scene state |
| **Export evidence** | Validates the artifact and downloads it as JSON |
| **Share evidence** | Validates the artifact and asks the browser to share the JSON file |
| Evidence status | Shows `empty`, `ready`, `exported`, `shared`, `share-unavailable`, or `invalid` |
| Evidence summary | Shows a readable summary using safe text rendering |

Capture entries describe state, not private data. A capture can include scene
object counts, selected object names, camera summary, WebXR fallback status,
reduced-motion support, aria-live/camera/object captions, gallery item prompts,
rubric criteria, review status, lesson or workflow labels, validation
results, and short notes. It must not include raw image data, raw user
transcript text, request headers, tokens, file-system paths from the local
machine, or full `.a3p` project bytes.

## Browser UI contract

Alice exposes these stable selectors so browser code, tests, and docs share one
contract:

| Element | `id` | `data-testid` | Notes |
| --- | --- | --- | --- |
| Evidence panel | `evidence-panel` | `alice-evidence-panel` | Sidebar section with `aria-label="Alice evidence export"` |
| Capture button | `capture-evidence-button` | `alice-evidence-capture-button` | Enabled when a project or scene state can be summarized |
| Export button | `export-evidence-button` | `alice-evidence-export-button` | Disabled while status is `empty` or `invalid` |
| Share button | `share-evidence-button` | `alice-evidence-share-button` | Disabled when status is `empty`, `invalid`, or file sharing is unavailable |
| Status element | `evidence-status` | `alice-evidence-status` | Also sets `data-alice-evidence-status` to the current status |
| Summary element | `evidence-summary` | `alice-evidence-summary` | Uses `textContent` or equivalent safe text APIs |
| Capture list | `evidence-capture-list` | `alice-evidence-capture-list` | Optional visible list of bounded capture summaries |
| Camera/VR comfort panel | `camera-vr-comfort-panel` | `alice-camera-vr-comfort-panel` | Shows WebXR fallback, camera comfort, reduced-motion, keyboard movement, and true VR unsupported evidence |
| Camera/VR comfort status | `camera-vr-comfort-status` | `alice-camera-vr-comfort-status` | Text status for camera/WebXR comfort evidence |
| True VR unsupported text | `true-vr-unsupported` | `alice-true-vr-unsupported` | Explicitly states true headset/native VR is unsupported |

The panel stays in the existing sidebar next to the project export and sharing
controls. It does not depend on save/import/setup or class-sharing controls.

## Evidence areas

| Area | Required visible evidence | Required artifact evidence |
| --- | --- | --- |
| Camera and WebXR comfort | Camera mode/status, keyboard movement status, reduced-motion status, WebXR fallback status, true VR unsupported text | `runtimeReview.cameraVrComfort.browserWebXrStatus`, `desktopCameraAvailable`, `keyboardMovementAvailable`, `reducedMotionRespected`, `trueHeadsetVrSupported: false`, `nativeVrSupported: false` |
| Accessibility and captions | Evidence artifact and `/api/accessibility/rescue-camera-captions` expose ARIA/live, camera, scene-object, keyboard, and high-contrast caption checks | `runtimeReview.accessibilityRescueCaptions` |
| Gallery and review | Evidence artifact and `/api/review/gallery-walk-rubric` expose gallery items, review prompts, rubric criteria, and live-studio unsupported status | `runtimeReview.galleryWalkRubric` |
| Unsupported boundaries | Explicit unsupported statements | `runtimeReview.cameraVrComfort.trueHeadsetVrSupported: false`, `runtimeReview.galleryWalkRubric.liveStudioSupported: false` |

## Export an evidence file

Use **Export evidence** when a file needs to be attached to a report, test run,
or curriculum review.

Alice validates the current artifact before writing the file. If validation
fails, the page shows the validation error and does not download a file. If the
artifact is valid, Alice downloads a JSON file named with the evidence id, for
example:

```text
alice-evidence-2026-06-22T05-58-59Z.json
```

The browser creates the download with an object URL and revokes that URL after
the download is queued.

## Share evidence

Use **Share evidence** when the browser supports sharing files. Alice validates
the artifact first, prepares share metadata, creates a JSON file, and passes
that file to the browser share sheet.

When file sharing is not available, Alice renders status `share-unavailable`,
keeps **Export evidence** available for valid artifacts, and
avoid sending the artifact anywhere. The artifact is not sent without a user
action.

Share metadata is part of the shared artifact. It records the share title, a
short summary, the artifact hash, and the time the share file was prepared. It
does not record the destination selected by the user.

`export.share.artifactHash` covers the canonical serialized artifact before the
`export.share` field is attached. Verifiers recompute the hash by removing `export.share`,
serializing the pre-share artifact canonically, and hashing that content.

## Read the status and summary

The page keeps a concise status next to the controls:

| Status | Meaning |
| --- | --- |
| `empty` | No capture has been created, so no valid artifact exists yet |
| `ready` | The artifact has at least one capture, validates, and can be exported |
| `exported` | A JSON evidence file was prepared for download |
| `shared` | A JSON evidence file was handed to the browser share sheet |
| `share-unavailable` | The artifact is valid, but this browser cannot share files |
| `invalid` | Validation failed and the page shows the reason |

`ready` must never mean "empty but available." A valid evidence artifact
requires at least one capture. The `empty` state is a browser UI state before a
valid artifact exists.

The summary uses normal text nodes instead of raw HTML. It can show the project
name, capture count, last capture label, scene object count, validation status,
and artifact id.

## Use evidence with server workflows

Browser evidence export is separate from server proof artifacts.

Server workflows continue to write proof files through the configured evidence
directory. Browser export creates a user-triggered JSON download in the page and
does not write into the server evidence directory by itself.

Start the local server with an evidence directory when server-side proof files
are needed:

```bash
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"

npm run serve -- \
  --port 3000 \
  --evidence-dir ./evidence \
  --api-token "$ALICE_LOCAL_API_TOKEN"
```

Create a starter project through the local API:

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"templateId":"snow","projectName":"SnowEvidence"}'
```

Then open the browser page, capture evidence, and export the JSON file from the
page.

## Tutorial: capture evidence for a lesson check

This tutorial describes the intended workflow for recording a small evidence
file for a scene-editing lesson.

### 1. Prepare the project

Open Alice and create a project named `SnowEvidence`.

Add or edit the scene until it has the state the lesson needs. For example, add
a snow person model, move the camera, or update a procedure.

### 2. Capture evidence

Select **Capture evidence**.

Alice adds an entry similar to this:

```json
{
  "kind": "scene-summary",
  "label": "SnowEvidence scene check",
  "projectName": "SnowEvidence",
  "sceneObjectCount": 4,
  "selectedObjectName": "snowPerson",
  "notes": "Scene contains the expected learner-created object."
}
```

The exact object count and selected object name depend on the current scene.

### 3. Review the summary

Confirm that the summary names Alice, shows `alice-web` as the runtime, includes
the project name, and lists one capture. Status is `ready` after the artifact
validates.

### 4. Export the file

Select **Export evidence**.

Alice downloads a JSON file. Attach that file to the lesson check or test run.

### 5. Share the file when needed

Select **Share evidence** only when you want the browser to open the share
sheet. If sharing files is not supported, status becomes `share-unavailable`;
use the exported JSON file instead.

## Configuration

Browser evidence export has no required environment variable and no feature
flag. It uses the current browser page state and the public evidence artifact
helpers documented in [Alice evidence API](./alice-evidence-api.md).

Server proof files use the existing `--evidence-dir` option:

| Setting | Applies to | Description |
| --- | --- | --- |
| `--evidence-dir <dir>` | Server proof files | Directory for server-written JSON proof files, generated `.a3p` files, screenshots, and export metadata |
| `X-Alice-Local-Api-Token` | Mutating local API calls | Header containing the local API token |
| `ALICE_LOCAL_API_TOKEN` | Shell examples | Environment variable used to pass the local API token into examples |

Local validation commands use the repository heap setting:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
```

## Safety rules

Evidence export keeps the artifact small and reviewable:

- metadata is explicit and bounded;
- raw image data is not stored in JSON;
- raw user transcript text is not stored in JSON;
- camera frames and audio are not stored in JSON;
- local absolute file paths are not stored;
- request headers and tokens are not stored;
- project bytes are not embedded;
- true headset/native VR and workshop live studio remain unsupported unless real
  runtime support and browser evidence are added in a separate feature;
- generated summaries are rendered as text;
- export and share require user action.

## Related docs

- [Alice evidence API](./alice-evidence-api.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Project IO usage guide](./project-io-usage.md)
- [API reference](./api-reference.md)
