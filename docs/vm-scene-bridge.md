# VM Scene Bridge

`VmSceneBridge` connects Tweedle VM method dispatch to the web scene runtime. It is the side-effect boundary for VM-driven scene behavior: scene graph mutation, animation queueing, VM method handling, overlay DOM lifecycle, and UI-facing runtime effects stay in the bridge.

Pure transform, argument-mapping, and entity-selection logic belongs in nearby internal helper modules. Those helpers are implementation details, may be imported by bridge tests only, and must not be re-exported from `src/index.ts` as package API.

## Public surface

Use the public `VmSceneBridge` module export for runtime integration:

```ts
const runtime = VmSceneBridge.createVmSceneRuntime(project, {
  overlayContainer,
  projectWorldToScreen
});

runtime.runWorld();
```

For lower-level tests or custom runtime wiring, create a bridge directly and register scene nodes by stable entity ID:

```ts
const bridge = new VmSceneBridge.VmSceneBridge({
  animationQueue,
  overlayContainer
});

bridge.registerEntity(rabbit.name, rabbitNode);

bridge.handleMethodCall(rabbitRuntimeObject, "move", ["FORWARD", 2, 1, "gentle"], vmState);
```

`createSceneGraphForProject(project)` maps Alice project objects into scene graph nodes, attaches them to the scene graph root, and records entity IDs from the project object names. The helper refactor must preserve those IDs across registration and scene graph updates.

## Runtime behavior

### Entity resolution

The bridge resolves primary VM targets through registered entity IDs. If the primary target cannot be resolved, the bridge does not mutate the scene or DOM. Unsupported methods are likewise left unhandled.

Scene node selection is deterministic:

| Alice object kind | Scene node behavior |
| --- | --- |
| Camera | Uses a camera scene node |
| Sun/light | Uses a light scene node |
| Scene/group/container | Uses a group transform node |
| Visual/model object | Uses a visual scene node with the object's resource reference |
| Unknown/fallback object | Uses the default transform-capable visual node behavior |

Methods that reference a secondary entity, such as `place`, `pointAt`, `orientTo`, `moveToward`, `turnToFace`, or `setVehicle`, leave the primary target unchanged when that secondary target is missing or invalid.

### Permissive defaults vs no-ops

The bridge preserves Alice-style permissive behavior, but target failures and malformed scalar values are handled differently:

| Input condition | Behavior |
| --- | --- |
| Missing primary VM target | No scene, animation, or DOM side effect |
| Unsupported method | Not handled by the bridge |
| Missing or invalid secondary target | Method is a no-op for the registered primary target |
| Malformed movement, angle, distance, offset, or duration | Normalized to the Alice-compatible numeric default, usually `0` |
| Missing or malformed resize factor | Defaults to `1` |
| Missing or malformed direction | Uses the method's Alice-compatible direction default |
| Malformed color | Leaves the current material color unchanged |
| Material method on a non-visual node | No-op |
| Non-string overlay text | Converted to text with `String(value ?? "")` |

Defaults never create entities, never resolve unknown targets, and never make helper modules mutate runtime state.

### Transform methods

Spatial VM methods update the resolved scene node immediately or enqueue an animation.

| Method | Behavior |
| --- | --- |
| `move` | Moves along a local direction projected into world space |
| `turn` | Rotates around the local yaw axis |
| `roll` | Rotates around the local roll axis |
| `resize` | Scales uniformly by the supplied factor |
| `place` | Places the object at a spatial relation to a valid target |
| `pointAt` | Orients the object toward a valid target |
| `orientTo` | Copies world orientation from a valid target |
| `moveToward` | Moves toward a valid target by the supplied distance |
| `turnToFace` | Rotates to face a valid target without changing position |
| `setVehicle` | Reparents under a valid vehicle while preserving the object's world transform |

For transform methods that accept duration arguments, a finite duration greater than `0` queues animation when an animation queue is available. A duration of `0`, a missing duration, an invalid duration, or a missing animation queue applies the final transform immediately. Easing/style values are normalized only for queued animations; the default is linear unless the style maps to a gentle/ease-in-out curve.

`setVehicle` preserves the current world transform across reparenting. The contract is intentionally phrased as world transform rather than only world position, so implementation and tests should cover position, orientation, and scale preservation where applicable.

### Overlay methods

`say` and `think` create text-only overlay bubbles attached to the resolved primary target.

Overlay behavior:

- Text is inserted with text-only DOM APIs such as `textContent`, never HTML.
- Bubble type is represented through class or dataset values.
- Positive durations create timed overlays that remove themselves when the queued overlay animation completes.
- Missing, invalid, or non-positive durations do not imply animation.
- Projection defaults are used when a screen-space projector is not supplied.
- Invalid primary targets do not create overlay nodes.
- DOM creation, insertion, style mutation, repositioning, and removal stay inside `VmSceneBridge`.

If overlay-adjacent helpers are introduced, they may compute text, kind, projection defaults, class names, or dataset values, but they must not create, append, remove, or mutate DOM nodes.

Example:

```ts
bridge.handleMethodCall(rabbitRuntimeObject, "think", ["Where did the key go?", 3], vmState);
```

## Internal helper modules

The refactor splits pure logic out of `vm-scene-bridge.ts` without changing the public package API. Helper modules are internal bricks: focused, testable, and side-effect free.

### `vm-scene-bridge-transforms`

Pure helpers for transform math.

Responsibilities:

- Clone transforms without preserving mutable references.
- Convert between local and world-space movement.
- Scale vectors and transforms.
- Invert and compose orientation data.
- Compute projected local and world transforms for animation.
- Preserve world transforms during vehicle reparenting.

Transform helpers return data only. They never mutate scene nodes, enqueue animations, access the DOM, or call VM callbacks.

### `vm-scene-bridge-mapping`

Pure helpers for VM argument normalization.

Responsibilities:

- Normalize numeric arguments with Alice-compatible defaults.
- Map positive duration and style arguments into animation options.
- Convert VM color values into scene color values.
- Normalize direction, distance, scale, relation, and transform inputs.
- Provide overlay projection/default positioning values.
- Preserve permissive handling for malformed scalar values.

Mapping helpers do not resolve entities and do not decide whether missing targets are valid. They normalize values after the bridge has identified the applicable method and target context.

### `vm-scene-bridge-entities`

Pure helpers for object and entity mapping.

Responsibilities:

- Resolve Alice object records into scene-node candidates.
- Select default transform-capable nodes.
- Compute stable entity IDs from project object data.
- Build detached project scene-node maps.
- Provide default mappings for cameras, lights, visuals, groups, and fallback objects.

Entity helpers do not mutate a live project, live scene graph, DOM, animation queue, or VM state. The bridge remains responsible for attaching nodes, registration, and runtime side effects.

## Configuration

No new runtime configuration is required.

For local validation and CI-equivalent checks, use the saved Node memory preference:

```sh
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run build
```

This setting is only for build and test execution. It does not change bridge runtime behavior.
