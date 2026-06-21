---
title: Camera workflow usage
description: How to move the Alice camera, switch camera views, manage markers, and use first-person mode.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: how-to
---

# Camera workflow usage

The Alice camera workflow gives the browser UI, REST API, and TypeScript
runtime the same camera behavior. Use it to move the camera, switch between
standard views, save and restore camera markers, and enter first-person camera
mode when the current scene supports it.

## Contents

- [Browser controls](#browser-controls)
- [Movement controls](#movement-controls)
- [Camera views](#camera-views)
- [Camera markers](#camera-markers)
- [First-person mode](#first-person-mode)
- [Use the camera API from curl](#use-the-camera-api-from-curl)
- [Use the workflow from TypeScript](#use-the-workflow-from-typescript)
- [Browser test scenarios](#browser-test-scenarios)
- [Related docs](#related-docs)

## Browser controls

Open Alice in a browser and use the **Camera** panel beside the scene view. The
panel shows the active mode, position, target, field of view, selected preset,
and saved markers.

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build
npm run dev
```

The browser controls update the active camera immediately and render status text
after each action. The status text uses plain Alice wording, such as
`Camera moved forward`, `Camera view set to front`, or
`Camera marker "Intro view" restored`.

## Movement controls

Use the buttons in the **Move** group or the keyboard shortcuts while the scene
view or Camera panel is focused.

| Action | Button label | Keyboard | Behavior |
| --- | --- | --- | --- |
| Move forward | `Forward` | `W` | Moves along the camera forward axis |
| Move backward | `Back` | `S` | Moves opposite the camera forward axis |
| Move left | `Left` | `A` | Moves along the camera local left axis |
| Move right | `Right` | `D` | Moves along the camera local right axis |
| Move up | `Up` | `E` | Raises the camera on the Alice Y axis |
| Move down | `Down` | `Q` | Lowers the camera on the Alice Y axis |
| Pan left/right/up/down | `Pan` buttons | Arrow keys with `Shift` | Moves the camera view across the view plane |
| Orbit | `Orbit` buttons | Arrow keys | Rotates around the current target in orbit mode |
| Zoom in/out | `Zoom In`, `Zoom Out` | `+`, `-` | Changes distance to the current target |

Alice uses a right-handed, Y-up scene coordinate system. The workflow accepts
finite numeric deltas only. Invalid values are rejected before the camera state
changes.

## Camera views

The **View** selector applies standard Alice camera presets:

| Preset | Result |
| --- | --- |
| `home` | Restores the default Alice view |
| `front` | Looks at the scene from front view |
| `back` | Looks at the scene from back view |
| `left` | Looks at the scene from left view |
| `right` | Looks at the scene from right view |
| `top` | Looks down at the scene from above |
| `isometric` | Uses the default angled overview for authoring |

Changing a preset updates the camera position and target but keeps the current
marker list. The UI announces the selected view in the Camera status region.
Manual movement, pan, orbit, focus, first-person turning, or zoom clears
`activePreset` to `null` until another preset or marker snapshot is applied.

## Camera markers

Camera markers are named snapshots of the current camera state. Use them for
lesson setup, scene authoring, and repeatable tests.

1. Move the camera to the view you want.
2. Enter a marker name, such as `Intro view`.
3. Select **Save Marker**.
4. Select **Restore** on the marker row to return to that view.
5. Select **Delete** when the marker is no longer needed.

Marker names are displayed as text, not HTML. Marker IDs are opaque values
created by Alice and must not be parsed by callers. Marker rows include the
full saved camera snapshot so API clients can inspect mode, position, target,
field of view, and preset without restoring the marker.

## First-person mode

The **First Person** toggle switches the active camera from orbit authoring
behavior to first-person camera behavior.

In first-person mode:

- `W`, `A`, `S`, and `D` move from the camera's point of view.
- Arrow keys turn the camera by changing yaw and pitch.
- `Q` and `E` move down and up on the Alice Y axis.
- Zoom buttons change field of view instead of orbit distance.
- Saved markers include the first-person mode and restore it with the view.

Alice does not require pointer lock for first-person mode. Mouse-look may be
enabled by the browser UI when available, but keyboard operation remains the
stable behavior for tests and curriculum workflows.

## Use the camera API from curl

Start the local Alice server:

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Launch a default scene:

```bash
curl -X POST http://127.0.0.1:3000/api/launch \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Move the camera forward:

```bash
curl -X POST http://127.0.0.1:3000/api/camera/move \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"forward":2}'
```

Save a marker:

```bash
curl -X POST http://127.0.0.1:3000/api/camera/markers \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Intro view"}'
```

Switch to first-person mode:

```bash
curl -X POST http://127.0.0.1:3000/api/camera/mode \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"first-person"}'
```

See [Camera workflow API](./camera-workflow-api.md) for every endpoint, request
body, response body, and error response.

## Use the workflow from TypeScript

The public package exports the same workflow used by the browser and server.

```typescript
import {
  applyCameraPreset,
  createDefaultCameraWorkflowState,
  moveCamera,
  saveCameraMarker,
  setCameraMode,
} from "alice-web";

let cameraState = createDefaultCameraWorkflowState();

cameraState = applyCameraPreset(cameraState, "isometric");
cameraState = moveCamera(cameraState, { forward: 2, right: 1 });
cameraState = saveCameraMarker(cameraState, { name: "Authoring view" });
cameraState = setCameraMode(cameraState, "first-person");

console.log(cameraState.camera.mode);
console.log(cameraState.markers.map((marker) => marker.name));
```

Workflow helpers return a fresh camera state. Callers can store the returned
value without retaining mutable references to marker snapshots.

## Browser test scenarios

Browser-level tests should use stable labels and status text instead of pixel
assertions. A complete browser workflow test covers:

1. Open Alice and verify the Camera panel is visible.
2. Move the camera forward and assert the position/status changes.
3. Select the `front` preset and assert the selected view/status changes.
4. Save a marker named `Intro view`.
5. Move to a different view.
6. Restore `Intro view` and assert the restored state is visible.
7. Delete `Intro view` and assert it leaves the marker list.
8. Toggle first-person mode and assert the mode status changes.

Stable selectors used by tests:

| Selector | Purpose |
| --- | --- |
| `[data-testid="camera-panel"]` | Camera workflow panel |
| `[data-testid="camera-status"]` | Human-readable camera status |
| `[data-testid="camera-position"]` | Current position text |
| `[data-testid="camera-preset"]` | View preset selector |
| `[data-testid="camera-marker-name"]` | Marker name input |
| `[data-testid="camera-marker-list"]` | Saved marker list |
| `[data-testid="camera-first-person-toggle"]` | First-person mode toggle |

Tests should assert state through visible labels, status regions, and API
responses. Do not assert rendered pixels for camera workflow parity.

## Related docs

- [Camera workflow API](./camera-workflow-api.md)
- [Camera workflow configuration](./camera-workflow-configuration.md)
- [Tutorial: Camera workflow parity](./tutorial-camera-workflow.md)
- [Scene rendering](./scene-rendering.md)
- [Alice identity boundary](./alice-identity-boundary.md)
