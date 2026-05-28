# API reference

The REST API gives `eatme` and local scripts a simple way to launch the web
prototype, change the scene, edit code, run the world, and capture evidence.

## Server startup

Build and run the server:

```bash
npm run build:server
node dist-server/cli.js serve --port 3099 --evidence-dir ./evidence
```

Base URL examples below use `http://127.0.0.1:3099`.

## Endpoint summary

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/health` | `GET` | Check that the server is alive |
| `/api/launch` | `POST` | Start or reset a project session |
| `/api/scene/add-object` | `POST` | Add one object to the scene |
| `/api/code/edit-procedure` | `POST` | Append a procedure edit proof |
| `/api/project/save` | `POST` | Save the current project and proof artifact |
| `/api/world/run` | `POST` | Run the cached project through the Tweedle VM |
| `/api/screenshot` | `GET` | Render the current scene to a PNG file |
| `/api/events/register` | `POST` | Register an event handler |
| `/api/events/fire` | `POST` | Fire an event and report which handlers ran |

## `GET /api/health`

```bash
curl http://127.0.0.1:3099/api/health
```

Example response:

```json
{
  "status": "running",
  "launched": false,
  "pid": 12345,
  "uptime": 3.2,
  "runtime": "typescript-web-prototype"
}
```

## `POST /api/launch`

Start a session with an `.a3p` file.

```bash
curl -X POST http://127.0.0.1:3099/api/launch \
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
  "project": "./fixtures/starter.a3p",
  "projectName": "starter",
  "sceneObjectCount": 2
}
```

Error response:

```json
{ "error": "project path must be an .a3p file" }
```

## `POST /api/scene/add-object`

```bash
curl -X POST http://127.0.0.1:3099/api/scene/add-object \
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
curl -X POST http://127.0.0.1:3099/api/code/edit-procedure \
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
  "evidenceArtifact": "evidence/first-lesson-code-editor-action-proof.json"
}
```

## `POST /api/project/save`

```bash
curl -X POST http://127.0.0.1:3099/api/project/save \
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
curl -X POST http://127.0.0.1:3099/api/world/run -H 'Content-Type: application/json' -d '{}'
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
  "evidenceArtifact": "evidence/run-world-result.json"
}
```

Error response when nothing has been launched yet:

```json
{ "error": "Not launched. Call POST /api/launch first." }
```

## `GET /api/screenshot`

```bash
curl http://127.0.0.1:3099/api/screenshot
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
curl -X POST http://127.0.0.1:3099/api/events/register \
  -H 'Content-Type: application/json' \
  -d '{"eventType":"sceneActivated","handlerName":"setupScene"}'
```

Request body:

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `eventType` | `string` | yes | Event name such as `sceneActivated`, `keyPress`, `keyPressed`, `keyReleased`, `keyTyped`, or `proximity` |
| `handlerName` | `string` | yes | Handler label stored in the registration |
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
curl -X POST http://127.0.0.1:3099/api/events/fire \
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
