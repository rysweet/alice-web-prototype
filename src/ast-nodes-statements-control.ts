import { AbstractNode, AbstractStatement, StatementWithBody, TypeRef } from "./ast-nodes-common-core.js";
import { UserLocal, registerDeclarationBaseTypes } from "./ast-nodes-declarations-base.js";
import { AbstractCode } from "./ast-nodes-declarations-runtime.js";
import { Expression } from "./ast-nodes-expressions-union.js";
import { BlockStatement } from "./ast-nodes-statements-blocks.js";
import { Statement } from "./ast-nodes-statements-union.js";

export abstract class AbstractStatementWithBody extends AbstractStatement implements StatementWithBody {
  constructor(public body: Statement[]) {
    super();
    this.attachNodes(body);
  }

  override containsAtLeastOneEnabledReturnStatement(): boolean {
    return this.isEnabled && this.body.some((statement) => statement.containsAtLeastOneEnabledReturnStatement());
  }

  override containsUnreachableCode(): boolean {
    return this.isEnabled && this.body.some((statement) => statement.containsUnreachableCode());
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.body];
  }
}

export class DoInOrder extends AbstractStatementWithBody {
  readonly type = "DoInOrder" as const;
}

export class DoInOrderStatement extends DoInOrder {}

export class DoTogether extends AbstractStatementWithBody {
  readonly type = "DoTogether" as const;
}

export class DoTogetherStatement extends DoTogether {}

export class BooleanExpressionBodyPair extends AbstractNode {
  constructor(
    public expression: Expression,
    public bodyBlock: BlockStatement,
  ) {
    super();
    this.attachNode(expression);
    this.attachNode(bodyBlock);
  }

  get body(): Statement[] {
    return this.bodyBlock.body;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.expression, this.bodyBlock];
  }
}

export class ConditionalStatement extends AbstractStatement {
  readonly type = "IfElse" as const;
  readonly booleanExpressionBodyPairs: BooleanExpressionBodyPair[];

  constructor(
    public condition: Expression,
    public ifBody: Statement[],
    public elseBody: Statement[] | null,
  ) {
    super();
    this.booleanExpressionBodyPairs = [new BooleanExpressionBodyPair(condition, new BlockStatement(ifBody))];
    this.attachNode(condition);
    this.attachNodes(ifBody);
    if (elseBody) {
      this.attachNodes(elseBody);
    }
    this.attachNodes(this.booleanExpressionBodyPairs);
  }

  get elseBodyBlock(): BlockStatement | null {
    return this.elseBody ? new BlockStatement(this.elseBody) : null;
  }

  override containsAtLeastOneEnabledReturnStatement(): boolean {
    if (!this.isEnabled) {
      return false;
    }
    return this.ifBody.some((statement) => statement.containsAtLeastOneEnabledReturnStatement())
      || (this.elseBody?.some((statement) => statement.containsAtLeastOneEnabledReturnStatement()) ?? false);
  }

  override containsAReturnForEveryPath(): boolean {
    if (!this.isEnabled || this.elseBody === null) {
      return false;
    }
    return this.ifBody.some((statement) => statement.containsAReturnForEveryPath())
      && this.elseBody.some((statement) => statement.containsAReturnForEveryPath());
  }

  override containsUnreachableCode(): boolean {
    if (!this.isEnabled) {
      return false;
    }
    return this.ifBody.some((statement) => statement.containsUnreachableCode())
      || (this.elseBody?.some((statement) => statement.containsUnreachableCode()) ?? false);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.condition, ...this.ifBody, ...(this.elseBody ?? [])];
  }
}

export abstract class AbstractLoop extends AbstractStatementWithBody {
  generateLocalName(local: UserLocal): string {
    return local.isFinal ? this.getConstantName() : this.getVariableName();
  }

  getVariableName(): string {
    return `index${this.getDepthSuffix()}`;
  }

  protected getConstantName(): string {
    return `COUNT_${this.getDepthSuffix()}`;
  }

  protected getDepthSuffix(): string {
    const code = this.getFirstAncestorAssignableTo(AbstractCode);
    if (!code) {
      return "_";
    }
    let index = 0;
    code.traverse((node) => {
      if (node instanceof AbstractLoop && node !== this) {
        index += 1;
      }
    });
    return String.fromCharCode("A".charCodeAt(0) + index);
  }
}

export class CountLoop extends AbstractLoop {
  readonly type: string = "CountLoop";

  constructor(
    public variable: UserLocal | null,
    public constant: UserLocal | null,
    public count: Expression,
    body: Statement[],
  ) {
    super(body);
    this.attachNode(variable);
    this.attachNode(constant);
    this.attachNode(count);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [
      ...(this.variable ? [this.variable] : []),
      ...(this.constant ? [this.constant] : []),
      this.count,
      ...this.body,
    ];
  }
}

export class CountUpToStatement extends CountLoop {
  override readonly type = "CountUpTo" as const;

  constructor(
    count: Expression,
    body: Statement[],
  ) {
    super(null, null, count, body);
  }
}

export abstract class AbstractForEachLoop extends AbstractLoop {
  constructor(
    public item: UserLocal,
    public collection: Expression,
    body: Statement[],
  ) {
    super(body);
    this.attachNode(item);
    this.attachNode(collection);
  }

  get itemType(): TypeRef {
    return this.item.valueType;
  }

  get itemName(): string {
    return this.item.name;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.item, this.collection, ...this.body];
  }
}

export class ForEachInArrayLoop extends AbstractForEachLoop {
  readonly type: string = "ForEachInArrayLoop";

  constructor(itemType: TypeRef, itemName: string, collection: Expression, body: Statement[]) {
    super(new UserLocal(itemName, itemType, false), collection, body);
  }
}

export class ForEachInIterableLoop extends AbstractForEachLoop {
  readonly type = "ForEachInIterableLoop" as const;

  constructor(itemType: TypeRef, itemName: string, collection: Expression, body: Statement[]) {
    super(new UserLocal(itemName, itemType, false), collection, body);
  }
}

export class ForEachLoop extends ForEachInArrayLoop {
  override readonly type = "ForEach" as const;
}

export abstract class AbstractEachInTogether extends AbstractStatementWithBody {
  constructor(
    public item: UserLocal,
    public collection: Expression,
    body: Statement[],
  ) {
    super(body);
    this.attachNode(item);
    this.attachNode(collection);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.item, this.collection, ...this.body];
  }
}

export class EachInArrayTogether extends AbstractEachInTogether {
  readonly type = "EachInArrayTogether" as const;

  constructor(itemType: TypeRef, itemName: string, array: Expression, body: Statement[]) {
    super(new UserLocal(itemName, itemType, false), array, body);
  }
}

export class EachInIterableTogether extends AbstractEachInTogether {
  readonly type = "EachInIterableTogether" as const;

  constructor(itemType: TypeRef, itemName: string, iterable: Expression, body: Statement[]) {
    super(new UserLocal(itemName, itemType, false), iterable, body);
  }
}

export interface EachInStatement extends StatementWithBody {
  collection: Expression;
}

export interface EachInArrayStatement extends EachInStatement {}

export interface EachInIterableStatement extends EachInStatement {}

export class WhileLoop extends AbstractLoop {
  readonly type = "WhileLoop" as const;

  constructor(
    public condition: Expression,
    body: Statement[],
  ) {
    super(body);
    this.attachNode(condition);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [this.condition, ...this.body];
  }
}

export class WhileLoopStatement extends WhileLoop {}

registerDeclarationBaseTypes({
  abstractLoop: AbstractLoop,
});
