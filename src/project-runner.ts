import { RunSystem } from "./run-system.js";
import type { CompilationUnit, ExecutableAst, ExecutableMethod } from "./tweedle-compiler.js";
import type { Expression, Statement } from "./tweedle-parser.js";

export interface RunConfiguration {
  speed?: number;
  breakpoints?: string[];
  loggingLevel?: "silent" | "info" | "debug";
  tickMs?: number;
  maxSteps?: number;
}

export interface ExecutionLogEntry {
  timestampMs: number;
  step: number;
  className: string;
  methodName: string;
  statementType: string;
  message: string;
  breakpointId: string;
}

export interface RunResult {
  success: boolean;
  completionReason: "completed" | "stopped" | "breakpoint" | "error";
  executionTimeMs: number;
  output: string[];
  log: ExecutionLogEntry[];
  error: string | null;
  stoppedAtBreakpoint: string | null;
}

export interface ExecutableProject {
  units: CompilationUnit[];
  entryPoint?: string;
}

interface PlannedStep {
  breakpointId: string;
  className: string;
  methodName: string;
  statement: Statement;
}

export class ExecutionLog {
  private readonly entries: ExecutionLogEntry[] = [];

  record(entry: ExecutionLogEntry): ExecutionLogEntry {
    this.entries.push(entry);
    return entry;
  }

  toArray(): ExecutionLogEntry[] {
    return [...this.entries];
  }

  toText(): string {
    return this.entries.map((entry) => `[${entry.timestampMs}ms] ${entry.message}`).join("\n");
  }

  clear(): void {
    this.entries.length = 0;
  }

  get length(): number {
    return this.entries.length;
  }
}

export class ProjectRunner {
  private project: ExecutableProject | null = null;

  constructor(private readonly configuration: RunConfiguration = {}) {}

  loadProject(project: CompilationUnit | readonly CompilationUnit[] | ExecutableProject): ExecutableProject {
    this.project = normalizeProject(project);
    return this.project;
  }

  async run(project?: CompilationUnit | readonly CompilationUnit[] | ExecutableProject): Promise<RunResult> {
    const activeProject = project ? this.loadProject(project) : this.project;
    if (!activeProject) {
      throw new Error("No project has been loaded");
    }

    const log = new ExecutionLog();
    const output: string[] = [];
    const steps = buildExecutionPlan(activeProject);
    const breakpoints = new Set(this.configuration.breakpoints ?? []);
    const maxSteps = Math.max(1, this.configuration.maxSteps ?? 10_000);
    let stepIndex = 0;
    let stoppedAtBreakpoint: string | null = null;

    const system = new RunSystem({
      tickMs: this.configuration.tickMs ?? 1,
      speed: this.configuration.speed ?? 1,
    });

    await system.start({
      step: ({ elapsedMs }) => {
        if (stepIndex >= steps.length) {
          return false;
        }
        const plannedStep = steps[stepIndex];
        if (breakpoints.has(plannedStep.breakpointId) || breakpoints.has(`${plannedStep.className}.${plannedStep.methodName}`)) {
          stoppedAtBreakpoint = plannedStep.breakpointId;
          return false;
        }
        if (stepIndex >= maxSteps) {
          throw new Error(`Maximum step limit ${maxSteps} exceeded`);
        }
        executeStep(plannedStep, elapsedMs, stepIndex, log, output, this.configuration.loggingLevel ?? "info");
        stepIndex += 1;
        return stepIndex < steps.length;
      },
    });

    const baseResult = await system.waitForCompletion();
    const completionReason = system.lastError
      ? "error"
      : stoppedAtBreakpoint
        ? "breakpoint"
        : baseResult?.reason === "stopped"
          ? "stopped"
          : "completed";

    return {
      success: completionReason === "completed" || completionReason === "breakpoint",
      completionReason,
      executionTimeMs: baseResult?.elapsedMs ?? 0,
      output,
      log: log.toArray(),
      error: system.lastError ? String((system.lastError.cause as Error)?.message ?? system.lastError.cause) : null,
      stoppedAtBreakpoint,
    };
  }
}

export class InteractiveRunner {
  private readonly project: ExecutableProject;
  private readonly steps: PlannedStep[];
  private readonly loggingLevel: RunConfiguration["loggingLevel"];
  private readonly output: string[] = [];
  private readonly log = new ExecutionLog();
  private stepIndex = 0;

  constructor(project: CompilationUnit | readonly CompilationUnit[] | ExecutableProject, configuration: RunConfiguration = {}) {
    this.project = normalizeProject(project);
    this.steps = buildExecutionPlan(this.project);
    this.loggingLevel = configuration.loggingLevel ?? "debug";
  }

  step(): ExecutionLogEntry | null {
    if (this.stepIndex >= this.steps.length) {
      return null;
    }
    const plannedStep = this.steps[this.stepIndex];
    const entry = executeStep(plannedStep, this.stepIndex, this.stepIndex, this.log, this.output, this.loggingLevel);
    this.stepIndex += 1;
    return entry;
  }

  reset(): void {
    this.stepIndex = 0;
    this.output.length = 0;
    this.log.clear();
  }

  get isComplete(): boolean {
    return this.stepIndex >= this.steps.length;
  }

  get executionLog(): ExecutionLog {
    return this.log;
  }

  getOutput(): string[] {
    return [...this.output];
  }
}

function normalizeProject(project: CompilationUnit | readonly CompilationUnit[] | ExecutableProject): ExecutableProject {
  if (project instanceof Array) {
    return { units: [...project] };
  }
  if (project instanceof Object && "units" in project) {
    return { units: [...project.units], entryPoint: project.entryPoint };
  }
  return { units: [project] };
}

function buildExecutionPlan(project: ExecutableProject): PlannedStep[] {
  const executableAsts = project.units
    .map((unit) => unit.executableAst)
    .filter((ast): ast is ExecutableAst => ast !== null);
  if (executableAsts.length === 0) {
    return [];
  }

  const methodIndex = new Map<string, ExecutableMethod>();
  for (const ast of executableAsts) {
    for (const method of [...ast.constructors, ...ast.methods]) {
      methodIndex.set(method.key, method);
    }
  }

  const entryPoint = project.entryPoint
    ?? executableAsts.find((ast) => ast.entryPoint)?.entryPoint
    ?? [...methodIndex.keys()][0]
    ?? null;
  if (!entryPoint) {
    return [];
  }

  const entryMethod = methodIndex.get(entryPoint);
  if (!entryMethod) {
    throw new Error(`Unknown entry point '${entryPoint}'`);
  }

  return expandMethod(entryMethod, methodIndex, new Set());
}

function expandMethod(method: ExecutableMethod, methodIndex: ReadonlyMap<string, ExecutableMethod>, callStack: Set<string>): PlannedStep[] {
  if (callStack.has(method.key)) {
    return [];
  }
  const nextCallStack = new Set(callStack);
  nextCallStack.add(method.key);
  return expandStatements(method.className, method.name, method.body, methodIndex, nextCallStack, { value: 0 });
}

function expandStatements(
  className: string,
  methodName: string,
  statements: readonly Statement[],
  methodIndex: ReadonlyMap<string, ExecutableMethod>,
  callStack: Set<string>,
  ordinal: { value: number },
): PlannedStep[] {
  const steps: PlannedStep[] = [];
  for (const statement of statements) {
    ordinal.value += 1;
    const plannedStep: PlannedStep = {
      breakpointId: `${className}.${methodName}#${ordinal.value}:${statement.type}`,
      className,
      methodName,
      statement,
    };
    steps.push(plannedStep);

    switch (statement.type) {
      case "DoInOrder":
      case "DoTogether":
      case "Block":
        steps.push(...expandStatements(className, methodName, statement.body, methodIndex, callStack, ordinal));
        break;
      case "IfElse": {
        const branch = chooseIfBranch(statement);
        steps.push(...expandStatements(className, methodName, branch, methodIndex, callStack, ordinal));
        break;
      }
      case "ForEach":
      case "CountUpTo":
      case "WhileLoop":
        steps.push(...expandStatements(className, methodName, statement.body, methodIndex, callStack, ordinal));
        break;
      case "TryCatch":
        steps.push(...expandStatements(className, methodName, statement.tryBody, methodIndex, callStack, ordinal));
        break;
      case "SwitchCase": {
        const nextBody = statement.cases[0]?.body ?? statement.defaultCase ?? [];
        steps.push(...expandStatements(className, methodName, nextBody, methodIndex, callStack, ordinal));
        break;
      }
      case "ExpressionStatement": {
        const invoked = resolveInvokedMethod(statement.expression, className, methodIndex);
        if (invoked && !callStack.has(invoked.key)) {
          steps.push(...expandMethod(invoked, methodIndex, callStack));
        }
        break;
      }
      case "Return":
        return steps;
      case "LocalVariableDeclaration":
      case "ThisConstructorInvocationStatement":
      case "SuperConstructorInvocationStatement":
      case "DisabledBlock":
      case "Comment":
        break;
      default:
        assertNever(statement);
    }
  }
  return steps;
}

function chooseIfBranch(statement: Extract<Statement, { type: "IfElse" }>): Statement[] {
  const condition = statement.condition;
  if (condition.type === "Literal" && condition.literalType === "boolean") {
    return condition.value ? statement.ifBody : statement.elseBody ?? [];
  }
  return statement.ifBody;
}

function resolveInvokedMethod(
  expression: Expression,
  className: string,
  methodIndex: ReadonlyMap<string, ExecutableMethod>,
): ExecutableMethod | null {
  if (expression.type !== "MethodInvocation") {
    return null;
  }
  const isThisCall = expression.target === null || expression.target.type === "This";
  if (!isThisCall) {
    return null;
  }
  return methodIndex.get(`${className}.${expression.methodName}`) ?? null;
}

function executeStep(
  step: PlannedStep,
  timestampMs: number,
  index: number,
  log: ExecutionLog,
  output: string[],
  loggingLevel: RunConfiguration["loggingLevel"],
): ExecutionLogEntry {
  const message = describeStatement(step.statement, step.className, step.methodName, output);
  const entry: ExecutionLogEntry = {
    timestampMs,
    step: index,
    className: step.className,
    methodName: step.methodName,
    statementType: step.statement.type,
    message,
    breakpointId: step.breakpointId,
  };
  if (loggingLevel !== "silent") {
    log.record(entry);
  }
  return entry;
}

function describeStatement(statement: Statement, className: string, methodName: string, output: string[]): string {
  switch (statement.type) {
    case "ExpressionStatement":
      return describeExpression(statement.expression, className, methodName, output);
    case "LocalVariableDeclaration":
      return `${className}.${methodName} declares ${statement.name}`;
    case "Return":
      return `${className}.${methodName} returns`;
    case "Comment":
      return `${className}.${methodName} comment: ${statement.text}`;
    case "DisabledBlock":
      return `${className}.${methodName} skips disabled block`;
    default:
      return `${className}.${methodName} executes ${statement.type}`;
  }
}

function describeExpression(expression: Expression, className: string, methodName: string, output: string[]): string {
  if (expression.type === "MethodInvocation") {
    const firstArgument = expression.arguments[0]?.value;
    const text = extractText(firstArgument);
    if (text && ["say", "think", "print", "println"].includes(expression.methodName)) {
      output.push(text);
      return `${className}.${methodName} ${expression.methodName}: ${text}`;
    }
    return `${className}.${methodName} calls ${expression.methodName}`;
  }
  if (expression.type === "Assignment" && expression.target.type === "Identifier") {
    return `${className}.${methodName} assigns ${expression.target.name}`;
  }
  return `${className}.${methodName} evaluates ${expression.type}`;
}

function extractText(expression: Expression | undefined): string | null {
  if (!expression) {
    return null;
  }
  if (expression.type === "Literal" && typeof expression.value === "string") {
    return expression.value;
  }
  if (expression.type === "Identifier") {
    return expression.name;
  }
  return null;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
