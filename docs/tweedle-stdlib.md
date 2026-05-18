# Tweedle Standard Library

The Tweedle standard library (`src/tweedle-stdlib.ts`) implements the nine
runtime primitives that Alice3 story programs use to manipulate entities. Each
function matches a Java `story-api` method from `org.lgna.story`.

## Overview

| Function | Java Equivalent | Mutates Entity | Side Effect |
|---|---|---|---|
| `say` | `SThing.say()` | No | Records text in WeakMap |
| `think` | `SThing.think()` | No | Records text in WeakMap |
| `move` | `SMovableTurnable.move()` | Yes (position) | — |
| `turn` | `STurnable.turn()` | Yes (orientation) | — |
| `roll` | `STurnable.roll()` | Yes (orientation) | — |
| `resize` | `SModel.setSize()` | Yes (size) | — |
| `setOpacity` | `SModel.setOpacity()` | Yes (opacity) | — |
| `setColor` | `SModel.setColor()` | Yes (color) | — |
| `delay` | `Duration.delay()` | No | Records duration |

All functions validate their arguments and throw `TypeError` on invalid input.
Exports are `Object.freeze`'d where applicable.

## Quick Start

```typescript
import {
  say,
  think,
  move,
  turn,
  roll,
  resize,
  setOpacity,
  setColor,
  delay,
  getLastSaid,
  getLastThought,
  getDelays,
} from "./tweedle-stdlib";
import { Direction } from "./collision-detection";
import { SModel, SBiped } from "./story-api/entities";

const bunny = new SBiped();
bunny.position = { x: 0, y: 0, z: 0 };

// Speech and thought bubbles
say(bunny, "Hello!");
getLastSaid(bunny); // "Hello!"

think(bunny, "Hmm...");
getLastThought(bunny); // "Hmm..."

// Movement
move(bunny, Direction.FORWARD, 3);
// bunny.position is now { x: 0, y: 0, z: -3 }

// Rotation (yaw)
turn(bunny, Direction.LEFT, Math.PI / 2);
// bunny.orientation rotated 90° left around Y axis

// Roll (around forward axis)
roll(bunny, Direction.LEFT, Math.PI / 4);
// bunny.orientation rolled 45° left around Z axis

// Appearance
resize(bunny, 2.0);
// bunny.size is now { width: 2, height: 2, depth: 2 }

setOpacity(bunny, 0.5);
// bunny.opacity is now 0.5

setColor(bunny, "RED");
// bunny.color is now "RED"

// Timing
delay(1.5);
getDelays(); // [1.5]
```

## API Reference

### `say(entity: SThing, text: string): void`

Records speech text for an entity. Does not modify the entity object itself —
state is tracked in a module-scoped `WeakMap` so it does not leak or prevent
garbage collection.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `SThing` | The speaking entity |
| `text` | `string` | Text to "say" |

**Throws:** `TypeError` if `entity` is not an `SThing` or `text` is not a
string.

```typescript
const alice = new SBiped();
say(alice, "Hello, world!");
say(alice, "Goodbye!"); // overwrites previous
```

### `getLastSaid(entity: SThing): string | undefined`

Returns the most recent text passed to `say()` for the given entity, or
`undefined` if `say()` has never been called on it.

```typescript
const alice = new SBiped();
getLastSaid(alice);         // undefined
say(alice, "Hi");
getLastSaid(alice);         // "Hi"
```

### `think(entity: SThing, text: string): void`

Records thought text for an entity. Identical to `say()` but uses a separate
`WeakMap`, matching the distinction between `say()` and `think()` speech
bubbles in Alice3.

**Throws:** `TypeError` if `entity` is not an `SThing` or `text` is not a
string.

### `getLastThought(entity: SThing): string | undefined`

Returns the most recent text passed to `think()` for the given entity.

### `move(entity: SMovableTurnable, direction: Vec3, amount: number): void`

Translates an entity along a direction vector by the given amount. The new
position is computed as:

```
newPosition = oldPosition + (direction * amount)
```

The direction vector is not required to be normalized — it is used as-is and
scaled by `amount`. Typically used with `Direction` constants from
`collision-detection.ts`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `SMovableTurnable` | Entity to move |
| `direction` | `Vec3` | Direction vector |
| `amount` | `number` | Distance to move (finite number) |

**Throws:** `TypeError` if entity is not `SMovableTurnable`, direction
contains non-finite values, or amount is not finite.

```typescript
const model = new SModel();
model.position = { x: 0, y: 0, z: 0 };

move(model, Direction.RIGHT, 5);
// model.position → { x: 5, y: 0, z: 0 }

move(model, Direction.UP, 2);
// model.position → { x: 5, y: 2, z: 0 }

move(model, { x: 1, y: 1, z: 0 }, 3);
// model.position → { x: 8, y: 5, z: 0 }
```

### `turn(entity: STurnable, direction: Vec3, amount: number): void`

Rotates an entity around the **Y axis** (yaw) by `amount` radians. The
`direction` vector determines rotation sign:

- `Direction.LEFT` → positive angle (counter-clockwise when viewed from above)
- `Direction.RIGHT` → negative angle (clockwise from above)

Only the X component of the direction vector is used to determine sign:
negative X = left/positive rotation, positive X = right/negative rotation.
`Direction.FORWARD` and `Direction.BACKWARD` are also accepted (zero X
component = no rotation).

Rotation is applied via quaternion multiplication on the entity's existing
`orientation`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `STurnable` | Entity to rotate |
| `direction` | `Vec3` | Direction hint (LEFT or RIGHT) |
| `amount` | `number` | Rotation angle in radians |

**Throws:** `TypeError` if entity is not `STurnable`, direction is invalid, or
amount is not finite.

```typescript
const model = new SModel();

// Turn 90° left
turn(model, Direction.LEFT, Math.PI / 2);

// Turn 45° right
turn(model, Direction.RIGHT, Math.PI / 4);
```

### `roll(entity: STurnable, direction: Vec3, amount: number): void`

Rotates an entity around the **Z axis** (roll / forward axis) by `amount`
radians. Direction semantics match `turn()`:

- `Direction.LEFT` → positive angle (counter-clockwise when viewed from front)
- `Direction.RIGHT` → negative angle

Applied via quaternion multiplication on the entity's `orientation`.

**Parameters:** Same as `turn()`.

**Throws:** Same as `turn()`.

```typescript
const model = new SModel();

// Roll 30° left
roll(model, Direction.LEFT, Math.PI / 6);
```

### `resize(entity: SModel, factor: number): void`

Multiplies all dimensions of the entity's `size` by `factor`:

```
newSize = { width: w * factor, height: h * factor, depth: d * factor }
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `SModel` | Entity to resize |
| `factor` | `number` | Scale factor (must be finite and > 0) |

**Throws:** `TypeError` if entity is not `SModel`, or factor is not finite or
≤ 0.

```typescript
const model = new SModel();
model.size = { width: 2, height: 3, depth: 1 };

resize(model, 2);
// model.size → { width: 4, height: 6, depth: 2 }

resize(model, 0.5);
// model.size → { width: 2, height: 3, depth: 1 }
```

### `setOpacity(entity: SModel, opacity: number): void`

Sets the entity's opacity. Accepts any finite number, matching `SModel`'s
setter behavior (no additional clamping).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `SModel` | Entity to modify |
| `opacity` | `number` | New opacity value (finite number) |

**Throws:** `TypeError` if entity is not `SModel` or opacity is not finite.

```typescript
setOpacity(model, 0.5);  // semi-transparent
setOpacity(model, 1.0);  // fully opaque
setOpacity(model, 0.0);  // fully transparent
```

### `setColor(entity: SModel, color: string): void`

Sets the entity's color. Accepts any non-empty string.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `SModel` | Entity to modify |
| `color` | `string` | Color name (e.g., `"RED"`, `"BLUE"`) |

**Throws:** `TypeError` if entity is not `SModel` or color is not a non-empty
string.

```typescript
setColor(model, "RED");
setColor(model, "BLUE");
```

### `delay(duration: number): void`

Records a delay duration. This is a non-blocking operation — it does not
actually pause execution. Delay values are stored in a module-scoped list for
inspection by tests and the grading pipeline.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `duration` | `number` | Delay duration in seconds (must be finite and ≥ 0) |

**Throws:** `TypeError` if duration is not a finite non-negative number.

```typescript
delay(1.0);
delay(0.5);
getDelays(); // [1.0, 0.5]
```

### `getDelays(): readonly number[]`

Returns a frozen copy of all delay durations recorded since module load.

```typescript
delay(2.0);
delay(0.5);
const d = getDelays(); // [2.0, 0.5]
```

### `clearDelays(): void`

Clears the recorded delay list. Useful in tests to reset state between cases.

## Quaternion Math Details

`turn()` and `roll()` apply rotation via Hamilton product (quaternion
multiplication). The rotation quaternion for an angle θ around axis `a` is:

```
q = { x: a.x * sin(θ/2), y: a.y * sin(θ/2), z: a.z * sin(θ/2), w: cos(θ/2) }
```

- `turn()` uses axis `(0, 1, 0)` — Y-axis rotation (yaw)
- `roll()` uses axis `(0, 0, 1)` — Z-axis rotation (roll)

The new orientation is `rotation * existingOrientation` (pre-multiplication),
matching Alice3's convention of applying rotations in local space.

## State Management

### WeakMap-based text state

`say()` and `think()` store text in module-scoped `WeakMap<SThing, string>`
instances. This design:

- Avoids modifying entity class properties
- Allows garbage collection when entities are dereferenced
- Provides per-entity isolation
- Is testable via `getLastSaid()` / `getLastThought()`

### Delay recording

`delay()` pushes durations onto a module-scoped `number[]`. Use `getDelays()`
to read and `clearDelays()` to reset. The grading pipeline reads this list to
verify timing behaviors.

## Java Parity Notes

| Java `story-api` | TypeScript `tweedle-stdlib` |
|---|---|
| `SThing.say(String)` | `say(entity, text)` |
| `SThing.think(String)` | `think(entity, text)` |
| `SMovableTurnable.move(MoveDirection, Double)` | `move(entity, direction, amount)` |
| `STurnable.turn(TurnDirection, Double)` | `turn(entity, direction, amount)` |
| `STurnable.roll(RollDirection, Double)` | `roll(entity, direction, amount)` |
| `SModel.setSize(SetDimensionPolicy, Double)` | `resize(entity, factor)` |
| `SModel.setOpacity(Double)` | `setOpacity(entity, opacity)` |
| `SModel.setColor(Color)` | `setColor(entity, color)` |
| `Duration.delay(Double)` | `delay(duration)` |

**Key difference:** Java uses method-on-entity (`entity.move()`); TypeScript
uses free functions (`move(entity, ...)`) to avoid modifying the entity class
hierarchy. This is a deliberate design choice — entity classes remain pure data
holders while behavior lives in the stdlib module.
