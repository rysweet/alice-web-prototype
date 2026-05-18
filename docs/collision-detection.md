# Collision Detection & Spatial Math

The collision detection module (`src/collision-detection.ts`) provides spatial
proximity checks and axis-aligned bounding box (AABB) intersection tests that
match Java Alice's `org.alice.interact` package. All math uses Alice's Y-up
coordinate system.

## Overview

Three categories of spatial operation are exposed:

| Category | Functions | Java Equivalent |
|---|---|---|
| Distance | `euclideanDistance`, `isWithinDistance` | `TransformUtilities.getDistanceTo` |
| AABB | `aabbFromEntity`, `aabbIntersects`, `aabbContainsPoint` | `AxisAlignedBox.intersects` |
| Direction | `Direction` constant vectors | `MoveDirection` enum |

All functions are pure — they read entity state but never mutate it.

## Quick Start

```typescript
import {
  euclideanDistance,
  isWithinDistance,
  aabbFromEntity,
  aabbIntersects,
  aabbContainsPoint,
  Direction,
} from "./collision-detection";
import { SModel } from "./story-api/entities";

const bunny = new SModel();
bunny.position = { x: 0, y: 0, z: 0 };
bunny.size = { width: 1, height: 2, depth: 1 };

const cat = new SModel();
cat.position = { x: 3, y: 0, z: 0 };
cat.size = { width: 1, height: 1, depth: 1 };

// Distance
euclideanDistance(bunny.position, cat.position); // 3.0
isWithinDistance(bunny.position, cat.position, 5); // true

// AABB intersection
const boxA = aabbFromEntity(bunny);
const boxB = aabbFromEntity(cat);
aabbIntersects(boxA, boxB); // false — separated by 1.5 units

// Direction constants
Direction.FORWARD; // { x: 0, y: 0, z: -1 }
```

## API Reference

### `euclideanDistance(a: Vec3, b: Vec3): number`

Returns the Euclidean distance between two points in 3D space.

```
distance = √((a.x − b.x)² + (a.y − b.y)² + (a.z − b.z)²)
```

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `a` | `Vec3` (`Position`) | First point |
| `b` | `Vec3` (`Position`) | Second point |

**Returns:** `number` — non-negative distance. Returns `0` when points are
coincident.

**Throws:** `TypeError` if any coordinate is not a finite number.

```typescript
euclideanDistance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }); // 5
euclideanDistance({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }); // 0
```

### `isWithinDistance(a: Vec3, b: Vec3, threshold: number): boolean`

Returns `true` when the distance between `a` and `b` is ≤ `threshold`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `a` | `Vec3` | First point |
| `b` | `Vec3` | Second point |
| `threshold` | `number` | Maximum distance (must be ≥ 0) |

**Throws:** `TypeError` if `threshold` is negative, `NaN`, or `Infinity`.

```typescript
isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 2); // true
isWithinDistance({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, 2); // false
```

### `aabbFromEntity(entity: SModel): BoundingBox`

Computes an axis-aligned bounding box centered on the entity's position, sized
according to its `size` property. The box extends `width/2`, `height/2`, and
`depth/2` in each axis from the entity's position.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `entity` | `SModel` | Entity with `position` and `size` |

**Returns:** `BoundingBox` with `min` and `max` corners.

**Throws:** `TypeError` if `entity` is not an `SModel` instance.

```typescript
const model = new SModel();
model.position = { x: 5, y: 0, z: 0 };
model.size = { width: 2, height: 4, depth: 2 };

aabbFromEntity(model);
// { min: { x: 4, y: -2, z: -1 }, max: { x: 6, y: 2, z: 1 } }
```

### `aabbIntersects(a: BoundingBox, b: BoundingBox): boolean`

Returns `true` when two AABBs overlap on all three axes (separating axis test).
Touching faces (shared boundary) count as intersection.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `a` | `BoundingBox` | First bounding box |
| `b` | `BoundingBox` | Second bounding box |

```typescript
const boxA = { min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 2, z: 2 } };
const boxB = { min: { x: 1, y: 1, z: 1 }, max: { x: 3, y: 3, z: 3 } };
const boxC = { min: { x: 5, y: 5, z: 5 }, max: { x: 6, y: 6, z: 6 } };

aabbIntersects(boxA, boxB); // true  — overlapping
aabbIntersects(boxA, boxC); // false — separated
```

### `aabbContainsPoint(box: BoundingBox, point: Vec3): boolean`

Returns `true` when `point` lies inside or on the boundary of `box`.

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `box` | `BoundingBox` | Bounding box to test against |
| `point` | `Vec3` | Point to check |

```typescript
const box = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 10 } };

aabbContainsPoint(box, { x: 5, y: 5, z: 5 });   // true
aabbContainsPoint(box, { x: 0, y: 0, z: 0 });   // true  (boundary)
aabbContainsPoint(box, { x: 11, y: 5, z: 5 });  // false
```

### `Direction` (constant object)

Frozen constant vectors matching Alice3's Y-up coordinate system, equivalent to
Java's `MoveDirection` enum.

| Name | Value | Description |
|---|---|---|
| `Direction.FORWARD` | `{ x: 0, y: 0, z: -1 }` | Into the screen (Alice convention) |
| `Direction.BACKWARD` | `{ x: 0, y: 0, z: 1 }` | Out of the screen |
| `Direction.LEFT` | `{ x: -1, y: 0, z: 0 }` | Stage left |
| `Direction.RIGHT` | `{ x: 1, y: 0, z: 0 }` | Stage right |
| `Direction.UP` | `{ x: 0, y: 1, z: 0 }` | Upward |
| `Direction.DOWN` | `{ x: 0, y: -1, z: 0 }` | Downward |

All vectors are `Object.freeze`'d and typed as `Readonly<Vec3>`.

```typescript
import { Direction } from "./collision-detection";

Direction.FORWARD;  // { x: 0, y: 0, z: -1 }
Direction.UP;       // { x: 0, y: 1, z: 0 }

// Use with move() from tweedle-stdlib
move(entity, Direction.FORWARD, 3);
```

## Coordinate System

Alice uses a **right-handed Y-up** coordinate system:

```
        +Y (up)
         |
         |
         +------ +X (right)
        /
       /
      +Z (backward / toward viewer)
```

- **Forward** is into the screen: `(0, 0, -1)`
- **Right** is stage right: `(1, 0, 0)`
- **Up** is vertical: `(0, 1, 0)`

This matches Java Alice's `org.lgna.story.MoveDirection` and the Three.js
default camera orientation used in the scene renderer.

## Java Parity Notes

| Java Alice | TypeScript Equivalent |
|---|---|
| `TransformUtilities.getDistanceTo(a, b)` | `euclideanDistance(a, b)` |
| `AxisAlignedBox.intersects(other)` | `aabbIntersects(a, b)` |
| `AxisAlignedBox.contains(point)` | `aabbContainsPoint(box, point)` |
| `MoveDirection.FORWARD` etc. | `Direction.FORWARD` etc. |
| `AddObjectsToSceneInteraction.isCloseEnough` | `isWithinDistance(a, b, t)` |

The Java codebase computes distance via `AffineMatrix4x4` transforms. The
TypeScript module uses raw `Position` vectors, which is equivalent for
untransformed (world-space) coordinates.
