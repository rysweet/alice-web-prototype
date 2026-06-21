# Alice identity for eatme integration

Alice for the web can produce the same proof artifact JSON files that Java
Alice produces, allowing the eatme harness to validate it as a comparison
target alongside the original Java Alice. LookingGlass is only the GitHub
repository/project nickname for this migration repository.

## Quick Start

```bash
git clone https://github.com/rysweet/alice-web-prototype.git alice-web
cd alice-web
npm install
npm run build:server

# Start the eatme-compatible API server from a local checkout
npm run serve -- \
  --port 3000 \
  --evidence-dir ./evidence \
  --project /path/to/starter.a3p
```

## CLI Usage

Local checkout:

```bash
npm run serve -- [options]
```

Installed or linked package:

```
alice-web serve [options]

Options:
  --port <number>           Port to listen on (default: 3000)
  --evidence-dir <path>     Directory for proof artifact JSON files
  --project <path>          Path to a starter .a3p project file
  --api-token <token>       Token required by mutating local API requests
```

Pass a local-only token with `--api-token` and include the same value in the
`X-Alice-Local-Api-Token` header for every mutating API request. Do not log or
commit token values.

## API Endpoints

See [docs/api-reference.md](docs/api-reference.md) for the full request and
response reference.

### `GET /api/health`
Returns process status. Used by eatme for `process_started` assertion.

### `POST /api/launch`
Start or initialize Alice with a project.
```json
{ "project": "/path/to/starter.a3p" }
```

### `GET /api/project/templates`
List available project templates.

### `POST /api/project/new`
Create a project from a template.

### `POST /api/scene/add-object`
Add an object to the scene. Writes `scene-object-added.json` to evidence dir.
```json
{ "className": "org.lgna.story.SBiped", "name": "bunny" }
```

### `POST /api/code/edit-procedure`
Simulate editing a procedure. Writes `first-lesson-code-editor-action-proof.json`.
```json
{
  "procedureSelector": "scene.myFirstMethod",
  "editSpec": "append-comment:eatme first lesson edit proof"
}
```

### `POST /api/code/create-procedure`
Create a procedure in the current project state.

### `POST /api/code/create-function`
Create a function in the current project state.

### `POST /api/events/register`
Register an event listener. Supports `sceneActivated`, `keyPress`, and
`proximity` event types. Returns a unique registration ID.
```json
{ "eventType": "sceneActivated", "handlerName": "initScene" }
```
Response: `{"registrationId": "evt-1", "eventType": "sceneActivated", "handlerName": "initScene", "evidenceArtifact": "./evidence/event-register.json"}`

### `POST /api/events/fire`
Fire an event. Evaluates all matching registrations and returns which triggered.
```json
{ "eventType": "sceneActivated" }
```
Response: `{"triggered": [{"id": "evt-1", "eventType": "sceneActivated", "handlerName": "initScene"}], "evidenceArtifact": "./evidence/event-fire.json"}`

See [docs/event-system.md](docs/event-system.md) for full event system
documentation including proximity detection and key press handling.

### `POST /api/world/run`
Execute all methods through the Tweedle VM. Returns a structured `execution_log`
with `{step, kind, detail}` entries tracing every statement dispatched.
Supports MethodCall, CountLoop, IfElse (with variable condition lookup),
ReturnStatement (halts method), VariableDeclaration (scoped), and EventListener.
See [docs/statement-execution.md](docs/statement-execution.md) for full details.
```jsonc
// Response
{
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "statements_executed": 8,
  "execution_log": [
    { "step": 1, "kind": "MethodCall", "detail": "this.move()" },
    { "step": 2, "kind": "CountLoop", "detail": "repeat 3 times (3 body statements)" },
    { "step": 3, "kind": "IfElse", "detail": "condition 'true' → ifBody" }
  ]
}
```

### `POST /api/project/save`
Save the project. Writes save proof artifacts.
```json
{ "saveSelector": "scene.myFirstMethod" }
```

### `POST /api/project/export/web-package`
Web-package feature contract: export the active project as a runnable
`alice-web` ZIP package. The package contains `index.html`, `manifest.json`,
`share.json`, `preview.png`, `project/project.json`, and `validation.json`.
```json
{
  "title": "Winter Story",
  "description": "A snow scene with a bunny.",
  "canonicalUrl": "https://example.edu/alice/winter-story"
}
```
Response:
```json
{
  "schema_version": "alice-web.export-web-package-result/v1",
  "status": "exported",
  "runtime": "alice-web",
  "package": {
    "filename": "WinterStory.alice-web.zip",
    "mimeType": "application/zip",
    "sizeBytes": 24576,
    "sha256": "8ad0e9b4f5d8f2d3b30f6d3f6f0f4e6d4f3b2a1900e4c4a1f03f7c2cb72f47cc",
    "base64": "UEsDB..."
  },
  "manifest": {
    "schemaVersion": "alice-web.package/v1",
    "product": "Alice",
    "packageName": "alice-web",
    "runtimeIdentity": "alice-web-player",
    "entrypoint": "index.html"
  },
  "artifacts": {
    "entrypoint": "index.html",
    "manifest": "manifest.json",
    "share": "share.json",
    "preview": "preview.png",
    "validation": "validation.json"
  },
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

### `POST /api/project/share`
Web-package feature contract: generate shareable metadata from an exported
package. The server decodes and validates `packageBase64`, links share metadata
to the package filename, byte size, and SHA-256 digest, and returns playable
HTML/package/preview references.
```json
{
  "packageBase64": "UEsDB...",
  "title": "Winter Story",
  "description": "A snow scene with a bunny.",
  "canonicalUrl": "https://example.edu/alice/winter-story"
}
```

### `POST /api/project/validate-web-package`
Web-package feature contract: validate an exported `alice-web` package before
storing or sharing it.
```json
{ "packageBase64": "UEsDB..." }
```
Validation rejects malformed base64, unreadable ZIP data, missing required
entries, unsafe ZIP paths, duplicate required files, wrong schema identity,
wrong runtime identity, and generated metadata that uses the repository nickname
as product/runtime/API identity.

API response envelopes use snake_case `schema_version`. JSON files inside the
exported ZIP use camelCase `schemaVersion`.

### `POST /api/screenshot`
Capture viewport screenshot evidence for the current Alice scene.

## Artifact Schemas

Proof artifacts that model Java Alice behavior keep the exact JSON schemas that
Java Alice produces. Web package artifacts use the `alice-web.*` schemas because
they describe browser package, player, share, and validation contracts.

| Artifact | Schema Version |
|---|---|
| `event-register.json` | `eatme.alice-event-register/v1` |
| `event-fire.json` | `eatme.alice-event-fire/v1` |
| `scene-object-added.json` | `eatme.alice-scene-object-added/v1` |
| `first-lesson-code-editor-action-proof.json` | `eatme.alice-first-lesson-code-editor-action-proof/v1` |
| `edited-project.a3p` | (binary .a3p project file) |
| `desktop-save-operation-result.json` | `eatme.alice-desktop-save-operation-result/v1` |
| `run-world-result.json` | `eatme.alice-run-world-result/v1` |
| `WinterStory.alice-web.zip` | `alice-web.package/v1` via package `manifest.json` |
| `manifest.json` | `alice-web.package/v1` |
| `share.json` | `alice-web.share/v1` |
| `validation.json` | `alice-web.validation/v1` |
| `preview.png` | PNG preview image referenced by manifest and share metadata |

## Eatme Comparison Target

A `typescript` target entry has been added to
`eatme-test/assets/alice-comparison-targets.yaml`.

To use:
```bash
export ALICE_WEB_URL=http://localhost:3000
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
```

Use `ALICE_WEB_URL` and `ALICE_LOCAL_API_TOKEN` in eatme target configuration
and harness scripts.

## Gadugi Integration Test Scenarios

The gadugi-compatible YAML scenarios in `gadugi/` provide outside-in
integration tests for the current REST API surface. The web package parity
scenario is part of the feature contract and should be added with the route
implementation.

```bash
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi
```

| Scenario | Tests |
|---|---|
| `01-a3p-open-parse-render` | Project load → parse → screenshot |
| `02-tweedle-ast-vm-execution` | VM execution with execution log |
| `03-scene-entity-manipulation` | Add objects → screenshot |
| `04-event-system` | Register → fire → verify triggers |
| `05-save-export-roundtrip` | Edit → save → re-launch → verify |

The web-package route implementation should add
`06-web-player-export-share-parity` for export → validate → share → player
contract coverage.

See [docs/gadugi-test-scenarios.md](docs/gadugi-test-scenarios.md) for full
scenario documentation, schema reference, and writing guide.

## Architecture

```
src/
  evidence-writer.ts    — Writes JSON proof artifacts matching Java schemas
  server.ts             — Express HTTP API server
  cli.ts                — CLI entry point (npm run serve -- ..., alice-web serve ...)
  a3p-parser.ts         — .a3p ZIP/XML parser + joint/bbox/texture extraction
  animation.ts          — Pure-functional tween engine (4 easings, Vec3/Quat/scalar)
  project-io.ts         — Full .a3p archive read/write (manifest, resources, thumbnail)
  project-export.ts     — Runnable alice-web package export, player HTML, share metadata, preview, validation
  collision-detection.ts — Spatial math: distance, AABB, Direction constants
  tweedle-stdlib.ts     — 9 runtime primitives (say/think/move/turn/roll/resize/setOpacity/setColor/delay)
  grading-pipeline.ts   — Lesson 1–8 grading engine with GradeResult scoring
  tweedle-parser.ts     — Tweedle AST parser: lexer + recursive-descent + Pratt
  tweedle-vm.ts         — Tweedle VM: executeProject(), VMScope, 7 handlers
  scene-builder.ts      — Three.js scene builder (existing)
  scene-renderer.ts     — PNG scene renderer (existing)
  image-editor.ts       — RGBA crop/resize/rotate/flip/PNG editing subsystem
  story-api/
    index.ts            — Barrel exports for typed scene/entity model
    types.ts            — Position, Orientation, Size, JointId, Vec3, BoundingBox, JointNode
    entities.ts         — Entity class hierarchy (SThing → SBiped, etc.)
    scene.ts            — Scene container + fromProject() bridge
  hooks/
    place-object.ts     — CLI hook: object placement proof
    edit-procedure.ts   — CLI hook: procedure edit proof
    run-world.ts        — CLI hook: world run proof (with statement execution)
    save-project.ts     — CLI hook: project save proof
tools/
  eatme-place-object    — Shell wrapper for place-object hook
  eatme-edit-procedure  — Shell wrapper for edit-procedure hook
  eatme-run-world       — Shell wrapper for run-world hook
  eatme-save-project    — Shell wrapper for save-project hook
docs/
  tweedle-parser.md     — Tweedle AST parser API & language reference
  statement-execution.md — Full statement execution documentation
  event-system.md        — Event system & object interaction documentation
  story-api.md           — Scene/entity model: types, hierarchy, Scene container
  image-editor.md        — Image editing subsystem: crop, resize, rotate, flip, PNG
  animation.md           — Animation system: tweens, easings, interpolation
  model-resources.md     — Joint hierarchy, bounding boxes, texture extraction
  project-io.md          — Full .a3p archive read/write with round-trip support
  collision-detection.md — Spatial math: distance, AABB intersection, Direction
  tweedle-stdlib.md      — Standard library: 9 runtime primitives
  grading-pipeline.md    — Lesson grading engine (L1–L8)
```

## CLI Hooks (eatme-compatible)

The `tools/` directory contains shell scripts matching the exact interface
of Java Alice's `tools/eatme-*` hooks. These allow the eatme harness to
validate the TypeScript prototype using the same mechanism as Java Alice.

### Usage

```bash
# Build first
npm run build:server

# Place an object in the scene
tools/eatme-place-object --project starter.a3p --evidence-dir ./evidence --json

# Edit a procedure
tools/eatme-edit-procedure --project starter.a3p --evidence-dir ./evidence --json

# Run the world
tools/eatme-run-world --project starter.a3p --evidence-dir ./evidence --json

# Save the project
tools/eatme-save-project --project starter.a3p --save-selector scene.eatmeFirstLessonStep --evidence-dir ./evidence --json
```

Each hook outputs a single JSON line to stdout and writes evidence artifacts
to the `--evidence-dir` directory.
