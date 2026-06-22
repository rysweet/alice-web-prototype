---
title: Tutorial: add score and time to an Alice world
description: Tutorial for an Alice web flow with a scorekeeper, a timekeeper, visible labels, and browser-visible state changes.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: tutorial
---

# Tutorial: add score and time to an Alice world

This tutorial walks through the Alice score and time workflow. The UI controls,
selectors, manifest fields, and TypeScript API shown here are current contracts
for the implemented feature.

## What you will build

The world shows two labels:

```text
Score: 0
Time: 0.0
```

When the world runs, Alice code changes the score through normal numeric
assignment and Alice world time advances. The browser-visible labels update to
values such as:

```text
Score: 10
Time: 1.2
```

## Prerequisites

```bash
npm install
export NODE_OPTIONS=--max-old-space-size=32768
npm run build
npm run dev
```

Open the local Alice page printed by the development command.

## 1. Add scorekeeper state

In the **Score and Time** panel:

1. Enter `score` as the scorekeeper name.
2. Enter `0` as the initial value.
3. Choose **Add Scorekeeper**.

Alice creates a numeric project variable named `score`. The scorekeeper begins
at `0` and can be changed by normal Alice code.

## 2. Add timekeeper state

In the same panel:

1. Enter `elapsedTime` as the timekeeper name.
2. Choose **Add Timekeeper**.

Alice creates a timekeeper that reads elapsed world time. The value is `0` until
the world runs.

## 3. Add visible labels

Add one visible label for each source:

1. Choose **Add Visible Score**.
2. Bind the new score label to `score`.
3. Choose **Add Visible Time**.
4. Bind the new time label to `elapsedTime`.

The world view now shows:

```text
Score: 0
Time: 0.0
```

These labels are browser-visible Alice state. They are not hidden test-only
fields.

## 4. Change score during world execution

Use Alice code to change the score while the world runs:

```tweedle
this.score <- this.score + 10;
```

The visible score label updates:

```text
Score: 10
```

The scorekeeper uses normal numeric variable rules, so later code can add,
subtract, or assign another finite value.

## 5. Verify time advances

Run the world and wait for the time label text to change from `Time: 0.0`.

Good browser checks wait for visible text:

```typescript
await expect(page.getByTestId("visible-time-label")).not.toHaveText("Time: 0.0");
```

Avoid fixed sleep-only checks. The assertion should follow browser-visible
Alice state.

## 6. Save and open again

Save the project. Alice writes the scorekeeper, timekeeper, and visible bindings
to project workflow state:

```json
{
  "aliceWorkflow": {
    "schemaVersion": "alice-web.workflow-state/v1",
    "scorekeepers": [
      { "name": "score", "initialValue": 0 }
    ],
    "timekeepers": [
      { "name": "elapsedTime" }
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

When the project is opened again, the labels and bindings are restored.

## Complete TypeScript setup

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

The TypeScript setup resolves labels from current Alice runtime values. It does
not mutate the scorekeeper; score changes still come from Alice numeric
assignment.

## Browser test checklist

Use this checklist for an end-to-end scenario:

1. Open Alice.
2. Add `score` with initial value `0`.
3. Add `elapsedTime`.
4. Add visible score and time labels.
5. Bind both labels.
6. Run the world.
7. Change `score` through Alice assignment.
8. Assert the visible score label changes.
9. Assert the visible time label changes.

## Related docs

- [Score and time workflow usage](./score-time-workflow-usage.md)
- [Score and time workflow API](./score-time-workflow-api.md)
- [Score and time workflow configuration](./score-time-workflow-configuration.md)
- [Testing](./testing.md)
