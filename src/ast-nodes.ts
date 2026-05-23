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
  if (expected === null || actual === null) {
    return true;
  }
  if (expected.type === "VoidTypeRef" || actual.type === "VoidTypeRef") {
    return expected.type === actual.type;
  }
  if (expected.type === "LambdaTypeRef" || actual.type === "LambdaTypeRef") {
    return expected.type === actual.type && typeRefName(expected) === typeRefName(actual);
  }
  if (expected.name === actual.name && expected.isArray === actual.isArray) {
    return true;
  }
  if (expected.name === "Object" && !expected.isArray) {
    return true;
  }
  return isNumericTypeName(expected.name) && isNumericTypeName(actual.name) && expected.isArray === actual.isArray;
}

function inferLiteralTypeRef(literalType: "number" | "string" | "boolean" | "null", value?: number): TypeRef | null {
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

  protected setParent(parent: AbstractNode | null): void {
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
    ctor: new (...args: never[]) => T,
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
      value["setParent"](this.owner);
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
      if (Array.isArray(entry)) {
        this.add(...entry);
      } else {
        entry["setParent"](this.owner);
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
      value["setParent"](this.owner);
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

type ArgumentInput = Argument;

function toArgument(argument: ArgumentInput): AbstractArgument {
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

export abstract class AbstractType extends AbstractAccessibleDeclaration {
  constructor(
    name: string,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, visibility, accessLevel);
  }

  getPackage(): AbstractPackage | null {
    return null;
  }

  getSuperType(): AbstractType | null {
    return null;
  }

  getInterfaces(): AbstractType[] {
    return [];
  }

  getDeclaredConstructors(): AbstractConstructor[] {
    return [];
  }

  getDeclaredMethods(): AbstractMethod[] {
    return [];
  }

  getDeclaredFields(): AbstractField[] {
    return [];
  }

  isPrimitive(): boolean {
    return false;
  }

  isInterface(): boolean {
    return false;
  }

  override isStatic(): boolean {
    return false;
  }

  isAbstract(): boolean {
    return false;
  }

  isFinal(): boolean {
    return false;
  }

  isStrictFloatingPoint(): boolean {
    return false;
  }

  isArray(): boolean {
    return false;
  }

  isEnum(): boolean {
    return false;
  }

  getComponentType(): AbstractType | null {
    return null;
  }

  getArrayType(): AbstractType {
    return UserArrayType.getInstance(this, 1);
  }

  isAssignableFrom(other: AbstractType | TypeRef | null): boolean {
    const expected = this.toTypeRef();
    const actual = other instanceof AbstractType ? other.toTypeRef() : other;
    return typeRefsAssignable(expected, actual);
  }

  isAssignableTo(other: AbstractType | TypeRef | null): boolean {
    return other instanceof AbstractType ? other.isAssignableFrom(this) : typeRefsAssignable(other, this.toTypeRef());
  }

  toTypeRef(): TypeRef {
    return simpleTypeRef(this.name, this.isArray());
  }
}

export abstract class AbstractTransient extends AbstractDeclaration {
  constructor(
    name: string,
    public valueType: TypeRef,
    visibility: string | null = null,
  ) {
    super(name, visibility);
  }

  getValueType(): TypeRef {
    return this.valueType;
  }
}

export abstract class AbstractParameter extends AbstractTransient {
  constructor(
    name: string,
    valueType: TypeRef,
    public isVarArgs = false,
    public defaultValue: Expression | null = null,
    visibility: string | null = null,
  ) {
    super(name, valueType, visibility);
    this.attachNode(defaultValue);
  }

  protected override getChildNodes(): AbstractNode[] {
    return this.defaultValue ? [this.defaultValue] : [];
  }
}

export class UserParameter extends AbstractParameter {
  get paramType(): TypeRef {
    return this.valueType;
  }

  set paramType(value: TypeRef) {
    this.valueType = value;
  }

  getCode(): AbstractCode | null {
    return this.getFirstAncestorAssignableTo(AbstractCode);
  }

  isUserAuthored(): boolean {
    return true;
  }
}

export class SetterParameter extends UserParameter {}

export type Parameter = UserParameter | {
  name: string;
  paramType: TypeRef;
  isVarArgs: boolean;
  defaultValue: Expression | null;
};

type ParameterInput = Parameter;

function toUserParameter(parameter: ParameterInput): UserParameter {
  if (parameter instanceof UserParameter) {
    return parameter;
  }
  return new UserParameter(
    parameter.name,
    parameter.paramType,
    parameter.isVarArgs,
    parameter.defaultValue,
  );
}

export class JavaParameter extends UserParameter {}

export class UserLocal extends AbstractTransient {
  constructor(
    name: string,
    valueType: TypeRef,
    public isFinal = false,
  ) {
    super(name, valueType);
  }

  isUserAuthored(): boolean {
    return true;
  }

  getValidName(): string {
    if (this.name) {
      return this.name;
    }
    const loop = this.getFirstAncestorAssignableTo(AbstractLoop);
    this.name = loop ? loop.generateLocalName(this) : "value";
    return this.name;
  }
}

export abstract class AbstractField extends AbstractAccessibleDeclaration implements Member {
  constructor(
    name: string,
    public fieldType: TypeRef,
    public initializer: Expression | null,
    public isStatic: boolean,
    public isConstant: boolean,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, visibility, accessLevel);
    this.attachNode(initializer);
  }

  getValueType(): TypeRef {
    return this.fieldType;
  }

  getDeclaringType(): NamedUserType | ClassDeclaration | null {
    return this.getFirstAncestorAssignableTo(NamedUserType);
  }

  isValid(): boolean {
    return this.initializer === null || typeRefsAssignable(this.fieldType, this.initializer.getType());
  }

  protected override getChildNodes(): AbstractNode[] {
    return this.initializer ? [this.initializer] : [];
  }
}

export abstract class AbstractCode extends AbstractAccessibleDeclaration {
  getDeclaringType(): NamedUserType | ClassDeclaration | null {
    return this.getFirstAncestorAssignableTo(NamedUserType);
  }

  generateLocalName(local: UserLocal): string {
    const existing = this.getChildNodes().filter((node): node is UserLocal => node instanceof UserLocal);
    return `${local.isFinal ? "CONSTANT" : "value"}${existing.length}`;
  }
}

export abstract class AbstractConstructor extends AbstractCode {
  readonly type = "ConstructorDeclaration" as const;
  readonly parameters: UserParameter[];
  readonly body: Statement[];

  constructor(
    name: string,
    parameters: ParameterInput[],
    body: Statement[],
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, visibility, accessLevel);
    this.parameters = parameters.map(toUserParameter);
    this.body = [...body];
    this.attachNodes(this.parameters);
    this.attachNodes(this.body);
  }

  getRequiredParameters(): UserParameter[] {
    return [...this.parameters];
  }

  getFirstParameterType(): TypeRef | null {
    return this.parameters[0]?.paramType ?? null;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.parameters, ...this.body];
  }
}

export abstract class AbstractMethod extends AbstractCode implements Member {
  readonly parameters: UserParameter[];
  readonly body: Statement[];

  constructor(
    name: string,
    public returnType: TypeRef,
    parameters: ParameterInput[],
    body: Statement[],
    public isStatic: boolean,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, visibility, accessLevel);
    this.parameters = parameters.map(toUserParameter);
    this.body = [...body];
    this.attachNodes(this.parameters);
    this.attachNodes(this.body);
  }

  getRequiredParameters(): UserParameter[] {
    return [...this.parameters];
  }

  getReturnType(): TypeRef {
    return this.returnType;
  }

  override getDeclaringType(): NamedUserType | ClassDeclaration | null {
    return this.getFirstAncestorAssignableTo(NamedUserType);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.parameters, ...this.body];
  }
}

export abstract class AbstractMethodContainedByUserField extends AbstractMethod {
  constructor(
    protected readonly containingField: UserField,
    name: string,
    returnType: TypeRef,
    parameters: ParameterInput[],
    body: Statement[],
    isStatic: boolean,
    visibility: string | null = null,
  ) {
    super(name, returnType, parameters, body, isStatic, visibility);
  }

  getField(): UserField {
    return this.containingField;
  }
}

export abstract class AbstractUserMethod extends AbstractMethod {
  constructor(
    name: string,
    returnType: TypeRef,
    parameters: ParameterInput[],
    body: Statement[],
    isStatic: boolean,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
    public managementLevel: ManagementLevel = ManagementLevel.NONE,
    public isSignatureLocked = false,
    public isDeletionAllowed = true,
    public isSynchronized = false,
    public isStrictFloatingPoint = false,
  ) {
    super(name, returnType, parameters, body, isStatic, visibility, accessLevel);
  }
}

export class UserMethod extends AbstractUserMethod implements UserCode {
  constructor(
    name: string,
    returnType: TypeRef,
    parameters: ParameterInput[],
    body: Statement[],
    isStatic: boolean,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
    public isAbstract = false,
    public isFinal = false,
  ) {
    super(name, returnType, parameters, body, isStatic, visibility, accessLevel);
  }
}

export class JavaMethod extends AbstractMethod {
  constructor(
    name: string,
    returnType: TypeRef,
    parameters: ParameterInput[] = [],
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
    isStatic = true,
  ) {
    super(name, returnType, parameters, [], isStatic, visibility, accessLevel);
  }
}

export class Getter extends AbstractMethodContainedByUserField {
  constructor(field: UserField) {
    super(field, `get${capitalize(field.name)}`, field.fieldType, [], [], field.isStatic, field.visibility);
  }
}

export class Setter extends AbstractMethodContainedByUserField {
  constructor(field: UserField) {
    super(
      field,
      `set${capitalize(field.name)}`,
      { type: "VoidTypeRef" },
      [new SetterParameter("value", field.fieldType)],
      [],
      field.isStatic,
      field.visibility,
    );
  }
}

export class ArrayItemGetter extends Getter {}
export class ArrayItemSetter extends Setter {}

export class UserField extends AbstractField implements UserMember {
  #getter: Getter | null = null;
  #setter: Setter | null = null;
  #arrayItemGetter: ArrayItemGetter | null = null;
  #arrayItemSetter: ArrayItemSetter | null = null;

  constructor(
    name: string,
    fieldType: TypeRef,
    initializer: Expression | null,
    isStatic: boolean,
    isConstant: boolean,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
    public finalVolatileOrNeither: FieldModifierFinalVolatileOrNeither = isConstant
      ? FieldModifierFinalVolatileOrNeither.FINAL
      : FieldModifierFinalVolatileOrNeither.NEITHER,
    public isTransient = false,
    public managementLevel: ManagementLevel = ManagementLevel.NONE,
    public isDeletionAllowed = true,
  ) {
    super(name, fieldType, initializer, isStatic, isConstant, visibility, accessLevel);
  }

  getGetter(): Getter {
    this.#getter ??= new Getter(this);
    return this.#getter;
  }

  getSetter(): Setter | null {
    if (this.isConstant) {
      return null;
    }
    this.#setter ??= new Setter(this);
    return this.#setter;
  }

  getArrayItemGetter(): ArrayItemGetter {
    this.#arrayItemGetter ??= new ArrayItemGetter(this);
    return this.#arrayItemGetter;
  }

  getArrayItemSetter(): ArrayItemSetter | null {
    if (this.isConstant) {
      return null;
    }
    this.#arrayItemSetter ??= new ArrayItemSetter(this);
    return this.#arrayItemSetter;
  }

  getGetters(): Getter[] {
    return this.fieldType.type === "SimpleTypeRef" && this.fieldType.isArray
      ? [this.getArrayItemGetter(), this.getGetter()]
      : [this.getGetter()];
  }

  getSetters(): Setter[] {
    const setter = this.getSetter();
    if (!setter) {
      return [];
    }
    const arraySetter = this.getArrayItemSetter();
    return this.fieldType.type === "SimpleTypeRef" && this.fieldType.isArray && arraySetter
      ? [arraySetter, setter]
      : [setter];
  }
}

export class JavaField extends AbstractField {
  constructor(
    name: string,
    fieldType: TypeRef,
    isStatic = true,
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, fieldType, null, isStatic, false, visibility, accessLevel);
  }
}

export abstract class UserConstructor extends AbstractConstructor implements UserCode {
  getVariableLengthParameter(): AbstractParameter | null {
    return null;
  }

  getKeyedParameter(): AbstractParameter | null {
    return null;
  }

  isUserAuthored(): boolean {
    return true;
  }
}

export class NamedUserConstructor extends UserConstructor implements UserCode {
  constructor(
    parameters: ParameterInput[],
    body: Statement[],
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
    public managementLevel: ManagementLevel = ManagementLevel.NONE,
    public isSignatureLocked = false,
    public isDeletionAllowed = false,
  ) {
    super("constructor", parameters, body, visibility, accessLevel);
  }
}

export class AnonymousUserConstructor extends UserConstructor {
  constructor(
    public readonly anonymousTypeName = "AnonymousType",
    parameters: ParameterInput[] = [],
  ) {
    super(anonymousTypeName, parameters, [], null, AccessLevel.PUBLIC);
  }

  getRequiredParameters(): UserParameter[] {
    return [...this.parameters];
  }
}

export class JavaConstructor extends AbstractConstructor {
  constructor(
    name: string,
    parameters: ParameterInput[] = [],
    visibility: string | null = null,
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, parameters, [], visibility, accessLevel);
  }
}

export abstract class UserType<C extends UserConstructor> extends AbstractType {
  readonly methods: UserMethod[];
  readonly fields: UserField[];

  constructor(
    name: string,
    public superClass: string | null,
    visibility: string | null,
    methods: UserMethod[],
    fields: UserField[],
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
  ) {
    super(name, visibility, accessLevel);
    this.methods = [...methods];
    this.fields = [...fields];
    this.attachNodes(this.methods);
    this.attachNodes(this.fields);
  }

  override getDeclaredMethods(): UserMethod[] {
    return [...this.methods];
  }

  override getDeclaredFields(): UserField[] {
    return [...this.fields];
  }

  override getSuperType(): AbstractType | null {
    return this.superClass ? JavaType.getInstance(this.superClass) : null;
  }

  override getArrayType(): AbstractType {
    return UserArrayType.getInstance(this, 1);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.methods, ...this.fields];
  }
}

export class NamedUserType extends UserType<NamedUserConstructor> implements UserCode {
  readonly constructors: NamedUserConstructor[];

  constructor(
    name: string,
    superClass: string | null,
    visibility: string | null,
    constructors: NamedUserConstructor[],
    methods: UserMethod[],
    fields: UserField[],
    accessLevel: AccessLevel = AccessLevel.PUBLIC,
    public packageNode: UserPackage | null = null,
    public finalAbstractOrNeither: TypeModifierFinalAbstractOrNeither = TypeModifierFinalAbstractOrNeither.NEITHER,
    public isStrictFloatingPoint = false,
  ) {
    super(name, superClass, visibility, methods, fields, accessLevel);
    this.constructors = [...constructors];
    this.attachNodes(this.constructors);
    this.attachNode(packageNode);
  }

  override getDeclaredConstructors(): NamedUserConstructor[] {
    return [...this.constructors];
  }

  override getPackage(): AbstractPackage | null {
    return this.packageNode;
  }

  override isAbstract(): boolean {
    return this.finalAbstractOrNeither === TypeModifierFinalAbstractOrNeither.ABSTRACT;
  }

  override isFinal(): boolean {
    return this.finalAbstractOrNeither === TypeModifierFinalAbstractOrNeither.FINAL;
  }

  override isStrictFloatingPoint(): boolean {
    return this.isStrictFloatingPoint;
  }

  protected override getChildNodes(): AbstractNode[] {
    return [
      ...(this.packageNode ? [this.packageNode] : []),
      ...this.constructors,
      ...this.methods,
      ...this.fields,
    ];
  }
}

export class AnonymousUserType extends UserType<AnonymousUserConstructor> {
  readonly constructors: AnonymousUserConstructor[];

  constructor(
    name = "AnonymousType",
    superClass: string | null = null,
    methods: UserMethod[] = [],
    fields: UserField[] = [],
  ) {
    super(name, superClass, null, methods, fields);
    this.constructors = [new AnonymousUserConstructor(name)];
    this.attachNodes(this.constructors);
  }

  override getDeclaredConstructors(): AnonymousUserConstructor[] {
    return [...this.constructors];
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.constructors, ...super.getChildNodes()];
  }
}

export class JavaType extends AbstractType {
  static readonly #instances = new Map<string, JavaType>();

  static getInstance(nameOrType: string | TypeRef | AbstractType | null): JavaType | null {
    if (nameOrType === null) {
      return null;
    }
    const key = typeof nameOrType === "string"
      ? nameOrType
      : nameOrType instanceof AbstractType
        ? nameOrType.name
        : typeRefName(nameOrType) ?? "Object";
    let instance = this.#instances.get(key);
    if (!instance) {
      instance = new JavaType(key);
      this.#instances.set(key, instance);
    }
    return instance;
  }

  static readonly VOID_TYPE = JavaType.getInstance("void")!;
  static readonly BOOLEAN_OBJECT_TYPE = JavaType.getInstance("Boolean")!;
  static readonly INTEGER_OBJECT_TYPE = JavaType.getInstance("WholeNumber")!;
  static readonly DOUBLE_OBJECT_TYPE = JavaType.getInstance("DecimalNumber")!;
  static readonly OBJECT_TYPE = JavaType.getInstance("Object")!;
  static readonly STRING_TYPE = JavaType.getInstance("String")!;

  readonly constructors: JavaConstructor[] = [];
  readonly methods: JavaMethod[] = [];
  readonly fields: JavaField[] = [];

  constructor(
    name: string,
    public packageName: string | null = null,
    public superTypeName: string | null = name === "Object" ? null : "Object",
    public primitive = false,
    public interfaceType = false,
    public staticType = false,
    public abstractType = false,
    public finalType = false,
    public strictFloatingPoint = false,
    public enumType = false,
    public arrayType = false,
    public componentTypeName: string | null = null,
  ) {
    super(name, null, AccessLevel.PUBLIC);
  }

  override getPackage(): AbstractPackage | null {
    return this.packageName ? new JavaPackage(this.packageName) : null;
  }

  override getSuperType(): AbstractType | null {
    return this.superTypeName ? JavaType.getInstance(this.superTypeName) : null;
  }

  override getDeclaredConstructors(): JavaConstructor[] {
    return [...this.constructors];
  }

  override getDeclaredMethods(): JavaMethod[] {
    return [...this.methods];
  }

  override getDeclaredFields(): JavaField[] {
    return [...this.fields];
  }

  override isPrimitive(): boolean {
    return this.primitive;
  }

  override isInterface(): boolean {
    return this.interfaceType;
  }

  override isStatic(): boolean {
    return this.staticType;
  }

  override isAbstract(): boolean {
    return this.abstractType;
  }

  override isFinal(): boolean {
    return this.finalType;
  }

  override isStrictFloatingPoint(): boolean {
    return this.strictFloatingPoint;
  }

  override isArray(): boolean {
    return this.arrayType;
  }

  override isEnum(): boolean {
    return this.enumType;
  }

  override getComponentType(): AbstractType | null {
    return this.componentTypeName ? JavaType.getInstance(this.componentTypeName) : null;
  }
}

export class UserArrayType extends AbstractType {
  static readonly #instances = new Map<string, UserArrayType>();

  static getInstance(leafType: AbstractType, dimensionCount: number): UserArrayType {
    const key = `${leafType.name}:${dimensionCount}`;
    let instance = this.#instances.get(key);
    if (!instance) {
      instance = new UserArrayType(leafType, dimensionCount);
      this.#instances.set(key, instance);
    }
    return instance;
  }

  private constructor(
    public readonly leafType: AbstractType,
    public readonly dimensionCount: number,
  ) {
    super(`${leafType.name}${"[]".repeat(dimensionCount)}`);
  }

  override getPackage(): AbstractPackage | null {
    return this.leafType.getPackage();
  }

  override getSuperType(): AbstractType | null {
    return JavaType.OBJECT_TYPE;
  }

  override isArray(): boolean {
    return true;
  }

  override getComponentType(): AbstractType {
    return this.dimensionCount === 1
      ? this.leafType
      : UserArrayType.getInstance(this.leafType, this.dimensionCount - 1);
  }

  override toTypeRef(): TypeRef {
    return simpleTypeRef(this.leafType.name, true);
  }
}

export class JavaPackage extends AbstractPackage {}
export class UserPackage extends AbstractPackage {}

function capitalize(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}

export class ClassDeclaration extends NamedUserType {
  readonly type = "ClassDeclaration" as const;

  constructor(
    name: string,
    superClass: string | null,
    public modelType: string | null,
    visibility: string | null,
    constructors: ConstructorDeclaration[],
    methods: MethodDeclaration[],
    fields: FieldDeclaration[],
  ) {
    super(name, superClass, visibility, constructors, methods, fields);
  }
}

export class ConstructorDeclaration extends NamedUserConstructor {
  readonly type = "ConstructorDeclaration" as const;

  constructor(
    name: string,
    parameters: ParameterInput[],
    body: Statement[],
    visibility: string | null = null,
  ) {
    super(parameters, body, visibility);
    this.name = name;
  }
}

export class MethodDeclaration extends UserMethod {
  readonly type = "MethodDeclaration" as const;
}

export class FieldDeclaration extends UserField {
  readonly type = "FieldDeclaration" as const;
}

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
  readonly type = "CountLoop" as const;

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
  readonly type = "ForEachInArrayLoop" as const;

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
  readonly type = "LocalDeclarationStatement" as const;

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
  readonly type = "Block" as const;

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
  readonly type = "ConstructorInvocationStatement" as const;
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
  readonly type = "InstanceCreation" as const;
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
    if (this.operator === "+" && (this.left.getType()?.type === "SimpleTypeRef" && this.left.getType()?.name === "String"
      || this.right.getType()?.type === "SimpleTypeRef" && this.right.getType()?.name === "String")) {
      return simpleTypeRef("String");
    }
    return this.left.getType() ?? this.right.getType();
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

export type Statement =
  | DoInOrderStatement
  | DoTogetherStatement
  | ConditionalStatement
  | ForEachLoop
  | CountUpToStatement
  | WhileLoopStatement
  | TryCatchStatement
  | SwitchCaseStatement
  | ReturnStatement
  | ExpressionStatement
  | LocalVariableDeclarationStatement
  | BlockStatement
  | DisabledBlockStatement
  | CommentStatement
  | ConstructorBlockStatement
  | ConstructorInvocationStatement
  | ThisConstructorInvocationStatement
  | SuperConstructorInvocationStatement
  | CountLoop
  | ForEachInArrayLoop
  | ForEachInIterableLoop
  | EachInArrayTogether
  | EachInIterableTogether
  | LocalDeclarationStatement
  | DoInOrder
  | DoTogether
  | WhileLoop
  | Comment;

export type Expression =
  | IntegerLiteral
  | DoubleLiteral
  | FloatLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ThisExpression
  | SuperExpression
  | IdentifierExpression
  | LocalAccess
  | ParameterAccess
  | FieldAccess
  | MethodInvocation
  | NewInstanceExpression
  | InstanceCreation
  | NewArrayExpression
  | ArrayInstanceCreation
  | ArrayLiteralExpression
  | BinaryOpExpression
  | ArithmeticInfixExpression
  | BitwiseInfixExpression
  | ConditionalInfixExpression
  | RelationalInfixExpression
  | ShiftInfixExpression
  | StringConcatenation
  | UnaryOpExpression
  | LogicalComplement
  | AssignmentExpression
  | ArrayAccessExpression
  | ArrayAccess
  | ArrayLength
  | TypeCastExpression
  | InstanceOfExpression
  | ParenthesizedExpression
  | ResourceExpression
  | TypeExpression
  | TypeLiteral
  | LambdaExpression
  | FauxExpression;

export type ClassDecl = ClassDeclaration;
export type ConstructorDecl = ConstructorDeclaration;
export type MethodDecl = MethodDeclaration;
export type FieldDecl = FieldDeclaration;

export type RawStatement =
  | { type: "DoInOrder"; body: RawStatement[] }
  | { type: "DoTogether"; body: RawStatement[] }
  | { type: "IfElse"; condition: RawExpression; ifBody: RawStatement[]; elseBody: RawStatement[] | null }
  | { type: "ConditionalStatement"; booleanExpressionBodyPairs: Array<{ expression: RawExpression; body: RawStatement[] }>; elseBody: RawStatement[] | null }
  | { type: "ForEach"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "ForEachInArrayLoop"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "ForEachInIterableLoop"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "EachInArrayTogether"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "EachInIterableTogether"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "CountUpTo"; count: RawExpression; body: RawStatement[] }
  | { type: "CountLoop"; count: RawExpression; body: RawStatement[]; variableName?: string | null; constantName?: string | null }
  | { type: "WhileLoop"; condition: RawExpression; body: RawStatement[] }
  | { type: "TryCatch"; tryBody: RawStatement[]; catchType: TypeRef; catchVariable: string; catchBody: RawStatement[] }
  | { type: "SwitchCase"; expression: RawExpression; cases: Array<{ value: RawExpression; body: RawStatement[] }>; defaultCase: RawStatement[] | null }
  | { type: "Return"; expression: RawExpression | null; expressionType?: TypeRef | null }
  | { type: "ExpressionStatement"; expression: RawExpression }
  | { type: "LocalVariableDeclaration"; name: string; varType: TypeRef; initializer: RawExpression; isConstant: boolean }
  | { type: "LocalDeclarationStatement"; name: string; varType: TypeRef; initializer: RawExpression; isConstant: boolean }
  | { type: "Block"; body: RawStatement[] }
  | { type: "ConstructorBlockStatement"; constructorInvocationStatement?: RawStatement; body: RawStatement[] }
  | { type: "ConstructorInvocationStatement"; className?: string | null; arguments?: RawArgument[] }
  | { type: "ThisConstructorInvocationStatement"; className?: string | null; arguments?: RawArgument[] }
  | { type: "SuperConstructorInvocationStatement"; className?: string | null; arguments?: RawArgument[] }
  | { type: "DisabledBlock"; raw: string }
  | { type: "Comment"; text: string };

export type RawExpression =
  | { type: "Literal"; value: number | string | boolean | null; literalType: "number" | "string" | "boolean" | "null" }
  | { type: "This" }
  | { type: "Super" }
  | { type: "Identifier"; name: string }
  | { type: "LocalAccess"; name: string; valueType?: TypeRef }
  | { type: "ParameterAccess"; name: string; valueType?: TypeRef }
  | { type: "MemberAccess"; target: RawExpression; memberName: string }
  | { type: "FieldAccess"; target: RawExpression; memberName: string; fieldType?: TypeRef }
  | { type: "MethodInvocation"; target: RawExpression | null; methodName: string; arguments: RawArgument[] }
  | { type: "NewInstance"; className: string; arguments: RawArgument[] }
  | { type: "InstanceCreation"; className: string; arguments: RawArgument[] }
  | { type: "NewArray"; elementType: TypeRef; elements: RawExpression[]; size: RawExpression | null }
  | { type: "ArrayInstanceCreation"; elementType: TypeRef; elements: RawExpression[]; size: RawExpression | null; lengths?: number[] }
  | { type: "ArrayLiteral"; elements: RawExpression[] }
  | { type: "ArrayLength"; array: RawExpression }
  | { type: "BinaryOp"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "ArithmeticInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "BitwiseInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "ConditionalInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "RelationalInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "ShiftInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "StringConcatenation"; leftOperand: RawExpression; rightOperand: RawExpression }
  | { type: "UnaryOp"; operator: string; operand: RawExpression }
  | { type: "LogicalComplement"; operand: RawExpression }
  | { type: "Assignment"; target: RawExpression; value: RawExpression }
  | { type: "ArrayAccess"; target: RawExpression; index: RawExpression }
  | { type: "TypeCast"; expression: RawExpression; targetType: TypeRef }
  | { type: "InstanceOf"; expression: RawExpression; testType: TypeRef }
  | { type: "Parenthesized"; expression: RawExpression }
  | { type: "ResourceExpression"; resourceType: TypeRef; resource: unknown }
  | { type: "TypeExpression"; valueType: TypeRef }
  | { type: "TypeLiteral"; valueType: TypeRef }
  | { type: "LambdaExpression"; raw: string };

export type RawParameter = {
  name: string;
  paramType: TypeRef;
  isVarArgs: boolean;
  defaultValue: RawExpression | null;
};

export type RawArgument = {
  name: string | null;
  value: RawExpression;
};

export type RawConstructorDecl = {
  type: "ConstructorDeclaration";
  name: string;
  parameters: RawParameter[];
  body: RawStatement[];
  visibility: string | null;
};

export type RawMethodDecl = {
  type: "MethodDeclaration";
  name: string;
  returnType: TypeRef;
  parameters: RawParameter[];
  body: RawStatement[];
  isStatic: boolean;
  visibility: string | null;
};

export type RawFieldDecl = {
  type: "FieldDeclaration";
  name: string;
  fieldType: TypeRef;
  initializer: RawExpression | null;
  isStatic: boolean;
  isConstant: boolean;
  visibility: string | null;
};

export type RawClassDecl = {
  type: "ClassDeclaration";
  name: string;
  superClass: string | null;
  modelType: string | null;
  visibility: string | null;
  constructors: RawConstructorDecl[];
  methods: RawMethodDecl[];
  fields: RawFieldDecl[];
};

function hydrateArgument(argument: RawArgument): Argument {
  return {
    name: argument.name,
    value: hydrateExpression(argument.value),
  };
}

function hydrateParameter(parameter: RawParameter): Parameter {
  return {
    name: parameter.name,
    paramType: parameter.paramType,
    isVarArgs: parameter.isVarArgs,
    defaultValue: parameter.defaultValue ? hydrateExpression(parameter.defaultValue) : null,
  };
}

function hydrateBinaryByOperator(operator: string, left: Expression, right: Expression): Expression {
  if (operator === "+" && (left.getType()?.type === "SimpleTypeRef" && left.getType()?.name === "String"
    || right.getType()?.type === "SimpleTypeRef" && right.getType()?.name === "String")) {
    return new StringConcatenation(left, right);
  }
  if (ArithmeticInfixExpression.OPERATORS.has(operator)) {
    return new ArithmeticInfixExpression(operator, left, right);
  }
  if (RelationalInfixExpression.OPERATORS.has(operator)) {
    return new RelationalInfixExpression(operator, left, right);
  }
  if (ConditionalInfixExpression.OPERATORS.has(operator)) {
    return new ConditionalInfixExpression(operator, left, right);
  }
  if (BitwiseInfixExpression.OPERATORS.has(operator)) {
    return new BitwiseInfixExpression(operator, left, right);
  }
  if (ShiftInfixExpression.OPERATORS.has(operator)) {
    return new ShiftInfixExpression(operator, left, right);
  }
  return new BinaryOpExpression(operator, left, right);
}

export function hydrateExpression(expression: RawExpression): Expression {
  switch (expression.type) {
    case "Literal":
      switch (expression.literalType) {
        case "number": {
          const value = expression.value as number;
          return Number.isInteger(value)
            ? new IntegerLiteral(value)
            : new DoubleLiteral(value);
        }
        case "string":
          return new StringLiteral(expression.value as string);
        case "boolean":
          return new BooleanLiteral(expression.value as boolean);
        case "null":
          return new NullLiteral();
      }
      throw new Error(`Unsupported literal type: ${JSON.stringify(expression)}`);
    case "This":
      return new ThisExpression();
    case "Super":
      return new SuperExpression();
    case "Identifier":
      return new IdentifierExpression(expression.name);
    case "LocalAccess":
      return new LocalAccess(expression.name, expression.valueType ?? simpleTypeRef("Object"));
    case "ParameterAccess":
      return new ParameterAccess(expression.name, expression.valueType ?? simpleTypeRef("Object"));
    case "MemberAccess":
      return new FieldAccess(hydrateExpression(expression.target), expression.memberName);
    case "FieldAccess":
      return new FieldAccess(
        hydrateExpression(expression.target),
        expression.memberName,
        expression.fieldType ? new JavaField(expression.memberName, expression.fieldType) : null,
      );
    case "MethodInvocation":
      return new MethodInvocation(
        expression.target ? hydrateExpression(expression.target) : null,
        expression.methodName,
        expression.arguments.map(hydrateArgument),
      );
    case "NewInstance":
      return new NewInstanceExpression(
        expression.className,
        expression.arguments.map(hydrateArgument),
      );
    case "InstanceCreation":
      return new InstanceCreation(
        expression.className,
        expression.arguments.map(hydrateArgument),
      );
    case "NewArray":
      return new NewArrayExpression(
        expression.elementType,
        expression.elements.map(hydrateExpression),
        expression.size ? hydrateExpression(expression.size) : null,
      );
    case "ArrayInstanceCreation":
      return new ArrayInstanceCreation(
        expression.elementType,
        expression.elements.map(hydrateExpression),
        expression.size ? hydrateExpression(expression.size) : null,
        expression.lengths ?? [],
      );
    case "ArrayLiteral":
      return new ArrayLiteralExpression(expression.elements.map(hydrateExpression));
    case "ArrayLength":
      return new ArrayLength(hydrateExpression(expression.array));
    case "BinaryOp":
      return hydrateBinaryByOperator(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "ArithmeticInfixExpression":
      return new ArithmeticInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "BitwiseInfixExpression":
      return new BitwiseInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "ConditionalInfixExpression":
      return new ConditionalInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "RelationalInfixExpression":
      return new RelationalInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "ShiftInfixExpression":
      return new ShiftInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "StringConcatenation":
      return new StringConcatenation(
        hydrateExpression(expression.leftOperand),
        hydrateExpression(expression.rightOperand),
      );
    case "UnaryOp": {
      const operand = hydrateExpression(expression.operand);
      return expression.operator === "!"
        ? new LogicalComplement(operand)
        : new UnaryOpExpression(expression.operator, operand);
    }
    case "LogicalComplement":
      return new LogicalComplement(hydrateExpression(expression.operand));
    case "Assignment":
      return new AssignmentExpression(
        hydrateExpression(expression.target),
        hydrateExpression(expression.value),
      );
    case "ArrayAccess":
      return new ArrayAccessExpression(
        hydrateExpression(expression.target),
        hydrateExpression(expression.index),
      );
    case "TypeCast":
      return new TypeCastExpression(hydrateExpression(expression.expression), expression.targetType);
    case "InstanceOf":
      return new InstanceOfExpression(hydrateExpression(expression.expression), expression.testType);
    case "Parenthesized":
      return new ParenthesizedExpression(hydrateExpression(expression.expression));
    case "ResourceExpression":
      return new ResourceExpression(expression.resourceType, expression.resource);
    case "TypeExpression":
      return new TypeExpression(expression.valueType);
    case "TypeLiteral":
      return new TypeLiteral(expression.valueType);
    case "LambdaExpression":
      return new LambdaExpression(new UserLambda(expression.raw));
  }
  throw new Error(`Unsupported expression node: ${JSON.stringify(expression)}`);
}

export function hydrateStatement(statement: RawStatement): Statement {
  switch (statement.type) {
    case "DoInOrder":
      return new DoInOrderStatement(statement.body.map(hydrateStatement));
    case "DoTogether":
      return new DoTogetherStatement(statement.body.map(hydrateStatement));
    case "IfElse":
      return new ConditionalStatement(
        hydrateExpression(statement.condition),
        statement.ifBody.map(hydrateStatement),
        statement.elseBody ? statement.elseBody.map(hydrateStatement) : null,
      );
    case "ConditionalStatement": {
      const first = statement.booleanExpressionBodyPairs[0];
      return new ConditionalStatement(
        hydrateExpression(first?.expression ?? { type: "Literal", value: true, literalType: "boolean" }),
        (first?.body ?? []).map(hydrateStatement),
        statement.elseBody ? statement.elseBody.map(hydrateStatement) : null,
      );
    }
    case "ForEach":
      return new ForEachLoop(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "ForEachInArrayLoop":
      return new ForEachInArrayLoop(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "ForEachInIterableLoop":
      return new ForEachInIterableLoop(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "EachInArrayTogether":
      return new EachInArrayTogether(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "EachInIterableTogether":
      return new EachInIterableTogether(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "CountUpTo":
      return new CountUpToStatement(
        hydrateExpression(statement.count),
        statement.body.map(hydrateStatement),
      );
    case "CountLoop":
      return new CountLoop(
        statement.variableName ? new UserLocal(statement.variableName, simpleTypeRef("WholeNumber"), false) : null,
        statement.constantName ? new UserLocal(statement.constantName, simpleTypeRef("WholeNumber"), true) : null,
        hydrateExpression(statement.count),
        statement.body.map(hydrateStatement),
      );
    case "WhileLoop":
      return new WhileLoopStatement(
        hydrateExpression(statement.condition),
        statement.body.map(hydrateStatement),
      );
    case "TryCatch":
      return new TryCatchStatement(
        statement.tryBody.map(hydrateStatement),
        statement.catchType,
        statement.catchVariable,
        statement.catchBody.map(hydrateStatement),
      );
    case "SwitchCase":
      return new SwitchCaseStatement(
        hydrateExpression(statement.expression),
        statement.cases.map((switchCase) => ({
          value: hydrateExpression(switchCase.value),
          body: switchCase.body.map(hydrateStatement),
        })),
        statement.defaultCase ? statement.defaultCase.map(hydrateStatement) : null,
      );
    case "Return":
      return new ReturnStatement(
        statement.expression ? hydrateExpression(statement.expression) : null,
        statement.expressionType ?? null,
      );
    case "ExpressionStatement":
      return new ExpressionStatement(hydrateExpression(statement.expression));
    case "LocalVariableDeclaration":
    case "LocalDeclarationStatement":
      return new LocalVariableDeclarationStatement(
        statement.name,
        statement.varType,
        hydrateExpression(statement.initializer),
        statement.isConstant,
      );
    case "Block":
      return new BlockStatement(statement.body.map(hydrateStatement));
    case "ConstructorBlockStatement":
      return new ConstructorBlockStatement(
        statement.constructorInvocationStatement
          ? hydrateStatement(statement.constructorInvocationStatement) as ConstructorInvocationStatement
          : new SuperConstructorInvocationStatement(null),
        statement.body.map(hydrateStatement),
      );
    case "ConstructorInvocationStatement":
      return new ConstructorInvocationStatement(
        statement.className ? new JavaConstructor(statement.className) : null,
        (statement.arguments ?? []).map(hydrateArgument),
      );
    case "ThisConstructorInvocationStatement":
      return new ThisConstructorInvocationStatement(
        statement.className ? new JavaConstructor(statement.className) : null,
        (statement.arguments ?? []).map(hydrateArgument),
      );
    case "SuperConstructorInvocationStatement":
      return new SuperConstructorInvocationStatement(
        statement.className ? new JavaConstructor(statement.className) : null,
        (statement.arguments ?? []).map(hydrateArgument),
      );
    case "DisabledBlock":
      return new DisabledBlockStatement(statement.raw);
    case "Comment":
      return new CommentStatement(statement.text);
  }
  throw new Error(`Unsupported statement node: ${JSON.stringify(statement)}`);
}

export function hydrateConstructorDecl(constructorDecl: RawConstructorDecl): ConstructorDeclaration {
  return new ConstructorDeclaration(
    constructorDecl.name,
    constructorDecl.parameters.map(hydrateParameter),
    constructorDecl.body.map(hydrateStatement),
    constructorDecl.visibility,
  );
}

export function hydrateMethodDecl(methodDecl: RawMethodDecl): MethodDeclaration {
  return new MethodDeclaration(
    methodDecl.name,
    methodDecl.returnType,
    methodDecl.parameters.map(hydrateParameter),
    methodDecl.body.map(hydrateStatement),
    methodDecl.isStatic,
    methodDecl.visibility,
  );
}

export function hydrateFieldDecl(fieldDecl: RawFieldDecl): FieldDeclaration {
  return new FieldDeclaration(
    fieldDecl.name,
    fieldDecl.fieldType,
    fieldDecl.initializer ? hydrateExpression(fieldDecl.initializer) : null,
    fieldDecl.isStatic,
    fieldDecl.isConstant,
    fieldDecl.visibility,
  );
}

export function hydrateClassDecl(classDecl: RawClassDecl): ClassDeclaration {
  return new ClassDeclaration(
    classDecl.name,
    classDecl.superClass,
    classDecl.modelType,
    classDecl.visibility,
    classDecl.constructors.map(hydrateConstructorDecl),
    classDecl.methods.map(hydrateMethodDecl),
    classDecl.fields.map(hydrateFieldDecl),
  );
}
