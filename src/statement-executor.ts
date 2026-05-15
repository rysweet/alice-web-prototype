import type { AliceObject, AliceStatement } from "./a3p-parser.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ExecutionObject {
  name: string;
  className: string;
  position: Vec3;
}

export interface EventLogEntry {
  action: string;
  name?: string;
  object?: string;
  method?: string;
  detail?: string;
  event?: string;
}

export interface ExecutionState {
  objects: Map<string, ExecutionObject>;
  eventLog: EventLogEntry[];
  statementsExecuted: number;
  depth: number;
}

export interface ExecutionResult {
  statementsExecuted: number;
  eventLog: EventLogEntry[];
  objects: Map<string, ExecutionObject>;
}

// ── Security caps ──────────────────────────────────────────────────────

const MAX_TOTAL_STATEMENTS = 50_000;
const MAX_LOOP_ITERATIONS = 10_000;
const MAX_DEPTH = 100;

// ── Public API ─────────────────────────────────────────────────────────

/** Seed execution state from parsed scene objects. */
export function createExecutionState(sceneObjects: AliceObject[]): ExecutionState {
  const objects = new Map<string, ExecutionObject>();
  for (const obj of sceneObjects) {
    objects.set(obj.name, {
      name: obj.name,
      className: obj.typeName,
      position: obj.position
        ? { x: obj.position.x, y: obj.position.y, z: obj.position.z }
        : { x: 0, y: 0, z: 0 },
    });
  }
  return { objects, eventLog: [], statementsExecuted: 0, depth: 0 };
}

/** Execute a list of statements against mutable state; return result snapshot. */
export function executeStatements(
  stmts: AliceStatement[],
  state: ExecutionState,
): ExecutionResult {
  for (const stmt of stmts) {
    if (state.statementsExecuted >= MAX_TOTAL_STATEMENTS) break;
    executeOne(stmt, state);
  }
  return {
    statementsExecuted: state.statementsExecuted,
    eventLog: state.eventLog,
    objects: state.objects,
  };
}

// ── Dispatch ───────────────────────────────────────────────────────────

function executeOne(stmt: AliceStatement, state: ExecutionState): void {
  if (state.statementsExecuted >= MAX_TOTAL_STATEMENTS) return;

  if (state.depth >= MAX_DEPTH) {
    state.statementsExecuted++;
    state.eventLog.push({
      action: "skipped",
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
    case "EventListener":
      execEventListener(stmt, state);
      break;
    case "ReturnStatement":
      execReturn(stmt, state);
      break;
    case "Comment":
      state.statementsExecuted++;
      break;
    case "VariableDeclaration":
      execVariableDeclaration(stmt, state);
      break;
    default:
      state.statementsExecuted++;
      state.eventLog.push({
        action: "skipped",
        detail: `Unknown kind: ${stmt.kind}`,
      });
      break;
  }
}

// ── Statement executors ────────────────────────────────────────────────

function execMethodCall(stmt: AliceStatement, state: ExecutionState): void {
  state.statementsExecuted++;
  const objectName = stmt.object ?? "this";
  const method = stmt.method ?? "unknown";
  const obj = state.objects.get(objectName);

  switch (method) {
    case "move":
      if (obj) {
        obj.position.z += 1;
      }
      state.eventLog.push({
        action: "move",
        object: objectName,
        detail: obj
          ? `z+1 → {x:${obj.position.x},y:${obj.position.y},z:${obj.position.z}}`
          : `object "${objectName}" not found`,
      });
      break;

    case "turn":
      state.eventLog.push({ action: "turn", object: objectName });
      break;

    case "say":
      state.eventLog.push({ action: "say", object: objectName });
      break;

    case "roll":
      state.eventLog.push({ action: "roll", object: objectName });
      break;

    default:
      state.eventLog.push({
        action: "call",
        object: objectName,
        method,
      });
      break;
  }
}

function execCountLoop(stmt: AliceStatement, state: ExecutionState): void {
  state.statementsExecuted++;
  const count = Math.min(Math.max(stmt.count ?? 0, 0), MAX_LOOP_ITERATIONS);
  const body = stmt.body ?? [];

  state.depth++;
  for (let i = 0; i < count; i++) {
    if (state.statementsExecuted >= MAX_TOTAL_STATEMENTS) break;
    for (const child of body) {
      if (state.statementsExecuted >= MAX_TOTAL_STATEMENTS) break;
      executeOne(child, state);
    }
  }
  state.depth--;
}

function execIfElse(stmt: AliceStatement, state: ExecutionState): void {
  state.statementsExecuted++;
  const conditionIsTrue = stmt.condition === "true";
  const branch = conditionIsTrue ? (stmt.ifBody ?? []) : (stmt.elseBody ?? []);

  state.depth++;
  for (const child of branch) {
    if (state.statementsExecuted >= MAX_TOTAL_STATEMENTS) break;
    executeOne(child, state);
  }
  state.depth--;
}

function execEventListener(stmt: AliceStatement, state: ExecutionState): void {
  state.statementsExecuted++;
  state.eventLog.push({
    action: "registerEvent",
    event: stmt.event ?? "unknown",
  });
}

function execReturn(stmt: AliceStatement, state: ExecutionState): void {
  state.statementsExecuted++;
  state.eventLog.push({
    action: "return",
    detail: stmt.expression ?? "undefined",
  });
}

function execVariableDeclaration(stmt: AliceStatement, state: ExecutionState): void {
  state.statementsExecuted++;
  state.eventLog.push({
    action: "declare",
    name: stmt.name ?? "unknown",
    detail: `${stmt.varType ?? "Object"} = ${stmt.value ?? ""}`,
  });
}
