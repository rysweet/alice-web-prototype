# API reference

The REST API gives `eatme` and local scripts a simple way to launch
LookingGlass, change the scene, edit code, run the world, and capture evidence.

For server configuration, state isolation, evidence artifact semantics, and
route ownership, see [Server API](./server-api.md).

## Server startup

Build and run the server:

```bash
npm run build:server
npm run serve -- --evidence-dir ./evidence
```

Base URL examples below use `http://127.0.0.1:3000`.

## Endpoint summary

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
| `/api/world/run` | `POST` | Run the cached project through the Tweedle VM |
| `/api/screenshot` | `GET` | Render the current scene to a PNG file |
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
  "runtime": "lookingglass-typescript-web"
}
```

The `runtime` value is the LookingGlass runtime identity.

## `POST /api/launch`

Start a session with an `.a3p` path.

```bash
curl -X POST http://127.0.0.1:3000/api/launch \
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
  "project": "/workspace/alice-web-prototype/fixtures/starter.a3p",
  "projectName": "starter",
  "sceneObjectCount": 2
}
```

Relative request paths are resolved before they are stored or returned. The
path must be a safe `.a3p` path inside an allowed directory, but it does not
have to exist at launch time. Existing files are parsed when present; absent
files launch with the default in-memory scene state.

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

## `POST /api/code/edit-procedure`

```bash
curl -X POST http://127.0.0.1:3000/api/code/edit-procedure \
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

## `POST /api/world/run`

Run the current project through the Tweedle VM.

```bash
curl -X POST http://127.0.0.1:3000/api/world/run -H 'Content-Type: application/json' -d '{}'
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

## `GET /api/screenshot`

```bash
curl http://127.0.0.1:3000/api/screenshot
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

## `POST /api/events/register`

```bash
curl -X POST http://127.0.0.1:3000/api/events/register \
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
- running or registering events before launch
- event registration or firing that fails validation inside the event system
