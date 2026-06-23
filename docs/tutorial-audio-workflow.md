# Tutorial: Alice audio workflow

This tutorial shows how to add an audio asset, configure it as background music,
record an animation-timed cue, save the project, reload it, and write
end-to-end evidence.

## What you need

- Node.js
- npm
- curl
- A checkout of this repository

## 1. Build and start Alice

Build the API server:

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
```

Start Alice on port `3000` with an evidence directory:

```bash
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Keep this terminal open. Use a second terminal for the requests below and export
the same token value there:

```bash
export ALICE_LOCAL_API_TOKEN="<same value used to start alice-web>"
```

## 2. Create a project

Create a Snow template project:

```bash
curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"templateId":"snow","projectName":"AudioStory"}'
```

Expected response shape:

```json
{
  "schema_version": "eatme.alice-project-new-result/v1",
  "status": "created",
  "templateId": "snow",
  "projectName": "AudioStory",
  "projectPath": "evidence/project-new/AudioStory.a3p",
  "sceneObjectCount": 4,
  "a3pSizeBytes": 1284
}
```

## 3. Check supported audio formats

```bash
curl http://127.0.0.1:3000/api/audio/formats
```

Response:

```json
{
  "formats": [".mp3", ".wav", ".ogg", ".m4a"]
}
```

Alice accepts those extensions for project audio assets. Other audio extensions
return a clear validation error.

## 4. Create a sample WAV file

Create a one-second tone at `tmp/audio/intro.wav`:

```bash
node --input-type=module <<'NODE'
import { mkdirSync, writeFileSync } from "node:fs";

mkdirSync("tmp/audio", { recursive: true });

const sampleRate = 8000;
const seconds = 1;
const samples = sampleRate * seconds;
const bytesPerSample = 2;
const dataSize = samples * bytesPerSample;
const wav = Buffer.alloc(44 + dataSize);

wav.write("RIFF", 0);
wav.writeUInt32LE(36 + dataSize, 4);
wav.write("WAVE", 8);
wav.write("fmt ", 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24);
wav.writeUInt32LE(sampleRate * bytesPerSample, 28);
wav.writeUInt16LE(bytesPerSample, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(dataSize, 40);

for (let i = 0; i < samples; i += 1) {
  const sample = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 12000);
  wav.writeInt16LE(sample, 44 + i * bytesPerSample);
}

writeFileSync("tmp/audio/intro.wav", wav);
NODE
```

This creates a real `.wav` file that browsers can decode.

## 5. Register the audio asset

Encode the WAV file and register it with the active project:

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

The asset id is stable for the active project session and is used by background
music and cue configuration.

## 6. Configure background music

Configure stored background music intent with looping enabled:

```bash
curl -X POST http://127.0.0.1:3000/api/audio/background \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"assetId":"audio-1","volume":0.75,"loop":true}'
```

Response:

```json
{
  "status": "configured",
  "backgroundMusic": {
    "assetId": "audio-1",
    "volume": 0.75,
    "loop": true
  }
}
```

## 7. Add an animation-synchronized cue

Add a cue that targets the same asset 1.25 seconds into an animation timeline:

```bash
curl -X POST http://127.0.0.1:3000/api/audio/cues \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":"intro-cue","assetId":"audio-1","animationId":"scene.myFirstMethod.spin","timelineTimeSeconds":1.25,"volume":0.5}'
```

Response:

```json
{
  "status": "configured",
  "cue": {
    "id": "intro-cue",
    "assetId": "audio-1",
    "animationId": "scene.myFirstMethod.spin",
    "timelineTimeSeconds": 1.25,
    "volume": 0.5
  }
}
```

This records the cue that the runtime playback bridge must trigger once when
the named animation timeline reaches `1.25`.

## 8. Save the project

```bash
curl -X POST http://127.0.0.1:3000/api/project/save \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"saveSelector":"audio.workflow"}'
```

Response:

```json
{
  "schema_version": "eatme.alice-project-save-result/v1",
  "status": "saved",
  "save_selector": "audio.workflow",
  "saved_project_artifact": "saved-project.a3p",
  "save_artifact": "desktop-save-operation-result.json",
  "evidenceArtifact": "evidence/project-save/desktop-save-operation-result.json"
}
```

The saved archive contains the raw audio bytes at
`resources/audio/audio-1.wav` and the `aliceAudio` manifest metadata.

## 9. Reload the saved project

Launch from the saved `.a3p` file:

```bash
curl -X POST http://127.0.0.1:3000/api/launch \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"project":"./evidence/project-save/saved-project.a3p"}'
```

Inspect the reloaded audio state:

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

The asset, background music, and cue configuration survive the save and reload.

## 10. Write workflow evidence

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
  "status": "bounded",
  "evidenceArtifact": "evidence/audio-workflow.json"
}
```

The evidence artifact records a dynamic `timestamp`, supported formats, asset
count and names, background music status, cue count and ids, the saved project
artifact name, and whether the workflow was reloaded.

## Unsupported file example

Registering an unsupported extension returns `400` and does not mutate project
audio state:

```bash
curl -X POST http://127.0.0.1:3000/api/audio/assets \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"fileName":"intro.flac","dataBase64":"AQID"}'
```

Response:

```json
{
  "error": "unsupported audio format: flac. Supported formats: .mp3, .wav, .ogg, .m4a"
}
```

## What the workflow proves

The workflow proves that Alice can add audio assets, store background music
intent, store an animation-timed audio cue, persist audio bytes and metadata in
a saved `.a3p`, reload that saved project, and write end-to-end evidence. The
headless evidence artifact does not claim audible speaker output in CI.
