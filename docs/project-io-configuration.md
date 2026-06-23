# Project IO configuration

Project IO is intentionally configuration-light. It reads and writes `.a3p`
archives from memory and does not require a filesystem path, server setting, or
browser-specific configuration.

Runnable web package export uses the same local server configuration as the
other project routes. It does not add a separate config file or repository
nickname identity.

## Runtime options

The only public write option is thumbnail generation.

```typescript
import { writeProject } from "./src/project-io.js";

const bytes = await writeProject(archive, {
  generateThumbnailFromScene: true,
});
```

| Option | Default | Effect |
| --- | --- | --- |
| `generateThumbnailFromScene` | `false` | Renders `thumbnail.png` from the project scene when `archive.thumbnail` is `null` |

If `archive.thumbnail` already has bytes, Project IO writes those bytes and does
not render a replacement.

## Archive entry conventions

| Entry | Convention |
| --- | --- |
| `programType.xml` | Preferred Alice project XML entry |
| `program.xml` | Legacy XML entry, preserved when the input archive uses it |
| `manifest.json` | Optional JSON manifest at the ZIP root |
| `version.txt` | Alice project version text at the ZIP root |
| `thumbnail.png` | Optional thumbnail PNG bytes at the ZIP root |
| `resources/...` | Typical location for project resources, though Project IO accepts any safe non-special archive-relative path |
| `resources/models/<assetId>` | [PLANNED] Imported `.gltf` and `.glb` model bytes for issue #221 |
| `resources/textures/<assetId>` | [PLANNED] Imported `.png`, `.jpg`, `.jpeg`, and `.webp` texture bytes for issue #221 |
| `resources/audio/...` | Audio assets registered through Alice project audio workflows |
| `__original_xml__` | Internal resource-map marker used by Project IO, not a ZIP entry and not a normal resource callers should create manually |

## Runnable web package conventions

The `POST /api/project/export/web-package` feature contract writes an
`alice-web` ZIP package. The package is separate from `.a3p` Project IO
archives and uses these required entries:

| Entry | Convention |
| --- | --- |
| `index.html` | Self-contained player document, playable after extraction |
| `manifest.json` | Package manifest with `schemaVersion: "alice-web.package/v1"` |
| `share.json` | Share metadata with `schemaVersion: "alice-web.share/v1"` |
| `preview.png` | PNG preview image referenced by manifest and share metadata |
| `project/project.json` | Serialized project payload for the player |
| `validation.json` | Validation evidence with `schemaVersion: "alice-web.validation/v1"` |

The player runtime identity is `alice-web-player`. The package, manifest, share
metadata, validation evidence, and player document use Alice / `alice-web`
identity. Repository nickname identity is not valid in generated packages.

API response envelopes use snake_case `schema_version`. JSON files inside the
exported ZIP use camelCase `schemaVersion`.

## Share URL policy

`canonicalUrl` is optional for export and share requests. When present, it must
be a valid `http` or `https` URL without embedded credentials.

Rejected examples:

```text
javascript:alert(1)
data:text/html;base64,PHNjcmlwdD4=
file:///tmp/project/index.html
https://user:pass@example.edu/alice/project
```

The server rejects unsafe URLs instead of rewriting them.

## Path security policy

Project IO validates every archive-relative path before reading or writing.

Accepted paths use relative POSIX separators:

```text
resources/models/bunny.obj
resources/textures/fur.png
audio/intro.wav
```

Rejected paths include:

```text
../secret.txt
resources/../secret.txt
/tmp/project.a3p
C:/Users/Alice/project.a3p
\\server\share\project.a3p
resources\texture.png
resources//texture.png
```

Unsafe paths throw `ProjectIoError` with code `unsafe-path`. Project IO does not
normalize unsafe input into safe paths and does not silently skip unsafe
entries.

## Archive size limit

Project IO enforces a 256 MB extracted-size limit while reading archives. The
limit protects callers from ZIP bombs and unexpectedly large projects.

Archives that exceed the limit throw `ProjectIoError` with code `zip-bomb`.

Package validation rejects malformed ZIP data, traversal paths, duplicate
required files, missing required files, unsafe package filenames, and mismatched
share/package links with explicit validation errors.

## Manifest version synchronization

When a project is migrated, Project IO updates the first recognized manifest
version field to the detected migrated Alice version. Precedence is:

- `aliceVersion`
- `projectVersion`
- version-like `version`
- `createdWith.version`

Other manifest fields are preserved.
Lower-priority version fields are also preserved once a higher-priority field is
updated.

## XML pass-through policy

Project IO preserves XML entry identity and migrated XML text at the archive
boundary:

- Reading `programType.xml` writes back `programType.xml`.
- Reading legacy `program.xml` writes back `program.xml`.
- The resource-map marker `__original_xml__` stores both the XML text and the
  original XML entry name.
- If pass-through XML is unavailable, Project IO can write explicit
  `programType.xml` or `program.xml` resources.
- If no XML source exists, Project IO generates XML from `archive.project`.

Project IO does not promise byte-for-byte preservation of the original XML file.
Migration and serialization can change formatting or generated content.

## Thumbnail generation

`generateThumbnailFromProjectScene()` renders 640 x 480 PNG bytes using the
scene renderer. It returns `null` only when the project has no scene objects.
Renderer or canvas failures surface to the caller.

`writeProject()` calls this renderer only when `generateThumbnailFromScene` is
`true` and `archive.thumbnail` is `null`. If `archive.thumbnail` already has
bytes, those bytes are written unchanged.

## Resource filtering

Project IO treats these paths as special and does not expose them as normal
`resourceEntries`:

- `programType.xml`
- `program.xml`
- `manifest.json`
- `thumbnail.png`
- `version.txt`

All other safe non-directory entries are extracted as resources and classified
as `image`, `audio`, `model`, or `other`.

[PLANNED] Issue #221 imported project assets use fixed project-to-archive path
mapping:

| Project state value | Archive resource |
| --- | --- |
| `project/models/<assetId>` | `resources/models/<assetId>` |
| `project/textures/<assetId>` | `resources/textures/<assetId>` |

Project IO must preserve both the project state references and the archive
resource bytes through save/load/export/import when issue #221 lands.

## Audio manifest policy

Project audio metadata is stored in `manifest.json` under the `aliceAudio` key.
Project IO preserves that manifest data like any other manifest field. The Alice
server reads `aliceAudio` during project launch and writes the current audio
state during project save.

```json
{
  "aliceAudio": {
    "version": 1,
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
}
```

Every `assetId` referenced by `backgroundMusic` or `cues` must exist in
`aliceAudio.assets`. Launch validates manifest shape and those in-manifest
references. It does not check that every `asset.resourcePath` has a matching
archive resource entry; playback or import tools should report that as a clear
resource load error.

## Development memory setting

Large archive and renderer tests can use a larger Node.js heap:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run build
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
```

This setting is for local validation. Project IO itself does not read
`NODE_OPTIONS`.

Last updated for the refactored Project IO facade, internal module split, and
runnable `alice-web` export/share workflow.
