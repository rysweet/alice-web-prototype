# Project IO API reference

This reference covers the public Project IO API exported from
`src/project-io.ts`.

Internal files under `src/project-io/` are implementation details. They are
documented here only to explain ownership; callers should import from the
facade.

## Import

```typescript
import {
  ProjectIoError,
  generateThumbnailFromProjectScene,
  readProject,
  writeProject,
  type AliceProjectArchive,
  type ProjectIoErrorCode,
  type ProjectResourceDescriptor,
  type WriteProjectOptions,
} from "./src/project-io.js";
```

## `readProject(data)`

```typescript
async function readProject(
  data: ArrayBuffer | Uint8Array,
): Promise<AliceProjectArchive>;
```

Reads a complete Alice `.a3p` archive from memory.

`readProject()` performs these steps:

1. Loads the input as a ZIP archive.
2. Rejects unsafe archive entry paths.
3. Reads `manifest.json` when present.
4. Reads `version.txt` when present.
5. Reads `programType.xml`, or legacy `program.xml` when that is the XML entry.
6. Detects the Alice project version from `version.txt`, `manifest.json`, XML,
   or the current default.
7. Applies migration rules through `project-migration.ts`.
8. Synchronizes the first recognized manifest version field with the migrated
   project version.
9. Parses the migrated XML into an `AliceProject`.
10. Extracts `thumbnail.png` when present.
11. Extracts non-special resource entries into `resources` and
    `resourceEntries`.
12. Stores the migrated XML text in `resources` under the internal
    `__original_xml__` marker, including the original XML entry name.

### Parameters

| Parameter | Type | Meaning |
| --- | --- | --- |
| `data` | `ArrayBuffer \| Uint8Array` | Raw `.a3p` file bytes |

### Returns

`Promise<AliceProjectArchive>`

### Errors

| Code | Condition |
| --- | --- |
| `corrupted-archive` | Input is not a readable ZIP archive, an entry cannot be read, or archive structure is malformed |
| `invalid-manifest` | `manifest.json` exists but is not valid JSON |
| `missing-program-xml` | Neither `programType.xml` nor legacy `program.xml` exists |
| `unsafe-path` | An archive entry uses traversal, an absolute path, a Windows drive path, a UNC path, backslashes, empty segments, or malformed separators |
| `xml-parse` | Project XML exists but cannot be parsed into an `AliceProject` |
| `zip-bomb` | Extracted content exceeds the configured Project IO archive size limit |

## `writeProject(archive, options)`

```typescript
async function writeProject(
  archive: AliceProjectArchive,
  options?: WriteProjectOptions,
): Promise<Uint8Array>;
```

Serializes an `AliceProjectArchive` to `.a3p` ZIP bytes.

`writeProject()` performs these steps:

1. Rejects unsafe resource paths before writing.
2. Chooses the XML source in this order:
   `__original_xml__`, explicit `programType.xml`, explicit `program.xml`,
   generated XML from `archive.project`.
3. Preserves the XML entry name stored by `readProject()`.
4. Writes `version.txt` from `archive.project.version`.
5. Writes `manifest.json` when `archive.manifest` is not `null`.
6. Writes `thumbnail.png` when `archive.thumbnail` exists, or when thumbnail
   generation is enabled and a scene thumbnail can be rendered.
7. Writes non-special entries from `archive.resources`.
8. Returns the archive as a `Uint8Array`.

### Parameters

| Parameter | Type | Meaning |
| --- | --- | --- |
| `archive` | `AliceProjectArchive` | Parsed project archive to serialize |
| `options` | `WriteProjectOptions` | Optional write behavior |

### Returns

`Promise<Uint8Array>`

### Errors

`writeProject()` throws `ProjectIoError` with code `unsafe-path` for rejected
resource paths. ZIP serialization failures and rendering errors from thumbnail
generation are surfaced to the caller; callers should not assume every write
failure is wrapped as `ProjectIoError`.

## `generateThumbnailFromProjectScene(project)`

```typescript
async function generateThumbnailFromProjectScene(
  project: AliceProject,
): Promise<Uint8Array | null>;
```

Renders the project scene to a PNG thumbnail.

The function returns `null` when the project has no scene objects. Otherwise it
returns 640 x 480 PNG bytes produced by the scene renderer. The renderer
dependencies must be available in the current runtime. `writeProject()` uses this
function when `generateThumbnailFromScene` is enabled and `archive.thumbnail` is
`null`; renderer failures are not converted to `null`.

## Types

### `AliceProjectArchive`

```typescript
interface AliceProjectArchive {
  project: AliceProject;
  manifest: Record<string, unknown> | null;
  resources: Map<string, Uint8Array>;
  resourceEntries: ProjectResourceDescriptor[];
  thumbnail: Uint8Array | null;
  versionInfo: ProjectVersionInfo;
}
```

| Field | Meaning |
| --- | --- |
| `project` | Parsed Alice project model |
| `manifest` | Parsed root `manifest.json`, or `null` when absent |
| `resources` | Archive resources keyed by archive-relative path, plus the internal non-ZIP `__original_xml__` marker when XML pass-through is available |
| `resourceEntries` | Resource descriptors for extracted non-special resources |
| `thumbnail` | Raw `thumbnail.png` bytes, or `null` when absent |
| `versionInfo` | Detected version source, migrated version, and migration steps |

### `ProjectResourceDescriptor`

```typescript
interface ProjectResourceDescriptor {
  path: string;
  kind: ProjectResourceKind;
  size: number;
}
```

| Field | Meaning |
| --- | --- |
| `path` | Archive-relative path, such as `resources/textures/skin.png` |
| `kind` | `image`, `audio`, `model`, or `other` |
| `size` | Extracted byte length |

Issue #221 imported project assets use these resource paths:

| Project resource ID | Archive resource path |
| --- | --- |
| `project/models/<assetId>` | `resources/models/<assetId>` |
| `project/textures/<assetId>` | `resources/textures/<assetId>` |

The project resource ID will be stored in `AliceProject.importedAssets`,
`AliceObject.modelResourceId`, or `AliceObject.materialBindings`. The archive
resource path is the key used in `AliceProjectArchive.resources`.

### `WriteProjectOptions`

```typescript
interface WriteProjectOptions {
  generateThumbnailFromScene?: boolean;
}
```

| Option | Default | Meaning |
| --- | --- | --- |
| `generateThumbnailFromScene` | `false` | When `true`, `writeProject()` renders a thumbnail if `archive.thumbnail` is `null` |

When Project IO generates a thumbnail during write, it also updates
`archive.thumbnail` with the generated bytes so the in-memory archive reflects
the written archive.

### `ProjectIoErrorCode`

```typescript
type ProjectIoErrorCode =
  | "corrupted-archive"
  | "invalid-manifest"
  | "missing-program-xml"
  | "unsafe-path"
  | "xml-parse"
  | "zip-bomb";
```

### `ProjectIoError`

```typescript
class ProjectIoError extends Error {
  readonly code: ProjectIoErrorCode;
  readonly cause?: unknown;

  constructor(code: ProjectIoErrorCode, message: string, cause?: unknown);
}
```

Use `error instanceof ProjectIoError` and inspect `error.code` for user-facing
error handling.

```typescript
try {
  const archive = await readProject(projectBytes);
  console.log(archive.project.projectName);
} catch (error) {
  if (error instanceof ProjectIoError) {
    console.error(`Project IO failed with ${error.code}: ${error.message}`);
  } else {
    throw error;
  }
}
```

## Special ZIP entries

| Entry | Public field or behavior |
| --- | --- |
| `programType.xml` | Preferred Alice project XML entry |
| `program.xml` | Legacy Alice project XML entry, preserved when read |
| `manifest.json` | `archive.manifest` |
| `version.txt` | Version detection input and write output |
| `thumbnail.png` | `archive.thumbnail` |

Special ZIP entries are not exposed as `resourceEntries`. Project resources
exclude `programType.xml`, `program.xml`, `manifest.json`, `version.txt`, and
`thumbnail.png`.

`__original_xml__` is not a ZIP entry. It is an internal `archive.resources`
marker used to carry migrated XML text and the original XML entry name between
`readProject()` and `writeProject()`. Project IO filters that marker out when
writing ZIP resources.

## Internal module ownership

| Internal module | Owns |
| --- | --- |
| `src/project-io/archive-zip.ts` | ZIP loading, entry enumeration, safe reads and writes, archive size checks |
| `src/project-io/path-security.ts` | Archive-relative path validation for read and write paths |
| `src/project-io/xml-pass-through.ts` | `__original_xml__` encoding and decoding, XML entry-name preservation |
| `src/project-io/manifest.ts` | Manifest parsing, serialization, and project-version synchronization |
| `src/project-io/thumbnails.ts` | Thumbnail read, write, and scene generation helpers |
| `src/project-io/resources.ts` | Resource extraction, classification, write filtering, and special-path detection |
| `src/project-io/migration.ts` | Project IO adapter around `project-migration.ts` |
| `src/project-io/types.ts` | Shared internal types |

These modules may change without a public API version bump. The compatibility
surface is `src/project-io.ts`.

Last updated for the refactored Project IO facade and internal module split.
