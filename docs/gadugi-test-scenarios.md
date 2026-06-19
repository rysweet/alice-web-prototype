# Gadugi Test Scenarios — Alice TypeScript Web Prototype

End-to-end integration tests for the Alice TypeScript port, written as
gadugi-compatible YAML scenarios. Each scenario launches the `alice-web serve`
process, exercises the HTTP API, and verifies the full request-response cycle
including evidence artifact generation.

These scenarios verify **Java feature parity** — the same capabilities that
Java Alice exposes through its desktop UI, tested here through the web
prototype's REST API.

## Quick Start

```bash
# Build the server first
npm run build:server

# Run all gadugi scenarios
gadugi-test run -d gadugi --verbose

# Run a single scenario
gadugi-test run -d gadugi --scenario "A3P Open"

# Run with a custom port (avoids conflicts)
PORT=13579 gadugi-test run -d gadugi --verbose
```

## Scenario Overview

| File | Name | Tests | Java Parity Feature |
|---|---|---|---|
| `01-a3p-open-parse-render.yaml` | A3P Open / Parse / Render | Project load → scene query → screenshot | `ProjectImp.open()` → `SceneImp.render()` |
| `02-tweedle-ast-vm-execution.yaml` | Tweedle AST & VM Execution | Launch → run world → verify execution log | `VirtualMachine.execute()` |
| `03-scene-entity-manipulation.yaml` | Scene Entity Manipulation | Add object → verify count → screenshot | `SceneEditor.addModel()` |
| `04-event-system.yaml` | Event System | Register → fire → verify triggers | `EventManager` listeners |
| `05-save-export-roundtrip.yaml` | Save / Export Round-Trip | Edit → save → re-launch → verify | `ProjectImp.save()` |

All scenarios use **level 3** (integration) — they exercise the full server
lifecycle from process launch through HTTP API interaction to evidence
artifact verification.

## Prerequisites

| Requirement | How to Satisfy |
|---|---|
| Server built | `npm run build:server` |
| Node.js ≥ 18 | `node --version` |
| Port available | Default `3000`; override with `PORT` env var or `--port` CLI flag |
| `.a3p` fixture (scenarios 1, 2) | Set `A3P_FILE` or use the tracked `.test-roundtrip/modified.a3p` default |

Scenarios 3 and 4 do **not** require a `.a3p` file — they use `POST /api/launch`
without a project, which seeds the scene with default `ground` + `camera`
objects.

## Scenario Schema

Every scenario follows the gadugi outside-in-testing YAML convention:

```yaml
scenario:
  name: "Human-readable scenario name"
  description: |
    Multi-line description of what the scenario tests
    and which Java Alice feature it maps to.
  type: cli
  level: 3
  tags: [alice, integration, ...]

  agents:
    - name: cli
      type: cli

  prerequisites:
    - "Condition that must be true before running"

  environment:
    variables:
      PORT: "${PORT:-3000}"
      EVIDENCE_DIR: "./evidence/scenario-name"

  steps:
    - name: "Run the scenario flow"
      agent: cli
      action: execute
      target: >-
        bash -lc 'set -euo pipefail; npm run build:server; # scenario commands'
      timeout: 30000

```

`scenario.agents` is required by the installed `gadugi-test` loader. These
scenarios use one CLI agent:

```yaml
agents:
  - name: cli
    type: cli
```

### Action Types

The installed runner's CLI agent accepts command-oriented actions. HTTP calls
and response assertions should be expressed inside `execute` commands, usually
with `curl` plus `node -e` JSON assertions, unless a future runner release adds
native HTTP actions.

| Action | Purpose | Key Fields |
|---|---|---|
| `execute` | Run a shell command and fail the step on non-zero exit | `target`, `timeout` |
| `run` / `command` / `execute_command` | Aliases for command execution | `target`, `timeout` |
| `validate_output` | Validate latest command output | `expected` |
| `validate_exit_code` | Validate latest command exit code | `expected` |
| `wait_for_output` | Poll captured command output for a regex | `target`, `timeout` |

### Health Check Gate

Runner-compatible scenarios should gate on `/api/health` inside the command
step after launching the server. This prevents race conditions between server
startup and the first API request:

```yaml
- name: "Run API flow"
  agent: cli
  action: execute
  target: >-
    bash -lc 'set -euo pipefail;
    PORT="${PORT:-3000}";
    for attempt in $(seq 1 50); do
      if curl -fsS "http://127.0.0.1:$PORT/api/health" > health.json;
      then break; fi;
      sleep 0.2;
    done;
    node -e "const fs=require(\"fs\"); const d=JSON.parse(fs.readFileSync(\"health.json\", \"utf8\")); if (d.status !== \"running\") throw new Error(\"not ready\");"'
```

## Scenario Details

### 01 — A3P Open / Parse / Render

**File:** `gadugi/01-a3p-open-parse-render.yaml`

Tests the complete lifecycle of opening an Alice project file: launch the
server with a `.a3p` project path, verify the parser extracts scene objects,
and capture a screenshot.

**Steps:**

1. Launch `alice-web serve --port $PORT --evidence-dir $EVIDENCE_DIR --project $A3P_FILE`
2. Health check gate
3. `POST /api/launch` with project path → verify `status: "launched"`, `projectName` present
4. `GET /api/screenshot` → verify `status: "captured"`, `objectCount >= 2`
5. Send SIGTERM, verify exit code 0

**Validates:**
- `.a3p` ZIP/XML parsing succeeds
- Scene objects are extracted from the project
- Scene renderer produces a screenshot (PNG artifact)
- Server shuts down cleanly after project load

**Prerequisites:**
- Valid `.a3p` file at the configured path

**Evidence artifacts produced:**
- `screenshot.png` — rendered scene image

---

### 02 — Tweedle AST & VM Execution

**File:** `gadugi/02-tweedle-ast-vm-execution.yaml`

Tests the Tweedle virtual machine by launching a project and executing its
methods via `POST /api/world/run`. Verifies that the execution log contains
the expected statement types.

**Steps:**

1. Launch `alice-web serve --port $PORT --evidence-dir $EVIDENCE_DIR --project $A3P_FILE`
2. Health check gate
3. `POST /api/launch` with project → verify launched
4. `POST /api/world/run` → verify `status: "completed"`, `statements_executed >= 1`, `execution_log` is array
5. Send SIGTERM, verify exit code 0

**Validates:**
- Tweedle parser extracts AST from `.a3p` project
- VM executes all methods without errors
- Execution log contains structured `{step, kind, detail}` entries
- `schema_version` matches `eatme.alice-run-world-result/v1`

**Prerequisites:**
- Valid `.a3p` file with at least one Tweedle method

**Evidence artifacts produced:**
- `run-world-result.json` — full execution log with schema version

---

### 03 — Scene Entity Manipulation

**File:** `gadugi/03-scene-entity-manipulation.yaml`

Tests adding objects to the scene and capturing a screenshot. Does not
require a `.a3p` file — the server seeds default `ground` + `camera` on
launch.

**Steps:**

1. Launch `alice-web serve --port $PORT --evidence-dir $EVIDENCE_DIR`
2. Health check gate
3. `POST /api/launch` (no project) → verify `sceneObjectCount: 2` (ground + camera)
4. `POST /api/scene/add-object` with `className: "org.lgna.story.SBiped"`, `name: "bunny"` → verify `status: "added"`, `sceneFieldCountAfter: 3`
5. `POST /api/scene/add-object` with `className: "org.lgna.story.SProp"`, `name: "tree"` → verify `sceneFieldCountAfter: 4`
6. `GET /api/screenshot` → verify `objectCount >= 4`
7. Send SIGTERM, verify exit code 0

**Validates:**
- Default scene seeds ground + camera
- `add-object` increments scene field count
- Object names are assigned correctly (explicit or derived from className)
- Evidence artifact `scene-object-added.json` is written per addition
- Screenshot reflects the updated scene

**Prerequisites:**
- None (no `.a3p` file needed)

**Evidence artifacts produced:**
- `scene-object-added.json` — one per add-object call
- `screenshot.png` — scene with all 4 objects

---

### 04 — Event System

**File:** `gadugi/04-event-system.yaml`

Tests all three event types: `sceneActivated`, `keyPress`, and `proximity`.
Registers handlers, fires events, and verifies the correct handlers trigger.

**Steps:**

1. Launch `alice-web serve --port $PORT --evidence-dir $EVIDENCE_DIR`
2. Health check gate
3. `POST /api/launch` → verify launched
4. Register `sceneActivated` handler → verify `registrationId: "evt-1"`
5. Register `keyPress` handler for `"Space"` → verify `registrationId: "evt-2"`
6. Add two objects (`bunny`, `cat`) for proximity test
7. Register `proximity` handler for `["bunny", "cat"]` with threshold 3.0 → verify `registrationId: "evt-3"`
8. Fire `sceneActivated` → verify `triggered` contains `evt-1`, length 1
9. Fire `keyPress` with `payload.key: "Space"` → verify `triggered` contains `evt-2`
10. Fire `keyPress` with `payload.key: "ArrowUp"` → verify `triggered` is empty
11. Fire `proximity` with `sourceObject: "bunny"` → verify `triggered` contains `evt-3` (both at origin, distance = 0)
12. Send SIGTERM, verify exit code 0

**Validates:**
- Registration assigns sequential IDs (`evt-1`, `evt-2`, …)
- `sceneActivated` triggers unconditionally
- `keyPress` filters by key match
- Non-matching key fires produce empty triggered array
- `proximity` triggers when distance ≤ threshold (0 ≤ 3.0)
- Evidence artifacts written for both register and fire

**Prerequisites:**
- None (no `.a3p` file needed)

**Evidence artifacts produced:**
- `event-register.json` — one per registration (overwritten)
- `event-fire.json` — one per fire (overwritten)

---

### 05 — Save / Export Round-Trip

**File:** `gadugi/05-save-export-roundtrip.yaml`

Tests the full edit-and-save cycle: launch, edit a procedure, save the
project, then re-launch with the saved file and verify edits survived.
Maps Java Alice's `modifyAndWriteA3P` through the server API.

**Steps:**

1. Launch `alice-web serve --port $PORT --evidence-dir $EVIDENCE_DIR`
2. Health check gate
3. `POST /api/launch` → verify launched
4. `POST /api/code/edit-procedure` with `editSpec: "append-comment:gadugi-round-trip-proof"` → verify `status: "proved"`, `edited_project_artifact: "edited-project.a3p"`
5. `POST /api/project/save` → verify `status: "saved"`, `saved_project_artifact` present
6. Send SIGTERM, verify clean exit
7. Re-launch server (no `--project` flag — project path passed via API body)
8. Health check gate
9. `POST /api/launch` with saved project → verify `status: "launched"`
10. Send SIGTERM, verify exit code 0

**Validates:**
- Procedure edit produces proof artifacts
- Project save writes `.a3p` file to evidence directory
- Saved project can be re-opened by a fresh server instance
- Edit → save → re-open round-trip completes without errors

**Prerequisites:**
- None (uses in-memory defaults, no external `.a3p` needed)

**Evidence artifacts produced:**
- `edited-project.a3p` — modified project binary
- `first-lesson-code-editor-action-proof.json` — edit proof
- `project-save/saved-project.a3p` — saved project file
- `project-save/desktop-save-operation-result.json` — save proof

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server listen port |
| `EVIDENCE_DIR` | `./evidence/<scenario-name>` | Evidence artifact output directory |
| `A3P_FILE` | _(none)_ | Path to `.a3p` project file (scenarios 1, 2) |
| `NODE_OPTIONS` | _(none)_ | Node.js options (e.g., `--max-old-space-size=32768`) |

### Port Conflicts

Each scenario uses a single port. To run scenarios in parallel, assign
different ports:

```bash
PORT=13579 gadugi-test run -d gadugi --scenario "A3P Open" &
PORT=13580 gadugi-test run -d gadugi --scenario "Scene Entity" &
wait
```

### Evidence Directory

Each scenario writes artifacts to its own subdirectory under `EVIDENCE_DIR`.
Runner-compatible command steps should clean these artifacts with a shell trap:

```bash
trap 'kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; rm -rf "$EVIDENCE_DIR"' EXIT
```

To preserve artifacts for debugging, temporarily remove the `rm -rf "$EVIDENCE_DIR"`
part of the scenario command trap while investigating.

```bash
gadugi-test run -d gadugi --scenario "Scene Entity"
```

## API Surface Covered

The five scenarios collectively cover every endpoint in `src/server.ts`:

| Endpoint | Method | Scenario(s) |
|---|---|---|
| `/api/health` | GET | 01, 02, 03, 04, 05 (health gate) |
| `/api/launch` | POST | 01, 02, 03, 04, 05 |
| `/api/scene/add-object` | POST | 03, 04 |
| `/api/code/edit-procedure` | POST | 05 |
| `/api/project/save` | POST | 05 |
| `/api/world/run` | POST | 02 |
| `/api/screenshot` | GET | 01, 03 |
| `/api/events/register` | POST | 04 |
| `/api/events/fire` | POST | 04 |

## Writing New Scenarios

### Template

```yaml
scenario:
  name: "Your Scenario Name"
  description: |
    What this scenario tests and which Java Alice
    feature it maps to.
  type: cli
  level: 3
  tags: [alice, integration, your-feature]

  agents:
    - name: cli
      type: cli

  prerequisites:
    - "npm run build:server has been run"

  environment:
    variables:
      PORT: "${PORT:-3000}"
      EVIDENCE_DIR: "./evidence/your-scenario"

  steps:
    - name: "Run your API flow"
      agent: cli
      action: execute
      target: >-
        bash -lc 'set -euo pipefail;
        PORT="${PORT:-3000}";
        EVIDENCE_DIR="./evidence/your-scenario";
        rm -rf "$EVIDENCE_DIR";
        mkdir -p "$EVIDENCE_DIR";
        node dist-server/cli.js serve --port "$PORT" --evidence-dir "$EVIDENCE_DIR" >"$EVIDENCE_DIR/server.log" 2>&1 &
        SERVER_PID=$!;
        trap "kill $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true; rm -rf $EVIDENCE_DIR" EXIT;
        for attempt in $(seq 1 50); do
          if curl -fsS "http://127.0.0.1:$PORT/api/health" >"$EVIDENCE_DIR/health.json";
          then break; fi;
          sleep 0.2;
        done;
        curl -fsS -X POST "http://127.0.0.1:$PORT/api/launch" -H "Content-Type: application/json" -d "{}" >"$EVIDENCE_DIR/launch.json";
        node -e "const fs=require(\"fs\"); const d=JSON.parse(fs.readFileSync(process.argv[1], \"utf8\")); if (d.status !== \"launched\") throw new Error(\"launch failed\");" "$EVIDENCE_DIR/launch.json";
        kill "$SERVER_PID";
        wait "$SERVER_PID" 2>/dev/null || true'
      timeout: 30000

```

### Conventions

1. **Health check first** — Always poll `/api/health` before the first API
   call. The server binds asynchronously; without a gate, early requests fail
   with `ECONNREFUSED`.

2. **Explicit verify after each request** — Every `curl` request should be
   followed by a JSON assertion in the same `execute` command. This makes
   failures fail the runner step with a non-zero exit code.

3. **Use structured JSON assertions** — Prefer `node -e` checks against parsed
   JSON over substring matching for API responses.

4. **Evidence cleanup** — Always include shell-trap cleanup in long-running
   `execute` commands. Accumulated artifacts consume disk and can cause flaky
   re-runs if stale files from a previous run match assertions.

5. **Localhost only** — All `url` fields use `127.0.0.1`, never `localhost`
   (avoids DNS resolution and IPv6 ambiguity). The server itself binds to
   `127.0.0.1` (see `cli.ts`).

6. **No secrets in YAML** — Scenarios contain only localhost URLs, port
   numbers, and static test data. No credentials, tokens, or external URLs.

## Relationship to Existing Tests

| Test Layer | Location | What It Tests |
|---|---|---|
| Unit tests | `test/*.test.ts` | Individual modules (parser, VM, renderer) |
| **Gadugi scenarios** | **`gadugi/*.yaml`** | **Full server lifecycle through HTTP API** |
| Eatme hooks | `tools/eatme-*` | CLI hook interface for Java harness comparison |

Gadugi scenarios sit between unit tests and the eatme harness. They test the
same HTTP API that eatme validates, but from the outside-in — no knowledge
of internal types, no imports, just HTTP requests and JSON assertions.

## Troubleshooting

### `ECONNREFUSED` on first request

The health check gate isn't waiting long enough. Increase `max_attempts` or
`interval`:

```yaml
retry:
  max_attempts: 20
  interval: 1000ms
```

### Port already in use

Another process (or a previous test run) is occupying the port:

```bash
# Find what's using the port
lsof -i :3000

# Use a different port
PORT=13579 gadugi-test run -d gadugi --scenario "A3P Open"
```

### Evidence directory not cleaned up

If a previous run crashed before cleanup, stale artifacts can cause false
passes. Remove manually:

```bash
rm -rf ./evidence/
```

### `.a3p` file not found

Scenarios 01 and 02 require a `.a3p` file. Either:
- Set the `A3P_FILE` environment variable to point to a valid file
- Place a `.a3p` file at the default path listed in the scenario prerequisites

### Screenshot returns `placeholder: true`

The `canvas` npm package requires native dependencies. If the rendering
pipeline fails, the server returns a 1×1 placeholder PNG. The scenario
still passes (it checks `status: "captured"`) but the screenshot won't be
meaningful. Install canvas dependencies:

```bash
# Ubuntu/Debian
sudo apt-get install -y libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++
npm rebuild canvas
```

## File Layout

```
gadugi/
  01-a3p-open-parse-render.yaml      # A3P project lifecycle
  02-tweedle-ast-vm-execution.yaml    # Tweedle VM execution
  03-scene-entity-manipulation.yaml   # Scene add-object + screenshot
  04-event-system.yaml                # Event register / fire / proximity
  05-save-export-roundtrip.yaml       # Edit → save → re-open cycle
docs/
  gadugi-test-scenarios.md            # This file
```
