---
title: Selected object transform controls
description: How to move, turn, and resize the selected Alice object in the browser.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: how-to
---

# Selected object transform controls

Use the selected object controls when you want to adjust an Alice scene object
directly in the browser.

## Contents

- [Open or create a project](#open-or-create-a-project)
- [Add and select an object](#add-and-select-an-object)
- [Move, turn, and resize the object](#move-turn-and-resize-the-object)
- [Save and reopen the project](#save-and-reopen-the-project)
- [Troubleshooting](#troubleshooting)
- [Related docs](#related-docs)

## Open or create a project

Open the Alice browser app with the local development server:

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run dev
```

Vite prints a local URL after the server starts.

To open an existing Alice project, use **Load .a3p project file** and choose an
`.a3p` file. To begin from an empty browser project, use **Create shape**.

## Add and select an object

The object list under **Scene Objects** is the selection source for the transform
controls.

1. Choose **Create shape** to add a box to the active project.
2. Select the object in **Scene Objects**.
3. Confirm that the selected row is highlighted.

Creating a shape also selects it, so a new object is ready for transform changes
immediately.

## Move, turn, and resize the object

Use the transform controls near the object workflow controls:

| Button | What it changes | Result after one click from default state |
| --- | --- | --- |
| **Move** | `AliceObject.position` | `{ x: 1, y: 0, z: 0 }` |
| **Turn** | `AliceObject.orientation` | 15 degree yaw around the positive Y axis |
| **Resize** | `AliceObject.size` | `{ width: 1.2, height: 1.2, depth: 1.2 }` |

Each click updates the selected `AliceObject` in the active scene model and then
redraws the scene from that model. The controls do not keep a separate visual
state.

The first click fills missing transform values with Alice defaults:

```typescript
const defaultPosition = { x: 0, y: 0, z: 0 };
const defaultOrientation = { x: 0, y: 0, z: 0, w: 1 };
const defaultSize = { width: 1, height: 1, depth: 1 };
```

Repeated clicks apply the same finite delta again. For example, clicking
**Move** twice from the default position sets `position.x` to `2`.

Repeated **Turn** clicks compose the current orientation with the same 15 degree
yaw delta and store the normalized quaternion. See
[Selected object transform API](./selected-object-transform-api.md#action-deltas)
for the exact composition order and comparison tolerance.

## Save and reopen the project

Choose **Save project** to write an `.a3p` archive. The saved project preserves
the selected object's position, orientation, and size.

To verify the saved state:

1. Save the project.
2. Use **Load .a3p project file** to open the saved archive.
3. Select the same object in **Scene Objects**.
4. Confirm that the object appears with the same position, turn, and size.

Project IO must store these values in the Alice project XML with
parser-compatible transform calls. See
[Selected object transform API](./selected-object-transform-api.md) for the
exact state, writer, parser, and persistence contract.

## Troubleshooting

| Problem | What to do |
| --- | --- |
| A transform button reports that no object is selected | Select an object in **Scene Objects** or use **Create shape** first. |
| The object does not appear changed | Check that the selected row is highlighted, then click the transform button again. |
| The saved project reopens without the expected transform | Make sure you reopened the newly saved `.a3p` file, not the original input file. |

## Related docs

- [Selected object transform API](./selected-object-transform-api.md)
- [Round-trip selected object transforms](./tutorial-selected-object-transform-round-trip.md)
- [Project IO usage guide](./project-io-usage.md)
- [Scene graph](./scene-graph.md)
