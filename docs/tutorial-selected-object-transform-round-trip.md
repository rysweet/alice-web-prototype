---
title: Round-trip selected object transforms
description: Tutorial for creating an Alice project, changing a selected object, saving it, reopening it, and checking the transform state.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: tutorial
---

# Round-trip selected object transforms

This tutorial walks through a complete Alice browser workflow: create a project,
add an object, move it, turn it, resize it, save the project, reopen it, and
confirm that the object keeps the same transform.

## What you will do

1. Start the Alice browser app.
2. Create an object.
3. Apply **Move**, **Turn**, and **Resize**.
4. Save the project as an `.a3p` archive.
5. Reopen the saved archive.
6. Check that the object's position, orientation, and size match the saved state.

## Prerequisites

Install dependencies from the repository root:

```bash
npm install
```

Use the repository memory setting for local commands:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
```

## Start Alice in the browser

Run the browser development server:

```bash
npm run dev
```

Open the local URL printed by Vite.

## Create and select an object

1. Choose **Create shape**.
2. Confirm that a new object appears under **Scene Objects**.
3. Select the object if it is not already highlighted.

The new shape starts with default transform values:

```json
{
  "position": null,
  "orientation": null,
  "size": null
}
```

Those `null` values mean Alice identity defaults until a transform is applied.

## Apply the transform controls

Click each button once:

1. **Move**
2. **Turn**
3. **Resize**

After those clicks, the selected object's scene state is:

```json
{
  "position": { "x": 1, "y": 0, "z": 0 },
  "orientation": {
    "x": 0,
    "y": 0.13052619222005157,
    "z": 0,
    "w": 0.9914448613738104
  },
  "size": { "width": 1.2, "height": 1.2, "depth": 1.2 }
}
```

The object should redraw in the scene after each click. Orientation values are
floating-point values, so compare quaternion components with a small tolerance
instead of exact string equality. The feature contract uses an absolute
tolerance of `1e-9`.

## Save and reopen the project

Choose **Save project** and store the `.a3p` file somewhere easy to find.

Then use **Load .a3p project file** to open that saved file. Select the same
object in **Scene Objects**.

The reopened project should contain the same transform state:

```json
{
  "position": { "x": 1, "y": 0, "z": 0 },
  "orientation": {
    "x": 0,
    "y": 0.13052619222005157,
    "z": 0,
    "w": 0.9914448613738104
  },
  "size": { "width": 1.2, "height": 1.2, "depth": 1.2 }
}
```

## Check the archive in code

You can inspect the saved archive with Project IO:

```typescript
import { readFile } from "node:fs/promises";
import { readProject } from "./src/project-io.js";

const bytes = await readFile("SelectedObjectTransform.a3p");
const archive = await readProject(bytes);
const object = archive.project.sceneObjects.find((item) => item.name === "box");

if (!object) {
  throw new Error("Expected box in the saved Alice project.");
}

console.log(object.position);
console.log(object.orientation);
console.log(object.size);
```

Expected output shape:

```text
{ x: 1, y: 0, z: 0 }
{ x: 0, y: 0.13052619222005157, z: 0, w: 0.9914448613738104 }
{ width: 1.2, height: 1.2, depth: 1.2 }
```

The exact object name depends on the name generated in your project. Use the
name shown in **Scene Objects** when looking it up.

Quaternion values may differ in the final decimal places; treat values within
`1e-9` as matching.

## What to remember

- The transform buttons change the selected `AliceObject`, not a separate visual
  copy.
- Saving writes finite position, orientation, and size values into the `.a3p`
  project with parser-compatible transform calls.
- Reopening restores those finite values through the normal Project IO parser.
- The feature does not require extra configuration beyond the existing local
  development and validation commands.

## Related docs

- [Selected object transform controls](./selected-object-transform-controls.md)
- [Selected object transform API](./selected-object-transform-api.md)
- [Project IO usage guide](./project-io-usage.md)
- [Round-trip an `.a3p` project with Project IO](./tutorial-project-io-round-trip.md)
