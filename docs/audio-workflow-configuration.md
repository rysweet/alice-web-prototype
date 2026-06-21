---
title: Audio workflow configuration
description: Configuration rules for Alice audio resources, runtime playback, server routes, evidence, and local validation.
last_updated: 2026-06-21
review_schedule: quarterly
doc_type: reference
---

# Audio workflow configuration

The audio workflow keeps configuration intentionally small. Project audio is
normal Alice project state and does not need a separate feature flag.

## Contents

- [Server options](#server-options)
- [Runtime modes](#runtime-modes)
- [Accepted resource metadata](#accepted-resource-metadata)
- [Archive path rules](#archive-path-rules)
- [Manifest rules](#manifest-rules)
- [Evidence output](#evidence-output)
- [Local validation memory](#local-validation-memory)
- [Related docs](#related-docs)

## Server options

Audio routes use the existing Alice local server configuration:

| Option | Default | Effect |
| --- | --- | --- |
| `--project <file.a3p>` | none | Seeds audio resources, background state, and cues from the launched project |
| `--evidence-dir <dir>` | `./evidence` | Stores audio evidence sidecars and saved project artifacts |
| `--api-token <token>` | none | Protects `/api/audio/*` routes through `X-Alice-Local-Api-Token` |
| `--port <1-65535>` | `3000` | Hosts audio routes under the same local API base URL |

Example:

```bash
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
alice-web serve \
  --port 3000 \
  --evidence-dir ./evidence \
  --project ./lessons/audio-intro.a3p \
  --api-token "$ALICE_LOCAL_API_TOKEN"
```

## Runtime modes

| Mode | Where used | Behavior |
| --- | --- | --- |
| `web-audio` | Browser runtime with `AudioContext` | Decoded resources can produce sound |
| `simulation` | Server, tests, Node.js without `AudioContext` | State changes run without sound |

Simulation mode is explicit. Code can check `runtimeMode` and `canOutputAudio`
before presenting playback controls that promise audible output.

## Accepted resource metadata

| Field | Rule |
| --- | --- |
| `id` | Trimmed, non-empty, unique within the project audio state |
| `name` | Trimmed, non-empty display name |
| `format` | Lowercase extension-style value such as `wav`, `mp3`, or `ogg` |
| `path` | Safe archive-relative path |
| `bytesBase64` | Required when adding a resource through REST |
| `duration` | Derived from decode metadata when available, otherwise `0` |
| `decodeStatus` | `decoded`, `decode-unavailable`, or `decode-failed` |

Recommended formats are `wav`, `mp3`, and `ogg`. Browser support still depends
on the user's browser and available codecs.

## Archive path rules

Accepted paths are relative POSIX paths:

```text
resources/audio/theme.wav
resources/audio/effects/intro-chime.ogg
```

Rejected paths include traversal, absolute paths, Windows drive paths, UNC
paths, backslashes, empty segments, and duplicate separators:

```text
../theme.wav
/tmp/theme.wav
C:/Users/Alice/theme.wav
\\server\share\theme.wav
resources\audio\theme.wav
resources/audio//theme.wav
```

Unsafe paths fail before bytes are stored.

## Manifest rules

The project-audio layer serializes project audio in root `manifest.json`:

| Manifest field | Meaning |
| --- | --- |
| `aliceAudio.schemaVersion` | Always `alice-web.audio-manifest/v1` |
| `aliceAudio.resources` | Resource descriptors that point to archive entries |
| `aliceAudio.background` | Current background audio settings |
| `aliceAudio.cues` | Saved cue definitions |

Project IO preserves unrelated manifest fields and safe audio resources. The
project-audio layer owns updates to `aliceAudio` and validates references before
state is saved.

## Evidence output

Audio evidence is rooted under the configured evidence directory:

```text
evidence/
  alice-web/
    audio-state.json
  project-save/
    alice-web/
      audio-manifest.json
    saved-project.a3p
```

Evidence files contain metadata only. Raw audio bytes stay in `.a3p` resources.

## Local validation memory

Use the configured Node.js heap limit for local builds and test runs:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm run build
npm run build:server
npm test
```

The audio workflow does not read `NODE_OPTIONS`; it only affects local Node.js
process memory.

## Related docs

- [Audio workflow build contract](./audio.md)
- [Audio workflow usage](./audio-workflow-usage.md)
- [Tutorial: add audio to an Alice project](./tutorial-audio-workflow.md)
- [Server API](./server-api.md)
- [Project IO configuration](./project-io-configuration.md)
