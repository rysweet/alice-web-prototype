# Eatme Integration — TypeScript Web Prototype

The alice-web-prototype can produce the same proof artifact JSON files that
Java Alice produces, allowing the eatme harness to validate it as a comparison
target alongside the original Java Alice.

## Quick Start

```bash
cd alice-web-prototype
npm install
npm run build:server

# Start the eatme-compatible API server
node dist-server/cli.js serve \
  --port 3000 \
  --evidence-dir ./evidence \
  --project /path/to/starter.a3p
```

## CLI Usage

```
alice-web serve [options]

Options:
  --port <number>           Port to listen on (default: 3000)
  --evidence-dir <path>     Directory for proof artifact JSON files
  --project <path>          Path to a starter .a3p project file
```

## API Endpoints

### `GET /api/health`
Returns process status. Used by eatme for `process_started` assertion.

### `POST /api/launch`
Start/initialize the prototype with a project.
```json
{ "project": "/path/to/starter.a3p" }
```

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
export ALICE_TYPESCRIPT_HOME=/path/to/alice-web-prototype
export ALICE_TYPESCRIPT_API_URL=http://localhost:3000
```

## Architecture

```
src/
  evidence-writer.ts    — Writes JSON proof artifacts matching Java schemas
  server.ts             — Express HTTP API server
  cli.ts                — CLI entry point (alice-web serve ...)
  a3p-parser.ts         — .a3p ZIP/XML parser (existing)
  tweedle-vm.ts         — Tweedle VM: executeProject(), VMScope, 7 handlers
  scene-builder.ts      — Three.js scene builder (existing)
  scene-renderer.ts     — PNG scene renderer (existing)
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
  statement-execution.md — Full statement execution documentation
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
