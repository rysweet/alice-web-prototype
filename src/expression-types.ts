import type { LocalVariableScope } from "./control-flow.js";

export interface ExpressionContext {
  readonly scope?: LocalVariableScope;
  readonly thisValue?: unknown;
}

export interface ExpressionLike<T = unknown> {
  evaluate(context?: ExpressionContext): T;
}

export type ExpressionInput<T = unknown> = T | ExpressionLike<T>;

function isExpressionLike<T>(value: ExpressionInput<T>): value is ExpressionLike<T> {
  return typeof value === "object" && value !== null && "evaluate" in value && typeof value.evaluate === "function";
}

function evaluateInput<T>(value: ExpressionInput<T>, context: ExpressionContext): T {
  return isExpressionLike(value) ? value.evaluate(context) : value;
}

abstract class LiteralExpression<T> implements ExpressionLike<T> {
  constructor(public readonly value: T) {}

  evaluate(): T {
    return this.value;
  }
}

export type ArithmeticOperator = "add" | "subtract" | "multiply" | "divide" | "modulo";
export type RelationalOperator = "eq" | "ne" | "lt" | "gt" | "le" | "ge";
export type LogicalOperator = "and" | "or" | "not";

export class NumberLiteral extends LiteralExpression<number> {}
export class StringLiteral extends LiteralExpression<string> {}
export class BooleanLiteral extends LiteralExpression<boolean> {}

export class NullExpression implements ExpressionLike<null> {
  evaluate(): null {
    return null;
  }
}

export class ThisExpression implements ExpressionLike<unknown> {
  evaluate(context: ExpressionContext = {}): unknown {
    return context.thisValue;
  }
}

export class ArithmeticExpression implements ExpressionLike<number> {
  constructor(
    public readonly operator: ArithmeticOperator,
    public readonly left: ExpressionInput<number>,
    public readonly right: ExpressionInput<number>,
  ) {}

  evaluate(context: ExpressionContext = {}): number {
    const leftValue = Number(evaluateInput(this.left, context));
    const rightValue = Number(evaluateInput(this.right, context));
    switch (this.operator) {
      case "add":
        return leftValue + rightValue;
      case "subtract":
        return leftValue - rightValue;
      case "multiply":
        return leftValue * rightValue;
      case "divide":
        return leftValue / rightValue;
      case "modulo":
        return leftValue % rightValue;
    }
  }
}

export class RelationalExpression implements ExpressionLike<boolean> {
  constructor(
    public readonly operator: RelationalOperator,
    public readonly left: ExpressionInput<unknown>,
    public readonly right: ExpressionInput<unknown>,
  ) {}

  evaluate(context: ExpressionContext = {}): boolean {
    const leftValue = evaluateInput(this.left, context) as string | number | boolean | null | undefined;
    const rightValue = evaluateInput(this.right, context) as string | number | boolean | null | undefined;
    const leftComparable = leftValue as string | number | boolean;
    const rightComparable = rightValue as string | number | boolean;
    switch (this.operator) {
      case "eq":
        return leftValue === rightValue;
      case "ne":
        return leftValue !== rightValue;
      case "lt":
        return leftComparable < rightComparable;
      case "gt":
        return leftComparable > rightComparable;
      case "le":
        return leftComparable <= rightComparable;
      case "ge":
        return leftComparable >= rightComparable;
    }
  }
}

export class LogicalExpression implements ExpressionLike<boolean> {
  constructor(
    public readonly operator: LogicalOperator,
    public readonly left: ExpressionInput<unknown>,
    public readonly right?: ExpressionInput<unknown>,
  ) {}

  evaluate(context: ExpressionContext = {}): boolean {
    switch (this.operator) {
      case "and": {
        const leftValue = Boolean(evaluateInput(this.left, context));
        return leftValue && Boolean(evaluateInput(this.right ?? false, context));
      }
      case "or": {
        const leftValue = Boolean(evaluateInput(this.left, context));
        return leftValue || Boolean(evaluateInput(this.right ?? false, context));
      }
      case "not":
        return !Boolean(evaluateInput(this.left, context));
    }
  }
}

export class StringConcatenation implements ExpressionLike<string> {
  constructor(
    public readonly left: ExpressionInput<unknown>,
    public readonly right: ExpressionInput<unknown>,
  ) {}

  evaluate(context: ExpressionContext = {}): string {
    return `${String(evaluateInput(this.left, context))}${String(evaluateInput(this.right, context))}`;
  }
}

export class FieldAccessExpression implements ExpressionLike<unknown> {
  constructor(
    public readonly target: ExpressionInput<unknown>,
    public readonly fieldName: string,
  ) {}

  evaluate(context: ExpressionContext = {}): unknown {
    const targetValue = evaluateInput(this.target, context);
    if (targetValue === null || targetValue === undefined) {
      throw new TypeError(`cannot access field '${this.fieldName}' on ${targetValue}`);
    }
    return (targetValue as Record<string, unknown>)[this.fieldName];
  }
}

export class MethodCallExpression implements ExpressionLike<unknown> {
  constructor(
    public readonly target: ExpressionInput<unknown> | null,
    public readonly methodName: string,
    public readonly args: readonly ExpressionInput[] = [],
  ) {}

  evaluate(context: ExpressionContext = {}): unknown {
    const receiver = this.target === null ? context.thisValue : evaluateInput(this.target, context);
    if (receiver === null || receiver === undefined) {
      throw new TypeError(`cannot call method '${this.methodName}' on ${receiver}`);
    }
    const method = (receiver as Record<string, unknown>)[this.methodName];
    if (typeof method !== "function") {
      throw new TypeError(`'${this.methodName}' is not a function on the target object`);
    }
    const argValues = this.args.map((arg) => evaluateInput(arg, context));
    return method.apply(receiver, argValues);
  }
}

export function evaluateExpression<T>(expression: ExpressionInput<T>, context: ExpressionContext = {}): T {
  return evaluateInput(expression, context);
}
