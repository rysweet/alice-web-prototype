import type { AliceProject, AliceStatement } from "./a3p-parser.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface LogEntry {
  step: number;
  kind: string;
  detail: string;
}

export interface ExecutionResult {
  execution_log: LogEntry[];
  returnValues: Map<string, unknown>;
}

// ── Safety caps ────────────────────────────────────────────────────────

const MAX_TOTAL_STEPS = 50_000;
const MAX_LOOP_ITERATIONS = 10_000;
const MAX_DEPTH = 100;
const MAX_VARIABLES_PER_SCOPE = 1_000;

// ── Internal state ─────────────────────────────────────────────────────

interface VMState {
  stepCounter: number;
  depth: number;
  log: LogEntry[];
  returned: boolean;
  returnValue: unknown;
  variables: Map<string, string>;
}

// ── Public API ─────────────────────────────────────────────────────────

/** Execute all methods in an AliceProject, returning a structured execution log. */
export function executeProject(project: AliceProject): ExecutionResult {
  const returnValues = new Map<string, unknown>();
  const log: LogEntry[] = [];
  let stepCounter = 0;

  for (const method of project.methods) {
    const state: VMState = {
      stepCounter,
      depth: 0,
      log,
      returned: false,
      returnValue: undefined,
      variables: new Map(),
    };

    runStatements(method.statements, state);
    stepCounter = state.stepCounter;

    if (state.returned && state.returnValue !== undefined) {
      returnValues.set(method.name, state.returnValue);
    }
  }

  return { execution_log: log, returnValues };
}

// ── Statement execution ────────────────────────────────────────────────

function runStatements(stmts: AliceStatement[], state: VMState): void {
  for (const stmt of stmts) {
    if (state.returned) break;
    if (state.stepCounter >= MAX_TOTAL_STEPS) break;
    executeOne(stmt, state);
  }
}

function executeOne(stmt: AliceStatement, state: VMState): void {
  if (state.returned) return;
  if (state.stepCounter >= MAX_TOTAL_STEPS) return;

  if (state.depth >= MAX_DEPTH) {
    state.stepCounter++;
    state.log.push({
      step: state.stepCounter,
      kind: "skipped",
      detail: `Depth cap exceeded (${MAX_DEPTH}) for ${stmt.kind}`,
    });
    return;
  }

  switch (stmt.kind) {
    case "MethodCall":
      execMethodCall(stmt, state);
      break;
    case "CountLoop":
      execCountLoop(stmt, state);
      break;
    case "IfElse":
      execIfElse(stmt, state);
      break;
    case "ReturnStatement":
      execReturn(stmt, state);
      break;
    case "VariableDeclaration":
      execVariableDeclaration(stmt, state);
      break;
    case "EventListener":
      execEventListener(stmt, state);
      break;
    case "Comment":
      // Comments produce no log entries — intentionally skipped
      break;
    default:
      state.stepCounter++;
      state.log.push({
        step: state.stepCounter,
        kind: "skipped",
        detail: `Unknown statement kind: ${stmt.kind}`,
      });
      break;
  }
}

// ── Statement handlers ─────────────────────────────────────────────────

function execMethodCall(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const objectName = stmt.object ?? "this";
  const method = stmt.method ?? "unknown";
  const args = stmt.arguments ?? [];
  const argsStr = args.length > 0 ? `(${args.join(", ")})` : "()";

  state.log.push({
    step: state.stepCounter,
    kind: "MethodCall",
    detail: `${objectName}.${method}${argsStr}`,
  });
}

function execCountLoop(stmt: AliceStatement, state: VMState): void {
  const count = Math.min(Math.max(stmt.count ?? 0, 0), MAX_LOOP_ITERATIONS);
  const body = stmt.body ?? [];

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "CountLoop",
    detail: `repeat ${count} times`,
  });

  if (count === 0 || body.length === 0) return;

  state.depth++;
  for (let i = 0; i < count; i++) {
    if (state.returned) break;
    if (state.stepCounter >= MAX_TOTAL_STEPS) break;
    runStatements(body, state);
  }
  state.depth--;
}

function execIfElse(stmt: AliceStatement, state: VMState): void {
  const conditionRaw = stmt.condition ?? "unknown";
  const conditionValue = evaluateCondition(conditionRaw, state);

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "IfElse",
    detail: `condition "${conditionRaw}" → ${conditionValue}`,
  });

  const branch = conditionValue
    ? (stmt.ifBody ?? [])
    : (stmt.elseBody ?? []);

  if (branch.length === 0) return;

  state.depth++;
  runStatements(branch, state);
  state.depth--;
}

function evaluateCondition(condition: string, state: VMState): boolean {
  if (condition === "true") return true;
  if (condition === "false") return false;

  // Variable lookup
  if (state.variables.has(condition)) {
    const val = state.variables.get(condition)!;
    if (val === "true") return true;
    if (val === "false") return false;
  }

  // Unknown conditions default to true (per spec)
  return true;
}

function execReturn(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const expr = stmt.expression ?? "undefined";

  state.log.push({
    step: state.stepCounter,
    kind: "ReturnStatement",
    detail: `return ${expr}`,
  });

  state.returned = true;
  state.returnValue = expr;
}

function execVariableDeclaration(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const name = stmt.name ?? "unknown";
  const varType = stmt.varType ?? "Object";
  const value = stmt.value ?? "";

  state.log.push({
    step: state.stepCounter,
    kind: "VariableDeclaration",
    detail: `${name}: ${varType} = ${value}`,
  });

  // Allow re-assignment of existing names; cap new variables per scope
  if (state.variables.has(name) || state.variables.size < MAX_VARIABLES_PER_SCOPE) {
    state.variables.set(name, value);
  }
}

function execEventListener(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const event = stmt.event ?? "unknown";

  state.log.push({
    step: state.stepCounter,
    kind: "EventListener",
    detail: `register "${event}"`,
  });
  // Registered but not dispatched during VM run (per spec)
}
