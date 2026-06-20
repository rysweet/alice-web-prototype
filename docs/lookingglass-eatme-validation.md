# LookingGlass eatme validation

LookingGlass is the TypeScript web port of Alice 3. Eatme uses its local REST
API to run Alice.org HowTo scenarios that are supported by the web platform.
RabbitHole remains the desktop reference for workflows that need the Java Alice
UI, desktop-only project hooks, or save/reopen behavior that LookingGlass does
not expose.

## Contents

- [What this validates](#what-this-validates)
- [Configuration](#configuration)
- [Start LookingGlass](#start-lookingglass)
- [Run eatme web validation](#run-eatme-web-validation)
- [Run Gadugi scenarios](#run-gadugi-scenarios)
- [Bug workflow](#bug-workflow)

## What this validates

LookingGlass validation covers real Alice user actions through HTTP:

1. Create or open a project.
2. Add scene objects.
3. Create, edit, and run code.
4. Register and fire events.
5. Save project evidence.
6. Capture a render artifact.

Each scenario checks a meaningful result, such as an added object, an executed
procedure, a triggered event handler, a saved `.a3p` file, or a generated
evidence JSON file.

## Configuration

Set Node's heap limit before local builds and scenario runs:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
```

Use these paths when validating LookingGlass from the eatme repository:

```bash
export LOOKINGGLASS_HOME=/home/azureuser/src/alice-web-prototype
export ALICE_WEB_URL=http://127.0.0.1:3099
```

LookingGlass binds to `127.0.0.1` by default. Do not expose the API to a shared
network unless an authenticated wrapper is added.

## Start LookingGlass

From the LookingGlass repository:

```bash
npm install
npm run build:server
node dist-server/cli.js serve --port 3099 --evidence-dir ./evidence
```

Check the runtime identity:

```bash
curl http://127.0.0.1:3099/api/health
```

```json
{
  "status": "running",
  "launched": false,
  "runtime": "lookingglass"
}
```

When the package is installed as a tool, the equivalent command is:

```bash
lookingglass serve --port 3099 --evidence-dir ./evidence
```

## Run eatme web validation

From the eatme repository:

```bash
EATME_WEB_PLATFORM=1 ALICE_WEB_URL="$ALICE_WEB_URL" \
  cargo test -p eatme-alice --test web_platform_curriculum_e2e -- --test-threads=1
```

Run one Alice.org HowTo scenario against LookingGlass:

```bash
EATME_WEB_PLATFORM=1 ALICE_WEB_URL="$ALICE_WEB_URL" \
  cargo run -q -p eatme-cli -- alice run-howto \
  --scenario events-collision-proximity-game \
  --target lookingglass \
  --run-id local-events-web \
  --runs-dir runs \
  --json
```

The scenario passes only when the API response and evidence artifacts prove the
expected user result.

## Run Gadugi scenarios

Build the server before running Gadugi:

```bash
npm run build:server
```

Run fixture-independent scenarios:

```bash
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Scene Entity Manipulation"

NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Event System"

NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Save / Export Round-Trip"
```

Run project-file scenarios when an `.a3p` fixture exists:

```bash
A3P_FILE=.test-roundtrip/modified.a3p \
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "A3P Open / Parse / Render"
```

## Bug workflow

When a scenario finds a product bug, file a GitHub issue before starting the
fix. Include:

- Scenario name
- Endpoint or user action
- Request body with local paths and secrets removed
- Expected Alice user result
- Actual response or evidence artifact
- Whether RabbitHole, LookingGlass, or both are affected

The fix PR links to the issue and includes the scenario that proves the user
journey works again.
