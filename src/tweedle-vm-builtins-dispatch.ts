import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceObject,
  AliceProject,
  AliceStatement,
} from "./a3p-parser.js";
import {
  createTweedleRuntimeEnvironment,
  registerRuntimeObject,
  resolveRuntimeClassMethod,
  resolveTopLevelRuntimeMethod,
  type TweedleRuntimeClass,
  type TweedleRuntimeEnvironment,
} from "./tweedle-runtime.js";
import { parseTweedle, type ClassDecl, type ConstructorDecl, type Expression, type FieldDecl, type MethodDecl, type Statement, type TypeRef } from "./tweedle-parser.js";
import { convertStatements } from "./tweedle-vm-core-compile.js";
import { runStatements } from "./tweedle-vm-core-setup.js";
import { RuntimeLambda, RuntimeObject, VMState } from "./tweedle-vm-core-types.js";
import { evaluateValue, resolveRuntimeObjectByName } from "./tweedle-vm-eval-core.js";
import { popScope, pushScope, scopeSet } from "./tweedle-vm-stack-scope.js";

// ── Statement handlers ─────────────────────────────────────────────────

export function execMethodCall(stmt: AliceStatement, state: VMState): void {
  const objectName = stmt.object ?? "this";
  const methodName = stmt.method ?? "unknown";
  const args = stmt.arguments ?? [];
  const argsStr = `(${args.join(", ")})`;

  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "MethodCall",
    detail: `${objectName}.${methodName}${argsStr}`,
  });

  const resolvedValue = objectName === "this" ? state.currentSelf : evaluateValue(state, objectName);
  const targetObject = resolveRuntimeObjectByName(state, objectName);
  if (objectName !== "this" && resolvedValue === null && targetObject === null) {
    throw new TypeError(`null reference: ${objectName}`);
  }

  const runtimeMethod = targetObject ? resolveRuntimeMethod(state, targetObject.typeName, methodName, args.length) : null;
  if (runtimeMethod) {
    dispatchMethod(runtimeMethod, args, state, targetObject, targetObject?.typeName ?? null);
    return;
  }

  if (registerListenerCall(methodName, args, state)) {
    return;
  }

  if (objectName === "this") {
    const topLevelMethod = resolveTopLevelMethod(state, methodName, args.length);
    if (topLevelMethod) {
      dispatchMethod(topLevelMethod, args, state, state.currentSelf, null);
    }
  }
}

function registerListenerCall(methodName: string, args: string[], state: VMState): boolean {
  if (!methodName.endsWith("Listener") || args.length === 0) {
    return false;
  }
  const lambdaArg = args.find((arg): arg is string => typeof arg === "string" && arg.includes("->"));
  if (!lambdaArg) {
    return false;
  }
  const compiled = compileLambda(lambdaArg, state.currentSelf);
  if (!compiled) {
    return false;
  }
  const listeners = state.listenerMap.get(methodName) ?? [];
  listeners.push(compiled);
  state.listenerMap.set(methodName, listeners);
  state.stepCounter++;
  state.log.push({
    step: state.stepCounter,
    kind: "EventListener",
    detail: `register ${methodName}`,
  });
  return true;
}

function compileLambda(raw: string, self: RuntimeObject | null): RuntimeLambda | null {
  const arrowIndex = raw.indexOf("->");
  if (arrowIndex < 0) {
    return null;
  }
  const paramsSource = raw.slice(0, arrowIndex).trim();
  const bodySource = raw.slice(arrowIndex + 2).trim();
  if (!bodySource.startsWith("{")) {
    return null;
  }
  const parameterName = parseLambdaParameterName(paramsSource);
  const lambdaAst = parseTweedle(`class __Lambda { void __run() ${bodySource} }`);
  return {
    raw,
    parameterName,
    body: convertStatements(lambdaAst.methods[0]?.body ?? []),
    self,
  };
}

function parseLambdaParameterName(paramsSource: string): string | null {
  const trimmed = paramsSource.trim();
  if (!trimmed.startsWith("(") || !trimmed.endsWith(")")) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return null;
  }
  const parts = inner.split(/\s+/);
  return parts[parts.length - 1] ?? null;
}

export function resolveRuntimeMethod(state: VMState, typeName: string, methodName: string, argCount: number): AliceMethod | null {
  return resolveRuntimeClassMethod(state.runtime, typeName, methodName, argCount);
}

function resolveTopLevelMethod(state: VMState, methodName: string, argCount: number): AliceMethod | null {
  return resolveTopLevelRuntimeMethod(state.runtime, methodName, argCount);
}

export function dispatchMethod(
  target: AliceMethod,
  args: string[],
  state: VMState,
  self: RuntimeObject | null = state.currentSelf,
  declaringTypeName: string | null = null,
): void {
  const resolvedArgs: unknown[] = [];
  for (let i = 0; i < target.parameters.length && i < args.length; i++) {
    resolvedArgs.push(evaluateValue(state, args[i]));
  }

  const callerReturned = state.returned;
  const callerReturnValue = state.returnValue;
  const callerSelf = state.currentSelf;
  state.returned = false;
  state.returnValue = undefined;
  state.currentSelf = self;

  pushScope(state);
  for (let i = 0; i < resolvedArgs.length; i++) {
    scopeSet(state, target.parameters[i].name, resolvedArgs[i]);
  }

  const runtime = state.debugRuntime;
  if (runtime) {
    runtime.invocationCounter += 1;
    const ownerName = declaringTypeName ?? self?.typeName ?? null;
    runtime.callStack.push({
      id: `${ownerName ?? "global"}.${target.name}:${runtime.invocationCounter}`,
      ownerName,
      methodName: target.name,
      signature: `${ownerName ?? "global"}.${target.name}/${target.parameters.length}`,
      receiver: self,
      scopeStartIndex: state.scopes.length - 1,
    });
  }

  let methodReturned = false;
  let methodReturnValue: unknown = undefined;
  try {
    state.depth++;
    runStatements(target.statements, state);
    methodReturned = state.returned;
    methodReturnValue = state.returnValue;
    if (methodReturned && methodReturnValue !== undefined) {
      state.returnValues.set(target.name, methodReturnValue);
    }
  } finally {
    state.depth = Math.max(state.depth - 1, 0);
    runtime?.callStack.pop();
    popScope(state);
    state.currentSelf = callerSelf;
    state.returned = callerReturned;
    state.returnValue = callerReturnValue;

    if (declaringTypeName) {
      state.currentSelf = callerSelf;
    }
  }
}
