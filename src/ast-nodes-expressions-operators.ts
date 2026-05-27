import { AbstractExpression, AbstractNode, Lambda, TypeRef, componentTypeRef, isNamedSimpleTypeRef, simpleTypeRef } from "./ast-nodes-common-core.js";
import { UserMethod } from "./ast-nodes-declarations-runtime.js";
import { Expression } from "./ast-nodes-expressions-union.js";

export class InfixExpression<TValue> extends AbstractExpression {
  readonly type = "BinaryOp" as const;

  constructor(
    public operator: string,
    public left: Expression,
    public right: Expression,
    public operatorValue: TValue | null = null,
  ) {
    super();
    this.attachNode(left);
    this.attachNode(right);
  }

  get leftOperand(): Expression {
    return this.left;
  }

  get rightOperand(): Expression {
    return this.right;
  }

  getLevelOfPrecedence(): number {
    return precedenceForOperator(this.operator);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.left, this.right];
  }
}

function precedenceForOperator(operator: string): number {
  switch (operator) {
    case "||":
      return 3;
    case "&&":
      return 4;
    case "==":
    case "!=":
      return 8;
    case "<":
    case "<=":
    case ">":
    case ">=":
      return 9;
    case "<<":
    case ">>":
    case ">>>":
      return 10;
    case "+":
    case "-":
      return 11;
    case "*":
    case "/":
    case "%":
      return 12;
    default:
      return 0;
  }
}

export class BinaryOpExpression extends InfixExpression<string> {
  constructor(
    operator: string,
    left: Expression,
    right: Expression,
  ) {
    super(operator, left, right, operator);
  }

  override getType(): TypeRef | null {
    if (["<", "<=", ">", ">=", "==", "!=", "&&", "||"].includes(this.operator)) {
      return simpleTypeRef("Boolean");
    }
    const leftType = this.left.getType();
    const rightType = this.right.getType();
    if (this.operator === "+" && (isNamedSimpleTypeRef(leftType, "String")
      || isNamedSimpleTypeRef(rightType, "String"))) {
      return simpleTypeRef("String");
    }
    return leftType ?? rightType;
  }
}

export class ArithmeticInfixExpression extends BinaryOpExpression {
  static readonly OPERATORS = new Set(["+", "-", "*", "/", "%"]);

  constructor(operator: string, left: Expression, right: Expression) {
    super(operator, left, right);
  }

  operate(leftOperand: number, rightOperand: number): number {
    switch (this.operator) {
      case "+": return leftOperand + rightOperand;
      case "-": return leftOperand - rightOperand;
      case "*": return leftOperand * rightOperand;
      case "/": return leftOperand / rightOperand;
      case "%": return leftOperand % rightOperand;
      default:
        throw new Error(`Unsupported arithmetic operator: ${this.operator}`);
    }
  }
}

export class BitwiseInfixExpression extends BinaryOpExpression {
  static readonly OPERATORS = new Set(["&", "|", "^"]);

  operate(leftOperand: number, rightOperand: number): number {
    switch (this.operator) {
      case "&": return leftOperand & rightOperand;
      case "|": return leftOperand | rightOperand;
      case "^": return leftOperand ^ rightOperand;
      default:
        throw new Error(`Unsupported bitwise operator: ${this.operator}`);
    }
  }
}

export class ShiftInfixExpression extends BinaryOpExpression {
  static readonly OPERATORS = new Set(["<<", ">>", ">>>"]);

  operate(leftOperand: number, rightOperand: number): number {
    switch (this.operator) {
      case "<<": return leftOperand << rightOperand;
      case ">>": return leftOperand >> rightOperand;
      case ">>>": return leftOperand >>> rightOperand;
      default:
        throw new Error(`Unsupported shift operator: ${this.operator}`);
    }
  }
}

export class RelationalInfixExpression extends BinaryOpExpression {
  static readonly OPERATORS = new Set(["<", "<=", ">", ">=", "==", "!="]);

  operate(leftOperand: unknown, rightOperand: unknown): boolean {
    switch (this.operator) {
      case "<": return Number(leftOperand) < Number(rightOperand);
      case "<=": return Number(leftOperand) <= Number(rightOperand);
      case ">": return Number(leftOperand) > Number(rightOperand);
      case ">=": return Number(leftOperand) >= Number(rightOperand);
      case "==": return leftOperand === rightOperand;
      case "!=": return leftOperand !== rightOperand;
      default:
        throw new Error(`Unsupported relational operator: ${this.operator}`);
    }
  }

  override getType(): TypeRef {
    return simpleTypeRef("Boolean");
  }
}

export class ConditionalInfixExpression extends BinaryOpExpression {
  static readonly OPERATORS = new Set(["&&", "||"]);

  operate(leftOperand: boolean, rightOperand: boolean): boolean {
    switch (this.operator) {
      case "&&": return leftOperand && rightOperand;
      case "||": return leftOperand || rightOperand;
      default:
        throw new Error(`Unsupported conditional operator: ${this.operator}`);
    }
  }

  override getType(): TypeRef {
    return simpleTypeRef("Boolean");
  }
}

export class StringConcatenation extends BinaryOpExpression {
  constructor(leftOperand: Expression, rightOperand: Expression) {
    super("+", leftOperand, rightOperand);
  }

  override getType(): TypeRef {
    return simpleTypeRef("String");
  }
}

export class UnaryOpExpression extends AbstractExpression {
  readonly type = "UnaryOp" as const;

  constructor(
    public operator: string,
    public operand: Expression,
  ) {
    super();
    this.attachNode(operand);
  }

  override getType(): TypeRef | null {
    return this.operator === "!" ? simpleTypeRef("Boolean") : this.operand.getType();
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.operand];
  }
}

export class LogicalComplement extends UnaryOpExpression {
  constructor(operand: Expression) {
    super("!", operand);
  }

  override getType(): TypeRef {
    return simpleTypeRef("Boolean");
  }
}

export class AssignmentExpression extends AbstractExpression {
  readonly type = "Assignment" as const;
  readonly operator = "=" as const;

  constructor(
    public target: Expression,
    public value: Expression,
  ) {
    super();
    this.attachNode(target);
    this.attachNode(value);
  }

  get leftHandSide(): Expression {
    return this.target;
  }

  get rightHandSide(): Expression {
    return this.value;
  }

  override getType(): TypeRef | null {
    return this.target.getType() ?? this.value.getType();
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.target, this.value];
  }
}

export class ArrayAccessExpression extends AbstractExpression {
  readonly type = "ArrayAccess" as const;

  constructor(
    public target: Expression,
    public index: Expression,
  ) {
    super();
    this.attachNode(target);
    this.attachNode(index);
  }

  get array(): Expression {
    return this.target;
  }

  override getType(): TypeRef | null {
    return componentTypeRef(this.target.getType());
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.target, this.index];
  }
}

export class ArrayAccess extends ArrayAccessExpression {}

export class ArrayLength extends AbstractExpression {
  readonly type = "ArrayLength" as const;

  constructor(public array: Expression) {
    super();
    this.attachNode(array);
  }

  override getType(): TypeRef {
    return simpleTypeRef("WholeNumber");
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.array];
  }
}

export class TypeCastExpression extends AbstractExpression {
  readonly type = "TypeCast" as const;

  constructor(
    public expression: Expression,
    public targetType: TypeRef,
  ) {
    super();
    this.attachNode(expression);
  }

  override getType(): TypeRef {
    return this.targetType;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.expression];
  }
}

export class InstanceOfExpression extends AbstractExpression {
  readonly type = "InstanceOf" as const;

  constructor(
    public expression: Expression,
    public testType: TypeRef,
  ) {
    super();
    this.attachNode(expression);
  }

  override getType(): TypeRef {
    return simpleTypeRef("Boolean");
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.expression];
  }
}

export class ParenthesizedExpression extends AbstractExpression {
  readonly type = "Parenthesized" as const;

  constructor(public expression: Expression) {
    super();
    this.attachNode(expression);
  }

  override getType(): TypeRef | null {
    return this.expression.getType();
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.expression];
  }
}

export class ResourceProperty<T = unknown> {
  constructor(
    private readonly owner: AbstractNode,
    private value: T | null = null,
  ) {
    void owner;
  }

  getValue(): T | null {
    return this.value;
  }

  setValue(value: T | null): void {
    this.value = value;
  }
}

export class ResourceExpression extends AbstractExpression {
  readonly type = "ResourceExpression" as const;
  readonly resourceProperty: ResourceProperty<unknown>;

  constructor(
    public resourceType: TypeRef,
    resource: unknown,
  ) {
    super();
    this.resourceProperty = new ResourceProperty(this, resource);
  }

  get resource(): unknown {
    return this.resourceProperty.getValue();
  }

  override getType(): TypeRef {
    return this.resourceType;
  }
}

export class TypeExpression extends AbstractExpression {
  readonly type = "TypeExpression" as const;

  constructor(public valueType: TypeRef) {
    super();
  }

  override getType(): TypeRef {
    return simpleTypeRef("Type");
  }
}

export class UserLambda extends UserMethod implements Lambda {
  constructor(raw: string) {
    super(raw, { type: "LambdaTypeRef", raw }, [], [], false);
  }
}

export class LambdaExpression extends AbstractExpression {
  readonly type = "LambdaExpression" as const;

  constructor(public value: UserLambda) {
    super();
    this.attachNode(value);
  }

  override getType(): TypeRef {
    return { type: "LambdaTypeRef", raw: this.value.name };
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.value];
  }
}

export class FauxExpression extends AbstractExpression {
  readonly type = "Identifier" as const;

  constructor(public raw: string, private readonly fauxType: TypeRef | null = null) {
    super();
  }

  get name(): string {
    return this.raw;
  }

  override getType(): TypeRef | null {
    return this.fauxType;
  }
}
