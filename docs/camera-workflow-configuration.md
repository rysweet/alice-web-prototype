---
title: Camera workflow configuration
description: Configuration defaults and operational rules for the Alice camera workflow.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: reference
---

# Camera workflow configuration

The Alice camera workflow works without extra configuration. The browser,
server, and TypeScript workflow all start from the same default camera state and
the same validation rules.

## Contents

- [Required server configuration](#required-server-configuration)
- [Default camera state](#default-camera-state)
- [Preset views](#preset-views)
- [Movement defaults](#movement-defaults)
- [Session lifecycle](#session-lifecycle)
- [Marker storage](#marker-storage)
- [First-person behavior](#first-person-behavior)
- [Browser and test configuration](#browser-and-test-configuration)
- [Module boundary](#module-boundary)
- [Identity rules](#identity-rules)
- [Related docs](#related-docs)

## Required server configuration

Camera REST routes use the same local Alice server configuration as the rest of
the API.

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

| Configuration | Required | Description |
| --- | --- | --- |
| `--api-token <token>` | yes for token-protected local API runs | Enables `X-Alice-Local-Api-Token` checks for `/api/camera/*` |
| `--port <1-65535>` | no | Port used by browser, curl, and Playwright flows |
| `--project <file.a3p>` | no | Starter project; launching restores saved camera workflow state when present, otherwise uses the default view |
| `--evidence-dir <dir>` | no | Evidence root for other server workflows; camera state is not written there by default |

All camera routes require `X-Alice-Local-Api-Token` when a token is configured,
including `GET /api/camera/state` and `GET /api/camera/markers`.

## Default camera state

New sessions start with the `home` camera preset.

```json
{
  "mode": "orbit",
  "position": { "x": 0, "y": 5, "z": 20 },
  "target": { "x": 0, "y": 1, "z": 0 },
  "up": { "x": 0, "y": 1, "z": 0 },
  "yawDegrees": 0,
  "pitchDegrees": -11.3,
  "rollDegrees": 0,
  "fieldOfViewDegrees": 60,
  "activePreset": "home"
}
```

The coordinate system is right-handed and Y-up, matching the Alice scene model.
All coordinates must be finite numbers.

## Preset views

Preset views use the active focus target and a stable authoring distance unless
the preset is `home`.

| Preset | Position relative to target | Mode after apply |
| --- | --- | --- |
| `home` | `{ x: 0, y: 5, z: 20 }` looking at `{ x: 0, y: 1, z: 0 }` | `orbit` |
| `front` | Positive Z side | Current mode |
| `back` | Negative Z side | Current mode |
| `left` | Negative X side | Current mode |
| `right` | Positive X side | Current mode |
| `top` | Positive Y side, looking down | Current mode |
| `isometric` | Angled X/Y/Z overview | Current mode |

Applying a preset does not delete markers.
Manual movement, pan, orbit, focus, first-person turning, and zoom clear
`activePreset` to `null` because the camera no longer exactly matches the
selected preset.

## Movement defaults

The browser uses these default increments for buttons and keyboard shortcuts.
The REST API accepts explicit numeric values and does not require clients to use
these increments.

| Control | Default increment |
| --- | --- |
| Move forward/back/left/right | `1` Alice scene unit |
| Move up/down | `1` Alice scene unit |
| Pan | `0.5` Alice scene units |
| Orbit yaw | `15` degrees |
| Orbit pitch | `10` degrees |
| Orbit zoom | `1` Alice scene unit |
| First-person FOV zoom | `5` degrees |

The workflow clamps pitch to avoid inverted views and clamps field of view to
`1` through `179` degrees.

| Value | Clamp |
| --- | --- |
| Pitch | `-89` through `89` degrees |
| Orbit distance | Minimum `0.1` Alice scene units |
| Field of view | `1` through `179` degrees |

## Session lifecycle

Camera workflow state belongs to the active server session and is serialized
into saved `.a3p` projects.

| Server action | Camera workflow effect |
| --- | --- |
| `createServer()` | Creates a new isolated default camera workflow state |
| `POST /api/launch` | Restores camera workflow state from the launched project, or uses the default view when the project has none |
| `POST /api/project/new` | Replaces the active project and resets camera workflow state |
| `POST /api/project/save` | Saves the current camera workflow state into the project artifact |
| Server process restart | Clears unsaved session state; loading a saved project restores its serialized camera workflow |

There is no shared singleton camera state across server instances.

## Marker storage

Markers are stored in the active camera workflow state. Unsaved markers are
session-local; markers saved into a project are restored when that `.a3p` is
loaded again.

| Field | Rule |
| --- | --- |
| `id` | Opaque string generated by Alice |
| `name` | Trimmed text, max 80 characters |
| `camera` | Deep-copied snapshot of the camera |
| `createdAt` | ISO timestamp generated by Alice |

Deleting a marker removes it from the active session state. Saving a project
serializes the remaining markers into the `.a3p` file.

## First-person behavior

First-person mode is available when the current browser/runtime camera can apply
position, yaw, pitch, and field-of-view updates. It does not force unrelated
pointer-lock or VR behavior.

| Surface | First-person behavior |
| --- | --- |
| Browser UI | Keyboard movement and yaw/pitch updates while the scene view or Camera panel is focused |
| REST API | `POST /api/camera/mode` switches mode; movement and zoom follow first-person semantics |
| TypeScript workflow | `setCameraMode(state, "first-person")` computes yaw/pitch from the current view |
| Markers | Marker snapshots preserve `mode`, position, target, yaw, pitch, roll, and FOV |

Switching back to orbit mode preserves the current camera position and target.

## Browser and test configuration

Browser E2E scenarios use Playwright through the existing npm script:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm run test:e2e
```

Camera workflow tests use visible labels and `data-testid` attributes from the
Camera panel. They do not assert WebGL pixels.

| Stable test surface | Required behavior |
| --- | --- |
| `[data-testid="camera-panel"]` | Camera controls are visible |
| `[data-testid="camera-status"]` | Announces movement, preset, marker, and mode changes |
| `[data-testid="camera-position"]` | Shows finite camera coordinates |
| `[data-testid="camera-marker-list"]` | Shows saved markers as text |

## Module boundary

The workflow implementation belongs in `camera-workflow.ts`. That module owns
serializable camera state, validation, movement math, presets, marker IDs,
marker snapshots, first-person mode semantics, and REST response contracts.

The existing `camera-system.ts` module remains the story camera abstraction for
`SCamera`, point of view capture, interpolation, projection mode, and
story-level camera markers. Keep it separate from workflow state. Use a narrow
adapter only when the browser renderer needs to copy a workflow snapshot into a
story camera.

## Identity rules

Camera workflow configuration uses Alice/alice-web identity:

| Surface | Value |
| --- | --- |
| Product/app name | `Alice` |
| Package/runtime | `alice-web` |
| Auth header | `X-Alice-Local-Api-Token` |
| Token environment variable | `ALICE_LOCAL_API_TOKEN` |
| Browser/API URL variable | `ALICE_WEB_URL` |

Do not add repository-nickname-prefixed camera headers, environment variables,
storage keys, route names, package names, or runtime strings.

## Related docs

- [Camera workflow usage](./camera-workflow-usage.md)
- [Camera workflow API](./camera-workflow-api.md)
- [Tutorial: Camera workflow parity](./tutorial-camera-workflow.md)
- [Server API](./server-api.md)
- [Alice identity boundary](./alice-identity-boundary.md)
