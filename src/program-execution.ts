export type ProgramValue = number | string | boolean | null | undefined;
export type ExecutionPauseReason = "ready" | "step" | "breakpoint" | "completed";

export type ProgramExpression =
  | ProgramValue
  | { readonly var: string }
  | { readonly add: readonly [ProgramExpression, ProgramExpression] }
  | { readonly sub: readonly [ProgramExpression, ProgramExpression] }
  | { readonly mul: readonly [ProgramExpression, ProgramExpression] }
  | { readonly div: readonly [ProgramExpression, ProgramExpression] };

export type ProgramInstruction =
  | { readonly id: string; readonly kind: "assign"; readonly name: string; readonly value: ProgramExpression }
  | { readonly id: string; readonly kind: "print"; readonly expression: ProgramExpression }
  | { readonly id: string; readonly kind: "call"; readonly method: string; readonly args?: readonly ProgramExpression[]; readonly assignTo?: string }
  | { readonly id: string; readonly kind: "return"; readonly expression?: ProgramExpression };

export interface ProgramMethod {
  readonly name: string;
  readonly parameters?: readonly string[];
  readonly body: readonly ProgramInstruction[];
}

export interface AliceProgramDefinition {
  readonly entry: string;
  readonly methods: readonly ProgramMethod[];
}

export interface ExecutionFrameSnapshot {
  readonly methodName: string;
  readonly locals: Readonly<Record<string, ProgramValue>>;
}

export interface ExecutionEvent {
  readonly statement: ProgramInstruction;
  readonly callStack: readonly ExecutionFrameSnapshot[];
  readonly variables: Readonly<Record<string, ProgramValue>>;
  readonly consoleLines: readonly string[];
  readonly step: number;
}

export interface ExecutionSnapshot {
  readonly reason: ExecutionPauseReason;
  readonly statement: ProgramInstruction | null;
  readonly callStack: readonly ExecutionFrameSnapshot[];
  readonly variables: Readonly<Record<string, ProgramValue>>;
  readonly consoleLines: readonly string[];
  readonly breakpoints: readonly string[];
  readonly complete: boolean;
  readonly step: number;
}

export interface BreakpointDefinition {
  readonly statementId: string;
  readonly condition?: string;
}

export interface ExecutionProfileEntry {
  readonly statementId: string;
  readonly executions: number;
  readonly totalMs: number;
}

interface MutableFrame {
  readonly methodName: string;
  readonly locals: Record<string, ProgramValue>;
}

function cloneFrame(frame: MutableFrame | ExecutionFrameSnapshot): ExecutionFrameSnapshot {
  return {
    methodName: frame.methodName,
    locals: { ...frame.locals },
  };
}

function cloneVariables(variables: Record<string, ProgramValue>): Record<string, ProgramValue> {
  return { ...variables };
}

function isReference(expression: ProgramExpression): expression is { readonly var: string } {
  return typeof expression === "object" && expression !== null && "var" in expression;
}

function evaluateNumeric(left: ProgramValue, right: ProgramValue, operator: (a: number, b: number) => number): number {
  return operator(Number(left ?? 0), Number(right ?? 0));
}

type WatchTokenType = "identifier" | "number" | "string" | "operator" | "leftParen" | "rightParen" | "end";

interface WatchToken {
  readonly type: WatchTokenType;
  readonly value: string;
  readonly position: number;
}

type WatchUnaryOperator = "!" | "+" | "-";
type WatchBinaryOperator = "||" | "&&" | "==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/";

type WatchExpressionNode =
  | { readonly type: "literal"; readonly value: ProgramValue }
  | { readonly type: "identifier"; readonly name: string; readonly position: number }
  | { readonly type: "unary"; readonly operator: WatchUnaryOperator; readonly expression: WatchExpressionNode }
  | { readonly type: "binary"; readonly operator: WatchBinaryOperator; readonly left: WatchExpressionNode; readonly right: WatchExpressionNode };

class WatchExpressionSyntaxError extends Error {
  constructor(message: string) {
    super(`Unsupported debugger expression: ${message}`);
  }
}

function assertWatchBinding(name: string, value: unknown): ProgramValue {
  if (
    value === null
    || value === undefined
    || typeof value === "number"
    || typeof value === "string"
    || typeof value === "boolean"
  ) {
    return value;
  }
  throw new WatchExpressionSyntaxError(`binding '${name}' has unsupported value type '${typeof value}'`);
}

function tokenizeWatchExpression(expression: string): WatchToken[] {
  const tokens: WatchToken[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      index += 1;
      while (index < expression.length && /[A-Za-z0-9_$]/.test(expression[index]!)) {
        index += 1;
      }
      tokens.push({ type: "identifier", value: expression.slice(start, index), position: start });
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(expression[index + 1] ?? ""))) {
      const start = index;
      if (char === ".") {
        index += 1;
      }
      while (index < expression.length && /[0-9]/.test(expression[index]!)) {
        index += 1;
      }
      if (expression[index] === ".") {
        index += 1;
        while (index < expression.length && /[0-9]/.test(expression[index]!)) {
          index += 1;
        }
      }
      tokens.push({ type: "number", value: expression.slice(start, index), position: start });
      continue;
    }

    if (char === "'" || char === "\"") {
      const quote = char;
      const start = index;
      let value = "";
      index += 1;
      while (index < expression.length) {
        const current = expression[index]!;
        if (current === quote) {
          index += 1;
          tokens.push({ type: "string", value, position: start });
          break;
        }
        if (current === "\\") {
          const escaped = expression[index + 1];
          if (escaped === undefined) {
            throw new WatchExpressionSyntaxError(`unterminated escape sequence at position ${index}`);
          }
          const escapes: Record<string, string> = {
            "\\": "\\",
            "'": "'",
            "\"": "\"",
            n: "\n",
            r: "\r",
            t: "\t",
          };
          value += escapes[escaped] ?? escaped;
          index += 2;
          continue;
        }
        value += current;
        index += 1;
      }
      if (tokens[tokens.length - 1]?.position !== start) {
        throw new WatchExpressionSyntaxError(`unterminated string literal at position ${start}`);
      }
      continue;
    }

    const threeChar = expression.slice(index, index + 3);
    if (threeChar === "===" || threeChar === "!==") {
      tokens.push({ type: "operator", value: threeChar, position: index });
      index += 3;
      continue;
    }

    const twoChar = expression.slice(index, index + 2);
    if (["==", "!=", "<=", ">=", "&&", "||"].includes(twoChar)) {
      tokens.push({ type: "operator", value: twoChar, position: index });
      index += 2;
      continue;
    }

    if (["+", "-", "*", "/", "<", ">", "!"].includes(char)) {
      tokens.push({ type: "operator", value: char, position: index });
      index += 1;
      continue;
    }

    if (char === "(") {
      tokens.push({ type: "leftParen", value: char, position: index });
      index += 1;
      continue;
    }

    if (char === ")") {
      tokens.push({ type: "rightParen", value: char, position: index });
      index += 1;
      continue;
    }

    throw new WatchExpressionSyntaxError(`token '${char}' at position ${index} is not allowed`);
  }

  tokens.push({ type: "end", value: "", position: expression.length });
  return tokens;
}

class WatchExpressionParser {
  private cursor = 0;

  constructor(private readonly tokens: readonly WatchToken[]) {}

  parse(): WatchExpressionNode {
    const node = this.parseLogicalOr();
    const token = this.current();
    if (token.type !== "end") {
      throw new WatchExpressionSyntaxError(`unexpected token '${token.value}' at position ${token.position}`);
    }
    return node;
  }

  private parseLogicalOr(): WatchExpressionNode {
    let node = this.parseLogicalAnd();
    while (this.matchOperator("||")) {
      node = { type: "binary", operator: "||", left: node, right: this.parseLogicalAnd() };
    }
    return node;
  }

  private parseLogicalAnd(): WatchExpressionNode {
    let node = this.parseEquality();
    while (this.matchOperator("&&")) {
      node = { type: "binary", operator: "&&", left: node, right: this.parseEquality() };
    }
    return node;
  }

  private parseEquality(): WatchExpressionNode {
    let node = this.parseComparison();
    while (this.current().type === "operator" && ["==", "!=", "===", "!=="].includes(this.current().value)) {
      const operator = this.advance().value as WatchBinaryOperator;
      node = { type: "binary", operator, left: node, right: this.parseComparison() };
    }
    return node;
  }

  private parseComparison(): WatchExpressionNode {
    let node = this.parseAdditive();
    while (this.current().type === "operator" && ["<", "<=", ">", ">="].includes(this.current().value)) {
      const operator = this.advance().value as WatchBinaryOperator;
      node = { type: "binary", operator, left: node, right: this.parseAdditive() };
    }
    return node;
  }

  private parseAdditive(): WatchExpressionNode {
    let node = this.parseMultiplicative();
    while (this.current().type === "operator" && ["+", "-"].includes(this.current().value)) {
      const operator = this.advance().value as WatchBinaryOperator;
      node = { type: "binary", operator, left: node, right: this.parseMultiplicative() };
    }
    return node;
  }

  private parseMultiplicative(): WatchExpressionNode {
    let node = this.parseUnary();
    while (this.current().type === "operator" && ["*", "/"].includes(this.current().value)) {
      const operator = this.advance().value as WatchBinaryOperator;
      node = { type: "binary", operator, left: node, right: this.parseUnary() };
    }
    return node;
  }

  private parseUnary(): WatchExpressionNode {
    if (this.matchOperator("!")) {
      return { type: "unary", operator: "!", expression: this.parseUnary() };
    }
    if (this.matchOperator("-")) {
      return { type: "unary", operator: "-", expression: this.parseUnary() };
    }
    if (this.matchOperator("+")) {
      return { type: "unary", operator: "+", expression: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): WatchExpressionNode {
    const token = this.current();
    if (token.type === "number") {
      this.advance();
      return { type: "literal", value: Number(token.value) };
    }
    if (token.type === "string") {
      this.advance();
      return { type: "literal", value: token.value };
    }
    if (token.type === "identifier") {
      this.advance();
      switch (token.value) {
      case "true":
        return { type: "literal", value: true };
      case "false":
        return { type: "literal", value: false };
      case "null":
        return { type: "literal", value: null };
      case "undefined":
        return { type: "literal", value: undefined };
      default:
        return { type: "identifier", name: token.value, position: token.position };
      }
    }
    if (token.type === "leftParen") {
      this.advance();
      const node = this.parseLogicalOr();
      if (this.current().type !== "rightParen") {
        throw new WatchExpressionSyntaxError(`expected ')' at position ${this.current().position}`);
      }
      this.advance();
      return node;
    }
    throw new WatchExpressionSyntaxError(`expected a value at position ${token.position}`);
  }

  private matchOperator(operator: string): boolean {
    if (this.current().type === "operator" && this.current().value === operator) {
      this.advance();
      return true;
    }
    return false;
  }

  private current(): WatchToken {
    return this.tokens[this.cursor]!;
  }

  private advance(): WatchToken {
    const token = this.current();
    this.cursor += 1;
    return token;
  }
}

function evaluateWatchExpressionNode(
  node: WatchExpressionNode,
  bindings: Readonly<Record<string, unknown>>,
): ProgramValue {
  switch (node.type) {
  case "literal":
    return node.value;
  case "identifier":
    if (Object.prototype.hasOwnProperty.call(bindings, node.name)) {
      return assertWatchBinding(node.name, bindings[node.name]);
    }
    throw new WatchExpressionSyntaxError(`unknown identifier '${node.name}' at position ${node.position}`);
  case "unary": {
    const value = evaluateWatchExpressionNode(node.expression, bindings);
    switch (node.operator) {
    case "!":
      return !value;
    case "-":
      return -Number(value);
    case "+":
      return Number(value);
    }
  }
  case "binary":
    return evaluateWatchBinaryExpression(node, bindings);
  default:
    node satisfies never;
  }
}

function evaluateWatchBinaryExpression(
  node: Extract<WatchExpressionNode, { readonly type: "binary" }>,
  bindings: Readonly<Record<string, unknown>>,
): ProgramValue {
  const left = evaluateWatchExpressionNode(node.left, bindings);

  if (node.operator === "||") {
    return left || evaluateWatchExpressionNode(node.right, bindings);
  }
  if (node.operator === "&&") {
    return left && evaluateWatchExpressionNode(node.right, bindings);
  }

  const right = evaluateWatchExpressionNode(node.right, bindings);
  switch (node.operator) {
  case "==":
    return left == right;
  case "!=":
    return left != right;
  case "===":
    return left === right;
  case "!==":
    return left !== right;
  case "<":
    return Number(left) < Number(right);
  case "<=":
    return Number(left) <= Number(right);
  case ">":
    return Number(left) > Number(right);
  case ">=":
    return Number(left) >= Number(right);
  case "+":
    return typeof left === "string" || typeof right === "string"
      ? `${left ?? ""}${right ?? ""}`
      : Number(left) + Number(right);
  case "-":
    return Number(left) - Number(right);
  case "*":
    return Number(left) * Number(right);
  case "/":
    return Number(left) / Number(right);
  }
  throw new WatchExpressionSyntaxError(`internal parser error for operator '${node.operator}'`);
}

export class ExecutionContext {
  private readonly frames: MutableFrame[] = [];

  pushFrame(methodName: string, locals: Record<string, ProgramValue>): void {
    this.frames.push({ methodName, locals: { ...locals } });
  }

  popFrame(): MutableFrame | undefined {
    return this.frames.pop();
  }

  currentFrame(): MutableFrame | undefined {
    return this.frames[this.frames.length - 1];
  }

  setVariable(name: string, value: ProgramValue): void {
    const frame = this.currentFrame();
    if (!frame) {
      throw new Error(`cannot set variable '${name}' without an active frame`);
    }
    frame.locals[name] = value;
  }

  getVariable(name: string): ProgramValue {
    for (let index = this.frames.length - 1; index >= 0; index -= 1) {
      if (Object.prototype.hasOwnProperty.call(this.frames[index].locals, name)) {
        return this.frames[index].locals[name];
      }
    }
    return undefined;
  }

  visibleBindings(): Record<string, ProgramValue> {
    const bindings: Record<string, ProgramValue> = {};
    for (const frame of this.frames) {
      Object.assign(bindings, frame.locals);
    }
    return bindings;
  }

  snapshot(): ExecutionFrameSnapshot[] {
    return this.frames.map((frame) => cloneFrame(frame));
  }

  static fromSnapshot(callStack: readonly ExecutionFrameSnapshot[]): ExecutionContext {
    const context = new ExecutionContext();
    callStack.forEach((frame) => context.pushFrame(frame.methodName, frame.locals));
    return context;
  }
}

export class ConsoleOutput {
  private readonly lines: string[] = [];

  print(value: ProgramValue): void {
    this.lines.push(String(value ?? ""));
  }

  getLines(): string[] {
    return [...this.lines];
  }
}

export class WatchExpression {
  private readonly parsedExpressions = new Map<string, WatchExpressionNode>();

  evaluate(expression: string, context: ExecutionContext): unknown {
    const bindings = context.visibleBindings();
    return evaluateWatchExpressionNode(this.parse(expression), bindings);
  }

  private parse(expression: string): WatchExpressionNode {
    const cached = this.parsedExpressions.get(expression);
    if (cached) {
      return cached;
    }
    const parsed = new WatchExpressionParser(tokenizeWatchExpression(expression)).parse();
    if (this.parsedExpressions.size >= WATCH_EXPRESSION_CACHE_LIMIT) {
      const oldestExpression = this.parsedExpressions.keys().next().value;
      if (oldestExpression !== undefined) {
        this.parsedExpressions.delete(oldestExpression);
      }
    }
    this.parsedExpressions.set(expression, parsed);
    return parsed;
  }
}

const WATCH_EXPRESSION_CACHE_LIMIT = 128;

export class BreakpointManager {
  private readonly breakpoints = new Map<string, string | undefined>();

  set(statementId: string, condition?: string): void {
    this.breakpoints.set(statementId, condition);
  }

  remove(statementId: string): boolean {
    return this.breakpoints.delete(statementId);
  }

  has(statementId: string): boolean {
    return this.breakpoints.has(statementId);
  }

  list(): BreakpointDefinition[] {
    return [...this.breakpoints.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([statementId, condition]) => ({ statementId, condition }));
  }

  shouldPause(event: ExecutionEvent, watches = new WatchExpression()): boolean {
    const condition = this.breakpoints.get(event.statement.id);
    if (!this.breakpoints.has(event.statement.id)) {
      return false;
    }
    if (!condition) {
      return true;
    }
    return Boolean(watches.evaluate(condition, ExecutionContext.fromSnapshot(event.callStack)));
  }
}

export class ExecutionProfiler {
  private readonly totals = new Map<string, { executions: number; totalMs: number }>();

  record(statementId: string, durationMs: number): void {
    const entry = this.totals.get(statementId) ?? { executions: 0, totalMs: 0 };
    entry.executions += 1;
    entry.totalMs += durationMs;
    this.totals.set(statementId, entry);
  }

  getEntries(): ExecutionProfileEntry[] {
    return [...this.totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([statementId, value]) => ({ statementId, executions: value.executions, totalMs: value.totalMs }));
  }
}

export class ProgramRunner {
  readonly breakpoints = new BreakpointManager();
  readonly console = new ConsoleOutput();
  readonly profiler = new ExecutionProfiler();
  readonly watches = new WatchExpression();

  private readonly methods = new Map<string, ProgramMethod>();
  private readonly events: ExecutionEvent[] = [];
  private readonly stepController: StepController;

  constructor(program: AliceProgramDefinition, private readonly now: () => number = () => Date.now()) {
    for (const method of program.methods) {
      this.methods.set(method.name, method);
    }
    if (!this.methods.has(program.entry)) {
      throw new Error(`unknown entry method: ${program.entry}`);
    }
    const context = new ExecutionContext();
    this.executeMethod(program.entry, [], context);
    this.stepController = new StepController(this);
  }

  run(): ExecutionSnapshot {
    return this.stepController.continue();
  }

  continue(): ExecutionSnapshot {
    return this.stepController.continue();
  }

  stepInto(): ExecutionSnapshot {
    return this.stepController.stepInto();
  }

  stepOver(): ExecutionSnapshot {
    return this.stepController.stepOver();
  }

  stepOut(): ExecutionSnapshot {
    return this.stepController.stepOut();
  }

  getSnapshot(reason: ExecutionPauseReason = this.stepController.isComplete() ? "completed" : "ready"): ExecutionSnapshot {
    return this.stepController.snapshot(reason);
  }

  getConsoleLines(): string[] {
    return this.console.getLines();
  }

  getProfilerEntries(): ExecutionProfileEntry[] {
    return this.profiler.getEntries();
  }

  getCurrentContext(): ExecutionContext {
    return ExecutionContext.fromSnapshot(this.stepController.currentEvent()?.callStack ?? []);
  }

  getEvents(): readonly ExecutionEvent[] {
    return this.events;
  }

  currentEvent(): ExecutionEvent | null {
    return this.stepController.currentEvent();
  }

  private executeMethod(methodName: string, args: readonly ProgramValue[], context: ExecutionContext): ProgramValue {
    const method = this.methods.get(methodName);
    if (!method) {
      throw new Error(`unknown method: ${methodName}`);
    }
    const parameterNames = method.parameters ?? [];
    const locals: Record<string, ProgramValue> = {};
    for (let index = 0; index < parameterNames.length; index += 1) {
      locals[parameterNames[index]!] = args[index];
    }
    context.pushFrame(method.name, locals);
    for (const statement of method.body) {
      this.events.push({
        statement,
        callStack: context.snapshot(),
        variables: cloneVariables(context.visibleBindings()),
        consoleLines: this.console.getLines(),
        step: this.events.length,
      });
      const startedAt = this.now();
      let returnValue: ProgramValue | typeof NO_RETURN = NO_RETURN;
      switch (statement.kind) {
      case "assign":
        context.setVariable(statement.name, this.evaluateExpression(statement.value, context));
        break;
      case "print":
        this.console.print(this.evaluateExpression(statement.expression, context));
        break;
      case "call": {
        const callArgs = statement.args ?? [];
        const evaluatedArgs: ProgramValue[] = [];
        for (const expression of callArgs) {
          evaluatedArgs.push(this.evaluateExpression(expression, context));
        }
        const callResult = this.executeMethod(statement.method, evaluatedArgs, context);
        if (statement.assignTo) {
          context.setVariable(statement.assignTo, callResult);
        }
        break;
      }
      case "return":
        returnValue = statement.expression === undefined ? undefined : this.evaluateExpression(statement.expression, context);
        break;
      default:
        statement satisfies never;
      }
      this.profiler.record(statement.id, Math.max(0, this.now() - startedAt));
      if (returnValue !== NO_RETURN) {
        context.popFrame();
        return returnValue;
      }
    }
    context.popFrame();
    return undefined;
  }

  private evaluateExpression(expression: ProgramExpression, context: ExecutionContext): ProgramValue {
    if (isReference(expression)) {
      return context.getVariable(expression.var);
    }
    if (typeof expression !== "object" || expression === null) {
      return expression;
    }
    if ("add" in expression) {
      const [left, right] = expression.add;
      return evaluateNumeric(this.evaluateExpression(left, context), this.evaluateExpression(right, context), (a, b) => a + b);
    }
    if ("sub" in expression) {
      const [left, right] = expression.sub;
      return evaluateNumeric(this.evaluateExpression(left, context), this.evaluateExpression(right, context), (a, b) => a - b);
    }
    if ("mul" in expression) {
      const [left, right] = expression.mul;
      return evaluateNumeric(this.evaluateExpression(left, context), this.evaluateExpression(right, context), (a, b) => a * b);
    }
    if ("div" in expression) {
      const [left, right] = expression.div;
      return evaluateNumeric(this.evaluateExpression(left, context), this.evaluateExpression(right, context), (a, b) => a / b);
    }
    return undefined;
  }
}

const NO_RETURN = Symbol("no-return");

export class StepController {
  private cursor = -1;

  constructor(private readonly runner: ProgramRunner) {}

  isComplete(): boolean {
    return this.cursor >= this.runner.getEvents().length;
  }

  currentEvent(): ExecutionEvent | null {
    const events = this.runner.getEvents();
    if (this.cursor < 0 || this.cursor >= events.length) {
      return null;
    }
    return events[this.cursor] ?? null;
  }

  continue(): ExecutionSnapshot {
    const events = this.runner.getEvents();
    for (let index = this.cursor + 1; index < events.length; index += 1) {
      if (this.runner.breakpoints.shouldPause(events[index], this.runner.watches)) {
        this.cursor = index;
        return this.snapshot("breakpoint");
      }
    }
    this.cursor = events.length;
    return this.snapshot("completed");
  }

  stepInto(): ExecutionSnapshot {
    const events = this.runner.getEvents();
    const nextIndex = this.cursor + 1;
    if (nextIndex >= events.length) {
      this.cursor = events.length;
      return this.snapshot("completed");
    }
    this.cursor = nextIndex;
    return this.snapshot("step");
  }

  stepOver(): ExecutionSnapshot {
    const current = this.currentEvent();
    if (!current) {
      return this.stepInto();
    }
    const events = this.runner.getEvents();
    const currentDepth = current.callStack.length;
    const currentMethod = current.callStack[currentDepth - 1]?.methodName ?? null;
    for (let index = this.cursor + 1; index < events.length; index += 1) {
      const event = events[index];
      const depth = event.callStack.length;
      const eventMethod = event.callStack[depth - 1]?.methodName ?? null;
      if (depth < currentDepth || (depth === currentDepth && eventMethod === currentMethod)) {
        this.cursor = index;
        return this.snapshot("step");
      }
    }
    this.cursor = events.length;
    return this.snapshot("completed");
  }

  stepOut(): ExecutionSnapshot {
    const current = this.currentEvent();
    if (!current) {
      return this.stepInto();
    }
    const events = this.runner.getEvents();
    const currentDepth = current.callStack.length;
    for (let index = this.cursor + 1; index < events.length; index += 1) {
      if (events[index].callStack.length < currentDepth) {
        this.cursor = index;
        return this.snapshot("step");
      }
    }
    this.cursor = events.length;
    return this.snapshot("completed");
  }

  snapshot(reason: ExecutionPauseReason): ExecutionSnapshot {
    const event = this.currentEvent();
    return {
      reason,
      statement: event?.statement ?? null,
      callStack: event?.callStack ?? [],
      variables: event?.variables ?? {},
      consoleLines: event?.consoleLines ?? this.runner.getConsoleLines(),
      breakpoints: this.runner.breakpoints.list().map((breakpoint) => breakpoint.statementId),
      complete: this.isComplete(),
      step: event?.step ?? this.runner.getEvents().length,
    };
  }
}
