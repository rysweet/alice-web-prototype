---
title: Audio workflow usage
description: Usage for loading, registering, playing, saving, and exporting Alice project audio.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: howto
---

# Audio workflow usage

Use this guide to add audio to an Alice project, set background audio, create
cues, play audio in the browser, and preserve audio through save and export.

## Contents

- [Start with the public package surface](#start-with-the-public-package-surface)
- [Load audio from an `.a3p`](#load-audio-from-an-a3p)
- [Play decoded audio in the browser](#play-decoded-audio-in-the-browser)
- [Use resource groups](#use-resource-groups)
- [Add audio through the local API](#add-audio-through-the-local-api)
- [Save and export](#save-and-export)
- [Handle errors](#handle-errors)

## Start with the public package surface

Current playback and resource primitives:

```typescript
import { Audio } from "alice-web";

const player = new Audio.AudioPlayer();

console.log(player.state);
```

Project audio helpers:

```typescript
import { ProjectAudio } from "alice-web";

const state = ProjectAudio.createDefaultProjectAudioState();

console.log(state.manifestVersion);
```

Use `Audio` for playback and resource loading. Use `ProjectAudio` for project
state, background track settings, and cues.

## Load audio from an `.a3p`

```typescript
import { Audio } from "alice-web";

const resource = await Audio.loadAudioFromA3P(
  projectBytes,
  "resources/audio/theme.wav",
  { decode: false },
);

console.log(resource.id);           // resources/audio/theme.wav
console.log(resource.decodeStatus); // decode-unavailable
```

`loadAudioFromA3P()` extracts exactly one archive entry. It does not scan the
archive for a matching filename.

## Play decoded audio in the browser

```typescript
import { Audio } from "alice-web";

const audioContext = new AudioContext();
const resource = await Audio.loadAudioFromA3P(projectBytes, "resources/audio/theme.wav", {
  audioContext,
});

const output = new Audio.WebAudioPlayer({ audioContext });
output.load(resource);
output.setVolume(0.35);
output.play();
```

If the browser cannot decode the resource, `resource.decodeStatus` is
`"decode-failed"` and `WebAudioPlayer.play()` refuses to claim output. Show the
error to the user or choose another audio file.

## Use resource groups

```typescript
import { Audio, type AudioResource } from "alice-web";

const manager = new Audio.SoundResourceManager();
const effects = new Audio.SoundGroup("effects");

const chime: AudioResource = {
  id: "intro-chime",
  name: "intro-chime.wav",
  buffer: new ArrayBuffer(0),
  duration: 0,
  format: "wav",
  decodeStatus: "decode-unavailable",
};

manager.register(chime);

const player = new Audio.AudioPlayer();
player.loadFromManager(manager, "intro-chime");
effects.addPlayer(player);
effects.volume = 0.5;

player.play();
effects.stopAll();
```

Groups are useful for scene effects, voice clips, and background tracks that need
shared volume or mute behavior.

## Add audio through the local API

Start the server with the same token you send in requests:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run build:server
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Register a small WAV resource from Node.js:

```bash
node --input-type=module <<'NODE'
const token = process.env.ALICE_LOCAL_API_TOKEN;
const wavBytes = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00,
  0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
  0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x40, 0x1f, 0x00, 0x00, 0x40, 0x1f, 0x00, 0x00,
  0x01, 0x00, 0x08, 0x00, 0x64, 0x61, 0x74, 0x61,
  0x00, 0x00, 0x00, 0x00,
]);

const response = await fetch("http://127.0.0.1:3000/api/audio/resources", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Alice-Local-Api-Token": token,
  },
  body: JSON.stringify({
    id: "theme",
    name: "theme.wav",
    format: "wav",
    path: "resources/audio/theme.wav",
    bytesBase64: wavBytes.toString("base64"),
  }),
});

if (!response.ok) {
  throw new Error(await response.text());
}

console.log(await response.json());
NODE
```

Set the resource as background audio:

```bash
curl -X POST http://127.0.0.1:3000/api/audio/background \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"resourceId":"theme","enabled":true,"loop":true,"volume":0.35,"pan":0}'
```

Add a cue:

```bash
curl -X POST http://127.0.0.1:3000/api/audio/cues \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":"intro-chime","name":"Intro chime","resourceId":"theme","trigger":"sceneActivated","loop":false,"volume":1,"pan":0}'
```

Read the current state:

```bash
curl http://127.0.0.1:3000/api/audio/state \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN"
```

## Save and export

The save flow writes the audio manifest and audio bytes into the saved `.a3p`:

```bash
curl -X POST http://127.0.0.1:3000/api/project/save \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"saveSelector":"scene.myFirstMethod"}'
```

Download a readable TypeScript handoff:

```bash
curl -fS http://127.0.0.1:3000/api/projects/current/export/typescript \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -o alice-web-typescript-source.zip
```

The TypeScript handoff includes audio metadata so reviewers can see resources,
background audio, and cues without opening the `.a3p` archive.

## Handle errors

`ProjectAudio` helpers reject references to missing resources before the state
changes:

```typescript
import { ProjectAudio } from "alice-web";

try {
  ProjectAudio.setBackgroundAudio(state, {
    resourceId: "missing",
    enabled: true,
  });
} catch (error) {
  if (error instanceof ProjectAudio.ProjectAudioError) {
    console.error(error.message);
  } else {
    throw error;
  }
}
```

Bad requests:

| Problem | Result |
| --- | --- |
| Empty resource ID | `400` |
| Invalid base64 | `400` |
| Unsafe archive path | `400` |
| Cue references missing resource | `400` |
| Cue ID not found for play, stop, or delete | `404` |

## Related docs

- [Audio workflow build contract](./audio.md)
- [Audio workflow configuration](./audio-workflow-configuration.md)
- [Tutorial: add audio to an Alice project](./tutorial-audio-workflow.md)
- [Project IO usage guide](./project-io-usage.md)
