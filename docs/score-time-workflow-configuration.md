---
title: Score and time workflow configuration
description: Configuration reference for Alice scorekeepers, timekeepers, visible bindings, project persistence, and local validation.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Score and time workflow configuration

This document describes the configuration contract for Alice scorekeepers,
timekeepers, visible bindings, project persistence, and browser selectors.

Scorekeeper and timekeeper support is normal Alice project state. It does not
require a feature flag, a separate server, a second timer, or new dependencies.

## Contents

- [Project fields](#project-fields)
- [Visible binding target](#visible-binding-target)
- [Display formats](#display-formats)
- [World execution timing](#world-execution-timing)
- [Browser selectors](#browser-selectors)
- [Project IO](#project-io)
- [Local validation memory](#local-validation-memory)
- [Related docs](#related-docs)

## Project fields

The workflow state lives in `aliceWorkflow`.

| Field | Required | Default | Rule |
| --- | --- | --- | --- |
| `schemaVersion` | yes | `alice-web.workflow-state/v1` | Exact value |
| `scorekeepers` | no | `[]` | Array of scorekeeper definitions |
| `timekeepers` | no | `[]` | Array of timekeeper definitions |
| `visibleBindings` | no | `[]` | Array of visible score/time bindings |

Scorekeeper definition:

| Field | Required | Default | Rule |
| --- | --- | --- | --- |
| `name` | yes | none | Unique project-local name |
| `initialValue` | no | `0` | Finite number; numeric strings are rejected |

Timekeeper definition:

| Field | Required | Default | Rule |
| --- | --- | --- | --- |
| `name` | yes | none | Unique project-local name |

Timekeepers have no configured initial value. They always resolve to `0` before
world execution and after reset.

Visible binding definition:

| Field | Required | Default | Rule |
| --- | --- | --- | --- |
| `id` | yes | none | Unique binding ID |
| `kind` | yes | none | `score` or `time` |
| `sourceName` | yes | none | Existing scorekeeper or timekeeper |
| `target` | yes | `world-overlay` | Alice-owned visible label area |
| `label` | yes | `Score` or `Time` | Visible label prefix |
| `format` | no | By kind | Allowed display format |

## Visible binding target

`world-overlay` is the only configured target. It places score and time labels
in the Alice world view where browser tests and students can see them.

The workflow does not accept arbitrary CSS selectors or HTML snippets. It
creates Alice-owned labels and writes text through safe text APIs.

## Display formats

Score formats:

| Format | Example value | Visible text |
| --- | --- | --- |
| `integer` | `10` | `Score: 10` |
| `number` | `10.5` | `Score: 10.5` |

Time formats:

| Format | Example value | Visible text |
| --- | --- | --- |
| `seconds-one-decimal` | `1.5` | `Time: 1.5` |
| `seconds-integer` | `2` | `Time: 2` |

Default formats are `integer` for score and `seconds-one-decimal` for time.

## World execution timing

Timekeepers read elapsed seconds from Alice world execution. They share the same
time source used by animation and run controls.

| World state | Timekeeper behavior |
| --- | --- |
| Not running | Shows `0` |
| Running | Advances with Alice world time |
| Paused | Holds the last elapsed value |
| Reset | Returns to `0` |

The workflow must not create another timer. A separate timer would drift from
animations and make tests flaky.

## Browser selectors

Browser tests and curriculum checks use stable `data-testid` attributes.

| Selector | Purpose |
| --- | --- |
| `[data-testid="score-time-panel"]` | Score and Time panel |
| `[data-testid="score-time-status"]` | Status region |
| `[data-testid="scorekeeper-name"]` | Scorekeeper name input |
| `[data-testid="scorekeeper-initial-value"]` | Scorekeeper initial value input |
| `[data-testid="add-scorekeeper"]` | Add scorekeeper button |
| `[data-testid="timekeeper-name"]` | Timekeeper name input |
| `[data-testid="add-timekeeper"]` | Add timekeeper button |
| `[data-testid="add-visible-score"]` | Add visible score label button |
| `[data-testid="add-visible-time"]` | Add visible time label button |
| `[data-testid="visible-score-label"]` | Score text shown in the world view |
| `[data-testid="visible-time-label"]` | Time text shown in the world view |
| `[data-testid="run-world"]` | World run control |

Tests assert the visible label text, not only project model data.

## Project IO

Project IO reads and writes the `aliceWorkflow` manifest object:

```json
{
  "aliceWorkflow": {
    "schemaVersion": "alice-web.workflow-state/v1",
    "scorekeepers": [],
    "timekeepers": [],
    "visibleBindings": []
  }
}
```

Project IO validation rejects:

| Problem | Result |
| --- | --- |
| Invalid JSON manifest | Project read fails |
| Unknown workflow field | Project read fails |
| Duplicate scorekeeper or timekeeper name | Project read fails |
| Non-finite score value | Project read fails |
| Numeric string score value | Project read fails |
| Timekeeper value field | Project read fails |
| Binding to a missing source | Project read fails |
| Binding target other than `world-overlay` | Project read fails |
| Dangerous object key | Project read fails |

The workflow stores metadata only. It does not store secrets, telemetry, or raw
browser output.

## Local validation memory

Use the configured Node.js heap limit for local validation:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm run build
npm test
```

`NODE_OPTIONS` affects local Node.js process memory. It is not a project setting
and is not written into Alice projects.

## Related docs

- [Score and time workflow usage](./score-time-workflow-usage.md)
- [Score and time workflow API](./score-time-workflow-api.md)
- [Tutorial: add score and time to an Alice world](./tutorial-score-time-workflow.md)
- [Project IO configuration](./project-io-configuration.md)
- [Testing](./testing.md)
