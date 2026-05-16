# Tweedle Statement VM Execution

The Tweedle VM (`src/tweedle-vm.ts`) executes parsed Tweedle statements from
Alice `.a3p` projects with full scoping, control flow, and an ordered execution
log. It powers the `POST /api/world/run` endpoint and the `eatme-run-world`
CLI hook.

## Overview

When you call `POST /api/world/run`, the server:

1. Uses the cached parse from `POST /api/launch` (or parses on first run)
2. Calls `executeProject(parsedProject)` which walks every `AliceMethod`
   in `methods[]` order
3. Each method gets its own `VMScope` for local variables
4. Dispatches each `AliceStatement` by `kind` — updating object state,
   managing variables, evaluating conditions, and appending to the
   execution log
5. Returns the `ExecutionResult` with `execution_log` alongside existing
   response fields

The VM is a **pure module** (`src/tweedle-vm.ts`) with zero I/O dependencies.
It takes an `AliceProject` in, returns an `ExecutionResult` out.

## Quick Start

```bash
# Build and start the server
npm run build:server
node dist-server/cli.js serve \
  --port 3000 \
  --evidence-dir ./evidence \
  --project /path/to/starter.a3p

# Launch the project
curl -X POST http://localhost:3000/api/launch \
  -H 'Content-Type: application/json' \
  -d '{"project": "/path/to/starter.a3p"}'

# Execute the world — runs all methods through the Tweedle VM
curl -X POST http://localhost:3000/api/world/run
```

Response:

```json
{
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "project_name": "myProject",
  "scene_object_count": 5,
  "statements_executed": 12,
  "execution_log": [
    { "step": 1, "kind": "MethodCall", "detail": "this.move()" },
    { "step": 2, "kind": "MethodCall", "detail": "this.turn()" },
    { "step": 3, "kind": "CountLoop", "detail": "repeat 3 times (6 body statements)" },
    { "step": 4, "kind": "VariableDeclaration", "detail": "declare x: Number = 0" },
    { "step": 5, "kind": "ReturnStatement", "detail": "return 42" }
  ],
  "run_duration_ms": 3,
  "evidenceArtifact": "./evidence/run-world-result.json"
}
```

## Supported Statement Kinds

| Kind | Behavior |
|------|----------|
| `MethodCall` | Logs `object.method(args)`. Updates object state for known methods (`move` → position z+1). Unknown objects/methods are logged without error. |
| `CountLoop` | Repeats `body` statements exactly `count` times (capped at 10,000 iterations). Logged once with total body statement count. |
| `IfElse` | Evaluates `condition`: `"true"` literal → ifBody, `"false"` literal → elseBody, variable name → scope lookup, unknown → defaults to `true` (ifBody). |
| `ReturnStatement` | Sets `returned` flag and `returnValue` on scope. **Halts execution of the current method** — remaining statements in that method are skipped. |
| `VariableDeclaration` | Creates variable in current scope. If a variable with that name already exists, updates its value (assignment semantics). |
| `EventListener` | Registers handler in the event listener map. Logged but **never dispatched** during VM run. |
| `Comment` | Silently skipped. Not counted in `execution_log`. |
| Unknown | Logged with `kind: "Unknown"`. Not fatal — execution continues. |

## API Reference

### `POST /api/world/run`

Executes all methods in the parsed project through the Tweedle VM.

**Prerequisite:** `POST /api/launch` must be called first with a valid `.a3p`
project.

**Request:** No body required.

**Response:**

```jsonc
{
  // Existing fields (unchanged, backward compatible)
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "project_name": "myProject",
  "scene_object_count": 3,
  "procedure_count": 2,
  "run_duration_ms": 4,
  "evidenceArtifact": "/path/to/evidence/run-world-result.json",

  // VM execution fields
  "statements_executed": 8,
  "execution_log": [
    { "step": 1, "kind": "MethodCall", "detail": "this.move()" },
    { "step": 2, "kind": "CountLoop", "detail": "repeat 3 times (3 body statements)" },
    { "step": 3, "kind": "MethodCall", "detail": "this.turn()" },
    { "step": 4, "kind": "MethodCall", "detail": "this.turn()" },
    { "step": 5, "kind": "MethodCall", "detail": "this.turn()" },
    { "step": 6, "kind": "IfElse", "detail": "condition 'true' → ifBody" },
    { "step": 7, "kind": "MethodCall", "detail": "this.say()" },
    { "step": 8, "kind": "EventListener", "detail": "registered SceneActivation" }
  ],
  "errors": [],
  "doesNotClaim": [
    "visible rendering correctness",
    "desktop run-button proof"
  ]
}
```

**Field descriptions (new VM fields):**

| Field | Type | Description |
|-------|------|-------------|
| `statements_executed` | `number` | Total statements dispatched, including nested loop/if bodies. |
| `execution_log` | `LogEntry[]` | Ordered trace of every statement executed. Each entry has `step`, `kind`, and `detail`. |

**Existing fields (unchanged):**

| Field | Type | Description |
|-------|------|-------------|
| `schema_version` | `string` | Always `"eatme.alice-run-world-result/v1"`. |
| `status` | `string` | `"completed"` on success. |
| `project_name` | `string` | Name from the parsed `.a3p` project. |
| `scene_object_count` | `number` | Number of scene objects in the project. |
| `procedure_count` | `number` | Number of procedures (methods) in the project. |
| `run_duration_ms` | `number` | Wall-clock execution time in milliseconds. |
| `evidenceArtifact` | `string` | Path to the written evidence JSON file. |

> **Note:** The field is named `execution_log`, not `event_log`. This
> distinguishes the VM's structured trace from any future runtime event
> system.

**Error responses:**

| Status | Body | When |
|--------|------|------|
| `400` | `{"error": "Not launched. Call POST /api/launch first."}` | No prior launch call. |

### Execution Log Entry Shape

```typescript
interface LogEntry {
  step: number;    // 1-indexed sequential step counter
  kind: string;    // Statement kind: "MethodCall", "CountLoop", "IfElse", etc.
  detail: string;  // Human-readable description of what happened
}
```

**Detail string formats by kind:**

| Kind | Detail format | Example |
|------|---------------|---------|
| `MethodCall` | `"{object}.{method}()"` | `"this.move()"` |
| `CountLoop` | `"repeat {N} times ({M} body statements)"` | `"repeat 3 times (6 body statements)"` |
| `IfElse` | `"condition '{cond}' → {branch}"` | `"condition 'true' → ifBody"` |
| `ReturnStatement` | `"return {expression}"` | `"return 42"` |
| `VariableDeclaration` | `"declare {name}: {type} = {value}"` | `"declare x: Number = 0"` |
| `EventListener` | `"registered {event}"` | `"registered SceneActivation"` |
| `Unknown` | `"unknown statement: {kind}"` | `"unknown statement: FooBar"` |

## CLI Hook: `eatme-run-world`

The `tools/eatme-run-world` hook executes the project through the same VM:

```bash
tools/eatme-run-world --project starter.a3p --evidence-dir ./evidence --json
```

**Stdout** (single JSON line):

```json
{
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "run_selector": "scene.eatmeFirstLessonStep",
  "statements_executed": 5,
  "run_evidence_artifact": "run-world-result.json"
}
```

**Evidence artifact** (`run-world-result.json`):

```json
{
  "schema_version": "eatme.alice-run-world-result/v1",
  "status": "completed",
  "project_name": "myProject",
  "scene_object_count": 3,
  "statements_executed": 5,
  "execution_log": [
    { "step": 1, "kind": "MethodCall", "detail": "this.move()" },
    { "step": 2, "kind": "MethodCall", "detail": "this.turn()" },
    { "step": 3, "kind": "MethodCall", "detail": "this.say()" },
    { "step": 4, "kind": "EventListener", "detail": "registered SceneActivation" },
    { "step": 5, "kind": "VariableDeclaration", "detail": "declare count: Number = 0" }
  ],
  "run_duration_ms": 3,
  "errors": [],
  "doesNotClaim": [
    "visible rendering correctness",
    "desktop run-button proof"
  ]
}
```

## Module API: `tweedle-vm.ts`

The VM is a standalone module for direct use in tests or custom integrations.

### Types

```typescript
/** A single execution log entry. */
interface LogEntry {
  step: number;
  kind: string;
  detail: string;
}

/** Result of executing an entire project. */
interface ExecutionResult {
  execution_log: LogEntry[];
  returnValues: Map<string, unknown>;
}

/** Variable scope with parent chain. */
interface VMScope {
  variables: Map<string, unknown>;
  parent: VMScope | null;
  returned: boolean;
  returnValue: unknown;
}
```

### Functions

#### `executeProject(project: AliceProject): ExecutionResult`

Entry point. Walks all methods in `project.methods[]` in order. Each method
gets its own `VMScope`. Returns the combined execution log and any return
values keyed by method name.

```typescript
import { executeProject } from "./tweedle-vm.js";
import { parseA3P } from "./a3p-parser.js";

const data = fs.readFileSync("starter.a3p");
const project = await parseA3P(data);
const result = executeProject(project);

console.log(result.execution_log.length);  // number of steps executed
console.log(result.returnValues);          // Map { "myFunction" => 42 }
```

#### Variable Scoping

Each method creates a fresh `VMScope`. Variables declared with
`VariableDeclaration` are stored in the current scope. Variable lookup
walks the scope chain (current → parent → ... → null).

```typescript
// In method "myFirstMethod":
//   VariableDeclaration { name: "x", varType: "Number", value: "5" }
//   IfElse { condition: "x", ifBody: [...], elseBody: [...] }
//
// The IfElse evaluates "x" by looking up the variable in scope.
// Since "x" exists and is truthy, it takes the ifBody branch.
```

**Assignment semantics:** If a `VariableDeclaration` names a variable that
already exists in scope, the value is updated rather than creating a shadow.

```typescript
// VariableDeclaration { name: "x", value: "1" }  → creates x = "1"
// VariableDeclaration { name: "x", value: "2" }  → updates x = "2"
```

#### IfElse Condition Evaluation

Conditions are evaluated as follows (in order):

1. `"true"` literal → true (takes ifBody)
2. `"false"` literal → false (takes elseBody)
3. Variable name exists in scope → lookup value, truthy check
4. Unknown/unresolvable → defaults to `true` (takes ifBody)

No `eval()` is ever called. All evaluation is string comparison and
scope lookup.

#### ReturnStatement Halting

When a `ReturnStatement` is encountered:

1. The `returned` flag is set on the current `VMScope`
2. The `returnValue` is stored on the scope
3. The method's remaining statements are skipped
4. The return value is stored in `ExecutionResult.returnValues` keyed
   by method name

```typescript
// Method "calculateScore" has statements:
//   VariableDeclaration { name: "score", value: "100" }
//   ReturnStatement { expression: "score" }
//   MethodCall { method: "say" }  ← NEVER EXECUTED
//
// result.returnValues.get("calculateScore") → "score"
```

#### Event Listener Registration

Event listeners are stored in an internal `Map<string, AliceStatement[]>`
during execution. They are logged but **never dispatched** — no event
firing occurs during a VM run. This matches Alice's compile-time
registration model.

```typescript
// EventListener { event: "SceneActivation", body: [...] }
// → logged: { step: N, kind: "EventListener", detail: "registered SceneActivation" }
// → stored internally but body is never executed
```

### Usage Example

```typescript
import { executeProject } from "./tweedle-vm.js";
import type { AliceProject, AliceStatement } from "./a3p-parser.js";

// Build a synthetic project for testing
const project: AliceProject = {
  version: "3.10",
  projectName: "TestProject",
  sceneObjects: [
    {
      name: "bunny",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.BunnyResource",
      position: null,
      orientation: null,
      size: null,
    },
  ],
  methods: [
    {
      name: "myFirstMethod",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [
        { kind: "MethodCall", object: "bunny", method: "move", arguments: [] },
        {
          kind: "CountLoop",
          count: 3,
          body: [
            { kind: "MethodCall", object: "bunny", method: "turn", arguments: [] },
          ],
        },
        {
          kind: "IfElse",
          condition: "true",
          ifBody: [
            { kind: "MethodCall", object: "bunny", method: "say", arguments: [] },
          ],
          elseBody: [],
        },
        { kind: "VariableDeclaration", name: "score", varType: "Number", value: "100" },
      ],
    },
  ],
};

const result = executeProject(project);

// execution_log has entries for: move, loop header, 3x turn, if header, say, declare
console.log(result.execution_log);
// [
//   { step: 1, kind: "MethodCall", detail: "bunny.move()" },
//   { step: 2, kind: "CountLoop", detail: "repeat 3 times (3 body statements)" },
//   { step: 3, kind: "MethodCall", detail: "bunny.turn()" },
//   { step: 4, kind: "MethodCall", detail: "bunny.turn()" },
//   { step: 5, kind: "MethodCall", detail: "bunny.turn()" },
//   { step: 6, kind: "IfElse", detail: "condition 'true' → ifBody" },
//   { step: 7, kind: "MethodCall", detail: "bunny.say()" },
//   { step: 8, kind: "VariableDeclaration", detail: "declare score: Number = 100" },
// ]
```

## Security Limits

The VM enforces hard caps to prevent runaway execution:

| Limit | Value | Effect |
|-------|-------|--------|
| Total steps | 50,000 | Execution halts after 50,000 step dispatches. Partial log is returned. |
| Loop iterations | 10,000 | `CountLoop.count` clamped to 10,000. |
| Nesting depth | 100 | Nested CountLoop/IfElse beyond depth 100 → logged and skipped. |
| Variables per scope | 1,000 | `VariableDeclaration` beyond 1,000 in a single scope → logged and skipped. |
| Condition eval | String + scope lookup | `"true"` / `"false"` literals and variable lookup. Never calls `eval()`. |
| Module purity | Zero I/O imports | No `fs`, `path`, `child_process`, or network access in VM module. |
| Object storage | `Map<string, T>` only | All name-indexed lookups use `Map`, immune to prototype pollution. |

When a cap is hit, execution stops gracefully. The partial execution log is
returned — the VM never throws on cap violations.

## Configuration

No configuration is required. The VM uses sensible defaults. The limits
are compile-time constants in `src/tweedle-vm.ts`:

```typescript
const MAX_STEPS = 50_000;
const MAX_LOOP_ITERATIONS = 10_000;
const MAX_DEPTH = 100;
const MAX_VARIABLES_PER_SCOPE = 1_000;
```

To change these limits, modify the constants and rebuild:

```bash
npm run build:server
```

## Architecture

```
src/
  tweedle-vm.ts           ← VM module: executeProject(), VMScope, 7 handlers
  a3p-parser.ts           ← Parses .a3p → AliceProject
  server.ts               ← Wires VM into POST /api/world/run
  statement-executor.ts   ← Legacy executor (unused by live code paths)
  hooks/
    run-world.ts          ← Wires VM into CLI hook
```

**Data flow:**

```
.a3p file
  → parseA3P()         → AliceProject { methods[].statements[] }
  → executeProject()   → ExecutionResult { execution_log, returnValues }
  → HTTP response / CLI output
```

**Per-method execution flow:**

```
AliceMethod
  → create VMScope (fresh variable scope)
  → walk statements[]
    → dispatch by kind (switch/case, no eval)
    → append LogEntry to execution_log
    → if ReturnStatement: set returned flag, break
  → store returnValue in result (if function)
  → next method
```

## Testing

Run the VM tests:

```bash
npm test -- test/tweedle-vm.test.ts
```

The test suite covers:

| # | Category | Test | Verifies |
|---|----------|------|----------|
| 1 | Basic | Empty project | Returns empty log, empty returnValues |
| 2 | MethodCall | `move` | Log entry with `"object.move()"` detail |
| 3 | MethodCall | `turn`, `say`, `roll` | Log entry for each method |
| 4 | MethodCall | Unknown method | Logged without error |
| 5 | CountLoop | Body ×N | Correct step count, N body entries in log |
| 6 | CountLoop | count=0 | Loop header logged, no body entries |
| 7 | IfElse | condition `"true"` | Only ifBody statements in log |
| 8 | IfElse | condition `"false"` | Only elseBody statements in log |
| 9 | IfElse | condition is variable name | Scope lookup determines branch |
| 10 | IfElse | unknown condition | Defaults to ifBody |
| 11 | ReturnStatement | Halts method | Statements after return not in log |
| 12 | ReturnStatement | Return value stored | `returnValues.get(methodName)` has value |
| 13 | VariableDeclaration | Create | Variable exists in scope |
| 14 | VariableDeclaration | Update existing | Value overwritten, no duplicate |
| 15 | EventListener | Registration | Logged, body not executed |
| 16 | Comment | Skipped | Not in execution_log |
| 17 | Unknown kind | Graceful | Logged as Unknown, execution continues |
| 18 | Scoping | Per-method isolation | Variables from method A not visible in method B |
| 19 | Cap: steps | 50K step limit | Partial log returned, no throw |
| 20 | Cap: loop | 10K iteration limit | Clamped, no throw |
| 21 | Cap: depth | 100 nesting limit | Logged as skipped |
| 22 | Cap: variables | 1K per scope | Logged as skipped |
| 23 | Integration | Real .a3p | Parse + execute against actual project file |

### Example Test

```typescript
import { describe, it, expect } from "vitest";
import { executeProject } from "../src/tweedle-vm.js";
import type { AliceProject } from "../src/a3p-parser.js";

describe("tweedle-vm", () => {
  it("executes a CountLoop 3 times", () => {
    const project: AliceProject = {
      version: "3.10",
      projectName: "Test",
      sceneObjects: [],
      methods: [
        {
          name: "loopMethod",
          isFunction: false,
          returnType: "void",
          parameters: [],
          statements: [
            {
              kind: "CountLoop",
              count: 3,
              body: [
                { kind: "MethodCall", object: "this", method: "say", arguments: [] },
              ],
            },
          ],
        },
      ],
    };

    const result = executeProject(project);

    // 1 loop header + 3 body executions = 4 log entries
    expect(result.execution_log).toHaveLength(4);
    expect(result.execution_log[0]).toEqual({
      step: 1,
      kind: "CountLoop",
      detail: "repeat 3 times (3 body statements)",
    });
    // Steps 2, 3, 4 are the say() calls
    expect(result.execution_log.filter(e => e.kind === "MethodCall")).toHaveLength(3);
  });

  it("ReturnStatement halts method execution", () => {
    const project: AliceProject = {
      version: "3.10",
      projectName: "Test",
      sceneObjects: [],
      methods: [
        {
          name: "earlyReturn",
          isFunction: true,
          returnType: "Number",
          parameters: [],
          statements: [
            { kind: "VariableDeclaration", name: "x", varType: "Number", value: "42" },
            { kind: "ReturnStatement", expression: "x" },
            { kind: "MethodCall", object: "this", method: "say", arguments: [] },
          ],
        },
      ],
    };

    const result = executeProject(project);

    // Only 2 entries: declare + return. The say() is never reached.
    expect(result.execution_log).toHaveLength(2);
    expect(result.execution_log[1].kind).toBe("ReturnStatement");
    expect(result.returnValues.get("earlyReturn")).toBe("x");
  });

  it("IfElse with variable lookup defaults unknown to true", () => {
    const project: AliceProject = {
      version: "3.10",
      projectName: "Test",
      sceneObjects: [],
      methods: [
        {
          name: "condMethod",
          isFunction: false,
          returnType: "void",
          parameters: [],
          statements: [
            {
              kind: "IfElse",
              condition: "unknownThing",
              ifBody: [
                { kind: "MethodCall", object: "this", method: "move", arguments: [] },
              ],
              elseBody: [
                { kind: "MethodCall", object: "this", method: "turn", arguments: [] },
              ],
            },
          ],
        },
      ],
    };

    const result = executeProject(project);

    // Unknown condition defaults to true → ifBody runs
    expect(result.execution_log).toHaveLength(2); // if header + move
    expect(result.execution_log[1].detail).toContain("move");
  });
});
```

## Known Limitations

1. **Parser emits `object: "this"` for all MethodCall statements.** The `.a3p`
   parser hardcodes `object: "this"` because the Tweedle AST refers to the
   declaring class, not the scene object. The VM logs these as `"this.method()"`
   in the execution log. Test data uses named objects like `"bunny"` for clarity.

2. **Argument parsing is not wired.** The parser emits `arguments: []` for all
   statements. The `move` handler unconditionally applies `z+1` regardless of
   arguments. Direction/distance arguments will be added in a future pass when
   argument expression parsing is implemented.

3. **Event listeners are never dispatched.** The VM registers event listeners
   internally and logs them, but no events are ever fired during a run. This
   matches the design spec: "registered but not dispatched during VM run."

4. **CountLoop/IfElse/VariableDeclaration may have stub values.** The parser
   returns `count: 1`, `condition: "unknown"`, `name: "unknown"` for statements
   where full AST extraction is not yet implemented. The VM defaults gracefully
   (executes once, defaults condition to true, uses "unknown" as the variable
   name).

5. **`statement-executor.ts` is retained but unused.** The legacy executor
   remains in the source tree for reference. All live code paths
   (`server.ts`, `run-world.ts`) import from `tweedle-vm.ts`.

## Backward Compatibility

The response from `POST /api/world/run` is **additive only**:

- All existing fields (`schema_version`, `status`, `project_name`,
  `scene_object_count`, `procedure_count`, `run_duration_ms`,
  `evidenceArtifact`) remain unchanged in name, type, and semantics.
- `statements_executed` continues to report total dispatched statements.
- `execution_log` replaces `event_log` with a cleaner `{step, kind, detail}`
  shape. The field name change is intentional — the new structured log
  replaces the old unstructured event log.
- `doesNotClaim` no longer includes `"full Tweedle VM execution"` since
  the VM now provides statement-level execution.
- If no `.a3p` project was loaded (e.g., launched without `--project`),
  `statements_executed` is `0` and `execution_log` is `[]`.
