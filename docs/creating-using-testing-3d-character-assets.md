# Creating, Using, and Testing 3D Character Assets

The Alice web prototype cannot copy the proprietary Sims-style assets from the
Java desktop version. The replacement path is an open asset pipeline:
procedural models for complete coverage, glTF/GLB import for authored models,
Blender export support, profile-driven silhouettes for recognizability, and a
gallery browser for selecting models.

Use this guide when adding a new character, improving an existing procedural
model, or validating imported open-source assets.

## Related documentation

Use these stable guides for deeper detail on the asset pipeline, model sources,
quality checks, and scene graph integration:

- [Open-source 3D alternatives](./open-source-3d-alternatives.md)
- [Open-asset pipeline](./open-asset-pipeline.md)
- [Adding open-source 3D models](./tutorial-adding-3d-models.md)
- [3D Asset Quality Pipeline](./quality-pipeline.md)
- [Model resources](./model-resources.md)
- [Scene graph abstraction](./scene-graph-abstraction.md)

## Asset types

### Procedural profile assets

Most Alice models are currently represented by procedural geometry driven by
`ModelProfile` entries in `src/open-asset-pipeline/model-profiles.ts`. A profile
defines:

- resource `id` and display `name`
- `EntityCategory`
- primary and secondary colors
- body, head, and limb proportions
- distinctive features such as ears, tail, wings, trunk, fins, hat, crown,
  wheels, sail, or propeller

Use procedural profiles when you need complete coverage, fast tests, or a
recognizable placeholder before a high-quality model exists.

### glTF/GLB assets

Use glTF or GLB when an authored model is available under a compatible license.
The pipeline accepts parsed glTF primitives and skeletons, maps joint names to
Alice conventions, converts geometry to `ModelGeometryData`, and registers the
result as a `ModelResourceDefinition`.

### Sample assets

`assets/samples/` contains small proof-of-concept glTF files and a README. Keep
sample assets small, clearly licensed, and suitable for tests or examples.

## Creating a procedural character

1. Pick the existing resource entry in
   `src/model-resources/individual-resources.ts`, or add a new entry there if
   the model is new to the catalog.
2. Add or update the matching profile in
   `src/open-asset-pipeline/model-profiles.ts`.
3. Use the resource ID exactly. Tests expect every resource to have a matching
   profile and no duplicate profile IDs.
4. Choose the correct category:

| Category | Typical models |
| --- | --- |
| `BIPED` | Standing characters, humanoid creatures |
| `QUADRUPED` | Four-legged animals |
| `FLYER` | Birds and winged creatures |
| `SWIMMER` | Aquatic animals using swimmer joints |
| `SLITHERER` | Snakes and segmented creatures |
| `PROP` | Furniture, set dressing, static objects |
| `VEHICLE` | Automobiles, aircraft, watercraft, trains |

5. Tune proportions and features until the model has a recognizable silhouette.

Example profile shape:

```typescript
profile(
  "FOX",
  "Fox",
  "QUADRUPED",
  0xCC7733,
  0xFFFFFF,
  { height: 0.7, width: 1.2, depth: 1.0 },
  { size: 0.8, shape: "elongated", yOffset: 0 },
  { thickness: 0.8, length: 0.9 },
  [{ type: "tail", scale: 1.4 }, { type: "ears", scale: 1.1 }],
);
```

Then verify the generated model:

```typescript
import { generateProceduralModel } from "../src/open-asset-pipeline/procedural-generators.js";

const model = generateProceduralModel({
  category: "QUADRUPED",
  id: "FOX",
  name: "Fox",
  modelName: "Fox",
});
```

The result must include non-empty geometry, valid indices, materials, joints,
and license metadata.

## Creating an authored glTF or GLB character

1. Start from a compatible source. Prefer CC0 assets from sources such as
   Kenney, Quaternius, Poly Pizza, OpenGameArt, or Sketchfab with the CC0 filter.
2. Record the license, source URL, author, and attribution requirements.
3. Use Blender to inspect and normalize the model:
   - apply scale and transforms
   - remove unused meshes/materials
   - keep the model near Alice scale, usually around one to two units tall for
     characters
   - ensure the model faces the expected forward direction
   - rename bones or provide a joint map
4. Export through the Blender helper when possible:

```bash
blender --background character.blend \
  --python scripts/blender/export-alice-gltf.py \
  -- --output ./assets/gltf --format GLB
```

5. Register the asset metadata through `createModelDefinitions`:

```typescript
import {
  CC0_LICENSE,
  createModelDefinitions,
} from "../src/open-asset-pipeline";

const definitions = createModelDefinitions({
  sources: [
    {
      type: "gltf",
      category: "BIPED",
      url: "/models/character.glb",
      license: {
        ...CC0_LICENSE,
        sourceUrl: "https://example.invalid/source",
        author: "Asset Author",
      },
      gltfOptions: {
        url: "/models/character.glb",
        scale: 1,
        flipZ: false,
      },
    },
  ],
  fallbackToProcedural: true,
});
```

The current `gltf` and `url` source definitions are metadata-only: they make the
asset discoverable with tags, category, tree path, and canonical joints, but they
do not provide a loadable `geometry` or `loader`. To make a glTF asset loadable
in `ModelResourceCatalog.load()`, wrap the parsed glTF data with
`importGltfData()` and register a `ModelResourceDefinition` that supplies
`geometry` directly or a `loader` that returns geometry, materials, and
`classInfo`.

Use the source URL, author, and attribution in the `AssetLicense` while building
definitions. If a runtime catalog path needs to display provenance later, add a
dedicated provenance field or sidecar metadata instead of assuming
`ModelResourceSummary` preserves the whole license object.

## Joint and skeleton conventions

All character assets need a `ROOT` joint. Non-root joints must reference an
existing parent. Use the canonical joints from
`getCanonicalJoints(category)` as the source of truth.

Common biped mappings:

| Source bone | Alice joint |
| --- | --- |
| `Root`, `Hips`, `mixamorigHips` | `ROOT` |
| `Spine` | `SPINE_BASE` |
| `Head` | `HEAD` |
| `UpperArm.L`, `mixamorigLeftArm` | `LEFT_SHOULDER` |
| `UpperLeg.R`, `mixamorigRightUpLeg` | `RIGHT_HIP` |

If a source rig uses different names, pass a `jointNameMap` to the glTF import
options. Unknown names are converted to upper snake case, but explicit maps are
preferred for production assets.

## Using assets in the catalog and gallery

Model definitions are registered with `ModelResourceCatalog`:

```typescript
import { createAllProceduralDefinitions } from "../src/open-asset-pipeline";
import { ModelResourceCatalog } from "../src/model-resources";

const catalog = new ModelResourceCatalog();
for (const definition of createAllProceduralDefinitions()) {
  catalog.register(definition);
}

const bipeds = catalog
  .list()
  .filter((resource) => resource.modelClass.resourceClassName === "BipedResource");
const openSourceModels = catalog.discover({ tags: ["open-source"] });
```

Gallery data is built from the individual resource lists and model profiles in
`src/gallery/gallery-data.ts`. When you add a new resource/profile pair, make
sure the gallery can locate the profile with `getModelProfile(resource.id)`.

## Testing existing and new assets

Run targeted tests while developing:

```bash
npx vitest run test/model-profiles.test.ts
npx vitest run test/open-asset-pipeline.test.ts
npx vitest run test/quality-scoring.test.ts test/quality-pipeline.test.ts
npx vitest run test/gltf-export.test.ts
npx vitest run test/gallery-data.test.ts test/gallery-preview.test.ts
```

Run full repository validation before opening or updating a PR:

```bash
npm test
npm run build
```

New or changed assets should satisfy these checks:

- every resource has a matching profile
- profile IDs are unique
- body proportions and colors are valid
- generated geometry has vertices, triangle indices, and valid index bounds
- joints include `ROOT` and valid parent references
- material colors match the intended profile
- glTF imports preserve expected scale, orientation, materials, and mapped joints
- gallery search/category data includes the model
- license metadata is present and compatible with repository use

## Review checklist

Before merging asset work:

- Do not copy proprietary Sims or Java Alice desktop model assets.
- Prefer CC0 assets; document attribution when a license requires it.
- Keep binaries small enough for repository and browser use.
- Keep generated artifacts out of source unless they are intentional samples or
  reviewed release assets.
- Add tests for every new category, profile, importer behavior, or gallery path.
- Run `npm test` and `npm run build`.
- Update this guide when the asset creation or validation process changes.
