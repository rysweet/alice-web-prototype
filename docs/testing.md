# Testing

The repository uses Vitest for unit, subsystem, and integration-style tests.

## Run the main test commands

Run the full suite once:

```bash
npm test
```

Run tests in watch mode while you edit:

```bash
npm run test:watch
```

## Measure coverage

The project already includes the V8 coverage plugin for Vitest. Use it through
Vitest directly:

```bash
npx vitest run --coverage
```

That writes coverage output under `coverage/`.

## Build before API testing

The REST API server is compiled separately. Build it before you run server or
hook workflows:

```bash
npm run build:server
```

## Test organization

Most tests live in `test/` and follow the same names as the source modules.

| Area | Example tests | What they check |
| --- | --- | --- |
| Tweedle language | `test/tweedle-parser*.test.ts`, `test/tweedle-java-fixtures.test.ts` | parsing, syntax coverage, Java parity cases |
| AST and code editing | `test/ast-*.test.ts`, `test/code-editor.test.ts`, `test/code-generation.test.ts` | AST transforms, editor state, generated code |
| Story API and entities | `test/story-api-expanded.test.ts`, `test/entity-*.test.ts` | scene objects, properties, behaviors, collisions |
| Rendering and scene model | `test/scene-*.test.ts`, `test/render-*.test.ts`, `test/camera-system.test.ts`, `test/camera-workflow.test.ts` | scene setup, render helpers, camera behavior |
| Server and hooks | `test/server.test.ts`, `test/hooks.test.ts`, `test/evidence-writer.test.ts` | REST API responses and eatme-facing proofs |
| Curriculum and integration | `test/curriculum.test.ts`, `test/*integration*.test.ts`, `test/advanced-e2e.test.ts`, `e2e/app-flow.spec.ts`, `e2e/first-lessons-real-ui-actions.spec.ts` | broader workflows that stitch subsystems together |

## Local workflow

A practical loop for everyday work:

```bash
npm test
npm run build
npm run build:server
npx vitest run --coverage
```

## When you are working on eatme integration

Build and start the server, then run API-driven tests or external harnesses:

```bash
npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
npm run serve -- --port 3099 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

In another terminal, point `eatme` at that URL if you are not using the
default:

```bash
export ALICE_WEB_URL=http://127.0.0.1:3099
```

Use `ALICE_WEB_URL` for Alice web-platform harnesses.

## Browser E2E camera workflow

Camera workflow parity is covered at the browser level with Playwright:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm run test:e2e
```

The camera scenario opens Alice, moves the camera, applies a preset, saves a
marker, restores it, deletes it, and toggles first-person mode. Tests assert
visible Camera panel state and status text rather than WebGL pixels. See
[Camera workflow usage](./camera-workflow-usage.md#browser-test-scenarios) for
the stable selectors and scenario steps.

First-lesson browser UI action coverage is isolated in:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm run test:e2e -- e2e/first-lessons-real-ui-actions.spec.ts
```

That scenario drives browser controls for object placement, object adjustment,
code editing, workflow run, visible evidence export, project save, and reopen.
It records browser UI evidence only; it does not claim desktop Alice automation.
