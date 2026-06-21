# Animation System

The animation module (`src/animation.ts`) now models the richer Alice/Java
animation stack: keyframe timelines, sequential and parallel composition,
property animation, Java-style animation styles, and observer callbacks. The
system stays tick-driven and renderer-agnostic, so it works in tests, Node.js,
and the browser.

## Overview

| Export | Kind | Purpose |
|---|---|---|
| `AnimationTimeline<T>` | class | Keyframe timeline with per-segment interpolation |
| `Tween<T>` | class | Simple two-keyframe timeline wrapper |
| `PropertyAnimation<T>` | class | Animates a setter from value A to B over time |
| `SequentialAnimation` / `doInOrder()` | class/function | Compose animations one after another |
| `ParallelAnimation` / `doTogether()` | class/function | Compose animations in parallel |
| `TraditionalStyle`, `AbruptStyle`, `GentleStyle` | style types | Java-faithful style curves |
| `linear`, `easeIn`, `easeOut`, `easeInOut`, `bounce` | `EasingFn` | Segment easing helpers |
| `lerpVec3`, `nlerp`, `lerpScalar`, `lerpSize` | functions | Value interpolation helpers |
| `AnimationObserver` | interface | `started`, `updated`, `finished`/`completed` callbacks |

Story entities (`move`, `turn`, `roll`, `resize`) and story properties can use
these animations directly by supplying a duration and optional style.
Joint poses and joint arrays use the same animation style names in queued joint
animation requests; see [Joint manipulation](./joint-manipulation.md) for the
joint animation request and verification contract.

## Quick Start

```typescript
import { Tween, easeInOut, lerpVec3 } from './animation';
import type { Vec3 } from './story-api';

// Move a bunny from origin to (5, 0, -3) over 2 seconds
const tween = new Tween({
  from: { x: 0, y: 0, z: 0 },
  to: { x: 5, y: 0, z: -3 },
  durationMs: 2000,
  easing: easeInOut,
  interpolate: lerpVec3,
});

// Game loop — call update() each frame with delta time in milliseconds
function tick(deltaMs: number) {
  const state = tween.update(deltaMs);
  scene.setEntityPosition('bunny', state.value);

  if (state.complete) {
    console.log('Animation finished');
  }
}
```

### Animating Orientation (Quaternion)

```typescript
import { Tween, easeIn, nlerp } from './animation';
import type { Orientation } from './story-api';

const identity: Orientation = { x: 0, y: 0, z: 0, w: 1 };
const rotated: Orientation = { x: 0, y: 0.707, z: 0, w: 0.707 };

const tween = new Tween({
  from: identity,
  to: rotated,
  durationMs: 1000,
  easing: easeIn,
  interpolate: nlerp,
});
```

### Animating Opacity (Scalar)

```typescript
import { Tween, easeOut, lerpScalar } from './animation';

// Fade out over 500ms
const tween = new Tween({
  from: 1.0,
  to: 0.0,
  durationMs: 500,
  easing: easeOut,
  interpolate: lerpScalar,
});
```

## Types

### `EasingFn`

```typescript
type EasingFn = (t: number) => number;
```

A function that maps a normalized progress value `t ∈ [0, 1]` to an eased
output value. The four built-in easings guarantee output in `[0, 1]` for
input in `[0, 1]`.

### `Vec3`

```typescript
interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
```

A 3D vector. Structurally identical to `Position` — exported from
`story-api/types.ts` as a separate named interface so animation code reads
naturally without importing scene-domain names. Code that accepts `Position`
also accepts `Vec3` and vice versa (structural typing).

### `BoundingBox`

```typescript
interface BoundingBox {
  readonly min: Vec3;
  readonly max: Vec3;
}
```

Axis-aligned bounding box defined by minimum and maximum corner points.
Used by the a3p parser for model resource bounding volumes, not directly
by the animation system — but exported from the same types module.

### `TweenConfig<T>`

```typescript
interface TweenConfig<T> {
  from: T;
  to: T;
  durationMs: number;
  easing: EasingFn;
  interpolate: (a: T, b: T, t: number) => T;
}
```

Configuration for creating a `Tween`. The `interpolate` function is called with
the eased `t` value (not raw progress).

| Field | Type | Description |
|---|---|---|
| `from` | `T` | Start value |
| `to` | `T` | End value |
| `durationMs` | `number` | Total duration in milliseconds (must be > 0, finite) |
| `easing` | `EasingFn` | Easing curve to apply to raw progress |
| `interpolate` | `(a: T, b: T, t: number) => T` | Interpolation function for the value type |

### `TweenState<T>`

```typescript
interface TweenState<T> {
  value: T;
  progress: number;
  complete: boolean;
}
```

Returned by `Tween.update()` on each tick.

| Field | Type | Description |
|---|---|---|
| `value` | `T` | Current interpolated value |
| `progress` | `number` | Raw progress `[0, 1]` (before easing) |
| `complete` | `boolean` | `true` when the tween has reached or exceeded `durationMs` |

## Easing Functions

All four easings are simple, standalone functions:

```typescript
import { linear, easeIn, easeOut, easeInOut } from './animation';

linear(0.5);    // 0.5    — constant velocity
easeIn(0.5);    // 0.25   — slow start, fast end (t²)
easeOut(0.5);   // 0.75   — fast start, slow end (1-(1-t)²)
easeInOut(0.5); // 0.5    — slow start, slow end (3t²-2t³)
```

### Formulas

| Easing | Formula | Behavior |
|---|---|---|
| `linear` | `t` | Constant speed |
| `easeIn` | `t²` | Accelerate from rest |
| `easeOut` | `1 - (1-t)²` | Decelerate to rest |
| `easeInOut` | `3t² - 2t³` | Accelerate then decelerate (Hermite smoothstep) |

All functions accept any `number` but are designed for `t ∈ [0, 1]`. Clamping
is done inside `Tween.update()`, not in the easing functions themselves — this
allows custom easings to overshoot if desired.

## Interpolation Functions

### `lerpVec3(a, b, t)`

Linear interpolation between two `Vec3` values, component-wise.

```typescript
lerpVec3({ x: 0, y: 0, z: 0 }, { x: 10, y: 5, z: -2 }, 0.5);
// → { x: 5, y: 2.5, z: -1 }
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `a` | `Vec3` | Start vector |
| `b` | `Vec3` | End vector |
| `t` | `number` | Interpolation factor `[0, 1]` |

**Returns:** `Vec3` — the interpolated vector.

### `nlerp(a, b, t)`

Normalized linear interpolation between two quaternions. This is cheaper than
`slerp` and visually indistinguishable for small rotations (which covers most
Alice animations). The result is always normalized to unit length.

```typescript
const identity = { x: 0, y: 0, z: 0, w: 1 };
const rotated  = { x: 0, y: 0.707, z: 0, w: 0.707 };

nlerp(identity, rotated, 0.5);
// → { x: 0, y: ~0.383, z: 0, w: ~0.924 } (normalized)
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `a` | `Orientation` | Start quaternion |
| `b` | `Orientation` | End quaternion |
| `t` | `number` | Interpolation factor `[0, 1]` |

**Returns:** `Orientation` — the normalized interpolated quaternion.

**Edge case:** If the interpolated quaternion has zero length (degenerate input),
`nlerp` returns the identity quaternion `{ x: 0, y: 0, z: 0, w: 1 }`.

### `lerpScalar(a, b, t)`

Linear interpolation between two numbers.

```typescript
lerpScalar(0, 1, 0.75); // → 0.75
lerpScalar(100, 200, 0.5); // → 150
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `a` | `number` | Start value |
| `b` | `number` | End value |
| `t` | `number` | Interpolation factor `[0, 1]` |

**Returns:** `number`

## Tween Class

`Tween<T>` is a generic, tick-driven animation driver. It tracks elapsed time,
applies easing, and produces interpolated values.

### Constructor

```typescript
new Tween<T>(config: TweenConfig<T>)
```

**Throws:**

| Error | Condition |
|---|---|
| `TypeError` | `durationMs` is ≤ 0, `NaN`, or `Infinity` |

### `update(deltaMs: number): TweenState<T>`

Advance the tween by `deltaMs` milliseconds and return the current state.

```typescript
const state = tween.update(16.67); // one frame at 60fps
console.log(state.value);     // interpolated value at current time
console.log(state.progress);  // raw progress 0–1
console.log(state.complete);  // true if animation is done
```

**Behavior:**

1. Adds `deltaMs` to internal elapsed time
2. Computes raw progress: `clamp(elapsed / durationMs, 0, 1)`
3. Applies easing: `easedT = easing(progress)`
4. Computes value: `interpolate(from, to, easedT)`
5. Returns `{ value, progress, complete: progress >= 1 }`

Once complete, subsequent calls to `update()` continue to return the final
state (`to` value, progress `1`, complete `true`). The tween does not reset.

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `deltaMs` | `number` | Time elapsed since last tick, in milliseconds |

**Returns:** `TweenState<T>`

### `isComplete` (getter)

```typescript
get isComplete(): boolean
```

Returns `true` if the tween has reached its duration. Equivalent to checking
`update().complete` without advancing time.

### `reset()`

```typescript
tween.reset();
```

Resets elapsed time to 0, allowing the tween to replay from the beginning.

## Integration with Scene

The animation module is decoupled from the scene — it produces values that
you apply to entities through the existing Scene API:

```typescript
import { Tween, easeInOut, lerpVec3, nlerp, lerpScalar } from './animation';
import { Scene } from './story-api';

// Position animation
const moveTween = new Tween({
  from: { x: 0, y: 0, z: 0 },
  to: { x: 5, y: 0, z: -3 },
  durationMs: 2000,
  easing: easeInOut,
  interpolate: lerpVec3,
});

// Rotation animation (runs concurrently)
const rotateTween = new Tween({
  from: { x: 0, y: 0, z: 0, w: 1 },
  to: { x: 0, y: 0.707, z: 0, w: 0.707 },
  durationMs: 2000,
  easing: easeInOut,
  interpolate: nlerp,
});

function gameLoop(deltaMs: number) {
  const move = moveTween.update(deltaMs);
  const rotate = rotateTween.update(deltaMs);

  scene.setEntityPosition('bunny', move.value);
  scene.setEntityOrientation('bunny', rotate.value);
}
```

Multiple tweens can run independently. There is no global timeline or
animation manager — composition is done by the caller.

## Input Validation

- `durationMs` must be a positive finite number. `Tween` constructor throws
  `TypeError` for `0`, negative, `NaN`, or `Infinity`.
- `deltaMs` is accepted as any number. Negative values are treated as 0
  (time doesn't go backwards). `NaN` is treated as 0.
- All easing functions accept any `number` — clamping happens in `Tween.update()`.
- `lerpVec3` and `nlerp` assume numeric inputs. Non-finite components produce
  non-finite outputs (no validation — this is a hot path).

## Testing

Tests are in `test/animation.test.ts` and cover:

- Each easing function at boundary values (0, 0.5, 1) and mid-range
- `lerpVec3` component-wise interpolation
- `nlerp` quaternion normalization and identity fallback for zero-length
- `lerpScalar` basic interpolation
- `Tween` lifecycle: creation → update → completion → reset
- `Tween` with zero and negative delta times
- `Tween` overshoot (large delta exceeding duration)
- Constructor validation (invalid `durationMs`)
- Concurrent tweens producing independent state

## Entity Animations

Higher-level animation classes in `src/entity-animation.ts` wrap the core
animation primitives for entity-specific operations:

| Class | Purpose |
|---|---|
| `MoveAnimation` | Animate entity position via `PropertyAnimation<Position>` |
| `TurnAnimation` | Animate entity orientation via quaternion interpolation |
| `RollAnimation` | Animate entity roll around a directional axis |
| `ResizeAnimation` | Animate entity size scaling |
| `OpacityAnimation` | Animate entity opacity (0–1) |
| `SayAnimation` | Display speech bubble text on a model entity |
| `ThinkAnimation` | Display thought bubble text on a model entity |
| `SayOutLoudAnimation` | TTS playback through browser SpeechSynthesis adapter when available, with explicit status otherwise |
| `PlayAudioAnimation` | Trigger audio playback on an entity |
| `VehicleAnimation` | Attach/detach entity vehicle relationships |

Project audio metadata can describe cues intended for animation timeline
synchronization. See [Audio](./audio.md#animation-synchronized-cues) for the cue
schema and [Tutorial: Alice audio workflow](./tutorial-audio-workflow.md) for an
end-to-end save and reload example.

For `SayOutLoudAnimation` details (TTS parity with Java Alice), see
[Parity gaps #76–#77](./parity-gaps-76-77.md#sayoutloud-tts-animation).

## Limitations

- **No slerp.** Quaternion interpolation uses `nlerp` (normalized lerp), which
  has slightly non-constant angular velocity for large rotations. This is
  adequate for Alice's typical small-angle animations.
- **No chaining/sequencing.** Tweens are standalone. To chain animations (A then
  B), check `isComplete` on A before starting B. A timeline/sequence abstraction
  may be added later.
- **No auto-repeat/yoyo.** Call `reset()` manually if you want a tween to loop.
- **Single-segment only.** Each tween interpolates between exactly two values.
  For multi-keyframe paths, chain multiple tweens or build a higher-level
  abstraction.
