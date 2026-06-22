---
title: Score and time workflow API
description: TypeScript API reference for Alice scorekeeper, timekeeper, visible binding, validation, and project workflow state.
last_updated: 2026-06-22
review_schedule: quarterly
doc_type: reference
---

# Score and time workflow API

This document describes the public TypeScript contract for Alice
scorekeepers, timekeepers, visible bindings, validation, and browser-visible
state resolution. The API is exported from the root package under the
`AliceWorkflowState` namespace.

The namespace contains only reusable helpers for defining score/time workflow
state, validating it, binding it to visible Alice labels, and resolving visible
text. Runtime score changes remain normal Alice numeric variable assignments.

## Contents

- [Import](#import)
- [State model](#state-model)
- [Types](#types)
- [Functions](#functions)
- [Validation rules](#validation-rules)
- [Project IO manifest contract](#project-io-manifest-contract)
- [Error handling](#error-handling)
- [Related docs](#related-docs)

## Import

```typescript
import { AliceWorkflowState } from "alice-web";
```

## State model

```typescript
const state = AliceWorkflowState.createDefaultAliceWorkflowState();

console.log(state.schemaVersion);
console.log(state.scorekeepers);
console.log(state.timekeepers);
console.log(state.visibleBindings);
```

Default state:

```json
{
  "schemaVersion": "alice-web.workflow-state/v1",
  "scorekeepers": [],
  "timekeepers": [],
  "visibleBindings": []
}
```

Scorekeeper definitions describe numeric Alice variables and display metadata.
Timekeeper definitions describe labels backed by elapsed Alice world time.
Visible bindings format those values for browser labels.

## Types

```typescript
declare const ALICE_WORKFLOW_STATE_SCHEMA_VERSION:
  "alice-web.workflow-state/v1";

type AliceWorkflowBindingKind = "score" | "time";
type AliceWorkflowBindingTarget = "world-overlay";
type ScorekeeperFormat = "integer" | "number";
type TimekeeperFormat = "seconds-one-decimal" | "seconds-integer";

interface AliceWorkflowState {
  schemaVersion: typeof ALICE_WORKFLOW_STATE_SCHEMA_VERSION;
  scorekeepers: ScorekeeperDefinition[];
  timekeepers: TimekeeperDefinition[];
  visibleBindings: VisibleWorkflowBinding[];
}

interface ScorekeeperDefinition {
  name: string;
  initialValue: number;
}

interface TimekeeperDefinition {
  name: string;
}

interface VisibleWorkflowBinding {
  id: string;
  kind: AliceWorkflowBindingKind;
  sourceName: string;
  target: AliceWorkflowBindingTarget;
  label: string;
  format?: ScorekeeperFormat | TimekeeperFormat;
}

interface ResolvedVisibleWorkflowBinding {
  id: string;
  kind: AliceWorkflowBindingKind;
  sourceName: string;
  target: AliceWorkflowBindingTarget;
  label: string;
  value: number;
  text: string;
}

interface AddScorekeeperOptions {
  name: string;
  initialValue?: number;
}

interface AddTimekeeperOptions {
  name: string;
}

interface ResolveVisibleWorkflowBindingsOptions {
  scoreValues?: Readonly<Record<string, number>>;
  elapsedSeconds?: number;
}
```

`TimekeeperDefinition` has no `initialValue`. Alice timekeepers measure elapsed
world time from `0` for each world run.

## Functions

```typescript
function createDefaultAliceWorkflowState(): AliceWorkflowState;

function validateAliceWorkflowState(
  value: unknown,
): AliceWorkflowState;

function addScorekeeper(
  state: AliceWorkflowState,
  options: AddScorekeeperOptions,
): AliceWorkflowState;

function addTimekeeper(
  state: AliceWorkflowState,
  options: AddTimekeeperOptions,
): AliceWorkflowState;

function bindVisibleWorkflowState(
  state: AliceWorkflowState,
  binding: VisibleWorkflowBinding,
): AliceWorkflowState;

function resolveVisibleWorkflowBindings(
  state: AliceWorkflowState,
  options?: ResolveVisibleWorkflowBindingsOptions,
): ResolvedVisibleWorkflowBinding[];
```

| Function | Behavior |
| --- | --- |
| `createDefaultAliceWorkflowState()` | Returns empty scorekeeper, timekeeper, and visible binding arrays |
| `validateAliceWorkflowState(value)` | Validates schema, names, finite numbers, bindings, and unknown fields; returns a deep copy |
| `addScorekeeper(state, options)` | Adds a scorekeeper definition with default initial value `0` when omitted |
| `addTimekeeper(state, options)` | Adds a timekeeper definition backed by Alice world time |
| `bindVisibleWorkflowState(state, binding)` | Adds or replaces a visible binding |
| `resolveVisibleWorkflowBindings(state, options)` | Formats score and time values for visible Alice labels |

All state-changing helpers return a new state object and leave the input state
unchanged.

`resolveVisibleWorkflowBindings()` uses scorekeeper initial values when
`scoreValues` is omitted. During world execution, callers pass current Alice
numeric variable values through `scoreValues`. When `scoreValues` is provided,
missing, non-finite, or string values for a bound score are rejected.

Example visible resolution after Alice assignment changes `score`:

```typescript
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

## Validation rules

The workflow rejects invalid input before state changes.

| Input | Rule |
| --- | --- |
| Schema version | Must be `alice-web.workflow-state/v1` |
| Names | Trimmed, non-empty, unique, and at most 80 characters |
| Score values | Finite numbers only; numeric strings are rejected |
| Timekeeper value fields | Not accepted |
| Binding IDs | Trimmed, non-empty, unique, and at most 120 characters |
| Binding kind | `score` or `time` |
| Binding target | `world-overlay` |
| Binding source | Must match a scorekeeper for `score`, or a timekeeper for `time` |
| Labels | Trimmed, non-empty, and at most 80 characters |
| Formats | Must match the binding kind |
| Unknown manifest fields | Rejected |
| Dangerous object keys | `__proto__`, `prototype`, and `constructor` are rejected |

Bad score values:

```typescript
AliceWorkflowState.addScorekeeper(state, {
  name: "score",
  initialValue: Number.NaN,
});

const invalidManifest: unknown = {
  schemaVersion: "alice-web.workflow-state/v1",
  scorekeepers: [{ name: "score", initialValue: "10" }],
  timekeepers: [],
  visibleBindings: [],
};

AliceWorkflowState.validateAliceWorkflowState(invalidManifest);
```

Both validation paths throw `AliceWorkflowState.AliceWorkflowStateError`.

## Project IO manifest contract

Project IO stores workflow state in the root manifest under `aliceWorkflow`.

```typescript
interface AliceWorkflowManifest {
  schemaVersion: "alice-web.workflow-state/v1";
  scorekeepers: ScorekeeperDefinition[];
  timekeepers: TimekeeperDefinition[];
  visibleBindings: VisibleWorkflowBinding[];
}
```

Example:

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

`readProject()` validates `aliceWorkflow` before returning it on the project
archive. `writeProject()` writes the validated state back to the manifest and
preserves unrelated manifest fields.

## Error handling

```typescript
try {
  AliceWorkflowState.validateAliceWorkflowState(input);
} catch (error) {
  if (error instanceof AliceWorkflowState.AliceWorkflowStateError) {
    console.error(error.code, error.message);
  } else {
    throw error;
  }
}
```

```typescript
type AliceWorkflowStateErrorCode =
  | "invalid-schema-version"
  | "invalid-name"
  | "duplicate-name"
  | "invalid-score-value"
  | "invalid-binding"
  | "missing-binding-source"
  | "unexpected-field";

class AliceWorkflowStateError extends Error {
  readonly code: AliceWorkflowStateErrorCode;
  readonly path: string;
}
```

Errors include a `path` such as `aliceWorkflow.scorekeepers[0].initialValue` so
the browser can point users to the field that needs attention.

## Related docs

- [Score and time workflow usage](./score-time-workflow-usage.md)
- [Score and time workflow configuration](./score-time-workflow-configuration.md)
- [Tutorial: add score and time to an Alice world](./tutorial-score-time-workflow.md)
- [Project IO API reference](./project-io-api.md)
- [VM Scene Bridge](./vm-scene-bridge.md)
