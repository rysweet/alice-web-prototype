import {
  AbstractCode,
  AbstractNode,
  BlockStatement,
  CommentStatement,
  ConditionalStatement,
  ConstructorBlockStatement,
  CountLoop,
  CountUpToStatement,
  DisabledBlockStatement,
  DoInOrder,
  DoTogether,
  EachInArrayTogether,
  EachInIterableTogether,
  ExpressionStatement,
  FieldAccess,
  ForEachInArrayLoop,
  ConstructorInvocationStatement,
  ForEachInIterableLoop,
  ForEachLoop,
  LocalDeclarationStatement,
  LocalVariableDeclarationStatement,
  MethodInvocation,
  ReturnStatement,
  StatementWithBody,
  StringLiteral,
  SuperConstructorInvocationStatement,
  SwitchCaseStatement,
  ThisConstructorInvocationStatement,
  TryCatchStatement,
  WhileLoop,
  type Expression,
  type Statement,
} from "./ast-nodes.js";

export interface StatementListLocation {
  list: StatementListModel;
  index: number;
}

export interface DropTarget extends StatementListLocation {
  kind: "insert";
  depth: number;
  label: string;
}

export interface VisualCodeBlock {
  statement: Statement;
  list: StatementListModel;
  index: number;
  depth: number;
  label: string;
  statementType: string;
  enabled: boolean;
  childListCount: number;
}

interface ChildStatementList {
  role: string;
  body: Statement[];
}

function attachToOwner(owner: unknown, node: AbstractNode): void {
  (node as unknown as { setParent(parent: unknown): void }).setParent(owner);
}

function describeExpression(expression: Expression | null): string {
  if (!expression) {
    return "";
  }
  if (expression instanceof StringLiteral) {
    return JSON.stringify(expression.value);
  }
  if ("value" in expression && typeof expression.value !== "object") {
    return String(expression.value);
  }
  if (expression instanceof FieldAccess) {
    return `${describeExpression(expression.target)}.${expression.memberName}`;
  }
  if (expression instanceof MethodInvocation) {
    const target = expression.target ? `${describeExpression(expression.target)}.` : "";
    return `${target}${expression.methodName}(${expression.arguments.map((argument) => describeExpression(argument.value)).join(", ")})`;
  }
  if ("name" in expression && typeof expression.name === "string") {
    return expression.name;
  }
  return expression.type;
}

export function summarizeStatement(statement: Statement): string {
  if (statement instanceof ExpressionStatement) {
    return describeExpression(statement.expression);
  }
  if (statement instanceof LocalVariableDeclarationStatement || statement instanceof LocalDeclarationStatement) {
    return `${statement.isConstant ? "const" : "var"} ${statement.name}: ${statement.varType.type === "SimpleTypeRef" ? statement.varType.name : statement.varType.type}`;
  }
  if (statement instanceof ConditionalStatement) {
    return `if ${describeExpression(statement.condition)}`;
  }
  if (statement instanceof WhileLoop) {
    return `while ${describeExpression(statement.condition)}`;
  }
  if (statement instanceof CountLoop || statement instanceof CountUpToStatement) {
    return `count ${describeExpression(statement.count)}`;
  }
  if (statement instanceof ForEachLoop || statement instanceof ForEachInArrayLoop || statement instanceof ForEachInIterableLoop) {
    return `for each ${statement.itemName} in ${describeExpression(statement.collection)}`;
  }
  if (statement instanceof EachInArrayTogether || statement instanceof EachInIterableTogether) {
    return `together each ${statement.item.name} in ${describeExpression(statement.collection)}`;
  }
  if (statement instanceof ReturnStatement) {
    return statement.expression ? `return ${describeExpression(statement.expression)}` : "return";
  }
  if (statement instanceof CommentStatement) {
    return `// ${statement.text}`;
  }
  if (statement instanceof DisabledBlockStatement) {
    return `disabled: ${statement.raw}`;
  }
  if (statement instanceof DoInOrder) {
    return "do in order";
  }
  if (statement instanceof DoTogether) {
    return "do together";
  }
  if (statement instanceof TryCatchStatement) {
    return `try / catch ${statement.catchVariable}`;
  }
  if (statement instanceof SwitchCaseStatement) {
    return `switch ${describeExpression(statement.expression)}`;
  }
  if (statement instanceof BlockStatement) {
    return "block";
  }
  if (statement instanceof ThisConstructorInvocationStatement) {
    return "this(...)";
  }
  if (statement instanceof SuperConstructorInvocationStatement) {
    return "super(...)";
  }
  return statement.type;
}

function getChildLists(statement: Statement): ChildStatementList[] {
  if (statement instanceof ConditionalStatement) {
    return [
      { role: "if", body: statement.ifBody },
      ...(statement.elseBody ? [{ role: "else", body: statement.elseBody }] : []),
    ];
  }
  if (statement instanceof TryCatchStatement) {
    return [
      { role: "try", body: statement.tryBody },
      { role: "catch", body: statement.catchBody },
    ];
  }
  if (statement instanceof SwitchCaseStatement) {
    return [
      ...statement.cases.map((switchCase, index) => ({ role: `case:${index}`, body: switchCase.body })),
      ...(statement.defaultCase ? [{ role: "default", body: statement.defaultCase }] : []),
    ];
  }
  if (statement instanceof ConstructorBlockStatement) {
    return [{ role: "body", body: statement.body }];
  }
  if ("body" in statement && Array.isArray((statement as StatementWithBody).body)) {
    return [{ role: "body", body: (statement as StatementWithBody).body }];
  }
  return [];
}

export class StatementListModel {
  constructor(
    public readonly owner: AbstractCode | Statement | null,
    readonly statements: Statement[],
    public readonly role = "body",
    public readonly depth = 0,
    public readonly parentList: StatementListModel | null = null,
    public readonly parentStatement: Statement | null = null,
  ) {}

  list(): Statement[] {
    return [...this.statements];
  }

  get length(): number {
    return this.statements.length;
  }

  at(index: number): Statement {
    if (index < 0 || index >= this.statements.length) {
      throw new RangeError(`statement index ${index} is out of bounds`);
    }
    return this.statements[index];
  }

  insert(index: number, statement: Statement): number {
    assertEditableStatement(statement);
    const normalizedIndex = clampIndex(index, this.statements.length);
    attachToOwner(this.owner, statement);
    this.statements.splice(normalizedIndex, 0, statement);
    return normalizedIndex;
  }

  append(statement: Statement): number {
    return this.insert(this.statements.length, statement);
  }

  remove(index: number): Statement {
    this.at(index);
    const [removed] = this.statements.splice(index, 1);
    return removed;
  }

  reorder(fromIndex: number, toIndex: number): number {
    const statement = this.remove(fromIndex);
    const normalizedTarget = fromIndex < toIndex ? toIndex - 1 : toIndex;
    return this.insert(normalizedTarget, statement);
  }

  createDropTargets(): DropTarget[] {
    const targets: DropTarget[] = [];
    for (let index = 0; index <= this.statements.length; index += 1) {
      targets.push({
        kind: "insert",
        list: this,
        index,
        depth: this.depth,
        label: `${this.role}@${index}`,
      });
    }
    return targets;
  }
}

function clampIndex(index: number, max: number): number {
  return Math.max(0, Math.min(index, max));
}

function getBodyStatements(owner: AbstractCode | BlockStatement): Statement[] {
  return (owner as BlockStatement & { body: Statement[] }).body;
}

function assertEditableStatement(statement: Statement): void {
  if (statement instanceof ConstructorInvocationStatement) {
    throw new TypeError("constructor invocations are pinned to constructor headers; use setLeadingConstructorInvocation()");
  }
}

export class CodeEditor {
  readonly rootList: StatementListModel;

  constructor(public readonly code: AbstractCode | BlockStatement) {
    this.rootList = new StatementListModel(code, getBodyStatements(code), "body", 0, null, null);
  }

  getLeadingConstructorInvocation(): ConstructorInvocationStatement | null {
    return this.code instanceof ConstructorBlockStatement ? this.code.constructorInvocationStatement : null;
  }

  setLeadingConstructorInvocation(invocation: ConstructorInvocationStatement): void {
    if (!(this.code instanceof ConstructorBlockStatement)) {
      throw new TypeError("leading constructor invocations can only be set on constructor bodies");
    }
    attachToOwner(this.code, invocation);
    this.code.constructorInvocationStatement = invocation;
  }

  getStatementLists(): StatementListModel[] {
    const results: StatementListModel[] = [];
    const visit = (list: StatementListModel): void => {
      results.push(list);
      for (const statement of list.list()) {
        for (const child of getChildLists(statement)) {
          visit(new StatementListModel(statement, child.body, child.role, list.depth + 1, list, statement));
        }
      }
    };
    visit(this.rootList);
    return results;
  }

  getVisualBlocks(): VisualCodeBlock[] {
    const blocks: VisualCodeBlock[] = [];
    const visit = (list: StatementListModel): void => {
      list.list().forEach((statement, index) => {
        const childLists = getChildLists(statement);
        blocks.push({
          statement,
          list,
          index,
          depth: list.depth,
          label: summarizeStatement(statement),
          statementType: statement.type,
          enabled: statement.isEnabled,
          childListCount: childLists.length,
        });
        for (const child of childLists) {
          visit(new StatementListModel(statement, child.body, child.role, list.depth + 1, list, statement));
        }
      });
    };
    visit(this.rootList);
    return blocks;
  }

  getDropTargets(): DropTarget[] {
    return this.getStatementLists().flatMap((list) => list.createDropTargets());
  }

  insertStatement(target: StatementListLocation, statement: Statement): number {
    this.ensureSafeInsertion(statement, target.list);
    return target.list.insert(target.index, statement);
  }

  removeStatement(source: StatementListLocation): Statement {
    return source.list.remove(source.index);
  }

  moveStatement(source: StatementListLocation, target: StatementListLocation): Statement {
    const statement = source.list.at(source.index);
    this.ensureSafeInsertion(statement, target.list);
    source.list.remove(source.index);
    const normalizedIndex = source.list === target.list && source.index < target.index
      ? target.index - 1
      : target.index;
    target.list.insert(normalizedIndex, statement);
    return statement;
  }

  createBodyModel(method: AbstractCode | BlockStatement): StatementListModel {
    return new StatementListModel(method, getBodyStatements(method), "body");
  }

  private ensureSafeInsertion(statement: Statement, targetList: StatementListModel): void {
    let current: StatementListModel | null = targetList;
    while (current) {
      if (current.parentStatement === statement) {
        throw new TypeError("cannot drop a statement into one of its descendant bodies");
      }
      current = current.parentList;
    }
  }
}
