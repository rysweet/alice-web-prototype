import { typeRefsAssignable as canonicalTypeRefsAssignable } from "./type-system.js";
import type { ClassDeclaration, NamedUserType } from "./ast-nodes-declarations-types.js";
import type { Expression } from "./ast-nodes-expressions-union.js";
import type { Statement } from "./ast-nodes-statements-union.js";

let nextAstNodeId = 0;

export type TypeRef =
  | { type: "SimpleTypeRef"; name: string; isArray: boolean }
  | { type: "VoidTypeRef" }
  | { type: "LambdaTypeRef"; raw: string };

export enum AccessLevel {
  PRIVATE = "private",
  PACKAGE = "package",
  PROTECTED = "protected",
  PUBLIC = "public",
}

export enum ManagementLevel {
  NONE = "none",
  MANAGED = "managed",
}

export enum FieldModifierFinalVolatileOrNeither {
  FINAL = "final",
  VOLATILE = "volatile",
  NEITHER = "neither",
}

export enum TypeModifierFinalAbstractOrNeither {
  FINAL = "final",
  ABSTRACT = "abstract",
  NEITHER = "neither",
}

export interface AstVisitor<TResult = void> {
  visitNode?(node: AbstractNode): TResult;
  [key: string]: ((node: never) => TResult) | undefined;
}

export function simpleTypeRef(name: string, isArray = false): TypeRef {
  return { type: "SimpleTypeRef", name, isArray };
}

export function typeRefName(typeRef: TypeRef | null): string | null {
  if (!typeRef) {
    return null;
  }
  switch (typeRef.type) {
    case "SimpleTypeRef":
      return typeRef.name;
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return typeRef.raw;
  }
}

export function isNamedSimpleTypeRef(typeRef: TypeRef | null, name: string): boolean {
  return typeRef?.type === "SimpleTypeRef" && typeRef.name === name;
}

export function componentTypeRef(typeRef: TypeRef | null): TypeRef | null {
  if (!typeRef || typeRef.type !== "SimpleTypeRef" || !typeRef.isArray) {
    return null;
  }
  return { ...typeRef, isArray: false };
}

export function arrayTypeRef(typeRef: TypeRef): TypeRef {
  if (typeRef.type !== "SimpleTypeRef") {
    return typeRef;
  }
  return { ...typeRef, isArray: true };
}

function isNumericTypeName(name: string | null): boolean {
  return name !== null && [
    "Number",
    "WholeNumber",
    "Integer",
    "Long",
    "Short",
    "Byte",
    "DecimalNumber",
    "Double",
    "Float",
  ].includes(name);
}

export function typeRefsAssignable(expected: TypeRef | null, actual: TypeRef | null): boolean {
  return canonicalTypeRefsAssignable(expected, actual);
}

export function inferLiteralTypeRef(literalType: "number" | "string" | "boolean" | "null", value?: number): TypeRef | null {
  switch (literalType) {
    case "number":
      return Number.isInteger(value) ? simpleTypeRef("WholeNumber") : simpleTypeRef("DecimalNumber");
    case "string":
      return simpleTypeRef("String");
    case "boolean":
      return simpleTypeRef("Boolean");
    case "null":
      return null;
  }
}

export abstract class AbstractNode {
  #id = `ast-${nextAstNodeId++}`;
  #parent: AbstractNode | null = null;

  get id(): string {
    return this.#id;
  }

  get parent(): AbstractNode | null {
    return this.#parent;
  }

  setParent(parent: AbstractNode | null): void {
    this.#parent = parent;
  }

  protected attachNode<T extends AbstractNode | null>(node: T): T {
    if (node) {
      node.setParent(this);
    }
    return node;
  }

  protected attachNodes<T extends AbstractNode>(nodes: readonly T[]): readonly T[] {
    for (const node of nodes) {
      node.setParent(this);
    }
    return nodes;
  }

  getRoot(): AbstractNode {
    let current: AbstractNode = this;
    while (current.parent) {
      current = current.parent;
    }
    return current;
  }

  getFirstAncestorAssignableTo<T extends AbstractNode>(
    ctor: abstract new (...args: never[]) => T,
    includeSelf = false,
  ): T | null {
    let current: AbstractNode | null = includeSelf ? this : this.parent;
    while (current) {
      if (current instanceof ctor) {
        return current;
      }
      current = current.parent;
    }
    return null;
  }

  accept<TResult = void>(visitor: AstVisitor<TResult>): TResult | undefined {
    const specific = visitor[`visit${this.constructor.name}`] as ((node: this) => TResult) | undefined;
    return specific ? specific(this) : visitor.visitNode?.(this);
  }

  traverse(visitor: (node: AbstractNode) => void): void {
    visitor(this);
    for (const child of this.getChildNodes()) {
      child.traverse(visitor);
    }
  }

  protected getChildNodes(): AbstractNode[] {
    return [];
  }
}

function isNodeArrayEntry<T extends AbstractNode>(value: T | readonly T[]): value is readonly T[] {
  return Array.isArray(value);
}

export class NodeProperty<T extends AbstractNode | null> {
  #value: T;

  constructor(
    protected readonly owner: AbstractNode,
    value: T = null as T,
  ) {
    this.#value = value;
    this.attach(value);
  }

  protected attach(value: T): void {
    if (value) {
      value.setParent(this.owner);
    }
  }

  getValue(): T {
    return this.#value;
  }

  setValue(value: T): T {
    this.#value = value;
    this.attach(value);
    return value;
  }
}

export class NodeListProperty<T extends AbstractNode> implements Iterable<T> {
  readonly #values: T[] = [];

  constructor(protected readonly owner: AbstractNode) {}

  add(...values: Array<T | readonly T[]>): void {
    for (const entry of values) {
      if (isNodeArrayEntry(entry)) {
        this.add(...entry);
      } else {
        entry.setParent(this.owner);
        this.#values.push(entry);
      }
    }
  }

  getValue(): T[] {
    return [...this.#values];
  }

  get(index: number): T {
    return this.#values[index];
  }

  size(): number {
    return this.#values.length;
  }

  map<TResult>(mapper: (value: T, index: number) => TResult): TResult[] {
    return this.#values.map(mapper);
  }

  [Symbol.iterator](): Iterator<T> {
    return this.#values[Symbol.iterator]();
  }
}

export class DeclarationProperty<T> {
  #value: T | null;

  constructor(
    protected readonly owner: AbstractNode,
    value: T | null = null,
    readonly isReference = false,
  ) {
    this.#value = value;
    this.attach(value);
  }

  static createReferenceInstance<T>(owner: AbstractNode): DeclarationProperty<T> {
    return new DeclarationProperty<T>(owner, null, true);
  }

  protected attach(value: T | null): void {
    if (!this.isReference && value instanceof AbstractNode) {
      value.setParent(this.owner);
    }
  }

  getValue(): T | null {
    return this.#value;
  }

  setValue(value: T | null): T | null {
    this.#value = value;
    this.attach(value);
    return value;
  }
}

export class ExpressionProperty extends NodeProperty<Expression | null> {
  constructor(
    owner: AbstractNode,
    private readonly expressionTypeGetter: () => TypeRef | null = () => null,
    value: Expression | null = null,
  ) {
    super(owner, value);
  }

  getExpressionType(): TypeRef | null {
    return this.expressionTypeGetter();
  }
}

export class ExpressionListProperty extends NodeListProperty<Expression> {}

export class StatementListProperty extends NodeListProperty<Statement> {}

export abstract class AbstractArgument extends AbstractNode {
  #value: Expression;

  constructor(
    public name: string | null,
    value: Expression,
  ) {
    super();
    this.#value = value;
  }

  get value(): Expression {
    return this.#value;
  }

  getType(): TypeRef | null {
    return this.#value.getType();
  }

  protected override getChildNodes(): AbstractNode[] {
    return [];
  }
}

export class SimpleArgument extends AbstractArgument {}

export class JavaKeyedArgument extends AbstractArgument {}

export type Argument = AbstractArgument | { name: string | null; value: Expression };

export type ArgumentInput = Argument;

export function toArgument(argument: ArgumentInput): AbstractArgument {
  if (argument instanceof AbstractArgument) {
    return argument;
  }
  return argument.name === null
    ? new SimpleArgument(argument.name, argument.value)
    : new JavaKeyedArgument(argument.name, argument.value);
}

export class ArgumentListProperty<T extends AbstractArgument> extends NodeListProperty<T> {}

export class SimpleArgumentListProperty extends ArgumentListProperty<SimpleArgument> {}

export class KeyedArgumentListProperty extends ArgumentListProperty<JavaKeyedArgument> {}

export abstract class AbstractStatement extends AbstractNode {
  abstract readonly type: string;
  isEnabled = true;

  containsAtLeastOneEnabledReturnStatement(): boolean {
    return false;
  }

  containsAReturnForEveryPath(): boolean {
    return false;
  }

  containsUnreachableCode(): boolean {
    return false;
  }

  isEnabledNonComment(): boolean {
    return this.isEnabled;
  }
}

export abstract class AbstractExpression extends AbstractNode {
  abstract readonly type: string;

  getType(): TypeRef | null {
    return null;
  }

  isValid(): boolean {
    return true;
  }
}

export abstract class AbstractDeclaration extends AbstractNode {
  constructor(
    public name: string,
    public visibility: string | null = null,
  ) {
    super();
  }
}

export abstract class AbstractAccessibleDeclaration extends AbstractDeclaration {
  constructor(
    name: string,
    visibility: string | null = null,
    public accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, visibility);
  }
}

export abstract class AbstractPackage extends AbstractDeclaration {}

export interface StatementWithBody {
  body: Statement[];
}

export interface ArgumentOwner {
  arguments: AbstractArgument[];
}

export interface Member {
  getDeclaringType(): NamedUserType | ClassDeclaration | null;
}

export interface UserMember extends Member {}

export interface UserCode {}

export interface Lambda {}
