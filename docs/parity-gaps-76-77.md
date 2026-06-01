# Parity Gaps #76–#77: Audio Playback Pipeline & Project Lifecycle

Two final parity gaps with Java Alice are now closed: Web Audio API playback
with TTS support, and expanded project lifecycle management with backup/restore,
recent projects, and user-imported dynamic resources.

## Overview

| Gap | What changed | Issue |
|---|---|---|
| [Audio playback pipeline](#audio-playback-pipeline) | `WebAudioPlayer` wraps `AudioPlayer` with stub Web Audio API graph; `SayOutLoudAnimation` adds TTS via `SpeechSynthesis` stub | #76 |
| [Project lifecycle](#project-lifecycle) | `revertToLastSaved()`, `createBackup()`, `restoreFromBackup()` on `ProjectManager`; `DynamicResource` hierarchy; `RecentProjects` wiring | #77 |
| [Tests](#testing) | Full test coverage for all new code | #76, #77 |

All new APIs are exported from their respective modules and follow the existing
patterns in the codebase.

---

## Audio Playback Pipeline

### Web Audio API Layer

The existing `AudioPlayer` class (`src/audio.ts`) provides a DOM-free state
machine for play/pause/stop with event callbacks. The new `WebAudioPlayer`
wraps `AudioPlayer` with stub Web Audio API interfaces, enabling browser-like
audio graph composition without requiring a real browser environment.

#### Imports

```typescript
import {
  WebAudioPlayer,
  type StubAudioContext,
  type StubAudioDestinationNode,
  type StubGainNode,
  type StubAudioBufferSourceNode,
} from './audio';
```

#### StubAudioDestinationNode

A minimal stub representing the audio graph's output endpoint:

```typescript
interface StubAudioDestinationNode {
  readonly numberOfInputs: number;
  readonly numberOfOutputs: number;
  readonly channelCount: number;
}
```

#### StubAudioContext

A minimal stub matching the Web Audio API's `AudioContext` interface shape.
No actual audio processing occurs — all operations delegate to the inner
`AudioPlayer` state machine.

```typescript
interface StubAudioContext {
  readonly state: 'suspended' | 'running' | 'closed';
  readonly sampleRate: number;
  readonly currentTime: number;
  readonly destination: StubAudioDestinationNode;
  createGain(): StubGainNode;
  createBufferSource(): StubAudioBufferSourceNode;
  resume(): Promise<void>;
  suspend(): Promise<void>;
  close(): Promise<void>;
}
```

#### StubGainNode

```typescript
interface StubGainNode {
  gain: { value: number };
  connect(destination: StubAudioDestinationNode): void;
}
```

#### StubAudioBufferSourceNode

```typescript
interface StubAudioBufferSourceNode {
  buffer: ArrayBuffer | null;
  loop: boolean;
  start(when?: number): void;
  stop(when?: number): void;
  connect(destination: StubGainNode): void;
}
```

#### WebAudioPlayer Class

```typescript
class WebAudioPlayer {
  constructor();

  /** The stub AudioContext for this player */
  readonly audioContext: StubAudioContext;

  /** Delegate to inner AudioPlayer state */
  get state(): AudioPlayerState;
  get volume(): number;
  set volume(value: number);
  get resource(): AudioResource | null;

  /** Load an audio resource for playback */
  load(resource: AudioResource): void;

  /**
   * Load a resource by ID from a SoundResourceManager.
   * Resolves the resource via manager.get(), then loads it.
   * Parameter order matches AudioPlayer.loadFromManager().
   */
  loadFromManager(manager: SoundResourceManager, resourceId: string): void;

  /** Start or resume playback — creates source node and connects to gain */
  play(): void;

  /** Pause playback */
  pause(): void;

  /** Stop playback and disconnect source node */
  stop(): void;

  /** Set volume — clamps to [0, 1] and updates gain node */
  setVolume(value: number): void;

  /** Connect to the Web Audio graph (stub — records connection) */
  connect(): void;

  /** Register event callback on inner AudioPlayer */
  on(event: AudioEventType, callback: AudioEventCallback): () => void;

  /** Remove event callback */
  off(event: AudioEventType, callback: AudioEventCallback): void;
}
```

#### Usage

```typescript
import { WebAudioPlayer, AudioResource } from './audio';

const player = new WebAudioPlayer();

// Access the stub AudioContext
console.log(player.audioContext.state);      // 'suspended'
console.log(player.audioContext.sampleRate);  // 44100

// Load and play audio
const resource: AudioResource = {
  id: 'bgm-1',
  name: 'background.mp3',
  buffer: new ArrayBuffer(1024),
  duration: 120,
  format: 'mp3',
};
player.load(resource);
player.play();

console.log(player.state);                  // 'playing'
console.log(player.audioContext.state);      // 'running'

// Volume control (also updates gain node)
player.setVolume(0.5);
console.log(player.volume);                 // 0.5

// Pause and resume
player.pause();
console.log(player.state);                  // 'paused'
player.play();

// Stop playback
player.stop();
console.log(player.state);                  // 'stopped'
```

#### Loading from SoundResourceManager

```typescript
import { WebAudioPlayer, SoundResourceManager, AudioResource } from './audio';

const manager = new SoundResourceManager();
manager.register({
  id: 'hop',
  name: 'hop.wav',
  buffer: new ArrayBuffer(512),
  duration: 0.5,
  format: 'wav',
});

const player = new WebAudioPlayer();
player.loadFromManager(manager, 'hop');
player.play();
```

### SayOutLoud TTS Animation

The `SayOutLoudAnimation` class (`src/entity-animation.ts`) provides
text-to-speech playback parity with Java Alice's `SayOutLoud` procedure.
It uses stub `SpeechSynthesis` interfaces for testability in Node.js.

#### Imports

```typescript
import {
  SayOutLoudAnimation,
  type SpeechUtteranceOptions,
  type StubSpeechUtterance,
} from './entity-animation';
```

#### StubSpeechUtterance

A stub matching the browser's `SpeechSynthesisUtterance` interface shape:

```typescript
interface StubSpeechUtterance {
  readonly text: string;
  rate: number;
  pitch: number;
  volume: number;
}
```

#### SpeechUtteranceOptions

```typescript
interface SpeechUtteranceOptions {
  text: string;
  rate?: number;    // Speech rate multiplier, default 1.0. Must be > 0.
  pitch?: number;   // Pitch multiplier, default 1.0. Must be > 0.
  volume?: number;  // Volume [0, 1], default 1.0.
}
```

#### SayOutLoudAnimation Class

Implements `AnimationClip` directly with its own elapsed-time accumulator.
The constructor creates the `StubSpeechUtterance` immediately (matching
the "apply on construct" pattern used by `SayAnimation`), but unlike
`SayAnimation` (which delegates to `ImmediateAnimation` and completes on
first `update()` regardless of `deltaMs`), `SayOutLoudAnimation` accumulates
`deltaMs` across `update()` calls and reports `progress = elapsed / durationMs`.

The estimated duration is `(text.length / (rate * 5)) * 1000` milliseconds
(approximately 5 characters per second at rate 1.0). This elapsed-time
tracking enables meaningful composition with `doTogether` and `doInOrder` —
the TTS animation runs for its full estimated duration alongside other
animations rather than completing instantly.

```typescript
class SayOutLoudAnimation implements AnimationClip {
  constructor(options: SpeechUtteranceOptions);

  /** The stub utterance created for this animation */
  readonly utterance: StubSpeechUtterance;

  /** Estimated duration in milliseconds */
  readonly durationMs: number;

  get elapsedMs(): number;
  get progress(): number;
  get complete(): boolean;
  get isComplete(): boolean;

  update(deltaMs: number): AnimationClipState;
  reset(): void;
}
```

#### Usage

```typescript
import { SayOutLoudAnimation } from './entity-animation';

// Basic TTS animation
const tts = new SayOutLoudAnimation({ text: 'Hello, world!' });
console.log(tts.durationMs);                // ~2600ms (13 chars / 5 * 1000)
console.log(tts.utterance.text);            // 'Hello, world!'
console.log(tts.utterance.rate);            // 1.0
console.log(tts.utterance.volume);          // 1.0

// Advance the animation
const state = tts.update(1000);
console.log(state.complete);                // false (still playing)

const finalState = tts.update(2000);
console.log(finalState.complete);           // true

// Custom speech parameters
const fast = new SayOutLoudAnimation({
  text: 'Speed reading!',
  rate: 2.0,
  pitch: 1.2,
  volume: 0.8,
});
console.log(fast.durationMs);              // ~1400ms (14 chars / (2 * 5) * 1000)
console.log(fast.utterance.rate);          // 2.0
console.log(fast.utterance.pitch);         // 1.2
```

#### Composing with Other Animations

```typescript
import { doInOrder, doTogether } from './animation';
import { SayOutLoudAnimation, MoveAnimation } from './entity-animation';

// Say something while moving
const sayAndMove = doTogether([
  new SayOutLoudAnimation({ text: 'Watch me walk!' }),
  new MoveAnimation(bunny, { x: 5, y: 0, z: 0 }, 3000),
]);

// Say things in sequence
const dialogue = doInOrder([
  new SayOutLoudAnimation({ text: 'First line.' }),
  new SayOutLoudAnimation({ text: 'Second line.' }),
]);
```

#### Input Validation

| Parameter | Constraint | On violation |
|---|---|---|
| `text` | Must be a non-empty string | Throws `Error` |
| `rate` | Must be > 0 and finite | Throws `TypeError` |
| `pitch` | Must be > 0 and finite | Throws `TypeError` |
| `volume` | Clamped to [0, 1] | Silent clamp |

---

## Project Lifecycle

### Backup and Restore

Three new methods on `ProjectManager` (`src/project-manager.ts`) provide
explicit backup/restore workflows beyond the auto-backup that already occurs
on `save()`.

#### `createBackup(label?)`

Create an explicit backup of the current project state.

```typescript
createBackup(label?: string): ProjectBackup
```

Serializes the current archive and stores it in the backup history with a
timestamp. The optional `label` parameter is stored as the `fileName` on the
backup entry (defaults to the current file name or `"manual-backup"`).

**Preconditions:**
- A project must be open (`isOpen === true`)

**Throws:** `Error` if no project is loaded.

```typescript
const pm = new ProjectManager();
pm.create();

const backup = pm.createBackup('before-refactor');
console.log(backup.fileName);    // 'before-refactor'
console.log(backup.timestamp);   // Date.now()-style number
console.log(backup.data.length); // serialized .a3p bytes
```

#### `restoreFromBackup(timestamp)`

Restore the project from a specific backup identified by timestamp.

```typescript
async restoreFromBackup(timestamp: number): Promise<void>
```

Finds the backup matching the given timestamp, reads the project from the
backup data, and replaces the current archive state.

**Preconditions:**
- `timestamp` must be a finite number
- A backup with the matching timestamp must exist

**Throws:**

| Error | Condition |
|---|---|
| `TypeError` | `timestamp` is `NaN`, `Infinity`, or not a number |
| `Error` | No backup found with the given timestamp |

```typescript
const pm = new ProjectManager();
await pm.open(data, 'my-project.a3p');

const backup = pm.createBackup();
const savedTimestamp = backup.timestamp;

// Make changes...
pm.markDirty();

// Restore to the backup
await pm.restoreFromBackup(savedTimestamp);
console.log(pm.isDirty);   // false
```

#### `revertToLastSaved()`

Revert the project to the last saved state (the data from the most recent
`save()` or `open()` call).

```typescript
async revertToLastSaved(): Promise<void>
```

Re-reads the project from `_lastSavedData` via `readProject()`, resets the
dirty flag, and replaces the current archive.

**Throws:** `Error("No saved state to revert to")` if no saved data exists
(e.g., on a newly created project that has never been saved or opened from
a file).

```typescript
const pm = new ProjectManager();
await pm.open(data, 'story.a3p');

// Original project name
console.log(pm.currentArchive!.project.projectName);  // 'MyStory'

// Modify the project
pm.currentArchive!.project.projectName = 'Modified';
pm.markDirty();

// Revert to the last saved state
await pm.revertToLastSaved();
console.log(pm.currentArchive!.project.projectName);  // 'MyStory'
console.log(pm.isDirty);                               // false
```

### Recent Projects

The existing `RecentFile` interface and `recentFiles` getter on
`ProjectManager` already provide a recent-projects list with timestamps,
project names, resource counts, and migration status. This is now fully
exercised through the lifecycle methods.

```typescript
interface RecentFile {
  fileName: string;
  timestamp: number;
  projectName: string | null;
  projectVersion: string | null;
  resourceCount: number;
  thumbnailPresent: boolean;
  migrated: boolean;
}
```

**Usage:**

```typescript
const pm = new ProjectManager();

// Open several projects
await pm.open(data1, 'project-a.a3p');
await pm.open(data2, 'project-b.a3p');
await pm.open(data3, 'project-c.a3p');

// Recent files are sorted most-recent-first
const recent = pm.recentFiles;
console.log(recent[0].fileName);   // 'project-c.a3p'
console.log(recent[1].fileName);   // 'project-b.a3p'
console.log(recent[2].fileName);   // 'project-a.a3p'

// Each entry has metadata
console.log(recent[0].projectName);       // e.g. 'Program'
console.log(recent[0].timestamp);         // Date.now()-style number
console.log(recent[0].resourceCount);     // number of resources in the archive
console.log(recent[0].thumbnailPresent);  // true/false

// Clear the list
pm.clearRecentFiles();
console.log(pm.recentFiles.length);  // 0
```

The maximum number of recent files is 10 (`MAX_RECENT_FILES`). Opening
the same file again moves it to the top without creating a duplicate.

---

## Dynamic Resources

### Overview

The `DynamicResource` hierarchy (`src/resource-system.ts`) enables
user-imported assets at runtime — assets that don't come from an `.a3p`
archive but are loaded by the user (drag-and-drop, file picker, network
fetch, etc.).

Dynamic resources extend the existing `ResourceBase` class and can be
registered in the `ResourceManager` alongside archive-loaded resources.

### ResourceBase Export

`ResourceBase` is now exported from `resource-system.ts`, enabling external
subclassing:

```typescript
export { ResourceBase } from './resource-system';
```

### ResourceKind Expansion

`ResourceKind` now includes `"dynamic"`:

```typescript
type ResourceKind = "model" | "audio" | "image" | "dynamic";
```

The `ProjectResource` union is also widened:

```typescript
type ProjectResource = ModelResource | AudioResource | ImageResource | DynamicResource;
```

### DynamicResource Base Class

```typescript
class DynamicResource extends ResourceBase {
  readonly data: ArrayBuffer;
  readonly source: "runtime";

  constructor(
    kind: ResourceKind,
    id: string,
    name: string,
    data: ArrayBuffer,
    tags?: readonly string[],
  );
}
```

The `data` field holds the raw asset bytes. A defensive copy is made in the
constructor (`data.slice(0)`) to prevent external mutation.

The `source` field is always `"runtime"`, distinguishing dynamic resources
from archive-loaded ones.

#### Usage

```typescript
import { DynamicResource } from './resource-system';

const res = new DynamicResource(
  'dynamic',
  'user-texture-1',
  'custom-skin.png',
  imageBuffer,
  ['user-imported'],
);

console.log(res.kind);     // 'dynamic'
console.log(res.source);   // 'runtime'
console.log(res.data);     // ArrayBuffer (defensive copy)
console.log(res.hasTag('user-imported'));  // true
```

### Typed Subtypes

Three typed subtypes provide convenience constructors for common asset types:

#### DynamicModelResource

```typescript
class DynamicModelResource extends DynamicResource {
  constructor(id: string, name: string, data: ArrayBuffer, tags?: readonly string[]);
  // kind is set to 'model'
}
```

#### DynamicAudioResource

```typescript
class DynamicAudioResource extends DynamicResource {
  constructor(id: string, name: string, data: ArrayBuffer, tags?: readonly string[]);
  // kind is set to 'audio'
}
```

#### DynamicImageResource

```typescript
class DynamicImageResource extends DynamicResource {
  constructor(id: string, name: string, data: ArrayBuffer, tags?: readonly string[]);
  // kind is set to 'image'
}
```

#### Subtype Usage

```typescript
import {
  DynamicModelResource,
  DynamicAudioResource,
  DynamicImageResource,
} from './resource-system';

const model = new DynamicModelResource('dyn-m1', 'custom-bunny.obj', objBuffer);
console.log(model.kind);    // 'model'
console.log(model.source);  // 'runtime'

const audio = new DynamicAudioResource('dyn-a1', 'user-music.mp3', mp3Buffer);
console.log(audio.kind);    // 'audio'

const image = new DynamicImageResource('dyn-i1', 'user-bg.png', pngBuffer);
console.log(image.kind);    // 'image'
```

### ResourceManager Integration

The `ResourceManager` class gains a `registerDynamic()` convenience method:

```typescript
class ResourceManager {
  /** Register a DynamicResource in the specified bundle (default: "dynamic") */
  registerDynamic(resource: DynamicResource, bundleId?: string): this;
}
```

**Usage:**

```typescript
import { ResourceManager, DynamicImageResource } from './resource-system';

const manager = new ResourceManager();

const texture = new DynamicImageResource(
  'user-tex-1',
  'custom-texture.png',
  pngBuffer,
);

manager.registerDynamic(texture);

// Query — dynamic resources appear alongside archive resources
const allImages = manager.listResources('image');
console.log(allImages.some(r => r.id === 'user-tex-1'));  // true

// Retrieve
const retrieved = manager.getResource('user-tex-1');
console.log(retrieved instanceof DynamicImageResource);  // true
```

### Input Validation

| Parameter | Constraint | On violation |
|---|---|---|
| `id` | Non-empty string (trimmed) | Throws `Error("Resource id cannot be empty")` |
| `name` | Non-empty string (trimmed) | Throws `Error("Resource name cannot be empty")` |
| `data` | Must be an `ArrayBuffer` | Throws `TypeError` |
| `restoreFromBackup(timestamp)` | `Number.isFinite(timestamp)` | Throws `TypeError` |

---

## Testing

### New Test Files

| File | Covers |
|---|---|
| `test/web-audio-player.test.ts` | `WebAudioPlayer` construction, load, play/pause/stop, volume, context state, `loadFromManager` |
| `test/say-out-loud-animation.test.ts` | `SayOutLoudAnimation` duration estimation, utterance properties, update lifecycle, reset, validation |
| `test/project-manager-lifecycle.test.ts` | `createBackup`, `restoreFromBackup`, `revertToLastSaved`, recent files wiring |
| `test/dynamic-resource.test.ts` | `DynamicResource` + subtypes construction, defensive copy, `registerDynamic`, query |

### Running Tests

```bash
# All tests
npm test

# Specific test files
npx vitest run test/web-audio-player.test.ts
npx vitest run test/say-out-loud-animation.test.ts
npx vitest run test/project-manager-lifecycle.test.ts
npx vitest run test/dynamic-resource.test.ts
```

### Test Coverage Summary

#### WebAudioPlayer Tests

- Construction creates stub AudioContext in `'suspended'` state
- `load()` sets resource on inner player
- `play()` transitions to `'playing'`, context to `'running'`
- `pause()` transitions to `'paused'`, context to `'suspended'`
- `stop()` transitions to `'stopped'`
- `setVolume()` updates volume and gain node value
- Volume clamped to [0, 1]
- `play()` without `load()` throws
- `loadFromManager()` resolves resource from SoundResourceManager
- `loadFromManager()` with unknown ID throws
- Event callbacks fire through inner player

#### SayOutLoudAnimation Tests

- Duration estimated as `text.length / (rate * 5) * 1000`
- Default rate=1.0, pitch=1.0, volume=1.0
- Custom rate/pitch/volume reflected on utterance
- `update()` advances progress toward estimated duration
- Animation completes when elapsed ≥ duration
- `reset()` restarts animation
- Empty text throws `Error`
- Rate ≤ 0 throws `TypeError`
- Pitch ≤ 0 throws `TypeError`
- Volume clamped to [0, 1]
- Composable with `doInOrder`/`doTogether`

#### Project Lifecycle Tests

- `createBackup()` stores serialized archive in backup history
- `createBackup()` with label sets backup fileName
- `createBackup()` without project throws
- `restoreFromBackup()` restores archive from backup data
- `restoreFromBackup()` resets dirty flag
- `restoreFromBackup()` with non-existent timestamp throws
- `restoreFromBackup()` with NaN/Infinity throws TypeError
- `revertToLastSaved()` restores from last save/open data
- `revertToLastSaved()` resets dirty flag
- `revertToLastSaved()` on never-saved project throws
- Recent files updated on open/save/saveAs
- Recent files sorted most-recent-first
- Duplicate file names move to top

#### Dynamic Resource Tests

- `DynamicResource` construction with valid params
- `DynamicResource` defensive copy of data buffer
- Empty id/name throws
- `DynamicModelResource` sets kind to `'model'`
- `DynamicAudioResource` sets kind to `'audio'`
- `DynamicImageResource` sets kind to `'image'`
- All subtypes have `source === 'runtime'`
- `registerDynamic()` adds to manager
- Dynamic resources queryable via `listResources()`
- Dynamic resources queryable via `getResource()`
- Tag filtering works on dynamic resources

---

## Architecture

### File Changes

| File | Changes |
|---|---|
| `src/audio.ts` | Added `StubAudioContext`, `StubGainNode`, `StubAudioBufferSourceNode` interfaces; `WebAudioPlayer` class |
| `src/entity-animation.ts` | Added `StubSpeechUtterance` interface, `SpeechUtteranceOptions` type, `SayOutLoudAnimation` class |
| `src/project-manager.ts` | Added `revertToLastSaved()`, `createBackup()`, `restoreFromBackup()` methods |
| `src/resource-system.ts` | Exported `ResourceBase`; widened `ResourceKind` to include `'dynamic'`; added `DynamicResource` + 3 subtypes; widened `ProjectResource` union; added `registerDynamic()` to `ResourceManager` |

### New Test Files

| File | Tests |
|---|---|
| `test/web-audio-player.test.ts` | ~11 tests |
| `test/say-out-loud-animation.test.ts` | ~11 tests |
| `test/project-manager-lifecycle.test.ts` | ~13 tests |
| `test/dynamic-resource.test.ts` | ~11 tests |

### Design Decisions

1. **Composition over inheritance for WebAudioPlayer.** `WebAudioPlayer`
   wraps `AudioPlayer` rather than extending it. This keeps the inner state
   machine testable independently and avoids coupling Web Audio API concerns
   to the core playback logic.

2. **Stub interfaces, not mocks.** The Web Audio API and SpeechSynthesis
   interfaces are TypeScript `interface` declarations with minimal stub
   implementations. No mock library is needed — the stubs are production code
   that happens to be functional in Node.js.

3. **Duration-based TTS animation, not ImmediateAnimation.** Real
   `SpeechSynthesis` completion timing is unpredictable. The formula
   `text.length / (rate * 5) * 1000`ms provides a consistent, testable
   approximation. `SayOutLoudAnimation` implements `AnimationClip` directly
   with an elapsed-time accumulator — it must NOT delegate to
   `ImmediateAnimation` because that would complete on first `update()`
   regardless of `deltaMs`, breaking `doTogether`/`doInOrder` composition.
   The utterance stub is created in the constructor (matching the "apply on
   construct" pattern), but animation completion is driven by elapsed time.

4. **Defensive copy for DynamicResource data.** `ArrayBuffer` is mutable.
   The constructor calls `data.slice(0)` to prevent external code from
   mutating the resource's backing data after construction.

5. **`ResourceKind` widening.** Adding `'dynamic'` to the union is additive.
   Existing code filtering on `'model' | 'audio' | 'image'` continues to
   work — dynamic resources are only visible when explicitly queried.

## Caveats

- **`AudioResource` name collision.** Both `src/audio.ts` and
  `src/resource-system.ts` export a type named `AudioResource`. The
  `audio.ts` `AudioResource` is an interface with `{ id, name, buffer,
  duration, format }` used by `AudioPlayer` and `WebAudioPlayer`. The
  `resource-system.ts` `AudioResource` is a class extending `ResourceBase`
  with `{ id, name, durationSeconds, format, looping }`. Consumers that
  import from both modules must use qualified names or aliases.

- **`ResourceBase` export implications.** Exporting `ResourceBase` allows
  external subclassing beyond the `DynamicResource` hierarchy. This is
  intentional — but consumers should prefer the typed constructors
  (`DynamicModelResource`, etc.) unless they have a genuine need for a
  custom `ResourceKind`.

- **`SayOutLoudAnimation` is NOT `ImmediateAnimation`.** Unlike
  `SayAnimation`, `ThinkAnimation`, and `PlayAudioAnimation` (which all
  delegate to `ImmediateAnimation` and complete on first `update()`),
  `SayOutLoudAnimation` must implement its own elapsed-time accumulator.
  Wrapping `ImmediateAnimation` would break `doTogether`/`doInOrder`
  composition because the animation would report `complete: true` before
  its estimated duration elapses.

## Limitations

- **No real audio decoding.** `WebAudioPlayer` is a stub — it tracks state
  but does not decode or output audio. Real playback requires a browser
  `AudioContext`.
- **No real TTS.** `SayOutLoudAnimation` does not speak — it estimates
  duration and tracks animation state. Real TTS requires a browser
  `SpeechSynthesis` API.
- **No streaming resources.** `DynamicResource` stores the entire asset in
  memory as an `ArrayBuffer`. There is no streaming or chunked-loading
  variant.
- **Backup storage is in-memory.** `ProjectManager` backups are not
  persisted to disk. They are lost when the process exits. Persistent backup
  storage is an out-of-scope enhancement.
- **No undo/redo.** `revertToLastSaved()` and `restoreFromBackup()` replace
  the entire project state. There is no incremental undo/redo stack.
