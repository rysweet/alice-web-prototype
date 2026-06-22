---
title: Selected object transform API
description: Reference for browser selected-object transform controls, state updates, persistence, and configuration.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Selected object transform API

This reference defines the selected-object transform contract for the Alice
browser workflow. The public behavior is Alice-facing UI plus Project IO state
round-tripping; there is no separate public package API for these buttons.

## Contents

- [Browser control contract](#browser-control-contract)
- [Selected object state contract](#selected-object-state-contract)
- [Action deltas](#action-deltas)
- [Scene redraw behavior](#scene-redraw-behavior)
- [Persistence contract](#persistence-contract)
- [Configuration](#configuration)
- [Validation and errors](#validation-and-errors)
- [Examples](#examples)
- [Related docs](#related-docs)

## Browser control contract

The browser document exposes one control per selected-object action.

| User label | Element id | Stable test id | Required state change |
| --- | --- | --- | --- |
| `Move selected object` | `move-selected-object-button` | `alice-move-selected-object-button` | Updates `selected.position` |
| `Turn selected object` | `turn-selected-object-button` | `alice-turn-selected-object-button` | Updates `selected.orientation` |
| `Resize selected object` | `resize-selected-object-button` | `alice-resize-selected-object-button` | Updates `selected.size` |

The labels are user-facing. The stable test ids are automation hooks and are not
shown as product text.

Each handler resolves the selected object from the active `AliceProject` using
the same selection state as the **Scene Objects** list. Handlers must not accept
an object id or name from query strings, hidden inputs, arbitrary DOM text, or
test-only globals.

## Selected object state contract

The controls mutate the real `AliceObject` inside `AliceProject.sceneObjects`.

```typescript
interface AliceObject {
  name: string;
  typeName: string;
  resourceType: string | null;
  position: { x: number; y: number; z: number } | null;
  orientation: { x: number; y: number; z: number; w: number } | null;
  size: { width: number; height: number; depth: number } | null;
}
```

Missing transform values use Alice identity defaults before the action delta is
applied:

| Field | Default |
| --- | --- |
| `position` | `{ x: 0, y: 0, z: 0 }` |
| `orientation` | `{ x: 0, y: 0, z: 0, w: 1 }` |
| `size` | `{ width: 1, height: 1, depth: 1 }` |

All numbers written by the browser controls are finite.

## Action deltas

Each click applies one deterministic delta to the selected object.

| Action | Delta |
| --- | --- |
| Move | Adds `1` to `position.x`; `position.y` and `position.z` are preserved. |
| Turn | Applies a 15 degree yaw around the positive Y axis. |
| Resize | Multiplies `size.width`, `size.height`, and `size.depth` by `1.2`. |

The 15 degree yaw quaternion is:

```typescript
const yaw15 = {
  x: 0,
  y: Math.sin((15 * Math.PI) / 180 / 2),
  z: 0,
  w: Math.cos((15 * Math.PI) / 180 / 2),
};
```

When the selected object already has an orientation, **Turn** uses a Hamilton
product with the current `x`, `y`, `z`, `w` orientation as the left operand and
`yaw15` as the right operand:

```typescript
nextOrientation = normalize(hamiltonProduct(currentOrientation, yaw15));
```

The stored quaternion must be normalized. Browser, unit, and E2E checks should
compare quaternion components with an absolute tolerance of `1e-9`, and should
also accept only normalized results whose length differs from `1` by no more
than `1e-9`.

## Scene redraw behavior

After a successful action, the browser calls the existing project render path so
the object list, imported asset list, joint object options, and Three.js scene
are redrawn from the updated `AliceProject`.

The renderer must not rely on a test-only mirror object or a visual-only
transform. The source of truth is the selected `AliceObject`.

## Persistence contract

Saving an `.a3p` archive preserves selected-object transform values through
Project IO. Reopening that archive restores the same values in
`AliceProject.sceneObjects`.

The writer must emit parser-compatible transform calls for each object that has
the corresponding finite-valued field:

| `AliceObject` field | Alice project XML method |
| --- | --- |
| `position` | `setPositionRelativeToVehicle(x, y, z)` |
| `orientation` | `setOrientationRelativeToVehicle(x, y, z, w)` |
| `size` | `setSize(width, height, depth)` |

The parser recognizes those same method calls when they target a scene field.
After parsing numeric arguments, it must copy values only when every required
argument is finite according to `Number.isFinite`. Calls with `NaN`, `Infinity`,
`-Infinity`, missing arguments, or non-numeric arguments do not populate the
matching `AliceObject` transform field. Other method calls are left to the
normal statement parser.

When an archive was opened with XML pass-through, Project IO may preserve the
original XML entry name. When transform state changes, the generated project XML
must still include the changed transform calls before the archive is written.

## Configuration

Selected-object transform controls do not add configuration files, environment
variables, server routes, package metadata, or storage keys.

Use the existing local validation heap setting for repository commands that need
more Node.js memory:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
npm run build:server
npm run test:e2e
```

The transform controls themselves do not read `NODE_OPTIONS`.

## Validation and errors

| Condition | Required behavior |
| --- | --- |
| No active project | Create or open an Alice project before applying the action. |
| No selected object | Report that an object must be selected and leave project state unchanged. |
| Missing transform field | Use the field default, apply the action, and store the result. |
| Non-finite calculated browser value | Reject the action and report the error through the existing status pattern. |
| Non-finite transform value while writing | Do not write a malformed transform call; surface the Project IO error through the existing status pattern. |
| Save or open failure | Surface the Project IO error through the existing status pattern. |

Errors must not be converted into successful status messages.

## Examples

Apply all three actions to an object in memory:

```typescript
const object: AliceObject = {
  name: "box",
  typeName: "org.lgna.story.SBox",
  resourceType: null,
  position: null,
  orientation: null,
  size: null,
};

object.position = { x: 1, y: 0, z: 0 };
object.orientation = {
  x: 0,
  y: Math.sin((15 * Math.PI) / 180 / 2),
  z: 0,
  w: Math.cos((15 * Math.PI) / 180 / 2),
};
object.size = { width: 1.2, height: 1.2, depth: 1.2 };
```

Round-trip the transform through Project IO:

```typescript
import { readProject, writeProject } from "./src/project-io.js";

archive.project.sceneObjects[0].position = { x: 1, y: 0, z: 0 };
archive.project.sceneObjects[0].orientation = {
  x: 0,
  y: Math.sin((15 * Math.PI) / 180 / 2),
  z: 0,
  w: Math.cos((15 * Math.PI) / 180 / 2),
};
archive.project.sceneObjects[0].size = {
  width: 1.2,
  height: 1.2,
  depth: 1.2,
};

const savedBytes = await writeProject(archive);
const reopened = await readProject(savedBytes);

console.log(reopened.project.sceneObjects[0].position);
console.log(reopened.project.sceneObjects[0].orientation);
console.log(reopened.project.sceneObjects[0].size);
```

## Related docs

- [Selected object transform controls](./selected-object-transform-controls.md)
- [Round-trip selected object transforms](./tutorial-selected-object-transform-round-trip.md)
- [Project IO API reference](./project-io-api.md)
- [A3P statement round-trip coverage](./a3p-statement-round-trip.md)
