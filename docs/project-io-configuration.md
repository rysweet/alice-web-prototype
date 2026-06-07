# Project IO configuration

Project IO is intentionally configuration-light. It reads and writes `.a3p`
archives from memory and does not require a filesystem path, server setting, or
browser-specific configuration.

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
| `__original_xml__` | Internal resource-map marker used by Project IO, not a ZIP entry and not a normal resource callers should create manually |

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

## Development memory setting

Large archive and renderer tests can use a larger Node.js heap:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run build
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
```

This setting is for local validation. Project IO itself does not read
`NODE_OPTIONS`.

Last updated for the refactored Project IO facade and internal module split.
