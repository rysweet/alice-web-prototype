# Project IO

Project IO is the stable boundary for reading, writing, and preserving Alice
`.a3p` project archives.

Use `src/project-io.ts` for public imports. The implementation is split into
small internal modules under `src/project-io/`, but callers should not import
those modules directly.

## Contents

- [Project IO API reference](./project-io-api.md)
- [Project IO usage guide](./project-io-usage.md)
- [Project IO configuration](./project-io-configuration.md)
- [Round-trip an `.a3p` project](./tutorial-project-io-round-trip.md)

## What Project IO owns

| Area | Responsibility |
| --- | --- |
| Public facade | `readProject`, `writeProject`, `generateThumbnailFromProjectScene`, `AliceProjectArchive`, `WriteProjectOptions`, and `ProjectIoError` |
| Archive ZIP handling | Loading `.a3p` ZIP data, enumerating entries safely, reading text and binary entries, writing archives, and enforcing archive size limits |
| Path security | Rejecting unsafe archive-relative paths before read or write work continues |
| XML pass-through | Preserving the `programType.xml` or legacy `program.xml` entry name and migrated XML text through the internal `__original_xml__` marker |
| Manifest and version sync | Reading `manifest.json`, detecting Alice versions, updating the first recognized version field after migration, and serializing manifests |
| Migration | Applying project-IO migration through `project-migration.ts` without moving migration rule ownership into archive code |
| Resources | Extracting project resources, including `resources/audio/...`, classifying resource kinds, preserving safe binary entries, and filtering internal entries during writes |
| Thumbnails | Reading `thumbnail.png`, writing supplied thumbnails, and optionally generating thumbnails from the scene |

## Archive flow

```text
.a3p bytes
  |
  v
archive-zip: load ZIP, reject suspicious archives, validate entry paths
  |
  v
xml-pass-through + manifest + migration: read XML, detect version, migrate XML, sync one manifest version field
  |
  v
resources + thumbnails: extract non-special entries and thumbnail bytes
  |
  v
AliceProjectArchive
  |
  v
writeProject: validate paths, preserve XML entry name, write manifest/version/resources/thumbnail
  |
  v
.a3p bytes
```

## Public import rule

Import from the facade:

```typescript
import {
  readProject,
  writeProject,
  type AliceProjectArchive,
} from "./src/project-io.js";
```

Do not import from `src/project-io/archive-zip.ts`,
`src/project-io/path-security.ts`, or other internal helper files. Those helpers
exist to keep the implementation maintainable without expanding the public API.

## Compatibility guarantees

Project IO preserves the existing `.a3p` behavior:

- `readProject()` accepts `ArrayBuffer` and `Uint8Array` inputs.
- `writeProject()` returns a `Uint8Array`.
- Existing public exports remain available from `src/project-io.ts`.
- The XML entry name and migrated XML text are preserved when `__original_xml__`,
  `programType.xml`, or `program.xml` is available. Project IO does not promise
  byte-for-byte preservation of the original XML file.
- A project read from `program.xml` writes back to `program.xml`; a project read
  from `programType.xml` writes back to `programType.xml`.
- `manifest.json`, `version.txt`, `thumbnail.png`, resources, and migrated
  version metadata keep the same archive-level behavior. Manifest version sync
  updates one recognized field by precedence, not every possible version field.
- Project audio bytes and `manifest.aliceAudio` metadata are preserved through
  read and write. The Alice server updates `aliceAudio` when audio state changes.
- Unsafe paths are rejected rather than normalized, skipped, or silently
  rewritten.

## Related docs

- Use the [API reference](./project-io-api.md) for exact exported types,
  function signatures, and error codes.
- Use the [usage guide](./project-io-usage.md) for common tasks such as reading,
  writing, replacing thumbnails, preserving XML, and handling errors.
- Use [Project IO configuration](./project-io-configuration.md) for archive
  conventions, size limits, path rules, and thumbnail-generation options.
- Use [Imported model and texture assets](./imported-models-and-textures.md)
  for the `project/models/...` and `project/textures/...` identity convention.
- Use [Audio](./audio.md) for the `aliceAudio` manifest shape and audio workflow
  API.
- Follow the [round-trip tutorial](./tutorial-project-io-round-trip.md) to load,
  inspect, modify, and save an `.a3p` file.
- See the [TypeScript source export](./typescript-source-export.md)
  contract for the future readable generated `.ts` source handoff. This is
  separate from `.a3p` project archive IO.

Last updated for the refactored Project IO facade and internal module split.
