import { AbstractArgument, AbstractExpression, AbstractNode, ArgumentInput, ArgumentOwner, TypeRef, arrayTypeRef, inferLiteralTypeRef, simpleTypeRef, toArgument, typeRefsAssignable } from "./ast-nodes-common-core.js";
import { UserLocal, UserParameter } from "./ast-nodes-declarations-base.js";
import { AbstractConstructor, AbstractField, AbstractMethod } from "./ast-nodes-declarations-runtime.js";
import { Expression } from "./ast-nodes-expressions-union.js";
import { CommentStatement } from "./ast-nodes-statements-blocks.js";

export class Comment extends CommentStatement {}

abstract class AbstractLiteral<TValue> extends AbstractExpression {
  readonly type = "Literal" as const;

  constructor(
    public value: TValue,
    public literalType: "number" | "string" | "boolean" | "null",
  ) {
    super();
  }

  getValue(): TValue {
    return this.value;
  }

  override getType(): TypeRef | null {
    return inferLiteralTypeRef(this.literalType, typeof this.value === "number" ? this.value : undefined);
  }
}

export class IntegerLiteral extends AbstractLiteral<number> {
  constructor(value: number) {
    super(value, "number");
  }

  override getType(): TypeRef {
    return simpleTypeRef("WholeNumber");
  }
}

export class DoubleLiteral extends AbstractLiteral<number> {
  constructor(value: number) {
    super(value, "number");
  }

  override getType(): TypeRef {
    return simpleTypeRef("DecimalNumber");
  }
}

export class FloatLiteral extends DoubleLiteral {}

export class StringLiteral extends AbstractLiteral<string> {
  constructor(value: string) {
    super(value, "string");
  }
}

export class BooleanLiteral extends AbstractLiteral<boolean> {
  constructor(value: boolean) {
    super(value, "boolean");
  }
}

export class NullLiteral extends AbstractLiteral<null> {
  constructor() {
    super(null, "null");
  }
}

export class TypeLiteral extends AbstractExpression {
  readonly type = "TypeLiteral" as const;

  constructor(public valueType: TypeRef) {
    super();
  }

  override getType(): TypeRef {
    return simpleTypeRef("Type");
  }
}

export class ThisExpression extends AbstractExpression {
  readonly type = "This" as const;

  constructor(public currentType: TypeRef | null = null) {
    super();
  }

  override getType(): TypeRef | null {
    return this.currentType;
  }
}

export class SuperExpression extends AbstractExpression {
  readonly type = "Super" as const;

  constructor(public currentType: TypeRef | null = null) {
    super();
  }

  override getType(): TypeRef | null {
    return this.currentType;
  }
}

export class IdentifierExpression extends AbstractExpression {
  readonly type = "Identifier" as const;

  constructor(public name: string) {
    super();
  }
}

export class LocalAccess extends IdentifierExpression {
  readonly local: UserLocal;

  constructor(local: UserLocal | string, valueType: TypeRef = simpleTypeRef("Object")) {
    super(typeof local === "string" ? local : local.name);
    this.local = typeof local === "string" ? new UserLocal(local, valueType, false) : local;
    this.attachNode(this.local);
  }

  override getType(): TypeRef {
    return this.local.valueType;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.local];
  }
}

export class ParameterAccess extends IdentifierExpression {
  readonly parameter: UserParameter;

  constructor(parameter: UserParameter | string, valueType: TypeRef = simpleTypeRef("Object")) {
    super(typeof parameter === "string" ? parameter : parameter.name);
    this.parameter = typeof parameter === "string"
      ? new UserParameter(parameter, valueType)
      : parameter;
    this.attachNode(this.parameter);
  }

  override getType(): TypeRef {
    return this.parameter.paramType;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.parameter];
  }
}

export class FieldAccess extends AbstractExpression {
  readonly type = "MemberAccess" as const;

  constructor(
    public target: Expression,
    public memberName: string,
    public field: AbstractField | null = null,
  ) {
    super();
    this.attachNode(target);
    this.attachNode(field);
  }

  override getType(): TypeRef | null {
    return this.field?.fieldType ?? null;
  }

  override isValid(): boolean {
    const targetType = this.target.getType();
    return this.field === null || targetType === null || typeRefsAssignable(this.field.fieldType, this.getType());
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...(this.field ? [this.field] : []), this.target];
  }
}

export class MethodInvocation extends AbstractExpression implements ArgumentOwner {
  readonly type = "MethodInvocation" as const;
  #arguments: AbstractArgument[];

  constructor(
    public target: Expression | null,
    public methodName: string,
    args: ArgumentInput[],
    public method: AbstractMethod | null = null,
  ) {
    super();
    this.#arguments = args.map(toArgument);
    this.attachNode(target);
    this.attachNode(method);
    this.attachNodes(this.#arguments);
    for (const argument of this.#arguments) {
      this.attachNode(argument.value);
    }
  }

  get arguments(): AbstractArgument[] {
    return [...this.#arguments];
  }

  override getType(): TypeRef | null {
    return this.method?.returnType ?? null;
  }

  override isValid(): boolean {
    if (!this.method || !this.target) {
      return true;
    }
    return typeRefsAssignable(this.method.getDeclaringType()?.toTypeRef() ?? null, this.target.getType());
  }

  protected override getChildNodes(): AbstractNode[] {
    return [
      ...(this.target ? [this.target] : []),
      ...(this.method ? [this.method] : []),
      ...this.#arguments.map((argument) => argument.value),
    ];
  }
}

export class InstanceCreation extends AbstractExpression implements ArgumentOwner {
  readonly type: string = "InstanceCreation";
  readonly requiredArguments: AbstractArgument[];

  constructor(
    public className: string,
    args: ArgumentInput[],
    public constructorDeclaration: AbstractConstructor | null = null,
  ) {
    super();
    this.requiredArguments = args.map(toArgument);
    this.attachNode(constructorDeclaration);
    this.attachNodes(this.requiredArguments);
    for (const argument of this.requiredArguments) {
      this.attachNode(argument.value);
    }
  }

  get arguments(): AbstractArgument[] {
    return [...this.requiredArguments];
  }

  override getType(): TypeRef {
    return simpleTypeRef(this.className);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [
      ...(this.constructorDeclaration ? [this.constructorDeclaration] : []),
      ...this.requiredArguments.map((argument) => argument.value),
    ];
  }
}

export class NewInstanceExpression extends InstanceCreation {
  override readonly type = "NewInstance" as const;
}

export class NewArrayExpression extends AbstractExpression {
  readonly type = "NewArray" as const;

  constructor(
    public elementType: TypeRef,
    public elements: Expression[],
    public size: Expression | null,
  ) {
    super();
    this.attachNodes(elements);
    this.attachNode(size);
  }

  override getType(): TypeRef {
    return arrayTypeRef(this.elementType);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.elements, ...(this.size ? [this.size] : [])];
  }
}

export class ArrayInstanceCreation extends NewArrayExpression {
  readonly lengths: number[];

  constructor(
    elementType: TypeRef,
    elements: Expression[],
    size: Expression | null,
    lengths: number[] = size === null ? [] : [0],
  ) {
    super(elementType, elements, size);
    this.lengths = [...lengths];
  }
}

export class ArrayLiteralExpression extends AbstractExpression {
  readonly type = "ArrayLiteral" as const;

  constructor(public elements: Expression[]) {
    super();
    this.attachNodes(elements);
  }

  override getType(): TypeRef | null {
    const first = this.elements[0]?.getType();
    return first ? arrayTypeRef(first) : null;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.elements];
  }
}
