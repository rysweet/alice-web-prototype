import { AbstractAccessibleDeclaration, AbstractNode, AccessLevel, FieldModifierFinalVolatileOrNeither, ManagementLevel, Member, TypeRef, UserCode, UserMember, typeRefsAssignable } from "./ast-nodes-common-core.js";
import { AbstractParameter, AbstractType, ParameterInput, SetterParameter, UserLocal, UserParameter, registerDeclarationBaseTypes, toUserParameter } from "./ast-nodes-declarations-base.js";
import type { ClassDeclaration, NamedUserType } from "./ast-nodes-declarations-types.js";
import { Expression } from "./ast-nodes-expressions-union.js";
import { Statement } from "./ast-nodes-statements-union.js";

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

let getJavaTypeInstance: ((name: string) => AbstractType | null) | null = null;
let getUserArrayTypeInstance: ((componentType: AbstractType, arrayCount: number) => AbstractType) | null = null;

export function registerDeclarationTypeFactories(factories: {
  readonly getJavaType: (name: string) => AbstractType | null;
  readonly getUserArrayType: (componentType: AbstractType, arrayCount: number) => AbstractType;
}): void {
  getJavaTypeInstance = factories.getJavaType;
  getUserArrayTypeInstance = factories.getUserArrayType;
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
    return this.getFirstAncestorAssignableTo(UserType) as NamedUserType | ClassDeclaration | null;
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
    return this.getFirstAncestorAssignableTo(UserType) as NamedUserType | ClassDeclaration | null;
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
    return this.getFirstAncestorAssignableTo(UserType) as NamedUserType | ClassDeclaration | null;
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
    public strictFloatingPoint = false,
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
    return this.superClass ? getJavaTypeInstance?.(this.superClass) ?? null : null;
  }

  override getArrayType(): AbstractType {
    if (!getUserArrayTypeInstance) {
      throw new Error("Declaration type factories not registered");
    }
    return getUserArrayTypeInstance(this, 1);
  }

  protected override getChildNodes(): AbstractNode[] {
    return [...this.methods, ...this.fields];
  }
}

registerDeclarationBaseTypes({
  abstractCode: AbstractCode,
  getUserArrayType: (componentType, arrayCount) => {
    if (!getUserArrayTypeInstance) {
      throw new Error("Declaration type factories not registered");
    }
    return getUserArrayTypeInstance(componentType, arrayCount);
  },
});
