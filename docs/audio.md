# Audio Playback API

The audio module (`src/audio.ts`) provides DOM-free audio resource loading from
Alice `.a3p` project files and a state-machine-based `AudioPlayer` with event
callbacks. It is fully testable in Node.js without Web Audio API dependencies.

## Overview

| Export | Kind | Purpose |
|---|---|---|
| `AudioResource` | interface | Loaded audio data: id, name, buffer, duration, format |
| `AudioPlayer` | class | State machine for play/pause/stop with volume control |
| `AudioPlayerState` | type | `'stopped' \| 'playing' \| 'paused'` |
| `AudioPlayerEvent` | type | Union of event names: `'play' \| 'pause' \| 'stop' \| 'end' \| 'error'` |
| `loadAudioFromA3P` | function | Extract audio resources from a parsed `.a3p` ZIP |

## Quick Start

### Loading Audio from an `.a3p` File

```typescript
import { parseA3P } from './a3p-parser';
import { loadAudioFromA3P, AudioPlayer } from './audio';

const project = await parseA3P(buffer);

// Extract all audio resources from the project ZIP
const resources = await loadAudioFromA3P(buffer);
console.log(resources.length);      // e.g. 2
console.log(resources[0].name);     // e.g. "backgroundMusic"
console.log(resources[0].format);   // e.g. "mp3"
console.log(resources[0].duration); // e.g. 0 (stub — no real decoding)
```

### Playing Audio

```typescript
const player = new AudioPlayer();

// Load a resource
player.load(resources[0]);

// Control playback
player.play();
console.log(player.state); // "playing"

player.pause();
console.log(player.state); // "paused"

player.play();  // resume from paused
player.stop();
console.log(player.state); // "stopped"

// Volume control (0.0 – 1.0)
player.volume = 0.75;
console.log(player.volume); // 0.75
```

### Event Callbacks

```typescript
const player = new AudioPlayer();
player.load(resources[0]);

player.on('play', () => console.log('Playback started'));
player.on('pause', () => console.log('Playback paused'));
player.on('stop', () => console.log('Playback stopped'));
player.on('end', () => console.log('Playback finished'));
player.on('error', (err) => console.log('Error:', err.message));

player.play();
// logs: Playback started
```

## API Reference

### `AudioResource`

```typescript
interface AudioResource {
  /** Unique identifier within the project */
  id: string;
  /** Human-readable name (derived from ZIP entry path) */
  name: string;
  /** Raw audio data */
  buffer: ArrayBuffer;
  /** Duration in seconds (0 when codec decoding is not available) */
  duration: number;
  /** Audio format: "mp3", "wav", "ogg", or "unknown" */
  format: string;
}
```

`AudioResource` is a plain data type — no methods, no DOM dependencies.
Duration is reported as `0` in the stub implementation since real codec
decoding requires Web Audio API or native bindings. The buffer contains the raw
file bytes for downstream consumers that can decode them.

### `loadAudioFromA3P(data: ArrayBuffer | Uint8Array): Promise<AudioResource[]>`

Extract audio resources from an Alice `.a3p` ZIP archive.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `ArrayBuffer \| Uint8Array` | Raw `.a3p` file contents |

**Returns:** Array of `AudioResource` objects, one per audio file found in the ZIP.

**Behavior:**

- Scans all ZIP entries for files matching audio extensions (`.mp3`, `.wav`, `.ogg`).
- Validates that the resource path resolves to an existing ZIP entry.
- Derives `name` from the file path (filename without extension).
- Derives `format` from the file extension.
- Sets `duration` to `0` (stub — no real codec decoding).

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | Invalid or corrupt ZIP data |

### `new AudioPlayer()`

Creates an audio player in the `stopped` state with volume `1.0` and no loaded
resource.

### `player.load(resource: AudioResource): void`

Load an audio resource for playback. Stops any current playback and resets
state to `stopped`.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | `resource` is null or undefined |

### `player.play(): void`

Start or resume playback.

**State transitions:**

| Current State | Action |
|---|---|
| `stopped` | Starts playback from beginning → `playing` |
| `paused` | Resumes from pause point → `playing` |
| `playing` | No-op (already playing) |

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | No resource loaded (call `load()` first) |

**Events:** Emits `'play'` on state change.

### `player.pause(): void`

Pause playback.

**State transitions:**

| Current State | Action |
|---|---|
| `playing` | Pauses playback → `paused` |
| `paused` | No-op (already paused) |
| `stopped` | No-op (nothing to pause) |

**Events:** Emits `'pause'` on state change.

### `player.stop(): void`

Stop playback and reset position.

**State transitions:**

| Current State | Action |
|---|---|
| `playing` | Stops playback, resets position → `stopped` |
| `paused` | Resets position → `stopped` |
| `stopped` | No-op (already stopped) |

**Events:** Emits `'stop'` on state change.

### `player.state: AudioPlayerState`

Read-only property returning the current playback state.

```typescript
type AudioPlayerState = 'stopped' | 'playing' | 'paused';
```

### `player.volume: number`

Get or set the playback volume. Clamped to `[0.0, 1.0]`.

```typescript
player.volume = 1.5;    // clamped to 1.0
player.volume = -0.5;   // clamped to 0.0
console.log(player.volume); // 0.0
```

### `player.resource: AudioResource | null`

Read-only property returning the currently loaded resource, or `null` if none.

### `player.on(event: AudioPlayerEvent, callback: Function): () => void`

Register an event listener. Returns an unsubscribe function.

**Events:**

| Event | Callback Signature | When |
|---|---|---|
| `'play'` | `() => void` | Playback starts or resumes |
| `'pause'` | `() => void` | Playback paused |
| `'stop'` | `() => void` | Playback stopped |
| `'end'` | `() => void` | Playback reached end of resource |
| `'error'` | `(error: Error) => void` | An error occurred |

```typescript
const unsub = player.on('play', () => { /* ... */ });
// later:
unsub(); // removes the listener
```

### `player.off(event: AudioPlayerEvent, callback: Function): void`

Remove a specific event listener.

### `player.removeAllListeners(): void`

Remove all event listeners from all events.

## State Machine

```
                 load()
    ┌──────────────────────────────────┐
    │                                  ▼
    │    ┌─────────┐   play()    ┌─────────┐
    │    │ stopped │────────────▶│ playing │
    │    └─────────┘             └─────────┘
    │         ▲                    │     │
    │         │ stop()      pause()│     │ stop()
    │         │                    ▼     │
    │         │              ┌─────────┐ │
    │         └──────────────│ paused  │◀┘
    │                        └─────────┘
    │                          │
    │         play()           │
    │         ┌────────────────┘
    │         ▼
    │    ┌─────────┐
    └───▶│ playing │
         └─────────┘
```

- `load()` always transitions to `stopped` regardless of current state.
- `play()` on `stopped` starts from the beginning.
- `play()` on `paused` resumes from where it was paused.
- `play()` on `playing` is a no-op (no event emitted).
- `pause()` on `stopped` is a no-op.
- `stop()` on `stopped` is a no-op.

## Integration with Scene Manager

```typescript
import { SceneManager } from './scene-manager';
import { AudioPlayer, loadAudioFromA3P } from './audio';

const manager = new SceneManager();
const player = new AudioPlayer();

// Load audio from the project
const resources = await loadAudioFromA3P(projectBuffer);
const bgMusic = resources.find(r => r.name === 'backgroundMusic');

if (bgMusic) {
  player.load(bgMusic);
}

// Stop audio on scene transitions
manager.onTransition((from, to) => {
  player.stop();
  // Optionally load scene-specific audio here
});

manager.addScene('intro', project);
player.play();
```

## Error Handling

All errors are standard `Error` instances:

- `"No resource loaded"` — `play()` called without `load()`.
- `"Resource is required"` — `load(null)` or `load(undefined)`.
- `"Invalid or corrupt ZIP data"` — `loadAudioFromA3P()` with bad input.

Volume values are silently clamped rather than throwing.

## Testing

```bash
npx vitest run test/audio.test.ts
```

Tests are fully DOM-free and cover:

- Initial state is `stopped`, volume is `1.0`, resource is `null`
- `load()` sets resource and resets state
- `play()` transitions stopped → playing
- `play()` transitions paused → playing (resume)
- `play()` on playing is no-op
- `pause()` transitions playing → paused
- `pause()` on stopped is no-op
- `stop()` transitions playing → stopped
- `stop()` transitions paused → stopped
- `stop()` on stopped is no-op
- `play()` without load throws
- Volume clamping at 0 and 1
- Event callbacks fire on state transitions
- Unsubscribe function works
- `removeAllListeners()` clears all callbacks
- `load()` stops current playback
- `loadAudioFromA3P()` extracts resources from ZIP
- `loadAudioFromA3P()` returns empty array for projects with no audio
