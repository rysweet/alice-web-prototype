# IDE Operations — Project Manager, Undo/Redo, Clipboard, Preferences

Four modules that bring IDE-grade editing operations to the Alice web
prototype. Together they provide the same project lifecycle, edit history,
copy/paste, and settings persistence that the Java desktop IDE offers —
ported to a pure TypeScript, framework-agnostic implementation.

## Overview

| Module | File | Purpose |
|---|---|---|
| **Preferences** | `src/preferences.ts` | Typed user settings with validation, defaults, and JSON serialization |
| **UndoRedo** | `src/undo-redo.ts` | Command-pattern undo/redo for all scene and entity modifications |
| **Clipboard** | `src/clipboard.ts` | Copy/paste of entities and code blocks with collision-safe naming |
| **ProjectManager** | `src/project-manager.ts` | Async project lifecycle (create, open, save, close) with recent files, save backups, corruption recovery, Java export, and dirty tracking |
| **CodeEditor** | `src/code-editor.ts` | Statement-list editing, visual code block summaries, nested body traversal, and drag/drop targets for method bodies |
| **DeclarationEditor** | `src/declaration-editor.ts` | Type, method, and field declaration editing with signature validation and type selection |
| **TypeBrowser** | `src/type-browser.ts` | User/builtin type registry, hierarchy browsing, inherited member listing, type creation, and import/merge planning |
| **CascadeMenus** | `src/cascade-menus.ts` | Expression-builder cascades with scope-aware locals, member chaining, and type-filtered value creators |
| **RunSystem** | `src/run-system.ts` | Run/stop lifecycle, speed control, async stepping, restart, and runtime error capture |

All modules are pure TypeScript with zero framework dependencies. They work
identically in browser and Node.js environments.

The IDE layer now also covers the major Java editor subsystems: structured code
editing (`CodeEditor`), declaration panels (`DeclarationEditor`), type
navigation/import (`TypeBrowser`), expression cascade construction
(`CascadeMenus`), and runtime orchestration (`RunSystem`).

`ProjectManager` now keeps a capped backup history per file, can recover from a
corrupted archive by reopening the latest known-good backup, and can export the
current archive as a standalone Java project via `src/standalone-project.ts`
with Maven and Gradle build files, generated Java sources, and packaged
resource files.

---

## Preferences

User settings persistence with typed access, validation, and JSON
round-tripping. Settings are stored as a plain object — the caller controls
where that JSON is saved (localStorage, file, etc.).

### Quick Start

```typescript
import { Preferences, defaultPreferences } from './preferences';

// Start with defaults
const prefs = new Preferences();
console.log(prefs.get('theme'));           // "dark"
console.log(prefs.get('gridVisible'));     // true

// Modify
prefs.set('theme', 'light');
prefs.set('cameraFov', 90);

// Serialize for storage
const json = prefs.toJSON();
localStorage.setItem('alice-prefs', json);

// Restore later
const restored = Preferences.fromJSON(json);
console.log(restored.get('theme'));        // "light"
```

### API

#### `new Preferences(overrides?)`

Create a `Preferences` instance. Missing keys are filled from `defaultPreferences`.

| Param | Type | Description |
|---|---|---|
| `overrides` | `Partial<PreferencesData>` (optional) | Initial values to override defaults |

#### `prefs.get(key)`

```typescript
get<K extends keyof PreferencesData>(key: K): PreferencesData[K]
```

Returns the current value for the given key. Always returns a valid value
(defaults are guaranteed at construction time).

#### `prefs.set(key, value)`

```typescript
set<K extends keyof PreferencesData>(key: K, value: PreferencesData[K]): void
```

Set a preference value. Validates and clamps the value:

| Key | Type | Validation |
|---|---|---|
| `theme` | `"dark" \| "light"` | Must be `"dark"` or `"light"` — throws `TypeError` otherwise |
| `gridVisible` | `boolean` | Must be `boolean` — throws `TypeError` otherwise |
| `snapToGrid` | `boolean` | Must be `boolean` — throws `TypeError` otherwise |
| `cameraFov` | `number` | Must be finite; clamped to `[1, 179]` |
| `autoSaveInterval` | `number` | Must be finite; clamped to `[0, 3600]` (0 = disabled) |

#### `prefs.reset(key?)`

```typescript
reset(key?: keyof PreferencesData): void
```

Reset one key to its default, or reset all keys if no argument is provided.

#### `prefs.toJSON()`

```typescript
toJSON(): string
```

Serialize all settings to a JSON string. Safe for `localStorage.setItem()`.

#### `Preferences.fromJSON(json)`

```typescript
static fromJSON(json: string): Preferences
```

Deserialize from JSON. Unknown keys are ignored. Invalid JSON throws a
`SyntaxError`. Invalid values for known keys are replaced with defaults
(no throw — resilient to corrupted storage).

### Types

```typescript
interface PreferencesData {
  theme: "dark" | "light";
  gridVisible: boolean;
  snapToGrid: boolean;
  cameraFov: number;
  autoSaveInterval: number;
}

const defaultPreferences: Readonly<PreferencesData> = {
  theme: "dark",
  gridVisible: true,
  snapToGrid: false,
  cameraFov: 60,
  autoSaveInterval: 60,
};
```

### Security

- `fromJSON()` wraps `JSON.parse` in try/catch — invalid JSON throws
  `SyntaxError`, does not crash
- Only known keys from `PreferencesData` are accepted — no prototype
  pollution via `__proto__` or `constructor`
- Numeric values are clamped to safe ranges — no infinity/NaN leaks

---

## Undo/Redo

Command-pattern implementation supporting all scene and entity modifications.
Every undoable action is encapsulated as a `Command` object that knows how to
execute, undo, and redo itself. Commands are pushed onto a capped stack (100).

### Quick Start

```typescript
import { UndoRedoManager, MoveEntityCommand } from './undo-redo';
import { Scene } from './story-api';

// See ProjectManager.openProject() for obtaining an archive
const scene = Scene.fromProject(archive.project);
const undoRedo = new UndoRedoManager();

// Move an entity — undoable
const cmd = new MoveEntityCommand(scene, 'bunny', { x: 1, y: 0, z: 3 });
undoRedo.execute(cmd);

// Undo the move
undoRedo.undo();  // bunny is back at original position

// Redo the move
undoRedo.redo();  // bunny is at (1, 0, 3) again
```

### API

#### `new UndoRedoManager(maxHistory?)`

| Param | Type | Default | Description |
|---|---|---|---|
| `maxHistory` | `number` | `100` | Maximum commands on the undo stack. Oldest commands are discarded when exceeded. |

#### `undoRedo.execute(command)`

```typescript
execute(command: Command): void
```

Execute a command and push it onto the undo stack. Clears the redo stack
(branching history is discarded).

#### `undoRedo.undo()`

```typescript
undo(): boolean
```

Undo the most recent command. Returns `true` if a command was undone,
`false` if the undo stack is empty.

#### `undoRedo.redo()`

```typescript
redo(): boolean
```

Redo the most recently undone command. Returns `true` if a command was
redone, `false` if the redo stack is empty.

#### `undoRedo.canUndo` / `undoRedo.canRedo`

```typescript
get canUndo(): boolean
get canRedo(): boolean
```

Check whether undo/redo is available. Useful for disabling UI buttons.

#### `undoRedo.clear()`

```typescript
clear(): void
```

Clear both undo and redo stacks.

### Command Interface

```typescript
interface Command {
  /** Human-readable description for UI display */
  readonly label: string;

  /** Apply the change */
  execute(): void;

  /** Reverse the change */
  undo(): void;
}
```

Commands capture the before-state on construction or first `execute()` call,
enabling symmetric undo/redo.

### Built-in Commands

| Command | Constructor | Description |
|---|---|---|
| `AddEntityCommand` | `(scene, name, entity)` | Add entity to scene; undo removes it |
| `RemoveEntityCommand` | `(scene, name)` | Remove entity from scene; undo restores it |
| `MoveEntityCommand` | `(scene, name, newPosition)` | Change entity position; undo restores previous position |
| `RotateEntityCommand` | `(scene, name, newOrientation)` | Change entity orientation; undo restores previous orientation |
| `ResizeEntityCommand` | `(scene, name, newSize)` | Change entity size (SModel only); undo restores previous size |
| `CompositeCommand` | `(label, commands[])` | Group multiple commands into one undoable unit |

#### AddEntityCommand

```typescript
import { AddEntityCommand } from './undo-redo';
import { SProp } from './story-api';

const entity = new SProp();
const cmd = new AddEntityCommand(scene, 'newProp', entity);
undoRedo.execute(cmd);
// scene now contains 'newProp'

undoRedo.undo();
// scene no longer contains 'newProp'
```

#### RemoveEntityCommand

```typescript
import { RemoveEntityCommand } from './undo-redo';

const cmd = new RemoveEntityCommand(scene, 'bunny');
undoRedo.execute(cmd);
// 'bunny' removed from scene

undoRedo.undo();
// 'bunny' restored with original state
```

The entity reference is captured on `execute()` so it can be restored on
`undo()`. If the entity does not exist at execute time, a `TypeError` is
thrown.

#### MoveEntityCommand

```typescript
import { MoveEntityCommand } from './undo-redo';

const cmd = new MoveEntityCommand(scene, 'bunny', { x: 5, y: 0, z: -2 });
undoRedo.execute(cmd);
```

Captures the previous position on construction. Throws `TypeError` if the
entity does not exist or does not support position (`SMovableTurnable`).

#### RotateEntityCommand

```typescript
import { RotateEntityCommand } from './undo-redo';

const cmd = new RotateEntityCommand(scene, 'bunny', { x: 0, y: 0.707, z: 0, w: 0.707 });
undoRedo.execute(cmd);
```

Captures the previous orientation on construction. Throws `TypeError` if the
entity does not exist or does not support orientation (`STurnable`).

#### ResizeEntityCommand

```typescript
import { ResizeEntityCommand } from './undo-redo';

const cmd = new ResizeEntityCommand(scene, 'bunny', { width: 2, height: 2, depth: 2 });
undoRedo.execute(cmd);
```

Captures the previous size on construction. Throws `TypeError` if the entity
does not exist or is not an `SModel` (or subclass). Unlike `MoveEntityCommand`
and `RotateEntityCommand`, this command accesses the entity's `size` setter
directly — `Scene` has no `setEntitySize()` helper.

#### CompositeCommand

```typescript
import { CompositeCommand, MoveEntityCommand, RotateEntityCommand } from './undo-redo';

const move = new MoveEntityCommand(scene, 'bunny', { x: 1, y: 0, z: 0 });
const rotate = new RotateEntityCommand(scene, 'bunny', { x: 0, y: 1, z: 0, w: 0 });

const composite = new CompositeCommand('Move and rotate bunny', [move, rotate]);
undoRedo.execute(composite);

// Undo reverses both move AND rotate in one step
undoRedo.undo();
```

Sub-commands execute in order and undo in reverse order. The composite
appears as a single entry in the undo stack.

**Atomicity:** If a sub-command throws during `execute()`, the composite
rolls back any already-executed sub-commands (all-or-nothing). This
prevents partial edits from corrupting the scene.

### Stack Cap Behavior

When the undo stack exceeds `maxHistory` (default 100), the oldest command is
discarded. This prevents unbounded memory growth during long editing sessions.

```typescript
const undoRedo = new UndoRedoManager(50);  // cap at 50

// After 51 executions, the first command is no longer undoable
for (let i = 0; i < 51; i++) {
  undoRedo.execute(new MoveEntityCommand(scene, 'bunny', { x: i, y: 0, z: 0 }));
}
// undoRedo can undo 50 times, not 51
```

---

## Clipboard

Copy/paste support for entities and code blocks. The clipboard holds a single
item — either an entity snapshot or a code string. Pasting an entity generates
a collision-safe unique name.

### Quick Start

```typescript
import { Clipboard } from './clipboard';
import { Scene } from './story-api';

const clipboard = new Clipboard();
const scene = Scene.fromProject(archive.project);

// Copy an entity
clipboard.copyEntity('bunny', scene);

// Paste into the same scene — gets a unique name
const pastedName = clipboard.pasteEntity(scene);
console.log(pastedName);  // "bunny_copy"

// Paste again
const pastedName2 = clipboard.pasteEntity(scene);
console.log(pastedName2);  // "bunny_copy_2"
```

### API

#### `new Clipboard()`

Create an empty clipboard instance. No arguments.

#### `clipboard.copyEntity(name, scene)`

```typescript
copyEntity(name: string, scene: Scene): void
```

Copy an entity from the scene onto the clipboard. The entity's properties
are extracted into an `AliceObject`-compatible snapshot (`typeName` is
derived from the entity's constructor name, e.g. `"SProp"`; `resourceType`
is `null`; position/orientation/size are read from the entity if
supported). The snapshot is deep-cloned via `structuredClone()`, so
mutations to the original do not affect the clipboard contents.

| Param | Type | Description |
|---|---|---|
| `name` | `string` | Name of the entity to copy |
| `scene` | `Scene` | The scene containing the entity |

**Throws:** `TypeError` if the entity does not exist in the scene.

#### `clipboard.pasteEntity(scene)`

```typescript
pasteEntity(scene: Scene): string
```

Paste the clipboard entity into the scene with a unique name. Returns the
name assigned to the pasted entity.

**Name generation:** The original name is suffixed with `_copy`. If that name
already exists, `_copy_2`, `_copy_3`, etc. are tried until a unique name is
found.

| Param | Type | Description |
|---|---|---|
| `scene` | `Scene` | The target scene |

**Returns:** `string` — the name of the newly added entity.

**Throws:** `TypeError` if the clipboard is empty or does not contain an
entity.

#### `clipboard.copyCode(code)`

```typescript
copyCode(code: string): void
```

Copy a code string onto the clipboard. Replaces any previous clipboard
contents (entity or code).

| Param | Type | Description |
|---|---|---|
| `code` | `string` | The code text to copy |

**Throws:** `TypeError` if `code` is empty.

#### `clipboard.pasteCode()`

```typescript
pasteCode(): string
```

Returns the code string from the clipboard.

**Throws:** `TypeError` if the clipboard is empty or does not contain code.

#### `clipboard.isEmpty`

```typescript
get isEmpty(): boolean
```

`true` if the clipboard has no content.

#### `clipboard.contentType`

```typescript
get contentType(): "entity" | "code" | null
```

The type of content currently on the clipboard, or `null` if empty.

#### `clipboard.clear()`

```typescript
clear(): void
```

Clear the clipboard contents.

### Name Collision Resolution

When pasting an entity, the clipboard generates unique names to prevent
overwriting existing entities:

```typescript
clipboard.copyEntity('bunny', scene);

// First paste: "bunny_copy"
clipboard.pasteEntity(scene);

// Second paste: "bunny_copy_2" (bunny_copy already exists)
clipboard.pasteEntity(scene);

// Third paste: "bunny_copy_3"
clipboard.pasteEntity(scene);
```

The algorithm:

1. Try `{originalName}_copy`
2. If taken, try `{originalName}_copy_2`
3. If taken, try `{originalName}_copy_3`
4. Continue incrementing until a unique name is found

### Entity Cloning

Copied entities are deep-cloned using `structuredClone()`. This means:

- The pasted entity is completely independent of the original
- Modifying the original after copy does not affect clipboard contents
- Each paste creates a fresh clone from the clipboard snapshot
- `structuredClone()` handles all plain data types used by `AliceObject`
  (numbers, strings, objects, arrays, null)

### Discriminated Content

The clipboard uses a discriminated union internally:

```typescript
type ClipboardContent =
  | { type: "entity"; name: string; entityData: AliceObject }
  | { type: "code"; code: string };
```

Attempting to paste the wrong type (e.g., `pasteCode()` when an entity is
stored) throws a `TypeError` with a clear message.

---

## Project Manager

Async project lifecycle management wrapping `project-io.ts`. Handles create,
open, save, close operations with dirty tracking and a capped recent-files
list.

### Quick Start

```typescript
import { ProjectManager } from './project-manager';

const pm = new ProjectManager();

// Create a new project
pm.createProject('My World');
console.log(pm.projectName);  // "My World"
console.log(pm.isDirty);      // false

// Open from .a3p bytes
const buffer = await fetch('/projects/starter.a3p').then(r => r.arrayBuffer());
await pm.openProject(buffer, 'starter.a3p');
console.log(pm.projectName);    // parsed from archive
console.log(pm.currentPath);    // "starter.a3p"

// Save
const bytes = await pm.saveProject();
// bytes is Uint8Array — write to file/download/etc.

// Close
pm.closeProject();
console.log(pm.hasProject);  // false
```

### API

#### `new ProjectManager()`

Create a `ProjectManager` instance. No arguments. Starts with no project
loaded.

#### `pm.createProject(name?)`

```typescript
createProject(name?: string): void
```

Create a new, empty project. If a project is already loaded, it is
replaced (no save prompt — that is the caller's responsibility).

| Param | Type | Default | Description |
|---|---|---|---|
| `name` | `string` | `"Untitled"` | Project name |

The new project has:

- `version`: `"3.6.0.0"`
- `projectName`: provided name or `"Untitled"`
- Empty `sceneObjects`, `methods` arrays
- Empty `resources` map
- `null` manifest and thumbnail

After creation, `isDirty` is `false`.

#### `pm.openProject(data, path?)`

```typescript
async openProject(data: ArrayBuffer | Uint8Array, path?: string): Promise<void>
```

Open a project from `.a3p` bytes. Calls `readProject()` internally.

| Param | Type | Description |
|---|---|---|
| `data` | `ArrayBuffer \| Uint8Array` | Raw .a3p file bytes |
| `path` | `string` (optional) | File path/name for display and recent files |

After opening, `isDirty` is `false`. The path (if provided) is added to the
recent files list.

**Throws:** Propagates all errors from `readProject()` (invalid ZIP, missing
XML, ZIP bomb, path traversal).

#### `pm.saveProject()`

```typescript
async saveProject(): Promise<Uint8Array>
```

Serialize the current project to `.a3p` bytes. Calls `writeProject()`
internally.

**Returns:** `Promise<Uint8Array>` — the serialized archive.

After saving, `isDirty` is `false`.

**Throws:**
- `Error` if no project is loaded
- Propagates all errors from `writeProject()`

#### `pm.closeProject()`

```typescript
closeProject(): void
```

Close the current project. Clears all internal state. After closing,
`hasProject` is `false`.

Does nothing if no project is loaded.

#### `pm.hasProject`

```typescript
get hasProject(): boolean
```

`true` if a project is currently loaded (created or opened).

#### `pm.projectName`

```typescript
get projectName(): string | null
```

The current project name, or `null` if no project is loaded.

#### `pm.currentPath`

```typescript
get currentPath(): string | null
```

The file path associated with the current project, or `null`.

#### `pm.isDirty`

```typescript
get isDirty(): boolean
```

`true` if the project has been modified since the last save or open.

#### `pm.markDirty()`

```typescript
markDirty(): void
```

Mark the project as having unsaved changes. Call this after any mutation
(entity add/remove, scene edits, etc.).

**Throws:** `Error` if no project is loaded.

#### `pm.archive`

```typescript
get archive(): AliceProjectArchive | null
```

Direct access to the underlying `AliceProjectArchive`. Returns `null` if
no project is loaded.

### Recent Files

The project manager maintains a capped LRU list of recently opened file
paths.

#### `pm.recentFiles`

```typescript
get recentFiles(): readonly string[]
```

Returns the recent files list, most recent first. Maximum 10 entries.

#### `pm.clearRecentFiles()`

```typescript
clearRecentFiles(): void
```

Clear the recent files list.

### Recent Files Behavior

- Opening a project with a `path` adds it to the front of the list
- If the path already exists in the list, it is moved to the front (LRU)
- The list is capped at 10 entries — the oldest entry is dropped when
  adding an 11th
- `createProject()` does not add to recent files (no path yet)
- `saveProject()` does not modify recent files (path is set at open time)

```typescript
const pm = new ProjectManager();

await pm.openProject(buf1, 'project-a.a3p');
await pm.openProject(buf2, 'project-b.a3p');
await pm.openProject(buf3, 'project-a.a3p');  // moves to front

console.log(pm.recentFiles);
// ['project-a.a3p', 'project-b.a3p']
```

### Dirty Tracking

The project manager tracks whether the project has unsaved changes:

```typescript
const pm = new ProjectManager();
await pm.openProject(buffer, 'test.a3p');

console.log(pm.isDirty);  // false — just opened

pm.markDirty();
console.log(pm.isDirty);  // true — unsaved changes

const bytes = await pm.saveProject();
console.log(pm.isDirty);  // false — just saved
```

The `markDirty()` method is intentionally manual — the project manager does
not intercept scene mutations. The caller is responsible for calling
`markDirty()` after any change, typically in concert with the undo/redo
system:

```typescript
undoRedo.execute(cmd);
pm.markDirty();
```

---

## Integration Patterns

### Full Editor Setup

```typescript
import { ProjectManager } from './project-manager';
import { UndoRedoManager, AddEntityCommand } from './undo-redo';
import { Clipboard } from './clipboard';
import { Preferences } from './preferences';
import { Scene } from './story-api';
import { SProp } from './story-api';

// Initialize all subsystems
const pm = new ProjectManager();
const undoRedo = new UndoRedoManager();
const clipboard = new Clipboard();
const prefs = new Preferences();

// Open a project
const buffer = await fetch('/projects/starter.a3p').then(r => r.arrayBuffer());
await pm.openProject(buffer, 'starter.a3p');
const scene = Scene.fromProject(pm.archive!.project);

// Add an entity with undo support
const entity = new SProp();
const cmd = new AddEntityCommand(scene, 'myProp', entity);
undoRedo.execute(cmd);
pm.markDirty();

// Copy/paste
clipboard.copyEntity('myProp', scene);
const pastedName = clipboard.pasteEntity(scene);
pm.markDirty();

// Save
const bytes = await pm.saveProject();
```

### Undo/Redo + Dirty Tracking

```typescript
function executeCommand(cmd: Command): void {
  undoRedo.execute(cmd);
  pm.markDirty();
}

function handleUndo(): void {
  if (undoRedo.undo()) {
    pm.markDirty();
  }
}

function handleRedo(): void {
  if (undoRedo.redo()) {
    pm.markDirty();
  }
}
```

### Close with Save Prompt

```typescript
function handleClose(): boolean {
  if (pm.isDirty) {
    // Show "Save changes?" dialog
    const response = confirm('Save changes before closing?');
    if (response) {
      pm.saveProject().then(bytes => {
        // ... write bytes ...
        pm.closeProject();
        undoRedo.clear();
        clipboard.clear();
      });
      return false;  // async — don't close yet
    }
  }
  pm.closeProject();
  undoRedo.clear();
  clipboard.clear();
  return true;
}
```

### Preferences Persistence

```typescript
// Load on startup
const savedPrefs = localStorage.getItem('alice-prefs');
const prefs = savedPrefs
  ? Preferences.fromJSON(savedPrefs)
  : new Preferences();

// Apply settings
document.body.classList.toggle('dark-theme', prefs.get('theme') === 'dark');

// Save on change
prefs.set('theme', 'light');
localStorage.setItem('alice-prefs', prefs.toJSON());
```

---

## Module Dependencies

```
preferences.ts          (no deps — standalone)

undo-redo.ts            (depends on: story-api/scene, story-api/entities, story-api/types)

clipboard.ts            (depends on: story-api/scene, story-api/entities, a3p-parser)
                        (requires createEntityForType — currently unexported
                         from scene.ts; will be exported as part of this work)

project-manager.ts      (depends on: project-io, a3p-parser)
```

These four modules are independent of each other — none imports another.
Implementation order is preferences → undo-redo → clipboard →
project-manager, chosen to build from simplest to most complex.

## Relationship to Existing Modules

| Module | Role | Relationship |
|---|---|---|
| `project-io.ts` | Low-level archive read/write | Wrapped by `ProjectManager` |
| `a3p-parser.ts` | XML parsing from ZIP | Used by `project-io.ts`, types shared by clipboard |
| `story-api/scene.ts` | Runtime entity container | Mutated by undo-redo commands, queried by clipboard; `createEntityForType` will be exported for clipboard use |
| `story-api/entities.ts` | Entity class hierarchy | Instances stored in commands and clipboard |
| `story-api/types.ts` | Position, Orientation, Size | Used by undo-redo commands |

## Testing

Tests are in `test/`:

| Test File | Covers |
|---|---|
| `test/preferences.test.ts` | Get/set, validation, clamping, reset, JSON round-trip, corrupted input resilience |
| `test/undo-redo.test.ts` | All 6 command types, undo/redo symmetry, stack cap, composite commands, edge cases |
| `test/clipboard.test.ts` | Entity copy/paste, code copy/paste, unique name generation, deep clone isolation, empty clipboard errors |
| `test/project-manager.test.ts` | Create/open/save/close lifecycle, dirty tracking, recent files LRU, error propagation |

## Limitations

- **Clipboard is single-item.** Only one entity or code block at a time.
  Multi-select copy is not supported.
- **No filesystem integration.** `ProjectManager` operates on buffers. The
  caller is responsible for reading from / writing to the filesystem or
  network.
- **No auto-save.** `Preferences.autoSaveInterval` stores the user's
  preference, but the auto-save timer itself is the caller's responsibility.
- **Undo history is not persisted.** Closing and reopening a project clears
  the undo stack.
- **Dirty tracking is manual.** The caller must call `pm.markDirty()` after
  mutations. The project manager does not intercept scene changes.
- **No model-to-XML serializer.** New projects created via `createProject()`
  cannot be saved until XML source is provided (same limitation as
  `project-io.ts`).
- **`structuredClone()` requires Node 17+.** The project targets ES2022, so
  this is expected to be available.
