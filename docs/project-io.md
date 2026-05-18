# Project IO — Full .a3p Read/Write

The project IO module (`src/project-io.ts`) provides buffer-based reading and
writing of complete Alice `.a3p` project archives. It wraps the existing
`parseA3P()` for XML extraction and adds support for manifest, resources,
and thumbnails — everything needed for symmetric round-trip serialization.

## Overview

| Export | Kind | Purpose |
|---|---|---|
| `readProject` | async function | Parse a complete .a3p archive into `AliceProjectArchive` |
| `writeProject` | async function | Serialize an `AliceProjectArchive` back to .a3p bytes |
| `AliceProjectArchive` | interface | Full archive contents: project + manifest + resources + thumbnail |

The module operates on `ArrayBuffer | Uint8Array` inputs and produces
`Uint8Array` outputs. It has no filesystem dependency — it works identically
in browser and Node.js environments.

## Quick Start

### Reading a Project

```typescript
import { readProject } from './project-io';

// From a fetch response
const response = await fetch('/projects/starter.a3p');
const buffer = await response.arrayBuffer();
const archive = await readProject(buffer);

console.log(archive.project.projectName);       // "myProject"
console.log(archive.manifest);                   // { version: "1.0", ... } or null
console.log(archive.resources.size);             // 12 resource entries
console.log(archive.thumbnail !== null);         // true if thumbnail.png exists
```

### Writing a Project

```typescript
import { writeProject } from './project-io';

const bytes = await writeProject(archive);
// bytes is Uint8Array — save to file, send over network, etc.

// Node.js: write to disk
import { writeFileSync } from 'fs';
writeFileSync('output.a3p', bytes);

// Browser: trigger download
const blob = new Blob([bytes], { type: 'application/zip' });
const url = URL.createObjectURL(blob);
```

### Round-Trip

```typescript
import { readProject, writeProject } from './project-io';

const original = await readProject(inputBuffer);

// Modify the project...
original.project.projectName = 'Modified Project';

// Write back
const outputBytes = await writeProject(original);

// Re-read and verify
const roundTripped = await readProject(outputBytes);
expect(roundTripped.project.projectName).toBe('Modified Project');
```

## Types

### `AliceProjectArchive`

```typescript
interface AliceProjectArchive {
  /** Parsed scene graph, methods, joints, bounding boxes, textures */
  project: AliceProject;

  /** Contents of manifest.json from the ZIP root, or null if absent */
  manifest: Record<string, unknown> | null;

  /** All resource entries from the ZIP, keyed by path */
  resources: Map<string, Uint8Array>;

  /** Thumbnail image bytes (thumbnail.png), or null if absent */
  thumbnail: Uint8Array | null;
}
```

| Field | Type | Description |
|---|---|---|
| `project` | `AliceProject` | The parsed project (scene objects, methods, joints, etc.) |
| `manifest` | `Record<string, unknown> \| null` | Parsed `manifest.json` or `null` |
| `resources` | `Map<string, Uint8Array>` | All ZIP entries except `programType.xml`, `manifest.json`, and `thumbnail.png` |
| `thumbnail` | `Uint8Array \| null` | Raw bytes of `thumbnail.png` or `null` |

## `readProject(data)`

```typescript
async function readProject(
  data: ArrayBuffer | Uint8Array
): Promise<AliceProjectArchive>
```

Parse a complete .a3p archive. This function:

1. Opens the ZIP archive
2. Extracts and parses `programType.xml` via `parseA3P()` (existing parser)
3. Reads `manifest.json` if present, parses as JSON → `manifest`
4. Reads `thumbnail.png` if present → `thumbnail`
5. Collects all remaining entries → `resources` map

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `data` | `ArrayBuffer \| Uint8Array` | Raw .a3p file bytes |

**Returns:** `Promise<AliceProjectArchive>`

**Throws:**

| Error | Condition |
|---|---|
| `Error` | Input is not a valid ZIP archive |
| `Error` | `programType.xml` is missing from the ZIP |
| `Error` | Total extracted size exceeds 256 MB (ZIP bomb protection) |
| `Error` | Any entry path contains `..` or is absolute (path traversal protection) |

### Resource Map Keys

Resource map keys are the full ZIP entry paths, e.g.:

```
resources/models/bunny.obj
resources/textures/skin.png
resources/audio/hop.wav
```

The `programType.xml`, `manifest.json`, and `thumbnail.png` entries are
**excluded** from the resources map — they are accessible via their dedicated
fields.

## `writeProject(archive)`

```typescript
async function writeProject(
  archive: AliceProjectArchive
): Promise<Uint8Array>
```

Serialize an `AliceProjectArchive` back to .a3p ZIP format.

**Behavior:**

1. Creates a new ZIP archive
2. Writes `programType.xml` using the `__original_xml__` pass-through key
   (set by `readProject()`), or falls back to an explicit `programType.xml`
   entry in the resources map. Throws if neither is available — there is no
   model-to-XML serializer.
3. Writes `manifest.json` if `archive.manifest` is not null
4. Writes `thumbnail.png` if `archive.thumbnail` is not null
5. Writes all entries from `archive.resources`
6. Returns the ZIP as `Uint8Array`

**Parameters:**

| Param | Type | Description |
|---|---|---|
| `archive` | `AliceProjectArchive` | The archive to serialize |

**Returns:** `Promise<Uint8Array>`

**Throws:**

| Error | Condition |
|---|---|
| `Error` | Any resource path contains `..` or is absolute (path traversal protection) |
| `Error` | Neither `__original_xml__` key nor explicit `programType.xml` entry exists in resources |

- If `archive.manifest` is a non-null object, it is serialized as
  pretty-printed JSON (2-space indent) into `manifest.json`
- If `archive.manifest` is `null`, no `manifest.json` entry is written
- On read, if `manifest.json` is absent, `manifest` is `null`
- On read, if `manifest.json` is present but contains invalid JSON, an
  `Error` is thrown

### Thumbnail Handling

- If `archive.thumbnail` is a non-null `Uint8Array`, it is written as
  `thumbnail.png`
- If `archive.thumbnail` is `null`, no `thumbnail.png` entry is written
- The module does not validate that the bytes are actually a valid PNG —
  it stores them as-is

### XML Pass-Through

`writeProject()` preserves the original XML via pass-through. On read,
`readProject()` stores the original `programType.xml` bytes as a special
entry in the resources map under the key `__original_xml__`. On write,
`writeProject()` checks for this key first and uses it if present, ensuring
byte-level XML preservation on round-trip.

If the `__original_xml__` key has been removed from the resources map,
`writeProject()` throws an `Error` — there is no XML-from-model serializer.
The caller must either preserve the original XML or provide an explicit
`programType.xml` entry in the resources map.

## Security

### ZIP Bomb Protection

`readProject()` enforces a **256 MB total extraction limit**. If the cumulative
size of all extracted entries exceeds this threshold, parsing is aborted with
an error. This prevents denial-of-service via specially crafted ZIP files with
high compression ratios.

### Path Traversal Protection

Both `readProject()` and `writeProject()` reject entries whose paths:

- Contain `..` segments (e.g. `../../../etc/passwd`)
- Start with `/` (absolute paths)
- Contain backslash `\` path separators

Rejected entries cause an immediate error — they are not silently skipped.

### Numeric Validation

All parsed numeric values (positions, orientations, bounding boxes) are
validated with `Number.isFinite()` by the underlying `parseA3P()` parser.
Non-finite values in XML produce parse errors.

## Integration Example

### Modifying a Project Programmatically

```typescript
import { readProject, writeProject } from './project-io';
import { writeFileSync, readFileSync } from 'fs';

// Read
const input = readFileSync('starter.a3p');
const archive = await readProject(input);

// Inspect
console.log('Objects:', archive.project.sceneObjects.map(o => o.name));
console.log('Resources:', [...archive.resources.keys()]);

// Modify — add a new texture resource
const textureData = readFileSync('new-texture.png');
archive.resources.set('resources/textures/custom.png', new Uint8Array(textureData));

// Write
const output = await writeProject(archive);
writeFileSync('modified.a3p', output);
```

### Using with Scene API

```typescript
import { readProject } from './project-io';
import { Scene } from './story-api';

const archive = await readProject(buffer);
const scene = Scene.fromProject(archive.project);

// The scene has typed entities from the project
for (const [name, entity] of scene.entities) {
  console.log(`${name}: ${entity.constructor.name}`);
}

// Joint data is available on the project
for (const root of archive.project.jointHierarchy ?? []) {
  console.log(`Joint tree root: ${root.name}`);
}
```

### Replacing the Thumbnail

```typescript
import { readProject, writeProject } from './project-io';

const archive = await readProject(buffer);

// Replace thumbnail with a new image
const canvas = document.createElement('canvas');
// ... render to canvas ...
const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!)));
archive.thumbnail = new Uint8Array(await blob.arrayBuffer());

const output = await writeProject(archive);
```

## Relationship to Existing Modules

| Module | Role | Relationship |
|---|---|---|
| `a3p-parser.ts` | Parses `programType.xml` from ZIP | Called by `readProject()` internally |
| `a3p-writer.ts` | Modifies and rewrites .a3p files | Independent — filesystem-based, mutation-focused |
| `project-io.ts` | Full archive read/write with all entries | Wraps `parseA3P()`, buffer-based, symmetric |

`project-io.ts` and `a3p-writer.ts` serve different use cases:

- **`a3p-writer.ts`** is designed for the eatme hooks — it reads a file from
  disk, applies targeted XML mutations (add comment, add object), and writes
  back to disk.
- **`project-io.ts`** is a general-purpose archive abstraction — it gives you
  the full contents of an .a3p file as structured data, lets you modify
  anything, and writes it back as bytes.

They can coexist. Neither depends on the other.

## Testing

Tests are in `test/project-io.test.ts`:

- **Round-trip:** Read → write → read, verify all fields match
- **Manifest present/absent:** Both cases tested
- **Thumbnail present/absent:** Both cases tested
- **Resource preservation:** All ZIP entries round-trip correctly
- **XML preservation:** Original XML is preserved byte-for-byte on round-trip
- **ZIP bomb rejection:** Archive exceeding 256 MB extraction limit is rejected
- **Path traversal rejection:** Entries with `..` or absolute paths are rejected
- **Invalid ZIP:** Non-ZIP input produces clear error
- **Missing programType.xml:** Clear error message

### Example Test (Round-Trip)

```typescript
it('round-trips a project archive', async () => {
  const original = await readProject(testA3PBuffer);

  const bytes = await writeProject(original);
  const roundTripped = await readProject(bytes);

  expect(roundTripped.project.projectName).toBe(original.project.projectName);
  expect(roundTripped.project.sceneObjects).toEqual(original.project.sceneObjects);
  expect(roundTripped.manifest).toEqual(original.manifest);
  expect(roundTripped.resources.size).toBe(original.resources.size);

  for (const [path, data] of original.resources) {
    expect(roundTripped.resources.get(path)).toEqual(data);
  }
});
```

## Limitations

- **No streaming.** The entire ZIP is loaded into memory. For very large
  projects (>256 MB extracted), this will fail by design (ZIP bomb protection).
- **No XML generation from model.** There is no model-to-XML serializer.
  `writeProject()` requires either the `__original_xml__` key (set automatically
  by `readProject()`) or an explicit `programType.xml` entry in the resources map.
  Round-trip works out of the box; new-from-scratch archives require providing XML.
- **No incremental updates.** To change one resource, you must read the entire
  archive, modify the resource map, and write the entire archive back.
- **Thumbnail is unvalidated.** `writeProject()` does not verify that
  `thumbnail` bytes are a valid PNG image.
