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
| Rendering and scene model | `test/scene-*.test.ts`, `test/render-*.test.ts`, `test/camera-system.test.ts` | scene setup, render helpers, camera behavior |
| Server and hooks | `test/server.test.ts`, `test/hooks.test.ts`, `test/evidence-writer.test.ts` | REST API responses and eatme-facing proofs |
| Curriculum and integration | `test/curriculum.test.ts`, `test/*integration*.test.ts`, `test/advanced-e2e.test.ts` | broader workflows that stitch subsystems together |

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
npm run serve -- --port 3099 --evidence-dir ./evidence
```

In another terminal, point `eatme` at that URL if you are not using the
default:

```bash
export LOOKINGGLASS_WEB_URL=http://127.0.0.1:3099
```

Existing harnesses may still use `ALICE_WEB_URL`; the rename keeps it as a
compatibility alias.
