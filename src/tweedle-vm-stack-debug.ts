import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceObject,
  AliceProject,
  AliceStatement,
} from "./a3p-parser.js";
import {
  collectProjectDebugStatements,
  TweedleDebugSession,
  type DebugCallFrame,
  type DebugStatementLocation,
  type DebugTrace,
  type DebugTraceEvent,
  type DebugVariableSnapshot,
} from "./debugging.js";
import { DebugRuntime, RuntimeObject, VMState } from "./tweedle-vm-core-types.js";

export function cloneScopes(scopes: Map<string, unknown>[]): Map<string, unknown>[] {
  return scopes.map((scope) => new Map(scope));
}

export function cloneObjectMap(objectMap: Map<string, RuntimeObject>): Map<string, RuntimeObject> {
  const clone = new Map<string, RuntimeObject>();
  for (const [name, runtimeObject] of objectMap.entries()) {
    clone.set(name, {
      ...runtimeObject,
      fields: new Map(runtimeObject.fields),
    });
  }
  return clone;
}

export function buildDebugRuntime(statements: readonly DebugStatementLocation[]): DebugRuntime {
  const statementLookup = new WeakMap<AliceStatement, DebugStatementLocation>();
  for (const statement of statements) {
    statementLookup.set(statement.statement, statement);
  }
  return {
    statementLookup,
    trace: [],
    callStack: [],
    activeStatementIds: [],
    invocationCounter: 0,
  };
}

function isRuntimeObjectValue(value: unknown): value is RuntimeObject {
  return typeof value === "object"
    && value !== null
    && "name" in value
    && "typeName" in value
    && "fields" in value
    && (value as { fields: unknown }).fields instanceof Map;
}

function snapshotDebugValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  if (Array.isArray(value)) {
    return value.map((entry) => snapshotDebugValue(entry, seen));
  }
  if (isRuntimeObjectValue(value)) {
    if (seen.has(value)) {
      return `[Circular ${value.typeName}]`;
    }
    seen.add(value);
    return {
      name: value.name,
      typeName: value.typeName,
      fields: snapshotRuntimeFields(value.fields, seen),
    };
  }
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, entry]) => [String(key), snapshotDebugValue(entry, seen)]));
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== "source")
        .map(([key, entry]) => [key, snapshotDebugValue(entry, seen)]),
    );
  }
  return String(value);
}

function snapshotRuntimeFields(fields: Map<string, unknown>, seen = new WeakSet<object>()): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const [name, value] of fields.entries()) {
    snapshot[name] = snapshotDebugValue(value, seen);
  }
  return snapshot;
}

function collectFrameLocals(scopes: Map<string, unknown>[], start: number, end: number): Record<string, unknown> {
  const locals: Record<string, unknown> = {};
  const safeEnd = Math.min(end, scopes.length);
  for (let index = start; index < safeEnd; index++) {
    for (const [name, value] of scopes[index].entries()) {
      locals[name] = snapshotDebugValue(value);
    }
  }
  return locals;
}

function snapshotCallStack(state: VMState): DebugCallFrame[] {
  const runtime = state.debugRuntime;
  if (!runtime) {
    return [];
  }
  return runtime.callStack.map((frame, index) => {
    const nextFrame = runtime.callStack[index + 1];
    const locals = collectFrameLocals(state.scopes, frame.scopeStartIndex, nextFrame?.scopeStartIndex ?? state.scopes.length);
    const fields = frame.receiver ? snapshotRuntimeFields(frame.receiver.fields) : {};
    return {
      id: frame.id,
      ownerName: frame.ownerName,
      methodName: frame.methodName,
      signature: frame.signature,
      receiverName: frame.receiver?.name ?? null,
      receiverTypeName: frame.receiver?.typeName ?? null,
      locals,
      fields,
    };
  });
}

function snapshotVisibleVariables(callStack: readonly DebugCallFrame[]): DebugVariableSnapshot {
  const currentFrame = callStack[callStack.length - 1];
  if (!currentFrame) {
    return {
      locals: {},
      fields: {},
      visible: {},
    };
  }
  const visible: Record<string, unknown> = {
    ...currentFrame.fields,
    ...currentFrame.locals,
  };
  if (currentFrame.receiverName) {
    visible.this = {
      name: currentFrame.receiverName,
      typeName: currentFrame.receiverTypeName,
    };
  }
  return {
    locals: currentFrame.locals,
    fields: currentFrame.fields,
    visible,
  };
}

export function recordDebugEvent(state: VMState, stmt: AliceStatement): void {
  const runtime = state.debugRuntime;
  if (!runtime) {
    return;
  }
  const statement = runtime.statementLookup.get(stmt);
  if (!statement) {
    return;
  }
  const callStack = snapshotCallStack(state);
  runtime.trace.push({
    statement,
    ancestorStatementIds: [...runtime.activeStatementIds],
    callStack,
    variables: snapshotVisibleVariables(callStack),
    step: state.stepCounter + 1,
    executionLogSize: state.log.length,
  });
}

export function mergeStateFromBranch(
  state: VMState,
  originalScopes: Map<string, unknown>[],
  originalObjects: Map<string, RuntimeObject>,
  branchState: VMState,
): void {
  for (let index = 0; index < originalScopes.length; index++) {
    const originalScope = originalScopes[index];
    const targetScope = state.scopes[index];
    const branchScope = branchState.scopes[index];
    if (!targetScope || !branchScope) {
      continue;
    }
    for (const [name, originalValue] of originalScope.entries()) {
      if (branchScope.has(name)) {
        const branchValue = branchScope.get(name);
        if (branchValue !== originalValue) {
          targetScope.set(name, branchValue);
        }
      }
    }
  }
  for (const [name, runtimeObject] of branchState.objectMap.entries()) {
    const targetObject = state.objectMap.get(name);
    const originalObject = originalObjects.get(name);
    if (!targetObject || !originalObject) {
      continue;
    }
    for (const [fieldName, fieldValue] of runtimeObject.fields.entries()) {
      if (originalObject.fields.get(fieldName) !== fieldValue) {
        targetObject.fields.set(fieldName, fieldValue);
      }
    }
  }
}
