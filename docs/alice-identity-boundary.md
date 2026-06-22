---
title: Alice identity boundary
description: Defines where Alice/alice-web identity is required and where the LookingGlass repository nickname is allowed.
last_updated: 2026-06-20
review_schedule: quarterly
doc_type: reference
---

# Alice identity boundary

This reference defines the finished identity contract for the web Alice runtime.
Use it when updating user-facing text, package metadata, generated metadata,
server responses, local API authentication, environment variables, docs, or
identity tests.

**Alice** is the product, runtime, package/software identity, browser app, API
contract, and generated-artifact identity.

**LookingGlass** is only the GitHub repository/project nickname. It may describe
the repository, repo nickname, project wrapper, or migration context. It must not
name the product, runtime, package, CLI, browser app, API headers, environment
variables, health response, or generated artifacts.

## Contents

- [Identity summary](#identity-summary)
- [Allowed LookingGlass usage](#allowed-lookingglass-usage)
- [Command-line usage](#command-line-usage)
- [Configuration](#configuration)
- [eatme environment variables](#eatme-environment-variables)
- [Server API identity](#server-api-identity)
- [Local API authentication](#local-api-authentication)
- [Generated artifacts](#generated-artifacts)
- [Alice HowTo parity audit identity](#alice-howto-parity-audit-identity)
- [Browser runtime identity](#browser-runtime-identity)
- [Compatibility terms that stay Alice](#compatibility-terms-that-stay-alice)
- [Identity contract tests](#identity-contract-tests)
- [Related docs](#related-docs)

## Identity summary

| Surface | Required value |
| --- | --- |
| Product name | `Alice` |
| npm package name | `alice-web` |
| CLI command | `alice-web` |
| Browser application label | `Alice` |
| Server runtime string | `alice-web` |
| Exported player runtime string | `alice-web-player` |
| Generated metadata product | `Alice` |
| Generated metadata source/runtime | `alice-web` |
| Local API auth header | `X-Alice-Local-Api-Token` |
| Local API token environment variable | `ALICE_LOCAL_API_TOKEN` |
| Browser/API web URL environment variable | `ALICE_WEB_URL` |
| HowTo parity audit baseline | `rysweet/RabbitHole origin/develop` |
| Repository/project nickname | `LookingGlass` |
| Current repository URL | `https://github.com/rysweet/alice-web-prototype` |

The repository URL still contains `alice-web-prototype` because that is the
current GitHub repository slug. When prose needs a short repository name, use
the nickname LookingGlass and make it clear that it refers to the repository or
project wrapper, not the software identity.

## Allowed LookingGlass usage

LookingGlass is allowed in documentation only when the sentence is explicitly
about one of these repository-level concepts:

| Allowed concept | Example wording |
| --- | --- |
| GitHub repository nickname | "The LookingGlass repository contains the Alice web runtime." |
| Project wrapper or migration context | "LookingGlass tracks the TypeScript migration from Java Alice 3." |
| Historical PR/issue context | "PR #207 incorrectly expanded the LookingGlass repository nickname into product identity." |

Do not use LookingGlass in these places:

| Forbidden surface | Correct value |
| --- | --- |
| Product or app name | `Alice` |
| Package name | `alice-web` |
| CLI command or help examples | `alice-web` |
| Runtime string | `alice-web` |
| Exported player runtime string | `alice-web-player` |
| Local API auth header | `X-Alice-Local-Api-Token` |
| Local API token environment variable | `ALICE_LOCAL_API_TOKEN` |
| Web URL environment variable | `ALICE_WEB_URL` |
| Generated metadata product/source/runtime | `Alice` / `alice-web` |
| Browser-visible labels | `Alice` |

## Command-line usage

The installed or linked package exposes the canonical CLI:

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
alice-web serve --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

For a local checkout, the npm script and built entry point remain available:

```bash
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
# equivalent:
node dist-server/cli.js serve --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Start the server with a starter `.a3p` project:

```bash
alice-web serve \
  --port 3099 \
  --evidence-dir ./evidence \
  --api-token "$ALICE_LOCAL_API_TOKEN" \
  --project ./sample-projects/starter.a3p
```

Print the resolved server configuration without binding a port:

```bash
alice-web print-config --port 3100 --evidence-dir ./tmp/evidence
```

Example output:

```json
{
  "command": "print-config",
  "port": 3100,
  "evidenceDir": "/workspace/alice-web/tmp/evidence",
  "project": null,
  "runtime": "alice-web"
}
```

Documentation and help text should prefer `alice-web` unless the example is
specifically demonstrating a local checkout or built file path.

## Configuration

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `--port <1-65535>` | no | `3000` | TCP port bound on `127.0.0.1` |
| `--evidence-dir <dir>` | no | `./evidence` | Directory for JSON proof artifacts, generated `.a3p` files, screenshots, and export metadata |
| `--project <file.a3p>` | no | none | Starter Alice 3 project used by `POST /api/launch` when the request body does not provide `project` |
| `--api-token <token>` | yes for CLI-served mutating requests | none | Local-only secret sent in `X-Alice-Local-Api-Token`; provide it from `ALICE_LOCAL_API_TOKEN` |

Use the configured Node heap limit for local validation and CI-equivalent
commands:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
npm run build:server
```

Identity changes do not change option names, request bodies, route names,
status codes, or error handling.

## eatme environment variables

Use Alice/alice-web names for runtime/API configuration:

| Purpose | Canonical variable |
| --- | --- |
| Browser/API web URL used by web-platform tests | `ALICE_WEB_URL` |
| Local API token value passed to the CLI and mutating requests | `ALICE_LOCAL_API_TOKEN` |

Do not document or accept repository-nickname-prefixed runtime/API aliases.

## Server API identity

The `GET /api/health` response reports the Alice runtime identity:

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
  "runtime": "alice-web"
}
```

`pid` and `uptime` are dynamic. API clients should assert their types, not fixed
values.

The route names, request bodies, status codes, and response shapes stay the
same. The identity correction does not add endpoints, change authorization
behavior, or change error handling.

## Local API authentication

Mutating local API routes require `Content-Type: application/json`. CLI-served
instances also require the token passed at startup with `--api-token` in the
`X-Alice-Local-Api-Token` header and reject non-local `Host` or browser
`Origin` headers.

Example:

```bash
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"
alice-web serve --port 3000 --api-token "$ALICE_LOCAL_API_TOKEN" --evidence-dir ./evidence

curl -X POST http://127.0.0.1:3000/api/project/new \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"templateId":"snow","projectName":"WinterStory"}'
```

The token value is secret. Do not log it, serialize it in evidence artifacts,
include it in health responses, or commit it in docs examples.

## Generated artifacts

Alice-generated evidence, exported HTML, asset metadata, and runtime metadata
use exact identity values. Do not derive branding from request headers,
environment variables, local paths, or repository names.

| Field | Exact value | Applies to |
| --- | --- | --- |
| `product` | `Alice` | Product metadata and human-facing artifact summaries |
| `runtime` | `alice-web` | `/api/health`, `print-config`, run-world results, runtime metadata |
| `source` | `alice-web` | Evidence artifacts that identify the implementation source |
| HTML `generator` meta | `Alice export-html` | Exported HTML documents |
| Player runtime identity | `alice-web-player` | Exported `index.html`, `manifest.json`, `share.json`, and validation evidence |
| Web package schema | `alice-web.package/v1` | Exported ZIP `manifest.json` |
| Share schema | `alice-web.share/v1` | Exported and API-generated share metadata |
| Validation schema | `alice-web.validation/v1` | Exported package validation evidence |
| TypeScript source archive filename | `alice-web-typescript-source.zip` | Downloaded TypeScript source handoff |
| TypeScript source archive root | `alice-web-typescript-source/` | ZIP entry root for generated TypeScript handoff |
| TypeScript source manifest `schemaVersion` | `alice-web.typescript-source-manifest/v1` | Generated TypeScript source `manifest.json` |
| glTF/glb source generator | `Alice` | Asset pipeline source metadata before glTF serialization |
| `author` | `Alice` | Generated package/export metadata when an author field is emitted |
| `code_editor_backing` | `alice-web` | Code-edit proof artifacts |

Schema contract values consumed by `eatme` remain unchanged:

```json
{
  "schema_version": "eatme.alice-run-world-result/v1"
}
```

The `eatme.alice-*` schema namespace is an external curriculum test contract
and also matches the product name.

## Alice HowTo parity audit identity

The `alice-web alice-howto-parity-audit` command verifies saved
Alice.org HowTo coverage without changing the product boundary:

| Audit surface | Required value |
| --- | --- |
| Product | `Alice` |
| Runtime/package/CLI | `alice-web` |
| Command | `alice-howto-parity-audit` |
| Scope | `Alice.org HowTo coverage` |
| Comparison baseline | `rysweet/RabbitHole origin/develop` |

Audit evidence must use `Alice` for the product and `alice-web` for the runtime.
The comparison baseline must remain the exact
`rysweet/RabbitHole origin/develop` value. Do not use the baseline name as a
product, package, runtime, CLI, API, browser, or generated-artifact identity.

The command source is the committed 54-entry inventory and coverage map in
`src/server/alice-howto-parity-inventory.ts`; it does not fetch live Alice.org
content during execution.

## Browser runtime identity

Browser-visible labels, notifications, theme names, plugin system labels, and
exported HTML titles use `Alice`. Exported player documents expose
`window.AlicePlayer` and report public runtime identity `alice-web-player`.

Identity-facing browser storage keys use the `alice-web.` prefix:

| Purpose | Storage key |
| --- | --- |
| Preferences | `alice-web.preferences` |
| Theme | `alice-web.theme` |
| Notification history | `alice-web.notifications.history` |
| Plugin settings | `alice-web.plugins.settings` |

Do not migrate identity-facing keys to a LookingGlass prefix.

## Compatibility terms that stay Alice

Keep Alice when it names a historical, technical, compatibility, or product
concept:

| Term | Why it stays |
| --- | --- |
| Alice 3 | The upstream educational environment being ported |
| Alice.org | The upstream project website |
| `.a3p` | Alice 3 project archive format |
| Tweedle / Alice language references | Language and curriculum terminology |
| `rysweet/RabbitHole origin/develop` baseline | Comparison baseline for Alice.org HowTo coverage |
| `eatme.alice-*` | External evidence schema contract |
| `application/alice+tweedle` | Exported Tweedle script MIME type |
| `alice-export*`, `data-alice-*`, `alice-project-data`, `alice-tweedle-source` | Exported HTML DOM/CSS hooks used by generated files |
| `AliceProject`, `AliceObject`, parser/runtime type names | Internal technical type names tied to Alice file and language concepts |

## Identity contract tests

`test/alice-identity-boundary-contract.test.ts` guards this boundary. The test
asserts that:

- package metadata and lockfile use `alice-web`;
- CLI help advertises `alice-web serve` and `alice-web print-config`;
- `/api/health` and `print-config` report `alice-web`;
- local API auth uses `X-Alice-Local-Api-Token` and `ALICE_LOCAL_API_TOKEN`;
- docs and examples use Alice product/runtime branding;
- generated metadata uses Alice / `alice-web` identity values;
- exported web packages use `alice-web.package/v1`,
  `alice-web.share/v1`, `alice-web.validation/v1`, and
  `alice-web-player`;
- web-platform test examples use `ALICE_WEB_URL`;
- generated logs and transient artifacts are not part of the committed diff;
- LookingGlass usage is limited to repository/project nickname, wrapper,
  migration, or historical PR/issue context.

## Related docs

- [Verify a local Alice server](./tutorial-alice-server-workflow.md)
- [Server API](./server-api.md)
- [API reference](./api-reference.md)
- [TypeScript source export](./typescript-source-export.md)
- [Alice HowTo parity audit](./alice-howto-parity-audit.md)
- [Alice HowTo parity audit reference](./alice-howto-parity-audit-reference.md)
- [Getting started](./getting-started.md)
