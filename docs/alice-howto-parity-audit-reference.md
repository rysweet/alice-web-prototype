---
title: "Alice HowTo parity audit reference"
description: CLI, deterministic inventory, output schema, and executable scenario contract for the Alice.org HowTo parity audit.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Alice HowTo parity audit reference

This reference defines the `alice-web alice-howto-parity-audit` command,
its deterministic source data, its JSON evidence contract, and the CLI-only
Gadugi scenario that executes it.

## Contents

- [Command](#command)
- [Options](#options)
- [Environment](#environment)
- [Deterministic source data](#deterministic-source-data)
- [Output schema](#output-schema)
- [Checks](#checks)
- [Exit codes](#exit-codes)
- [Gadugi scenario contract](#gadugi-scenario-contract)
- [Package script contract](#package-script-contract)
- [Related docs](#related-docs)

## Command

Installed package form:

```bash
alice-web alice-howto-parity-audit --output /tmp/alice-howto-parity-audit.json
```

Local checkout form:

```bash
node dist-server/cli.js alice-howto-parity-audit \
  --output /tmp/alice-howto-parity-audit.json
```

The command is read-only for repository content. It writes the audit
result only to the file path provided by `--output`.

## Options

| Option | Required | Description |
| --- | --- | --- |
| `--output <file>` | yes | JSON evidence file to write. The parent directory must already exist. |
| `--pretty` | no | Writes indented JSON for human review. Machine consumers must accept either compact or pretty JSON. |

The command fails with exit code `2` when `--output` is missing, points at a
directory, has a missing parent directory, or resolves to an unsafe path such as
the repository root.

The command does not bind a port, start the REST API, require
`ALICE_LOCAL_API_TOKEN`, use browser automation, or fetch live network content.

## Environment

| Variable | Required | Description |
| --- | --- | --- |
| `NODE_OPTIONS` | recommended | Use `--max-old-space-size=32768` for local and CI parity. |

No credentials are required. Do not pass GitHub tokens, npm tokens, local
API tokens, or other secrets to the audit command.

## Deterministic source data

The audit source of truth is a committed TypeScript module:
`src/server/alice-howto-parity-inventory.ts`.

| Export | Required contract |
| --- | --- |
| `ALICE_ORG_HOWTO_INVENTORY` | Exactly 54 saved Alice.org HowTo entries. Each entry must have a stable `id`, human title, source label, and expected coverage area. |
| `ALICE_HOWTO_SCENARIO_MAP` | One executable scenario for each inventory `id`. Each scenario declares a stable id, command that selects that id, user steps, expected output, and evidence records. |
| `ALICE_HOWTO_COVERAGE_MAP` | One or more coverage records for each inventory `id`. Each record identifies an existing repository path and an evidence token that must be present in that path. |
| `ALICE_HOWTO_WORDING_RULES` | Exact forbidden terms, allowed baseline exception, and jargon rules for generated audit evidence. |

The command does not scrape Alice.org during execution. Updating the HowTo corpus
requires a source change to this committed module and matching tests.

## Output schema

The output file uses schema `alice-web.howto-parity-audit/v1`.

| Field | Type | Required | Contract |
| --- | --- | --- | --- |
| `schemaVersion` | string | yes | Exact value `alice-web.howto-parity-audit/v1` |
| `command` | string | yes | Exact value `alice-howto-parity-audit` |
| `product` | string | yes | Exact value `Alice` |
| `runtime` | string | yes | Exact value `alice-web` |
| `baseline` | string | yes | Exact value `rysweet/RabbitHole origin/develop` |
| `source.inventory` | string | yes | Exact value `src/server/alice-howto-parity-inventory.ts` |
| `source.inventoryCount` | number | yes | Exact value `54` |
| `scope.name` | string | yes | Exact value `Alice.org HowTo coverage` |
| `scope.included` | string[] | yes | Alice.org HowTo coverage areas checked by the audit |
| `scope.excluded` | string[] | yes | Out-of-scope areas intentionally ignored |
| `checks` | object[] | yes | Ordered audit checks |
| `summary.status` | string | yes | `passed` or `failed` |
| `summary.passed` | number | yes | Count of passed checks |
| `summary.failed` | number | yes | Count of failed checks |

Each check object uses this shape:

| Field | Type | Required | Contract |
| --- | --- | --- | --- |
| `id` | string | yes | Stable check identifier |
| `status` | string | yes | `passed` or `failed` |
| `summary` | string | yes | Human-readable check result |
| `details` | string[] | no | Check-specific evidence for failures or verbose output |

## Checks

| Check ID | Required behavior |
| --- | --- |
| `alice-identity` | User-facing identity in audit evidence is `Alice`; CLI, package, and runtime identity are `alice-web`. |
| `baseline-only` | The only comparison baseline value is `rysweet/RabbitHole origin/develop`; other names, branches, or local feature branches fail this check. |
| `howto-inventory` | The saved Alice.org HowTo inventory contains exactly 54 unique entries and each entry has a coverage map record. |
| `scenario-traceability` | Every inventory entry maps to exactly one executable scenario id with a command that selects that id, user steps, expected output, and evidence records. |
| `coverage-evidence` | Every mapped path exists and contains the required evidence token. |
| `wording` | `ALICE_HOWTO_WORDING_RULES` forbidden wording and unsupported jargon are absent from generated audit evidence. |

Failed checks identify the failing field, inventory id, evidence token, or
document path in `details`. They do not return success-shaped summaries.

## Exit codes

| Exit code | Meaning |
| --- | --- |
| `0` | All checks passed and the evidence file was written. |
| `1` | One or more audit checks failed and the evidence file was written. |
| `2` | Command usage or configuration was invalid. |

## Gadugi scenario contract

The repository includes `gadugi/07-alice-howto-parity-audit.yaml` with the scenario name
`Alice HowTo parity audit CLI`.

The scenario does the following:

1. Declares `scenario.metadata.flow: cli-only`.
2. Includes the `cli-only` tag.
3. Sets `NODE_OPTIONS=--max-old-space-size=32768`.
4. Runs `npm run build:server`.
5. Creates a temporary evidence directory with `mktemp -d`.
6. Runs `node dist-server/cli.js alice-howto-parity-audit --output "$AUDIT_JSON"`.
7. Writes audit JSON to the temporary evidence directory.
8. Parses the JSON evidence instead of using substring-only checks.
9. Asserts `product: "Alice"` and `runtime: "alice-web"`.
10. Asserts `baseline: "rysweet/RabbitHole origin/develop"`.
11. Asserts `source.inventoryCount: 54`.
12. Asserts `scope.name: "Alice.org HowTo coverage"`.
13. Asserts the `howto-inventory`, `scenario-traceability`, `coverage-evidence`, and `wording` checks passed.
14. Removes temporary evidence before exit.
15. Avoids `PORT`, `/api/health`, `curl`, browser automation, and REST server startup.

The existing server-flow Gadugi YAML files declare
`scenario.metadata.flow: server-flow` and include a matching `server-flow` tag
so static tests can distinguish server scenarios from CLI-only scenarios.

Run the scenario:

```bash
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Alice HowTo parity audit CLI"
```

## Package script contract

The `package.json` `test:gadugi` script includes:

```bash
gadugi-test run -d gadugi -s "Alice HowTo parity audit CLI"
```

The script runs the existing executable scenarios and then the CLI-only audit
scenario.

## Related docs

- [Alice HowTo parity audit](./alice-howto-parity-audit.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Gadugi test scenarios](./gadugi-test-scenarios.md)
- [Testing](./testing.md)
