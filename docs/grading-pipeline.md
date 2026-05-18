# Grading Pipeline

The grading pipeline (`src/grading-pipeline.ts`) evaluates student Alice3
projects against lesson-specific criteria, producing structured pass/fail
results with per-criterion feedback. It matches the grading behavior of the
eatme Rust grading harness for all eight lessons in the Alice curriculum.

## Overview

Each lesson defines a set of criteria that are checked against a `GradeInput` —
a snapshot of the project's scene state, execution log, event registrations,
and declared methods. The pipeline returns a `GradeResult` with an overall
pass/fail, a normalized score, and per-criterion details.

| Lesson | Title | Key Criteria |
|---|---|---|
| 1 | Scene Setup | ≥1 entity added to scene |
| 2 | Movement | move or turn statements in execution log |
| 3 | Event Handling | ≥1 event listener registered |
| 4 | Loops | CountLoop in execution log |
| 5 | Conditionals | IfElse in execution log |
| 6 | Functions | Custom MethodCall beyond built-ins |
| 7 | Scene Transitions | ≥2 methods defined |
| 8 | Final Project | Composite: ≥3 entities + loop + conditional + custom method |

## Quick Start

```typescript
import { gradeLesson } from "./grading-pipeline";
import type { GradeInput, GradeResult } from "./grading-pipeline";

const input: GradeInput = {
  scene: myScene,                    // Scene instance with entities
  executionLog: runWorldResult.log,  // Array of { step, kind, detail }
  eventRegistrations: registrations, // Array of { eventType, handlerName }
  declaredMethods: ["myFirstMethod", "doBunnyDance"],
};

const result: GradeResult = gradeLesson(3, input);

console.log(result.passed);   // true
console.log(result.score);    // 1.0
console.log(result.criteria); // [{ name: "event-listener", passed: true, message: "..." }]
```

## API Reference

### `gradeLesson(lesson: number, input: GradeInput): GradeResult`

Grades a project against the criteria for the specified lesson (1–8).

**Parameters:**

| Name | Type | Description |
|---|---|---|
| `lesson` | `number` | Lesson number (1–8) |
| `input` | `GradeInput` | Project state snapshot |

**Returns:** `GradeResult`

**Throws:** `TypeError` if `lesson` is not an integer 1–8.

### Types

#### `GradeInput`

```typescript
interface GradeInput {
  /** Scene instance containing entities. */
  readonly scene: Scene;

  /** Execution log entries from POST /api/world/run. */
  readonly executionLog: ReadonlyArray<ExecutionLogEntry>;

  /** Event registrations from POST /api/events/register. */
  readonly eventRegistrations: ReadonlyArray<EventRegistration>;

  /** Names of all declared methods (including built-ins). */
  readonly declaredMethods: ReadonlyArray<string>;
}
```

#### `ExecutionLogEntry`

```typescript
interface ExecutionLogEntry {
  readonly step: number;
  readonly kind: string;
  readonly detail: string;
}
```

#### `EventRegistration`

```typescript
interface EventRegistration {
  readonly eventType: string;
  readonly handlerName: string;
}
```

#### `GradeResult`

```typescript
interface GradeResult {
  /** Lesson number that was graded. */
  readonly lesson: number;

  /** True if ALL criteria passed. */
  readonly passed: boolean;

  /** Per-criterion results. */
  readonly criteria: ReadonlyArray<CriterionResult>;

  /** Normalized score: passed criteria / total criteria (0.0–1.0). */
  readonly score: number;
}
```

#### `CriterionResult`

```typescript
interface CriterionResult {
  /** Machine-readable criterion identifier. */
  readonly name: string;

  /** Whether this criterion passed. */
  readonly passed: boolean;

  /** Human-readable explanation. */
  readonly message: string;
}
```

## Lesson Criteria Details

### Lesson 1: Scene Setup

Tests that the student has added at least one entity to the scene.

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `entity-added` | `scene.entities.size >= 1` (excluding entries where entity `instanceof SGround \|\| instanceof SScene \|\| instanceof SCamera`) | "Scene contains N entity(ies)" | "No entities added to scene" |

```typescript
const result = gradeLesson(1, {
  scene: sceneWithBunny,
  executionLog: [],
  eventRegistrations: [],
  declaredMethods: [],
});
// result.passed === true
// result.criteria[0].name === "entity-added"
```

### Lesson 2: Movement

Tests that the execution log contains at least one `move` or `turn` statement.

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `movement-statement` | Any log entry with `kind === "MethodCall"` and `detail` matching `move` or `turn` | "Found movement statement: ..." | "No move or turn statements in execution log" |

```typescript
const result = gradeLesson(2, {
  scene: myScene,
  executionLog: [
    { step: 1, kind: "MethodCall", detail: "this.move(FORWARD, 1.0)" },
  ],
  eventRegistrations: [],
  declaredMethods: [],
});
// result.passed === true
```

### Lesson 3: Event Handling

Tests that at least one event listener has been registered.

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `event-listener` | `eventRegistrations.length >= 1` | "N event listener(s) registered" | "No event listeners registered" |

### Lesson 4: Loops

Tests that the execution log contains a `CountLoop` entry.

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `count-loop` | Any log entry with `kind === "CountLoop"` | "Found CountLoop: ..." | "No CountLoop in execution log" |

### Lesson 5: Conditionals

Tests that the execution log contains an `IfElse` entry.

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `if-else` | Any log entry with `kind === "IfElse"` | "Found IfElse: ..." | "No IfElse in execution log" |

### Lesson 6: Functions

Tests that the execution log contains a custom `MethodCall` (one that is not a
built-in). Built-in method names are:

```
move, turn, roll, say, think, resize, setOpacity, setColor, delay,
myFirstMethod, run
```

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `custom-method` | Any `MethodCall` log entry whose `detail` does not match a built-in name | "Found custom method call: ..." | "No custom method calls found (only built-ins)" |

```typescript
const result = gradeLesson(6, {
  scene: myScene,
  executionLog: [
    { step: 1, kind: "MethodCall", detail: "this.doBunnyDance()" },
    { step: 2, kind: "MethodCall", detail: "this.move(FORWARD, 1.0)" },
  ],
  eventRegistrations: [],
  declaredMethods: ["myFirstMethod", "doBunnyDance"],
});
// result.passed === true — "doBunnyDance" is not a built-in
```

### Lesson 7: Scene Transitions

Tests that at least two methods are defined, indicating the student has
structured their program into multiple procedures.

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `multiple-methods` | `declaredMethods.length >= 2` | "N methods declared" | "Only N method(s) declared; need ≥2" |

### Lesson 8: Final Project

Composite lesson that checks four criteria simultaneously:

| Criterion | Condition | Pass Message | Fail Message |
|---|---|---|---|
| `entities-3plus` | Filtered `scene.entities.size >= 3` (same filter as L1: excludes `SGround`, `SScene`, `SCamera` via `instanceof`) | "Scene contains N entities" | "Only N entity(ies); need ≥3" |
| `has-loop` | Any `CountLoop` in execution log | "Contains loop" | "No loops found" |
| `has-conditional` | Any `IfElse` in execution log | "Contains conditional" | "No conditionals found" |
| `has-custom-method` | Any custom (non-built-in) `MethodCall` | "Contains custom method" | "No custom methods found" |

All four criteria must pass for lesson 8 to pass. The `score` reflects the
fraction that passed (e.g., 3/4 = 0.75).

```typescript
const result = gradeLesson(8, {
  scene: richScene,        // ≥3 entities
  executionLog: [
    { step: 1, kind: "CountLoop", detail: "repeat 3 times" },
    { step: 2, kind: "IfElse", detail: "condition 'x > 0' → ifBody" },
    { step: 3, kind: "MethodCall", detail: "this.celebrate()" },
  ],
  eventRegistrations: [],
  declaredMethods: ["myFirstMethod", "celebrate"],
});
// result.passed === true
// result.score === 1.0
// result.criteria.length === 4
```

## Scoring

The `score` field is a normalized value from `0.0` to `1.0`:

```
score = (number of passed criteria) / (total criteria for the lesson)
```

- Lessons 1–7 each have 1 criterion → score is `0.0` or `1.0`
- Lesson 8 has 4 criteria → score can be `0.0`, `0.25`, `0.5`, `0.75`, or `1.0`

The `passed` field is `true` only when `score === 1.0`.

## Integration with Server API

The grading pipeline consumes data from existing API endpoints:

| GradeInput Field | Source API | Notes |
|---|---|---|
| `scene` | `POST /api/scene/add-object` | Build a `Scene` from the server's entity list |
| `executionLog` | `POST /api/world/run` | `response.execution_log` array |
| `eventRegistrations` | `POST /api/events/register` | Accumulate from register responses |
| `declaredMethods` | `POST /api/world/run` or Tweedle AST | Method names from parsed project |

Example integration flow:

```typescript
import { Scene } from "./story-api/scene";
import { gradeLesson } from "./grading-pipeline";

// After running the project through the API...
const scene = Scene.fromProject(parsedProject);
const runResult = await fetch("/api/world/run", { method: "POST" });
const { execution_log } = await runResult.json();

const grade = gradeLesson(4, {
  scene,
  executionLog: execution_log,
  eventRegistrations: collectedRegistrations,
  declaredMethods: extractedMethodNames,
});

if (grade.passed) {
  console.log("Lesson 4 complete!");
} else {
  for (const c of grade.criteria) {
    if (!c.passed) console.log(`Missing: ${c.message}`);
  }
}
```

## Eatme Parity

The grading criteria are designed to match the Rust eatme grading harness:

| Eatme Assertion | Pipeline Criterion |
|---|---|
| `process_started` | (server health check — outside grading) |
| `scene_object_added` | L1: `entity-added` |
| `code_editor_action` | L2: `movement-statement` |
| `event_registered` | L3: `event-listener` |
| `loop_executed` | L4: `count-loop` |
| `conditional_executed` | L5: `if-else` |
| `custom_method_called` | L6: `custom-method` |
| `multiple_procedures` | L7: `multiple-methods` |
| `final_composite` | L8: all four sub-criteria |

The pipeline produces the same pass/fail outcomes as the Rust harness when
given equivalent project states.
