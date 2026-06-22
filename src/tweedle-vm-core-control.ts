import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceObject,
  AliceProject,
  AliceStatement,
} from "./a3p-parser.js";
import { runScopedStatements, runStatements } from "./tweedle-vm-core-setup.js";
import { DoTogetherEvidence, MAX_LOOP_ITERATIONS, MAX_TOTAL_STEPS, VMException, VMState } from "./tweedle-vm-core-types.js";
import { evaluateValue, numericValue, valueToString } from "./tweedle-vm-eval-core.js";
import { AliceWorkflowStateError, resolveScorekeeperSourceName } from "./alice-workflow-state.js";
import { cloneObjectMap, cloneScopes, mergeStateFromBranch } from "./tweedle-vm-stack-debug.js";
import { popScope, pushScope, scopeAssign, scopeLookup, scopeSet } from "./tweedle-vm-stack-scope.js";

export function execDoInOrder(stmt: AliceStatement, state: VMState): void {
  const body = stmt.body ?? [];

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "DoInOrder",
    detail: `run ${body.length} statements in order`,
  });

  const queue = state.sceneBridge?.animationQueue;
  queue?.beginSequentialBlock();
  try {
    runScopedStatements(body, state);
  } finally {
    queue?.endSequentialBlock();
  }
}

export function execDoTogether(stmt: AliceStatement, state: VMState): void {
  const body = stmt.body ?? [];

  state.stepCounter++;
  const groupId = `do-together-${state.stepCounter}`;
  const windowId = `${groupId}-window`;
  const activeWindowStartedAtStep = state.stepCounter + 1;
  const evidence: DoTogetherEvidence = {
    kind: "DoTogether",
    groupId,
    windowId,
    actionCount: body.length,
    activeWindow: {
      startedAtStep: activeWindowStartedAtStep,
      completedAtStep: activeWindowStartedAtStep,
    },
    actions: body.map((branchStatement, branchIndex) => ({
      actionId: `${groupId}-action-${branchIndex}`,
      branchIndex,
      statementKind: branchStatement.kind,
      groupId,
      windowId,
      startedAtStep: activeWindowStartedAtStep,
      completedAtStep: activeWindowStartedAtStep,
    })),
  };
  state.log.push({
    step: state.stepCounter,
    kind: "DoTogether",
    detail: `run ${body.length} statements together`,
    doTogetherEvidence: evidence,
  });

  if (body.length === 0) {
    evidence.activeWindow.completedAtStep = state.stepCounter;
    return;
  }

  const scopeSnapshot = cloneScopes(state.scopes);
  const objectSnapshot = cloneObjectMap(state.objectMap);
  const branchStates: VMState[] = [];

  for (let branchIndex = 0; branchIndex < body.length; branchIndex++) {
    const branchStatement = body[branchIndex];
    const branchObjectMap = cloneObjectMap(objectSnapshot);
    const branchState: VMState = {
      stepCounter: state.stepCounter,
      depth: state.depth,
      log: state.log,
      returned: false,
      returnValue: undefined,
      scopes: cloneScopes(scopeSnapshot),
      runtime: state.runtime,
      methodMap: state.methodMap,
      typeMap: state.typeMap,
      objectMap: branchObjectMap,
      currentSelf: state.currentSelf ? (branchObjectMap.get(state.currentSelf.name) ?? null) : null,
      returnValues: state.returnValues,
      listenerMap: state.listenerMap,
      sceneBridge: state.sceneBridge,
      aliceWorkflowRuntime: state.aliceWorkflowRuntime,
      debugRuntime: state.debugRuntime,
    };
    runScopedStatements([branchStatement], branchState);
    evidence.actions[branchIndex].completedAtStep = Math.max(branchState.stepCounter, evidence.actions[branchIndex].startedAtStep);
    evidence.activeWindow.completedAtStep = Math.max(evidence.activeWindow.completedAtStep, evidence.actions[branchIndex].completedAtStep);
    branchStates.push(branchState);
    state.stepCounter = Math.max(state.stepCounter, branchState.stepCounter);
  }

  for (const branchState of branchStates) {
    mergeStateFromBranch(state, scopeSnapshot, objectSnapshot, branchState);
    if (branchState.returned && !state.returned) {
      state.returned = true;
      state.returnValue = branchState.returnValue;
    }
  }
}

export function execCountLoop(stmt: AliceStatement, state: VMState): void {
  const count = Math.min(Math.max(stmt.count ?? 0, 0), MAX_LOOP_ITERATIONS);
  const body = stmt.body ?? [];

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "CountLoop",
    detail: `repeat ${count} times`,
  });

  if (count === 0 || body.length === 0) return;

  pushScope(state);
  state.depth++;
  for (let i = 0; i < count; i++) {
    if (state.returned) break;
    if (state.stepCounter >= MAX_TOTAL_STEPS) break;
    runStatements(body, state);
  }
  state.depth--;
  popScope(state);
}

export function execCountUpTo(stmt: AliceStatement, state: VMState): void {
  const condition = stmt.countExpression ?? stmt.condition ?? "0";
  const body = stmt.body ?? [];
  const match = condition.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*<\s*(.+)$/);

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "CountUpTo",
    detail: `countUpTo (${condition})`,
  });

  if (body.length === 0) {
    return;
  }

  if (!match) {
    const count = Math.min(Math.max(numericValue(evaluateValue(state, condition)), 0), MAX_LOOP_ITERATIONS);
    for (let i = 0; i < count; i++) {
      if (state.returned || state.stepCounter >= MAX_TOTAL_STEPS) {
        break;
      }
      runScopedStatements(body, state);
    }
    return;
  }

  const [, counterName] = match;
  const startValue = scopeLookup(state, counterName);
  if (startValue === undefined) {
    scopeSet(state, counterName, 0);
  }

  let iterations = 0;
  while (iterations < MAX_LOOP_ITERATIONS && evaluateCondition(condition, state)) {
    runScopedStatements(body, state);
    if (state.returned || state.stepCounter >= MAX_TOTAL_STEPS) {
      break;
    }
    const nextValue = numericValue(evaluateValue(state, counterName)) + 1;
    scopeAssign(state, counterName, String(nextValue));
    iterations += 1;
  }
}

export function execWhileLoop(stmt: AliceStatement, state: VMState): void {
  const condition = stmt.condition ?? "false";
  const body = stmt.body ?? [];

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "WhileLoop",
    detail: `while (${condition})`,
  });

  let iterations = 0;
  while (body.length > 0 && iterations < MAX_LOOP_ITERATIONS && evaluateCondition(condition, state)) {
    runScopedStatements(body, state);
    if (state.returned || state.stepCounter >= MAX_TOTAL_STEPS) {
      break;
    }
    iterations += 1;
  }
}

export function execForEach(stmt: AliceStatement, state: VMState): void {
  const collection = evaluateValue(state, stmt.collection ?? "[]");
  const items = Array.isArray(collection) ? collection : [];
  const body = stmt.body ?? [];
  const itemName = stmt.itemName ?? "item";

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "ForEach",
    detail: `forEach ${itemName} in ${valueToString(collection)}`,
  });

  if (items.length === 0 || body.length === 0) {
    return;
  }

  for (const item of items.slice(0, MAX_LOOP_ITERATIONS)) {
    if (state.returned || state.stepCounter >= MAX_TOTAL_STEPS) {
      break;
    }
    pushScope(state);
    scopeSet(state, itemName, item);
    state.depth++;
    runStatements(body, state);
    state.depth--;
    popScope(state);
  }
}

export function execIfElse(stmt: AliceStatement, state: VMState): void {
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

  pushScope(state);
  state.depth++;
  runStatements(branch, state);
  state.depth--;
  popScope(state);
}

export function execTryCatch(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "TryCatch",
    detail: `catch ${stmt.catchType ?? "Exception"} as ${stmt.catchVariable ?? "error"}`,
  });

  try {
    runScopedStatements(stmt.tryBody ?? [], state);
  } catch (error) {
    if (!isVMException(error)) {
      throw error;
    }
    const catchType = stmt.catchType ?? "Exception";
    if (catchType !== error.typeName && catchType !== "Exception") {
      throw error;
    }
    pushScope(state);
    scopeSet(state, stmt.catchVariable ?? "error", error.value);
    state.depth++;
    runStatements(stmt.catchBody ?? [], state);
    state.depth--;
    popScope(state);
  }
}

export function execThrow(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const value = evaluateValue(state, stmt.expression ?? "error");
  state.log.push({
    step: state.stepCounter,
    kind: "ThrowStatement",
    detail: `throw ${valueToString(value)}`,
  });
  throw { typeName: stmt.varType ?? "Exception", value } satisfies VMException;
}

function isVMException(error: unknown): error is VMException {
  return typeof error === "object" && error !== null && "typeName" in error && "value" in error;
}

function evaluateCondition(condition: string, state: VMState): boolean {
  if (condition === "true") return true;
  if (condition === "false") return false;

  const value = evaluateValue(state, condition);
  if (value === true || value === "true") return true;
  if (value === false || value === "false" || value === null || value === 0) return false;

  // Numbers: nonzero is truthy
  if (typeof value === "number") return value !== 0;

  // Booleans resolved through function calls
  if (typeof value === "boolean") return value;

  // Unknown / unresolvable conditions default to true (per spec)
  return true;
}

export function execReturn(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const expr = stmt.expression ?? "undefined";
  const value = evaluateValue(state, expr);

  state.log.push({
    step: state.stepCounter,
    kind: "ReturnStatement",
    detail: `return ${valueToString(value)}`,
  });

  state.returned = true;
  state.returnValue = value;
}

export function execVariableDeclaration(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const name = stmt.name ?? "unknown";
  const varType = stmt.varType ?? "Object";
  const value = evaluateValue(state, stmt.value ?? "");

  state.log.push({
    step: state.stepCounter,
    kind: "VariableDeclaration",
    detail: `${name}: ${varType} = ${valueToString(value)}`,
  });

  scopeSet(state, name, value);
  updateWorkflowScoreValue(state, name, value);
}

export function execVariableAssignment(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const name = stmt.name ?? "unknown";
  const value = evaluateValue(state, stmt.value ?? "");

  state.log.push({
    step: state.stepCounter,
    kind: "VariableAssignment",
    detail: `${name} = ${valueToString(value)}`,
  });

  scopeAssign(state, name, value);
  updateWorkflowScoreValue(state, name, value);
}

export function execEventListener(stmt: AliceStatement, state: VMState): void {
  state.stepCounter++;
  const event = stmt.event ?? "unknown";

  state.log.push({
    step: state.stepCounter,
    kind: "EventListener",
    detail: `register "${event}"`,
  });
  // Registered but not dispatched during VM run (per spec)
}

function updateWorkflowScoreValue(state: VMState, name: string, value: unknown): void {
  const workflowRuntime = state.aliceWorkflowRuntime;
  if (!workflowRuntime) {
    return;
  }
  const sourceName = resolveScorekeeperSourceName(workflowRuntime.workflow, name);
  if (!sourceName) {
    return;
  }
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new AliceWorkflowStateError(
      "invalid-score-value",
      `aliceWorkflow.scorekeepers.${sourceName}`,
      "runtime score value must be finite",
    );
  }
  workflowRuntime.scoreValues.set(sourceName, numeric);
}
