# Audio Playback API

The audio module (`src/audio.ts`) provides:

- a DOM-free `AudioPlayer` state machine for play/pause/stop events,
- `.a3p` ZIP audio extraction via `loadAudioFromA3P`, and
- `WebAudioPlayer`, which uses a real browser `AudioContext` when available and
  falls back to an explicit non-output simulation mode in Node.js tests.

Simulation mode is intentional: it validates state transitions but does **not**
produce sound. Code that needs audible output must use `WebAudioPlayer` in
`web-audio` mode with decoded audio.

## Exports

| Export | Kind | Purpose |
|---|---|---|
| `AudioResource` | interface | Raw audio bytes plus decode metadata |
| `AudioDecodeStatus` | type | `'decoded' \| 'decode-unavailable' \| 'decode-failed'` |
| `AudioRuntimeMode` | type | `'web-audio' \| 'simulation'` |
| `AudioPlayer` | class | DOM-free state machine for play/pause/stop |
| `WebAudioPlayer` | class | Browser-backed Web Audio output or explicit simulation |
| `loadAudioFromA3P` | function | Extract one audio resource from an `.a3p` ZIP path |

## Loading audio from an `.a3p`

```typescript
import { loadAudioFromA3P } from './audio';

const resource = await loadAudioFromA3P(projectBytes, 'resources/audio/theme.mp3', {
  audioContext,
});

console.log(resource.duration);     // decoded duration when decoding succeeds
console.log(resource.decodeStatus); // "decoded", "decode-unavailable", or "decode-failed"
```

`loadAudioFromA3P(data, resourcePath, options?)` extracts exactly one ZIP entry.
It does not scan the archive.

Decode behavior:

- If `options.decodeAudioData` is supplied, that decoder is used.
- Else if `options.audioContext.decodeAudioData` is supplied, that context is
  used.
- If no decoder/context is supplied, the resource is returned with `duration: 0`,
  `decodeStatus: "decode-unavailable"`, and no `decodedBuffer`.
- If decoding fails, the resource is returned with `duration: 0`,
  `decodeStatus: "decode-failed"`, and `decodeError`, unless
  `requireDecode: true` is set.

## `AudioResource`

```typescript
interface AudioResource {
  id: string;
  name: string;
  buffer: ArrayBuffer;
  duration: number;
  format: string;
  decodedBuffer?: AudioBufferLike;
  decodeStatus?: 'decoded' | 'decode-unavailable' | 'decode-failed';
  decodeError?: string;
}
```

`duration` is only an output-ready duration when `decodeStatus === "decoded"`.
A zero duration with `decode-unavailable` means the module has raw bytes but did
not decode the codec.

## DOM-free state machine

```typescript
const player = new AudioPlayer();
player.load(resource);
player.play();
player.pause();
player.play();
player.stop();
```

`AudioPlayer` tracks state and emits `load`, `play`, `pause`, and `stop`
callbacks. It does not claim to produce audible output.

## Web Audio output vs simulation

```typescript
const output = new WebAudioPlayer({ audioContext });
console.log(output.runtimeMode);   // "web-audio"
console.log(output.canOutputAudio); // true

output.load(resource); // resource must contain decodedBuffer for real output
output.play();
```

In `web-audio` mode, `play()` creates an `AudioBufferSourceNode`, connects it to
the gain node, and calls `start()`. If the resource has no `decodedBuffer`,
`play()` throws instead of pretending that sound was produced.

```typescript
const simulated = new WebAudioPlayer({ runtimeMode: 'simulation' });
console.log(simulated.runtimeMode);   // "simulation"
console.log(simulated.canOutputAudio); // false
```

Simulation mode is used when no browser `AudioContext` is available. It supports
the same state-machine methods for tests and server-side logic, but its graph is
non-output by design.

## Validation

The directly related tests are:

```bash
npm test -- test/audio.test.ts test/web-audio-player.test.ts
```
