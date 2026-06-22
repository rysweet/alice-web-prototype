---
title: "Do-together runtime evidence"
description: Reference for Alice runtime evidence that proves actions in a do-together block shared one execution group and active window.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Do-together runtime evidence

This reference defines the structured evidence Alice records when the web
runtime executes a `DoTogether` statement.

Use this contract from VM tests, Playwright tests, local API clients, and
debugging tools that need to prove two actions belonged to the same workflow
group and shared one active window.

This evidence extends the current run result without changing existing
`LogEntry` fields.

## Contents

- [Surfaces](#surfaces)
- [Execution log entry](#execution-log-entry)
- [Evidence object](#evidence-object)
- [Action evidence](#action-evidence)
- [Active-window proof rules](#active-window-proof-rules)
- [Browser runtime result](#browser-runtime-result)
- [Local API result](#local-api-result)
- [Security and privacy](#security-and-privacy)
- [Configuration](#configuration)
- [Related docs](#related-docs)

## Surfaces

Do-together evidence is exposed on the same structured run result across
Alice:

| Surface | Field |
| --- | --- |
| VM module | `ExecutionResult.execution_log[].doTogetherEvidence` |
| Browser runtime | `window.aliceWeb.latestRunResult.execution_log[].doTogetherEvidence` |
| Local API | `POST /api/world/run` response `execution_log[].doTogetherEvidence` |
| Evidence artifact | `run-world-result.json` `execution_log[].doTogetherEvidence` |

The evidence must be attached only to log entries whose `kind` is
`"DoTogether"`. Other log entries keep the existing `step`, `kind`, and `detail`
fields.

`window.aliceWeb.latestRunResult` is the stable browser inspection surface.
Alice does not need a second global, a DOM-only probe, or a screenshot-only proof
path for this feature.

## Execution log entry

```typescript
interface LogEntry {
  step: number;
  kind: string;
  detail: string;
  doTogetherEvidence?: DoTogetherEvidence;
}
```

| Field | Type | Description |
| --- | --- | --- |
| `step` | `number` | One-based VM step counter for the log entry. |
| `kind` | `string` | Statement kind. Do-together evidence appears when this is `"DoTogether"`. |
| `detail` | `string` | Human-readable statement summary. Tests should not parse this field for proof. |
| `doTogetherEvidence` | `DoTogetherEvidence` | Optional structured proof for a do-together group. |

## Evidence object

```typescript
interface DoTogetherEvidence {
  kind: "DoTogether";
  groupId: string;
  windowId: string;
  actionCount: number;
  activeWindow: DoTogetherActiveWindow;
  actions: DoTogetherActionEvidence[];
}

interface DoTogetherActiveWindow {
  startedAtStep: number;
  completedAtStep: number;
}
```

| Field | Type | Description |
| --- | --- | --- |
| `kind` | `"DoTogether"` | Evidence kind discriminator. |
| `groupId` | `string` | Deterministic id for one do-together execution group. |
| `windowId` | `string` | Deterministic id for the active window shared by all direct child actions. |
| `actionCount` | `number` | Number of direct child actions recorded in the group. |
| `activeWindow.startedAtStep` | `number` | VM step when the group became active. |
| `activeWindow.completedAtStep` | `number` | VM step when the group completed. |
| `actions` | `DoTogetherActionEvidence[]` | One record per direct child action, in branch order. |

`groupId` and `windowId` are stable within a single run result. They are not
user-facing identifiers and should not be stored as durable project data.

## Action evidence

```typescript
interface DoTogetherActionEvidence {
  actionId: string;
  branchIndex: number;
  statementKind: string;
  groupId: string;
  windowId: string;
  startedAtStep: number;
  completedAtStep: number;
}
```

| Field | Type | Description |
| --- | --- | --- |
| `actionId` | `string` | Deterministic id for this action record in the group. |
| `branchIndex` | `number` | Zero-based position of the direct child statement inside the do-together body. |
| `statementKind` | `string` | Alice statement kind for the child action, such as `"MethodCall"`. |
| `groupId` | `string` | Same value as the parent evidence `groupId`. |
| `windowId` | `string` | Same value as the parent evidence `windowId`. |
| `startedAtStep` | `number` | VM step when the action was marked active. |
| `completedAtStep` | `number` | VM step when the action completed. |

## Active-window proof rules

A do-together proof is valid when all of these are true:

1. The `DoTogether` log entry has `doTogetherEvidence.kind === "DoTogether"`.
2. `actionCount` equals `actions.length`.
3. For the browser parity scenario, `actionCount` is exactly `2`.
4. Every action has the same `groupId` as the parent evidence.
5. Every action has the same `windowId` as the parent evidence.
6. Every action starts at or after `activeWindow.startedAtStep`.
7. Every action completes at or before `activeWindow.completedAtStep`.
8. The action windows overlap: the latest action start is less than or equal to
   the earliest action completion.
9. Both action records are present before the group is considered complete.

The proof is about Alice runtime state, not wall-clock parallel execution. Tests
should assert these fields directly instead of searching UI text or parsing the
`detail` string.

## Browser runtime result

Alice exposes the latest browser run result at:

```typescript
window.aliceWeb.latestRunResult
```

The value is read-only from the test perspective and matches the VM result shape:

```typescript
interface AliceWebRuntimeApi {
  latestRunResult: AliceRunWorldResult | null;
}

interface AliceRunWorldResult {
  schema_version?: string;
  status: string;
  execution_log: LogEntry[];
}
```

`window.aliceWeb` is the stable namespace for browser automation. A browser run
sets `latestRunResult` to the latest completed or failed structured result, and a
new run replaces the previous value.

Playwright example:

```typescript
const evidence = await page.evaluate(() => {
  const result = window.aliceWeb.latestRunResult;
  const entry = result?.execution_log.find((item) => item.kind === "DoTogether");
  return entry?.doTogetherEvidence ?? null;
});

expect(evidence).not.toBeNull();
expect(evidence?.actionCount).toBe(2);
```

## Local API result

`POST /api/world/run` returns the same execution log shape when a project session
exists:

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

Clients should treat missing, partial, malformed, or mismatched evidence as a
failed proof.

## Security and privacy

Do-together evidence must contain metadata only:

- group ids
- window ids
- branch indexes
- statement kinds
- step markers
- completion markers

It must not contain project source text, user secrets, DOM content, stack traces,
environment values, or broad debug dumps.

Failed child action execution must not be converted into successful do-together
evidence. Alice must surface the run failure through the same error path as other
VM execution failures.

## Configuration

No configuration is required. Evidence is recorded automatically for every
executed `DoTogether` statement.

Use the configured Node heap limit for local validation:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
```

## Related docs

- [Alice do-together workflow](./do-together-workflow.md)
- [Tweedle statement VM execution](./statement-execution.md)
- [A3P statement round-trip coverage](./a3p-statement-round-trip.md)
- [Testing](./testing.md)
