# Scene Rendering — Configurable Cameras, Lights & Debug Visualizations

`src/scene-builder.ts` converts parsed Alice project data into a Three.js scene.
This document covers the configurable camera, multi-light system, ground grid,
bounding-box overlays, and joint-skeleton visualizations that extend the base
scene builder.

## Quick Start

```typescript
import { parseA3P } from './a3p-parser';
import { buildScene } from './scene-builder';

const project = await parseA3P(buffer);

// Default — identical to previous behavior, no options required
const { scene, camera } = buildScene(project);

// With all debug visualizations enabled
const result = buildScene(project, {
  showGroundGrid: true,
  showBoundingBoxes: true,
  showJointSkeletons: true,
  lights: [
    { type: 'ambient', color: 0xffffff, intensity: 0.4 },
    { type: 'directional', color: 0xffffff, intensity: 0.8,
      position: { x: 5, y: 10, z: 7 } },
    { type: 'point', color: 0xff8800, intensity: 1.0,
      position: { x: -3, y: 5, z: 0 } },
  ],
  cameraTarget: { x: 0, y: 1, z: 0 },
  cameraMinDistance: 2,
  cameraMaxDistance: 100,
});

// result.scene       — THREE.Scene with all objects, lights, debug geometry
// result.camera      — THREE.PerspectiveCamera positioned per defaults
// result.cameraConfig — plain object for configuring OrbitControls in main.ts
// result.lights      — SceneLights handle for post-build light management
```

## Backward Compatibility

`buildScene(project)` with no second argument produces exactly the same output
as before: a `{ scene, camera }` object with ambient + directional lights and
placeholder geometry for all entities. The return type is a superset — existing
destructuring (`const { scene, camera } = buildScene(project)`) continues to
work unchanged.

## API Reference

### buildScene(project, options?)

```typescript
function buildScene(
  project: AliceProject,
  options?: SceneBuildOptions,
): SceneBuildResult;
```

**Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `project` | `AliceProject` | yes | Parsed .a3p project from `parseA3P()` |
| `options` | `SceneBuildOptions` | no | Configuration for lights, camera, debug viz |

**Returns:** `SceneBuildResult`

---

### SceneBuildOptions

All fields are optional. Omitting the entire object preserves default behavior.

```typescript
interface SceneBuildOptions {
  lights?: LightConfig[];
  showGroundGrid?: boolean;
  showBoundingBoxes?: boolean;
  showJointSkeletons?: boolean;
  cameraTarget?: { x: number; y: number; z: number };
  cameraMinDistance?: number;
  cameraMaxDistance?: number;
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `lights` | `LightConfig[]` | `undefined` | Custom light array. When provided, replaces the default ambient + directional pair. When omitted, the default two lights are created. |
| `showGroundGrid` | `boolean` | `false` | Show a reference grid on the ground plane. |
| `showBoundingBoxes` | `boolean` | `false` | Show wireframe bounding boxes around non-ground entities. |
| `showJointSkeletons` | `boolean` | `false` | Show skeleton line segments for jointed model entities. |
| `cameraTarget` | `{x,y,z}` | `{x:0, y:1, z:0}` | OrbitControls look-at target. |
| `cameraMinDistance` | `number` | `1` | Minimum zoom distance. Clamped to `[0.1, ∞)`. |
| `cameraMaxDistance` | `number` | `200` | Maximum zoom distance. Clamped to `[0.1, ∞)`. If less than `minDistance`, set to `minDistance`. |

---

### SceneBuildResult

Superset of the original `{ scene, camera }` return type.

```typescript
interface SceneBuildResult {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cameraConfig: CameraConfig;
  lights: SceneLights;
}
```

| Field | Type | Description |
|---|---|---|
| `scene` | `THREE.Scene` | The fully populated Three.js scene. |
| `camera` | `THREE.PerspectiveCamera` | Positioned camera (same as before). |
| `cameraConfig` | `CameraConfig` | Plain object for applying to OrbitControls. |
| `lights` | `SceneLights` | Post-build handle for managing scene lights. |

---

### LightConfig

Configures a single light source. The `type` field is a discriminator.

```typescript
interface LightConfig {
  type: 'ambient' | 'directional' | 'point' | 'hemisphere';
  color: number;
  intensity: number;
  position?: { x: number; y: number; z: number };
  groundColor?: number;  // hemisphere lights only
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `type` | `string` | yes | Light type discriminator. |
| `color` | `number` | yes | Hex color (e.g., `0xffffff`). |
| `intensity` | `number` | yes | Brightness. Clamped to `[0, 10]`. |
| `position` | `{x,y,z}` | no | World-space position. Required for `directional` and `point`. Ignored for `ambient`. |
| `groundColor` | `number` | no | Ground hemisphere color. Only used when `type` is `'hemisphere'`. |

**Light types:**

| Type | Three.js Class | Notes |
|---|---|---|
| `ambient` | `AmbientLight` | Uniform scene-wide illumination. No position needed. |
| `directional` | `DirectionalLight` | Parallel rays from `position` toward origin. Always casts shadows. |
| `point` | `PointLight` | Omni-directional from `position`. |
| `hemisphere` | `HemisphereLight` | Sky/ground gradient. `color` is sky, `groundColor` is ground. |

**Intensity clamping:** Values below 0 are clamped to 0; values above 10 are
clamped to 10. This prevents accidental blow-out from malformed project data.

**Default lights** (when `options.lights` is omitted):

```typescript
[
  { type: 'ambient', color: 0xffffff, intensity: 0.5 },
  { type: 'directional', color: 0xffffff, intensity: 0.8,
    position: { x: 5, y: 10, z: 7 } },
]
```

> **Note:** Directional lights always have `castShadow = true` set internally.

---

### CameraConfig

Plain-object configuration for orbit camera behavior. `buildScene` does not
create OrbitControls itself (it stays DOM-free) — it returns this config for
`main.ts` to apply.

```typescript
interface CameraConfig {
  target: { x: number; y: number; z: number };
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  enableDamping: boolean;
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `target` | `{x,y,z}` | `{x:0, y:1, z:0}` | OrbitControls look-at target. |
| `minDistance` | `number` | `1` | Minimum zoom distance. Clamped to `[0.1, ∞)`. |
| `maxDistance` | `number` | `200` | Maximum zoom distance. Clamped to `[0.1, ∞)`. If less than `minDistance`, set to `minDistance`. |
| `maxPolarAngle` | `number` | `Math.PI * 0.95` | Maximum vertical orbit angle (radians). Prevents looking below ground. |
| `enableDamping` | `boolean` | `true` | Smooth inertial camera movement. |

**Distance clamping:** Both `minDistance` and `maxDistance` are floored at `0.1`.
If `maxDistance < minDistance`, it is set to `minDistance`. This prevents
degenerate camera states.

---

### SceneLights

Post-build handle for adding, removing, and querying scene lights at runtime.

```typescript
interface SceneLights {
  readonly current: THREE.Light[];
  add(light: THREE.Light): void;
  remove(light: THREE.Light): boolean;
}
```

| Method | Description |
|---|---|
| `add(light)` | Adds an existing Three.js light to the scene and tracks it. |
| `remove(light)` | Removes the light from the scene. Returns `true` if found, `false` otherwise. |
| `current` | Snapshot copy of all lights currently tracked in the scene. |

**Example: swap to night lighting at runtime**

```typescript
const { lights } = buildScene(project, {
  lights: [
    { type: 'ambient', color: 0x222244, intensity: 0.3 },
    { type: 'point', color: 0xffaa00, intensity: 2, position: { x: 0, y: 3, z: 0 } },
  ],
});

// Later — remove all lights and add moonlight
// Spread into a copy first — lights.current is a snapshot
for (const light of [...lights.current]) {
  lights.remove(light);
}
const moonlight = new THREE.DirectionalLight(0x8888ff, 0.4);
moonlight.position.set(-5, 10, 3);
lights.add(moonlight);
```

---

## Features

### 1. Camera Control (Orbit, Pan, Zoom)

Camera configuration is split across two modules:

- **`scene-builder.ts`** returns a `CameraConfig` plain object — no DOM access.
- **`main.ts`** applies that config to `OrbitControls`.

In `main.ts`, after calling `buildScene`:

```typescript
const { scene, camera, cameraConfig } = buildScene(project, {
  cameraTarget: { x: 0, y: 2, z: 0 },
  cameraMinDistance: 5,
  cameraMaxDistance: 50,
});

controls?.dispose();
controls = new OrbitControls(camera, canvas);
controls.target.set(cameraConfig.target.x, cameraConfig.target.y, cameraConfig.target.z);
controls.minDistance = cameraConfig.minDistance;
controls.maxDistance = cameraConfig.maxDistance;
controls.maxPolarAngle = cameraConfig.maxPolarAngle;
controls.enableDamping = cameraConfig.enableDamping;
```

When no camera config is provided, `buildScene` returns sensible defaults
(target `{0,1,0}`, distances 1–200, damping enabled) that match the current
hardcoded behavior in `main.ts`.

**Capabilities:**

| Action | How |
|---|---|
| Orbit | Left-click drag (OrbitControls default) |
| Pan | Right-click drag or two-finger drag |
| Zoom | Scroll wheel or pinch gesture |
| Constrain below ground | `maxPolarAngle` (default `Math.PI * 0.95`) prevents camera going underground |
| Smooth motion | `enableDamping: true` by default |

---

### 2. Multiple Light Sources

Replace the fixed ambient + directional pair with any combination of four light
types.

**Minimal: single warm point light**

```typescript
const result = buildScene(project, {
  lights: [
    { type: 'point', color: 0xff8844, intensity: 2.0,
      position: { x: 0, y: 8, z: 0 } },
  ],
});
```

**Studio: three-point lighting setup**

```typescript
const result = buildScene(project, {
  lights: [
    { type: 'ambient', color: 0x333333, intensity: 0.3 },
    // Key light
    { type: 'directional', color: 0xffffff, intensity: 1.0,
      position: { x: 5, y: 10, z: 7 } },
    // Fill light
    { type: 'directional', color: 0x8888ff, intensity: 0.4,
      position: { x: -5, y: 5, z: -3 } },
    // Rim light
    { type: 'point', color: 0xffcc88, intensity: 0.6,
      position: { x: 0, y: 3, z: -10 } },
  ],
});
```

**Outdoor: hemisphere light for natural sky/ground gradient**

```typescript
const result = buildScene(project, {
  lights: [
    { type: 'hemisphere', color: 0x87ceeb, groundColor: 0x4a7c3f,
      intensity: 0.6 },
    { type: 'directional', color: 0xffffff, intensity: 0.8,
      position: { x: 5, y: 10, z: 7 } },
  ],
});
```

---

### 3. Ground Grid

When `showGroundGrid: true`, a reference grid is added at `y = 0.01` (slightly
above the ground plane to avoid z-fighting).

```typescript
const result = buildScene(project, { showGroundGrid: true });
```

**Grid properties:**

| Property | Value |
|---|---|
| Size | 200 × 200 units |
| Divisions | 40 |
| Center color | `0x888888` (gray) |
| Grid color | `0x444444` (dark gray) |
| Y offset | `0.01` (prevents z-fighting with ground plane) |
| `userData.debugType` | `'grid'` |

The grid is a `THREE.GridHelper` added as a direct child of the scene. It is
tagged with `userData.debugType = 'grid'` for future toggling support.

---

### 4. Entity Bounding Boxes

When `showBoundingBoxes: true`, a green wireframe bounding box is drawn around
every model and prop entity.

```typescript
const result = buildScene(project, { showBoundingBoxes: true });
```

**Which entities get bounding boxes:**

| Entity type | Bounding box? |
|---|---|
| `SModel`, `SJointedModel`, `SBiped`, `SFlyer`, `SQuadruped`, `SProp` | ✓ Yes |
| Generic / unknown | ✓ Yes |
| `SGround` | No — ground plane is excluded |
| `SCamera` | No — not rendered (returns null) |

**Implementation details:**

- Every entity with a rendered mesh gets a `THREE.BoxHelper` added directly to the scene (not wrapped in a Group).
- `SGround` entities are explicitly excluded.
- `SCamera` entities never produce a mesh, so they are implicitly excluded.
- The box helper uses green wireframe (`0x00ff00`).
- Each box helper is tagged with `userData.debugType = 'bbox'`.
- The box helper is named `${entityName}_bbox`.

**Example scene with bboxes:**

```
Scene
├── ground (Mesh)
├── bunny (Mesh)        ← the entity placeholder
├── bunny_bbox (BoxHelper) ← green wireframe around bunny
├── tree (Mesh)
├── tree_bbox (BoxHelper)
```

---

### 5. Joint Skeleton Visualization

When `showJointSkeletons: true`, wireframe line segments representing the
joint hierarchy are drawn inside each jointed model entity.

```typescript
const result = buildScene(project, { showJointSkeletons: true });
```

**Skeleton templates by entity subtype:**

| Entity type | Segments | Description |
|---|---|---|
| `SBiped` | 13 | Humanoid: spine, head, 2 arms (upper+lower), 2 legs (upper+lower), pelvis |
| `SQuadruped` | 10 | Four-legged: spine, head, tail, 4 legs (upper+lower) |
| `SFlyer` | 6 | Flying: spine, head, 2 wings (upper+lower) |
| `SProp` | 3 | Minimal cross: 3 perpendicular line segments through center (props have no meaningful joint hierarchy) |
| `SJointedModel` (base) | 3 | Falls back to the prop cross template when no specific subtype matches |

Each template is a predefined set of `[start, end]` vertex pairs in local
coordinates, scaled to match the entity's bounding size.

**Skeleton properties:**

| Property | Value |
|---|---|
| Color | `0xffff00` (yellow) |
| Line width | 1 (default) |
| Depth test | Enabled (occluded by entity mesh) |
| `userData.debugType` | `'skeleton'` |
| Segment cap | 50 per entity (prevents resource exhaustion) |

**Example — biped skeleton (13 segments):**

```
          ●  head
          |
    ●─────●─────●  shoulders
    |     |     |
    ●     ●     ●  elbows / spine-mid
    |     |     |
    ●     ●     ●  hands / pelvis
          |\ /|
          ● X ●    hips
          |/ \|
          ●   ●    knees
          |   |
          ●   ●    feet
```

The skeleton is added as a `THREE.LineSegments` directly to the scene. It is
named `${entityName}_skeleton` and tagged with `userData.debugType = 'skeleton'`
for future toggling.

---

## Debug Object Tagging

All debug visualizations are tagged via `THREE.Object3D.userData.debugType`.
This enables future UI toggles without changing the builder:

| `userData.debugType` | Object | Created by |
|---|---|---|
| `'grid'` | `GridHelper` | `showGroundGrid` |
| `'bbox'` | `BoxHelper` | `showBoundingBoxes` |
| `'skeleton'` | `LineSegments` | `showJointSkeletons` |

**Future toggle pattern** (not implemented yet — shown for reference):

```typescript
// Toggle all bounding boxes
scene.traverse((obj) => {
  if (obj.userData.debugType === 'bbox') {
    obj.visible = !obj.visible;
  }
});
```

---

## Integration with main.ts

`main.ts` consumes the expanded `SceneBuildResult`:

```typescript
// Before (still works):
const { scene, camera } = buildScene(project);

// After — with full configuration:
const { scene, camera, cameraConfig, lights } = buildScene(project, {
  showGroundGrid: true,
  showBoundingBoxes: true,
  showJointSkeletons: true,
  cameraTarget: { x: 0, y: 1, z: 0 },
  cameraMinDistance: 2,
  cameraMaxDistance: 100,
});
    minDistance: 2,
    maxDistance: 100,
currentScene = scene;
currentCamera = camera;
resizeRenderer();

// Apply camera config to OrbitControls
controls?.dispose();
controls = new OrbitControls(camera, canvas);
controls.target.set(cameraConfig.target.x, cameraConfig.target.y, cameraConfig.target.z);
controls.minDistance = cameraConfig.minDistance;
controls.maxDistance = cameraConfig.maxDistance;
controls.maxPolarAngle = cameraConfig.maxPolarAngle;
controls.enableDamping = cameraConfig.enableDamping;
```

The scene builder remains **DOM-free** — it never touches `document`, `window`,
or the canvas element. All DOM-dependent setup (OrbitControls, renderer)
stays in `main.ts`.

---

## Configuration Recipes

### Classroom demo (grid + bboxes, default lights)

```typescript
buildScene(project, {
  showGroundGrid: true,
  showBoundingBoxes: true,
});
```

### Animation debugging (skeletons + tight camera)

```typescript
buildScene(project, {
  showJointSkeletons: true,
  cameraTarget: { x: 0, y: 1.5, z: 0 },
  cameraMinDistance: 1,
  cameraMaxDistance: 20,
});
```

### Full debug overlay

```typescript
buildScene(project, {
  showGroundGrid: true,
  showBoundingBoxes: true,
  showJointSkeletons: true,
  lights: [
    { type: 'ambient', color: 0xffffff, intensity: 0.6 },
    { type: 'directional', color: 0xffffff, intensity: 1.0,
      position: { x: 5, y: 10, z: 7 } },
  ],
  cameraTarget: { x: 0, y: 1, z: 0 },
  cameraMinDistance: 2,
  cameraMaxDistance: 100,
});
```

### Production render (no debug, custom studio lights)

```typescript
buildScene(project, {
  lights: [
    { type: 'ambient', color: 0x333333, intensity: 0.2 },
    { type: 'directional', color: 0xffeedd, intensity: 1.0,
      position: { x: 8, y: 12, z: 5 } },
    { type: 'hemisphere', color: 0x87ceeb, groundColor: 0x4a7c3f,
      intensity: 0.5 },
  ],
});
```

---

## Architecture

```
src/
  scene-builder.ts    ← Modified: +5 interfaces, +9 internal helpers
    Exports:
      buildScene(project, options?)  — main entry point
      SceneBuildOptions              — configuration interface
      SceneBuildResult               — return type
      LightConfig                    — light configuration
      CameraConfig                   — camera/orbit configuration
      SceneLights                    — post-build light handle

  main.ts             ← Modified: consumes cameraConfig from SceneBuildResult

test/
  scene-builder.test.ts  ← New: 33 test cases
```

### Internal helpers (not exported)

| Helper | Purpose |
|---|---|
| `clampIntensity(value)` | Clamps light intensity to `[0, 10]`. |
| `createLightFromConfig(cfg)` | Creates a Three.js light from a single `LightConfig`, clamps intensity. |
| `createSceneLightsAPI(scene, tracked)` | Creates the `SceneLights` management handle. |
| `buildCameraConfig(opts?)` | Builds `CameraConfig` from `SceneBuildOptions`, clamps distances. |
| `getSkeletonTemplate(typeName)` | Returns segment template array for entity type, or null. |
| `createSkeletonVis(obj, template)` | Creates `LineSegments` from template scaled to entity size. |
| `createMeshForObject(obj)` | Dispatches to ground, prop, or generic mesh creation. |
| `createGround(obj)` | Creates ground plane mesh. |
| `createPropPlaceholder(obj)` | Creates box mesh for prop/model entities. |
| `createGenericPlaceholder(obj)` | Creates sphere mesh for unknown entity types. |
| `applyTransform(mesh, obj)` | Sets position and quaternion from entity data. |

---

## Limitations

- **No runtime toggle API.** Debug objects are tagged with `userData.debugType`
  but there is no built-in show/hide toggle. Use `scene.traverse()` to
  toggle visibility manually (see Debug Object Tagging section).
- **Skeleton templates are approximate.** Joint positions are predefined
  templates, not parsed from actual Alice model data. They show the
  expected skeleton shape at the correct scale, but do not reflect
  custom joint positions from the .a3p file.
- **Skeleton segments capped at 50.** Per-entity segment count is capped
  to prevent resource exhaustion with malformed data.
- **Grid z-fighting.** The grid is placed at `y = 0.01` to avoid z-fighting
  with the ground plane. At extreme zoom distances, minor flickering may
  still occur.
- **OrbitControls require DOM.** `scene-builder.ts` returns config only —
  `main.ts` must create the actual `OrbitControls` instance with a canvas
  reference. This is by design (scene builder stays DOM-free).
- **No spotlight support.** The four light types (ambient, directional,
  point, hemisphere) cover common cases. Spotlights can be added in a
  future iteration by extending `LightConfig.type`.

## Security

- **No new dependencies.** All rendering uses existing Three.js primitives.
- **No I/O or network calls.** Scene builder is pure computation.
- **DOM-free.** No `innerHTML`, string interpolation, or document access.
- **Defensive clamping.** Light intensity clamped to `[0, 10]`. Camera
  distances clamped to prevent degenerate states. Skeleton segments capped
  at 50 per entity.

---

## See Also

- [Story API — Scene & Entity Model](story-api.md) — Entity hierarchy
  (`SBiped`, `SFlyer`, `SQuadruped`, `SProp`) that skeleton templates map to.
- [Tweedle Parser](tweedle-parser.md) — How `.a3p` projects are parsed into
  the `AliceProject` consumed by `buildScene()`.
