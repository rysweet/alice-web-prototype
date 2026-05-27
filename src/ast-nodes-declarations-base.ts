import { AbstractAccessibleDeclaration, AbstractDeclaration, AbstractNode, AbstractPackage, AccessLevel, TypeRef, simpleTypeRef, typeRefsAssignable } from "./ast-nodes-common-core.js";
import type { AbstractCode, AbstractConstructor, AbstractField, AbstractMethod } from "./ast-nodes-declarations-runtime.js";
import { Expression } from "./ast-nodes-expressions-union.js";
import type { AbstractLoop } from "./ast-nodes-statements-control.js";

let abstractCodeType: (abstract new (...args: never[]) => AbstractCode) | null = null;
let abstractLoopType: (abstract new (...args: never[]) => AbstractLoop) | null = null;
let userArrayTypeFactory: ((componentType: AbstractType, arrayCount: number) => AbstractType) | null = null;

export function registerDeclarationBaseTypes(types: {
  readonly abstractCode?: abstract new (...args: never[]) => AbstractCode;
  readonly abstractLoop?: abstract new (...args: never[]) => AbstractLoop;
  readonly getUserArrayType?: (componentType: AbstractType, arrayCount: number) => AbstractType;
}): void {
  if (types.abstractCode) {
    abstractCodeType = types.abstractCode;
  }
  if (types.abstractLoop) {
    abstractLoopType = types.abstractLoop;
  }
  if (types.getUserArrayType) {
    userArrayTypeFactory = types.getUserArrayType;
  }
}

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

  isStatic(): boolean {
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
    if (!userArrayTypeFactory) {
      throw new Error("Declaration base types not registered");
    }
    return userArrayTypeFactory(this, 1);
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
    return abstractCodeType
      ? this.getFirstAncestorAssignableTo(abstractCodeType as abstract new (...args: never[]) => AbstractNode) as AbstractCode | null
      : null;
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

export type ParameterInput = Parameter;

export function toUserParameter(parameter: ParameterInput): UserParameter {
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
    const loop = abstractLoopType
      ? this.getFirstAncestorAssignableTo(abstractLoopType as abstract new (...args: never[]) => AbstractNode) as AbstractLoop | null
      : null;
    this.name = loop ? loop.generateLocalName(this) : "value";
    return this.name;
  }
}
