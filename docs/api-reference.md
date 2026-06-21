# API reference

The REST API gives `eatme` and local scripts a simple way to launch Alice,
change the scene, edit code, run the world, and capture evidence.

For server configuration, state isolation, evidence artifact semantics, and
route ownership, see [Server API](./server-api.md).

## Server startup

Build and run the server:

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Base URL examples below use `http://127.0.0.1:3000`. Mutating requests must
send `Content-Type: application/json`. When using the CLI server, set
`ALICE_LOCAL_API_TOKEN` before startup, pass it with `--api-token`, and send the
same value as `X-Alice-Local-Api-Token`.

## Endpoint summary

Rows under `/api/camera/*` are implemented camera workflow routes. See
[Camera workflow endpoints](#camera-workflow-endpoints) for the shared REST and
TypeScript contract. Rows labeled web-package feature contract define the
implemented export/share routes; the other rows describe the current REST API
surface.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Check that the server is alive |
| `/api/launch` | `POST` | Start or reset a project session |
| `/api/project/templates` | `GET` | List available project templates |
| `/api/project/new` | `POST` | Create a new project from a template |
| `/api/scene/add-object` | `POST` | Add one object to the scene |
| `/api/code/create-procedure` | `POST` | Create a procedure in the current project state |
| `/api/code/create-function` | `POST` | Create a function in the current project state |
| `/api/code/edit-procedure` | `POST` | Append a procedure edit proof |
| `/api/project/save` | `POST` | Save the current project and proof artifact |
| `/api/projects/current/export/typescript` | `GET` | Download the current project as an Alice web TypeScript source ZIP |
| `/api/project/export/web-package` | `POST` | Web-package feature contract: export the active project as a runnable `alice-web` ZIP package |
| `/api/project/share` | `POST` | Web-package feature contract: generate share artifacts linked to a validated exported package |
| `/api/project/validate-web-package` | `POST` | Web-package feature contract: validate an exported `alice-web` ZIP package |
| `/api/world/run` | `POST` | Run the cached project through the Tweedle VM |
| `/api/screenshot` | `POST` | Render the current scene to a PNG file |
| `/api/camera/state` | `GET` | Read the active camera workflow state |
| `/api/camera/move` | `POST` | Move the active camera |
| `/api/camera/pan` | `POST` | Pan the active camera |
| `/api/camera/zoom` | `POST` | Zoom the active camera |
| `/api/camera/focus` | `POST` | Focus the active camera on a target |
| `/api/camera/orbit` | `POST` | Orbit around the active target |
| `/api/camera/preset` | `POST` | Apply a named camera view |
| `/api/camera/mode` | `POST` | Switch orbit or first-person camera mode |
| `/api/camera/markers` | `GET` | List saved camera markers |
| `/api/camera/markers` | `POST` | Save a camera marker |
| `/api/camera/markers/:id/restore` | `POST` | Restore a camera marker |
| `/api/camera/markers/:id` | `DELETE` | Delete a camera marker |
| `/api/events/register` | `POST` | Register an event handler |
| `/api/events/fire` | `POST` | Fire an event and report which handlers ran |

## `GET /api/health`

```bash
curl http://127.0.0.1:3000/api/health
```

Example response:

```json
{
  "status": "running",
  "launched": false,
  "pid": 12345,
  "uptime": 3.2,
  "runtime": "alice-web"
}
```

The `runtime` value is the Alice web runtime identity.

## `POST /api/launch`

Start a session with an `.a3p` path.

```bash
curl -X POST http://127.0.0.1:3000/api/launch \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"project":"./fixtures/starter.a3p"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `project` | `string` | no | Path to an `.a3p` file |

Example response:

```json
{
  "status": "launched",
  "project": "/workspace/alice-web/fixtures/starter.a3p",
  "projectName": "starter",
  "sceneObjectCount": 2
}
```

Relative request paths are resolved before they are stored or returned. The
path must be a safe, readable `.a3p` file inside an allowed directory. Requested
project files that are missing, unreadable, corrupt, or resolve outside the
allowed directories fail the launch instead of falling back to default state.
Omitting `project` uses the configured `projectPath` when present; otherwise it
launches the default in-memory scene state.

Error response:

```json
{ "error": "project path must be an .a3p file" }
```

## `GET /api/project/templates`

List all available project templates.

```bash
curl http://127.0.0.1:3000/api/project/templates
```

Example response:

```json
{
  "templates": [
    {
      "id": "blank",
      "name": "Blank",
      "description": "Minimal starter scene with a camera and ground."
    },
    {
      "id": "snow",
      "name": "Snow",
      "description": "Snowy starter world with a camera, snowperson, and pine tree."
    },
    {
      "id": "sea-floor",
      "name": "Sea Floor",
      "description": "Underwater starter scene with fish, coral, and treasure."
    },
    {
      "id": "moon",
      "name": "Moon",
      "description": "Low-gravity moon scene with a rover and astronaut."
    }
  ]
}
```

The underlying `TemplateLibrary` can register custom templates in code, but
the Server API only lists and instantiates templates already present in the
current server state. It does not provide an HTTP endpoint for registering
custom templates.

## `POST /api/project/new`

Create a new project from a template. This resets the server's active
session to the new project.

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"templateId": "snow", "projectName": "WinterStory"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `templateId` | `string` | no | Template to use; defaults to `blank` |
| `projectName` | `string` | no | Project name; defaults to `<TemplateName> Project` |

Example response:

```json
{
  "schema_version": "eatme.alice-project-new-result/v1",
  "status": "created",
  "templateId": "snow",
  "projectName": "WinterStory",
  "projectPath": "evidence/project-new/WinterStory.a3p",
  "sceneObjectCount": 4,
  "a3pSizeBytes": 1284
}
```

Error response when template is not found:

```json
{
  "error": "Unknown template: forest",
  "availableTemplates": ["blank", "snow", "sea-floor", "moon"]
}
```

Creating a project also sets `launched = true`, so you do not need to
call `POST /api/launch` separately when using this endpoint.

## `POST /api/scene/add-object`

```bash
curl -X POST http://127.0.0.1:3000/api/scene/add-object \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"className":"org.lgna.story.SBiped","name":"bunny"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `className` | `string` | yes | Alice class name to add |
| `name` | `string` | no | Scene field name; defaults from class name |

Example response:

```json
{
  "status": "added",
  "objectName": "bunny",
  "className": "org.lgna.story.SBiped",
  "sceneFieldCountAfter": 3,
  "evidenceArtifact": "evidence/scene-object-added.json"
}
```

## Joint manipulation endpoints

The joint endpoints expose object joints, biped joints, joint arrays, poses,
animation queueing, sidecar persistence, and runtime verification. Use
[Joint manipulation](./joint-manipulation.md) for request bodies, response
shapes, sidecar schema, canonical biped aliases, and invalid-joint error
behavior.

Endpoint summary:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/scene/add-jointed-object` | `POST` | Add a custom object with explicit joints |
| `/api/joints/:objectName` | `GET` | Read joint state, poses, arrays, and queued animations |
| `/api/joints/:objectName/arrays` | `POST` | Define or replace a persisted joint array |
| `/api/joints/:objectName/pose` | `POST` | Apply and optionally name a joint pose |
| `/api/joints/:objectName/animate` | `POST` | Queue a joint or joint-array animation |
| `/api/world/run` | `POST` | Keeps current run fields and adds joint verification when queued joint work executes |

Minimal sequence:

```bash
curl -X POST http://127.0.0.1:3000/api/joints/alice/arrays \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"leftArm","joints":["LEFT_SHOULDER","LEFT_ELBOW","LEFT_WRIST","LEFT_HAND"]}'

curl -X POST http://127.0.0.1:3000/api/joints/alice/animate \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"target":{"jointArray":"leftArm"},"durationMs":750,"style":"gentle","to":{"orientation":{"x":0,"y":0,"z":0.707,"w":0.707}}}'

curl -X POST http://127.0.0.1:3000/api/world/run \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

## `POST /api/code/edit-procedure`

```bash
curl -X POST http://127.0.0.1:3000/api/code/edit-procedure \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"procedureSelector":"scene.myFirstMethod","editSpec":"append-comment:move bunny forward"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `procedureSelector` | `string` | no | Procedure to edit; defaults to `scene.myFirstMethod` |
| `editSpec` | `string` | no | Edit proof text; defaults to an eatme marker |

Example response:

```json
{
  "schema_version": "eatme.alice-first-lesson-code-editor-action-proof-result/v1",
  "status": "proved",
  "procedure_selector": "scene.myFirstMethod",
  "edited_project_artifact": "edited-project.a3p",
  "action_proof": "first-lesson-code-editor-action-proof.json",
  "doesNotClaim": [
    "first-lesson completion",
    "grading",
    "creative assessment",
    "visible rendering correctness",
    "broad UI automation"
  ],
  "evidenceArtifact": "evidence/first-lesson-code-editor-action-proof.json"
}
```

## `POST /api/code/create-procedure`

Create a procedure in the current project state.

```bash
curl -X POST http://127.0.0.1:3000/api/code/create-procedure \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"walkForward","parameters":[{"name":"distance","type":"DecimalNumber"}]}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | yes | Procedure name; leading and trailing whitespace is trimmed |
| `parameters` | `array` | no | Parameter list; each parameter needs a non-empty `name` |

Example response:

```json
{
  "status": "created",
  "name": "walkForward",
  "kind": "procedure",
  "parameters": [
    {
      "name": "distance",
      "type": "DecimalNumber"
    }
  ],
  "totalProcedures": 2
}
```

## `POST /api/code/create-function`

Create a function in the current project state.

```bash
curl -X POST http://127.0.0.1:3000/api/code/create-function \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"name":"getDistance","returnType":"DecimalNumber"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `name` | `string` | yes | Function name; leading and trailing whitespace is trimmed |
| `returnType` | `string` | yes | Alice return type |
| `parameters` | `array` | no | Parameter list; each parameter needs a non-empty `name` |

Example response:

```json
{
  "status": "created",
  "name": "getDistance",
  "kind": "function",
  "returnType": "DecimalNumber",
  "parameters": [],
  "totalProcedures": 2
}
```

## `POST /api/project/save`

```bash
curl -X POST http://127.0.0.1:3000/api/project/save \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"saveSelector":"scene.myFirstMethod","targetPath":"./evidence/saved-project.a3p"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `saveSelector` | `string` | no | Label for the save action |
| `targetPath` | `string` | no | Output path recorded in the proof artifact |

Example response:

```json
{
  "schema_version": "eatme.alice-project-save-result/v1",
  "status": "saved",
  "save_selector": "scene.myFirstMethod",
  "saved_project_artifact": "saved-project.a3p",
  "save_artifact": "desktop-save-operation-result.json",
  "evidenceArtifact": "evidence/project-save/desktop-save-operation-result.json"
}
```

## `POST /api/project/export/web-package`

Web-package feature contract: export the active project as a runnable
`alice-web` web package. The returned ZIP contains everything needed to extract
the package and open `index.html` in a browser.

API response envelopes use snake_case `schema_version`. JSON files inside the
exported ZIP use camelCase `schemaVersion`.

```bash
curl -X POST http://127.0.0.1:3000/api/project/export/web-package \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Winter Story","description":"A snow scene with a bunny."}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `title` | `string` | no | Human-readable title for manifest, player metadata, and share metadata |
| `description` | `string` | no | Human-readable project summary |
| `canonicalUrl` | `string` | no | Public `http` or `https` URL for the shared project page |

Example response:

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
    "entrypoint": "index.html",
    "preview": "preview.png",
    "share": "share.json",
    "validation": "validation.json"
  },
  "artifacts": {
    "entrypoint": "index.html",
    "manifest": "manifest.json",
    "share": "share.json",
    "preview": "preview.png",
    "project": "project/project.json",
    "validation": "validation.json"
  },
  "validation": {
    "schemaVersion": "alice-web.validation/v1",
    "valid": true,
    "errors": [],
    "evidence": [
      "required-files-present",
      "entrypoint-playable",
      "alice-web-identity"
    ]
  }
}
```

Required ZIP entries:

| Entry | Purpose |
| --- | --- |
| `index.html` | Self-contained Alice web player document; exposes `window.AlicePlayer` and runtime identity `alice-web-player` |
| `manifest.json` | Package manifest with schema `alice-web.package/v1` |
| `share.json` | Share metadata with schema `alice-web.share/v1` |
| `preview.png` | PNG preview image referenced by manifest and share metadata |
| `project/project.json` | Serialized Alice project payload used by the player |
| `validation.json` | Validation evidence with schema `alice-web.validation/v1` |

The generated package must not contain repository nickname identity in product,
runtime, API, player, manifest, share, or validation metadata.

## `POST /api/project/share`

Web-package feature contract: create share artifacts from an exported package.
The server validates `packageBase64` before generating the share response, then
links the package by filename, byte size, and SHA-256 digest.

```bash
curl -X POST http://127.0.0.1:3000/api/project/share \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"packageBase64":"UEsDB...","title":"Winter Story"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `packageBase64` | `string` | yes | Base64-encoded ZIP returned by `/api/project/export/web-package` |
| `title` | `string` | no | Share title override |
| `description` | `string` | no | Share description override |
| `canonicalUrl` | `string` | no | Public `http` or `https` URL for the share page |

Example response:

```json
{
  "schema_version": "alice-web.share-artifacts-result/v1",
  "status": "shared",
  "runtime": "alice-web",
  "share": {
    "schemaVersion": "alice-web.share/v1",
    "product": "Alice",
    "runtimeIdentity": "alice-web-player",
    "title": "Winter Story",
    "description": "A snow scene with a bunny.",
    "package": {
      "filename": "WinterStory.alice-web.zip",
      "mimeType": "application/zip",
      "sizeBytes": 24576,
      "sha256": "8ad0e9b4f5d8f2d3b30f6d3f6f0f4e6d4f3b2a1900e4c4a1f03f7c2cb72f47cc"
    },
    "links": {
      "html": "index.html",
      "package": "WinterStory.alice-web.zip",
      "preview": "preview.png"
    }
  },
  "artifacts": {
    "share": "share.json",
    "preview": "preview.png",
    "entrypoint": "index.html",
    "package": "WinterStory.alice-web.zip"
  },
  "validation": {
    "valid": true,
    "errors": []
  }
}
```

The share route does not trust caller-supplied filenames or hashes. It derives
package linkage from the decoded ZIP bytes and the validated manifest.

## `POST /api/project/validate-web-package`

Web-package feature contract: validate an exported package before playback,
storage, or sharing.

```bash
curl -X POST http://127.0.0.1:3000/api/project/validate-web-package \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"packageBase64":"UEsDB..."}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `packageBase64` | `string` | yes | Base64-encoded `alice-web` ZIP package |

Valid response:

```json
{
  "schema_version": "alice-web.validate-web-package-result/v1",
  "status": "valid",
  "valid": true,
  "runtime": "alice-web",
  "package": {
    "filename": "WinterStory.alice-web.zip",
    "mimeType": "application/zip",
    "sizeBytes": 24576,
    "sha256": "8ad0e9b4f5d8f2d3b30f6d3f6f0f4e6d4f3b2a1900e4c4a1f03f7c2cb72f47cc"
  },
  "manifest": {
    "schemaVersion": "alice-web.package/v1",
    "runtimeIdentity": "alice-web-player",
    "entrypoint": "index.html"
  },
  "evidence": [
    "base64-decodes",
    "zip-readable",
    "required-files-present",
    "safe-zip-paths",
    "no-duplicate-required-files",
    "alice-web-identity",
    "entrypoint-playable"
  ],
  "errors": []
}
```

Invalid packages return HTTP `400` with explicit validation errors:

```json
{
  "schema_version": "alice-web.validate-web-package-result/v1",
  "status": "invalid",
  "valid": false,
  "errors": [
    {
      "code": "missing-required-file",
      "message": "Package is missing index.html.",
      "path": "index.html"
    }
  ],
  "evidence": ["base64-decodes", "zip-readable"]
}
```

Validation rejects malformed base64, empty packages, unreadable ZIP data,
absolute paths, parent traversal, backslash traversal, duplicate required
entries, excessive package size, excessive file count, missing required files,
wrong schema identity, wrong runtime identity, unsafe `canonicalUrl` values, and
generated metadata that uses repository nickname identity.

## `GET /api/projects/current/export/typescript`

Download the current Alice project as a TypeScript source handoff archive.

```bash
curl -fS http://127.0.0.1:3000/api/projects/current/export/typescript \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -o alice-web-typescript-source.zip
```

Success response:

```http
HTTP/1.1 200 OK
Content-Type: application/zip
Content-Disposition: attachment; filename="alice-web-typescript-source.zip"
Cache-Control: no-store
```

The archive will be rooted at `alice-web-typescript-source/` and contain
`manifest.json`, `package.json`, `tsconfig.json`, `README.md`, and readable
generated `src/**/*.ts` files for project metadata, scene objects, procedures,
and explicit unsupported-runtime behavior.

The export must use the same current-project state as save and run flows.
Projects created from templates, loaded from `.a3p`, and changed through live
server API edits must export the merged current state.

Error response when nothing has been launched yet:

```json
{ "error": "Not launched. Call POST /api/launch first." }
```

See [TypeScript source export](./typescript-source-export.md) for the
archive layout, generated source conventions, and implementation contract.

## `POST /api/world/run`

Run the current project through the Tweedle VM.

```bash
curl -X POST http://127.0.0.1:3000/api/world/run \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Example response:

```json
{
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "project_name": "Program",
  "scene_object_count": 3,
  "procedure_count": 1,
  "statements_executed": 4,
  "execution_log": [],
  "run_duration_ms": 7,
  "errors": [],
  "doesNotClaim": [
    "visible rendering correctness",
    "desktop run-button proof"
  ],
  "evidenceArtifact": "evidence/run-world-result.json"
}
```

Error response when nothing has been launched yet:

```json
{ "error": "Not launched. Call POST /api/launch first." }
```

## `POST /api/screenshot`

```bash
curl -X POST http://127.0.0.1:3000/api/screenshot \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Example response:

```json
{
  "status": "captured",
  "path": "evidence/screenshot.png",
  "objectCount": 3,
  "sceneDescription": "Program",
  "rendered": true
}
```

If rendering fails, the server writes a placeholder PNG and returns a JSON
response that explains that fallback.

## Camera workflow endpoints

Camera workflow endpoints move the Alice camera, apply standard views, save and
restore markers, and switch first-person mode. All `/api/camera/*` routes
require `X-Alice-Local-Api-Token` when the server is started with
`--api-token`, including read routes.

Move the camera forward:

```bash
curl -X POST http://127.0.0.1:3000/api/camera/move \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"forward":2}'
```

Example response shape:

```json
{
  "schema_version": "eatme.alice-camera-workflow-state/v1",
  "status": "ok",
  "operation": "move",
  "camera": {
    "mode": "orbit",
    "position": { "x": 0, "y": 5, "z": 18 },
    "target": { "x": 0, "y": 1, "z": -2 },
    "fieldOfViewDegrees": 60,
    "activePreset": null
  },
  "markers": [],
  "activeMarkerId": null
}
```

See [Camera workflow API](./camera-workflow-api.md) for the full state schema,
request bodies, marker lifecycle routes, TypeScript exports, and validation
rules.

## `POST /api/events/register`

```bash
curl -X POST http://127.0.0.1:3000/api/events/register \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"sceneActivated","handlerName":"setupScene"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `eventType` | `string` | yes | Event name — one of: `sceneActivated`, `keyPress`, `keyPressed`, `keyReleased`, `keyTyped`, `collision`, `collisionStart`, `collisionEnd`, `mouseClicked`, `mousePressed`, `mouseReleased`, `mouseEntered`, `mouseExited`, `mouseMoved`, `mouseDragged`, `mouseWheel`, `proximity`, `proximityEnter`, `proximityExit`, `occlusion`, `viewEnter`, `viewExit`, `transformChanged` |
| `handlerName` | `string` | no | Handler label stored in the registration; defaults to `"handler"` when omitted |
| `key` | `string` | conditional | Required for keyboard events: `keyPress`, `keyPressed`, `keyReleased`, and `keyTyped` |
| `target` | `string` | no | Optional target object name for target-scoped listeners; if provided it must name a known object |
| `useCapture` | `boolean` | no | Optional capture-phase flag; only valid for bubbling keyboard and mouse events |
| `targetObjects` | `string[]` | conditional | Required for `proximity` registrations; must contain exactly 2 known object names |
| `threshold` | `number` | no | Optional `proximity` distance override; must be greater than `0` and less than or equal to `1000` |

Examples by event type:

- `sceneActivated`: `{"eventType":"sceneActivated","handlerName":"setupScene"}`
- Keyboard events: `{"eventType":"keyPress","handlerName":"jump","key":"SPACE"}`
- Proximity events: `{"eventType":"proximity","handlerName":"onNear","targetObjects":["bunny","fox"],"threshold":2.5}`

Example response:

```json
{
  "registrationId": "evt-1",
  "eventType": "sceneActivated",
  "handlerName": "setupScene",
  "evidenceArtifact": "evidence/event-register.json"
}
```

## `POST /api/events/fire`

```bash
curl -X POST http://127.0.0.1:3000/api/events/fire \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"sceneActivated","payload":{}}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `eventType` | `string` | yes | Event to trigger |
| `payload` | `object` | no | Event-specific data |

Example response:

```json
{
  "triggered": [
    {
      "id": "evt-1",
      "eventType": "sceneActivated",
      "handlerName": "setupScene"
    }
  ],
  "evidenceArtifact": "evidence/event-fire.json"
}
```

## Error handling summary

The server uses `400` responses for bad requests such as:

- launching with a non-`.a3p` path
- adding an object without `className`
- exporting, sharing, or validating before a project is available
- malformed `packageBase64`
- invalid `alice-web` package structure or identity
- running or registering events before launch
- event registration or firing that fails validation inside the event system
