# Imported model and texture assets

Alice can import project-owned glTF/GLB models and image textures, bind
imported textures to scene object surfaces, and preserve the assets in `.a3p`
archives.

Use this reference for browser workflows, local API clients, Project IO tools,
and tests that need the asset, archive, UI, or REST contract.

## Contents

- [Supported formats and limits](#supported-formats-and-limits)
- [Browser workflow](#browser-workflow)
- [Resource identity](#resource-identity)
- [Project state](#project-state)
- [Archive and XML persistence](#archive-and-xml-persistence)
- [REST API](#rest-api)
- [Configuration](#configuration)
- [Error handling](#error-handling)
- [Security rules](#security-rules)

## Supported formats and limits

| Asset kind | Extensions | Stored `contentType` | Notes |
| --- | --- | --- | --- |
| Model | `.glb`, `.gltf` | `model/gltf-binary`, `model/gltf+json` | `.glb` is preferred for self-contained binary models. `.gltf` must be self-contained or reference resources already available in the project archive. |
| Texture | `.png`, `.jpg`, `.jpeg`, `.webp` | `image/png`, `image/jpeg`, `image/webp` | Textures bind to the scene object's `surface` material target. |

The local REST import routes accept JSON base64 payloads and enforce a 25 MiB
decoded asset limit. Project IO archive limits still apply during save/load.

Unsupported extensions must be rejected before project state changes.

## Browser workflow

The Alice browser workflow is:

1. Open or create a project.
2. Import a model with the model import control.
3. Add or select a scene object that uses the imported model.
4. Import a texture image.
5. Select a scene object and apply the texture to its surface.
6. Save the project as an `.a3p` archive.
7. Reopen the archive and continue editing with the imported assets intact.

Stable selectors for browser tests:

| Selector | Purpose |
| --- | --- |
| `[data-testid="alice-import-model-input"]` | File input for `.gltf` and `.glb` model imports |
| `[data-testid="alice-import-texture-input"]` | File input for `.png`, `.jpg`, `.jpeg`, and `.webp` texture imports |
| `[data-testid="alice-create-shape-button"]` | Creates a shape that can receive a texture |
| `[data-testid="alice-scene-object-list"]` | Lists selectable scene objects |
| `[data-testid="alice-apply-texture-button"]` | Applies the selected texture to the selected object |
| `[data-testid="alice-save-project-button"]` | Saves the current project |
| `[data-testid="alice-open-project-input"]` | Opens a saved `.a3p` project |

The UI must render imported asset names as text and keep Alice selectors
prefixed with `alice-`.

## Resource identity

Imported assets have separate project IDs and archive paths.

| Identifier | Example | Purpose |
| --- | --- | --- |
| Model project resource ID | `project/models/moon-rover.glb` | Stored in Alice project state and referenced by scene objects |
| Model archive path | `resources/models/moon-rover.glb` | ZIP entry written inside `.a3p` archives |
| Texture project resource ID | `project/textures/checker.png` | Stored in surface material bindings |
| Texture archive path | `resources/textures/checker.png` | ZIP entry written inside `.a3p` archives |

The asset ID segment must come from the uploaded filename:

1. Use only the basename.
2. Reject path separators, traversal segments, null bytes, and control
   characters.
3. Match the extension case-insensitively and store it lowercased.
4. Lowercase the stem, replace runs outside `[a-z0-9]` with `-`, collapse
   repeated `-`, and trim leading or trailing `-`.
5. Reject the upload when the sanitized stem is empty.
6. Append `-2`, `-3`, and later suffixes before the extension when the generated
   ID already exists in the project.

Examples:

| Uploaded filename | Project resource ID |
| --- | --- |
| `Moon Rover.GLB` | `project/models/moon-rover.glb` |
| `Checker.PNG` | `project/textures/checker.png` |
| `checker.png` when that ID exists | `project/textures/checker-2.png` |

## Project state

`AliceProject` stores imported asset descriptors separately from binary bytes:

```typescript
interface AliceProject {
  version: string;
  projectName: string;
  sceneObjects: AliceObject[];
  methods: AliceMethod[];
  importedAssets?: ImportedProjectAsset[];
}

interface ImportedProjectAsset {
  id: string;
  kind: "model" | "texture";
  name: string;
  fileName: string;
  resourcePath: string;
  contentType: string;
  byteLength: number;
}
```

`importedAssets` must default to an empty array when absent, so older projects
still load.

Scene objects reference imported models and textures by project resource ID:

```typescript
interface AliceObject {
  name: string;
  typeName: string;
  resourceType: string;
  modelResourceId?: string;
  materialBindings?: MaterialBinding[];
}

interface MaterialBinding {
  target: "surface";
  textureResourceId: string;
}
```

Applying a texture must add or replace the one `surface` binding for the
selected object. Unsupported material targets return a validation error.

## Archive and XML persistence

Project IO stores imported bytes in the archive resource map:

```typescript
archive.resources.set("resources/models/moon-rover.glb", modelBytes);
archive.resources.set("resources/textures/checker.png", textureBytes);
```

`programType.xml` stores imported asset metadata and scene bindings:

```xml
<alice-project version="0.0.1" projectName="AssetWorkflow">
  <scene-objects>
    <scene-object name="moonRover"
                  typeName="SModel"
                  resourceType=""
                  modelResourceId="project/models/moon-rover.glb"/>
    <scene-object name="box" typeName="SBox" resourceType="">
      <material-bindings>
        <material-binding target="surface"
                          textureResourceId="project/textures/checker.png"/>
      </material-bindings>
    </scene-object>
  </scene-objects>
  <methods/>
  <imported-assets>
    <imported-asset id="project/models/moon-rover.glb"
                    kind="model"
                    name="Moon Rover"
                    fileName="moon-rover.glb"
                    resourcePath="resources/models/moon-rover.glb"
                    contentType="model/gltf-binary"
                    byteLength="18422"/>
    <imported-asset id="project/textures/checker.png"
                    kind="texture"
                    name="Checker"
                    fileName="checker.png"
                    resourcePath="resources/textures/checker.png"
                    contentType="image/png"
                    byteLength="4281"/>
  </imported-assets>
</alice-project>
```

When imported asset metadata or scene bindings change, save/export must write
XML from the current `archive.project` and keep the matching bytes in
`archive.resources`.

## REST API

The REST routes below use the same local authentication boundary as the rest of
the Alice API:

```bash
-H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
-H "Content-Type: application/json"
```

### Import a model

`POST /api/assets/import-model`

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

Response:

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

### Import a texture

`POST /api/assets/import-texture`

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

Response:

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

### Apply a texture to a scene object

`POST /api/scene/apply-texture`

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
| `textureResourceId` | `string` | yes | Imported texture project resource ID |
| `target` | `"surface"` | no | Material target; defaults to `"surface"` |

Response:

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

## Configuration

Imported model and texture assets must not add a product identity, package name,
environment variable, or API header. The runtime remains Alice / `alice-web`,
and mutating local API routes continue to use `X-Alice-Local-Api-Token`.

For large local validation runs, use the repository memory setting:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
npm run build:server
```

Project IO continues to enforce archive path rules and archive size limits
during save/load as documented in
[Project IO configuration](./project-io-configuration.md).

## Error handling

Errors return JSON with an `error` field.

| Status | Condition |
| --- | --- |
| `400` | Missing `fileName`, missing `contentBase64`, invalid base64, empty decoded bytes, unsafe filename, unsupported extension, empty sanitized asset stem, unknown imported asset ID, or unsupported material target |
| `401` | Missing or invalid `X-Alice-Local-Api-Token` when the server was started with `--api-token` |
| `404` | `objectName` does not match a scene object |
| `413` | Encoded request body exceeds the asset route limit |
| `500` | Unexpected server failure |

## Security rules

- Treat filenames, uploaded bytes, model IDs, texture IDs, object names, and
  material targets as untrusted input.
- Generate archive paths and project resource IDs server-side.
- Reject path separators, traversal segments, null bytes, control characters,
  unsupported extensions, empty files, and oversized uploads.
- Confirm model IDs, texture IDs, and scene objects belong to the active project
  before mutating state.
- Do not log API tokens, raw upload contents, full local paths, or private
  project data.
- Render imported names as text in the browser.

## Related documentation

- [Import a model and apply a custom texture](./tutorial-import-model-and-apply-texture.md)
- [API reference](./api-reference.md)
- [Server API](./server-api.md)
- [Project IO](./project-io.md)
- [Open-asset pipeline](./open-asset-pipeline.md)
