import { AbstractNode, AbstractPackage, AccessLevel, TypeModifierFinalAbstractOrNeither, TypeRef, UserCode, simpleTypeRef, typeRefName } from "./ast-nodes-common-core.js";
import { AbstractType, ParameterInput } from "./ast-nodes-declarations-base.js";
import { AnonymousUserConstructor, JavaConstructor, JavaField, JavaMethod, NamedUserConstructor, UserField, UserMethod, UserType, registerDeclarationTypeFactories } from "./ast-nodes-declarations-runtime.js";
import { Statement } from "./ast-nodes-statements-union.js";

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
    public strictFloatingPoint = false,
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
    return this.strictFloatingPoint;
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

export function capitalize(value: string): string {
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

registerDeclarationTypeFactories({
  getJavaType: (name) => JavaType.getInstance(name),
  getUserArrayType: (componentType, arrayCount) => UserArrayType.getInstance(componentType, arrayCount),
});
