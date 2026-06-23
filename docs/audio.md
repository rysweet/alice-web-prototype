# Audio

Alice supports project audio assets, background music intent,
animation-timed cue metadata, `.a3p` persistence, and browser playback
primitives through the Web Audio API.

Use this reference when you need exact formats, TypeScript APIs, server routes,
manifest shape, validation behavior, or the playback bridge contract. For a
full command-line walkthrough, see [Tutorial: Alice audio workflow](./tutorial-audio-workflow.md).

## Contents

- [Supported files](#supported-files)
- [Project audio model](#project-audio-model)
- [Project manifest storage](#project-manifest-storage)
- [Server API](#server-api)
- [TypeScript API](#typescript-api)
- [Runtime playback](#runtime-playback)
- [Configuration](#configuration)
- [Validation and errors](#validation-and-errors)
- [Evidence](#evidence)

## Supported files

Alice accepts these audio file extensions:

| Extension | Stored format |
| --- | --- |
| `.mp3` | `mp3` |
| `.wav` | `wav` |
| `.ogg` | `ogg` |
| `.m4a` | `m4a` |

Extensions are matched case-insensitively and normalized to lowercase in
project metadata. Unsupported files fail validation instead of being saved as
generic resources.

```typescript
import { ProjectAudio } from "./src/index.js";

console.log(ProjectAudio.getSupportedAudioFormats());
// [".mp3", ".wav", ".ogg", ".m4a"]
```

## Project audio model

Project audio state is owned by `src/project-audio.ts` and exported from the
root public API as `ProjectAudio`.

```typescript
interface ProjectAudioState {
  assets: ProjectAudioAsset[];
  backgroundMusic: ProjectAudioBackgroundMusic | null;
  cues: ProjectAudioCue[];
  nextAssetNumber: number;
}

interface ProjectAudioAsset {
  id: string;
  name: string;
  format: "mp3" | "wav" | "ogg" | "m4a";
  resourcePath: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

interface ProjectAudioBackgroundMusic {
  assetId: string;
  volume: number;
  loop: boolean;
}

interface ProjectAudioCue {
  id: string;
  assetId: string;
  animationId: string;
  timelineTimeSeconds: number;
  volume: number;
}
```

### Assets

Registering an asset stores bytes under `resources/audio/` and records metadata
in the project audio state.

```typescript
import { ProjectAudio } from "./src/index.js";

const state = ProjectAudio.createEmptyProjectAudioState();
const bytes = new Uint8Array([82, 73, 70, 70]); // beginning of a WAV-like byte stream

const asset = ProjectAudio.registerAudioAsset(state, {
  fileName: "intro.wav",
  bytes,
  durationSeconds: 1.0,
});

console.log(asset);
// {
//   id: "audio-1",
//   name: "intro.wav",
//   format: "wav",
//   resourcePath: "resources/audio/audio-1.wav",
//   sizeBytes: 4,
//   durationSeconds: 1
// }
```

`durationSeconds` is optional. Use `null` when the runtime has not decoded the
file yet.

### Background music

Background music points to one registered audio asset. The default volume is
`1`, and the default loop setting is `true`.

```typescript
const backgroundMusic = ProjectAudio.setBackgroundMusic(state, {
  assetId: "audio-1",
  volume: 0.75,
  loop: true,
});
```

This setting is stored project intent. The project audio model does not start
playback by itself. A runtime playback bridge must load the selected resource,
start it when world playback starts, apply `volume`, and honor `loop` until the
world stops or the background player is stopped.

### Animation-synchronized cues

Audio cues attach sound to animation timeline time. `animationId` is the stable
animation or procedure timeline identifier, and `timelineTimeSeconds` is the
time offset from the start of that animation.

```typescript
const cue = ProjectAudio.addAudioCue(state, {
  id: "intro-cue",
  assetId: "audio-1",
  animationId: "scene.myFirstMethod.spin",
  timelineTimeSeconds: 1.25,
  volume: 0.5,
});
```

This cue is stored project intent. A runtime playback bridge must watch the
named animation timeline and trigger each cue once when playback reaches or
crosses `timelineTimeSeconds`. The cue uses the selected asset and applies its
own volume before playback.

## Project manifest storage

Saved `.a3p` projects store audio in two places:

| Location | Content |
| --- | --- |
| `resources/audio/<asset-id>.<format>` | Raw audio bytes |
| `manifest.json` key `aliceAudio` | Asset metadata, background music, cue metadata |

Example manifest entry:

```json
{
  "aliceAudio": {
    "version": 1,
    "assets": [
      {
        "id": "audio-1",
        "name": "intro.wav",
        "format": "wav",
        "resourcePath": "resources/audio/audio-1.wav",
        "sizeBytes": 16044,
        "durationSeconds": 1
      }
    ],
    "backgroundMusic": {
      "assetId": "audio-1",
      "volume": 0.75,
      "loop": true
    },
    "cues": [
      {
        "id": "intro-cue",
        "assetId": "audio-1",
        "animationId": "scene.myFirstMethod.spin",
        "timelineTimeSeconds": 1.25,
        "volume": 0.5
      }
    ]
  }
}
```

`readProject()` preserves audio resource bytes as normal archive resources.
The Alice server reads `aliceAudio` into active server state during
`POST /api/launch`, and `POST /api/project/save` writes the current audio state
back into the saved archive.

Launch validates the `aliceAudio` shape and references between
`backgroundMusic`, `cues`, and `assets`. It does not verify that every
`asset.resourcePath` exists in the archive resource map. Import tools and the
runtime playback bridge should report a clear load error if an audio manifest
references missing bytes.

## Server API

Read-only audio routes are available before launch and do not require a local
API token. Mutating audio routes require a launched or newly created project and
use the same local API token rules as other mutating Alice routes. Send
`X-Alice-Local-Api-Token` with the token passed to `alice-web serve` or
`npm run serve`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/audio/formats` | List supported extensions |
| `GET` | `/api/audio/state` | Return active project audio state |
| `POST` | `/api/audio/assets` | Register an audio asset in the active project |
| `POST` | `/api/audio/background` | Configure background music |
| `POST` | `/api/audio/cues` | Add an animation-synchronized cue |
| `POST` | `/api/audio/evidence` | Write audio workflow evidence |

`GET /api/audio/state` returns the active audio state when a project has been
launched or the empty default state before launch.

### Register an asset

```bash
export AUDIO_BASE64="$(node -e 'process.stdout.write(require("fs").readFileSync("tmp/audio/intro.wav").toString("base64"))')"

curl -X POST http://127.0.0.1:3000/api/audio/assets \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"fileName\":\"intro.wav\",\"dataBase64\":\"$AUDIO_BASE64\",\"durationSeconds\":1}"
```

Response:

```json
{
  "status": "registered",
  "asset": {
    "id": "audio-1",
    "name": "intro.wav",
    "format": "wav",
    "resourcePath": "resources/audio/audio-1.wav",
    "sizeBytes": 16044,
    "durationSeconds": 1
  }
}
```

### Configure background music

```bash
curl -X POST http://127.0.0.1:3000/api/audio/background \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"assetId":"audio-1","volume":0.75,"loop":true}'
```

### Add a synchronized cue

```bash
curl -X POST http://127.0.0.1:3000/api/audio/cues \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":"intro-cue","assetId":"audio-1","animationId":"scene.myFirstMethod.spin","timelineTimeSeconds":1.25,"volume":0.5}'
```

### Inspect audio state

```bash
curl http://127.0.0.1:3000/api/audio/state
```

Response:

```json
{
  "supportedFormats": [".mp3", ".wav", ".ogg", ".m4a"],
  "assets": [
    {
      "id": "audio-1",
      "name": "intro.wav",
      "format": "wav",
      "resourcePath": "resources/audio/audio-1.wav",
      "sizeBytes": 16044,
      "durationSeconds": 1
    }
  ],
  "backgroundMusic": {
    "assetId": "audio-1",
    "volume": 0.75,
    "loop": true
  },
  "cues": [
    {
      "id": "intro-cue",
      "assetId": "audio-1",
      "animationId": "scene.myFirstMethod.spin",
      "timelineTimeSeconds": 1.25,
      "volume": 0.5
    }
  ]
}
```

## TypeScript API

### Project audio exports

```typescript
import { ProjectAudio } from "./src/index.js";
```

| Export | Kind | Purpose |
| --- | --- | --- |
| `SUPPORTED_AUDIO_FORMATS` | constant | `["mp3", "wav", "ogg", "m4a"]` |
| `SUPPORTED_AUDIO_EXTENSIONS` | constant | `[".mp3", ".wav", ".ogg", ".m4a"]` |
| `AUDIO_MANIFEST_KEY` | constant | Manifest key `aliceAudio` |
| `ProjectAudioError` | class | Validation error for project audio state |
| `createEmptyProjectAudioState()` | function | Create empty audio state |
| `isSupportedAudioFormat(format)` | function | Check lowercase or mixed-case format strings |
| `getSupportedAudioFormats()` | function | Return supported extensions |
| `registerAudioAsset(state, input)` | function | Add asset metadata and allocate `audio-N` id |
| `setBackgroundMusic(state, input)` | function | Set background music to a known asset |
| `addAudioCue(state, input)` | function | Add an animation-timed cue |
| `serializeAudioManifest(state)` | function | Convert state to manifest object value |
| `applyAudioManifest(manifest)` | function | Read manifest `aliceAudio` into state |
| `mergeAudioManifest(manifest, state)` | function | Return manifest with updated `aliceAudio` |

### Playback exports

```typescript
import { Audio } from "./src/index.js";
```

| Export | Kind | Purpose |
| --- | --- | --- |
| `AudioResource` | interface | Raw audio bytes plus decode metadata |
| `AudioDecodeStatus` | type | `"decoded"`, `"decode-unavailable"`, or `"decode-failed"` |
| `AudioRuntimeMode` | type | `"web-audio"` or `"simulation"` |
| `AudioPlayer` | class | DOM-free play, pause, stop state machine |
| `WebAudioPlayer` | class | Browser-backed Web Audio output or explicit simulation |
| `SoundResourceManager` | class | In-memory lookup by audio resource id |
| `SoundGroup` | class | Shared volume, pan, mute, pause, and stop controls |
| `loadAudioFromA3P` | function | Extract and optionally decode one audio resource |

## Runtime playback

`AudioPlayer` is a DOM-free state machine. It tracks loaded resource, state,
volume, pan, spatial mix, and event callbacks. It does not produce audible output
by itself.

```typescript
const player = new Audio.AudioPlayer();
player.load(resource);
player.play();
player.pause();
player.play();
player.stop();
```

`WebAudioPlayer` produces sound when a browser `AudioContext` and decoded buffer
are available.

```typescript
const audioContext = new AudioContext();
const resource = await Audio.loadAudioFromA3P(projectBytes, "resources/audio/audio-1.wav", {
  audioContext,
  requireDecode: true,
});

const output = new Audio.WebAudioPlayer({ audioContext });
output.load(resource);
output.setVolume(0.75);
output.play();
```

In `web-audio` mode, playback fails visibly if a resource has no decoded buffer.
In `simulation` mode, the same state-machine calls work for tests and server-side
logic but do not claim speaker output.

`loadAudioFromA3P()` extracts one archive entry and returns an `AudioResource`:

| Field | Source |
| --- | --- |
| `id` | requested archive `resourcePath` |
| `name` | basename of `resourcePath` |
| `buffer` | raw entry bytes |
| `format` | file extension without the dot, or `unknown` |
| `duration` | decoded buffer duration, or `0` when not decoded |
| `decodeStatus` | `decoded`, `decode-unavailable`, or `decode-failed` |

Decode behavior is explicit:

- Pass `audioContext` or `decodeAudioData` to decode bytes.
- Pass `decode: false` to skip decoding and return
  `decodeStatus: "decode-unavailable"`.
- If no decoder is available, the resource is metadata-only with
  `decodeStatus: "decode-unavailable"`.
- If decoding fails, the default result is `decodeStatus: "decode-failed"` with
  `decodeError`; pass `requireDecode: true` to throw instead.

The project-level playback bridge sits above these primitives. Its contract is
to resolve `ProjectAudio` assets to `AudioResource` values, start or stop
background music with world playback, and fire animation cues once as their
timelines cross the configured trigger time.

## Configuration

Audio workflow configuration is intentionally small:

| Setting | Default | Where it applies |
| --- | --- | --- |
| Supported extensions | `.mp3`, `.wav`, `.ogg`, `.m4a` | Import and server validation |
| Asset storage path | `resources/audio/<asset-id>.<format>` | Saved `.a3p` archive |
| Background volume | `1` | `setBackgroundMusic()` and `/api/audio/background` |
| Background loop | `true` | `setBackgroundMusic()` and `/api/audio/background` |
| Cue volume | `1` | `addAudioCue()` and `/api/audio/cues` |
| Maximum `dataBase64` request length | `1048576` characters | `/api/audio/assets` |

Local validation commands for large archive and audio workflow work should use
the project heap setting:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run build
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
```

Alice does not require a server flag to enable audio. The server keeps audio
state in the active project session and persists it during normal project save.

## Validation and errors

Project audio validation fails fast:

| Condition | Error behavior |
| --- | --- |
| Unsupported extension such as `.flac` | `ProjectAudioError: unsupported audio format` or HTTP `400` |
| Empty audio bytes | `ProjectAudioError: audio asset bytes must not be empty` or HTTP `400` |
| Invalid base64 request body | HTTP `400 { "error": "dataBase64 must be valid base64" }` |
| Unknown `assetId` | `ProjectAudioError: audio asset not found` or HTTP `400` |
| Duplicate cue id | `ProjectAudioError: audio cue already exists` or HTTP `400` |
| Non-finite or negative duration/time | `ProjectAudioError` or HTTP `400` |
| Volume outside `0..1` | `ProjectAudioError` or HTTP `400` |
| Malformed `aliceAudio` manifest | Launch fails with a corrupt or unsupported project error |
| `aliceAudio` asset `resourcePath` missing from archive resources | Manifest launch succeeds; playback resource loading should fail visibly |

Unsupported files are not silently dropped. Save and launch workflows either
preserve valid audio state or return a clear error.

## Evidence

`POST /api/audio/evidence` writes `audio-workflow.json` in the configured
evidence directory.

```bash
curl -X POST http://127.0.0.1:3000/api/audio/evidence \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"savedProjectArtifact":"saved-project.a3p","reloaded":true}'
```

Response:

```json
{
  "schema_version": "alice.audio-workflow-result/v1",
  "status": "proved",
  "evidenceArtifact": "evidence/audio-workflow.json"
}
```

Artifact shape:

```json
{
  "schema_version": "alice.audio-workflow/v1",
  "timestamp": 1710000000000,
  "source": "alice-web",
  "status": "proved",
  "support_level": "metadata-and-playback-bridge",
  "supported_formats": [".mp3", ".wav", ".ogg", ".m4a"],
  "asset_count": 1,
  "asset_names": ["intro.wav"],
  "background_music_configured": true,
  "cue_count": 1,
  "cue_ids": ["intro-cue"],
  "saved_project_artifact": "saved-project.a3p",
  "reloaded": true,
  "playback": {
    "mode": "simulated-output-bridge",
    "native_audio_playback": false,
    "background_music_started": true,
    "triggered_cue_ids": ["intro-cue"],
    "synchronized_animation_ids": ["scene.myFirstMethod"]
  },
  "doesNotClaim": [
    "native audio playback",
    "real speaker output in the browser or operating system",
    "full audio authoring pipeline",
    "native desktop audio stack coverage",
    "visible rendering correctness"
  ]
}
```

The evidence is bounded to workflow metadata, project persistence, and simulated
playback-bridge synchronization. It does not claim native audio playback,
speaker output, full authoring coverage, or desktop audio stack coverage.
`timestamp` is a dynamic runtime value.
