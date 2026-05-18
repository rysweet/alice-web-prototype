# Story API — Scene & Entity Model

The story API (`src/story-api/`) is the TypeScript port of Java Alice's
`core/story-api` scene/entity model. It provides typed scene entities
(bipeds, flyers, props, etc.) with position, orientation, and joint hierarchy,
plus a `Scene` container that the Tweedle VM uses to manipulate scenes during
lesson grading.

## Overview

The module exposes three layers:

| Layer | File | Purpose |
|---|---|---|
| Value types | `types.ts` | `Position`, `Orientation`, `Size`, `JointId` — immutable value objects |
| Entity hierarchy | `entities.ts` | Abstract class hierarchy from `SThing` down to concrete `SBiped`, `SFlyer`, etc. |
| Scene container | `scene.ts` | `Scene` class with CRUD operations and `Scene.fromProject()` bridge |

All public types and classes are barrel-exported from `src/story-api/index.ts`.

## Quick Start

```typescript
import { Scene, SBiped, SProp, Position } from './story-api';

// Create a scene and add entities
const scene = new Scene();
scene.addEntity('bunny', new SBiped());
scene.addEntity('tree', new SProp());

// Position an entity
scene.setEntityPosition('bunny', { x: 3, y: 0, z: -5 });

// Query
const bunny = scene.getEntity('bunny');
console.log(bunny?.position); // { x: 3, y: 0, z: -5 }
```

### From a parsed Alice project

```typescript
import { parseA3P } from './a3p-parser';
import { Scene } from './story-api';

const project = await parseA3P(a3pBuffer);
const scene = Scene.fromProject(project);

// All scene objects are now typed entities
for (const [name, entity] of scene.entities) {
  console.log(`${name}: ${entity.constructor.name}`);
}
// ground: SGround
// camera: SCamera
// bunny: SBiped
// bananaTree: SProp
```

## Value Types

Value types are plain readonly interfaces. They represent mathematical
primitives that entities hold as mutable references with replace-on-set
semantics (matching Java Alice's immutable value types).

### Position

```typescript
interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
```

Default: `{ x: 0, y: 0, z: 0 }`.

Alice uses Y-up coordinates, same as Three.js.

### Orientation

Quaternion representation.

```typescript
interface Orientation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}
```

Default: `{ x: 0, y: 0, z: 0, w: 1 }` (identity rotation).

### Size

```typescript
interface Size {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}
```

Default: `{ width: 1, height: 1, depth: 1 }`.

### JointId

Identifies a joint in a jointed model's skeleton hierarchy.

```typescript
interface JointId {
  readonly name: string;
  readonly parent?: string;
}
```

## Entity Hierarchy

The entity class hierarchy mirrors Java Alice's `org.lgna.story` package.
Each level adds capabilities:

```
SThing                          — base: isShowing (visibility)
├── SGround                     — ground plane (no position/orientation)
├── SScene                      — scene entity (no position/orientation)
├── STurnable                   — adds orientation
│   └── SMovableTurnable        — adds position + paint
│       ├── SCamera             — camera (position + orientation, no size)
│       └── SModel              — adds size + color + opacity + vehicle
│           └── SJointedModel   — adds joints
│               ├── SBiped      — humanoid characters
│               ├── SFlyer      — flying creatures
│               ├── SQuadruped  — four-legged animals
│               └── SProp       — inanimate objects with joints
```

### Capability Summary

| Class | orientation | position | size | joints | isShowing | color | opacity | paint | vehicle |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `SThing` | — | — | — | — | ✓ | — | — | — | — |
| `SGround` | — | — | — | — | ✓ | — | — | — | — |
| `SScene` | — | — | — | — | ✓ | — | — | — | — |
| `STurnable` | ✓ | — | — | — | ✓ | — | — | — | — |
| `SMovableTurnable` | ✓ | ✓ | — | — | ✓ | — | — | ✓ | — |
| `SCamera` | ✓ | ✓ | — | — | ✓ | — | — | ✓ | — |
| `SModel` | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `SJointedModel` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `SBiped` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `SFlyer` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `SQuadruped` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `SProp` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Construction

All entity classes accept no constructor arguments. Properties start at their
defaults:

```typescript
const biped = new SBiped();
biped.position;    // { x: 0, y: 0, z: 0 }
biped.orientation; // { x: 0, y: 0, z: 0, w: 1 }
biped.size;        // { width: 1, height: 1, depth: 1 }
biped.isShowing;   // true
biped.paint;       // "WHITE"
biped.color;       // "WHITE"
biped.opacity;     // 1.0
biped.vehicle;     // null
```

### Visual Properties

#### `isShowing` (SThing)

Controls entity visibility. Available on all entities (including SGround and
SScene) for consistency with Alice 3.

```typescript
const biped = new SBiped();
biped.isShowing;        // true (default)
biped.isShowing = false;
biped.isShowing;        // false
```

| Property | Type | Default | Validation |
|----------|------|---------|------------|
| `isShowing` | `boolean` | `true` | Non-boolean values silently rejected |

#### `color` (SModel)

Surface color as a string. Available on `SModel` and all subclasses.

```typescript
const biped = new SBiped();
biped.color;            // "WHITE" (default)
biped.color = "RED";
biped.color;            // "RED"
```

| Property | Type | Default | Validation |
|----------|------|---------|------------|
| `color` | `string` | `"WHITE"` | Empty strings and non-strings silently rejected |

#### `opacity` (SModel)

Surface opacity as a number between 0 (transparent) and 1 (opaque). Available
on `SModel` and all subclasses.

```typescript
const biped = new SBiped();
biped.opacity;          // 1.0 (default)
biped.opacity = 0.5;
biped.opacity;          // 0.5
```

| Property | Type | Default | Validation |
|----------|------|---------|------------|
| `opacity` | `number` | `1.0` | Non-finite values silently rejected |

#### `paint` (SMovableTurnable)

Paint/material as a string. Available on `SMovableTurnable` and all subclasses
(SCamera, SModel, SJointedModel, SBiped, etc.).

```typescript
const biped = new SBiped();
biped.paint;            // "WHITE" (default)
biped.paint = "BLUE";
biped.paint;            // "BLUE"
```

| Property | Type | Default | Validation |
|----------|------|---------|------------|
| `paint` | `string` | `"WHITE"` | Empty strings and non-strings silently rejected |

#### `vehicle` (SModel)

The entity's vehicle (parent transform). Available on `SModel` and all
subclasses. `null` means the entity is parented to the scene root.

```typescript
const bunny = new SBiped();
const car = new SProp();
bunny.vehicle;          // null (default — scene root)
bunny.vehicle = car;
bunny.vehicle;          // car (SProp instance)
bunny.vehicle = null;   // re-parent to scene root
```

| Property | Type | Default | Validation |
|----------|------|---------|------------|
| `vehicle` | `SThing \| null` | `null` | Non-SThing values (except null) silently rejected |

### Setter Validation Style

All entity property setters use **silent rejection** — invalid values are
ignored and the property retains its previous value. This matches the existing
pattern established by `STurnable.orientation`, `SMovableTurnable.position`,
and `SModel.size`:

```typescript
const biped = new SBiped();
biped.opacity = 0.5;

// Invalid value — silently rejected, opacity stays 0.5
biped.opacity = NaN;
biped.opacity;    // 0.5

// Invalid type — silently rejected
biped.color = "";
biped.color;      // "WHITE" (default, unchanged)
```

### Type Guards (instanceof)

Because entities are classes (not interfaces), `instanceof` checks work:

```typescript
import { SBiped, SJointedModel, SMovableTurnable, SThing } from './story-api';

const entity = new SBiped();
entity instanceof SBiped;            // true
entity instanceof SJointedModel;     // true
entity instanceof SMovableTurnable;  // true
entity instanceof SThing;            // true
```

This is used by the Tweedle VM to determine which operations are valid on an
entity (e.g., only `SMovableTurnable` and subclasses support `setPosition`).

### Joints (Not Yet Populated)

`SJointedModel` and its subclasses expose a `getJoint(name)` method that
returns `JointId | undefined`. Joint data is not currently populated from the
parser — `getJoint()` always returns `undefined`. This is sufficient for the
Tweedle VM; joint loading will be added when animation support lands.

```typescript
const biped = new SBiped();
biped.getJoint('LEFT_SHOULDER'); // undefined — joints not yet loaded
```

## Scene Container

The `Scene` class is the runtime container for entities. It is **not** an
entity itself — it corresponds to Java's `SceneImp`, not `SScene`.

### Constructor

```typescript
const scene = new Scene();
```

Creates an empty scene with no entities.

### Properties

| Property | Type | Description |
|---|---|---|
| `entities` | `ReadonlyMap<string, SThing>` | All entities by name |
| `atmosphereColor` | `string \| undefined` | Optional atmosphere color (CSS color string) |
| `fogDensity` | `number \| undefined` | Optional fog density (0–1) |
| `ambientLightColor` | `string \| undefined` | Optional ambient light color (CSS color string) |

### addEntity(name, entity)

Add a named entity to the scene.

```typescript
scene.addEntity('bunny', new SBiped());
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Unique entity name (non-empty, no whitespace-only) |
| `entity` | `SThing` | Entity instance |

**Throws:**

| Error | Condition |
|---|---|
| `TypeError` | `name` is empty or whitespace-only |
| `TypeError` | `name` already exists in the scene |

### removeEntity(name)

Remove an entity by name. Returns `true` if the entity existed and was removed,
`false` if not found.

```typescript
scene.removeEntity('bunny'); // true
scene.removeEntity('bunny'); // false (already removed)
```

### getEntity(name)

Look up an entity by name. Returns `SThing | undefined`.

```typescript
const bunny = scene.getEntity('bunny');
if (bunny instanceof SBiped) {
  console.log(bunny.position);
}
```

### setEntityPosition(name, position)

Set an entity's position. The entity must exist and must be an instance of
`SMovableTurnable` (or subclass).

```typescript
scene.setEntityPosition('bunny', { x: 3, y: 0, z: -5 });
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Entity name |
| `position` | `Position` | New position `{x, y, z}` — all values must be finite numbers |

**Throws:**

| Error | Condition |
|---|---|
| `TypeError` | Entity not found |
| `TypeError` | Entity is not an `SMovableTurnable` (e.g., `SGround`) |
| `TypeError` | Any coordinate is `NaN`, `Infinity`, or `-Infinity` |

### setEntityOrientation(name, orientation)

Set an entity's orientation. The entity must exist and must be an instance of
`STurnable` (or subclass).

```typescript
scene.setEntityOrientation('bunny', { x: 0, y: 0.707, z: 0, w: 0.707 });
```

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Entity name |
| `orientation` | `Orientation` | New quaternion `{x, y, z, w}` — all values must be finite |

**Throws:**

| Error | Condition |
|---|---|
| `TypeError` | Entity not found |
| `TypeError` | Entity is not an `STurnable` (e.g., `SGround`) |
| `TypeError` | Any component is `NaN`, `Infinity`, or `-Infinity` |

## Bridge: Scene.fromProject()

`Scene.fromProject()` is the static factory that bridges the a3p parser output
(`AliceProject`) to the typed entity model.

```typescript
import { parseA3P } from './a3p-parser';
import { Scene } from './story-api';

const project = await parseA3P(buffer);
const scene = Scene.fromProject(project);
```

### Type Mapping

The parser produces `AliceObject.typeName` as a fully-qualified Java class name
or a `"User:X"` pattern for user-defined types. `Scene.fromProject()` maps
these to entity classes:

| typeName pattern | Entity class |
|---|---|
| Contains `"SBiped"` | `SBiped` |
| Contains `"SFlyer"` | `SFlyer` |
| Contains `"SQuadruped"` | `SQuadruped` |
| Contains `"SProp"` | `SProp` |
| Contains `"SGround"` | `SGround` |
| Contains `"SCamera"` | `SCamera` |
| Contains `"SScene"` | `SScene` |
| Contains `"SJointedModel"` | `SJointedModel` |
| Contains `"SModel"` | `SModel` |
| Starts with `"User:"` | `SProp` (fallback) |
| _(anything else)_ | `SProp` (fallback) |

Matching is done with `String.includes()` on the `typeName`, checked in the order
listed above (first match wins). This handles both fully-qualified names like
`"org.lgna.story.SBiped"` and user-defined types like `"User:Prop"`.

> **Order matters:** `"SJointedModel"` contains `"SModel"` as a substring, so
> `SJointedModel` must be checked before `SModel` to avoid false matches.
> Concrete leaf types (SBiped, SFlyer, etc.) are checked first for the same
> reason.

### Transform Application

For each `AliceObject` in the project, `fromProject()`:

1. Creates the appropriate entity class based on `typeName`
2. If the entity supports position (`SMovableTurnable+`) **and** the parsed
   object has a non-null `position`, applies it
3. If the entity supports orientation (`STurnable+`) **and** the parsed object
   has a non-null `orientation`, applies it
4. If the entity supports size (`SModel+`) **and** the parsed object has a
   non-null `size`, applies it

Visual properties (`isShowing`, `paint`, `color`, `opacity`, `vehicle`) are
**not** extracted by the a3p parser — `AliceObject` does not carry these fields.
These properties use their class defaults and are set at runtime by the Tweedle
VM when executing scene setup code (e.g., `this.bunny.setOpacity(0.5)`).

If a parsed object has position/orientation/size data but the mapped entity
type doesn't support it (e.g., `SGround` with position), the data is silently
skipped. This is expected — the parser extracts all method invocations
regardless of entity capabilities.

> **`resourceType` is not consumed.** `AliceObject.resourceType` (e.g.,
> `"org.lgna.story.resources.biped.BunnyResource"`) identifies the 3D model
> resource. The story API does not store or use it — entity classes are pure
> data containers without rendering. `resourceType` remains available on the
> original `AliceObject` for `scene-builder.ts` and future model-loading code.

### Example with a real project

Given a parsed project with:

```typescript
project.sceneObjects = [
  { name: 'ground', typeName: 'org.lgna.story.SGround', resourceType: null,
    position: null, orientation: null, size: null },
  { name: 'camera', typeName: 'org.lgna.story.SCamera', resourceType: null,
    position: { x: 0, y: 5, z: 20 }, orientation: null, size: null },
  { name: 'bunny', typeName: 'org.lgna.story.SBiped',
    resourceType: 'org.lgna.story.resources.biped.BunnyResource',
    position: { x: 3, y: 0, z: -2 },
    orientation: { x: 0, y: 0.707, z: 0, w: 0.707 },
    size: { width: 1, height: 1.5, depth: 1 } },
];
```

`Scene.fromProject(project)` produces:

```typescript
scene.getEntity('ground');   // SGround  — position/orientation/size: N/A
scene.getEntity('camera');   // SCamera  — position: {x:0, y:5, z:20}
scene.getEntity('bunny');    // SBiped   — position: {x:3, y:0, z:-2}
                             //            orientation: {x:0, y:0.707, z:0, w:0.707}
                             //            size: {width:1, height:1.5, depth:1}
```

### Note: No setEntitySize method

The Scene container does not expose a `setEntitySize()` method. Size is applied
during `fromProject()` and can be set directly on entity instances that extend
`SModel`:

```typescript
const entity = scene.getEntity('bunny');
if (entity instanceof SModel) {
  entity.size = { width: 2, height: 3, depth: 2 };
}
```

A `setEntitySize()` convenience method may be added in a future iteration if
the Tweedle VM needs it.

## Input Validation

All setters enforce `Number.isFinite()` on numeric inputs. This rejects `NaN`,
`Infinity`, and `-Infinity` — common sources of rendering bugs:

```typescript
scene.setEntityPosition('bunny', { x: NaN, y: 0, z: 0 });
// → TypeError: position x must be a finite number
```

Entity names are validated on `addEntity`:

```typescript
scene.addEntity('', new SBiped());
// → TypeError: entity name must be a non-empty string

scene.addEntity('  ', new SBiped());
// → TypeError: entity name must be a non-empty string
```

Duplicate names are rejected:

```typescript
scene.addEntity('bunny', new SBiped());
scene.addEntity('bunny', new SProp());
// → TypeError: entity "bunny" already exists in scene
```

Operations on wrong entity types throw descriptive errors:

```typescript
scene.addEntity('ground', new SGround());
scene.setEntityPosition('ground', { x: 1, y: 0, z: 0 });
// → TypeError: entity "ground" (SGround) does not support position
```

## Module Exports

Everything is exported from the barrel at `src/story-api/index.ts`:

```typescript
// Value types
import type { Position, Orientation, Size, JointId } from './story-api';

// Entity classes
import {
  SThing,
  SGround,
  SScene,
  STurnable,
  SMovableTurnable,
  SCamera,
  SModel,
  SJointedModel,
  SBiped,
  SFlyer,
  SQuadruped,
  SProp,
} from './story-api';

// Scene container
import { Scene } from './story-api';
```

## Architecture

```
src/
  story-api/
    index.ts        — Barrel re-export of all public types and classes
    types.ts        — Position, Orientation, Size, JointId interfaces
    entities.ts     — SThing → STurnable → SMovableTurnable → SModel →
                      SJointedModel → {SBiped, SFlyer, SQuadruped, SProp}
                      + SGround, SCamera, SScene
    scene.ts        — Scene container with CRUD + static fromProject() bridge
  a3p-parser.ts     — .a3p ZIP/XML parser (existing, unchanged)
  scene-builder.ts  — Three.js scene builder (existing, unchanged)
test/
  story-api.test.ts — Entity construction, type guards, Scene CRUD,
                      fromProject bridge, validation errors
```

The story API has **zero new dependencies** — it imports only the existing
`AliceProject` and `AliceObject` types from `a3p-parser.ts` (type-only
imports, no runtime dependency on the parser module).

## Relationship to scene-builder.ts

`scene-builder.ts` creates Three.js geometry from parsed project data using
ad-hoc type matching (`typeName.includes("SGround")`). The story API provides
the same type dispatch but as a proper class hierarchy.

The two modules are independent — `scene-builder.ts` works directly with
`AliceObject` from the parser, while the story API provides typed entities for
the Tweedle VM. A future refactor could have `scene-builder.ts` consume
`Scene` instead of `AliceProject`, but that is out of scope.

## Limitations

- **Joints are not yet populated.** `SJointedModel.getJoint()` always returns `undefined`.
  Joint data loading will be added when animation support is implemented.
- **No rendering.** The story API is a data model only. It does not create
  Three.js objects — that's `scene-builder.ts`'s job.
- **No persistence.** Scenes exist in memory only. There is no save/load for
  the entity model (project save uses the parser's format).
- **`resourceType` not stored.** Entity classes do not carry the model resource
  identifier. It remains on `AliceObject` for downstream consumers.
- **User types default to SProp.** `"User:Prop"`, `"User:Biped"`, and any
  unrecognized `typeName` all map to `SProp`. This is correct for most Alice
  lessons but may need refinement for advanced user-defined types.
- **Scene properties are not yet populated.** `atmosphereColor`, `fogDensity`,
  and `ambientLightColor` are typed but not populated by `fromProject()` in the
  initial implementation. They exist for future scene-environment support.
- **Visual properties not populated from `.a3p`.** `isShowing`, `paint`, `color`,
  `opacity`, and `vehicle` start at defaults and are set only by Tweedle VM
  execution. The a3p parser does not extract these values.
- **SScene entity is a placeholder.** `SScene` extends `SThing` with no additional
  capabilities. It exists to correctly map the `SScene` superType from the
  parser but has no rendering or runtime behavior.
