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
import {
  createTweedleRuntimeEnvironment,
  registerRuntimeObject,
  resolveRuntimeClassMethod,
  resolveTopLevelRuntimeMethod,
  type TweedleRuntimeClass,
  type TweedleRuntimeEnvironment,
} from "./tweedle-runtime.js";
import { parseTweedle, type ClassDecl, type ConstructorDecl, type Expression, type FieldDecl, type MethodDecl, type Statement, type TypeRef } from "./tweedle-parser.js";

// ── Types ──────────────────────────────────────────────────────────────

export interface LogEntry {
  step: number;
  kind: string;
  detail: string;
  doTogetherEvidence?: DoTogetherEvidence;
}

export interface DoTogetherActionEvidence {
  actionId: string;
  branchIndex: number;
  statementKind: string;
  groupId: string;
  windowId: string;
  startedAtStep: number;
  completedAtStep: number;
}

export interface DoTogetherEvidence {
  kind: "DoTogether";
  groupId: string;
  windowId: string;
  actionCount: number;
  activeWindow: {
    startedAtStep: number;
    completedAtStep: number;
  };
  actions: DoTogetherActionEvidence[];
}

export interface ExecutionResult {
  execution_log: LogEntry[];
  returnValues: Map<string, unknown>;
}

export interface TweedleExecutionOptions {
  declarations?: ClassDecl[];
  entryMethod?: string;
  instanceName?: string;
  arguments?: string[];
  constructorArguments?: string[];
}

// ── Safety caps ────────────────────────────────────────────────────────

export const MAX_TOTAL_STEPS = 50_000;

export const MAX_LOOP_ITERATIONS = 10_000;

export const MAX_DEPTH = 100;

export const MAX_VARIABLES_PER_SCOPE = 1_000;

// ── Internal state ─────────────────────────────────────────────────────

export interface RuntimeObject {
  name: string;
  typeName: string;
  fields: Map<string, unknown>;
  source: AliceObject;
}

export type RuntimeType = TweedleRuntimeClass;

export interface VMException {
  typeName: string;
  value: unknown;
}

export interface RuntimeLambda {
  raw: string;
  parameterName: string | null;
  body: AliceStatement[];
  self: RuntimeObject | null;
}

export interface AliceMethodBridge {
  handleMethodCall(target: RuntimeObject, methodName: string, args: readonly unknown[], state: VMState): boolean;
  readonly animationQueue?: { beginSequentialBlock(): void; endSequentialBlock(): void } | null;
}

export interface VMExecutionOptions {
  sceneBridge?: AliceMethodBridge | null;
}

interface DebugCallFrameState {
  id: string;
  ownerName: string | null;
  methodName: string;
  signature: string;
  receiver: RuntimeObject | null;
  scopeStartIndex: number;
}

export interface DebugRuntime {
  statementLookup: WeakMap<AliceStatement, DebugStatementLocation>;
  trace: DebugTraceEvent[];
  callStack: DebugCallFrameState[];
  activeStatementIds: string[];
  invocationCounter: number;
}

export interface VMState {
  stepCounter: number;
  depth: number;
  log: LogEntry[];
  returned: boolean;
  returnValue: unknown;
  scopes: Map<string, unknown>[];
  runtime: TweedleRuntimeEnvironment<RuntimeObject>;
  methodMap: Map<string, AliceMethod[]>;
  typeMap: Map<string, RuntimeType>;
  objectMap: Map<string, RuntimeObject>;
  currentSelf: RuntimeObject | null;
  returnValues: Map<string, unknown>;
  listenerMap: Map<string, RuntimeLambda[]>;
  sceneBridge: AliceMethodBridge | null;
  debugRuntime?: DebugRuntime;
}

export interface VMEnvironment {
  log: LogEntry[];
  returnValues: Map<string, unknown>;
  runtime: TweedleRuntimeEnvironment<RuntimeObject>;
  methodMap: Map<string, AliceMethod[]>;
  typeMap: Map<string, RuntimeType>;
  objectMap: Map<string, RuntimeObject>;
  listenerMap: Map<string, RuntimeLambda[]>;
  sceneBridge: AliceMethodBridge | null;
  stepCounter: number;
}
