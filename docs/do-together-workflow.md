---
title: "Alice do-together workflow"
description: Workflow for authoring and running an Alice do-together block in the browser and inspecting runtime evidence for the shared execution window.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: howto
---

# Alice do-together workflow

Use a do-together block when two Alice actions should belong to the same
workflow group. This document describes the intended Alice behavior: the runtime
will record structured evidence for the group so browser tests and tools can
prove the actions shared one active window.

Alice exposes this evidence from the VM log and from the browser run result.

## Contents

- [Runtime evidence contract](#runtime-evidence-contract)
- [When to use it](#when-to-use-it)
- [Author a do-together block in Alice](#author-a-do-together-block-in-alice)
- [Run the workflow](#run-the-workflow)
- [Inspect browser runtime evidence](#inspect-browser-runtime-evidence)
- [Use the local API](#use-the-local-api)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Related docs](#related-docs)

## Runtime evidence contract

Alice supports one stable inspection path for browser do-together proof:

```typescript
window.aliceWeb.latestRunResult
```

That browser value matches the VM evidence shape. Tests should assert
`execution_log[].doTogetherEvidence` from the structured result. They should not
depend on visible browser text, screenshots, or `detail` string parsing.

## When to use it

A do-together block is the right shape when a lesson or scene needs two actions
to be represented as one grouped workflow. For example, a character can move as
another character turns, or one object can play an animation as another changes
pose.

Do-together evidence proves the Alice runtime grouped the actions together in one
active window. It does not prove wall-clock parallel execution, and it does not
depend on UI text or a screenshot.

## Author a do-together block in Alice

1. Open Alice in the browser.
2. Create or open a project.
3. Add a do-together block to the procedure that runs when the scene starts.
4. Put exactly two action statements inside the do-together block.
5. Keep both action statements as direct children of the do-together block.

Example procedure shape:

```text
myFirstMethod
  do together
    bunny.move
    snowperson.turn
```

The browser editor will store this as an Alice statement with kind `DoTogether`
and two `body` entries. Alice must preserve that shape when it runs the project
through the web runtime.

## Run the workflow

Run the project from the browser. After the run completes, Alice will keep the
latest structured run result in the page runtime for test and tool inspection.

The result includes:

- the ordered `execution_log`
- the `doTogetherEvidence` entries attached to do-together log records
- the same evidence in the latest browser run result

## Inspect browser runtime evidence

Browser tests should inspect the latest Alice run result without reading visible
text:

```typescript
declare global {
  interface Window {
    aliceWeb: {
      latestRunResult: AliceRunWorldResult | null;
    };
  }
}

const result = await page.evaluate(() => window.aliceWeb.latestRunResult);
const group = result.execution_log.find((entry) => entry.kind === "DoTogether");

expect(group.doTogetherEvidence).toMatchObject({
  kind: "DoTogether",
  actionCount: 2,
});
```

Each action in the group must have the same `groupId` and `windowId`. The action
start steps must be inside the group's active window, and every action must have
a matching completion step.

```typescript
const evidence = group.doTogetherEvidence;

expect(evidence.actions).toHaveLength(2);
expect(new Set(evidence.actions.map((action) => action.groupId))).toEqual(new Set([evidence.groupId]));
expect(new Set(evidence.actions.map((action) => action.windowId))).toEqual(new Set([evidence.windowId]));

for (const action of evidence.actions) {
  expect(action.startedAtStep).toBeGreaterThanOrEqual(evidence.activeWindow.startedAtStep);
  expect(action.completedAtStep).toBeLessThanOrEqual(evidence.activeWindow.completedAtStep);
}

const latestStart = Math.max(...evidence.actions.map((action) => action.startedAtStep));
const earliestCompletion = Math.min(...evidence.actions.map((action) => action.completedAtStep));
expect(latestStart).toBeLessThanOrEqual(earliestCompletion);
```

## Use the local API

The local Alice API returns the same VM evidence through `POST /api/world/run`
when a project session exists.

```bash
export NODE_OPTIONS=--max-old-space-size=32768
export ALICE_LOCAL_API_TOKEN="$(node -e 'console.log(require("crypto").randomBytes(32).toString("base64url"))')"

npm run build:server
npm run serve -- --port 3000 --evidence-dir ./evidence --api-token "$ALICE_LOCAL_API_TOKEN"
```

Run the current project session:

```bash
curl -X POST http://127.0.0.1:3000/api/world/run \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Example response excerpt:

```json
{
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "execution_log": [
    {
      "step": 1,
      "kind": "DoTogether",
      "detail": "run 2 statements together",
      "doTogetherEvidence": {
        "kind": "DoTogether",
        "groupId": "do-together-1",
        "windowId": "do-together-1-window",
        "actionCount": 2,
        "activeWindow": {
          "startedAtStep": 2,
          "completedAtStep": 4
        },
        "actions": [
          {
            "actionId": "do-together-1-action-0",
            "branchIndex": 0,
            "statementKind": "MethodCall",
            "groupId": "do-together-1",
            "windowId": "do-together-1-window",
            "startedAtStep": 2,
            "completedAtStep": 3
          },
          {
            "actionId": "do-together-1-action-1",
            "branchIndex": 1,
            "statementKind": "MethodCall",
            "groupId": "do-together-1",
            "windowId": "do-together-1-window",
            "startedAtStep": 2,
            "completedAtStep": 4
          }
        ]
      }
    }
  ]
}
```

See [do-together runtime evidence](./do-together-runtime-evidence.md) for the
complete field contract.

## Configuration

No feature flag is required. Do-together runtime evidence is produced whenever
Alice runs a project that contains a `DoTogether` statement.

Use the configured Node heap limit for local validation:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
npm run test:e2e
```

## Troubleshooting

| Problem | Check |
| --- | --- |
| No `DoTogether` entry appears | Confirm the authored procedure contains a `DoTogether` statement, not a plain ordered block. |
| `actionCount` is not `2` | Confirm the block has exactly two direct child action statements. |
| The two actions have different group or window ids | Treat the run as invalid; Alice must record both direct child actions in the same group and window. |
| The evidence is missing in Playwright | Read `window.aliceWeb.latestRunResult` after the browser run completes. |
| The API response has no evidence | Use `POST /api/world/run`; evidence is attached to the structured run result, not to screenshot or project-save responses. |

## Related docs

- [Do-together runtime evidence](./do-together-runtime-evidence.md)
- [Tweedle statement VM execution](./statement-execution.md)
- [Testing](./testing.md)
- [A3P statement round-trip coverage](./a3p-statement-round-trip.md)
