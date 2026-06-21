# Import a model and apply a custom texture

This tutorial shows the imported model and texture asset workflow in the
browser, REST API, and Project IO.

## What you will build

A project containing:

1. An imported model stored as `project/models/moon-rover.glb`.
2. A shape with a custom surface texture stored as `project/textures/checker.png`.
3. A saved `.a3p` archive containing the matching bytes under
   `resources/models/` and `resources/textures/`.

## Prerequisites

Install dependencies and start Alice from a build that includes the imported
asset implementation:

```bash
npm install
npm run dev
```

Prepare these files:

```text
assets/models/moon-rover.glb
assets/textures/checker.png
```

Use `.glb` for self-contained model assets. Use `.gltf` only when the file is
self-contained or its referenced data is available from the project archive.

## Import the model in the browser

1. Open Alice in the browser.
2. Use the model import control to choose `assets/models/moon-rover.glb`.
3. Confirm the imported asset appears as `Moon Rover`.

The project records the asset descriptor:

```json
{
  "id": "project/models/moon-rover.glb",
  "kind": "model",
  "name": "Moon Rover",
  "fileName": "moon-rover.glb",
  "resourcePath": "resources/models/moon-rover.glb",
  "contentType": "model/gltf-binary",
  "byteLength": 18422
}
```

The archive resource map stores the bytes at:

```text
resources/models/moon-rover.glb
```

## Create a shape and apply a texture

1. Create a box shape.
2. Select the box in the scene object list.
3. Use the texture import control to choose `assets/textures/checker.png`.
4. Apply `Checker` to the selected object's surface.

The box stores the texture binding on the scene object:

```json
{
  "name": "box",
  "typeName": "SBox",
  "materialBindings": [
    {
      "target": "surface",
      "textureResourceId": "project/textures/checker.png"
    }
  ]
}
```

The archive resource map stores the texture bytes at:

```text
resources/textures/checker.png
```

## Save and reopen the project

Save the project as `asset-workflow.a3p`, then open that file again in Alice.

After reopening:

- `Moon Rover` is still listed as an imported model asset.
- `Checker` is still listed as an imported texture asset.
- The box still has a surface material binding to
  `project/textures/checker.png`.

## Run the same workflow through the REST API

Start the local API server:

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Create a blank project and add a box:

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"templateId":"blank","projectName":"AssetWorkflow"}'

curl -X POST http://127.0.0.1:3000/api/scene/add-object \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"className":"org.lgna.story.SBox","name":"box"}'
```

Import the model and texture:

```bash
MODEL_BASE64="$(base64 -w0 assets/models/moon-rover.glb)"
TEXTURE_BASE64="$(base64 -w0 assets/textures/checker.png)"

curl -X POST http://127.0.0.1:3000/api/assets/import-model \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"moon-rover.glb\",\"displayName\":\"Moon Rover\",\"contentBase64\":\"$MODEL_BASE64\"}"

curl -X POST http://127.0.0.1:3000/api/assets/import-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"fileName\":\"checker.png\",\"displayName\":\"Checker\",\"contentBase64\":\"$TEXTURE_BASE64\"}"
```

Apply the texture and save:

```bash
curl -X POST http://127.0.0.1:3000/api/scene/apply-texture \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"objectName":"box","textureResourceId":"project/textures/checker.png","target":"surface"}'

curl -X POST http://127.0.0.1:3000/api/project/save \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"saveSelector":"asset-workflow"}'
```

The saved archive contains:

```text
programType.xml
manifest.json
version.txt
resources/models/moon-rover.glb
resources/textures/checker.png
```

## Verify with Project IO

Create `scripts/inspect-imported-assets.ts`:

```typescript
import { readFile } from "node:fs/promises";
import { readProject } from "../src/project-io.js";

const bytes = await readFile("evidence/project-save/saved-project.a3p");
const archive = await readProject(bytes);

console.log(archive.project.importedAssets?.map((asset) => asset.id));
console.log(archive.resources.has("resources/models/moon-rover.glb"));
console.log(archive.resources.has("resources/textures/checker.png"));

const box = archive.project.sceneObjects.find((object) => object.name === "box");
console.log(box?.materialBindings);
```

Run it:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npx --package tsx tsx scripts/inspect-imported-assets.ts
```

Expected output shape:

```text
[
  "project/models/moon-rover.glb",
  "project/textures/checker.png"
]
true
true
[
  { target: "surface", textureResourceId: "project/textures/checker.png" }
]
```

## What to remember

- Use project resource IDs (`project/models/...`, `project/textures/...`) in
  scene state.
- Use archive paths (`resources/models/...`, `resources/textures/...`) for
  binary bytes in `.a3p` files.
- Texture binding uses one `surface` target per scene object.
- The runtime, package, and API identity remain Alice / `alice-web`.

## Related documentation

- [Imported model and texture assets](./imported-models-and-textures.md)
- [API reference](./api-reference.md)
- [Project IO usage guide](./project-io-usage.md)
- [Open-asset pipeline](./open-asset-pipeline.md)
