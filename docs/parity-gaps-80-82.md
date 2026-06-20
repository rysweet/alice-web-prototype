# Parity Gaps #80–#82: Joint Accessors, Entity/Scene Methods & Named Animations

Three parity gaps with Java Alice are now closed: named joint accessors for all
five locomotion entity types, missing entity/camera/scene API methods, and named
story-animation classes with enriched AST nodes.

## Overview

| Gap | What changed | Issue |
|---|---|---|
| [Named joint accessors](#named-joint-accessors) | 146 named joint getters across `SBiped` (46), `SQuadruped` (42), `SFlyer` (33), `SSwimmer` (13), `SSlitherer` (12); 5 `SJoint` dimension/pivot methods | #80 |
| [Entity/camera/scene methods](#entitycamerascene-methods) | `SThing.getVehicle/getVantagePoint/getCollisionHull`, `SGround.setVehicle`, `SCamera` VR hand accessors, `SScene` listener registration | #81 |
| [Named animations & AST enrichment](#named-animations) | 10 named animation classes (`MoveToAnimation`, `SayBubbleAnimation`, `FoldWingsAnimation`, etc.); `CountLoop`/`DoTogether`/`UserType`/`UserMethod` convenience APIs | #82 |
| [Tests](#testing) | Full test coverage for all new code | #80, #81, #82 |

All new APIs are exported from their respective modules and follow the existing
patterns in the codebase.

---

## Named Joint Accessors

### Background

Java Alice provides named getter methods for every joint in each entity type's
skeleton hierarchy. Prior to this change, the TypeScript port had partial
coverage — `SBiped` had 30 of 46 joint accessors, `SQuadruped` had 26 of 42,
and `SSlitherer`/`SSwimmer` had only 2 and 1 respectively. These gaps prevented
story programs that reference specific joints (finger bones, tail segments, leg
joints) from compiling correctly.

### SBiped — 46 Joint Accessors

`SBiped` now exposes all 46 joints in the biped skeleton, including the 16
previously missing finger and thumb accessors:

```typescript
import { SBiped } from './story-api';

const alice = new SBiped('alice');

// Existing accessors (unchanged)
const head = alice.getHead();
const leftHand = alice.getLeftHand();
const rightFoot = alice.getRightFoot();

// New finger accessors
const rightThumb = alice.getRightThumb();
const rightThumbKnuckle = alice.getRightThumbKnuckle();
const rightIndex = alice.getRightIndexFinger();
const rightIndexKnuckle = alice.getRightIndexFingerKnuckle();
const rightMiddle = alice.getRightMiddleFinger();
const rightMiddleKnuckle = alice.getRightMiddleFingerKnuckle();
const rightPinky = alice.getRightPinkyFinger();
const rightPinkyKnuckle = alice.getRightPinkyFingerKnuckle();

// Left hand mirrors right hand
const leftThumb = alice.getLeftThumb();
const leftIndexKnuckle = alice.getLeftIndexFingerKnuckle();
```

**Complete accessor list:**

| Joint Group | Accessors | Count |
|---|---|---|
| Root & spine | `getRoot`, `getSpineBase`, `getSpineMiddle`, `getSpineUpper` | 4 |
| Head & neck | `getNeck`, `getHead`, `getMouth`, `getLeftEye`, `getRightEye`, `getLeftEyelid`, `getRightEyelid` | 7 |
| Left arm | `getLeftClavicle`, `getLeftShoulder`, `getLeftElbow`, `getLeftWrist`, `getLeftHand` | 5 |
| Right arm | `getRightClavicle`, `getRightShoulder`, `getRightElbow`, `getRightWrist`, `getRightHand` | 5 |
| Left leg | `getLeftHip`, `getLeftKnee`, `getLeftAnkle`, `getLeftFoot` | 4 |
| Right leg | `getRightHip`, `getRightKnee`, `getRightAnkle`, `getRightFoot` | 4 |
| Left fingers | `getLeftThumb`, `getLeftThumbKnuckle`, `getLeftIndexFinger`, `getLeftIndexFingerKnuckle`, `getLeftMiddleFinger`, `getLeftMiddleFingerKnuckle`, `getLeftPinkyFinger`, `getLeftPinkyFingerKnuckle` | 8 |
| Right fingers | `getRightThumb`, `getRightThumbKnuckle`, `getRightIndexFinger`, `getRightIndexFingerKnuckle`, `getRightMiddleFinger`, `getRightMiddleFingerKnuckle`, `getRightPinkyFinger`, `getRightPinkyFingerKnuckle` | 8 |
| Pelvis | `getPelvis` | 1 |
| **Total** | | **46** |

### SQuadruped — 42 Joint Accessors

`SQuadruped` now exposes all 42 joints, including 16 new back-leg and tail
accessors:

```typescript
import { SQuadruped } from './story-api';

const dog = new SQuadruped('dog');

// Existing accessors
const head = dog.getHead();
const frontLeftFoot = dog.getFrontLeftFoot();

// New back-leg accessors
const backLeftKnee = dog.getBackLeftKnee();
const backLeftHock = dog.getBackLeftHock();
const backLeftAnkle = dog.getBackLeftAnkle();
const backLeftFoot = dog.getBackLeftFoot();
const backLeftToe = dog.getBackLeftToe();

// New tail accessors
const tail1 = dog.getTail1();
const tail2 = dog.getTail2();
const tail3 = dog.getTail3();

// New eyelid and pelvis accessors
const leftEyelid = dog.getLeftEyelid();
const rightEyelid = dog.getRightEyelid();
const pelvis = dog.getPelvis();
```

**Complete accessor list:**

| Joint Group | Accessors | Count |
|---|---|---|
| Root & spine | `getRoot`, `getSpineBase`, `getSpineMiddle`, `getSpineUpper` | 4 |
| Head & neck | `getNeck`, `getHead`, `getMouth`, `getLeftEye`, `getRightEye`, `getLeftEyelid`, `getRightEyelid` | 7 |
| Ears | `getLeftEar`, `getRightEar` | 2 |
| Front left leg | `getFrontLeftClavicle`, `getFrontLeftShoulder`, `getFrontLeftKnee`, `getFrontLeftAnkle`, `getFrontLeftFoot`, `getFrontLeftToe` | 6 |
| Front right leg | `getFrontRightClavicle`, `getFrontRightShoulder`, `getFrontRightKnee`, `getFrontRightAnkle`, `getFrontRightFoot`, `getFrontRightToe` | 6 |
| Back left leg | `getBackLeftHip`, `getBackLeftKnee`, `getBackLeftHock`, `getBackLeftAnkle`, `getBackLeftFoot`, `getBackLeftToe` | 6 |
| Back right leg | `getBackRightHip`, `getBackRightKnee`, `getBackRightHock`, `getBackRightAnkle`, `getBackRightFoot`, `getBackRightToe` | 6 |
| Tail | `getTail`, `getTail1`, `getTail2`, `getTail3` | 4 |
| Pelvis | `getPelvis` | 1 |
| **Total** | | **42** |

### SFlyer — 33 Joint Accessors

`SFlyer` now exposes all 33 joints, including 12 new leg, tail, and neck
accessors:

```typescript
import { SFlyer } from './story-api';

const eagle = new SFlyer('eagle');

// Existing accessors
const leftWing = eagle.getLeftWing();
const head = eagle.getHead();

// New leg accessors
const leftKnee = eagle.getLeftKnee();
const leftAnkle = eagle.getLeftAnkle();
const leftFoot = eagle.getLeftFoot();

// New tail and neck accessors
const neck1 = eagle.getNeck1();
const tail1 = eagle.getTail1();
const tail2 = eagle.getTail2();
const lowerLip = eagle.getLowerLip();
const pelvis = eagle.getPelvis();
```

### SSwimmer — 13 Joint Accessors

`SSwimmer` expands from 1 accessor to full coverage of all 13 swimmer joints:

```typescript
import { SSwimmer } from './story-api';

const fish = new SSwimmer('fish');

const root = fish.getRoot();
const neck = fish.getNeck();
const head = fish.getHead();
const mouth = fish.getMouth();
const leftEye = fish.getLeftEye();
const leftEyelid = fish.getLeftEyelid();
const rightEye = fish.getRightEye();
const rightEyelid = fish.getRightEyelid();
const frontLeftFin = fish.getFrontLeftFin();
const frontRightFin = fish.getFrontRightFin();
const spineBase = fish.getSpineBase();
const spineMiddle = fish.getSpineMiddle();
const tail = fish.getTail();
```

### SSlitherer — 12 Joint Accessors

`SSlitherer` expands from 2 accessors to full coverage of all 12 slitherer
joints:

```typescript
import { SSlitherer } from './story-api';

const snake = new SSlitherer('snake');

const root = snake.getRoot();
const neck = snake.getNeck();
const head = snake.getHead();
const mouth = snake.getMouth();
const leftEye = snake.getLeftEye();
const leftEyelid = snake.getLeftEyelid();
const rightEye = snake.getRightEye();
const rightEyelid = snake.getRightEyelid();
const spineBase = snake.getSpineBase();
const spineMiddle = snake.getSpineMiddle();
const spineUpper = snake.getSpineUpper();
const tail = snake.getTail();
```

### SJoint Dimension & Pivot Methods

`SJoint` now includes Java-style getter methods for querying joint dimensions
and pivot visibility:

```typescript
import { SBiped } from './story-api';

const biped = new SBiped('character');
const hand = biped.getRightHand();

// Dimension queries — return the joint's bounding dimensions
const width = hand.getWidth();    // number
const height = hand.getHeight();  // number
const depth = hand.getDepth();    // number

// Pivot visibility — controls whether the joint's pivot point is shown
const visible = hand.getPivotVisible();  // boolean
hand.setPivotVisible(true);
```

**SJoint API additions:**

| Method | Return type | Description |
|---|---|---|
| `getWidth()` | `number` | Width of the joint's local bounding volume |
| `getHeight()` | `number` | Height of the joint's local bounding volume |
| `getDepth()` | `number` | Depth of the joint's local bounding volume |
| `getPivotVisible()` | `boolean` | Whether the joint pivot indicator is rendered |
| `setPivotVisible(value)` | `void` | Show or hide the joint pivot indicator |

**Implementation:** Dimensions delegate to the joint implementation's size
property (`this.jointImp.size.value.width`, `.height`, `.depth`). Pivot
visibility is stored on the joint implementation, defaulting to `false`.

**File:** `src/story-api/expanded-entities-markers.ts`

---

## Entity/Camera/Scene Methods

### SThing Methods

Three new methods on the `SThing` base class provide vehicle, spatial, and
collision data that Java Alice exposes on all entities:

```typescript
import { SThing, SBiped, SGround } from './story-api';

const bunny = new SBiped('bunny');
const ground = new SGround('ground');

// getVehicle — returns the entity this thing is riding, or null
const vehicle = bunny.getVehicle();  // SThing | null

// getVantagePoint — returns world-space position (the entity's vantage point)
const pos = bunny.getVantagePoint();  // Position

// getCollisionHull — returns the entity's axis-aligned bounding box
const hull = bunny.getCollisionHull();  // BoundingBox | null
```

**SThing API additions:**

| Method | Return type | Description |
|---|---|---|
| `getVehicle()` | `SThing \| null` | The entity this thing is attached to as a vehicle, or `null` if unattached |
| `getVantagePoint()` | `Position` | The entity's world-space position (delegates to `imp.getAbsolutePosition()`) |
| `getCollisionHull()` | `BoundingBox \| null` | Axis-aligned bounding box from `imp.getBoundingBox()`, or `null` if unavailable |

**Java equivalents:** `getVehicle()`, `getVantagePoint()`, `getCollisionHull()`
from `org.lgna.story.SThing`.

### SGround.setVehicle

`SGround` gains a `setVehicle` method for attaching entities to the ground
plane as their vehicle — the standard way to make entities move relative to
the world:

```typescript
const ground = new SGround('ground');
const bunny = new SBiped('bunny');

// Attach bunny to the ground (standard Alice scene setup)
ground.setVehicle(bunny);

// Detach
ground.setVehicle(null);
```

**Implementation:** Delegates to `this.imp.setVehicle(vehicle?.imp ?? null)`,
using the existing `VehicleSystem` infrastructure.

### SCamera VR Hand Accessors

`SCamera` now provides accessors for VR hand controllers, matching Java Alice's
`SCamera` API surface. In non-VR mode (the default), these return `null`:

```typescript
import { SCamera } from './story-api';

const camera = new SCamera('camera');

const leftHand = camera.getLeftHand();   // SVRHand | null (null in non-VR)
const rightHand = camera.getRightHand(); // SVRHand | null (null in non-VR)
```

**SCamera API additions:**

| Method | Return type | Description |
|---|---|---|
| `getLeftHand()` | `SVRHand \| null` | Left VR hand controller, or `null` in non-VR mode |
| `getRightHand()` | `SVRHand \| null` | Right VR hand controller, or `null` in non-VR mode |

**Note:** `SVRHand` is the VR hand entity type added in parity gap #56. These
accessors provide the standard Alice entry point for VR hand tracking. When VR
support is implemented, these will return live `SVRHand` instances.

**File:** `src/story-api/expanded-entities-base-models.ts`

### SScene Listener Registration

`SScene` now supports the two most common listener types beyond the existing
scene activation listeners: object-addition listeners and time listeners.

```typescript
import { SScene, SThing } from './story-api';

const scene = new SScene('myScene');

// Object addition listeners — notified when entities are added to the scene
const onAdd = (entity: SThing) => {
  console.log(`Entity added: ${entity.name}`);
};
scene.addObjectAdditionListener(onAdd);
scene.removeObjectAdditionListener(onAdd);

// Time listeners — notified each frame with elapsed time
const onTime = (time: number) => {
  console.log(`Time: ${time}s`);
};
scene.addTimeListener(onTime);
scene.removeTimeListener(onTime);
```

**SScene API additions:**

| Method | Parameters | Description |
|---|---|---|
| `addObjectAdditionListener(listener)` | `(entity: SThing) => void` | Register a callback for entity additions |
| `removeObjectAdditionListener(listener)` | `(entity: SThing) => void` | Unregister an entity-addition callback |
| `addTimeListener(listener)` | `(time: number) => void` | Register a per-frame time callback |
| `removeTimeListener(listener)` | `(time: number) => void` | Unregister a time callback |

**Implementation:** Listeners are stored in `Set` collections on the `SScene`
instance. This is the standard observer pattern — no `SceneImp` changes are
required. Listeners are invoked by scene infrastructure when the corresponding
event occurs.

**Java equivalents:** `addObjectAdditionListener()`, `addTimeListener()` from
`org.lgna.story.SScene`.

**File:** `src/story-api/expanded-entities-base-core.ts`

---

## Named Animations

### Overview

Ten named animation classes provide story-level API parity with Java Alice's
animation procedures. Each class is a thin wrapper that delegates to the
existing animation infrastructure, using the same duration/style pattern as
all other entity animations.

### Imports

```typescript
import {
  MoveToAnimation,
  MoveTowardAnimation,
  OrientToAnimation,
  PointAtAnimation,
  TurnToFaceAnimation,
  PlaceAnimation,
  SayBubbleAnimation,
  ThinkBubbleAnimation,
  StraightenOutJointsAnimation,
  FoldWingsAnimation,
} from './story-api-animations';
```

### Animation Class Reference

| Class | Description | Actual class |
|---|---|---|
| `MoveToAnimation` | Move entity to an exact target position | Extends `DurationAnimation` |
| `MoveTowardAnimation` | Move entity toward a target by a specified amount | Extends `DurationAnimation` |
| `OrientToAnimation` | Orient entity to face a target in 3D | Extends `DurationAnimation` |
| `PointAtAnimation` | Point entity at a target (3D facing) | Extends `DurationAnimation` |
| `TurnToFaceAnimation` | Turn entity to face target (Y-axis only) | Extends `DurationAnimation` |
| `PlaceAnimation` | Instantly place entity at a position | Extends `DurationAnimation` |
| `SayBubbleAnimation` | Display speech bubble on entity | Extends `BubbleAnimationBase` |
| `ThinkBubbleAnimation` | Display thought bubble on entity | Extends `BubbleAnimationBase` |
| `StraightenOutJointsAnimation` | Reset all joints to default orientation | Extends `DurationAnimation` |
| `FoldWingsAnimation` | Fold flyer wing joints to resting position | Extends `DurationAnimation` |

### Movement Animations

#### MoveToAnimation

Moves an entity to an exact target position over a specified duration:

```typescript
import { MoveToAnimation } from './story-api-animations';

// entity must implement PositionedEntity (has position: Position)
// target is a Position { x, y, z }
const anim = new MoveToAnimation(entity, targetPosition, 2000);  // 2 seconds
anim.start();

// With explicit animation style
const anim2 = new MoveToAnimation(entity, targetPosition, 1500, 'BEGIN_AND_END_GENTLY');
```

**Constructor:** `new MoveToAnimation(entity: PositionedEntity, target: Position, durationMs: number, style?: AnimationStyle)`

#### MoveTowardAnimation

Moves an entity toward a target by a partial amount:

```typescript
import { MoveTowardAnimation } from './story-api-animations';

// Move entity 3 meters toward target position over 1 second
const anim = new MoveTowardAnimation(entity, targetPosition, 3.0, 1000);
anim.start();
```

**Constructor:** `new MoveTowardAnimation(entity: PositionedEntity, target: Position, amount: number, durationMs: number, style?: AnimationStyle)`

### Orientation Animations

#### OrientToAnimation / PointAtAnimation

Both orient an entity to face a target position in full 3D (pitch + yaw):

```typescript
import { OrientToAnimation, PointAtAnimation } from './story-api-animations';

// Orient entity to face the target position (full 3D)
const orient = new OrientToAnimation(entity, targetPosition, 1000);
orient.start();

// PointAt — same 3D orientation, different semantic name
const point = new PointAtAnimation(entity, targetPosition, 1000);
point.start();
```

**Constructor:** `new OrientToAnimation(entity: OrientedEntity, target: Position, durationMs: number, style?: AnimationStyle)`

#### TurnToFaceAnimation

Turns an entity to face a target on the Y-axis only (horizontal plane):

```typescript
import { TurnToFaceAnimation } from './story-api-animations';

// Turn entity to face target (Y-axis rotation only)
const turn = new TurnToFaceAnimation(entity, targetPosition, 1000);
turn.start();
```

**Constructor:** `new TurnToFaceAnimation(entity: OrientedEntity, target: Position, durationMs: number, style?: AnimationStyle)`

**Difference from OrientToAnimation:** `TurnToFaceAnimation` only rotates around
the Y-axis, keeping the entity upright. `OrientToAnimation` applies full 3D
orientation including pitch. Use `TurnToFaceAnimation` for characters that
should stay upright while turning; use `OrientToAnimation` for cameras or
objects that need to tilt up/down.

### Placement Animation

#### PlaceAnimation

Instantly positions an entity at a target location:

```typescript
import { PlaceAnimation } from './story-api-animations';

const place = new PlaceAnimation(entity, targetPosition, 0);  // instantaneous
place.start();
```

**Constructor:** `new PlaceAnimation(entity: PositionedEntity, target: Position, durationMs?: number, style?: AnimationStyle)`

### Speech Animations

#### SayBubbleAnimation / ThinkBubbleAnimation

Display speech or thought bubbles on an entity:

```typescript
import { SayBubbleAnimation, ThinkBubbleAnimation } from './story-api-animations';

const say = new SayBubbleAnimation(bubbleHost, 'Hello, world!', 3000);  // 3-second speech bubble
say.start();

const think = new ThinkBubbleAnimation(bubbleHost, 'Hmm, interesting...', 2000);
think.start();
```

**SayBubbleAnimation constructor:** `new SayBubbleAnimation(host: BubbleHost, text: string, durationMs: number, style?: AnimationStyle)`
**ThinkBubbleAnimation constructor:** `new ThinkBubbleAnimation(host: BubbleHost, text: string, durationMs: number, style?: AnimationStyle)`

### Joint Animations

#### StraightenOutJointsAnimation

Resets all joints on a jointed model to their default orientation:

```typescript
import { StraightenOutJointsAnimation } from './story-api-animations';

const straighten = new StraightenOutJointsAnimation(jointedEntity, 1000);
straighten.start();

// With style
const straighten2 = new StraightenOutJointsAnimation(jointedEntity, 1000, 'BEGIN_AND_END_GENTLY');
```

**Constructor:** `new StraightenOutJointsAnimation(target: JointedEntity, durationMs: number, style?: AnimationStyle)`

#### FoldWingsAnimation

Folds a flyer's wing joints to a resting position. This animation
simultaneously interpolates all wing joint rotations toward a fold angle
(default 90°) on both sides:

```typescript
import { FoldWingsAnimation } from './story-api-animations';

const fold = new FoldWingsAnimation(wingedEntity, 1500);
fold.start();

// With custom fold angle and animation style
const fold2 = new FoldWingsAnimation(wingedEntity, 1500, 45, 'BEGIN_AND_END_GENTLY');
```

**Constructor:** `new FoldWingsAnimation(target: WingedEntity, durationMs: number, foldAngle?: number, style?: AnimationStyle)`

**Implementation:** Targets the 8 wing joints:
`LEFT_WING_SHOULDER`, `LEFT_WING_ELBOW`, `LEFT_WING_WRIST`,
`LEFT_WING_TIP`, `RIGHT_WING_SHOULDER`, `RIGHT_WING_ELBOW`,
`RIGHT_WING_WRIST`, `RIGHT_WING_TIP`. Each joint's rotation is interpolated
from its current value toward the `foldAngle` (default: 90°) using scalar lerp.
If the entity provides a `wingJointNames` array, those joint names are used
instead of the defaults.

---

## AST Node Enrichment

### CountLoop

`CountLoop` gains convenience getters for programmatic AST access:

```typescript
import { CountLoop } from './ast-nodes-statements-control';

const loop = new CountLoop(
  variable,       // optional iterator variable (UserLocal | null)
  constant,       // optional loop constant (UserLocal | null)
  countExpr,      // how many iterations (Expression)
  body,           // statement body (Statement[])
);

// Convenience getters
loop.getCountExpression();    // → Expression (returns this.count)
loop.getLoopVariable();       // → UserLocal | null (returns this.variable)
loop.getLoopConstant();       // → UserLocal | null (returns this.constant)
loop.isIndexed();             // → boolean (this.variable !== null)
```

**CountLoop API additions:**

| Member | Type | Description |
|---|---|---|
| `getCountExpression()` | `Expression` | Returns the loop count expression |
| `getLoopVariable()` | `UserLocal \| null` | Returns the iterator variable, if declared |
| `getLoopConstant()` | `UserLocal \| null` | Returns the loop constant, if declared |
| `isIndexed()` | `boolean` | Whether the loop has an iterator variable |

**Child nodes:** Variable, constant, count expression, and body statements are
all included in `getChildNodes()` for AST visitors and transformations.

### DoTogether

`DoTogether` gains count and query helpers:

```typescript
import { DoTogether } from './ast-nodes-statements-control';

const together = new DoTogether(statements);

// New methods
together.getStatementCount(); // → number (body.length)
together.isEmpty();           // → boolean (body.length === 0)
together.getStatements();     // → readonly Statement[] (body)
```

**DoTogether API additions:**

| Member | Type | Description |
|---|---|---|
| `getStatementCount()` | `number` | Number of parallel statements in the body |
| `isEmpty()` | `boolean` | Whether the body has no statements |
| `getStatements()` | `readonly Statement[]` | The body statements (read-only view) |

### UserType

`UserType` gains convenience methods for querying and mutating its members:

```typescript
import { UserType } from './ast-nodes-declarations-runtime';

const myType = new UserType('MyClass', ...);

// Look up members by name
const method = myType.getMethodByName('doSomething');  // UserMethod | undefined
const field = myType.getFieldByName('myField');        // UserField | undefined

// Add members programmatically
myType.addMethod(newMethod);
myType.addField(newField);

// Get constructors
const ctors = myType.getConstructors();  // UserConstructor[]
```

**UserType API additions:**

| Method | Return type | Description |
|---|---|---|
| `getMethodByName(name)` | `UserMethod \| undefined` | Find a method by name in this type's method list |
| `getFieldByName(name)` | `UserField \| undefined` | Find a field by name in this type's field list |
| `addMethod(method)` | `void` | Append a method to this type's method list |
| `addField(field)` | `void` | Append a field to this type's field list |
| `getConstructors()` | `UserConstructor[]` | Return all constructors declared on this type |

### UserMethod

`UserMethod` gains an override flag and a signature helper:

```typescript
import { UserMethod } from './ast-nodes-declarations-runtime';

const method = new UserMethod('greet', params, returnType, body);

// New properties
method.isOverride;      // → false (default)
method.getSignature();  // → "greet(String, Number): Void"
```

**UserMethod API additions:**

| Member | Type | Description |
|---|---|---|
| `isOverride` | `boolean` | Whether this method overrides a superclass method (default: `false`) |
| `getSignature()` | `string` | Human-readable signature: `"name(param1Type, param2Type): returnType"` |

---

## Testing

All new code is covered by tests in `test/typescript-parity-gaps.test.ts`:

### Test Structure

```
typescript-parity-gaps #80-#82
├── Issue #80: Named Joint Accessors
│   ├── SBiped joint accessors
│   │   ├── returns SJoint for all 46 named accessors
│   │   ├── finger accessors return correct joint IDs
│   │   └── all accessors return distinct joint instances
│   ├── SQuadruped joint accessors
│   │   ├── returns SJoint for all 42 named accessors
│   │   ├── back-leg accessors return correct joint IDs
│   │   └── tail accessors return correct joint IDs
│   ├── SFlyer joint accessors
│   │   ├── returns SJoint for all 33 named accessors
│   │   └── leg and tail accessors return correct joint IDs
│   ├── SSwimmer joint accessors
│   │   └── returns SJoint for all 13 named accessors
│   ├── SSlitherer joint accessors
│   │   └── returns SJoint for all 12 named accessors
│   └── SJoint dimension and pivot methods
│       ├── getWidth/getHeight/getDepth return numbers
│       └── getPivotVisible/setPivotVisible round-trips
├── Issue #81: Entity/Camera/Scene Methods
│   ├── SThing.getVehicle
│   │   ├── returns null when no vehicle
│   │   └── returns vehicle after attachment
│   ├── SThing.getVantagePoint
│   │   └── returns world-space position
│   ├── SThing.getCollisionHull
│   │   └── returns BoundingBox
│   ├── SGround.setVehicle
│   │   └── attaches and detaches vehicle
│   ├── SCamera VR hand accessors
│   │   ├── getLeftHand returns null in non-VR
│   │   └── getRightHand returns null in non-VR
│   └── SScene listener registration
│       ├── addObjectAdditionListener/removeObjectAdditionListener
│       └── addTimeListener/removeTimeListener
├── Issue #82: Named Animations & AST Enrichment
│   ├── Named animation classes
│   │   ├── MoveToAnimation creates animation with correct parameters
│   │   ├── MoveTowardAnimation creates animation with amount
│   │   ├── OrientToAnimation creates 3D orientation animation
│   │   ├── PointAtAnimation creates 3D orientation animation
│   │   ├── TurnToFaceAnimation creates Y-axis rotation animation
│   │   ├── PlaceAnimation creates placement animation
│   │   ├── SayBubbleAnimation creates speech bubble animation
│   │   ├── ThinkBubbleAnimation creates thought bubble animation
│   │   ├── StraightenOutJointsAnimation resets all joints
│   │   └── FoldWingsAnimation targets only wing joints
│   └── AST node enrichment
│       ├── CountLoop.getCountExpression returns count
│       ├── CountLoop.getLoopVariable returns variable
│       ├── CountLoop.getLoopConstant returns constant
│       ├── CountLoop.isIndexed returns true when variable set
│       ├── DoTogether.getStatementCount returns body length
│       ├── DoTogether.isEmpty returns true for empty body
│       ├── DoTogether.getStatements returns readonly body
│       ├── UserType.getMethodByName finds methods
│       ├── UserType.getFieldByName finds fields
│       ├── UserType.addMethod appends method
│       ├── UserType.addField appends field
│       ├── UserType.getConstructors returns constructors
│       ├── UserMethod.isOverride defaults to false
│       └── UserMethod.getSignature returns formatted signature
```

### Running Tests

```bash
# Run all tests
npm test

# Run only parity gap tests
npm test -- test/typescript-parity-gaps.test.ts

# Run tests for a specific issue
npm test -- test/typescript-parity-gaps.test.ts -t "Issue #80"
npm test -- test/typescript-parity-gaps.test.ts -t "Issue #81"
npm test -- test/typescript-parity-gaps.test.ts -t "Issue #82"
```

---

## Java Mapping Reference

| Java Alice API | TypeScript equivalent | File |
|---|---|---|
| `SBiped.getRightThumb()` | `SBiped.getRightThumb()` | `expanded-entities-markers.ts` |
| `SQuadruped.getBackLeftKnee()` | `SQuadruped.getBackLeftKnee()` | `expanded-entities-markers.ts` |
| `SFlyer.getLeftKnee()` | `SFlyer.getLeftKnee()` | `expanded-entities-markers.ts` |
| `SSwimmer.getFrontLeftFin()` | `SSwimmer.getFrontLeftFin()` | `expanded-entities-markers.ts` |
| `SSlitherer.getSpineBase()` | `SSlitherer.getSpineBase()` | `expanded-entities-markers.ts` |
| `SJoint.getWidth()` | `SJoint.getWidth()` | `expanded-entities-markers.ts` |
| `SThing.getVehicle()` | `SThing.getVehicle()` | `expanded-entities-base-core.ts` |
| `SThing.getVantagePoint()` | `SThing.getVantagePoint()` | `expanded-entities-base-core.ts` |
| `SThing.getCollisionHull()` | `SThing.getCollisionHull()` | `expanded-entities-base-core.ts` |
| `SGround.setVehicle()` | `SGround.setVehicle()` | `expanded-entities-base-core.ts` |
| `SCamera.getLeftHand()` | `SCamera.getLeftHand()` | `expanded-entities-base-models.ts` |
| `SScene.addObjectAdditionListener()` | `SScene.addObjectAdditionListener()` | `expanded-entities-base-core.ts` |
| `SScene.addTimeListener()` | `SScene.addTimeListener()` | `expanded-entities-base-core.ts` |
| `MoveTo` | `MoveToAnimation` | `story-api-animations.ts` |
| `MoveToward` | `MoveTowardAnimation` | `story-api-animations.ts` |
| `OrientTo` | `OrientToAnimation` | `story-api-animations.ts` |
| `PointAt` | `PointAtAnimation` | `story-api-animations.ts` |
| `TurnToFace` | `TurnToFaceAnimation` | `story-api-animations.ts` |
| `Place` | `PlaceAnimation` | `story-api-animations.ts` |
| `Say` | `SayBubbleAnimation` | `story-api-animations.ts` |
| `Think` | `ThinkBubbleAnimation` | `story-api-animations.ts` |
| `StraightenOutJoints` | `StraightenOutJointsAnimation` | `story-api-animations.ts` |
| N/A (new) | `FoldWingsAnimation` | `story-api-animations.ts` |
| `CountLoop` (query) | `CountLoop.getCountExpression()` | `ast-nodes-statements-control.ts` |
| `DoTogether` | `DoTogether.getStatementCount()` | `ast-nodes-statements-control.ts` |
| `UserType` queries | `UserType.getMethodByName()` etc. | `ast-nodes-declarations-runtime.ts` |
| `UserMethod.isOverride()` | `UserMethod.isOverride` | `ast-nodes-declarations-runtime.ts` |

## Limitations

- **VR hand accessors return `null`.** `SCamera.getLeftHand()` and
  `getRightHand()` always return `null` in the current non-VR implementation.
  These will return live `SVRHand` instances when VR support lands.

- **FoldWingsAnimation is TypeScript-only.** Java Alice does not have a
  `FoldWings` animation — it is a convenience added for the web prototype.
  It only works on entities implementing the `WingedEntity` interface.

- **Listener Sets are unbounded.** `SScene` listener Sets grow without limit.
  This is the standard observer pattern and matches Java Alice's behavior.
  Callers are responsible for removing listeners when no longer needed.

- **`MoveToAnimation` computes full distance.** Unlike `MoveTowardAnimation`
  which accepts an `amount` parameter, `MoveToAnimation` always moves the
  entity the full distance to the target. This matches Java Alice's `MoveTo`
  semantics.

## See Also

- [Story API](./story-api.md) — Scene & entity model reference
- [Animation system](./animation.md) — Core animation primitives
- [TypeScript parity](./typescript-parity.md) — Overall parity tracker
- [Parity gaps #71–#75](./parity-gaps-71-75.md) — Event listeners, colors, poses
- [Parity gaps #76–#77](./parity-gaps-76-77.md) — Audio pipeline, project lifecycle
