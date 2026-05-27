import { AbstractArgument, AbstractNode, AbstractStatement, ArgumentInput, JavaKeyedArgument, SimpleArgument, TypeRef, toArgument } from "./ast-nodes-common-core.js";
import { UserLocal } from "./ast-nodes-declarations-base.js";
import { AbstractConstructor } from "./ast-nodes-declarations-runtime.js";
import { Expression } from "./ast-nodes-expressions-union.js";
import { Statement } from "./ast-nodes-statements-union.js";

export class TryCatchStatement extends AbstractStatement {
  readonly type = "TryCatch" as const;

  constructor(
    public tryBody: Statement[],
    public catchType: TypeRef,
    public catchVariable: string,
    public catchBody: Statement[],
  ) {
    super();
    this.attachNodes(tryBody);
    this.attachNodes(catchBody);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.tryBody, ...this.catchBody];
  }
}

export class SwitchCaseStatement extends AbstractStatement {
  readonly type = "SwitchCase" as const;

  constructor(
    public expression: Expression,
    public cases: Array<{ value: Expression; body: Statement[] }>,
    public defaultCase: Statement[] | null,
  ) {
    super();
    this.attachNode(expression);
    for (const switchCase of cases) {
      this.attachNode(switchCase.value);
      this.attachNodes(switchCase.body);
    }
    if (defaultCase) {
      this.attachNodes(defaultCase);
    }
  }

  protected override getChildNodes(): AbstractNode[] {
    return [
      this.expression,
      ...this.cases.flatMap((switchCase) => [switchCase.value, ...switchCase.body]),
      ...(this.defaultCase ?? []),
    ];
  }
}

export class ReturnStatement extends AbstractStatement {
  readonly type = "Return" as const;

  constructor(
    public expression: Expression | null,
    public expressionType: TypeRef | null = expression?.getType() ?? null,
  ) {
    super();
    this.attachNode(expression);
  }

  override containsAtLeastOneEnabledReturnStatement(): boolean {
    return this.isEnabled;
  }

  override containsAReturnForEveryPath(): boolean {
    return this.isEnabled;
  }

  protected override getChildNodes(): AbstractNode[] {
    return this.expression ? [this.expression] : [];
  }
}

export class ExpressionStatement extends AbstractStatement {
  readonly type = "ExpressionStatement" as const;

  constructor(public expression: Expression) {
    super();
    this.attachNode(expression);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.expression];
  }
}

export class LocalDeclarationStatement extends AbstractStatement {
  readonly type: string = "LocalDeclarationStatement";

  constructor(
    public local: UserLocal,
    public initializer: Expression,
    public isConstant = local.isFinal,
  ) {
    super();
    this.attachNode(local);
    this.attachNode(initializer);
  }

  get name(): string {
    return this.local.name;
  }

  get varType(): TypeRef {
    return this.local.valueType;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.local, this.initializer];
  }
}

export class LocalVariableDeclarationStatement extends LocalDeclarationStatement {
  override readonly type = "LocalVariableDeclaration" as const;

  constructor(
    name: string,
    varType: TypeRef,
    initializer: Expression,
    isConstant: boolean,
  ) {
    super(new UserLocal(name, varType, isConstant), initializer, isConstant);
  }
}

export class BlockStatement extends AbstractStatement {
  readonly type: string = "Block";

  constructor(public body: Statement[]) {
    super();
    this.attachNodes(body);
  }

  override containsAtLeastOneEnabledReturnStatement(): boolean {
    if (!this.isEnabled) {
      return false;
    }
    return this.body.some((statement) => statement.containsAtLeastOneEnabledReturnStatement());
  }

  override containsAReturnForEveryPath(): boolean {
    if (!this.isEnabled) {
      return false;
    }
    return this.body.some((statement) => statement.containsAReturnForEveryPath());
  }

  override containsUnreachableCode(): boolean {
    if (!this.isEnabled) {
      return false;
    }
    let foundEnabledCodeAtEnd = false;
    for (let i = this.body.length - 1; i >= 0; i -= 1) {
      const statement = this.body[i];
      if (statement.containsUnreachableCode()) {
        return true;
      }
      if (foundEnabledCodeAtEnd) {
        if (statement.containsAReturnForEveryPath()) {
          return true;
        }
      } else {
        foundEnabledCodeAtEnd = statement.isEnabledNonComment();
      }
    }
    return false;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.body];
  }
}

export class ConstructorInvocationStatement extends AbstractStatement {
  readonly type: string = "ConstructorInvocationStatement";
  readonly requiredArguments: SimpleArgument[];
  readonly variableArguments: SimpleArgument[];
  readonly keyedArguments: JavaKeyedArgument[];

  constructor(
    public constructorDeclaration: AbstractConstructor | null,
    requiredArguments: ArgumentInput[] = [],
    variableArguments: ArgumentInput[] = [],
    keyedArguments: ArgumentInput[] = [],
  ) {
    super();
    this.requiredArguments = requiredArguments.map(toArgument).map((argument) => argument as SimpleArgument);
    this.variableArguments = variableArguments.map(toArgument).map((argument) => argument as SimpleArgument);
    this.keyedArguments = keyedArguments.map(toArgument).map((argument) => argument as JavaKeyedArgument);
    this.attachNode(constructorDeclaration);
    this.attachNodes(this.requiredArguments);
    this.attachNodes(this.variableArguments);
    this.attachNodes(this.keyedArguments);
    for (const argument of this.arguments) {
      this.attachNode(argument.value);
    }
  }

  get arguments(): AbstractArgument[] {
    return [...this.requiredArguments, ...this.variableArguments, ...this.keyedArguments];
  }

  protected override getChildNodes(): AbstractNode[] {
    return [
      ...(this.constructorDeclaration ? [this.constructorDeclaration] : []),
      ...this.arguments.map((argument) => argument.value),
    ];
  }
}

export class ThisConstructorInvocationStatement extends ConstructorInvocationStatement {
  override readonly type = "ThisConstructorInvocationStatement" as const;
}

export class SuperConstructorInvocationStatement extends ConstructorInvocationStatement {
  override readonly type = "SuperConstructorInvocationStatement" as const;
}

export class ConstructorBlockStatement extends BlockStatement {
  override readonly type = "ConstructorBlockStatement" as const;

  constructor(
    public constructorInvocationStatement: ConstructorInvocationStatement = new SuperConstructorInvocationStatement(null),
    body: Statement[] = [],
  ) {
    super(body);
    this.attachNode(constructorInvocationStatement);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.constructorInvocationStatement, ...this.body];
  }
}

export class DisabledBlockStatement extends AbstractStatement {
  readonly type = "DisabledBlock" as const;

  constructor(public raw: string) {
    super();
  }
}

export class CommentStatement extends AbstractStatement {
  readonly type = "Comment" as const;

  constructor(public text: string) {
    super();
  }

  override isEnabledNonComment(): boolean {
    return false;
  }
}
