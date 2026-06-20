# LookingGlass identity for eatme integration

LookingGlass can produce the same proof artifact JSON files that Java Alice
produces, allowing the eatme harness to validate it as a comparison target
alongside the original Java Alice.

## Quick Start

```bash
git clone https://github.com/rysweet/alice-web-prototype.git lookingglass
cd lookingglass
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
lookingglass serve [options]

Options:
  --port <number>           Port to listen on (default: 3000)
  --evidence-dir <path>     Directory for proof artifact JSON files
  --project <path>          Path to a starter .a3p project file
```

## API Endpoints

See [docs/api-reference.md](docs/api-reference.md) for the full request and
response reference.

### `GET /api/health`
Returns process status. Used by eatme for `process_started` assertion.

### `POST /api/launch`
Start or initialize LookingGlass with a project.
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

### `GET /api/screenshot`
Capture a screenshot of the viewport (placeholder in headless mode).

## Proof Artifact Schemas

All artifacts match the exact JSON schemas that Java Alice produces:

| Artifact | Schema Version |
|---|---|
| `event-register.json` | `eatme.alice-event-register/v1` |
| `event-fire.json` | `eatme.alice-event-fire/v1` |
| `scene-object-added.json` | `eatme.alice-scene-object-added/v1` |
| `first-lesson-code-editor-action-proof.json` | `eatme.alice-first-lesson-code-editor-action-proof/v1` |
| `edited-project.a3p` | (binary .a3p project file) |
| `desktop-save-operation-result.json` | `eatme.alice-desktop-save-operation-result/v1` |
| `run-world-result.json` | `eatme.alice-run-world-result/v1` |

## Eatme Comparison Target

A `typescript` target entry has been added to
`eatme-test/assets/alice-comparison-targets.yaml`.

To use:
```bash
export LOOKINGGLASS_TYPESCRIPT_HOME=/path/to/lookingglass
export LOOKINGGLASS_TYPESCRIPT_API_URL=http://localhost:3000
```

Compatibility aliases stay supported for existing harnesses:

```bash
export ALICE_TYPESCRIPT_HOME=/path/to/lookingglass
export ALICE_TYPESCRIPT_API_URL=http://localhost:3000
export ALICE_WEB_URL=http://localhost:3000
```

If both canonical `LOOKINGGLASS_*` variables and aliases are set, the
`LOOKINGGLASS_*` value wins.

## Gadugi Integration Test Scenarios

Five gadugi-compatible YAML scenarios in `gadugi/` provide outside-in
integration tests covering the full API surface:

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

See [docs/gadugi-test-scenarios.md](docs/gadugi-test-scenarios.md) for full
scenario documentation, schema reference, and writing guide.

## Architecture

```
src/
  evidence-writer.ts    — Writes JSON proof artifacts matching Java schemas
  server.ts             — Express HTTP API server
  cli.ts                — CLI entry point (npm run serve -- ..., lookingglass serve ...)
  a3p-parser.ts         — .a3p ZIP/XML parser + joint/bbox/texture extraction
  animation.ts          — Pure-functional tween engine (4 easings, Vec3/Quat/scalar)
  project-io.ts         — Full .a3p archive read/write (manifest, resources, thumbnail)
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
