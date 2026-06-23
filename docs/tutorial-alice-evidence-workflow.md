---
title: "Tutorial: Capture and export Alice evidence"
description: Hands-on walkthrough for capturing visible Alice runtime evidence, exporting JSON, and checking artifact metadata.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: tutorial
---

# Tutorial: Capture and export Alice evidence

This walkthrough captures visible runtime evidence from an Alice world, exports a
JSON evidence artifact, and checks the camera/VR comfort, accessibility/caption,
and gallery/review metadata.

## 1. Start Alice

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build
npm run dev
```

Open the local URL printed by Vite, usually:

```text
http://127.0.0.1:5173
```

## 2. Open a world

Use the browser file control to open an `.a3p` Alice world. The scene view shows
the world canvas and the Alice controls.

## 3. Check camera and WebXR comfort evidence

Use the browser camera controls before capture:

1. Change the camera view.
2. Move the camera with the available keyboard or camera control.
3. Check the WebXR/camera comfort panel.

The page shows desktop camera fallback and comfort evidence even when WebXR or a
headset is unavailable. This is expected. The artifact keeps
`trueHeadsetVrSupported: false` and `nativeVrSupported: false`.

Alice does not start camera capture, microphone capture, WebXR, or headset
permissions during this check.

## 4. Check accessibility and caption evidence

Open the accessibility/captions panel and confirm the visible status text for:

- captions;
- transcript availability;
- ARIA/live-region evidence;
- keyboard reachability.

The exported artifact stores statuses and counts. It does not store raw user
transcript text.

## 5. Browse gallery and review evidence

Use the gallery/review panel:

1. Browse the visible gallery.
2. Select an item, such as `Alice`.
3. Read the rubric criteria.
4. Open the reflection prompt.
5. Confirm the review status is ready.

This proves the browser workflow for gallery browsing and review/reflection. It
does not exercise save/import/setup/class-sharing flows.

## 6. Capture visible behavior

Select **Capture visible behavior**. Alice shows a status message and a summary
with scene, camera/VR comfort, accessibility/caption, and gallery/review
evidence.

The capture is structured runtime evidence. It is not a video file and does not
use browser media APIs.

## 7. Export evidence

Select **Export evidence**. Alice validates the artifact and downloads a JSON
file such as:

```text
program-alice-evidence.json
```

## 8. Check metadata

Save the downloaded filename in a shell variable:

```bash
export ALICE_EVIDENCE_FILE="$HOME/Downloads/program-alice-evidence.json"
```

Print the key metadata:

```bash
node -e '
const fs = require("fs");
const artifact = JSON.parse(fs.readFileSync(process.env.ALICE_EVIDENCE_FILE, "utf8"));
console.log({
  application: artifact.application.name,
  runtime: artifact.application.runtime,
  format: artifact.format,
  version: artifact.version,
  worldName: artifact.world.name,
  aliceVersion: artifact.world.aliceVersion,
  runId: artifact.run.id,
  capturedAt: artifact.run.capturedAt,
  exportMethod: artifact.export.method,
  filename: artifact.export.filename,
  objectCount: artifact.world.objectCount,
  visibleObjects: artifact.visibleBehavior.objects.length,
  snapshotAvailable: artifact.visibleBehavior.viewport.canvasSnapshot.available,
  browserWebXrStatus: artifact.runtimeReview.cameraVrComfort.browserWebXrStatus,
  trueHeadsetVrSupported: artifact.runtimeReview.cameraVrComfort.trueHeadsetVrSupported,
  nativeVrSupported: artifact.runtimeReview.cameraVrComfort.nativeVrSupported,
  captions: artifact.runtimeReview.accessibilityRescueCaptions.status,
  ariaLiveCaption: artifact.runtimeReview.accessibilityRescueCaptions.ariaLiveCaption,
  staticGalleryReviewPrompts: artifact.runtimeReview.galleryWalkRubric.galleryItemCount,
  reviewStatus: artifact.runtimeReview.galleryWalkRubric.status,
  unsupported: {
    trueHeadsetVrSupported: artifact.runtimeReview.cameraVrComfort.trueHeadsetVrSupported,
    liveStudioSupported: artifact.runtimeReview.galleryWalkRubric.liveStudioSupported
  }
});
'
```

Expected output shape:

```json
{
  "application": "Alice",
  "runtime": "alice-web",
  "format": "alice-visible-behavior-evidence",
  "version": 1,
  "worldName": "Program",
  "aliceVersion": "3.10.0.0",
  "runId": "run-2026-06-22T05-19-37-228Z",
  "capturedAt": "2026-06-22T05:19:37.228Z",
  "exportMethod": "download",
  "filename": "program-alice-evidence.json",
  "objectCount": 2,
  "visibleObjects": 2,
  "snapshotAvailable": false,
  "browserWebXrStatus": "unsupported",
  "trueHeadsetVrSupported": false,
  "nativeVrSupported": false,
  "captions": "partial",
  "ariaLiveCaption": "Loaded Program.",
  "staticGalleryReviewPrompts": 1,
  "reviewStatus": "partial",
  "unsupported": {
    "trueHeadsetVrSupported": false,
    "liveStudioSupported": false
  }
}
```

The timestamp, run ID, world name, and object count vary by world. The identity,
format, version, unsupported capability values, export method, and JSON
structure stay consistent for valid Alice evidence.

## 9. Share when available

If **Share evidence** is available, select it to use the native browser share
prompt. If sharing is unavailable, export remains the supported path.

## Related docs

- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Alice evidence artifact API](./alice-evidence-artifact-api.md)
- [Alice evidence workflow configuration](./alice-evidence-workflow-configuration.md)
