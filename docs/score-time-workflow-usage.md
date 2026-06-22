---
title: Score and time workflow usage
description: How-to guide for creating scorekeeper and timekeeper state, binding it to visible Alice labels, and verifying it while a world runs.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: how-to
---

# Score and time workflow usage

This document describes the Alice scorekeeper and timekeeper workflow. The UI
selectors, manifest fields, and TypeScript examples are current contracts for
the implemented feature.

The workflow lets Alice projects show a score and elapsed world time while the
world runs. Authors create scorekeeper and timekeeper definitions, bind them to
visible labels, and then use normal Alice numeric variables and Alice world time
to keep the browser view current.

Use scorekeepers for numeric game or lesson values such as points, collected
items, attempts, or lives. Use timekeepers for elapsed world time that follows
Alice execution time.

## Contents

- [Browser authoring flow](#browser-authoring-flow)
- [Scorekeeper behavior](#scorekeeper-behavior)
- [Timekeeper behavior](#timekeeper-behavior)
- [Visible bindings](#visible-bindings)
- [Use from TypeScript](#use-from-typescript)
- [Save, open, and export](#save-open-and-export)
- [Browser scenario for tests](#browser-scenario-for-tests)
- [Related docs](#related-docs)

## Browser authoring flow

Open Alice in a browser and use the **Score and Time** panel beside the scene.
The panel shows scorekeepers, timekeepers, visible labels, and binding status.

```bash
npm install
NODE_OPTIONS=--max-old-space-size=32768 npm run build
npm run dev
```

Create a score label:

1. Enter `score` in the scorekeeper name field.
2. Keep the initial value at `0`, or enter another finite number.
3. Choose **Add Scorekeeper**.
4. Choose **Add Visible Score** to create a label in the world view.
5. Bind the label to `score`.

Create a time label:

1. Enter `elapsedTime` in the timekeeper name field.
2. Choose **Add Timekeeper**.
3. Choose **Add Visible Time** to create a label in the world view.
4. Bind the label to `elapsedTime`.

When the world runs, the visible score label changes when Alice code changes
the numeric `score` variable. The visible time label changes as Alice world time
advances.

## Scorekeeper behavior

A scorekeeper is a named numeric Alice variable with display metadata. The
workflow defines the variable and visible binding; runtime score changes use the
same Alice assignment and arithmetic semantics as any other numeric variable.

| Rule | Behavior |
| --- | --- |
| Default value | `0` |
| Accepted values | Finite numbers |
| Rejected values | `NaN`, `Infinity`, `-Infinity`, numeric strings such as `"10"`, and missing values |
| Runtime changes | Alice numeric assignment and arithmetic update the score variable |
| Visible update | Bound labels update after Alice changes the score variable |
| Persistence | Saved with Alice project workflow state |

Example Alice code that updates the scorekeeper value:

```tweedle
this.score <- this.score + 10;
```

The workflow must not require a separate score mutation API for world execution.
Tests should exercise Alice variable assignment, then assert the browser-visible
label text.

Scorekeeper names are project-local identifiers. Names must be unique across
scorekeepers and timekeepers so visible bindings always point to one source.

## Timekeeper behavior

A timekeeper exposes elapsed Alice world time as visible state. It does not use a
separate timer or a user-configured initial value. Alice reads elapsed time from
the same world execution timing used by animations and run controls.

| Rule | Behavior |
| --- | --- |
| Default value | `0` seconds |
| Time source | Alice world execution time |
| Paused world | Time does not advance |
| Reset world | Time returns to `0` |
| Visible update | Bound labels update during world execution |
| Persistence | Saved with Alice project workflow state |

The default display format is seconds with one decimal place, such as `0.0`,
`1.5`, or `12.0`. Authors can choose whole seconds when a lesson needs simpler
display text.

## Visible bindings

Visible bindings connect scorekeeper and timekeeper values to labels in the
Alice world view. Bindings use Alice-owned visible targets, not raw DOM
selectors.

| Binding kind | Source | Visible target | Default text |
| --- | --- | --- | --- |
| `score` | Alice numeric score variable | Score label | `Score: 0` |
| `time` | Alice elapsed world seconds | Time label | `Time: 0.0` |

Visible text is rendered as text, not HTML. Scorekeeper and timekeeper names are
escaped by the browser before display. Binding errors are shown in the panel and
the previous visible value remains unchanged.

Stable browser selectors:

| Selector | Purpose |
| --- | --- |
| `[data-testid="score-time-panel"]` | Score and Time panel |
| `[data-testid="score-time-status"]` | Human-readable status text |
| `[data-testid="scorekeeper-name"]` | Scorekeeper name field |
| `[data-testid="scorekeeper-initial-value"]` | Scorekeeper initial value field |
| `[data-testid="add-scorekeeper"]` | Add scorekeeper button |
| `[data-testid="timekeeper-name"]` | Timekeeper name field |
| `[data-testid="add-timekeeper"]` | Add timekeeper button |
| `[data-testid="add-visible-score"]` | Add visible score label button |
| `[data-testid="add-visible-time"]` | Add visible time label button |
| `[data-testid="visible-score-label"]` | Browser-visible score label |
| `[data-testid="visible-time-label"]` | Browser-visible time label |
| `[data-testid="run-world"]` | World run control |

Tests should assert the browser-visible label text. Model-only assertions do not
prove the workflow works for Alice web lessons.

## Use from TypeScript

Use the public `AliceWorkflowState` namespace for authoring and test setup. The
helpers manage definitions and visible bindings. They do not replace Alice
runtime variable assignment.

```typescript
import { AliceWorkflowState } from "alice-web";

let workflow = AliceWorkflowState.createDefaultAliceWorkflowState();

workflow = AliceWorkflowState.addScorekeeper(workflow, {
  name: "score",
  initialValue: 0,
});

workflow = AliceWorkflowState.addTimekeeper(workflow, {
  name: "elapsedTime",
});

workflow = AliceWorkflowState.bindVisibleWorkflowState(workflow, {
  id: "score-label",
  kind: "score",
  sourceName: "score",
  target: "world-overlay",
  label: "Score",
  format: "integer",
});

workflow = AliceWorkflowState.bindVisibleWorkflowState(workflow, {
  id: "time-label",
  kind: "time",
  sourceName: "elapsedTime",
  target: "world-overlay",
  label: "Time",
  format: "seconds-one-decimal",
});

const visible = AliceWorkflowState.resolveVisibleWorkflowBindings(workflow, {
  scoreValues: { score: 10 },
  elapsedSeconds: 1.2,
});

console.log(visible.map((binding) => binding.text));
```

Expected output:

```text
Score: 10
Time: 1.2
```

Helpers return new workflow state objects. They do not mutate the input state.

## Save, open, and export

Score and time workflow state is Alice project state. It is preserved when a
project is saved, opened again, or exported as an `alice-web` package.

Project IO stores the state under `aliceWorkflow` in the root manifest:

```json
{
  "aliceWorkflow": {
    "schemaVersion": "alice-web.workflow-state/v1",
    "scorekeepers": [
      {
        "name": "score",
        "initialValue": 0
      }
    ],
    "timekeepers": [
      {
        "name": "elapsedTime"
      }
    ],
    "visibleBindings": [
      {
        "id": "score-label",
        "kind": "score",
        "sourceName": "score",
        "target": "world-overlay",
        "label": "Score",
        "format": "integer"
      },
      {
        "id": "time-label",
        "kind": "time",
        "sourceName": "elapsedTime",
        "target": "world-overlay",
        "label": "Time",
        "format": "seconds-one-decimal"
      }
    ]
  }
}
```

Project IO preserves unrelated manifest fields. Invalid workflow manifest data
is rejected before it changes project state.

## Browser scenario for tests

A full browser scenario proves authoring and execution behavior:

1. Open Alice and verify the Score and Time panel is visible.
2. Add a scorekeeper named `score` with initial value `0`.
3. Add a timekeeper named `elapsedTime`.
4. Add visible score and time labels.
5. Bind the score label to `score`.
6. Bind the time label to `elapsedTime`.
7. Run the world.
8. Trigger Alice code that assigns a new numeric value to `score`.
9. Assert the visible score label changes from `Score: 0`.
10. Assert the visible time label changes from `Time: 0.0`.

Use polling against visible text for time assertions. Do not rely on fixed
sleep durations.

## Related docs

- [Score and time workflow API](./score-time-workflow-api.md)
- [Score and time workflow configuration](./score-time-workflow-configuration.md)
- [Tutorial: add score and time to an Alice world](./tutorial-score-time-workflow.md)
- [Project IO usage guide](./project-io-usage.md)
- [Alice identity boundary](./alice-identity-boundary.md)
