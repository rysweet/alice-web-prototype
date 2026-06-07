# Round-trip an `.a3p` project with Project IO

This tutorial shows how to load an Alice `.a3p` project, inspect its archive
contents, modify project data, add a resource, and save a new `.a3p` file.

## What you will build

A small script that:

1. Reads `lessons/starter.a3p`.
2. Prints project, resource, version, and thumbnail information.
3. Renames the project.
4. Adds a texture resource.
5. Saves `lessons/starter-edited.a3p`.

## Prerequisites

Install dependencies from the repository root:

```bash
npm install
```

Prepare these files:

```text
lessons/starter.a3p
assets/textures/checker.png
```

The repository does not include a TypeScript script runner dependency. The
command below uses `tsx`; install it locally or replace it with the TypeScript
runner already used in your workspace.

## Create the script

Create `scripts/round-trip-project-io.ts`:

```typescript
import { readFile, writeFile } from "node:fs/promises";
import {
  ProjectIoError,
  readProject,
  writeProject,
} from "../src/project-io.js";

async function main(): Promise<void> {
  const inputBytes = await readFile("lessons/starter.a3p");
  const archive = await readProject(inputBytes);

  console.log(`Project: ${archive.project.projectName}`);
  console.log(`Version: ${archive.versionInfo.detectedAliceVersion}`);
  console.log(`Version source: ${archive.versionInfo.versionSource}`);
  console.log(`Migrated: ${archive.versionInfo.migrated}`);
  console.log(`Thumbnail: ${archive.thumbnail ? "present" : "missing"}`);

  for (const resource of archive.resourceEntries) {
    console.log(`${resource.kind}: ${resource.path} (${resource.size} bytes)`);
  }

  archive.project.projectName = `${archive.project.projectName} - Edited`;

  const textureBytes = await readFile("assets/textures/checker.png");
  archive.resources.set(
    "resources/textures/checker.png",
    new Uint8Array(textureBytes),
  );

  const outputBytes = await writeProject(archive, {
    generateThumbnailFromScene: true,
  });

  await writeFile("lessons/starter-edited.a3p", outputBytes);
  console.log(`Wrote ${outputBytes.byteLength} bytes`);
}

main().catch((error: unknown) => {
  if (error instanceof ProjectIoError) {
    console.error(`Project IO error (${error.code}): ${error.message}`);
    process.exitCode = 1;
    return;
  }

  throw error;
});
```

## Run the script

Use the same TypeScript runner you use for local repository scripts. The script
imports directly from `src/project-io.ts`, so it should run in the repository
workspace where dependencies are installed. With `tsx`, run:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npx --package tsx tsx scripts/round-trip-project-io.ts
```

Expected output shape:

```text
Project: Starter
Version: 3.10.0.0
Version source: version.txt
Migrated: false
Thumbnail: present
image: resources/textures/ground.png (4281 bytes)
model: resources/models/bunny.obj (18422 bytes)
Wrote 31240 bytes
```

The exact resource list and byte counts depend on the input project.

## Verify the result

Read the output archive again and confirm the changes:

```typescript
const savedBytes = await readFile("lessons/starter-edited.a3p");
const savedArchive = await readProject(savedBytes);

console.log(savedArchive.project.projectName);
console.log(savedArchive.resources.has("resources/textures/checker.png"));
```

The new archive keeps the original XML entry name, migrated XML text, manifest
metadata, version metadata, existing resources, and thumbnail behavior unless
the script changes those fields. It does not promise byte-for-byte preservation
of the original XML file.

## What to remember

- Keep the internal `__original_xml__` marker in `archive.resources` to preserve
  XML pass-through. It is filtered from ZIP writes and is not a real archive
  entry.
- Use safe relative resource paths with forward slashes.
- Set `generateThumbnailFromScene: true` only when you want Project IO to fill a
  missing thumbnail during save.
- Catch `ProjectIoError` when converting user-provided archives.

Last updated for the refactored Project IO facade and internal module split.
