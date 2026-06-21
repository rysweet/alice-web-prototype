# Open-Asset Pipeline

The `src/open-asset-pipeline/` module replaces Alice's proprietary Sims-style
3D model assets with an open-source asset pipeline. It provides procedurally
generated placeholder geometry for all 7 Alice entity categories, a glTF/GLB
loader for production-quality models, and a Blender export pipeline that maps
bone names to Alice's canonical joint convention.

> **Background:** Alice 3's desktop client ships proprietary 3D models that
> cannot be redistributed (see
> [issue #86](https://github.com/rysweet/alice-web-prototype/issues/86)). This
> module resolves that structural blocker. For the full research analysis, see
> [Open-Source 3D Alternatives](./open-source-3d-alternatives.md).

## Quick Start

```typescript
import {
  createAllProceduralDefinitions,
  createModelDefinitions,
} from "./open-asset-pipeline/model-provider.js";
import { ModelResourceCatalog } from "./model-resources/catalog.js";

// 1. Generate definitions for all categories (procedural placeholders)
const definitions = createAllProceduralDefinitions();

// 2. Register with the catalog
const catalog = new ModelResourceCatalog();
for (const def of definitions) {
  catalog.register(def);
}

// 3. Load geometry from a definition
const biped = catalog.get("open-source/biped/alice");
if (biped?.loader) {
  const { geometry, materials, classInfo } = biped.loader();
  // geometry.vertices, geometry.indices, geometry.normals — ready for Three.js
}
```

### With Custom glTF Models

```typescript
import { createModelDefinitions } from "./open-asset-pipeline/model-provider.js";
import { CC0_LICENSE } from "./open-asset-pipeline/types.js";

const definitions = createModelDefinitions({
  sources: [
    {
      type: "gltf",
      category: "BIPED",
      url: "/models/character.glb",
      license: CC0_LICENSE,
    },
  ],
  // true = procedural fallback for categories without glTF sources
  fallbackToProcedural: true,
});
```

### With Project Imports

Browser and API imports store project-owned model bytes in Project IO resources
and resolve them through the open-asset pipeline by project resource ID:

```typescript
const modelResourceId = "project/models/moon-rover.glb";
const archivePath = "resources/models/moon-rover.glb";
```

Scene objects reference the project resource ID:

```json
{
  "name": "moonRover",
  "typeName": "SModel",
  "modelResourceId": "project/models/moon-rover.glb"
}
```

The archive path holds the bytes in `.a3p` files. See the issue #221
contract in
[[Imported model and texture assets](./imported-models-and-textures.md)
for the project-state and persistence contract.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  ModelProvider API                    │
│  createAllProceduralDefinitions()                    │
│  createModelDefinitions(options)                     │
│  createProceduralDefinitions(category)               │
└───────┬────────────────────┬───────────────────┬────┘
        │                    │                   │
        ▼                    ▼                   ▼
┌───────────────┐  ┌─────────────────┐  ┌──────────────┐
│  Procedural   │  │  glTF Loader    │  │  Blender     │
│  Generators   │  │  (gltf-loader)  │  │  Pipeline    │
│               │  │                 │  │  (scripts/)  │
│  7 categories │  │  Joint mapping  │  │              │
│  46 joint     │  │  Mixamo compat  │  │  Bone rename │
│  hierarchies  │  │  Mesh merging   │  │  glTF export │
└───────────────┘  └─────────────────┘  └──────────────┘
        │                    │
        ▼                    ▼
┌─────────────────────────────────────────────────────┐
│            ModelResourceDefinition[]                  │
│  id, name, modelClass, tags, loader()                │
└───────────────────────┬─────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│            ModelResourceCatalog                       │
│  register(), get(), list(), search()                 │
└─────────────────────────────────────────────────────┘
```

## Module Files

| File | Purpose |
| --- | --- |
| `types.ts` | TypeScript interfaces: `ModelProviderSource`, `GltfImportOptions`, `ProceduralModelConfig`, `AssetLicense`, `EntityCategory` |
| `model-provider.ts` | Public API: `createAllProceduralDefinitions()`, `createModelDefinitions()`, `createProceduralDefinitions()`, `getOpenSourcePipelineSummary()` |
| `procedural-generators.ts` | Generates placeholder geometry (capsules, ellipsoids, cylinders) with correct joint hierarchies for all 7 entity categories |
| `gltf-loader.ts` | Converts parsed glTF mesh data and skeletons to `ModelGeometryData` + `ModelJointDefinition[]`. Includes Mixamo and generic joint name mapping |
| `mesh-conversion.ts` | Bridges `MeshData` (structured vectors) ↔ `ModelGeometryData` (flat arrays). Handles multi-mesh merging with index offset correction |
| `blender-pipeline.ts` | Generates Blender Python export scripts. Provides `getBlenderJointMap()` and `getAssetSourceGuide()` |

## API Reference

### `createAllProceduralDefinitions(): ModelResourceDefinition[]`

Returns procedural model definitions for every known resource across all 7
entity categories plus sub-model-classes (Fish, Marine Mammal, Aircraft,
Watercraft, Train). Each definition includes a synchronous `loader()` that
generates geometry on demand.

### `createModelDefinitions(options?: ModelProviderOptions): ModelResourceDefinition[]`

Creates model definitions from the given provider options. If
`fallbackToProcedural` is `true` (the default), categories without explicit
sources get procedural definitions automatically.

```typescript
interface ModelProviderOptions {
  sources?: ModelProviderSource[];  // explicit model sources
  fallbackToProcedural?: boolean;   // default: true
}
```

### `createProceduralDefinitions(category, license?): ModelResourceDefinition[]`

Returns procedural definitions for all known resources in a single category.

### `getOpenSourcePipelineSummary()`

Returns statistics about the pipeline: total definition count, count by
category, and license.

### `importGltfData(primitives, skeleton, options): GltfImportResult`

Converts pre-parsed glTF mesh primitives and skeleton data into Alice-compatible
`ModelGeometryData` and `ModelJointDefinition[]`. This is the pure conversion
function — it does not call Three.js or fetch files.

### `mapJointName(gltfName, customMap?): string`

Maps a glTF/Mixamo bone name to Alice's canonical joint name. Falls back to
UPPER_SNAKE_CASE conversion for unmapped names.

### `generateProceduralModel(config): ProceduralModelResult`

Generates placeholder geometry for a specific model configuration. Returns
vertices, indices, normals, joints, materials, and license metadata.

### `getCanonicalJoints(category): ModelJointDefinition[]`

Returns the canonical joint hierarchy for an entity category, matching Alice's
`story-resources.ts` definitions exactly.

### `generateBlenderExportScript(config?): string`

Generates a Blender Python script for exporting models with Alice-compatible
joint naming. See [Blender Pipeline](#blender-pipeline) below.

### `getBlenderJointMap(category?): Record<string, string>`

Returns the Blender bone → Alice joint name mapping for a category. Currently
supports Biped; other categories return an empty map.

## Types

### `EntityCategory`

```typescript
type EntityCategory =
  | "BIPED" | "QUADRUPED" | "FLYER" | "SWIMMER"
  | "SLITHERER" | "PROP" | "VEHICLE";
```

### `AssetLicense`

```typescript
interface AssetLicense {
  spdxId: string;         // e.g. "CC0-1.0", "MIT"
  name: string;           // human-readable license name
  sourceUrl?: string;     // where the asset was obtained
  author?: string;        // original author
  attribution?: string;   // required attribution text
}
```

Pre-defined constants: `CC0_LICENSE`, `PROCEDURAL_LICENSE`.

### `ModelProviderSource`

```typescript
interface ModelProviderSource {
  type: "procedural" | "gltf" | "url";
  category: EntityCategory;
  url?: string;
  gltfOptions?: GltfImportOptions;
  proceduralConfig?: ProceduralModelConfig;
  license: AssetLicense;
}
```

### `GltfImportOptions`

```typescript
interface GltfImportOptions {
  url: string;
  jointNameMap?: Record<string, string>;  // custom bone name overrides
  scale?: number;                          // default: 1.0
  flipZ?: boolean;                         // default: false
  license?: AssetLicense;
}
```

## Procedural Geometry Details

Each category generates recognizable placeholder shapes:

| Category | Body | Limbs | Head | Extras |
| --- | --- | --- | --- | --- |
| Biped | Capsule torso | 4 cylinder limbs | Sphere | Finger joints |
| Quadruped | Elongated box | 4 cylinder legs | Sphere | Tail, ears |
| Flyer | Ellipsoid body | Flat wing planes | Sphere | Tail fan |
| Swimmer | Elongated ellipsoid | Fin planes | Tapered front | Dorsal/caudal fins |
| Slitherer | Linked segments | None | Tapered head | Segmented body |
| Prop | Box | None | None | Category-neutral |
| Vehicle | Box body | Cylinder wheels | None | Axle joints |

All procedural models include the full canonical joint hierarchy for their
category, ensuring skeleton visualization and animation targeting work
correctly.

## Blender Pipeline

The Blender export pipeline consists of two parts:

1. **Python script** (`scripts/blender/export-alice-gltf.py`) — run from the
   command line with Blender
2. **TypeScript generator** (`blender-pipeline.ts`) — generates customized
   export scripts programmatically

### Command-Line Usage

```bash
# Export a single model
blender --background character.blend \
  --python scripts/blender/export-alice-gltf.py \
  -- --output ./assets/gltf --format glb

# Batch export
for f in models/*.blend; do
  blender --background "$f" \
    --python scripts/blender/export-alice-gltf.py \
    -- --output ./assets/gltf --format glb
done
```

### What the Script Does

1. **Renames bones** — Maps Blender bone names to Alice's canonical joint names
   (e.g., `UpperArm.L` → `LEFT_SHOULDER`)
2. **Applies modifiers** — Bakes subdivision surfaces, mirrors, etc.
3. **Exports as glTF/GLB** — Uses Blender's built-in glTF 2.0 exporter

### Bone Name Mapping

| Blender Name | Alice Joint | Category |
| --- | --- | --- |
| `Hips` | `ROOT` | Biped |
| `Spine` | `SPINE_BASE` | Biped |
| `Spine.001` | `SPINE_MIDDLE` | Biped |
| `Spine.002` | `SPINE_UPPER` | Biped |
| `Neck` | `NECK` | Biped |
| `Head` | `HEAD` | Biped |
| `Clavicle.L` | `LEFT_CLAVICLE` | Biped |
| `UpperArm.L` | `LEFT_SHOULDER` | Biped |
| `LowerArm.L` | `LEFT_ELBOW` | Biped |
| `Hand.L` | `LEFT_WRIST` | Biped |
| `UpperLeg.L` | `LEFT_HIP` | Biped |
| `LowerLeg.L` | `LEFT_KNEE` | Biped |
| `Foot.L` | `LEFT_ANKLE` | Biped |
| `Toe.L` | `LEFT_FOOT` | Biped |

Right-side bones follow the same pattern (`.R` suffix → `RIGHT_` prefix).

## Sample Assets

The `assets/samples/` directory contains minimal proof-of-concept glTF files
for three entity categories:

| File | Category | Description |
| --- | --- | --- |
| `biped-placeholder.gltf` | Biped | Humanoid with ROOT → SPINE → HEAD hierarchy |
| `quadruped-placeholder.gltf` | Quadruped | Four-legged animal with spine and leg joints |
| `prop-placeholder.gltf` | Prop | Simple box with ROOT joint |

These files demonstrate the glTF format structure and joint naming convention.
They can be loaded with `importGltfData()` for testing.

## Related Documentation

- [Tutorial: Adding 3D Models](./tutorial-adding-3d-models.md) — step-by-step
  guide for adding new models
- [[Imported model and texture assets](./imported-models-and-textures.md) —
  project-owned model and texture import contract
- [Open-Source 3D Alternatives](./open-source-3d-alternatives.md) — research
  on available tools and repositories
- [Model Resources](./model-resources.md) — catalog system for browsing and
  loading model metadata
- [Scene Rendering](./scene-rendering.md) — how models are rendered in the
  browser
