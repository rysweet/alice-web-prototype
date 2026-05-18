# Model Resource Loading — Joint Hierarchy, Bounding Boxes & Textures

The a3p parser (`src/a3p-parser.ts`) now extracts full model resource metadata
from `.a3p` files: joint skeleton hierarchies, axis-aligned bounding boxes, and
texture references. These are returned as three new **optional** fields on
`AliceProject`, preserving full backward compatibility.

## Overview

| Field | Type | Default | Source in .a3p |
|---|---|---|---|
| `jointHierarchy` | `JointNode[]` | `[]` | `JointImplementation` XML nodes |
| `boundingBoxes` | `Record<string, BoundingBox>` | `{}` | Resource bounding data in XML |
| `textureRefs` | `string[]` | `[]` | XML resource refs + ZIP image entries |

All three fields are optional on `AliceProject`. Existing consumers that
destructure only `{ version, projectName, sceneObjects, methods }` continue
to work unchanged.

## Quick Start

```typescript
import { parseA3P } from './a3p-parser';

const project = await parseA3P(a3pBuffer);

// Joint hierarchy — array of root bones, each with children
for (const root of project.jointHierarchy ?? []) {
  console.log(`Root joint: ${root.name}`);
  printTree(root, 0);
}

// Bounding boxes — keyed by resource name
for (const [name, box] of Object.entries(project.boundingBoxes ?? {})) {
  console.log(`${name}: min=(${box.min.x},${box.min.y},${box.min.z})`);
  console.log(`${name}: max=(${box.max.x},${box.max.y},${box.max.z})`);
}

// Texture references — paths relative to ZIP root
for (const ref of project.textureRefs ?? []) {
  console.log(`Texture: ${ref}`); // e.g. "resources/textures/skin.png"
}
```

## New Types

### `Vec3`

```typescript
interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}
```

A 3D vector used by `BoundingBox` corners and `JointNode.localTransform.position`.
Structurally identical to `Position` — interchangeable via structural typing.
Exported from `story-api/types.ts` and re-exported from `story-api/index.ts`.

### `BoundingBox`

```typescript
interface BoundingBox {
  readonly min: Vec3;
  readonly max: Vec3;
}
```

Axis-aligned bounding box defined by its minimum and maximum corners. Used to
describe the spatial extent of a model resource.

Exported from `story-api/types.ts` and re-exported from `story-api/index.ts`.

### `JointNode`

Exported from `story-api/types.ts` and re-exported from `story-api/index.ts`.

```typescript
interface JointNode {
  readonly name: string;
  readonly parentName: string | null;
  readonly children: JointNode[];
  readonly localTransform: {
    readonly position: Vec3;
    readonly orientation: { x: number; y: number; z: number; w: number };
  };
}
```

A node in a skeleton's joint hierarchy. `JointNode` is defined in
`src/story-api/types.ts` alongside `Vec3` and `BoundingBox`, and re-exported
from `src/story-api/index.ts`. It is richer than the existing `JointId` —
`JointId` is a lightweight lookup key, while `JointNode` carries the full
skeleton tree with local transforms.

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Joint name (e.g. `"LEFT_SHOULDER"`, `"ROOT"`) |
| `parentName` | `string \| null` | Parent joint name, `null` for root joints |
| `children` | `JointNode[]` | Direct child joints |
| `localTransform.position` | `Vec3` | Position relative to parent joint |
| `localTransform.orientation` | `Orientation` | Rotation relative to parent joint |

Root joints have `parentName: null` and appear as top-level entries in
the `jointHierarchy` array.

**Recursion depth limit:** The parser caps joint tree depth at 64 levels.
If an .a3p file contains a deeper hierarchy (likely data corruption), parsing
stops at depth 64 and logs a warning.

## Extended `AliceProject`

The `AliceProject` interface gains three optional fields:

```typescript
interface AliceProject {
  version: string;
  projectName: string;
  sceneObjects: AliceObject[];
  methods: AliceMethod[];

  // New — model resource metadata (Sprint 2)
  jointHierarchy?: JointNode[];
  boundingBoxes?: Record<string, BoundingBox>;
  textureRefs?: string[];
}
```

### `jointHierarchy`

An array of root `JointNode` objects representing the full skeleton tree of all
jointed models in the project. The array is flat at the top level — each entry
is a root bone. Children are nested recursively.

**Example structure for a biped:**

```
ROOT
├── SPINE_BASE
│   ├── SPINE_UPPER
│   │   ├── LEFT_SHOULDER
│   │   │   ├── LEFT_ELBOW
│   │   │   └── LEFT_WRIST
│   │   ├── RIGHT_SHOULDER
│   │   │   ├── RIGHT_ELBOW
│   │   │   └── RIGHT_WRIST
│   │   └── NECK
│   │       └── HEAD
│   └── PELVIS
│       ├── LEFT_HIP
│       │   ├── LEFT_KNEE
│       │   └── LEFT_ANKLE
│       └── RIGHT_HIP
│           ├── RIGHT_KNEE
│           └── RIGHT_ANKLE
```

### `boundingBoxes`

A `Record<string, BoundingBox>` keyed by resource name (e.g. the Alice resource
class short name like `"BunnyResource"`). Each value is a min/max bounding box
in model-local coordinates.

```typescript
project.boundingBoxes?.['BunnyResource'];
// → { min: { x: -0.3, y: 0, z: -0.2 }, max: { x: 0.3, y: 1.5, z: 0.2 } }
```

When the .a3p file does not contain bounding data for a resource, that resource
is omitted from the record (not present with a zero box).

### `textureRefs`

A `string[]` of texture file paths relative to the ZIP root. These are
discovered from two sources:

1. **XML resource references** — texture paths declared in the XML scene graph
2. **ZIP directory entries** — files matching image extensions (`.png`, `.jpg`,
   `.jpeg`, `.gif`, `.bmp`, `.tga`) found anywhere in the ZIP

The array is deduplicated and sorted alphabetically.

```typescript
project.textureRefs;
// → ["resources/textures/eye.png", "resources/textures/skin.png"]
```

## Extraction Details

### Joint Hierarchy Extraction

The parser walks `JointImplementation` XML nodes inside resource type
definitions. Each node declares a joint `name`, optional `parent` reference,
and local transform properties (position `x/y/z` and orientation quaternion
`x/y/z/w`).

**Extraction steps:**

1. Collect all `JointImplementation` nodes from the XML
2. Build a flat map of `name → { parentName, localTransform }`
3. Construct the tree by attaching each node to its parent
4. Nodes without a parent become root entries in `jointHierarchy`
5. Enforce depth cap of 64 (log warning and truncate if exceeded)
6. Detect cycles by tracking visited nodes during tree construction

### Bounding Box Extraction

Bounding boxes are extracted from resource type nodes that declare spatial
extent properties. The parser looks for `min`/`max` coordinate values on
resource definitions and pairs them with the resource's short name.

### Texture Reference Extraction

Texture paths are collected from two passes:

1. **XML pass:** Scan for resource property values that reference texture files
2. **ZIP pass:** List all ZIP entries matching image extensions

Results are merged, deduplicated, and sorted.

## Backward Compatibility

The three new fields are **optional** (`?`). This means:

- `parseA3P()` always sets them (they default to `[]` / `{}`), but consumers
  that don't destructure them see no change
- Existing test fixtures continue to pass — the new fields are additive
- `Scene.fromProject()` ignores the new fields (it only reads `sceneObjects`)
- `a3p-writer.ts` is unaffected — it operates on XML, not the typed model

**Type-level proof:** Any code written as:

```typescript
const { version, projectName, sceneObjects, methods } = await parseA3P(buf);
```

continues to compile and run identically.

## Testing

Tests are in `test/a3p-parser.test.ts` (extended, not a new file):

- **Joint hierarchy:** Synthetic XML with nested `JointImplementation` nodes.
  Verifies tree structure, parent references, transform values, and depth cap.
- **Bounding boxes:** Synthetic XML with min/max coordinates. Verifies correct
  key mapping and coordinate extraction.
- **Texture refs:** Synthetic ZIP with image files and XML texture references.
  Verifies deduplication, sorting, and both extraction sources.
- **Backward compatibility:** Existing tests remain unchanged — the new optional
  fields don't affect them.

### Example Test (Joint Hierarchy)

```typescript
it('extracts joint hierarchy from JointImplementation nodes', async () => {
  const project = await parseA3P(syntheticA3PWithJoints);

  expect(project.jointHierarchy).toBeDefined();
  expect(project.jointHierarchy!.length).toBeGreaterThan(0);

  const root = project.jointHierarchy![0];
  expect(root.name).toBe('ROOT');
  expect(root.parentName).toBeNull();
  expect(root.children.length).toBeGreaterThan(0);

  const spine = root.children.find(c => c.name === 'SPINE_BASE');
  expect(spine).toBeDefined();
  expect(spine!.parentName).toBe('ROOT');
});
```

## Relationship to Story API

The `JointNode` type in the parser is richer than the existing `JointId` in
`story-api/types.ts`:

| Type | Module | Purpose |
|---|---|---|
| `JointId` | `story-api/types.ts` | Lightweight ID: `{ name, parent? }` — for entity joint lookup |
| `JointNode` | `story-api/types.ts` | Full skeleton node with children and local transforms |

`JointId` is used by `SJointedModel.getJoint()` for runtime joint references.
`JointNode` is used by the parser to carry full skeleton data from .a3p files.
A future integration step will populate `SJointedModel` joint data from
`JointNode` trees.

## Limitations

- **Joint depth cap:** 64 levels. Deeper hierarchies are truncated with a
  console warning. This guards against malformed XML causing stack overflow.
- **Cycle detection:** If joint parent references form a cycle, the parser
  breaks the cycle by treating the back-edge node as a root. A warning is logged.
  Cycle detection is scoped to joint tree construction only — the existing
  `resolve()` key-reference function is **not** modified (it remains a simple
  map lookup on the hot path). Joint cycles are caught during the tree-build
  step via a visited-set, not during XML traversal.
- **Bounding box coverage:** Only resources with explicit bounding data in the
  XML are included. Resources without bounds are simply absent from the record.
- **Texture discovery is best-effort.** Textures embedded in binary model
  formats (not as separate ZIP entries or XML references) are not discovered.
