# Project IO usage guide

Use this guide for common `.a3p` project IO tasks.

For runnable browser exports, use the project export API. Project IO owns `.a3p`
archive read/write; project export owns `alice-web` ZIP packages, standalone
player HTML, share metadata, preview images, validation evidence, and package
hashing.

## Read a project in the browser

```typescript
import { readProject } from "./src/project-io.js";

const input = document.querySelector<HTMLInputElement>("#project-file");

input?.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file) return;

  const archive = await readProject(await file.arrayBuffer());
  console.log(archive.project.projectName);
  console.log(archive.resourceEntries.map((entry) => entry.path));
});
```

## Read and write a project in Node.js

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { readProject, writeProject } from "./src/project-io.js";

const sourceBytes = await readFile("lessons/first-world.a3p");
const archive = await readProject(sourceBytes);

archive.project.projectName = "First World - Edited";

const outputBytes = await writeProject(archive);
await writeFile("lessons/first-world-edited.a3p", outputBytes);
```

## Preserve original XML pass-through

`readProject()` stores the migrated project XML in `archive.resources` under
the internal `__original_xml__` marker. That marker includes the original XML
entry name, so `writeProject()` can write back `programType.xml` or legacy
`program.xml` without guessing.

Keep `__original_xml__` in the resource map unless you intentionally want
Project IO to fall back to explicit XML resources or generated XML.
Project IO filters this marker from ZIP writes; it is not an archive entry.

```typescript
const archive = await readProject(projectBytes);

// Safe: keep XML pass-through while changing normal project state.
archive.project.projectName = "Preserved XML Example";

const output = await writeProject(archive);
```

If `__original_xml__` is removed, `writeProject()` falls back to these XML
sources in order:

1. `archive.resources.get("programType.xml")`
2. `archive.resources.get("program.xml")`
3. Generated XML from `archive.project`

## Add or replace a resource

Resource paths are archive-relative POSIX paths. Use forward slashes and avoid
absolute paths.

```typescript
import { readFile } from "node:fs/promises";
import { readProject, writeProject } from "./src/project-io.js";

const archive = await readProject(projectBytes);
const textureBytes = await readFile("assets/textures/checker.png");

archive.resources.set(
  "resources/textures/checker.png",
  new Uint8Array(textureBytes),
);

const output = await writeProject(archive);
```

Project IO rejects unsafe paths such as:

```typescript
archive.resources.set("../outside.png", new Uint8Array());
archive.resources.set("/absolute/path.png", new Uint8Array());
archive.resources.set("resources\\texture.png", new Uint8Array());
archive.resources.set("C:/temp/texture.png", new Uint8Array());
archive.resources.set("//server/share/texture.png", new Uint8Array());
```

Rejected paths throw `ProjectIoError` with code `unsafe-path`.

## Add imported model and texture assets

Issue #221 imported assets need both project metadata and archive bytes. Store
scene-facing IDs under `project/models/` or `project/textures/`, and store bytes
under the matching `resources/` archive path.

```typescript
import { readFile } from "node:fs/promises";
import { readProject, writeProject } from "./src/project-io.js";

const archive = await readProject(projectBytes);

const modelBytes = await readFile("assets/models/moon-rover.glb");
const textureBytes = await readFile("assets/textures/checker.png");

archive.project.importedAssets = [
  ...(archive.project.importedAssets ?? []),
  {
    id: "project/models/moon-rover.glb",
    kind: "model",
    name: "Moon Rover",
    fileName: "moon-rover.glb",
    resourcePath: "resources/models/moon-rover.glb",
    contentType: "model/gltf-binary",
    byteLength: modelBytes.byteLength,
  },
  {
    id: "project/textures/checker.png",
    kind: "texture",
    name: "Checker",
    fileName: "checker.png",
    resourcePath: "resources/textures/checker.png",
    contentType: "image/png",
    byteLength: textureBytes.byteLength,
  },
];

archive.resources.set(
  "resources/models/moon-rover.glb",
  new Uint8Array(modelBytes),
);
archive.resources.set(
  "resources/textures/checker.png",
  new Uint8Array(textureBytes),
);

const box = archive.project.sceneObjects.find((object) => object.name === "box");
if (box) {
  box.materialBindings = [
    {
      target: "surface",
      textureResourceId: "project/textures/checker.png",
    },
  ];
}

const output = await writeProject(archive);
```

See [[Imported model and texture assets](./imported-models-and-textures.md)
for the full asset descriptor and scene binding contract.

## Preserve project audio

Project audio uses normal Project IO resource persistence. Audio bytes are stored
under `resources/audio/`, and audio metadata is stored in `manifest.json` under
the `aliceAudio` key.

```typescript
import { readProject, writeProject } from "./src/project-io.js";
import { ProjectAudio } from "./src/index.js";

const archive = await readProject(projectBytes);
const audioState = ProjectAudio.applyAudioManifest(archive.manifest);

console.log(audioState.assets.map((asset) => asset.resourcePath));
console.log(audioState.backgroundMusic);
console.log(audioState.cues);

const output = await writeProject({
  ...archive,
  manifest: ProjectAudio.mergeAudioManifest(archive.manifest, audioState),
});
```

Use the server audio routes for normal user workflows. Use Project IO directly
when you are building import/export tools that need to inspect or preserve audio
state without starting the local Alice server.

## Replace a thumbnail

`archive.thumbnail` maps to root `thumbnail.png`.

```typescript
import { readFile } from "node:fs/promises";
import { readProject, writeProject } from "./src/project-io.js";

const archive = await readProject(projectBytes);
const thumbnail = await readFile("assets/thumbnails/preview.png");

archive.thumbnail = new Uint8Array(thumbnail);

const output = await writeProject(archive);
```

Project IO stores thumbnail bytes as provided. It does not validate that the
bytes are a PNG.

## Generate a thumbnail while saving

Pass `generateThumbnailFromScene: true` to render a thumbnail only when
`archive.thumbnail` is `null`.

```typescript
import { writeProject } from "./src/project-io.js";

archive.thumbnail = null;

const output = await writeProject(archive, {
  generateThumbnailFromScene: true,
});

console.log(archive.thumbnail?.byteLength);
```

When generation succeeds, `writeProject()` mutates `archive.thumbnail` to the
generated PNG bytes.

## Handle Project IO errors

```typescript
import { ProjectIoError, readProject } from "./src/project-io.js";

try {
  await readProject(projectBytes);
} catch (error) {
  if (!(error instanceof ProjectIoError)) {
    throw error;
  }

  switch (error.code) {
    case "missing-program-xml":
      console.error("This archive does not contain Alice project XML.");
      break;
    case "invalid-manifest":
      console.error("The project manifest is not valid JSON.");
      break;
    case "unsafe-path":
      console.error("The archive contains an unsafe path.");
      break;
    case "zip-bomb":
      console.error("The archive is too large to extract safely.");
      break;
    default:
      console.error(error.message);
  }
}
```

## Use Project IO through `ProjectManager`

`ProjectManager` uses `readProject()` and `writeProject()` for open and save
workflows. Use it when you want lifecycle state such as dirty tracking, recent
files, backups, and revert.

```typescript
import { ProjectManager } from "./src/project-manager.js";

const manager = new ProjectManager();

await manager.open(projectBytes, "lesson.a3p");
manager.currentArchive!.project.projectName = "Lesson - Edited";
manager.markDirty();

const savedBytes = await manager.save();
```

Use `readProject()` and `writeProject()` directly when you only need in-memory
archive conversion.

## Inspect migration results

```typescript
const archive = await readProject(projectBytes);

console.log(archive.versionInfo.detectedAliceVersion);
console.log(archive.versionInfo.versionSource);

for (const step of archive.versionInfo.migrationSteps) {
  console.log(step);
}
```

`readProject()` synchronizes one manifest version field after migration. It uses
this precedence: `aliceVersion`, `projectVersion`, version-like `version`, then
`createdWith.version`. If a higher-priority field is updated, lower-priority
version fields are left unchanged.

## Export, play, share, and validate a web package

Use the REST API when a project needs to become a runnable browser package. This
flow starts with the active server project and ends with a ZIP that can be
extracted and opened locally.

Start the server:

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Create an Alice project:

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"templateId":"snow","projectName":"WinterStory"}'
```

The web-package feature contract exports the runnable package:

```bash
curl -X POST http://127.0.0.1:3000/api/project/export/web-package \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Winter Story","description":"A snow scene with a bunny."}' \
  > export.json
```

Write and open the ZIP:

```bash
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("export.json", "utf8")); fs.writeFileSync(d.package.filename, Buffer.from(d.package.base64, "base64"));'
PACKAGE_FILE="$(node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("export.json", "utf8")); process.stdout.write(d.package.filename);')"
PACKAGE_DIR="${PACKAGE_FILE%.zip}"
rm -rf "$PACKAGE_DIR"
unzip "$PACKAGE_FILE" -d "$PACKAGE_DIR"
xdg-open "$PACKAGE_DIR/index.html"
```

The extracted package has this structure:

```text
WinterStory.alice-web/
|-- index.html
|-- manifest.json
|-- share.json
|-- preview.png
|-- project/
|   `-- project.json
`-- validation.json
```

`index.html` is self-contained. It exposes `window.AlicePlayer`, embeds project
data safely, includes player controls, and uses public runtime identity
`alice-web-player`.

Generate share metadata from the exported package:

```bash
node -e 'const fs=require("fs"); const d=JSON.parse(fs.readFileSync("export.json", "utf8")); fs.writeFileSync("share-request.json", JSON.stringify({ packageBase64: d.package.base64, title: "Winter Story" })); fs.writeFileSync("validate-request.json", JSON.stringify({ packageBase64: d.package.base64 }));'

curl -X POST http://127.0.0.1:3000/api/project/share \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @share-request.json \
  > share.json
```

Validate the package:

```bash
curl -X POST http://127.0.0.1:3000/api/project/validate-web-package \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  --data @validate-request.json
```

Successful validation reports:

```json
{
  "schema_version": "alice-web.validate-web-package-result/v1",
  "status": "valid",
  "valid": true,
  "runtime": "alice-web",
  "manifest": {
    "schemaVersion": "alice-web.package/v1",
    "runtimeIdentity": "alice-web-player",
    "entrypoint": "index.html"
  },
  "errors": []
}
```

Use the package SHA-256 digest from the export or validation response as the
integrity value when storing or publishing the ZIP.

Last updated for the refactored Project IO facade, internal module split, and
runnable `alice-web` export/share workflow.
