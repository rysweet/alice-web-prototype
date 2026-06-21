---
title: Alice WebXR and VR interactions
description: Reference for capability-aware WebXR/VR setup, input, locomotion, UI evidence, and public APIs in alice-web.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: reference
---

# Alice WebXR and VR interactions

Alice enables immersive WebXR VR interaction when the browser, device, and page
context provide the required APIs. When a capability is missing, Alice reports
structured unsupported, degraded, or failed evidence instead of silently falling
back.

The product, browser runtime, package, and public API identity stay Alice /
`alice-web`. See [Alice identity boundary](./alice-identity-boundary.md) for the
repository nickname rules.

## Contents

- [Quick start](#quick-start)
- [Browser and device requirements](#browser-and-device-requirements)
- [Runtime behavior](#runtime-behavior)
- [Capability evidence](#capability-evidence)
- [VR session lifecycle](#vr-session-lifecycle)
- [Controllers and hands](#controllers-and-hands)
- [Locomotion and interaction modes](#locomotion-and-interaction-modes)
- [User interface hooks](#user-interface-hooks)
- [Configuration](#configuration)
- [Public TypeScript API](#public-typescript-api)
- [Examples](#examples)
- [Troubleshooting](#troubleshooting)
- [Related docs](#related-docs)

## Quick start

Run Alice locally and open it in a WebXR-capable browser:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm install
npm run build
npm run dev
```

Open the printed Vite URL in a browser that supports `immersive-vr`. The page
must be served from a secure context: `https://`, `http://localhost`, or
`http://127.0.0.1`.

1. Load or create an Alice scene.
2. Select the **Enter VR** button.
3. Grant the browser's VR permission prompt.
4. Use controller rays to point at pickable Alice objects or movement targets.
5. Use the configured locomotion mode to move through the scene.

If VR is unavailable, the button will remain disabled or the session request
will fail visibly. The status panel will explain the unsupported state with
evidence codes
such as `webxr-unavailable`, `immersive-vr-unsupported`, or
`secure-context-required`.

## Browser and device requirements

Alice enables WebXR only when all required runtime conditions are true.

| Requirement | Required for | Evidence |
| --- | --- | --- |
| Secure browser context | All WebXR APIs | `secure-context-required` |
| `navigator.xr` | Capability detection and session startup | `webxr-unavailable` |
| `navigator.xr.isSessionSupported('immersive-vr')` | Entering immersive VR | `immersive-vr-unsupported` |
| `navigator.xr.requestSession('immersive-vr')` | Active VR session | `session-request-failed` when rejected |
| `local-floor` or `local` reference space | Stable tracking origin | `reference-space-unavailable` |
| `XRInputSource` records | Controller and hand tracking | `input-sources-unavailable` |

Optional capabilities produce degraded evidence instead of blocking session
startup:

| Optional capability | Used for | Degraded evidence |
| --- | --- | --- |
| `local-floor` reference space | Floor-relative user height | `reference-space-local-fallback` when `local` is used |
| Target ray space | Pointing, picking, click/move targeting | `controller-missing-target-ray` |
| Grip space | Controller object placement | `controller-missing-grip` |
| Gamepad axes/buttons | Smooth controller locomotion | `controller-missing-gamepad` |
| Hand tracking | Hand affordances and hand state | `hand-tracking-unsupported` |
| Valid hand joint poses | Hand affordance placement | `hand-pose-unavailable` |

## Runtime behavior

The WebXR implementation must keep desktop scene behavior available outside VR.
When an immersive VR session is active:

- the Three.js renderer will have `renderer.xr.enabled = true`;
- the animation loop is driven by the XR frame loop;
- OrbitControls are disabled and restored after the session ends;
- the user rig follows the active XR reference space;
- controller and hand affordances are added to the scene only for supported
  input sources;
- select and squeeze state is normalized into Alice-owned input state;
- interaction dispatch is gated to known Alice pickable objects and valid
  movement surfaces.

No browser or device data may be persisted or transmitted by the WebXR runtime.
Capability and unsupported-state evidence must stay local, coarse, and intended
for UI diagnostics and tests.

## Capability evidence

Capability detection returns a report with a status and machine-readable
evidence. Evidence is also rendered into the UI.

```typescript
import { detectWebXRCapabilities } from 'alice-web';

const report = await detectWebXRCapabilities();

if (report.status === 'unsupported') {
  console.log(report.evidence.map((item) => item.code));
}
```

Example unsupported report:

```json
{
  "status": "unsupported",
  "immersiveVrSupported": false,
  "referenceSpaces": {
    "preferred": "local-floor",
    "available": []
  },
  "input": {
    "controllersSupported": false,
    "handsSupported": false,
    "gamepadsSupported": false
  },
  "evidence": [
    {
      "code": "webxr-unavailable",
      "severity": "unsupported",
      "message": "This browser does not expose navigator.xr."
    }
  ]
}
```

Example degraded report:

```json
{
  "status": "degraded",
  "immersiveVrSupported": true,
  "referenceSpaces": {
    "preferred": "local-floor",
    "active": "local",
    "available": ["local"]
  },
  "input": {
    "controllersSupported": true,
    "handsSupported": false,
    "gamepadsSupported": true
  },
  "evidence": [
    {
      "code": "reference-space-local-fallback",
      "severity": "degraded",
      "message": "local-floor is unavailable; Alice is using local reference space."
    },
    {
      "code": "hand-tracking-unsupported",
      "severity": "degraded",
      "message": "Hand tracking is not available for the current browser or device."
    }
  ]
}
```

### Evidence codes

| Code | Severity | Meaning |
| --- | --- | --- |
| `secure-context-required` | unsupported | The page is not running in a secure context. |
| `webxr-unavailable` | unsupported | `navigator.xr` is missing. |
| `immersive-vr-unsupported` | unsupported | The browser reports that `immersive-vr` sessions are unsupported. |
| `session-request-failed` | failed | `requestSession('immersive-vr')` rejected or threw. |
| `reference-space-unavailable` | failed | Neither `local-floor` nor `local` reference space could be created. |
| `reference-space-local-fallback` | degraded | Alice requested `local-floor` but is using `local`. |
| `input-sources-unavailable` | degraded | The session has no usable XR input sources. |
| `controller-missing-target-ray` | degraded | An input source cannot provide a target ray pose. |
| `controller-missing-grip` | degraded | An input source cannot provide a grip pose. |
| `controller-missing-gamepad` | degraded | Smooth controller movement cannot read gamepad axes/buttons. |
| `hand-tracking-unsupported` | degraded | The current input source has no hand tracking data. |
| `hand-pose-unavailable` | degraded | Hand joints exist but a frame did not provide valid joint poses. |
| `invalid-movement-target` | degraded | A click/move ray hit a surface that is not a valid movement target. |
| `non-finite-pose` | degraded | XR pose data contained `NaN`, `Infinity`, or invalid matrix values. |
| `locomotion-disabled` | degraded | Movement input was received while locomotion is disabled. |

## VR session lifecycle

The session controller owns the immersive VR lifecycle and records every
visible state transition. Capability reports may be `supported`, `degraded`, or
`unsupported`, but those report statuses are separate from the session lifecycle.

| State | Meaning |
| --- | --- |
| `idle` | No active capability check or session request is running. |
| `unsupported` | Required WebXR capability is missing. |
| `starting` | Alice is requesting an immersive VR session from explicit user intent. |
| `active` | The XR session, reference space, renderer XR loop, and input tracking are active. |
| `ended` | The XR session ended and desktop controls were restored. |
| `failed` | A startup or runtime requirement failed and evidence was recorded. |

Session startup must always come from explicit user intent, normally the
**Enter VR** button. Alice must not request immersive VR from page load, timers,
automatic scene events, or API calls without a user gesture.

Reference space handling is deterministic:

1. Alice requests `local-floor`.
2. If `local-floor` fails, Alice requests `local`.
3. If `local` succeeds, Alice starts the session and records degraded evidence
   `reference-space-local-fallback`.
4. If both fail, startup fails with `reference-space-unavailable`.

Session cleanup must remove controller and hand affordances, clear select and
squeeze state, disable the renderer XR session, restore OrbitControls, and
render the `ended` UI state.

## Controllers and hands

Alice will represent each `XRInputSource` as an Alice-owned input record. The
record will use browser-provided spaces when available and record evidence when
optional parts are missing.

```typescript
interface WebXRInputSourceState {
  id: string;
  handedness: 'left' | 'right' | 'none';
  profiles: string[];
  targetRayMode: XRTargetRayMode;
  targetRay?: WebXRPoseState;
  grip?: WebXRPoseState;
  hand?: WebXRHandState;
  gamepad?: WebXRGamepadState;
  selectPressed: boolean;
  squeezePressed: boolean;
  evidence: WebXREvidence[];
}
```

### Controller affordances

When a controller has a target ray, Alice renders a ray affordance from
that pose. When it has a grip pose, Alice renders a simple controller object
at the grip transform. These affordances are built in; Alice will not require
external controller model assets to make input usable.

Controller select events can trigger:

- point/click interaction with pickable Alice objects;
- click/move locomotion to a valid movement target;
- deterministic combined-mode resolution when both systems are enabled.

Squeeze state is exposed in input state for Alice procedures and future scene
behaviors. Squeeze does not trigger locomotion by default.

### Hand affordances

When an input source exposes `XRHand`, Alice will track the hand and render
simple hand affordances from available joint poses. Missing or invalid joint
poses must not end the session; they add `hand-pose-unavailable` evidence for
that frame.

Hand tracking is optional. A device with controllers but no hands is a valid
active VR session with degraded evidence.

## Locomotion and interaction modes

The feature separates object interaction from user movement. The active mode
controls what a select action does.

| Mode | Behavior |
| --- | --- |
| `disabled` | User movement is disabled. Select can still interact with pickable Alice objects when point/click is enabled. |
| `controller-smooth` | Gamepad axes move the user rig continuously while the session is active. |
| `point-click` | Select activates the closest pickable Alice object hit by the controller ray. It does not move the user. |
| `click-move` | Select moves the user rig to the nearest valid movement target hit by the controller ray. It does not activate objects. |
| `combined` | Select first checks pickable Alice objects. If no object is hit, Alice checks valid movement targets. |

The default mode is `combined` with smooth controller movement enabled when
gamepad axes are available.

### Deterministic precedence

When a ray can hit both an object and a movement surface, Alice must resolve the
select action in this order:

1. In `point-click`, only pickable Alice object hits are considered.
2. In `click-move`, only valid movement targets are considered.
3. In `combined`, the nearest pickable Alice object wins over movement even when
   the movement surface is closer.
4. If no pickable object wins and the movement target is valid, Alice moves the
   user rig.
5. If the movement target is invalid, Alice records
   `invalid-movement-target` and does not move the user.

This rule keeps point/click object interaction predictable in scenes where
objects stand on movement surfaces.

### Movement safety

All movement math must be finite and clamped before it changes the user rig.

| Setting | Default | Meaning |
| --- | --- | --- |
| `smoothSpeedMetersPerSecond` | `1.5` | Maximum continuous controller movement speed. |
| `clickMoveMaxDistanceMeters` | `25` | Farthest allowed click/move target from the rig. |
| `clickMoveStepMeters` | `0` | `0` snaps to the target; values above `0` move by a fixed step. |
| `verticalMovement` | `false` | When false, click/move preserves the current rig height. |
| `movementSurfaceNames` | `['ground', 'floor', 'terrain']` | Object names treated as valid movement surfaces. |

Malformed axes, poses, matrices, and intersections must be ignored for movement
and reported as `non-finite-pose` or `invalid-movement-target` evidence.

## User interface hooks

Alice renders WebXR state with text-safe DOM updates. Evidence messages
must use `textContent`; Alice must never inject WebXR evidence through
`innerHTML`.

Stable data attributes:

| Attribute | Element | Values |
| --- | --- | --- |
| `data-alice-webxr-vr-button` | Enter/Exit VR button | `enter`, `exit`, `disabled` |
| `data-alice-webxr-status` | Status container | Session states: `idle`, `unsupported`, `starting`, `active`, `ended`, `failed`; capability-only UI may also render `degraded` |
| `data-alice-webxr-evidence` | Evidence list | Present when evidence is rendered |
| `data-alice-webxr-evidence-code` | Evidence item | Evidence code such as `immersive-vr-unsupported` |
| `data-alice-webxr-locomotion-mode` | Mode label/control | Active locomotion mode |
| `data-alice-webxr-invalid-target` | Invalid movement target message | Present when the last select hit an invalid target |

Example UI state:

```html
<button data-alice-webxr-vr-button="disabled" disabled>Enter VR</button>
<section data-alice-webxr-status="unsupported" aria-live="polite">
  <p>VR is unavailable in this browser.</p>
  <ul data-alice-webxr-evidence>
    <li data-alice-webxr-evidence-code="webxr-unavailable">
      This browser does not expose navigator.xr.
    </li>
  </ul>
</section>
```

Tests should assert data attributes and text content, not browser-specific
phrasing from native permission prompts.

## Configuration

The WebXR modules accept additive configuration. Omitted fields use
safe defaults.

```typescript
import { createWebXRLocomotion, createWebXRSessionController } from 'alice-web';

const locomotion = createWebXRLocomotion({
  mode: 'combined',
  smoothSpeedMetersPerSecond: 1.5,
  clickMoveMaxDistanceMeters: 25,
  verticalMovement: false,
  movementSurfaceNames: ['ground', 'floor', 'terrain'],
});

const session = createWebXRSessionController({
  renderer,
  scene,
  camera,
  userRig,
  orbitControls,
  referenceSpacePreference: ['local-floor', 'local'],
  navigator,
});
```

### WebXRSessionControllerOptions

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `renderer` | `THREE.WebGLRenderer` | Required | Renderer that receives XR session setup and cleanup. |
| `scene` | `THREE.Scene` | Required | Scene that receives controller and hand affordances. |
| `camera` | `THREE.Camera` | Required | Active Alice camera for the XR session. |
| `userRig` | `THREE.Object3D` | Required | Object moved by locomotion. |
| `orbitControls` | `OrbitControls` | Required | Desktop controls disabled during VR and restored on session end. |
| `referenceSpacePreference` | `WebXRReferenceSpaceType[]` | `['local-floor', 'local']` | Ordered reference spaces Alice tries during startup. |

### WebXRLocomotionConfig

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `mode` | `WebXRLocomotionMode` | `'combined'` | Active movement/interaction mode. |
| `smoothSpeedMetersPerSecond` | `number` | `1.5` | Maximum controller-smooth movement speed. |
| `clickMoveMaxDistanceMeters` | `number` | `25` | Maximum ray-target movement distance. |
| `clickMoveStepMeters` | `number` | `0` | Movement step size; `0` snaps to the selected target. |
| `verticalMovement` | `boolean` | `false` | Allows click/move to change rig height when true. |
| `movementSurfaceNames` | `string[]` | `['ground', 'floor', 'terrain']` | Scene object names accepted as movement surfaces. |

## Public TypeScript API

The root `alice-web` package exports additive WebXR helpers and types from
`src/index.ts`. Existing Alice exports must keep their names and behavior.

Runtime composition in `src/main.ts` must wire capability detection, session
lifecycle, normalized input, locomotion, controller and hand affordances, and UI
evidence for the browser app. The public API stays module-shaped so tests and
custom embedding can own one part without constructing the full browser runtime.
No high-level runtime factory helper is part of this contract.

### Capability detection

```typescript
function detectWebXRCapabilities(
  options?: WebXRCapabilityDetectionOptions,
): Promise<WebXRCapabilityReport>;
```

| Type | Purpose |
| --- | --- |
| `WebXRCapabilityDetectionOptions` | Supplies a navigator-like object for tests or alternate runtimes. |
| `WebXRCapabilityReport` | Summarizes support status, reference space support, input support, and evidence. |
| `WebXREvidence` | Machine-readable unsupported/degraded/failed evidence item. |
| `WebXREvidenceCode` | Union of supported evidence code strings. |

### Session control

```typescript
function createWebXRSessionController(
  options: WebXRSessionControllerOptions,
): WebXRSessionController;
```

| Member | Type | Description |
| --- | --- | --- |
| `state` | `WebXRSessionState` | Current lifecycle state. |
| `input` | `WebXRInputState` | Last normalized input snapshot. |
| `session` | `XRSession \| null` | Active XR session, when started. |
| `referenceSpace` | `XRReferenceSpace \| null` | Active reference space, when started. |
| `start()` | `() => Promise<WebXRSessionStartResult>` | Requests `immersive-vr`; call only from user intent. |
| `end()` | `() => Promise<void>` | Ends the current XR session if active. |
| `updateInput(frame)` | `(frame: XRFrame) => WebXRInputState` | Updates normalized input for one XR frame. |
| `onStateChange(listener)` | `(listener: WebXRStateListener) => () => void` | Subscribes to state changes and returns an unsubscribe function. |

### Input normalization

```typescript
function normalizeWebXRInput(
  session: XRSession,
  frame: XRFrame,
  referenceSpace: XRReferenceSpace,
): WebXRInputState;
```

| Type | Purpose |
| --- | --- |
| `WebXRInputState` | Full per-frame input snapshot. |
| `WebXRInputSourceState` | One controller or hand input source. |
| `WebXRPoseState` | Finite pose matrix and position/orientation data. |
| `WebXRHandState` | Handedness and joint pose records. |
| `WebXRGamepadState` | Axes, buttons, and pressed/touched state. |

### Locomotion and interaction

```typescript
function createWebXRLocomotion(
  config?: WebXRLocomotionConfig,
): WebXRLocomotion;
```

| Member | Type | Description |
| --- | --- | --- |
| `mode` | `WebXRLocomotionMode` | Current movement/interaction mode. |
| `config` | `WebXRLocomotionConfig` | Resolved locomotion configuration. |
| `update(input, deltaSeconds)` | `(input: WebXRInputState, deltaSeconds: number) => WebXRLocomotionUpdateResult` | Applies smooth controller movement. |
| `resolveWebXRInteraction(options)` | `(options: WebXRInteractionResolutionOptions) => WebXRInteractionResult` | Resolves point/click or click/move select behavior. |

Result types:

| Type | Purpose |
| --- | --- |
| `WebXRLocomotionUpdateResult` | Reports movement delta, clamping, and evidence for continuous movement. |
| `WebXRInteractionResult` | Reports `object-interaction`, `movement`, `invalid-target`, or `none`. |
| `WebXRMovementHit` | Candidate target position and source surface. |

### UI rendering

```typescript
function renderWebXRStatus(
  target: HTMLElement,
  state: WebXRStatusViewModel,
): WebXRStatusElements;
```

`renderWebXRStatus()` sets stable data attributes and text content for the
current status, active locomotion mode, and evidence list.

## Examples

These examples use the public WebXR API exported from `alice-web`.

### Check whether to enable a custom VR button

```typescript
import { detectWebXRCapabilities } from 'alice-web';

const button = document.querySelector<HTMLButtonElement>('#enter-vr');
if (!button) {
  throw new Error('missing #enter-vr button');
}

const report = await detectWebXRCapabilities();
button.disabled = report.status === 'unsupported';
button.textContent = report.status === 'unsupported'
  ? 'VR unavailable'
  : 'Enter VR';
button.dataset.aliceWebxrVrButton = button.disabled ? 'disabled' : 'enter';
```

### Start VR from explicit user intent

```typescript
import { createWebXRSessionController, renderWebXRStatus } from 'alice-web';

const controller = createWebXRSessionController({
  renderer,
  scene,
  camera,
  userRig,
  orbitControls,
  navigator,
});

document.querySelector('#enter-vr')?.addEventListener('click', async () => {
  const result = await controller.start();

  if (result.status !== 'active') {
    renderWebXRStatus(statusPanel, {
      status: result.status,
      evidence: result.evidence,
    });
  }
});
```

### Restrict click/move to named surfaces

```typescript
import { createWebXRLocomotion } from 'alice-web';

const locomotion = createWebXRLocomotion({
  mode: 'click-move',
  clickMoveMaxDistanceMeters: 12,
  movementSurfaceNames: ['ground', 'bridge', 'classroomFloor'],
});
```

In this configuration, selecting a tree, character, prop, wall, or skybox does
not move the user. Alice records `invalid-movement-target` when the ray hits an
object that is not one of the configured surfaces.

### Prefer object interaction over movement

```typescript
import { resolveWebXRInteraction } from 'alice-web';

const result = resolveWebXRInteraction({
  mode: 'combined',
  objectHits,
  movementHits,
  movementSurfaceNames: ['ground', 'floor', 'terrain'],
  currentRigPosition: userRig.position,
});

if (result.type === 'object-interaction') {
  console.log(`Activated Alice object: ${result.objectName}`);
}

if (result.type === 'movement') {
  console.log(`Moved to ${result.target.position.x}, ${result.target.position.z}`);
}
```

In `combined` mode, an Alice object hit wins over a movement target. This is true
even when the movement surface is closer than the object along the same ray.

## Troubleshooting

| Symptom | Cause | Expected Alice evidence/UI |
| --- | --- | --- |
| The Enter VR button is disabled. | Browser or context does not support WebXR immersive VR. | `unsupported` status with `secure-context-required`, `webxr-unavailable`, or `immersive-vr-unsupported`. |
| The browser prompt appears, then VR does not start. | `requestSession('immersive-vr')` failed or permission was denied. | `failed` status with `session-request-failed`. |
| VR starts at the wrong floor height. | `local-floor` is unavailable and Alice used `local`. | Active session with `reference-space-local-fallback` evidence. |
| Controllers appear but do not move the user smoothly. | The input source has no gamepad axes/buttons. | `controller-missing-gamepad`; click/move can still work if target rays are available. |
| Hands do not appear. | The device or browser does not expose `XRHand`. | `hand-tracking-unsupported`; controller interaction remains available. |
| Select does nothing on the floor. | The floor object is not configured as a valid movement surface, or the mode is `point-click`. | `invalid-movement-target` when click/move is active. |
| Desktop orbit controls stop while in VR. | Expected behavior during active immersive sessions. | OrbitControls are restored when the session ends. |

## Related docs

- [Scene rendering](./scene-rendering.md)
- [Scene graph](./scene-graph.md)
- [Event system](./event-system.md)
- [Testing](./testing.md)
- [Alice identity boundary](./alice-identity-boundary.md)
