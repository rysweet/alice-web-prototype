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

Read-only `GET /api/audio/formats` does not require launch or the local API
token. `GET /api/audio/state` uses the same local API token as the camera state
routes when the server is started with `--api-token`.

## Endpoint summary

Rows under `/api/camera/*` are implemented camera workflow routes. See
[Camera workflow endpoints](#camera-workflow-endpoints) for the shared REST and
TypeScript contract. Rows labeled web-package feature contract define the
implemented export/share routes. `/api/audio/*` exposes the audio workflow; see
[Audio workflow endpoints](#audio-workflow-endpoints).

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Check that the server is alive |
| `/api/launch` | `POST` | Start or reset a project session |
| `/api/project/templates` | `GET` | List available project templates |
| `/api/project/new` | `POST` | Create a new project from a template |
| `/api/assets/import-model` | `POST` | Import a `.gltf` or `.glb` model into the current project |
| `/api/assets/import-texture` | `POST` | Import a `.png`, `.jpg`, `.jpeg`, or `.webp` texture into the current project |
| `/api/scene/add-object` | `POST` | Add one object to the scene |
| `/api/scene/apply-texture` | `POST` | Bind an imported texture to a scene object's surface |
| `/api/code/create-procedure` | `POST` | Create a procedure in the current project state |
| `/api/code/create-function` | `POST` | Create a function in the current project state |
| `/api/code/edit-procedure` | `POST` | Append a procedure edit proof |
| `/api/project/save` | `POST` | Save the current project and proof artifact |
| `/api/projects/current/export/typescript` | `GET` | Download the current project as an Alice web TypeScript source ZIP |
| `/api/projects/current/classes/:typeName/behavior` | `GET` | Download one reusable Alice class behavior package |
| `/api/projects/current/classes/behavior` | `POST` | Import one reusable Alice class behavior package |
| `/api/project/export/web-package` | `POST` | Web-package feature contract: export the active project as a runnable `alice-web` ZIP package |
| `/api/project/share` | `POST` | Web-package feature contract: generate share artifacts linked to a validated exported package |
| `/api/project/validate-web-package` | `POST` | Web-package feature contract: validate an exported `alice-web` ZIP package |
| `/api/audio/formats` | `GET` | List supported project audio file extensions |
| `/api/audio/state` | `GET` | Return the active project's audio assets, background music, and cues |
| `/api/audio/assets` | `POST` | Register a base64-encoded audio asset |
| `/api/audio/background` | `POST` | Select a registered asset as background music |
| `/api/audio/cues` | `POST` | Add an animation-timed audio cue |
| `/api/audio/evidence` | `POST` | Write bounded audio workflow evidence |
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
| `modelResourceId` | `string` | no | Imported model resource ID such as `project/models/moon-rover.glb` |

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

Providing `modelResourceId` makes the object use the imported model asset stored
in project state. Unknown model resource IDs return `400`.

## `POST /api/assets/import-model`

Import a `.gltf` or `.glb` model into the current project. This route uses JSON
base64 uploads with a 25 MiB body limit.

```bash
MODEL_BASE64="$(base64 -w0 assets/models/moon-rover.glb)"

curl -X POST http://127.0.0.1:3000/api/assets/import-model \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"moon-rover.glb\",\"displayName\":\"Moon Rover\",\"contentBase64\":\"$MODEL_BASE64\"}"
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `fileName` | `string` | yes | Source filename ending in `.gltf` or `.glb` |
| `displayName` | `string` | no | Human-readable asset name; defaults from `fileName` |
| `contentBase64` | `string` | yes | Base64-encoded model bytes |

Example response:

```json
{
  "status": "imported",
  "asset": {
    "id": "project/models/moon-rover.glb",
    "kind": "model",
    "name": "Moon Rover",
    "fileName": "moon-rover.glb",
    "resourcePath": "resources/models/moon-rover.glb",
    "contentType": "model/gltf-binary",
    "byteLength": 18422
  }
}
```

Validation rejects missing fields, invalid base64, empty decoded bytes, unsafe
filenames, unsupported extensions, and decoded resources that exceed Project
IO's archive size limit. Duplicate asset IDs get `-2`, `-3`, and later suffixes
before the extension.

## `POST /api/assets/import-texture`

Import a browser-compatible image texture into the current project. This route
uses the same 25 MiB JSON body limit as model imports.

```bash
TEXTURE_BASE64="$(base64 -w0 assets/textures/checker.png)"

curl -X POST http://127.0.0.1:3000/api/assets/import-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"checker.png\",\"displayName\":\"Checker\",\"contentBase64\":\"$TEXTURE_BASE64\"}"
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `fileName` | `string` | yes | Source filename ending in `.png`, `.jpg`, `.jpeg`, or `.webp` |
| `displayName` | `string` | no | Human-readable asset name; defaults from `fileName` |
| `contentBase64` | `string` | yes | Base64-encoded image bytes |

Example response:

```json
{
  "status": "imported",
  "asset": {
    "id": "project/textures/checker.png",
    "kind": "texture",
    "name": "Checker",
    "fileName": "checker.png",
    "resourcePath": "resources/textures/checker.png",
    "contentType": "image/png",
    "byteLength": 4281
  }
}
```

Validation rejects missing fields, invalid base64, empty decoded bytes, unsafe
filenames, unsupported extensions, and decoded resources that exceed Project
IO's archive size limit. Duplicate asset IDs get `-2`, `-3`, and later suffixes
before the extension.

## `POST /api/scene/apply-texture`

Bind an imported texture to a scene object's surface material.

```bash
curl -X POST http://127.0.0.1:3000/api/scene/apply-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"objectName":"box","textureResourceId":"project/textures/checker.png","target":"surface"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `objectName` | `string` | yes | Existing scene object name |
| `textureResourceId` | `string` | yes | Imported texture resource ID |
| `target` | `"surface"` | no | Material target; defaults to `"surface"` |

Example response:

```json
{
  "status": "applied",
  "objectName": "box",
  "materialBindings": [
    {
      "target": "surface",
      "textureResourceId": "project/textures/checker.png"
    }
  ]
}
```

Validation rejects unknown texture resource IDs and unsupported targets with
`400`. Missing scene objects return `404`.

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
    "filename": "winter-story.alice-web.zip",
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
    "validation": "validation.json",
    "project": "project/project.json",
    "package": {
      "filename": "winter-story.alice-web.zip",
      "mimeType": "application/zip"
    }
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
Package filenames are accepted only when the validated package manifest contains
a safe filename without directory traversal.

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
      "filename": "winter-story.alice-web.zip",
      "mimeType": "application/zip",
      "sizeBytes": 24576,
      "sha256": "8ad0e9b4f5d8f2d3b30f6d3f6f0f4e6d4f3b2a1900e4c4a1f03f7c2cb72f47cc"
    },
    "delivery": {
      "mode": "browser-download-fallback",
      "nativeWebShare": false,
      "requiresUserDownload": true
    },
    "links": {
      "html": "index.html",
      "package": "winter-story.alice-web.zip",
      "preview": "preview.png"
    }
  },
  "artifacts": {
    "share": "share.json",
    "preview": "preview.png",
    "entrypoint": "index.html",
    "package": "winter-story.alice-web.zip"
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
    "filename": "winter-story.alice-web.zip",
    "mimeType": "application/zip",
    "sizeBytes": 24576,
    "sha256": "8ad0e9b4f5d8f2d3b30f6d3f6f0f4e6d4f3b2a1900e4c4a1f03f7c2cb72f47cc"
  },
  "manifest": {
    "schemaVersion": "alice-web.package/v1",
    "runtimeIdentity": "alice-web-player",
    "entrypoint": "index.html",
    "project": "project/project.json",
    "package": {
      "filename": "winter-story.alice-web.zip",
      "mimeType": "application/zip"
    }
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
      "message": "index.html is required",
      "path": "index.html"
    }
  ],
  "evidence": ["base64-decodes", "zip-readable"]
}
```

Validation rejects malformed base64, empty packages, unreadable ZIP data,
absolute paths, parent traversal, backslash traversal, duplicate required
entries, encoded path controls, missing required files, unsafe package
filenames, wrong schema identity, wrong runtime identity, unsafe
`canonicalUrl` values, and generated metadata that uses repository nickname
identity.

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

## `GET /api/audio/formats`

List audio file extensions accepted by Alice project audio workflows.

```bash
curl http://127.0.0.1:3000/api/audio/formats
```

Example response:

```json
{
  "formats": [".mp3", ".wav", ".ogg", ".m4a"]
}
```

Extensions are matched case-insensitively during asset registration and stored
as lowercase formats in project metadata.

## `GET /api/audio/state`

Return the active project's audio state.

```bash
curl http://127.0.0.1:3000/api/audio/state
```

Example response:

```json
{
  "supportedFormats": [".mp3", ".wav", ".ogg", ".m4a"],
  "assets": [
    {
      "id": "audio-1",
      "name": "intro.wav",
      "format": "wav",
      "resourcePath": "resources/audio/audio-1.wav",
      "sizeBytes": 16044,
      "durationSeconds": 1
    }
  ],
  "backgroundMusic": {
    "assetId": "audio-1",
    "volume": 0.75,
    "loop": true
  },
  "cues": [
    {
      "id": "intro-cue",
      "assetId": "audio-1",
      "animationId": "scene.myFirstMethod.spin",
      "timelineTimeSeconds": 1.25,
      "volume": 0.5
    }
  ]
}
```

When no audio has been configured, `assets` and `cues` are empty arrays and
`backgroundMusic` is `null`.

This route is readable before launch and returns the empty default audio state.

## `POST /api/audio/assets`

Register a base64-encoded audio asset in the launched project.

```bash
export AUDIO_BASE64="$(node -e 'process.stdout.write(require("fs").readFileSync("tmp/audio/intro.wav").toString("base64"))')"

curl -X POST http://127.0.0.1:3000/api/audio/assets \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"fileName\":\"intro.wav\",\"dataBase64\":\"$AUDIO_BASE64\",\"durationSeconds\":1}"
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `fileName` | `string` | yes | Original file name; extension must be `.mp3`, `.wav`, `.ogg`, or `.m4a` |
| `dataBase64` | `string` | yes | Base64-encoded audio bytes, up to `1048576` characters |
| `durationSeconds` | `number` | no | Non-negative duration when known |

Example response:

```json
{
  "status": "registered",
  "asset": {
    "id": "audio-1",
    "name": "intro.wav",
    "format": "wav",
    "resourcePath": "resources/audio/audio-1.wav",
    "sizeBytes": 16044,
    "durationSeconds": 1
  }
}
```

The route stores bytes in the active project resource map at
`resources/audio/<asset-id>.<format>`. The asset is persisted when
`POST /api/project/save` writes the project archive.

Error response for unsupported audio:

```json
{
  "error": "unsupported audio format: flac. Supported formats: .mp3, .wav, .ogg, .m4a"
}
```

## `POST /api/audio/background`

Configure a registered asset as project background music.

```bash
curl -X POST http://127.0.0.1:3000/api/audio/background \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"assetId":"audio-1","volume":0.75,"loop":true}'
```

Request body:

| Field | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `assetId` | `string` | yes | none | Existing audio asset id |
| `volume` | `number` | no | `1` | Playback volume from `0` to `1` |
| `loop` | `boolean` | no | `true` | Stored intent for whether background music repeats |

Example response:

```json
{
  "status": "configured",
  "backgroundMusic": {
    "assetId": "audio-1",
    "volume": 0.75,
    "loop": true
  }
}
```

## `POST /api/audio/cues`

Add an audio cue synchronized to an animation timeline.

```bash
curl -X POST http://127.0.0.1:3000/api/audio/cues \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":"intro-cue","assetId":"audio-1","animationId":"scene.myFirstMethod.spin","timelineTimeSeconds":1.25,"volume":0.5}'
```

Request body:

| Field | Type | Required | Default | Meaning |
| --- | --- | --- | --- | --- |
| `id` | `string` | yes | none | Unique cue id |
| `assetId` | `string` | yes | none | Existing audio asset id |
| `animationId` | `string` | yes | none | Animation or procedure timeline id |
| `timelineTimeSeconds` | `number` | yes | none | Non-negative cue trigger time from the start of the animation |
| `volume` | `number` | no | `1` | Cue playback volume from `0` to `1` |

Example response:

```json
{
  "status": "configured",
  "cue": {
    "id": "intro-cue",
    "assetId": "audio-1",
    "animationId": "scene.myFirstMethod.spin",
    "timelineTimeSeconds": 1.25,
    "volume": 0.5
  }
}
```

The route stores cue intent. The runtime playback bridge must trigger the cue
once when the named animation timeline reaches or crosses the configured time.

## `POST /api/audio/evidence`

Write the bounded audio workflow evidence artifact.

```bash
curl -X POST http://127.0.0.1:3000/api/audio/evidence \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"savedProjectArtifact":"saved-project.a3p","reloaded":true}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `savedProjectArtifact` | `string` | no | Saved project artifact name to record in evidence |
| `reloaded` | `boolean` | no | Whether the evidence was collected after reloading a saved project |

Example response:

```json
{
  "schema_version": "alice.audio-workflow-result/v1",
  "status": "bounded",
  "evidenceArtifact": "evidence/audio-workflow.json"
}
```

Evidence artifact shape:

```json
{
  "schema_version": "alice.audio-workflow/v1",
  "timestamp": 1710000000000,
  "source": "alice-web",
  "status": "bounded",
  "support_level": "metadata-and-playback-bridge",
  "supported_formats": [".mp3", ".wav", ".ogg", ".m4a"],
  "asset_count": 1,
  "asset_names": ["intro.wav"],
  "background_music_configured": true,
  "cue_count": 1,
  "cue_ids": ["intro-cue"],
  "saved_project_artifact": "saved-project.a3p",
  "reloaded": true,
  "playback": {
    "mode": "simulated-output-bridge",
    "native_audio_playback": false,
    "background_music_started": true,
    "triggered_cue_ids": ["intro-cue"],
    "synchronized_animation_ids": ["scene.myFirstMethod"]
  },
  "doesNotClaim": [
    "native audio playback",
    "real speaker output in the browser or operating system",
    "full audio authoring pipeline",
    "native desktop audio stack coverage",
    "visible rendering correctness"
  ]
}
```

`timestamp` is a dynamic runtime value.

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

## Audio workflow endpoints

The audio workflow endpoints manage Alice project audio resources, background
audio, cue definitions, and cue activity. `GET /api/audio/state` and all
mutating `/api/audio/*` routes require `X-Alice-Local-Api-Token` when the server
is started with `--api-token`.

Endpoint summary:

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/audio/state` | `GET` | Read current project audio state |
| `/api/audio/resources` | `POST` | Add or replace an audio resource |
| `/api/audio/background` | `POST` | Configure background audio |
| `/api/audio/cues` | `POST` | Add or replace an audio cue |
| `/api/audio/cues/:id/play` | `POST` | Mark an audio cue as playing |
| `/api/audio/cues/:id/stop` | `POST` | Mark an audio cue as stopped |
| `/api/audio/cues/:id` | `DELETE` | Remove an audio cue |

Request to read audio state:

```bash
curl http://127.0.0.1:3000/api/audio/state \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

Request to set background audio:

```bash
curl -X POST http://127.0.0.1:3000/api/audio/background \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"resourceId":"theme","enabled":true,"loop":true,"volume":0.35,"pan":0}'
```

Response shape:

```json
{
  "schema_version": "eatme.alice-audio-workflow-state/v1",
  "status": "ok",
  "operation": "set-background",
  "audio": {
    "manifestVersion": "alice-web.audio-manifest/v1",
    "resources": [
      {
        "id": "theme",
        "name": "theme.wav",
        "path": "resources/audio/theme.wav",
        "format": "wav",
        "sizeBytes": 44,
        "duration": 0,
        "decodeStatus": "decode-unavailable"
      }
    ],
    "background": {
      "resourceId": "theme",
      "enabled": true,
      "loop": true,
      "volume": 0.35,
      "pan": 0
    },
    "cues": [],
    "activeCueIds": []
  }
}
```

See [Audio](./audio.md) for the full state schema, resource upload request,
background and cue request bodies, TypeScript exports, evidence artifacts, and
validation rules.

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
