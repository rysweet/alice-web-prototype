# Gadugi Test Scenarios

The `gadugi/*.yaml` files are executable end-to-end scenarios for the Alice web
prototype. They use the installed `gadugi-test` runner to start the local REST
API server, drive real HTTP user flows with `curl`, assert JSON responses, and
shut the server down cleanly.

The completed scenario set verifies Java Alice parity from the outside in:
project open and rendering, Tweedle world execution, scene entity manipulation,
event handling, and save/export round trips.

## Quick start

Build the server, then ask `gadugi-test` to discover and validate the
scenarios:

```bash
npm run build:server

NODE_OPTIONS=--max-old-space-size=32768 gadugi-test list -d gadugi
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test validate -d gadugi
```

Run the fixture-independent scenarios first:

```bash
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi -s "Scene Entity Manipulation"
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi -s "Event System"
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi -s "Save / Export Round-Trip"
```

Scenarios 01 and 02 need an Alice project file. Run them when
`.test-roundtrip/modified.a3p` exists or `A3P_FILE` points to another fixture:

```bash
A3P_FILE=.test-roundtrip/modified.a3p \
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "A3P Open / Parse / Render"

A3P_FILE=.test-roundtrip/modified.a3p \
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Tweedle AST & VM Execution"
```

Run the full suite after the fixture-independent scenarios pass and the required
`.a3p` fixture is available:

```bash
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi
```

## Scenario inventory

| File | Scenario | User flow |
| --- | --- | --- |
| `gadugi/01-a3p-open-parse-render.yaml` | `A3P Open / Parse / Render` | Open a `.a3p` project, parse scene objects, capture a render |
| `gadugi/02-tweedle-ast-vm-execution.yaml` | `Tweedle AST & VM Execution` | Open a `.a3p` project and run the world through the Tweedle VM |
| `gadugi/03-scene-entity-manipulation.yaml` | `Scene Entity Manipulation` | Launch a blank scene, add entities, reject invalid input, capture a render |
| `gadugi/04-event-system.yaml` | `Event System` | Register events, fire matching and non-matching events, reject invalid input |
| `gadugi/05-save-export-roundtrip.yaml` | `Save / Export Round-Trip` | Edit a project, save it, relaunch, and verify the saved project opens |

The files are level 3 integration tests. They exercise the built server process
and REST API rather than importing TypeScript modules directly.

## Compatibility gate

`gadugi-test validate` checks that scenario files load, but it does not reject
every stale native runner action. The scenarios must also pass this static gate
with no matches:

```bash
rg 'cleanup:|action:\s*(launch|http_request|verify_response|verify_output|send_input|verify_exit_code|stop_application|shell)|retry:' gadugi
```

Any match means the scenario still uses the old action schema and must be
rewritten to the execute-only pattern before it is considered runnable.

## Runner-compatible scenario format

The installed `gadugi-test` CLI is the source of truth for scenario execution.
The Alice scenarios use one supported action style:

```yaml
steps:
  - name: "Run the scenario flow"
    agent: cli
    action: execute
    target: >-
      bash -lc 'set -euo pipefail;
      # start server, poll health, curl APIs, assert JSON, cleanup'
    timeout: 30000
```

Do not use native runner actions for launch, HTTP calls, response checks,
stdin/signal handling, exit-code checks, or cleanup. Put those operations inside
the `action: execute` shell flow so local runs and CI use the same behavior.

Each scenario includes:

1. `set -euo pipefail`.
2. Quoted `PORT`, `EVIDENCE_DIR`, `A3P_FILE`, URL, and artifact paths.
3. Explicit server startup with `node dist-server/cli.js serve`.
4. Health polling against `http://127.0.0.1:$PORT/api/health`.
5. `curl` API calls that write response JSON into the evidence directory.
6. `node -e` assertions against parsed JSON responses.
7. A captured `SERVER_PID`.
8. A shell `trap` that kills only the captured server PID and safely removes
   the scenario evidence directory.

## Configuration

| Variable | Default | Used by | Description |
| --- | --- | --- | --- |
| `NODE_OPTIONS` | none | all scenarios | Use `--max-old-space-size=32768` for local and CI parity |
| `PORT` | scenario-specific `3101`-`3105` | all scenarios | Local REST API port; each scenario has a unique default so full-suite runs can execute in parallel |
| `EVIDENCE_DIR` | scenario-specific path under `./evidence/` with a shell PID suffix | all scenarios | Temporary response, log, and artifact directory |
| `A3P_FILE` | `.test-roundtrip/modified.a3p` where applicable | scenarios 01 and 02 | Alice project fixture to open and execute |

Use a different port if another local service is already bound to a scenario's
default port. Prefer overriding `PORT` only for single-scenario runs because the
full suite runs scenarios in parallel:

```bash
PORT=13579 NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Scene Entity Manipulation"
```

## Scenario shell lifecycle

A runner-compatible scenario starts the server in the background and owns its
full lifecycle inside the same `execute` step:

```yaml
steps:
  - name: "Run API flow"
    agent: cli
    action: execute
    target: >-
      bash -lc 'set -euo pipefail;
      PORT="${PORT:-3000}";
      case "$PORT" in (*[!0-9]*|"") echo "PORT must be numeric" >&2; exit 2;; esac;
      EVIDENCE_DIR="./evidence/example";
      case "$EVIDENCE_DIR" in (""|"/"|".") echo "unsafe EVIDENCE_DIR" >&2; exit 2;; esac;
      HEALTH_JSON="$EVIDENCE_DIR/health.json";
      LAUNCH_JSON="$EVIDENCE_DIR/launch.json";
      SERVER_LOG="$EVIDENCE_DIR/server.log";
      rm -rf "$EVIDENCE_DIR";
      mkdir -p "$EVIDENCE_DIR";
      SERVER_PID="";
      cleanup() {
        status=$?;
        if [ -n "${SERVER_PID:-}" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
          kill "$SERVER_PID" 2>/dev/null || true;
          wait "$SERVER_PID" 2>/dev/null || true;
        fi;
        rm -rf "$EVIDENCE_DIR";
        exit "$status";
      };
      trap cleanup EXIT;
      node dist-server/cli.js serve --port "$PORT" --evidence-dir "$EVIDENCE_DIR" >"$SERVER_LOG" 2>&1 &
      SERVER_PID=$!;
      READY=0;
      for attempt in $(seq 1 50); do
        if curl -fsS "http://127.0.0.1:$PORT/api/health" >"$HEALTH_JSON"; then
          READY=1;
          break;
        fi;
        sleep 0.2;
      done;
      test "$READY" = 1;
      node -e "const fs=require(\"fs\"); const d=JSON.parse(fs.readFileSync(process.argv[1], \"utf8\")); if (d.status !== \"running\") throw new Error(\"health failed\");" "$HEALTH_JSON";
      curl -fsS -X POST "http://127.0.0.1:$PORT/api/launch" -H "Content-Type: application/json" -d "{}" >"$LAUNCH_JSON";
      node -e "const fs=require(\"fs\"); const d=JSON.parse(fs.readFileSync(process.argv[1], \"utf8\")); if (d.status !== \"launched\") throw new Error(\"launch failed\");" "$LAUNCH_JSON";
      kill "$SERVER_PID";
      wait "$SERVER_PID" 2>/dev/null || true;
      SERVER_PID="";
      grep -q "shutting down" "$SERVER_LOG"'
    timeout: 30000
```

Keep cleanup inside the shell command. Top-level cleanup blocks are not used
because the installed runner does not execute the old cleanup action schema.

## API coverage

The scenarios cover the server endpoints that the eatme parity harness also
uses.

| Endpoint | Method | Covered by |
| --- | --- | --- |
| `/api/health` | `GET` | all scenarios |
| `/api/launch` | `POST` | all scenarios |
| `/api/screenshot` | `GET` | 01, 03 |
| `/api/world/run` | `POST` | 02 |
| `/api/scene/add-object` | `POST` | 03, 04 |
| `/api/events/register` | `POST` | 04 |
| `/api/events/fire` | `POST` | 04 |
| `/api/code/edit-procedure` | `POST` | 05 |
| `/api/project/save` | `POST` | 05 |

## Scenario details

### A3P Open / Parse / Render

`gadugi/01-a3p-open-parse-render.yaml` opens an Alice project file and verifies
that the server can parse and render it.

Flow:

1. Start `alice-web serve` with `--project "$A3P_FILE"`.
2. Poll `/api/health` until the server reports `status: "running"`.
3. `POST /api/launch` with the project path.
4. Assert `status: "launched"`, a non-empty `projectName`, and at least two
   scene objects.
5. `GET /api/screenshot`.
6. Assert `status: "captured"` and the screenshot artifact path; when the
   renderer returns `objectCount`, assert at least two objects.
7. Stop the captured server process and verify shutdown was logged.

### Tweedle AST & VM Execution

`gadugi/02-tweedle-ast-vm-execution.yaml` opens an Alice project and runs its
world through the Tweedle VM.

Flow:

1. Start `alice-web serve` with `--project "$A3P_FILE"`.
2. Launch the project through `/api/launch`.
3. `POST /api/world/run`.
4. Assert `status: "completed"`.
5. Assert `schema_version` is `eatme.alice-run-world-result/v1`.
6. Assert at least one statement and procedure executed, the execution log is
   an array, and no VM errors were returned.
7. Stop the captured server process.

### Scene Entity Manipulation

`gadugi/03-scene-entity-manipulation.yaml` launches the default scene, adds
entities, checks validation behavior, and captures a render.

Flow:

1. Start `alice-web serve` without a project.
2. `POST /api/launch` with `{}` and assert the default ground and camera exist.
3. Add a biped named `bunny`.
4. Add a prop named `tree`.
5. Add a flyer without an explicit name and assert the server derives the name
   from `className`.
6. Attempt to add an object without `className` and assert the API returns the
   expected `400` error JSON.
7. Capture a screenshot and assert the artifact path; when the renderer returns
   `objectCount`, assert the count includes the three added renderable objects.
8. Stop the captured server process.

### Event System

`gadugi/04-event-system.yaml` verifies event registration, event firing, and
negative validation cases.

Flow:

1. Start `alice-web serve` without a project.
2. Launch the default scene.
3. Register `sceneActivated`, `keyPress`, and `proximity` handlers.
4. Add `bunny` and `cat` before proximity registration.
5. Assert registrations receive sequential IDs such as `evt-1`, `evt-2`, and
   `evt-3`.
6. Assert invalid registrations return explicit `400` error JSON.
7. Fire `sceneActivated` and assert only the scene handler triggers.
8. Fire `keyPress` with `Space` and assert the key handler triggers.
9. Fire `keyPress` with `ArrowUp` and assert no handler triggers.
10. Fire `proximity` and assert the proximity handler triggers.
11. Assert invalid fire requests return explicit `400` error JSON.
12. Stop the captured server process.

### Save / Export Round-Trip

`gadugi/05-save-export-roundtrip.yaml` verifies edit, save, relaunch, and
round-trip behavior.

Flow:

1. Start `alice-web serve` without a project.
2. Launch the default project.
3. `POST /api/code/edit-procedure` with
   `append-comment:gadugi-round-trip-proof`.
4. Assert the edit proof schema and artifact names.
5. `POST /api/project/save`.
6. Assert the save schema and saved artifact names.
7. Assert `project-save/saved-project.a3p` exists.
8. Stop the first captured server process.
9. Start a fresh server on the same port.
10. Launch the saved `.a3p` file.
11. Assert the saved project launches and contains scene objects.
12. Stop the second captured server process.

## Writing new scenarios

Use a single `execute` step per end-to-end flow. Add helper shell functions
inside the command when the scenario needs to start, stop, or poll more than
once.

Recommended conventions:

1. Validate `PORT` before using it in URLs.
2. Reject unsafe `EVIDENCE_DIR` values before `rm -rf`.
3. Write every API response to a named JSON file.
4. Assert response shape with parsed JSON, not substring checks.
5. Use `curl -fsS` for successful requests.
6. For expected `400` responses, capture the status code and assert both the
   status and JSON error body.
7. Use only `127.0.0.1` URLs.
8. Kill only the captured `SERVER_PID`.
9. Keep all test data local and static; do not add external URLs or secrets.

## Troubleshooting

### `Unsupported CLI action`

The scenario still contains an action that the installed runner does not
execute. Replace the step with `action: execute` and move the operation into
the shell command.

### `ECONNREFUSED`

The server was not ready before the first API request. Keep the health polling
loop before every API call sequence that follows a server start.

### Port already in use

Run the scenario on another port:

```bash
PORT=13579 NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Scene Entity Manipulation"
```

### A3P fixture missing

Set `A3P_FILE` for scenarios 01 and 02:

```bash
A3P_FILE=/path/to/project.a3p \
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Tweedle AST & VM Execution"
```

### Evidence directory remains after failure

The scenario trap removes evidence on normal failures. If a process is killed
outside the trap, remove the directory manually:

```bash
rm -rf ./evidence/
```

## Related documentation

- [Testing](./testing.md)
- [Server API](./server-api.md)
- [API reference](./api-reference.md)
