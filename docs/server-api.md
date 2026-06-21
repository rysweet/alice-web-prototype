# Server API

The server API is the Express layer that lets `eatme`, outside-in tests, and local scripts drive Alice workflows over HTTP.

Contract source: server API tests, `EATME.md`, and observed HTTP behavior.

## Contents

- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Using the server from Node.js](#using-the-server-from-nodejs)
- [API contract](#api-contract)
- [Evidence artifacts](#evidence-artifacts)
- [Project path validation](#project-path-validation)
- [Screenshot behavior](#screenshot-behavior)
- [Camera workflow behavior](#camera-workflow-behavior)
- [Server state model](#server-state-model)
- [Route responsibility map](#route-responsibility-map)
- [Tutorial: create and run a project](#tutorial-create-and-run-a-project)
- [Tutorial: export, play, share, and validate a web package](#tutorial-export-play-share-and-validate-a-web-package)

## Quick start

Build the server and start it on localhost:

```bash
npm install
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
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
  "runtime": "alice-web"
}
```

The `runtime` value is the Alice web runtime identity.

`pid` and `uptime` are dynamic. Tests and clients should assert their types, not fixed values.

## Configuration

The local checkout CLI accepts these options through the npm script:

```bash
npm run serve -- \
  --port 3000 \
  --evidence-dir ./evidence \
  --api-token "$ALICE_LOCAL_API_TOKEN" \
  --project ./fixtures/starter.a3p
```

The installed or linked package exposes the same options through `alice-web`:

```bash
alice-web serve \
  --port 3000 \
  --evidence-dir ./evidence \
  --api-token "$ALICE_LOCAL_API_TOKEN" \
  --project ./fixtures/starter.a3p
```

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--port <1-65535>` | no | `3000` | TCP port bound on `127.0.0.1` |
| `--evidence-dir <dir>` | no | `./evidence` | Directory for JSON proof artifacts, generated `.a3p` files, and screenshots |
| `--project <file.a3p>` | no | none | Starter project used by `POST /api/launch` when the request body does not provide `project` |
| `--api-token <token>` | yes for CLI-served mutating requests | none | Local-only secret sent in `X-Alice-Local-Api-Token`; provide it from `ALICE_LOCAL_API_TOKEN` |

Print the resolved configuration without starting a server:

```bash
node dist-server/cli.js print-config --port 3100 --evidence-dir ./tmp/evidence
```

Example output:

```json
{
  "command": "print-config",
  "port": 3100,
  "evidenceDir": "/workspace/alice-web/tmp/evidence",
  "project": null,
  "runtime": "alice-web"
}
```

The `runtime` value is part of the Alice identity boundary.

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

See [API reference](./api-reference.md) and
[Alice identity boundary](./alice-identity-boundary.md) for endpoint-by-endpoint
request, response, API header, and runtime identity details. The table includes
implemented routes, including `/api/camera/*` and the web-package
export/share/validation routes:

| Method | Route | Success response | Main side effect |
| --- | --- | --- | --- |
| `GET` | `/api/health` | process status | none |
| `POST` | `/api/launch` | project launch summary | initializes per-server project state |
| `GET` | `/api/project/templates` | template list | none |
| `POST` | `/api/project/new` | `eatme.alice-project-new-result/v1` | writes `project-new/<ProjectName>.a3p` |
| `POST` | `/api/assets/import-model` | imported model asset descriptor | adds model bytes and `project/models/<assetId>` metadata to current state |
| `POST` | `/api/assets/import-texture` | imported texture asset descriptor | adds texture bytes and `project/textures/<assetId>` metadata to current state |
| `POST` | `/api/scene/add-object` | object add summary | writes `scene-object-added.json` |
| `POST` | `/api/scene/apply-texture` | texture binding summary | updates the selected scene object's surface material binding |
| `POST` | `/api/code/create-procedure` | procedure creation summary | adds a procedure to current state |
| `POST` | `/api/code/create-function` | function creation summary | adds a function to current state |
| `POST` | `/api/code/edit-procedure` | `eatme.alice-first-lesson-code-editor-action-proof-result/v1` | writes edit proof and `edited-project.a3p` |
| `POST` | `/api/project/save` | `eatme.alice-project-save-result/v1` | writes save proof and `project-save/saved-project.a3p` |
| `POST` | `/api/project/export/web-package` | `alice-web.export-web-package-result/v1` | web-package feature contract: returns a runnable `alice-web` ZIP package |
| `POST` | `/api/project/share` | `alice-web.share-artifacts-result/v1` | web-package feature contract: returns share metadata linked to a validated package |
| `POST` | `/api/project/validate-web-package` | `alice-web.validate-web-package-result/v1` | web-package feature contract: validates package safety, playability, and identity |
| `POST` | `/api/world/run` | `eatme.alice-run-world-result/v1` | writes `run-world-result.json` |
| `POST` | `/api/screenshot` | screenshot capture summary | writes `screenshot.png` |
| `GET` | `/api/camera/state` | `eatme.alice-camera-workflow-state/v1` | reads camera workflow state |
| `POST` | `/api/camera/move` | `eatme.alice-camera-workflow-state/v1` | moves the active camera |
| `POST` | `/api/camera/pan` | `eatme.alice-camera-workflow-state/v1` | pans the active camera |
| `POST` | `/api/camera/zoom` | `eatme.alice-camera-workflow-state/v1` | zooms the active camera |
| `POST` | `/api/camera/focus` | `eatme.alice-camera-workflow-state/v1` | focuses the active camera on a target |
| `POST` | `/api/camera/orbit` | `eatme.alice-camera-workflow-state/v1` | orbits around the camera target |
| `POST` | `/api/camera/preset` | `eatme.alice-camera-workflow-state/v1` | applies a named view preset |
| `POST` | `/api/camera/mode` | `eatme.alice-camera-workflow-state/v1` | switches orbit or first-person mode |
| `GET` | `/api/camera/markers` | `eatme.alice-camera-workflow-state/v1` | lists camera markers |
| `POST` | `/api/camera/markers` | `eatme.alice-camera-workflow-state/v1` | saves a camera marker |
| `POST` | `/api/camera/markers/:id/restore` | `eatme.alice-camera-workflow-state/v1` | restores a camera marker |
| `DELETE` | `/api/camera/markers/:id` | `eatme.alice-camera-workflow-state/v1` | deletes a camera marker |
| `POST` | `/api/events/register` | event registration summary | writes `event-register.json` |
| `POST` | `/api/events/fire` | triggered handler summary | writes `event-fire.json` |

Bad request responses use HTTP `400` with an `error` field. Unhandled server errors use HTTP `500` with:

```json
{ "error": "Internal server error" }
```

Mutating local API routes require `Content-Type: application/json`. CLI-served
instances also require the token passed at startup with `--api-token` in the
`X-Alice-Local-Api-Token` header and reject non-local `Host` or browser
`Origin` headers.

### TypeScript source export route

`GET /api/projects/current/export/typescript` downloads the current Alice
project as an Alice-branded ZIP rooted at `alice-web-typescript-source/`. It is
read-only, but it can expose project source, so keep serving it through the same
local API surface as current-project operations.

The response sets `Content-Type: application/zip`,
`Content-Disposition: attachment; filename="alice-web-typescript-source.zip"`,
and `Cache-Control: no-store`. See
[TypeScript source export](./typescript-source-export.md) for archive
contents and generated-source conventions.

Camera routes require `X-Alice-Local-Api-Token` on both read and mutation
requests when the CLI server is started with `--api-token`.

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
| Export web package feature contract | `<ProjectName>.alice-web.zip` with `index.html`, `manifest.json`, `share.json`, `preview.png`, `project/project.json`, and `validation.json` |
| Share package feature contract | `share.json`, preview reference, playable HTML reference, package filename, package byte size, and package SHA-256 digest |

JSON artifacts are written with stable schema versions consumed by `eatme`. Dynamic values such as timestamps, file sizes, paths, run durations, process IDs, and uptime should be treated as runtime values.

Joint manipulation routes write `alice-web/joint-state.json` and
`project-save/alice-web/joint-state.json` sidecars outside `.a3p` archives. See
[Joint manipulation](./joint-manipulation.md) for the sidecar schema and
`POST /api/world/run` joint verification fields.

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

A successful launch stores the resolved absolute project path in server state and returns that path in the `project` response field. The path must be a safe, readable `.a3p` file inside an allowed directory. Missing, unreadable, corrupt, or symlink-escaped requested project files return `400 { error }` and do not mark the server as launched. Omitting `project` uses the configured `projectPath` when present; otherwise it launches the default in-memory scene state.

## Screenshot behavior

`POST /api/screenshot` always returns a successful JSON response when the route handler completes.

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

## Camera workflow behavior

The camera workflow routes expose Alice camera movement, view presets, marker
lifecycle, and first-person mode over the local REST API. They use the same
state model and movement math as the browser Camera panel.

Read the current state:

```bash
curl http://127.0.0.1:3000/api/camera/state \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

Move the camera:

```bash
curl -X POST http://127.0.0.1:3000/api/camera/move \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"forward":2}'
```

Successful camera responses include
`schema_version: "eatme.alice-camera-workflow-state/v1"` and the full current
camera state. See [Camera workflow API](./camera-workflow-api.md) for request
bodies, marker lifecycle, first-person behavior, and validation rules.

Camera reads are protected when `--api-token` is configured. The camera routes
use a route-level token guard so `GET /api/camera/state` and
`GET /api/camera/markers` reject missing or invalid tokens the same way camera
mutation routes do.

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
- the active camera workflow state and in-memory camera markers

Issue #221 adds state for imported model and texture asset descriptors,
one active archive resource map for imported bytes and parsed archive resources,
and scene object model resource IDs plus surface material bindings. Imported
bytes should use the same resource map seeded from `readProject()` and passed to
`writeProject()`; they should not live in a second imported-byte-only map.

Launching a project seeds default `ground` and `camera` scene objects when the
project has no loaded scene objects and resets camera workflow state to the
default Alice home view. Creating a project from a template replaces the active
project state, resets camera workflow state, and marks the server launched.

## Route responsibility map

`src/server.ts` is the composition entry point. It creates the Express app, creates one server context, registers focused route modules, and installs the global error handler.

| Area | Module | Responsibility |
| --- | --- | --- |
| Server composition | `src/server.ts` | Export `createServer`, re-export `validateProjectPath`, register routes |
| Context | `src/server/context.ts` | Build per-server context from `ServerOptions` |
| State | `src/server/state.ts` | Create and mutate per-server project state |
| Validation | `src/server/validation.ts` | Validate project paths and sanitize generated filenames |
| Project orchestration | `src/server/project-service.ts` | Launch, edit, save, and run projects |
| Export orchestration | `src/project-export.ts` | Build runnable `alice-web` packages, share metadata, previews, validation evidence, and package hashes |
| Evidence orchestration | `src/server/evidence-service.ts` | Coordinate proof artifact and project artifact writing |
| Screenshot orchestration | `src/server/screenshot-service.ts` | Render screenshots and provide placeholder fallback |
| Templates | `src/server/template-service.ts` | List registered templates and create new `.a3p` projects |
| Camera workflow | `src/camera-workflow.ts` | Serializable camera state, movement math, presets, markers, and validation |
| Camera routes | `src/server/routes/camera-routes.ts` | HTTP translation and route-level token guard for `/api/camera/*` |
| Routes | `src/server/routes/*.ts` | Translate HTTP requests and responses to service calls |

Asset import routes use the same per-server state and Alice API
identity as the rest of the local API. They need a larger JSON body limit than
the general API routes because base64 model and texture uploads can exceed 1
MiB. The limit is 25 MiB for `/api/assets/import-model` and
`/api/assets/import-texture`.

Route handlers stay thin: they read request data, call the relevant state or service helper, choose the HTTP status code, and return JSON.

The underlying `TemplateLibrary` supports code-level custom template registration. The Server API only lists and instantiates templates already registered in the current server state; it does not expose an HTTP endpoint for registering custom templates.

## Tutorial: create and run a project

Start the API server:

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
node dist-server/cli.js serve --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Use the same token value when sending mutating requests:

```bash
export ALICE_LOCAL_API_TOKEN="<same value used to start alice-web>"
```

Create a project from the Snow template:

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"templateId":"snow","projectName":"WinterStory"}'
```

Add a biped object:

```bash
curl -X POST http://127.0.0.1:3000/api/scene/add-object \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"className":"org.lgna.story.SBiped","name":"bunny"}'
```

Issue #221 plans texture import and application routes. After that
implementation lands, import a texture and apply it to an object:

```bash
TEXTURE_BASE64="$(base64 -w0 assets/textures/checker.png)"

curl -X POST http://127.0.0.1:3000/api/assets/import-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"fileName\":\"checker.png\",\"displayName\":\"Checker\",\"contentBase64\":\"$TEXTURE_BASE64\"}"

curl -X POST http://127.0.0.1:3000/api/scene/apply-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"objectName":"bunny","textureResourceId":"project/textures/checker.png","target":"surface"}'
```

Append an edit proof to `scene.myFirstMethod`:

```bash
curl -X POST http://127.0.0.1:3000/api/code/edit-procedure \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"procedureSelector":"scene.myFirstMethod","editSpec":"append-comment:move bunny forward"}'
```

Run the world:

```bash
curl -X POST http://127.0.0.1:3000/api/world/run \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Save the project:

```bash
curl -X POST http://127.0.0.1:3000/api/project/save \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"saveSelector":"scene.myFirstMethod"}'
```

Capture a screenshot:

```bash
curl -X POST http://127.0.0.1:3000/api/screenshot \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

After the workflow, `./evidence` contains the proof JSON, project archives, and screenshot files used by `eatme` and outside-in tests.

## Tutorial: export, play, share, and validate a web package feature contract

Start the API server and create or launch a project as shown above. The
web-package feature contract exports the active project as a runnable web
package:

```bash
curl -X POST http://127.0.0.1:3000/api/project/export/web-package \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Winter Story","description":"A snow scene with a bunny."}' \
  > export.json
```

Save and open the ZIP returned by the API:

```bash
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("export.json", "utf8")); fs.writeFileSync(d.package.filename, Buffer.from(d.package.base64, "base64"));'
PACKAGE_FILE="$(node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("export.json", "utf8")); process.stdout.write(d.package.filename);')"
PACKAGE_DIR="${PACKAGE_FILE%.zip}"
rm -rf "$PACKAGE_DIR"
unzip "$PACKAGE_FILE" -d "$PACKAGE_DIR"
xdg-open "$PACKAGE_DIR/index.html"
```

The extracted `index.html` is the playable Alice web player. It exposes
`window.AlicePlayer`, uses runtime identity `alice-web-player`, and loads the
embedded project payload without repository files.

Generate share metadata from the same package:

```bash
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("export.json", "utf8")); fs.writeFileSync("share-request.json", JSON.stringify({ packageBase64: d.package.base64, title: "Winter Story" })); fs.writeFileSync("validate-request.json", JSON.stringify({ packageBase64: d.package.base64 }));'

curl -X POST http://127.0.0.1:3000/api/project/share \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @share-request.json \
  > share.json
```

Validate the package before publishing or attaching it to a share page:

```bash
curl -X POST http://127.0.0.1:3000/api/project/validate-web-package \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @validate-request.json
```

The validation response must report `valid: true`, schema
`alice-web.validate-web-package-result/v1`, runtime `alice-web`, and package
manifest runtime identity `alice-web-player`.
