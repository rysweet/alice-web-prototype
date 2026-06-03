# 3D Asset Quality Pipeline

The quality pipeline (`src/open-asset-pipeline/quality-pipeline.ts`) automates
generation, export, and visual quality assessment for all 145 procedural 3D
models in the Alice open-source asset pipeline. It iteratively improves
generator parameters until every model meets a minimum recognizability
threshold.

> **Depends on:** [Open-Asset Pipeline](./open-asset-pipeline.md) for
> procedural generators and model definitions.

## Quick Start

```bash
# Generate all 145 models, export as .glb, score quality, iterate up to 3×
npx tsx scripts/run-quality-pipeline.ts

# Run only the Playwright visual quality tests (after generation)
npx playwright test test/quality-pipeline.playwright.ts

# View the quality report
cat assets/generated/quality-report.json | jq '.aggregate'
```

### Programmatic Usage

```typescript
import { runQualityPipeline } from "./open-asset-pipeline/quality-pipeline.js";

const report = await runQualityPipeline({
  outputDir: "assets/generated",
  maxIterations: 3,
  passingScore: 50,
});

console.log(`Passed: ${report.aggregate.passed}/${report.aggregate.total}`);
console.log(`Average score: ${report.aggregate.averageScore.toFixed(1)}`);
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Quality Pipeline Loop                         │
│                                                                 │
│  ┌──────────┐    ┌────────────┐    ┌─────────────┐             │
│  │ Generate  │───▶│ Export GLB │───▶│ Score Model │             │
│  │ Model     │    │ to disk    │    │ (3 metrics) │             │
│  └──────────┘    └────────────┘    └──────┬──────┘             │
│                                           │                     │
│                        ┌──────────────────┤                     │
│                        │                  │                     │
│                   score ≥ 50         score < 50                 │
│                        │                  │                     │
│                        ▼                  ▼                     │
│                   ✓ Pass           Adjust params                │
│                                   & re-generate                 │
│                                   (max 3 iterations)            │
│                                                                 │
│  After all iterations:                                          │
│  ┌──────────────────────────────────────────────┐              │
│  │  Write quality-report.json to outputDir       │              │
│  └──────────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline Steps

1. **Generate** — calls `generateProceduralModel()` for each of the 145 model
   entries in `src/model-resources/individual-resources.ts`
2. **Export** — writes each model as a binary glTF (`.glb`) file to
   `assets/generated/` using `@gltf-transform/core`
3. **Score** — evaluates three quality heuristics on the raw geometry (no
   rendering required):
   - **Silhouette coverage** — ratio of bounding-box area to expected area for
     the entity category
   - **Joint placement** — whether joint positions fall within valid body
     regions
   - **Proportions** — limb-to-torso and head-to-body ratios against
     category-specific ideals
4. **Iterate** — models scoring below 50 have their `ProceduralModelConfig.scale`
   adjusted and are re-generated. Maximum 3 iterations; stops early if all
   models pass. Joint and proportion failures are reported but require generator
   changes to fix automatically.
5. **Report** — writes `quality-report.json` with per-model scores, iteration
   history, and aggregate statistics.

## Configuration

### `QualityPipelineOptions`

```typescript
interface QualityPipelineOptions {
  /** Output directory for .glb files and report. Default: "assets/generated" */
  outputDir?: string;

  /** Maximum iteration rounds. Default: 3 */
  maxIterations?: number;

  /** Minimum passing score (0–100). Default: 50 */
  passingScore?: number;

  /** Generate only specific model IDs. Default: all 145 */
  filter?: string[];
}
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `QUALITY_OUTPUT_DIR` | `assets/generated` | Override output directory |
| `QUALITY_MAX_ITERATIONS` | `3` | Override max iterations |
| `QUALITY_PASSING_SCORE` | `50` | Override passing threshold |

## Output Files

### GLB Models

All 145 models are written to `assets/generated/` as binary glTF files:

```
assets/generated/
├── ALIEN.glb
├── BUNNY.glb
├── CHEF.glb
├── ...                    (145 .glb files total)
├── WHALE.glb
└── quality-report.json
```

File names match the resource ID from `individual-resources.ts` (e.g.,
`BipedResource.ALIEN` → `ALIEN.glb`).

Each `.glb` file contains:

- **Mesh data** — vertices and indices as a single primitive, plus normals
    when provided or computed by the exporter
- **Material** — PBR material (diffuse color mapped to glTF base color factor)
- **Metadata** — custom extras with `category`, `resourceId`, `generatorVersion`

### Quality Report

`assets/generated/quality-report.json`:

```json
{
  "generatedAt": "2026-06-02T23:30:00.000Z",
  "totalModels": 145,
  "aggregate": {
    "total": 145,
    "passed": 142,
    "failed": 3,
    "averageScore": 72.4,
    "minScore": 41.2,
    "maxScore": 95.1
  },
  "byCategory": {
    "BIPED": { "total": 24, "passed": 24, "averageScore": 78.3 },
    "QUADRUPED": { "total": 30, "passed": 29, "averageScore": 71.5 },
    "FLYER": { "total": 21, "passed": 21, "averageScore": 74.2 },
    "SWIMMER": { "total": 15, "passed": 14, "averageScore": 68.1 },
    "SLITHERER": { "total": 5, "passed": 5, "averageScore": 65.9 },
    "PROP": { "total": 30, "passed": 29, "averageScore": 70.4 },
    "VEHICLE": { "total": 20, "passed": 20, "averageScore": 73.8 }
  },
  "models": [
    {
      "id": "ALIEN",
      "category": "BIPED",
      "finalScore": 82.1,
      "passed": true,
      "iterations": 1,
      "scores": {
        "silhouette": 85.0,
        "joints": 78.3,
        "proportions": 83.0
      },
      "history": [
        { "iteration": 1, "score": 82.1 }
      ],
      "glbPath": "assets/generated/ALIEN.glb",
      "glbSizeBytes": 14832
    }
  ]
}
```

## Quality Scoring

### Silhouette Coverage (0–100)

Projects the model's bounding box onto the XY plane and computes the ratio of
occupied area to the expected area for the category. A biped should be tall and
narrow; a quadruped should be wide and low; a flyer should have a wide
wingspan.

```typescript
const expected = CATEGORY_SILHOUETTE_TARGETS[category];
const actual = { width: bbox.max.x - bbox.min.x, height: bbox.max.y - bbox.min.y };
const ratio = Math.min(actual.width / expected.width, actual.height / expected.height);
const score = Math.min(100, ratio * 100);
```

### Joint Placement (0–100)

Resolves each joint's `localTransform.position` through the parent hierarchy to
compute world-space positions, then checks them against the model's bounding
box. Generators must populate `ModelJointDefinition.localTransform` for joints
that participate in scoring; joints without position data are skipped and
flagged in the report.

Scored joints should be:

- **Inside** the bounding box (with 10% margin)
- **Symmetric** — left/right pairs within 5% position difference
- **Hierarchical** — child joints further from root than parents

Each violation reduces the score. A model with all scored joints correctly
placed scores 100. Joints without position data do not affect the score but
are reported as unscorable.

### Proportions (0–100)

Compares body-part ratios against category-specific ideal proportions:

| Category | Metric | Ideal Ratio |
|---|---|---|
| BIPED | head height / total height | 0.12–0.18 |
| BIPED | arm span / height | 0.9–1.1 |
| QUADRUPED | body length / height | 1.5–2.5 |
| QUADRUPED | leg height / body height | 0.4–0.7 |
| FLYER | wingspan / body length | 2.0–4.0 |
| SWIMMER | body length / body width | 3.0–6.0 |
| SLITHERER | total length / width | 8.0–15.0 |
| PROP | max/min dimension ratio | 0.5–2.0 |
| VEHICLE | length / height | 2.0–4.0 |

Each ratio within range scores 100; ratios outside range lose points
proportionally.

### Score Aggregation

The final score is the arithmetic mean of the three sub-scores:

```typescript
const finalScore = (silhouette + joints + proportions) / 3;
const passed = finalScore >= passingScore; // default: 50
```

## Parameter Tuning

When a model scores below the threshold, the pipeline adjusts
`ProceduralModelConfig.scale` — the only automatically tunable parameter in the
current config interface. Automated iteration primarily addresses overall
size/silhouette failures:

| Lowest Sub-Score | Adjustment |
|---|---|
| Silhouette | Increase uniform `scale` by 15% to fill expected bounding box |
| Joints | Logged as warning — requires generator changes to fix |
| Proportions | Logged as warning — requires generator changes to fix |

Scale adjustments compound across iterations. After 3 iterations, the model is
accepted at whatever score it has reached. Joint placement and proportion
failures are scored and reported for manual generator improvement or future
per-part configuration fields.

## GLB Export

### Module: `src/open-asset-pipeline/gltf-export.ts`

Converts `ModelGeometryData` and `ModelJointDefinition[]` to binary glTF using
`@gltf-transform/core`.

```typescript
import { exportModelToGlb } from "./open-asset-pipeline/gltf-export.js";

const glbBuffer: Uint8Array = await exportModelToGlb({
  geometry: model.geometry,
  joints: model.joints,
  materials: model.materials,
  metadata: {
    category: "BIPED",
    resourceId: "ALIEN",
    generatorVersion: "1.0.0",
  },
});
```

### `exportModelToGlb(options): Promise<Uint8Array>`

Builds a glTF document with:

- One mesh with a single primitive (positions + indices; normals computed if
  absent in `ModelGeometryData`)
- One PBR material (Alice's `MaterialDefinition.diffuseColor` → glTF `baseColorFactor`)
- Custom `extras` on the root node with category and resource metadata
- Joint hierarchy encoded as glTF nodes (not skinned — structural metadata only)

Returns the packed `.glb` binary as a `Uint8Array`.

### `writeModelGlb(options): Promise<void>`

Convenience wrapper that calls `exportModelToGlb()` and writes the result to
disk using Node.js `fs`.

```typescript
import { writeModelGlb } from "./open-asset-pipeline/gltf-export.js";

await writeModelGlb({
  geometry: model.geometry,
  joints: model.joints,
  materials: model.materials,
  outputPath: "assets/generated/ALIEN.glb",
  metadata: { category: "BIPED", resourceId: "ALIEN" },
});
```

## Playwright Visual Quality Tests

### Module: `test/quality-pipeline.playwright.ts`

A Playwright test suite that validates each generated `.glb` file by loading it
in a headless browser with Three.js and taking a screenshot.

```bash
# Run all quality tests
npx playwright test test/quality-pipeline.playwright.ts

# Run for a specific model
npx playwright test test/quality-pipeline.playwright.ts -g "ALIEN"
```

### Test Structure

```typescript
// One test per model — provides individual pass/fail reporting
test.describe("Quality Pipeline Visual Tests", () => {
  for (const model of allModelEntries) {
    test(`model ${model.id} meets quality threshold`, async ({ page }) => {
      // 1. Load minimal HTML harness with Three.js + GLTFLoader
      await page.goto(harness.url);

      // 2. Load the .glb file into the Three.js scene
      await page.evaluate((path) => window.loadGlb(path), model.glbPath);

      // 3. Take a screenshot
      const screenshot = await page.screenshot();

      // 4. Assert model rendered (non-empty pixel coverage)
      const pixelCoverage = await page.evaluate(() => window.getPixelCoverage());
      expect(pixelCoverage).toBeGreaterThan(0.01);

      // 5. Verify quality score from the report
      expect(model.finalScore).toBeGreaterThanOrEqual(50);
    });
  }
});
```

### HTML Test Harness

The test uses a minimal HTML page that:

1. Creates a Three.js WebGLRenderer (800×600)
2. Adds a perspective camera positioned to frame the model
3. Adds ambient + directional lighting
4. Exposes `window.loadGlb(path)` to load a `.glb` file via Three.js
   `GLTFLoader`
5. Exposes `window.getPixelCoverage()` to measure non-background pixel ratio

## CLI Script

### `scripts/run-quality-pipeline.ts`

Node.js entry point for running the pipeline from the command line:

```bash
# Default: generate all, export to assets/generated/, max 3 iterations
npx tsx scripts/run-quality-pipeline.ts

# Custom output directory
npx tsx scripts/run-quality-pipeline.ts --output ./my-assets

# Only generate specific models
npx tsx scripts/run-quality-pipeline.ts --filter ALIEN,BUNNY,BEAR

# Set custom passing score
npx tsx scripts/run-quality-pipeline.ts --passing-score 60
```

### CLI Arguments

| Flag | Default | Description |
|---|---|---|
| `--output <dir>` | `assets/generated` | Output directory for .glb files and report |
| `--max-iterations <n>` | `3` | Maximum iteration rounds |
| `--passing-score <n>` | `50` | Minimum passing score |
| `--filter <ids>` | *(all 145)* | Comma-separated resource IDs to process |
| `--verbose` | `false` | Print per-model progress |

### Output

```
Quality Pipeline — Starting
  Models: 145
  Output: assets/generated/
  Max iterations: 3
  Passing score: 50

Iteration 1/3:
  Generated: 145/145
  Exported: 145/145
  Passed: 138/145 (avg: 68.4)
  Below threshold: 7 models

Iteration 2/3:
  Regenerated: 7 models
  Passed: 143/145 (avg: 71.2)
  Below threshold: 2 models

Iteration 3/3:
  Regenerated: 2 models
  Passed: 144/145 (avg: 72.1)
  Below threshold: 1 model

Quality Pipeline — Complete
  Total: 145 | Passed: 144 | Failed: 1
  Report: assets/generated/quality-report.json
```

## API Reference

### `runQualityPipeline(options?): Promise<QualityReport>`

Main entry point. Generates all models, exports to .glb, scores, iterates, and
returns the quality report.

### `scoreModel(geometry, joints, category): QualityScore`

Computes the three quality sub-scores for a single model's geometry.

```typescript
interface QualityScore {
  silhouette: number;  // 0–100
  joints: number;      // 0–100
  proportions: number; // 0–100
  final: number;       // arithmetic mean
}
```

### `adjustParameters(config, score): ProceduralModelConfig`

Returns a scale-adjusted `ProceduralModelConfig` when the silhouette sub-score
is lowest. For joint or proportion failures, returns the config unchanged (these
are reported but not automatically fixable). Pure function — does not mutate the
input.

### `exportModelToGlb(options): Promise<Uint8Array>`

Converts model data to binary glTF. See [GLB Export](#glb-export).

### `writeModelGlb(options): Promise<void>`

Writes a model to disk as a `.glb` file.

## Dependencies

| Package | Type | Purpose |
|---|---|---|
| `@gltf-transform/core` | runtime | GLB binary construction and buffer packing |
| `@playwright/test` | dev | Headless browser for visual quality tests |

## Related Documentation

- [Open-Asset Pipeline](./open-asset-pipeline.md) — procedural generators and
  model provider
- [Model Resources](./model-resources.md) — catalog of all 145 model entries
- [Scene Graph Abstraction](./scene-graph-abstraction.md) — visitor pattern and
  coordinate bridge
- [Scene Rendering](./scene-rendering.md) — how models are rendered in the
  browser
