# Scene Graph Abstraction Layer

The scene graph abstraction (`src/scene-graph-abstraction.ts`) adds a visitor
pattern, coordinate system bridge, and transform utilities on top of the
existing [scene graph](./scene-graph.md). It provides renderer-agnostic
operations for walking Alice's scene hierarchy and converting between Alice's
transform types and the affine math layer.

> **Related issue:**
> [#87 — Scene Graph Abstraction Layer](https://github.com/rysweet/alice-web-prototype/issues/87)

## Quick Start

```typescript
import {
  walkSceneGraph,
  NodeCounter,
  TransformCollector,
  transformToAffine,
  affineToTransform,
  aliceForwardToThreeForward,
} from "./scene-graph-abstraction.js";
import { SceneGraph, GroupNode, VisualNode } from "./scene-graph.js";

// Build a scene
const graph = new SceneGraph();
const room = new GroupNode("room");
const table = new VisualNode("table");
table.localTransform = {
  position: { x: 1, y: 0.5, z: -2 },
  orientation: { x: 0, y: 0, z: 0, w: 1 },
  scale: { x: 1, y: 1, z: 1 },
};
room.addChild(table);
graph.root.addChild(room);

// Count nodes by type
const counter = new NodeCounter();
walkSceneGraph(graph.root, counter);
console.log(counter.counts);
// { group: 2, visual: 1, camera: 0, light: 0, unknown: 0, total: 3 }

// Collect world transforms
const collector = new TransformCollector();
walkSceneGraph(graph.root, collector);
console.log(collector.transforms);
// Map { "root" => AffineMatrix4x4, "room" => AffineMatrix4x4, "table" => AffineMatrix4x4 }
```

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│              scene-graph-abstraction.ts                    │
│                                                          │
│  ┌─────────────────┐  ┌───────────────────────────────┐  │
│  │ Visitor Pattern  │  │ Coordinate & Transform Bridge │  │
│  │                 │  │                               │  │
│  │ SceneGraphVisitor│  │ transformToAffine()           │  │
│  │ walkSceneGraph() │  │ affineToTransform()           │  │
│  │ NodeCounter     │  │ aliceForwardToThreeForward()  │  │
│  │ TransformCollector │ │ threeForwardToAliceForward()  │  │
│  └────────┬────────┘  └──────────────┬────────────────┘  │
│           │                          │                    │
│           ▼                          ▼                    │
│   scene-graph.ts types      scenegraph-math-affine.ts    │
│   (SceneGraphNode,          (AffineMatrix4x4,            │
│    GroupNode, VisualNode,    OrthogonalMatrix3x3,         │
│    CameraNode, LightNode)   Point3, Vector3)             │
└──────────────────────────────────────────────────────────┘
```

**Key design constraint:** `scene-graph-abstraction.ts` does **not** directly
use or expose Three.js types in its API. It bridges between `scene-graph.ts`
types (using `Vec3` and `Orientation`) and `scenegraph-math-affine.ts` types
(using `AffineMatrix4x4`). Three.js conversion is handled downstream by
`AffineMatrix4x4.toThreeMatrix4()` — the module's transitive dependency on
Three.js (via `scenegraph-math-affine.ts`) is an implementation detail, not a
public API surface.

## Visitor Pattern

### `SceneGraphVisitor<T>` Interface

```typescript
interface SceneGraphVisitor<T = void> {
  visitGroup(node: GroupNode): T;
  visitVisual(node: VisualNode): T;
  visitCamera(node: CameraNode): T;
  visitLight(node: LightNode): T;
  visitUnknown(node: SceneGraphNode): T;
}
```

Each method receives a typed node. The return type `T` is generic — use `void`
for side-effect visitors (counters, collectors), or a value type for transform
visitors that compute results.

### `walkSceneGraph(root, visitor)`

```typescript
function walkSceneGraph<T>(
  root: SceneGraphNode,
  visitor: SceneGraphVisitor<T>,
): void;
```

Performs an iterative depth-first pre-order traversal starting from `root`.
Uses an explicit stack (not recursion) to prevent stack overflow on deep trees.

For each node, dispatches to the appropriate `visit*` method based on
`instanceof` checks:

| Node Type | Method Called |
|---|---|
| `GroupNode` | `visitGroup(node)` |
| `VisualNode` | `visitVisual(node)` |
| `CameraNode` | `visitCamera(node)` |
| `LightNode` | `visitLight(node)` |
| *(anything else)* | `visitUnknown(node)` |

**Example: Custom Visitor**

```typescript
import type { SceneGraphVisitor } from "./scene-graph-abstraction.js";
import type { GroupNode, VisualNode, CameraNode, LightNode, SceneGraphNode } from "./scene-graph.js";

class MeshCollector implements SceneGraphVisitor<void> {
  readonly meshRefs: string[] = [];

  visitGroup(_node: GroupNode): void { /* skip groups */ }
  visitVisual(node: VisualNode): void {
    if (node.meshRef) this.meshRefs.push(node.meshRef);
  }
  visitCamera(_node: CameraNode): void { /* skip cameras */ }
  visitLight(_node: LightNode): void { /* skip lights */ }
  visitUnknown(_node: SceneGraphNode): void { /* skip unknown */ }
}

const collector = new MeshCollector();
walkSceneGraph(graph.root, collector);
console.log(collector.meshRefs); // ["models/table.glb", ...]
```

### Built-in Visitors

#### `NodeCounter`

Counts nodes by type. Useful for scene statistics and debugging.

```typescript
const counter = new NodeCounter();
walkSceneGraph(graph.root, counter);

console.log(counter.counts);
// {
//   group: 5,
//   visual: 12,
//   camera: 1,
//   light: 3,
//   unknown: 0,
//   total: 21,
// }
```

#### `TransformCollector`

Collects the world-space `AffineMatrix4x4` for every node. Builds a `Map` from
node name to affine transform.

```typescript
const collector = new TransformCollector();
walkSceneGraph(graph.root, collector);

// Get the world transform for a specific node
const tableTransform = collector.transforms.get("table");
if (tableTransform) {
  const threeMatrix = tableTransform.toThreeMatrix4();
  // Use with Three.js...
}
```

The collector calls `transformToAffine()` on each node's `worldTransform` to
produce the `AffineMatrix4x4`.

## Coordinate System Bridge

Alice's scene graph and the affine math layer use slightly different
representations for the same spatial data. The coordinate bridge provides
lossless conversion between them.

### Transform ↔ AffineMatrix4x4

#### `transformToAffine(transform): AffineMatrix4x4`

Converts a scene graph `Transform` (position + quaternion orientation + scale)
to an `AffineMatrix4x4`.

```typescript
import { transformToAffine } from "./scene-graph-abstraction.js";
import type { Transform } from "./scene-graph.js";

const transform: Transform = {
  position: { x: 1, y: 2, z: 3 },
  orientation: { x: 0, y: 0.707, z: 0, w: 0.707 }, // 90° Y rotation
  scale: { x: 1, y: 1, z: 1 },
};

const affine = transformToAffine(transform);
// affine.translation → Point3(1, 2, 3)
// affine.orientation → 90° Y rotation matrix
```

**Composition:** Uses `AffineMatrix4x4.compose(translation, rotation, scale)`,
passing the `Transform.orientation` quaternion as the rotation argument. The
compose method applies scale to the orientation matrix columns, producing a
single affine matrix that encodes all three components.

**Constraint:** Scale components must be positive. Negative scales cause
reflection, which is not invertible through the quaternion decomposition path.
The function throws if any scale component is ≤ 0.

#### `affineToTransform(affine): Transform`

Inverse of `transformToAffine`. Decomposes an `AffineMatrix4x4` back into a
`Transform` with position, quaternion orientation, and scale.

```typescript
import { affineToTransform } from "./scene-graph-abstraction.js";

const transform = affineToTransform(affine);
// transform.position → { x: 1, y: 2, z: 3 }
// transform.orientation → { x: 0, y: 0.707, z: 0, w: 0.707 }
// transform.scale → { x: 1, y: 1, z: 1 }
```

**Roundtrip guarantee:** For transforms with positive scale:

```typescript
const t = { position, orientation, scale };
const roundtripped = affineToTransform(transformToAffine(t));
// roundtripped ≈ t (within floating-point epsilon)
```

### Forward Direction Convention

Alice entities face **+Z forward** (right-handed, Y-up). Three.js cameras
face **-Z forward**. These utilities convert between the two conventions.

#### `aliceForwardToThreeForward(direction): Vec3`

Negates the Z component to convert from Alice's +Z forward to Three.js's -Z
forward convention.

```typescript
import { aliceForwardToThreeForward } from "./scene-graph-abstraction.js";

const aliceDir = { x: 0, y: 0, z: 1 }; // facing forward in Alice
const threeDir = aliceForwardToThreeForward(aliceDir);
// { x: 0, y: 0, z: -1 } — facing forward in Three.js
```

#### `threeForwardToAliceForward(direction): Vec3`

The inverse operation. Negates Z to convert from Three.js's -Z forward back to
Alice's +Z forward.

```typescript
import { threeForwardToAliceForward } from "./scene-graph-abstraction.js";

const threeDir = { x: 0, y: 0, z: -1 };
const aliceDir = threeForwardToAliceForward(threeDir);
// { x: 0, y: 0, z: 1 }
```

**Note:** Both functions are algebraically identical (negate Z), but having
explicit names documents intent and prevents confusion about which direction
the conversion goes.

## API Reference

### Visitor Types

| Export | Kind | Description |
|---|---|---|
| `SceneGraphVisitor<T>` | interface | Typed visit methods for each node type |
| `walkSceneGraph(root, visitor)` | function | Iterative DFS dispatcher |
| `NodeCounter` | class | Counts nodes by type |
| `TransformCollector` | class | Collects world `AffineMatrix4x4` per node |

### Coordinate Bridge

| Export | Kind | Description |
|---|---|---|
| `transformToAffine(t)` | function | `Transform` → `AffineMatrix4x4` |
| `affineToTransform(a)` | function | `AffineMatrix4x4` → `Transform` |
| `aliceForwardToThreeForward(v)` | function | Negate Z (Alice +Z → Three.js -Z) |
| `threeForwardToAliceForward(v)` | function | Negate Z (Three.js -Z → Alice +Z) |

### NodeCounter.counts

```typescript
interface NodeCounts {
  group: number;
  visual: number;
  camera: number;
  light: number;
  unknown: number;
  total: number;
}
```

### TransformCollector.transforms

```typescript
readonly transforms: Map<string, AffineMatrix4x4>;
```

Keyed by `node.name`. If multiple nodes share a name, later entries overwrite
earlier ones. For unique lookup, use `node.id` with a custom visitor.

## Design Decisions

### Why a Visitor Instead of `instanceof` Switches?

The existing `traverse()` + `instanceof` pattern works for simple cases but
becomes fragile as node types grow. The visitor pattern:

1. **Exhaustiveness** — TypeScript enforces that every visit method is
   implemented, so adding a new node type is a compile error (not a silent miss)
2. **Open/closed** — New traversal behaviors don't modify node classes
3. **Type safety** — Each visit method receives the concrete type, no casting

### Why Iterative Traversal?

`SceneGraphNode.traverse()` uses recursion. For typical Alice scenes (tens to
hundreds of nodes), this is fine. However, the abstraction layer uses an
explicit stack to:

1. Prevent stack overflow on pathologically deep trees
2. Allow future extensions (e.g., early termination, post-order visiting)
3. Make the iteration order explicit and testable

### Why Not Expose Three.js?

The abstraction layer sits between the renderer-agnostic scene graph and the
rendering layer. Exposing Three.js types would couple consumers to a specific
renderer, defeating the purpose. While `scenegraph-math-affine.ts`
transitively depends on Three.js, the abstraction layer's public API uses only
`AffineMatrix4x4`, `Vec3`, and `Orientation` — the rendering layer calls
`toThreeMatrix4()` as the final conversion step.

### Relationship to Existing Code

The abstraction **wraps** the existing scene graph — it does not replace it:

| Existing | Abstraction Layer |
|---|---|
| `SceneGraphNode.traverse()` | `walkSceneGraph()` (iterative, typed dispatch) |
| `node.worldTransform` (returns `Transform`) | `TransformCollector` (returns `AffineMatrix4x4`) |
| Manual `instanceof` checks | `SceneGraphVisitor` typed methods |
| No coordinate bridge | `transformToAffine()` / `affineToTransform()` |
| No forward direction utilities | `aliceForwardToThreeForward()` / `threeForwardToAliceForward()` |

## Testing

```bash
npx vitest run test/scene-graph-abstraction.test.ts
```

Tests cover:

- **Visitor dispatch** — each node type dispatches to the correct visit method
- **walkSceneGraph order** — verifies iterative DFS pre-order matches
  `SceneGraphNode.traverse()` order
- **NodeCounter** — correct counts for mixed scenes
- **TransformCollector** — world transforms match `node.worldTransform`
  converted through `transformToAffine()`
- **transformToAffine / affineToTransform roundtrip** — identity, translation-
  only, rotation-only, scale-only, and combined transforms roundtrip within
  epsilon
- **Positive-scale constraint** — `transformToAffine()` throws on negative
  scale
- **aliceForwardToThreeForward** — Z negation, identity for X/Y, roundtrip
  with inverse
- **threeForwardToAliceForward** — inverse of above
- **Empty scene** — visitor handles root-only scene
- **Deep tree** — iterative traversal handles 1000+ deep chains without stack
  overflow

## File Layout

```
src/
  scene-graph-abstraction.ts     — Visitor, bridge, utilities (this module)
  scene-graph.ts                 — Core scene graph (unchanged)
  scenegraph-math-affine.ts      — AffineMatrix4x4 (unchanged)
  scenegraph-transforms-core.ts  — Component/Composite hierarchy (unchanged)
test/
  scene-graph-abstraction.test.ts — Unit tests
docs/
  scene-graph-abstraction.md      — This document
```

## Related Documentation

- [Scene Graph](./scene-graph.md) — core hierarchy, node types, transform
  operations
- [Architecture](./architecture.md) — where the abstraction layer fits in the
  system
- [Quality Pipeline](./quality-pipeline.md) — uses the abstraction layer for
  model inspection
- [Scene Rendering](./scene-rendering.md) — Three.js rendering layer that
  consumes `AffineMatrix4x4.toThreeMatrix4()`
