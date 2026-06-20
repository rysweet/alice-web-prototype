# Server API

The server API is the Express layer that lets `eatme`, outside-in tests, and local scripts drive LookingGlass workflows over HTTP.

Contract source: server API tests, `EATME.md`, and observed HTTP behavior.

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Using the server from Node.js](#using-the-server-from-nodejs)
- [API contract](#api-contract)
- [Evidence artifacts](#evidence-artifacts)
- [Project path validation](#project-path-validation)
- [Screenshot behavior](#screenshot-behavior)
- [Server state model](#server-state-model)
- [Route responsibility map](#route-responsibility-map)
- [Tutorial: create and run a project](#tutorial-create-and-run-a-project)

## Quick start

Build the server and start it on localhost:

```bash
npm install
npm run build:server
node dist-server/cli.js serve --port 3000 --evidence-dir ./evidence
```

Check that the process is accepting API requests:

```bash
curl http://127.0.0.1:3000/api/health
```

Response:

```json
{
  "status": "running",
  "launched": false,
  "pid": 12345,
  "uptime": 1.25,
  "runtime": "lookingglass"
}
```

`pid` and `uptime` are dynamic. Tests and clients should assert their types, not fixed values.

## Configuration

The CLI accepts these options:

```bash
node dist-server/cli.js serve \
  --port 3000 \
  --evidence-dir ./evidence \
  --project ./fixtures/starter.a3p
```

When the package is installed as a tool, use the `lookingglass` binary:

```bash
lookingglass serve --port 3000 --evidence-dir ./evidence
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--port <1-65535>` | no | `3000` | TCP port bound on `127.0.0.1` |
| `--evidence-dir <dir>` | no | `./evidence` | Directory for JSON proof artifacts, generated `.a3p` files, and screenshots |
| `--project <file.a3p>` | no | none | Starter project used by `POST /api/launch` when the request body does not provide `project` |

Print the resolved configuration without starting a server:

```bash
node dist-server/cli.js print-config --port 3100 --evidence-dir ./tmp/evidence
```

Example output:

```json
{
  "command": "print-config",
  "port": 3100,
  "evidenceDir": "/home/alice/alice-web-prototype/tmp/evidence",
  "project": null,
  "runtime": "lookingglass"
}
```

For large local builds, set Node's heap limit before running build or test commands:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm run build:server
```

## Using the server from Node.js

`src/server.ts` exports `createServer` for tests and embedded tooling. After `npm run build:server`, import the built ESM module:

```js
import { createServer, validateProjectPath } from "./dist-server/server.js";

const app = createServer({
  port: 0,
  evidenceDir: "./evidence",
  allowedProjectDirs: [process.cwd()]
});

const validation = validateProjectPath("./fixtures/starter.a3p", [process.cwd()]);
if (!validation.valid) {
  throw new Error(validation.error);
}

await new Promise((resolve, reject) => {
  const server = app.listen(0, "127.0.0.1", () => {
    console.log(server.address());
    server.close((error) => (error ? reject(error) : resolve()));
  });
  server.on("error", reject);
});
```

This example closes the server immediately after proving it can bind. Longer-running tests and tools should keep the returned `server` open for their requests and close it in teardown or `finally`.

Each call to `createServer()` creates a separate server context. Mutable project state, event registrations, templates, and scene objects are scoped to that server instance.

## API contract

The public API contract is defined by the existing tests, `EATME.md`, and observed server behavior. Response field names, status codes, schema versions, and artifact names are stable.

See [API reference](./api-reference.md) for endpoint-by-endpoint request and response details. The server exposes these routes:

| Method | Route | Success response | Main side effect |
| --- | --- | --- | --- |
| `GET` | `/api/health` | process status | none |
| `POST` | `/api/launch` | project launch summary | initializes per-server project state |
| `GET` | `/api/project/templates` | template list | none |
| `POST` | `/api/project/new` | `eatme.alice-project-new-result/v1` | writes `project-new/<ProjectName>.a3p` |
| `POST` | `/api/scene/add-object` | object add summary | writes `scene-object-added.json` |
| `POST` | `/api/code/create-procedure` | procedure creation summary | adds a procedure to current state |
| `POST` | `/api/code/create-function` | function creation summary | adds a function to current state |
| `POST` | `/api/code/edit-procedure` | `eatme.alice-first-lesson-code-editor-action-proof-result/v1` | writes edit proof and `edited-project.a3p` |
| `POST` | `/api/project/save` | `eatme.alice-project-save-result/v1` | writes save proof and `project-save/saved-project.a3p` |
| `POST` | `/api/world/run` | `eatme.alice-run-world-result/v1` | writes `run-world-result.json` |
| `GET` | `/api/screenshot` | screenshot capture summary | writes `screenshot.png` |
| `POST` | `/api/events/register` | event registration summary | writes `event-register.json` |
| `POST` | `/api/events/fire` | triggered handler summary | writes `event-fire.json` |

Bad request responses use HTTP `400` with an `error` field. Unhandled server errors use HTTP `500` with:

```json
{ "error": "Internal server error" }
```

## Evidence artifacts

Evidence output is rooted at `--evidence-dir`. The server writes these stable artifact names:

| Workflow | Artifact |
| --- | --- |
| Add scene object | `scene-object-added.json` |
| Edit procedure | `first-lesson-code-editor-action-proof.json` |
| Edited project copy | `edited-project.a3p` |
| Save project | `project-save/desktop-save-operation-result.json` |
| Saved project archive | `project-save/saved-project.a3p` |
| Run world | `run-world-result.json` |
| Capture screenshot | `screenshot.png` |
| Register event | `event-register.json` |
| Fire event | `event-fire.json` |
| Create project from template | `project-new/<SanitizedProjectName>.a3p` |

JSON artifacts are written with stable schema versions consumed by `eatme`. Dynamic values such as timestamps, file sizes, paths, run durations, process IDs, and uptime should be treated as runtime values.

Evidence writes are safe for concurrent requests. Atomic JSON writes use unique temporary files and replace the final artifact path only after serialization succeeds.

## Project path validation

`validateProjectPath(projectPath, allowedProjectDirs)` is available from `src/server.ts` and the built server module for compatibility.

It returns either:

```ts
{ valid: true; resolvedPath: string }
```

or:

```ts
{ valid: false; error: string }
```

Validation rejects:

- null bytes
- percent-encoded dot, slash, or backslash traversal characters
- paths that do not end in `.a3p`
- paths that resolve outside `allowedProjectDirs`

`POST /api/launch` applies the same validation to `body.project` and to the configured `projectPath` fallback. A rejected launch does not mark the server as launched.

A successful launch stores the resolved absolute project path in server state and returns that path in the `project` response field. The path must be a safe `.a3p` path inside an allowed directory, but the file does not have to exist at launch time. If the file exists, the server parses it and uses its project name when available; if it is absent, launch still succeeds with the default in-memory scene state.

## Screenshot behavior

`GET /api/screenshot` always returns a successful JSON response when the route handler completes.

When rendering succeeds:

```json
{
  "status": "captured",
  "path": "evidence/screenshot.png",
  "objectCount": 3,
  "sceneDescription": "Program",
  "rendered": true
}
```

When rendering fails, the server writes a placeholder PNG and returns:

```json
{
  "status": "captured",
  "path": "evidence/screenshot.png",
  "placeholder": true,
  "error": "Screenshot rendering failed"
}
```

This fallback keeps headless and CI environments usable while preserving the evidence artifact contract.

## Server state model

Server state is per `createServer()` call. There is no singleton mutable project state shared across server instances.

The active state tracks:

- whether the server has launched a project
- the active project path and project name
- scene objects and positions
- procedure/function names and statements
- the parsed `.a3p` project, when available
- event registrations
- the template library used by project creation

Launching a project seeds default `ground` and `camera` scene objects when the project has no loaded scene objects. Creating a project from a template replaces the active project state and marks the server launched.

## Route responsibility map

`src/server.ts` is the composition entry point. It creates the Express app, creates one server context, registers focused route modules, and installs the global error handler.

| Area | Module | Responsibility |
| --- | --- | --- |
| Server composition | `src/server.ts` | Export `createServer`, re-export `validateProjectPath`, register routes |
| Context | `src/server/context.ts` | Build per-server context from `ServerOptions` |
| State | `src/server/state.ts` | Create and mutate per-server project state |
| Validation | `src/server/validation.ts` | Validate project paths and sanitize generated filenames |
| Project orchestration | `src/server/project-service.ts` | Launch, edit, save, and run projects |
| Evidence orchestration | `src/server/evidence-service.ts` | Coordinate proof artifact and project artifact writing |
| Screenshot orchestration | `src/server/screenshot-service.ts` | Render screenshots and provide placeholder fallback |
| Templates | `src/server/template-service.ts` | List registered templates and create new `.a3p` projects |
| Routes | `src/server/routes/*.ts` | Translate HTTP requests and responses to service calls |

Route handlers stay thin: they read request data, call the relevant state or service helper, choose the HTTP status code, and return JSON.

The underlying `TemplateLibrary` supports code-level custom template registration. The Server API only lists and instantiates templates already registered in the current server state; it does not expose an HTTP endpoint for registering custom templates.

## Tutorial: create and run a project

Start the API server:

```bash
npm run build:server
node dist-server/cli.js serve --port 3000 --evidence-dir ./evidence
```

Create a project from the Snow template:

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H 'Content-Type: application/json' \
  -d '{"templateId":"snow","projectName":"WinterStory"}'
```

Add a biped object:

```bash
curl -X POST http://127.0.0.1:3000/api/scene/add-object \
  -H 'Content-Type: application/json' \
  -d '{"className":"org.lgna.story.SBiped","name":"bunny"}'
```

Append an edit proof to `scene.myFirstMethod`:

```bash
curl -X POST http://127.0.0.1:3000/api/code/edit-procedure \
  -H 'Content-Type: application/json' \
  -d '{"procedureSelector":"scene.myFirstMethod","editSpec":"append-comment:move bunny forward"}'
```

Run the world:

```bash
curl -X POST http://127.0.0.1:3000/api/world/run \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Save the project:

```bash
curl -X POST http://127.0.0.1:3000/api/project/save \
  -H 'Content-Type: application/json' \
  -d '{"saveSelector":"scene.myFirstMethod"}'
```

Capture a screenshot:

```bash
curl http://127.0.0.1:3000/api/screenshot
```

After the workflow, `./evidence` contains the proof JSON, project archives, and screenshot files used by `eatme` and outside-in tests.
