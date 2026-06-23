---
title: "Alice HowTo parity audit"
description: Usage contract for the Alice.org HowTo parity audit CLI and its temporary evidence output.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: how-to
---

# Alice HowTo parity audit

This document describes the behavior of the
`alice-web alice-howto-parity-audit` command and the executable
`gadugi/07-alice-howto-parity-audit.yaml` scenario.

The audit verifies saved Alice.org HowTo coverage for Alice. It preserves
Alice/alice-web identity, uses `rysweet/RabbitHole origin/develop` only as the
comparison baseline, and writes generated evidence to a caller-provided path
outside the committed source tree.

## Contents

- [Run sequence](#run-sequence)
- [Gadugi scenario](#gadugi-scenario)
- [Authoritative coverage source](#authoritative-coverage-source)
- [Evidence output](#evidence-output)
- [Scope rules](#scope-rules)
- [Identity and wording rules](#identity-and-wording-rules)
- [Troubleshooting](#troubleshooting)
- [Related docs](#related-docs)

## Run sequence

Build the server CLI, create a temporary evidence directory, and run the audit:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm run build:server

AUDIT_DIR="$(mktemp -d)"
AUDIT_JSON="$AUDIT_DIR/alice-howto-parity-audit.json"

node dist-server/cli.js alice-howto-parity-audit --output "$AUDIT_JSON"
```

The installed package form uses the same command surface:

```bash
alice-web alice-howto-parity-audit --output "$AUDIT_JSON"
```

The parent directory for `--output` must already exist. The command does not
create directories; missing or unsafe output parents will exit with usage error
code `2`.

The command exits with status `0` only when every audit check passes. A
failing check exits non-zero and writes the same JSON shape with failure
details when the output path is valid.

Remove temporary evidence after copying the result into a CI artifact or PR
evidence location:

```bash
rm -rf "$AUDIT_DIR"
```

## Gadugi scenario

The feature includes one CLI-only outside-in scenario:
`gadugi/07-alice-howto-parity-audit.yaml`, named
`Alice HowTo parity audit CLI`.

The scenario builds the server CLI, runs
`node dist-server/cli.js alice-howto-parity-audit`, writes audit output under a
temporary directory, and assert the parsed JSON contract without starting the
REST server.

Run it directly:

```bash
NODE_OPTIONS=--max-old-space-size=32768 \
  gadugi-test run -d gadugi -s "Alice HowTo parity audit CLI"
```

The `package.json` `test:gadugi` script includes this scenario after the
existing executable scenarios.

## Authoritative coverage source

The audit does not fetch Alice.org live content. It reads a committed,
deterministic source in the implementation:
`src/server/alice-howto-parity-inventory.ts`.

That source exports:

| Export | Purpose |
| --- | --- |
| `ALICE_ORG_HOWTO_INVENTORY` | The saved 54-entry Alice.org HowTo inventory. Each entry has a stable `id`, title, source label, and expected Alice coverage area. |
| `ALICE_HOWTO_SCENARIO_MAP` | One executable scenario for each inventory entry. Each scenario has a stable id, command that selects that id, user steps, expected output, and evidence records. |
| `ALICE_HOWTO_COVERAGE_MAP` | The required coverage evidence for each inventory entry. Evidence may point to docs, tests, or Gadugi scenarios, but every referenced path must exist. |
| `ALICE_HOWTO_WORDING_RULES` | Exact wording and jargon rules used by the `wording` audit check. |

The audit compares the saved inventory against repository evidence. It does
not claim broad Alice parity; it answers whether the saved Alice.org HowTo
inventory has deterministic coverage evidence in this repository.

## Evidence output

The audit writes one JSON file. Store generated audit artifacts outside the
committed source tree, such as a `mktemp -d` directory or a CI artifact path.

Successful output:

```json
{
  "schemaVersion": "alice-web.howto-parity-audit/v1",
  "command": "alice-howto-parity-audit",
  "product": "Alice",
  "runtime": "alice-web",
  "baseline": "rysweet/RabbitHole origin/develop",
  "source": {
    "inventory": "src/server/alice-howto-parity-inventory.ts",
    "inventoryCount": 54
  },
  "scope": {
    "name": "Alice.org HowTo coverage",
    "included": [
      "Animation Alice.org HowTo coverage",
      "Audio Alice.org HowTo coverage",
      "Code Editor Alice.org HowTo coverage",
      "Great Other Sources Alice.org HowTo coverage",
      "Interactivity Alice.org HowTo coverage",
      "Models and Textures Alice.org HowTo coverage",
      "Scene Editor Alice.org HowTo coverage",
      "Sharing Alice.org HowTo coverage",
      "The Alice Player Alice.org HowTo coverage",
      "VR Programming Alice.org HowTo coverage"
    ],
    "excluded": ["live web crawling", "general documentation checks", "all product capabilities"]
  },
  "checks": [
    {
      "id": "alice-identity",
      "status": "passed",
      "summary": "Product and runtime fields match required names."
    },
    {
      "id": "baseline-only",
      "status": "passed",
      "summary": "Comparison field matches the approved upstream reference."
    },
    {
      "id": "howto-inventory",
      "status": "passed",
      "summary": "Saved HowTo inventory has 54 unique entries with mapped records."
    },
    {
      "id": "scenario-traceability",
      "status": "passed",
      "summary": "Every HowTo maps to one executable scenario with user steps and expected output."
    },
    {
      "id": "coverage-evidence",
      "status": "passed",
      "summary": "All mapped evidence files exist and contain expected tokens."
    },
    {
      "id": "wording",
      "status": "passed",
      "summary": "Generated evidence text stays within wording rules."
    }
  ],
  "summary": {
    "status": "passed",
    "passed": 6,
    "failed": 0
  }
}
```

Consumers should treat `schemaVersion`, `command`, `product`, `runtime`,
`baseline`, `source.inventory`, `source.inventoryCount`, `scope.name`, each
`checks[].id`, and `summary.status` as the stable contract. Human-readable
summaries may change to improve clarity.

## Scope rules

The audit covers only the saved Alice.org HowTo inventory:

| Included | Not included |
| --- | --- |
| The 54-entry saved Alice.org HowTo inventory | Live web crawling |
| Coverage records mapped to repository docs, tests, or Gadugi scenarios | General README copy |
| Evidence that Alice/alice-web supports the mapped HowTo behavior | Broad platform comparison claims |
| Identity and wording checks for generated audit evidence | Point-in-time audit reports committed to `docs/` |

Do not use the audit as a broad documentation linter. It answers one question:
whether the saved Alice.org HowTo coverage boundary is represented accurately by
deterministic repository evidence.

## Identity and wording rules

The audit enforces the identity boundary from
[Alice identity boundary](./alice-identity-boundary.md):

| Surface | Required wording |
| --- | --- |
| Product | `Alice` |
| CLI/runtime/package | `alice-web` |
| Comparison baseline | `rysweet/RabbitHole origin/develop` |
| Audit scope | `Alice.org HowTo coverage` |

`ALICE_HOWTO_WORDING_RULES` enumerates these exact rules:

| Rule | Behavior |
| --- | --- |
| Repository nickname | Reject the repository nickname in generated audit evidence because the evidence is product-facing. |
| Comparison baseline | Allow the exact value `rysweet/RabbitHole origin/develop` only as the comparison baseline. |
| Repository slug | Reject the repository slug in generated audit evidence. |
| Scope shortcuts | Reject wording that narrows or overstates the Alice.org HowTo coverage boundary. |
| Process jargon | Reject internal workflow terminology in generated human-readable summaries. |

Technical terms such as `baseline`, `Gadugi`, `scenario`, `CLI-only`, and
`server-flow` are allowed only when they appear in technical fields or scenario
documentation, not as unexplained user-facing audit summaries.

## Troubleshooting

### `alice-howto-parity-audit` is unknown

The server CLI was not rebuilt. Rebuild the CLI:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm run build:server
```

### Parent directory for `--output` is missing

Create the directory first. The command does not create it:

```bash
AUDIT_DIR="$(mktemp -d)"
node dist-server/cli.js alice-howto-parity-audit \
  --output "$AUDIT_DIR/alice-howto-parity-audit.json"
```

### Evidence was written into the repository

Move the audit output to a temporary directory or CI artifact path and remove
generated evidence from the source tree.

## Related docs

- [Alice HowTo parity audit reference](./alice-howto-parity-audit-reference.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Gadugi test scenarios](./gadugi-test-scenarios.md)
- [Testing](./testing.md)
