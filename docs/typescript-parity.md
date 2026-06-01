# TypeScript Parity with Java Alice

The TypeScript web prototype reaches feature parity with the core Java Alice
`story-api` across seven areas: entity types, animation poses, event listeners,
user input, model resources, barrel exports, and end-to-end validation. This
page covers what was added, how to use it, and how it maps to the Java source.

## Overview

| Area | What changed | Issue |
|---|---|---|
| [Entity types](#entity-types) | Added `STransport`, `SVRHand`, `SVRHeadset`, `SVRUser`, registered `SAxes` | #56 |
| [Pose library](#pose-library) | Typed pose definitions, frozen constants, `applyPose()` helper | #57 |
| [Event listeners](#event-listeners) | Added `WhileInViewListener`, `WhileOcclusionListener`, `OcclusionStartListener`, `OcclusionEndListener` | #58 |
| [User input](#user-input-handler) | `UserInputHandler` interface with `getBooleanFromUser`, `getStringFromUser`, etc. | #59 |
| [Model resource catalog](#model-resource-catalog) | `VR_HAND`, `VR_HEADSET`, `VR_USER` entries in `MODEL_CLASS_DATA` and 4 gallery entries | #60 |
| [E2E validation](#e2e-validation) | Integration test that validates all six features together | #61 |
| [Barrel cleanup](#barrel-file-cleanup) | Collapsed 4 intermediate Croquet barrels into `croquet.ts` | #62 |

## Entity Types

### New entity classes

Four new entity classes in `src/story-api/expanded-entities-markers.ts` close
the gap between the 24 existing TypeScript entity types in the registry and
Java's full set:

| Class | Java equivalent | Extends | Category |
|---|---|---|---|
| `STransport` | `org.lgna.story.STransport` | `SJointedModel` | vehicles |
| `SVRHand` | `org.lgna.story.SVRHand` | `SJointedModel` | vr |
| `SVRHeadset` | `org.lgna.story.SVRHeadset` | `SMovableTurnable` | vr |
| `SVRUser` | `org.lgna.story.SVRUser` | `SJointedModel` | vr |

### STransport

`STransport` represents vehicles (cars, boats, aircraft). It uses a simple
joint hierarchy with `ROOT`, `BODY`, and `WHEEL_*` joints.

```typescript
import { STransport } from './story-api';

const car = new STransport('myCar');
car.position = { x: 5, y: 0, z: 0 };

// Access joints
const frontLeft = car.getJoint('FRONT_LEFT_WHEEL');
const body = car.getJoint('BODY');
```

### SVRHand / SVRHeadset / SVRUser

The VR entity types provide type-safe representations for virtual reality
components. `SVRHand` and `SVRUser` extend `SJointedModel` (they have joints
for finger tracking and body tracking respectively). `SVRHeadset` extends
`SMovableTurnable` — it has position and orientation for head tracking but no
joint hierarchy (unlike `SVRHand`/`SVRUser`).

```typescript
import { SVRHand, SVRHeadset, SVRUser } from './story-api';

const leftHand = new SVRHand('leftHand');
const headset = new SVRHeadset('headset');
const vrUser = new SVRUser('player');

// VR hands have finger joints
const thumb = leftHand.getJoint('THUMB');
const index = leftHand.getJoint('INDEX_FINGER');
```

### SAxes registration

`SAxes` was already defined in the entity classes but was not registered in the
`EntityTypeRegistry`. It is now registered:

```typescript
import { entityTypeRegistry } from './entity-type-registry';

const axesType = entityTypeRegistry.get('SAxes');
// → EntityType { name: 'SAxes', category: 'decorations', ... }
```

### Using new types with the registry

All four new entity types and `SAxes` are automatically registered in
`EntityTypeRegistry`. You can create instances by type name:

```typescript
import { entityTypeRegistry } from './entity-type-registry';

const transport = entityTypeRegistry.create('STransport', 'truck');
const vrHand = entityTypeRegistry.create('SVRHand', 'leftHand');

// Type queries work
entityTypeRegistry.getMostSpecificTypeForInstance(transport);
// → EntityType { name: 'STransport', ... }

// Inheritance queries work
const tree = entityTypeRegistry.getInheritanceTree();
tree.isA('STransport', 'SJointedModel'); // → true
tree.isA('SVRHeadset', 'SMovableTurnable'); // → true
```

### Entity count

With these additions, the TypeScript prototype has **29 entity types** in the
type registry (24 existing + 5 new: `STransport`, `SVRHand`, `SVRHeadset`,
`SVRUser`, `SAxes`), covering all concrete entity types from Java Alice's
`core/story-api`.

## Pose Library

### Overview

The pose library (`src/poses.ts`) provides typed, immutable pose definitions for
jointed models. Poses are frozen data objects mapping joint names to orientation
values, matching Java Alice's `StrikePose` system.

### PoseDefinition type

```typescript
interface PoseDefinition {
  readonly name: string;
  readonly description: string;
  readonly joints: Readonly<Record<string, Partial<{
    position: Position;
    orientation: Orientation;
  }>>>;
}
```

Each pose defines per-joint overrides. Joints not listed in the pose are left
unchanged when the pose is applied.

### Built-in poses

The module exports frozen pose constants:

| Pose | Constant | Description |
|---|---|---|
| Stand | `POSE_STAND` | Arms at sides, legs straight — the default rest pose |
| Sit | `POSE_SIT` | Seated position with bent knees and hips |
| Walk (left) | `POSE_WALK_LEFT` | Left foot forward, right arm forward — mid-stride |
| Walk (right) | `POSE_WALK_RIGHT` | Right foot forward, left arm forward — mid-stride |
| Raise right arm | `POSE_RAISE_RIGHT_ARM` | Right arm raised above head |

All constants are `Object.freeze`'d and typed `as const` — they cannot be
mutated at runtime.

```typescript
import { POSE_STAND, POSE_SIT, POSE_WALK_LEFT } from './poses';

console.log(POSE_STAND.name);       // "stand"
console.log(POSE_SIT.joints.ROOT);  // { orientation: { x: -0.15, y: 0, z: 0, w: 0.989 } }
```

### Applying poses

Use `applyPose()` to apply a pose to any `SJointedModel`:

```typescript
import { applyPose, POSE_SIT, POSE_WALK_LEFT, POSE_WALK_RIGHT } from './poses';
import { SBiped } from './story-api';

const biped = new SBiped('alice');

// Apply a static pose
applyPose(biped, POSE_SIT);

// Walk animation: alternate left/right stride poses
applyPose(biped, POSE_WALK_LEFT);
// ... after half-stride duration ...
applyPose(biped, POSE_WALK_RIGHT);
```

`applyPose()` calls `SJointedModel.strikePose()` internally, which sets joint
positions and orientations without animation. For animated transitions, combine
with the [animation system](./animation.md).

### Custom poses

Create your own pose definitions:

```typescript
import { applyPose } from './poses';
import type { PoseDefinition } from './poses';

const wavePose: PoseDefinition = Object.freeze({
  name: 'wave',
  description: 'Right hand raised and waving',
  joints: Object.freeze({
    RIGHT_SHOULDER: { orientation: { x: 0, y: 0, z: -1.2, w: 0.362 } },
    RIGHT_ELBOW: { orientation: { x: 0, y: 0, z: -0.5, w: 0.866 } },
  }),
});

applyPose(biped, wavePose);
```

### Walk animation integration

The walk animation uses the animation system's `doInOrder()` to alternate
between `POSE_WALK_LEFT` and `POSE_WALK_RIGHT`:

```typescript
import { doInOrder, Tween, easeInOut, lerpScalar } from './animation';
import { applyPose, POSE_WALK_LEFT, POSE_WALK_RIGHT, POSE_STAND } from './poses';

// Simple walk cycle: apply alternating stride poses
function walkCycle(biped: SBiped, steps: number, strideDurationMs: number): void {
  for (let i = 0; i < steps; i++) {
    const pose = i % 2 === 0 ? POSE_WALK_LEFT : POSE_WALK_RIGHT;
    applyPose(biped, pose);
    // In real usage, you'd integrate with the animation timeline
  }
  applyPose(biped, POSE_STAND);
}
```

## Event Listeners

### New listener classes

Four new listeners in `src/story-api-events/visibility-listeners.ts` complete
the event system's visibility and occlusion coverage:

| Listener | Event Type | Fires when |
|---|---|---|
| `OcclusionStartListener` | `occlusion-start` | An entity becomes occluded by another for the first time |
| `OcclusionEndListener` | `occlusion-end` | A previously occluded entity becomes visible again |
| `WhileOcclusionListener` | `while-occlusion` | Every update tick while an entity remains occluded |
| `WhileInViewListener` | `while-in-view` | Every update tick while an entity remains visible to the camera |

### Extended event types

The `OcclusionEvent` and `ViewEvent` unions are extended with new type
literals. The existing `'occluded'`/`'revealed'` types on `OcclusionEvent` and
`'view-enter'`/`'view-exit'` on `ViewEvent` are unchanged — the new literals
are additive:

```typescript
// OcclusionEvent — existing: 'occluded' | 'revealed'
// Added: 'occlusion-start' | 'occlusion-end' | 'while-occlusion'
type OcclusionEvent = {
  type: 'occluded' | 'revealed' | 'occlusion-start' | 'occlusion-end' | 'while-occlusion';
  camera: SCamera;
  target: SThing;
  occluder: SThing | null;
};

// ViewEvent — existing: 'view-enter' | 'view-exit'
// Added: 'while-in-view'
type ViewEvent = {
  type: 'view-enter' | 'view-exit' | 'while-in-view';
  camera: SCamera;
  target: SThing;
};
```

### Usage

```typescript
import {
  OcclusionStartListener,
  OcclusionEndListener,
  WhileOcclusionListener,
  WhileInViewListener,
} from './story-api-events';

// One-shot occlusion transitions
const onOccluded = new OcclusionStartListener((event) => {
  console.log(`${entityKey(event.target)} is now hidden behind ${entityKey(event.occluder!)}`);
});

const onRevealed = new OcclusionEndListener((event) => {
  console.log(`${entityKey(event.target)} is visible again`);
});

// Continuous while-occluded callback
const whileHidden = new WhileOcclusionListener((event) => {
  console.log(`${entityKey(event.target)} still occluded`);
});

// Continuous while-visible callback
const whileVisible = new WhileInViewListener((event) => {
  console.log(`${entityKey(event.target)} is in view`);
});

// In your update loop:
onOccluded.update(camera, targets, occluders);
onRevealed.update(camera, targets, occluders);
whileHidden.update(camera, targets, occluders);
whileVisible.update(camera, targets);
```

### Relationship to existing listeners

The new listeners complement the existing set:

| Category | Transition listeners | Continuous listener |
|---|---|---|
| **Visibility** | `ViewEnterListener`, `ViewExitListener` | `WhileInViewListener` |
| **Occlusion** | `OcclusionStartListener`, `OcclusionEndListener` | `WhileOcclusionListener` |
| **Collision** | `CollisionStartListener`, `CollisionEndListener` | `WhileCollisionListener` |
| **Proximity** | `ProximityEnterListener`, `ProximityExitListener` | `WhileProximityListener` |

This creates a consistent pattern across all four event categories: enter/exit
transitions plus a continuous "while" listener.

### Exports

All new listeners are exported from `src/story-api-events.ts`:

```typescript
export {
  OcclusionStartListener,
  OcclusionEndListener,
  WhileOcclusionListener,
  WhileInViewListener,
} from './story-api-events/visibility-listeners.js';
```

## User Input Handler

### Overview

The `UserInputHandler` interface (`src/input-system.ts`) provides
Java-compatible dialog input methods for collecting typed values from users at
runtime. In Java Alice, methods like `getBooleanFromUser()` show a modal dialog;
in the TypeScript prototype, they delegate to a pluggable handler.

### UserInputHandler interface

```typescript
interface UserInputHandler {
  getBooleanFromUser(prompt: string): Promise<boolean>;
  getStringFromUser(prompt: string): Promise<string>;
  getIntegerFromUser(prompt: string): Promise<number>;
  getDoubleFromUser(prompt: string): Promise<number>;
}
```

All methods are async — browser implementations will show UI dialogs; test
implementations can return canned values synchronously.

### InputManager integration

`InputManager` gains a static `inputHandler` field:

```typescript
class InputManager {
  static inputHandler: UserInputHandler | null = null;
  // ... existing mouse, keyboard, touch, gesture fields ...
}
```

When `inputHandler` is set, the input methods delegate to it. When `null`
(the default), they return type-safe defaults: `false` for boolean, `""` for
string, `0` for integer/double.

### Usage

```typescript
import { InputManager } from './input-system';
import type { UserInputHandler } from './input-system';

// Set up a handler (browser, test, or custom)
InputManager.inputHandler = {
  async getBooleanFromUser(prompt) {
    return window.confirm(prompt);
  },
  async getStringFromUser(prompt) {
    return window.prompt(prompt) ?? '';
  },
  async getIntegerFromUser(prompt) {
    return parseInt(window.prompt(prompt) ?? '0', 10) || 0;
  },
  async getDoubleFromUser(prompt) {
    return parseFloat(window.prompt(prompt) ?? '0') || 0;
  },
};

// Use from Tweedle runtime or application code
const name = await InputManager.inputHandler?.getStringFromUser('What is your name?');
const age = await InputManager.inputHandler?.getIntegerFromUser('How old are you?');
const likePizza = await InputManager.inputHandler?.getBooleanFromUser('Do you like pizza?');
```

### Test usage

For tests, provide a mock handler with predetermined responses:

```typescript
InputManager.inputHandler = {
  getBooleanFromUser: async () => true,
  getStringFromUser: async () => 'Alice',
  getIntegerFromUser: async () => 42,
  getDoubleFromUser: async () => 3.14,
};
```

### Default behavior (no handler)

When `InputManager.inputHandler` is `null`, calling the convenience methods
on `InputManager` returns defaults without throwing:

| Method | Default return |
|---|---|
| `getBooleanFromUser` | `false` |
| `getStringFromUser` | `""` |
| `getIntegerFromUser` | `0` |
| `getDoubleFromUser` | `0` |

This means code paths that call user input methods will not crash in headless
environments — they gracefully fall back to neutral defaults.

## Model Resource Catalog

### New entries in MODEL_CLASS_DATA

`src/model-resources/definitions.ts` gains three new entries. Note that
`STransport` is already covered by the existing `VEHICLE` key — no new key is
needed for transports.

| Key | Resource class | Package | Category | Status |
|---|---|---|---|---|
| `VEHICLE` | `TransportResource` | `org.lgna.story.resources.transport` | vehicles | **existing** |
| `VR_HAND` | `VRHandResource` | `org.lgna.story.resources.vr` | vr | new |
| `VR_HEADSET` | `VRHeadsetResource` | `org.lgna.story.resources.vr` | vr | new |
| `VR_USER` | `VRUserResource` | `org.lgna.story.resources.vr` | vr | new |

```typescript
import { MODEL_CLASS_DATA } from './model-resources';

// Transport already exists under the VEHICLE key
MODEL_CLASS_DATA.VEHICLE;
// → { abstractionClassName: 'STransport', implementationClassName: 'TransportImp',
//    resourceClassName: 'TransportResource', packageName: 'org.lgna.story.resources.transport',
//    category: 'vehicles' }

MODEL_CLASS_DATA.VR_HAND;
// → { abstractionClassName: 'SVRHand', implementationClassName: 'VRHandImp',
//    resourceClassName: 'VRHandResource', packageName: 'org.lgna.story.resources.vr',
//    category: 'vr' }
```

### New gallery entries

`src/gallery.ts` gains four matching gallery entries:

```typescript
import { GalleryCatalog } from './gallery';

const gallery = new GalleryCatalog();
gallery.get('vehicles/transport');
// → { id: 'vehicles/transport', name: 'Transport', className: 'org.lgna.story.STransport', ... }

gallery.byCategory('vr');
// → [
//   { id: 'vr/hand', name: 'VR Hand', ... },
//   { id: 'vr/headset', name: 'VR Headset', ... },
//   { id: 'vr/user', name: 'VR User', ... },
// ]
```

### Resource enumeration

The `ResourceEnumeration` class picks up the new types automatically:

```typescript
import { ResourceEnumeration } from './entity-type-registry';

const enumeration = new ResourceEnumeration();
const allResources = enumeration.listAll();

// Includes new entries
allResources.find(r => r.typeName === 'STransport');
// → { typeName: 'STransport', displayName: 'Transport', modelClass: 'VEHICLE', ... }
```

## E2E Validation

### Test file

`test/typescript-parity-e2e.test.ts` is a comprehensive integration test that
validates all six implementation features work together. It does not depend on
`.a3p` fixture files — it constructs test scenarios programmatically.

### What it validates

| Test scenario | Validates |
|---|---|
| Entity instantiation | All 4 new entity types create, name, and position correctly |
| Registry queries | New types are registered, inheritance tree is correct |
| Pose application | `applyPose()` modifies joint orientations on biped |
| Walk cycle | Alternating stride poses produce different joint states |
| Event listeners | All 4 new listeners fire for correct scenarios |
| User input delegation | `UserInputHandler` returns expected mock values |
| Resource catalog | `MODEL_CLASS_DATA` and gallery contain new VR entries |
| Barrel imports | All public exports resolve from `croquet.ts` |

### Running the tests

```bash
# Run just the parity E2E test
npx vitest run test/typescript-parity-e2e.test.ts

# Run as part of the full suite
npm test

# With coverage
npx vitest run --coverage test/typescript-parity-e2e.test.ts
```

### Example test structure

```typescript
describe('TypeScript parity E2E', () => {
  describe('entity types (#56)', () => {
    it('creates STransport with joints', () => {
      const transport = new STransport('car');
      expect(transport.getName()).toBe('car');
      expect(transport.getJoint('ROOT')).toBeDefined();
    });

    it('registers all new types in EntityTypeRegistry', () => {
      const registry = EntityTypeRegistry.getInstance();
      for (const name of ['STransport', 'SVRHand', 'SVRHeadset', 'SVRUser', 'SAxes']) {
        expect(registry.get(name)).not.toBeNull();
      }
    });
  });

  describe('poses (#57)', () => {
    it('applies pose to biped joints', () => {
      const biped = new SBiped('testBiped');
      applyPose(biped, POSE_SIT);
      // Joint orientations reflect the pose
    });
  });

  describe('event listeners (#58)', () => {
    it('WhileInViewListener fires every tick while visible', () => {
      const events: ViewEvent[] = [];
      const listener = new WhileInViewListener((e) => events.push(e));
      // ... visibility scenario ...
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].type).toBe('while-in-view');
    });
  });

  describe('user input (#59)', () => {
    it('delegates to UserInputHandler', async () => {
      InputManager.inputHandler = {
        getBooleanFromUser: async () => true,
        getStringFromUser: async () => 'test',
        getIntegerFromUser: async () => 7,
        getDoubleFromUser: async () => 2.5,
      };
      expect(await InputManager.inputHandler.getBooleanFromUser('?')).toBe(true);
    });
  });

  describe('resource catalog (#60)', () => {
    it('includes VEHICLE (transport) in MODEL_CLASS_DATA', () => {
      expect(MODEL_CLASS_DATA.VEHICLE).toBeDefined();
      expect(MODEL_CLASS_DATA.VEHICLE.category).toBe('vehicles');
    });

    it('includes VR types in MODEL_CLASS_DATA', () => {
      expect(MODEL_CLASS_DATA.VR_HAND).toBeDefined();
      expect(MODEL_CLASS_DATA.VR_HAND.category).toBe('vr');
    });
  });

  describe('barrel cleanup (#62)', () => {
    it('exports all Croquet modules from croquet.ts', async () => {
      const croquet = await import('../src/croquet');
      // All previously intermediate exports are available
    });
  });
});
```

## Barrel File Cleanup

### What changed

The `src/croquet.ts` barrel file previously re-exported through four
intermediate files that added no value — each was a passthrough barrel:

```
croquet.ts → croquet-codec.ts     → croquet-codec-core.ts
croquet.ts → croquet-state.ts     → croquet-state-core.ts, croquet-state-list.ts,
                                    croquet-state-selection.ts
croquet.ts → croquet-lifecycle.ts → croquet-lifecycle-views.ts
croquet.ts → croquet-composite.ts → croquet-composite-panel.ts,
                                    croquet-composite-dialogs.ts
```

### After cleanup

`croquet.ts` now re-exports directly from the implementation modules:

```typescript
// src/croquet.ts — after cleanup
export * from './croquet-codec-core';
export * from './croquet-state-core';
export * from './croquet-state-list';
export * from './croquet-state-selection';
export * from './croquet-action-operations';
export * from './croquet-lifecycle-views';
export * from './croquet-composite-panel';
export * from './croquet-composite-dialogs';
```

The four intermediate files (`croquet-codec.ts`, `croquet-state.ts`,
`croquet-lifecycle.ts`, `croquet-composite.ts`) are deleted. No other file in
the repository imported them directly — they were only used as re-export hops.

### Consumers

Two files import from `croquet.ts` and continue to work unchanged:

1. `src/index.ts` — `export * as Croquet from "./croquet"`
2. `src/history.ts` — `import type { ActionTrigger } from "./croquet"`

Their import statements (`import { ... } from './croquet'`) resolve the same
symbols as before. The only difference is one fewer re-export hop at build time.

### Verifying the cleanup

```bash
# Confirm no file imports from deleted intermediates
grep -r "from.*croquet-codec\b\|from.*croquet-state\b\|from.*croquet-lifecycle\b\|from.*croquet-composite\b" src/
# Should return zero results (only croquet-*-core, croquet-*-list, etc.)
```

## Java Parity Mapping

The following table maps each TypeScript addition to its Java Alice source in
`core/story-api/src/main/java/org/lgna/story/`:

| TypeScript | Java source |
|---|---|
| `STransport` | `STransport.java` |
| `SVRHand` | `SVRHand.java` |
| `SVRHeadset` | `SVRHeadset.java` |
| `SVRUser` | `SVRUser.java` |
| `SAxes` (registry) | `SAxes.java` |
| `POSE_STAND` / `POSE_SIT` / etc. | `StrikePose` enum constants |
| `OcclusionStartListener` | `OcclusionStartEvent` listener |
| `OcclusionEndListener` | `OcclusionEndEvent` listener |
| `WhileOcclusionListener` | `WhileOcclusionEvent` listener |
| `WhileInViewListener` | `WhileInViewEvent` listener |
| `getBooleanFromUser` | `DialogAPI.getBooleanFromUser()` |
| `getStringFromUser` | `DialogAPI.getStringFromUser()` |
| `getIntegerFromUser` | `DialogAPI.getIntegerFromUser()` |
| `getDoubleFromUser` | `DialogAPI.getDoubleFromUser()` |
| `TransportResource` | `resources/transport/TransportResource.java` (already mapped to `VEHICLE` key) |

## Configuration

No new configuration is required. All features are available after building:

```bash
npm run build:server && npm test
```

The new entity types, event listeners, and resource entries are automatically
registered at module load time through their respective registries.

## Limitations

- **VR types are metadata-only.** `SVRHand`, `SVRHeadset`, and `SVRUser` carry
  type information and joint hierarchies (or position/orientation for
  `SVRHeadset`) but do not connect to actual VR hardware.
  They exist for scene serialization parity and type-safe scene graphs.

- **Pose constants are orientations only.** The built-in poses define joint
  orientations, not positions. This matches Java Alice's `StrikePose` behavior
  where joint positions come from the skeleton bind pose.

- **User input is async.** Unlike Java's blocking `getBooleanFromUser()`, the
  TypeScript version returns a `Promise`. Callers must `await` the result.

- **No actual transport physics.** `STransport` is a typed scene entity, not a
  physics-enabled vehicle. It provides joints for wheels and body parts but no
  simulation.

## Testing

All features are covered by:

| Test file | Coverage |
|---|---|
| `test/typescript-parity-e2e.test.ts` | E2E integration across all 7 features |
| `test/story-api-expanded.test.ts` | Entity type instantiation and registry |
| `test/visibility-listeners.test.ts` | Event listener behavior |
| `test/input-system.test.ts` | Input handler delegation |
| `test/animation.test.ts` | Pose application integration |

Run the full suite:

```bash
npm test
```
