# LookingGlass identity

This document describes the LookingGlass identity for the product, package, CLI, browser, and runtime surfaces.

LookingGlass is the product, package, CLI, browser, and runtime identity for
this TypeScript web port of Alice 3.

Use this reference when updating user-facing text, generated metadata, server
responses, local storage keys, examples, or identity tests.

## Contents

- [Identity summary](#identity-summary)
- [Command-line usage](#command-line-usage)
- [Configuration](#configuration)
- [eatme environment variables](#eatme-environment-variables)
- [Server API identity](#server-api-identity)
- [Generated artifacts](#generated-artifacts)
- [Browser runtime identity](#browser-runtime-identity)
- [Compatibility terms that stay Alice](#compatibility-terms-that-stay-alice)
- [Identity contract](#identity-contract)
- [Related docs](#related-docs)

## Identity summary

| Surface | Value |
| --- | --- |
| Product name | `LookingGlass` |
| npm package name | `lookingglass` |
| CLI command | `lookingglass` |
| Browser application label | `LookingGlass` |
| Server runtime string | `lookingglass-typescript-web` |
| Generated metadata product | `LookingGlass` |
| Generated metadata source/runtime | `lookingglass-typescript-web` |
| Current repository URL | `https://github.com/rysweet/alice-web-prototype` |

The repository path keeps `rysweet/alice-web-prototype` because that is the
current GitHub repository name. Product identity should not use the repository
slug as user-facing branding.

## Command-line usage

The installed or linked package exposes the canonical CLI:

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
lookingglass serve --port 3000 --evidence-dir ./evidence
```

For a local checkout, the npm script and built entry point remain available:

```bash
npm run serve -- --port 3000 --evidence-dir ./evidence
# equivalent:
node dist-server/cli.js serve --port 3000 --evidence-dir ./evidence
```

The installed CLI starts the server with a starter `.a3p` project:

```bash
lookingglass serve \
  --port 3099 \
  --evidence-dir ./evidence \
  --project ./fixtures/starter.a3p
```

Print the resolved server configuration without binding a port:

```bash
lookingglass print-config --port 3100 --evidence-dir ./tmp/evidence
```

Example output:

```json
{
  "command": "print-config",
  "port": 3100,
  "evidenceDir": "/workspace/lookingglass/tmp/evidence",
  "project": null,
  "runtime": "lookingglass-typescript-web"
}
```

The built server entry point remains available for local development:

```bash
node dist-server/cli.js serve --port 3000 --evidence-dir ./evidence
```

Documentation and help text should prefer `lookingglass` unless the example is
specifically demonstrating a local checkout or built file path.

## Configuration

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--port <1-65535>` | no | `3000` | TCP port bound on `127.0.0.1` |
| `--evidence-dir <dir>` | no | `./evidence` | Directory for JSON proof artifacts, generated `.a3p` files, screenshots, and export metadata |
| `--project <file.a3p>` | no | none | Starter Alice 3 project used by `POST /api/launch` when the request body does not provide `project` |

Use the configured Node heap limit for local validation and CI-equivalent
commands:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
npm run build:server
```

The server configuration shape does not change for the rename. Only
identity-bearing string values change.

## eatme environment variables

`LOOKINGGLASS_*` variables are canonical after the rename. Existing
`ALICE_*` variables remain aliases so external harnesses do not break.

| Purpose | Canonical variable | Compatibility aliases |
| --- | --- | --- |
| Repository checkout path | `LOOKINGGLASS_TYPESCRIPT_HOME` | `ALICE_TYPESCRIPT_HOME` |
| API base URL for the TypeScript target | `LOOKINGGLASS_TYPESCRIPT_API_URL` | `ALICE_TYPESCRIPT_API_URL` |
| Browser/API web URL used by web-platform harnesses | `LOOKINGGLASS_WEB_URL` | `ALICE_WEB_URL` |

When both a canonical variable and an alias are set, the canonical
`LOOKINGGLASS_*` value wins.

## Server API identity

The `GET /api/health` response reports the LookingGlass runtime identity:

```bash
curl http://127.0.0.1:3000/api/health
```

Response:

```json
{
  "status": "running",
  "launched": false,
  "pid": 12345,
  "uptime": 3.2,
  "runtime": "lookingglass-typescript-web"
}
```

`pid` and `uptime` are dynamic. API clients should assert their types, not fixed
values.

The route names, request bodies, status codes, and response shapes stay the
same. The rename does not add endpoints, change authentication behavior, or
change error handling.

## Generated artifacts

LookingGlass-generated evidence, exported HTML, asset metadata, and runtime
metadata use exact identity values. Do not derive branding from request headers,
environment variables, local paths, or repository names.

| Field | Exact value | Applies to |
| --- | --- | --- |
| `product` | `LookingGlass` | Product metadata and human-facing artifact summaries |
| `runtime` | `lookingglass-typescript-web` | `/api/health`, `print-config`, run-world results, runtime metadata |
| `source` | `lookingglass-typescript-web` | Evidence artifacts that identify the implementation source |
| HTML `generator` meta | `LookingGlass export-html` | Exported HTML documents |
| glTF/glb source generator | `LookingGlass` | Asset pipeline source metadata before glTF serialization |
| `author` | `LookingGlass` | Generated package/export metadata when an author field is emitted |
| `code_editor_backing` | `lookingglass-typescript-web` | Code-edit proof artifacts |

Schema contract values consumed by `eatme` remain unchanged:

```json
{
  "schema_version": "eatme.alice-run-world-result/v1"
}
```

The `eatme.alice-*` schema namespace is a compatibility contract with the
existing curriculum test harness. It is not user-facing product branding.

## Browser runtime identity

Browser-visible labels, notifications, theme names, plugin system labels, and
exported HTML titles use `LookingGlass`.

Identity-facing browser storage keys use the `lookingglass.` prefix:

| Purpose | Storage key |
| --- | --- |
| Preferences | `lookingglass.preferences` |
| Theme | `lookingglass.theme` |
| Notification history | `lookingglass.notifications.history` |
| Plugin settings | `lookingglass.plugins.settings` |

Storage migration keeps user settings:

1. If the new key is absent and the old `alice-web.*` key exists, copy the old
   value to the new `lookingglass.*` key.
2. Read and write only the new key after migration.
3. Do not silently delete old keys; browser reset/cleanup code may remove them
   explicitly.

Only identity-facing keys move to the LookingGlass prefix. File formats,
external schemas, and compatibility identifiers stay stable unless they are
explicit product branding.

## Compatibility terms that stay Alice

Keep `Alice` when it names a historical, technical, or compatibility concept:

| Term | Why it stays |
| --- | --- |
| Alice 3 | The upstream educational environment being ported |
| Alice.org | The upstream project website |
| `.a3p` | Alice 3 project archive format |
| Tweedle / Alice language references | Language and curriculum terminology |
| RabbitHole parity | Compatibility target terminology |
| `eatme.alice-*` | External evidence schema contract |
| `application/alice+tweedle` | Exported Tweedle script MIME type |
| `alice-export*`, `data-alice-*`, `alice-project-data`, `alice-tweedle-source` | Exported HTML DOM/CSS hooks used by generated files |
| `AliceProject`, `AliceObject`, parser/runtime type names | Internal technical type names tied to Alice file and language concepts |
| `rysweet/alice-web-prototype` | Actual current GitHub repository path |

Do not use legacy product, package, CLI, or runtime names as product branding
outside real repository URLs and paths.

## Identity contract

`test/lookingglass-identity-contract.test.ts` guards the rename. The
test asserts that:

- package metadata and lockfile use `lookingglass`;
- CLI help advertises `lookingglass serve` and `lookingglass print-config`;
- `/api/health` and `print-config` report `lookingglass-typescript-web`;
- docs and examples use LookingGlass product branding;
- generated metadata uses LookingGlass identity values;
- eatme target configuration accepts `LOOKINGGLASS_*` variables and preserves
  the documented `ALICE_*` aliases;
- browser storage migrates exact old keys to exact new keys;
- generated logs and transient artifacts are not part of the committed diff;
- allowed `Alice` terms are limited to historical, technical, repository-path,
  exported-HTML-hook, MIME-type, and `eatme.alice-*` compatibility usage.

## Related docs

- [Verify a local LookingGlass server](./tutorial-lookingglass-server-workflow.md)
- [Server API](./server-api.md)
- [API reference](./api-reference.md)
- [Getting started](./getting-started.md)
