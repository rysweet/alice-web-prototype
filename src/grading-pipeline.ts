import { Scene } from "./story-api/scene";
import { SGround, SScene, SCamera } from "./story-api/entities";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExecutionLogEntry {
  readonly step: number;
  readonly kind: string;
  readonly detail: string;
}

export interface EventRegistration {
  readonly eventType: string;
  readonly handlerName: string;
}

export interface GradeInput {
  readonly scene: Scene;
  readonly executionLog: readonly ExecutionLogEntry[];
  readonly eventRegistrations: readonly EventRegistration[];
  readonly declaredMethods: readonly string[];
}

export interface CriterionResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface GradeResult {
  readonly lesson: number;
  readonly passed: boolean;
  readonly criteria: readonly CriterionResult[];
  readonly score: number;
}

// ---------------------------------------------------------------------------
// Built-in method allowlist for L6 / L8
// ---------------------------------------------------------------------------

const BUILTIN_METHODS: ReadonlySet<string> = new Set([
  "move",
  "turn",
  "roll",
  "say",
  "think",
  "resize",
  "setOpacity",
  "setColor",
  "delay",
  "myFirstMethod",
  "run",
  "setVehicle",
]);

// ---------------------------------------------------------------------------
// Pre-compiled patterns
// ---------------------------------------------------------------------------

const RE_METHOD_NAME = /this\.(\w+)\(/;
const RE_MOVEMENT = /\b(?:move|turn)\b/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count scene entities excluding default scene objects. */
function countNonDefaultEntities(scene: Scene): number {
  let count = 0;
  for (const [, entity] of scene.entities) {
    if (
      entity instanceof SGround ||
      entity instanceof SScene ||
      entity instanceof SCamera
    ) {
      continue;
    }
    count++;
  }
  return count;
}

/** Extract method name from a detail string like "this.methodName(args)". */
function extractMethodName(detail: string): string | null {
  const match = RE_METHOD_NAME.exec(detail);
  return match ? match[1] : null;
}

/** True if the execution log contains a MethodCall to a non-built-in method. */
function hasCustomMethodCall(log: readonly ExecutionLogEntry[]): boolean {
  for (const entry of log) {
    if (entry.kind !== "MethodCall") continue;
    const name = extractMethodName(entry.detail);
    if (name !== null && !BUILTIN_METHODS.has(name)) return true;
  }
  return false;
}

/** True if the log contains at least one entry with the given kind. */
function hasLogKind(log: readonly ExecutionLogEntry[], kind: string): boolean {
  return log.some((e) => e.kind === kind);
}

/** True if the log contains a MethodCall whose detail includes move or turn. */
function hasMovementStatement(log: readonly ExecutionLogEntry[]): boolean {
  return log.some(
    (e) => e.kind === "MethodCall" && RE_MOVEMENT.test(e.detail),
  );
}

function buildResult(
  lesson: number,
  criteria: CriterionResult[],
): GradeResult {
  const passed = criteria.every((c) => c.passed);
  let passedCount = 0;
  for (const c of criteria) if (c.passed) passedCount++;
  const score = criteria.length > 0 ? passedCount / criteria.length : 0;
  return { lesson, passed, criteria, score };
}

// ---------------------------------------------------------------------------
// Per-lesson grading
// ---------------------------------------------------------------------------

function gradeL1(input: GradeInput): CriterionResult[] {
  const count = countNonDefaultEntities(input.scene);
  return [
    {
      name: "entity-added",
      passed: count >= 1,
      message:
        count >= 1
          ? `${count} non-default entity(s) found`
          : "no non-default entities found in scene",
    },
  ];
}

function gradeL2(input: GradeInput): CriterionResult[] {
  const found = hasMovementStatement(input.executionLog);
  return [
    {
      name: "movement-statement",
      passed: found,
      message: found
        ? "move/turn statement found in execution log"
        : "no move or turn statement found",
    },
  ];
}

function gradeL3(input: GradeInput): CriterionResult[] {
  const count = input.eventRegistrations.length;
  return [
    {
      name: "event-listener",
      passed: count >= 1,
      message:
        count >= 1
          ? `${count} event listener(s) registered`
          : "no event listeners registered",
    },
  ];
}

function gradeL4(input: GradeInput): CriterionResult[] {
  const found = hasLogKind(input.executionLog, "CountLoop");
  return [
    {
      name: "count-loop",
      passed: found,
      message: found
        ? "CountLoop found in execution log"
        : "no CountLoop found in execution log",
    },
  ];
}

function gradeL5(input: GradeInput): CriterionResult[] {
  const found = hasLogKind(input.executionLog, "IfElse");
  return [
    {
      name: "if-else",
      passed: found,
      message: found
        ? "IfElse found in execution log"
        : "no IfElse found in execution log",
    },
  ];
}

function gradeL6(input: GradeInput): CriterionResult[] {
  const found = hasCustomMethodCall(input.executionLog);
  return [
    {
      name: "custom-method",
      passed: found,
      message: found
        ? "custom method call found beyond built-ins"
        : "no custom method calls found (only built-ins)",
    },
  ];
}

function gradeL7(input: GradeInput): CriterionResult[] {
  const count = input.declaredMethods.length;
  return [
    {
      name: "multiple-methods",
      passed: count >= 2,
      message:
        count >= 2
          ? `${count} methods declared`
          : `only ${count} method(s) declared (need ≥2)`,
    },
  ];
}

function gradeL8(input: GradeInput): CriterionResult[] {
  const entityCount = countNonDefaultEntities(input.scene);

  // Single-pass scan of execution log for all three criteria
  let hasLoop = false;
  let hasConditional = false;
  let hasCustom = false;
  for (const entry of input.executionLog) {
    if (entry.kind === "CountLoop") hasLoop = true;
    else if (entry.kind === "IfElse") hasConditional = true;
    else if (entry.kind === "MethodCall") {
      const name = extractMethodName(entry.detail);
      if (name !== null && !BUILTIN_METHODS.has(name)) hasCustom = true;
    }
    if (hasLoop && hasConditional && hasCustom) break;
  }

  return [
    {
      name: "entities-3plus",
      passed: entityCount >= 3,
      message:
        entityCount >= 3
          ? `${entityCount} non-default entities found`
          : `only ${entityCount} non-default entity(s) (need ≥3)`,
    },
    {
      name: "has-loop",
      passed: hasLoop,
      message: hasLoop
        ? "CountLoop found"
        : "no CountLoop found in execution log",
    },
    {
      name: "has-conditional",
      passed: hasConditional,
      message: hasConditional
        ? "IfElse found"
        : "no IfElse found in execution log",
    },
    {
      name: "has-custom-method",
      passed: hasCustom,
      message: hasCustom
        ? "custom method call found"
        : "no custom method calls found",
    },
  ];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const GRADERS: Record<number, (input: GradeInput) => CriterionResult[]> = {
  1: gradeL1,
  2: gradeL2,
  3: gradeL3,
  4: gradeL4,
  5: gradeL5,
  6: gradeL6,
  7: gradeL7,
  8: gradeL8,
};

/** Grade a student's work for the specified lesson (1–8). */
export function gradeLesson(lesson: number, input: GradeInput): GradeResult {
  if (!Number.isInteger(lesson) || lesson < 1 || lesson > 8) {
    throw new TypeError("lesson must be an integer between 1 and 8");
  }
  const criteria = GRADERS[lesson](input);
  return buildResult(lesson, criteria);
}
