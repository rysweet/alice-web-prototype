# Imported model and texture assets

This document describes the issue #221 contract for importing GLB/glTF
models, importing image textures, binding them to scene objects, and preserving
them through Project IO.
Use this reference for tools, tests, or integrations that need the
project-state, archive, UI, or REST API contract for custom assets.

## Supported formats

| Asset kind | Extensions | Content type | Notes |
| --- | --- | --- | --- |
| Model | `.glb`, `.gltf` | `model/gltf-binary`, `model/gltf+json` | `.glb` is preferred for self-contained binary models. `.gltf` must be self-contained or reference resources that resolve from the project archive. |
| Texture | `.png`, `.jpg`, `.jpeg`, `.webp` | `image/png`, `image/jpeg`, `image/webp` | Textures bind only to the object's `"surface"` material target. |

Unsupported extensions are rejected before project state changes.

## Resource identity

Imported assets have two stable identifiers:

| Identifier | Example | Purpose |
| --- | --- | --- |
| Project resource ID | `project/models/moon-rover.glb` | Stored in Alice project state and referenced by scene objects |
| Archive path | `resources/models/moon-rover.glb` | ZIP entry written inside `.a3p` archives |
| Texture resource ID | `project/textures/checker.png` | Stored in material bindings |
| Texture archive path | `resources/textures/checker.png` | ZIP entry for texture bytes |

The `<assetId>` segment is derived from the uploaded filename:

1. Use the basename only; reject names containing path separators, null bytes, or
   traversal segments.
2. Match the extension case-insensitively, then store it lowercased.
3. Lowercase the stem, replace runs outside `[a-z0-9]` with `-`, collapse
   repeated `-`, and trim leading or trailing `-`.
4. Reject the upload if the sanitized stem is empty.
5. If the project already contains the generated ID or archive resource path,
   append `-2`, `-3`, and so on before the extension. This protects older
   projects that have resource bytes but no `importedAssets` descriptor yet.

Examples:

| Uploaded filename | Project resource ID |
| --- | --- |
| `Moon Rover.GLB` | `project/models/moon-rover.glb` |
| `Checker.PNG` | `project/textures/checker.png` |
| `checker.png` when that ID exists | `project/textures/checker-2.png` |

## Project state

`AliceProject` stores imported asset descriptors separately from
binary resource bytes:

```typescript
interface AliceProject {
  version: string;
  projectName: string;
  sceneObjects: AliceObject[];
  methods: AliceMethod[];
  importedAssets?: ImportedProjectAsset[];
}

interface ImportedProjectAsset {
  id: string;           // "project/models/moon-rover.glb"
  kind: "model" | "texture";
  name: string;         // "Moon Rover"
  fileName: string;     // "moon-rover.glb"
  resourcePath: string; // "resources/models/moon-rover.glb"
  contentType: string;
  byteLength: number;
}
```

`importedAssets` defaults to an empty array when absent so older projects still
load.

Scene objects bind imported models and textures by project
resource ID:

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
  textureResourceId: string; // "project/textures/checker.png"
}
```

Applying a texture adds or replaces the one `"surface"` binding for the selected
object. Unsupported material targets return a validation error.

## Archive and XML persistence

Project IO stores binary bytes in the archive resource map. Use
`createImportedProjectAsset(upload, importedAssets, archive.resources.keys())`
or equivalent server/workflow helpers so descriptor-less archive resources are
included in filename dedupe:

```typescript
const model = createImportedProjectAsset(
  { kind: "model", fileName: "moon-rover.glb", bytes: modelBytes },
  archive.project.importedAssets ?? [],
  archive.resources.keys(),
);
archive.project.importedAssets = [...(archive.project.importedAssets ?? []), model.asset];
archive.resources.set(model.archivePath, model.resourceBytes);
```

`programType.xml` carries the project metadata and scene bindings:

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
    <asset id="project/models/moon-rover.glb"
           kind="model"
           name="Moon Rover"
           fileName="moon-rover.glb"
           resourcePath="resources/models/moon-rover.glb"
           contentType="model/gltf-binary"
           byteLength="18422"/>
    <asset id="project/textures/checker.png"
           kind="texture"
           name="Checker"
           fileName="checker.png"
           resourcePath="resources/textures/checker.png"
           contentType="image/png"
           byteLength="4281"/>
  </imported-assets>
</alice-project>
```

When imported asset metadata or scene bindings change, save/export must write XML
that reflects the changed `archive.project`; it must not preserve stale
`__original_xml__` content that omits the new metadata.

## Server ownership model

`ServerState` has one source of truth for active project
resources:

| Data | Owner | Notes |
| --- | --- | --- |
| Asset descriptors | Active `AliceProject.importedAssets` | Metadata only; no bytes |
| Scene bindings | Active `AliceObject.modelResourceId` and `materialBindings` | References project resource IDs |
| Resource bytes | Active archive resource map keyed by `resources/...` paths | Seeded from `readProject()`, updated by imports, passed to `writeProject()` |

Imported bytes and parsed archive resources use the same map. The server should
not keep a second imported-byte map that can drift from loaded archive resources.

## Browser workflow

The Alice UI exposes a focused workflow instead of a broad material
editor:

1. Import a model with the model import control.
2. Create or select a shape in the scene.
3. Import a texture image.
4. Apply the texture to the selected shape's surface.
5. Save, reload, export, or import the project.

Stable selectors for E2E tests:

| Selector | Purpose |
| --- | --- |
| `[data-testid="alice-import-model-input"]` | File input for `.gltf` and `.glb` model imports |
| `[data-testid="alice-import-texture-input"]` | File input for `.png`, `.jpg`, `.jpeg`, and `.webp` texture imports |
| `[data-testid="alice-create-shape-button"]` | Creates a shape that can receive a texture |
| `[data-testid="alice-scene-object-list"]` | Lists selectable scene objects |
| `[data-testid="alice-apply-texture-button"]` | Applies the selected texture to the selected object |
| `[data-testid="alice-save-project-button"]` | Saves the current project |
| `[data-testid="alice-open-project-input"]` | Opens a saved `.a3p` project |

## REST API

The local server exposes JSON base64 upload routes for issue #221.
Asset import endpoints need a body limit larger than the current general JSON
limit; the route limit is 25 MiB for
`/api/assets/import-model` and `/api/assets/import-texture`. Project IO's archive
size limit applies when reading `.a3p` archives, not as an additional decoded
payload limit on these upload routes.

Mutating requests use the same local authentication boundary as the rest of the
API:

```bash
-H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
-H "Content-Type: application/json"
```

### Import a model

```bash
MODEL_BASE64="$(base64 -w0 assets/models/moon-rover.glb)"

curl -X POST http://127.0.0.1:3000/api/assets/import-model \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"moon-rover.glb\",\"displayName\":\"Moon Rover\",\"contentBase64\":\"$MODEL_BASE64\"}"
```

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

```bash
TEXTURE_BASE64="$(base64 -w0 assets/textures/checker.png)"

curl -X POST http://127.0.0.1:3000/api/assets/import-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"checker.png\",\"displayName\":\"Checker\",\"contentBase64\":\"$TEXTURE_BASE64\"}"
```

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

### Apply a texture to a shape

```bash
curl -X POST http://127.0.0.1:3000/api/scene/apply-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"objectName":"box","textureResourceId":"project/textures/checker.png","target":"surface"}'
```

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

### Validation errors

| Status | Condition |
| --- | --- |
| `400` | Missing `fileName` or `contentBase64` |
| `400` | Filename contains a path separator, traversal segment, null byte, or unsupported extension |
| `400` | Sanitized asset stem is empty |
| `400` | `contentBase64` is invalid or decodes to empty bytes |
| `400` | Texture route receives a non-texture extension, or model route receives a non-model extension |
| `400` | `textureResourceId` or `modelResourceId` does not exist in `importedAssets` |
| `400` | `target` is not `"surface"` |
| `404` | `objectName` does not match a scene object |
| `413` | Encoded request body exceeds the asset-route body limit |

## Configuration

No new product identity, package name, environment variable, or API header is
introduced for imported assets. The runtime remains Alice / `alice-web`, and
mutating local routes continue to use `X-Alice-Local-Api-Token`.

Large local validation runs can use the repository memory preference:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
npm run build:server
```

Project IO continues to enforce the archive size limit and path-security rules
documented in [Project IO configuration](./project-io-configuration.md).

## Related documentation

- [[Import a model and apply a custom texture](./tutorial-import-model-and-apply-texture.md)
- [Open-asset pipeline](./open-asset-pipeline.md)
- [Project IO](./project-io.md)
- [Project IO API reference](./project-io-api.md)
- [API reference](./api-reference.md)
