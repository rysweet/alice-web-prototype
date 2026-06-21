---
title: Camera workflow API
description: REST and TypeScript reference for Alice camera movement, views, markers, and first-person mode.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: reference
---

# Camera workflow API

The camera workflow API is the contract shared by the Alice browser, local REST
server, and public TypeScript exports. It centralizes camera state, movement
math, presets, marker lifecycle, mode transitions, validation, and deep-copy
behavior.

## Contents

- [State model](#state-model)
- [Validation rules](#validation-rules)
- [REST authentication](#rest-authentication)
- [Endpoint summary](#endpoint-summary)
- [REST endpoints](#rest-endpoints)
- [TypeScript exports](#typescript-exports)
- [Implementation boundary](#implementation-boundary)
- [Error responses](#error-responses)
- [Related docs](#related-docs)

## State model

Every successful camera endpoint returns the current state in this envelope:

```json
{
  "schema_version": "eatme.alice-camera-workflow-state/v1",
  "status": "ok",
  "operation": "move",
  "camera": {
    "mode": "orbit",
    "position": { "x": 0, "y": 5, "z": 18 },
    "target": { "x": 0, "y": 1, "z": -2 },
    "up": { "x": 0, "y": 1, "z": 0 },
    "yawDegrees": 0,
    "pitchDegrees": -12.5,
    "rollDegrees": 0,
    "fieldOfViewDegrees": 60,
    "activePreset": null
  },
  "markers": [],
  "activeMarkerId": null
}
```

### Types

```typescript
type CameraMode = "orbit" | "first-person";

type CameraPreset =
  | "home"
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "isometric";

interface CameraVector3 {
  x: number;
  y: number;
  z: number;
}

interface CameraSnapshot {
  mode: CameraMode;
  position: CameraVector3;
  target: CameraVector3;
  up: CameraVector3;
  yawDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  fieldOfViewDegrees: number;
  activePreset: CameraPreset | null;
}

interface CameraMarker {
  id: string;
  name: string;
  camera: CameraSnapshot;
  createdAt: string;
}

interface CameraWorkflowState {
  camera: CameraSnapshot;
  markers: CameraMarker[];
  activeMarkerId: string | null;
}
```

Marker snapshots are deep copies. Mutating the active camera after saving a
marker does not mutate the marker. Restoring a marker copies the snapshot into
the active camera instead of reusing marker object references.

`activePreset` is the preset that exactly matches the active camera snapshot.
Applying a preset sets it to the preset name. Manual movement, pan, orbit,
focus, first-person turning, and zoom clear it to `null` because the camera no
longer exactly matches a preset. Saving a marker copies the current
`activePreset`; restoring a marker restores the copied value.

## Validation rules

The workflow rejects invalid input before changing state.

| Input | Rule |
| --- | --- |
| Coordinates and deltas | Must be finite numbers |
| `fieldOfViewDegrees` | Must be finite and within `1` through `179` |
| Preset names | Must be one of the `CameraPreset` values |
| Mode names | Must be `orbit` or `first-person` |
| Marker names | Trimmed, non-empty, and at most 80 characters |
| Marker IDs | Opaque strings returned by Alice |
| Request bodies | Must be JSON objects for mutating routes |

Routes return `400` with a structured JSON error when validation fails.

The planned workflow clamps `pitchDegrees` to `-89` through `89` degrees to
avoid inverted views. Orbit and orbit zoom keep the distance from `position` to
`target` at or above `0.1` Alice scene units.

## REST authentication

All `/api/camera/*` routes require the local Alice API token when the server was
started with `--api-token`, including read routes.

```bash
curl http://127.0.0.1:3000/api/camera/state \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

Missing or incorrect tokens return:

```json
{ "error": "Missing or invalid local API token" }
```

The token is never returned in a camera response or evidence artifact.

Implementation requirement: install a camera-route auth guard before every
camera handler. Do not rely only on the generic unsafe-method middleware,
because `GET /api/camera/state` and `GET /api/camera/markers` are protected
reads.

## Endpoint summary

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/camera/state` | Read the active camera workflow state |
| `POST` | `/api/camera/move` | Move along camera-local axes |
| `POST` | `/api/camera/pan` | Pan across the current view plane |
| `POST` | `/api/camera/zoom` | Zoom the orbit view or first-person field of view |
| `POST` | `/api/camera/focus` | Set the target and optional distance |
| `POST` | `/api/camera/orbit` | Orbit around the current target |
| `POST` | `/api/camera/preset` | Apply a named camera view |
| `POST` | `/api/camera/mode` | Switch between orbit and first-person mode |
| `GET` | `/api/camera/markers` | List saved camera markers |
| `POST` | `/api/camera/markers` | Save a marker for the current camera |
| `POST` | `/api/camera/markers/:id/restore` | Restore a saved marker |
| `DELETE` | `/api/camera/markers/:id` | Delete a saved marker |

## REST endpoints

### `GET /api/camera/state`

Return the active camera state.

```bash
curl http://127.0.0.1:3000/api/camera/state \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

Example response:

```json
{
  "schema_version": "eatme.alice-camera-workflow-state/v1",
  "status": "ok",
  "operation": "state",
  "camera": {
    "mode": "orbit",
    "position": { "x": 0, "y": 5, "z": 20 },
    "target": { "x": 0, "y": 1, "z": 0 },
    "up": { "x": 0, "y": 1, "z": 0 },
    "yawDegrees": 0,
    "pitchDegrees": -11.3,
    "rollDegrees": 0,
    "fieldOfViewDegrees": 60,
    "activePreset": "home"
  },
  "markers": [],
  "activeMarkerId": null
}
```

### `POST /api/camera/move`

Move the camera along local axes.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/move \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"forward":2,"right":0,"up":0}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `forward` | `number` | no | Positive moves forward, negative moves backward |
| `right` | `number` | no | Positive moves right, negative moves left |
| `up` | `number` | no | Positive moves up, negative moves down |

Omitted deltas default to `0`. In orbit mode, `position` and `target` move
together. In first-person mode, `position` moves and `target` is recalculated
from yaw and pitch.

### `POST /api/camera/pan`

Pan the current view plane.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/pan \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"right":1,"up":0.5}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `right` | `number` | no | Positive pans right |
| `up` | `number` | no | Positive pans up |

### `POST /api/camera/zoom`

Zoom the active camera.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/zoom \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"delta":-2}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `delta` | `number` | yes | Negative zooms in; positive zooms out |

In orbit mode, zoom changes distance from `position` to `target`. In
first-person mode, zoom changes `fieldOfViewDegrees` while keeping the field of
view within `1` through `179`.

### `POST /api/camera/focus`

Set the camera target and optional distance.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/focus \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"target":{"x":0,"y":1,"z":0},"distance":12}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `target` | `CameraVector3` | yes | Point the camera looks at |
| `distance` | `number` | no | Distance to keep from the target |

### `POST /api/camera/orbit`

Rotate around the active target.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/orbit \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"yawDegrees":15,"pitchDegrees":-10}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `yawDegrees` | `number` | no | Horizontal rotation delta |
| `pitchDegrees` | `number` | no | Vertical rotation delta |

Omitted deltas default to `0`.

### `POST /api/camera/preset`

Apply a standard Alice camera view.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/preset \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"preset":"front"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `preset` | `CameraPreset` | yes | View to apply |

### `POST /api/camera/mode`

Switch camera mode.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/mode \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"first-person"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `mode` | `CameraMode` | yes | `orbit` or `first-person` |

Mode changes preserve the current position and target. Switching to
first-person computes yaw and pitch from the current view direction.

### `GET /api/camera/markers`

List markers without changing camera state. The `markers` array contains full
marker records, including deep-copied camera snapshots.

```bash
curl http://127.0.0.1:3000/api/camera/markers \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

### `POST /api/camera/markers`

Save a named marker for the current camera.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/markers \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Intro view"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | yes | Human-readable marker name |

Example response:

```json
{
  "schema_version": "eatme.alice-camera-workflow-state/v1",
  "status": "ok",
  "operation": "save-marker",
  "camera": {
    "mode": "orbit",
    "position": { "x": 0, "y": 5, "z": 20 },
    "target": { "x": 0, "y": 1, "z": 0 },
    "up": { "x": 0, "y": 1, "z": 0 },
    "yawDegrees": 0,
    "pitchDegrees": -11.3,
    "rollDegrees": 0,
    "fieldOfViewDegrees": 60,
    "activePreset": "home"
  },
  "markers": [
    {
      "id": "camera-marker-1",
      "name": "Intro view",
      "camera": {
        "mode": "orbit",
        "position": { "x": 0, "y": 5, "z": 20 },
        "target": { "x": 0, "y": 1, "z": 0 },
        "up": { "x": 0, "y": 1, "z": 0 },
        "yawDegrees": 0,
        "pitchDegrees": -11.3,
        "rollDegrees": 0,
        "fieldOfViewDegrees": 60,
        "activePreset": "home"
      },
      "createdAt": "2026-06-21T16:03:25.866Z"
    }
  ],
  "marker": {
    "id": "camera-marker-1",
    "name": "Intro view",
    "camera": {
      "mode": "orbit",
      "position": { "x": 0, "y": 5, "z": 20 },
      "target": { "x": 0, "y": 1, "z": 0 },
      "up": { "x": 0, "y": 1, "z": 0 },
      "yawDegrees": 0,
      "pitchDegrees": -11.3,
      "rollDegrees": 0,
      "fieldOfViewDegrees": 60,
      "activePreset": "home"
    },
    "createdAt": "2026-06-21T16:03:25.866Z"
  },
  "activeMarkerId": "camera-marker-1"
}
```

### `POST /api/camera/markers/:id/restore`

Restore a saved marker.

```bash
curl -X POST http://127.0.0.1:3000/api/camera/markers/camera-marker-1/restore \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Unknown marker IDs return `404`.

### `DELETE /api/camera/markers/:id`

Delete a marker.

```bash
curl -X DELETE http://127.0.0.1:3000/api/camera/markers/camera-marker-1 \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

Deleting the active marker clears `activeMarkerId`.

## TypeScript exports

Import camera workflow contracts from the public Alice package surface:

```typescript
import {
  applyCameraPreset,
  cloneCameraWorkflowState,
  CAMERA_MAX_PITCH_DEGREES,
  CAMERA_MIN_ORBIT_DISTANCE,
  CAMERA_MIN_PITCH_DEGREES,
  CAMERA_WORKFLOW_SCHEMA_VERSION,
  CameraMarkerNotFoundError,
  createDefaultCameraWorkflowState,
  deleteCameraMarker,
  focusCamera,
  listCameraMarkers,
  moveCamera,
  orbitCamera,
  panCamera,
  restoreCameraMarker,
  saveCameraMarker,
  setCameraMode,
  validateCameraWorkflowState,
  zoomCamera,
  type CameraMarker,
  type CameraMode,
  type CameraPreset,
  type CameraSnapshot,
  type CameraVector3,
  type CameraWorkflowState,
  type FocusCameraOptions,
  type MoveCameraDelta,
  type OrbitCameraDelta,
  type PanCameraDelta,
  type SaveCameraMarkerOptions,
  type ZoomCameraOptions,
} from "alice-web";
```

### Planned signatures

```typescript
declare const CAMERA_WORKFLOW_SCHEMA_VERSION = "eatme.alice-camera-workflow-state/v1";
declare const CAMERA_MIN_PITCH_DEGREES = -89;
declare const CAMERA_MAX_PITCH_DEGREES = 89;
declare const CAMERA_MIN_ORBIT_DISTANCE = 0.1;

interface MoveCameraDelta {
  forward?: number;
  right?: number;
  up?: number;
}

interface PanCameraDelta {
  right?: number;
  up?: number;
}

interface ZoomCameraOptions {
  delta: number;
}

interface FocusCameraOptions {
  target: CameraVector3;
  distance?: number;
}

interface OrbitCameraDelta {
  yawDegrees?: number;
  pitchDegrees?: number;
}

interface SaveCameraMarkerOptions {
  name: string;
}

declare class CameraMarkerNotFoundError extends Error {
  readonly markerId: string;
  constructor(markerId: string);
}

function createDefaultCameraWorkflowState(): CameraWorkflowState;
function cloneCameraWorkflowState(state: CameraWorkflowState): CameraWorkflowState;
function validateCameraWorkflowState(state: unknown): CameraWorkflowState;
function moveCamera(state: CameraWorkflowState, delta: MoveCameraDelta): CameraWorkflowState;
function panCamera(state: CameraWorkflowState, delta: PanCameraDelta): CameraWorkflowState;
function zoomCamera(state: CameraWorkflowState, options: ZoomCameraOptions): CameraWorkflowState;
function focusCamera(state: CameraWorkflowState, options: FocusCameraOptions): CameraWorkflowState;
function orbitCamera(state: CameraWorkflowState, delta: OrbitCameraDelta): CameraWorkflowState;
function applyCameraPreset(state: CameraWorkflowState, preset: CameraPreset): CameraWorkflowState;
function setCameraMode(state: CameraWorkflowState, mode: CameraMode): CameraWorkflowState;
function saveCameraMarker(state: CameraWorkflowState, options: SaveCameraMarkerOptions): CameraWorkflowState;
function restoreCameraMarker(state: CameraWorkflowState, markerId: string): CameraWorkflowState;
function deleteCameraMarker(state: CameraWorkflowState, markerId: string): CameraWorkflowState;
function listCameraMarkers(state: CameraWorkflowState): CameraMarker[];
```

### Function behavior

| Function | Purpose |
| --- | --- |
| `createDefaultCameraWorkflowState()` | Create the default Alice camera state |
| `cloneCameraWorkflowState(state)` | Deep-copy camera state and marker snapshots |
| `validateCameraWorkflowState(state)` | Validate finite vectors, mode, preset, FOV, pitch, orbit distance, and marker invariants; return a deep copy |
| `moveCamera(state, delta)` | Move along local camera axes |
| `panCamera(state, delta)` | Pan across the current view plane |
| `zoomCamera(state, options)` | Zoom orbit distance or first-person FOV |
| `focusCamera(state, options)` | Focus on a target point |
| `orbitCamera(state, delta)` | Orbit around the current target |
| `applyCameraPreset(state, preset)` | Apply a named view preset |
| `setCameraMode(state, mode)` | Switch `orbit` or `first-person` mode |
| `saveCameraMarker(state, options)` | Save the active camera as a marker |
| `restoreCameraMarker(state, markerId)` | Restore a marker snapshot |
| `deleteCameraMarker(state, markerId)` | Remove a marker |
| `listCameraMarkers(state)` | Return deep-copied full marker records |

All mutation helpers return a new `CameraWorkflowState` and leave the input
state unchanged. Validation failures throw `TypeError`. Unknown marker IDs throw
`CameraMarkerNotFoundError`. REST handlers translate those errors to JSON `400`
or `404` responses.

## Implementation boundary

`camera-workflow.ts` owns the serializable workflow state, validation, movement
math, presets, marker IDs, marker snapshots, and REST-facing behavior described
here.

`camera-system.ts` remains the story camera abstraction for `SCamera`, point of
view capture, interpolation, projection mode, and story-level camera markers. Do
not merge workflow state into `camera-system.ts`. If browser rendering needs to
apply workflow state to an `SCamera`, add a narrow adapter that copies the
workflow snapshot into the story camera without changing the workflow contract.

## Error responses

Bad requests use `400`:

```json
{
  "error": "camera move requires finite numeric deltas"
}
```

Missing markers use `404`:

```json
{
  "error": "Camera marker not found"
}
```

Unexpected server failures use `500` without stack traces:

```json
{
  "error": "Internal server error"
}
```

## Related docs

- [Camera workflow usage](./camera-workflow-usage.md)
- [Camera workflow configuration](./camera-workflow-configuration.md)
- [Tutorial: Camera workflow parity](./tutorial-camera-workflow.md)
- [Server API](./server-api.md)
- [API reference](./api-reference.md)
