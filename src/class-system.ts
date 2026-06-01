import {
  AccessLevel,
  ClassDeclaration as AstClassDeclaration,
  ConstructorDeclaration as AstConstructorDeclaration,
  FieldDeclaration as AstFieldDeclaration,
  MethodDeclaration as AstMethodDeclaration,
  type Expression,
  type Statement,
  type TypeRef,
} from "./ast-nodes.js";
import { assertValidIdentifier, cloneClassDeclaration } from "./type-browser.js";
import { typeRefsAssignable } from "./type-system.js";

function voidType(): TypeRef {
  return { type: "VoidTypeRef" };
}

function typeToString(typeRef: TypeRef | null): string {
  if (!typeRef) {
    return "null";
  }
  switch (typeRef.type) {
    case "SimpleTypeRef":
      return `${typeRef.name}${typeRef.isArray ? "[]" : ""}`;
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return typeRef.raw;
  }
}

function sameType(expected: TypeRef | null, actual: TypeRef | null): boolean {
  if (expected === null || actual === null) {
    return expected === actual;
  }
  return typeRefsAssignable(expected, actual) && typeRefsAssignable(actual, expected);
}

function attach(owner: AstClassDeclaration, member: { setParent(parent: unknown): void }): void {
  member.setParent(owner);
}

export interface ParameterInputLike {
  readonly name: string;
  readonly paramType: TypeRef;
  readonly isVarArgs?: boolean;
  readonly defaultValue?: Expression | null;
}

function normalizeParameters(parameters: readonly ParameterInputLike[]): Array<{
  readonly name: string;
  readonly paramType: TypeRef;
  readonly isVarArgs: boolean;
  readonly defaultValue: Expression | null;
}> {
  return parameters.map((parameter) => ({
    name: parameter.name,
    paramType: parameter.paramType,
    isVarArgs: parameter.isVarArgs ?? false,
    defaultValue: parameter.defaultValue ?? null,
  }));
}

export interface ResolvedMember<T> {
  readonly owner: ClassDeclaration;
  readonly member: T;
  readonly depth: number;
}

export class MethodSignature {
  constructor(
    public readonly name: string,
    public readonly parameterTypes: readonly TypeRef[] = [],
    public readonly returnType: TypeRef = voidType(),
  ) {}

  static fromMethod(method: AstMethodDeclaration): MethodSignature {
    return new MethodSignature(
      method.name,
      method.parameters.map((parameter) => parameter.paramType),
      method.returnType,
    );
  }

  equals(other: MethodSignature): boolean {
    return this.name === other.name
      && this.parameterTypes.length === other.parameterTypes.length
      && this.parameterTypes.every((parameterType, index) => sameType(parameterType, other.parameterTypes[index] ?? null))
      && sameType(this.returnType, other.returnType);
  }

  matchesMethod(method: AstMethodDeclaration, options: { readonly ignoreReturnType?: boolean } = {}): boolean {
    return this.name === method.name
      && this.parameterTypes.length === method.parameters.length
      && this.parameterTypes.every((parameterType, index) => sameType(parameterType, method.parameters[index]?.paramType ?? null))
      && ((options.ignoreReturnType ?? false) || sameType(this.returnType, method.returnType));
  }

  toString(): string {
    return `${this.name}(${this.parameterTypes.map(typeToString).join(", ")}): ${typeToString(this.returnType)}`;
  }
}

interface BaseDeclarationOptions {
  readonly visibility?: string | null;
  readonly accessLevel?: AccessLevel;
}

export interface FieldDeclarationOptions extends BaseDeclarationOptions {
  readonly isStatic?: boolean;
  readonly isConstant?: boolean;
}

export interface MethodDeclarationOptions extends BaseDeclarationOptions {
  readonly isStatic?: boolean;
}

export interface ConstructorDeclarationOptions extends BaseDeclarationOptions {}

export interface ClassDeclarationOptions {
  readonly modelType?: string | null;
  readonly visibility?: string | null;
}

export class FieldDeclaration extends AstFieldDeclaration {
  constructor(
    name: string,
    fieldType: TypeRef,
    initializer: Expression | null = null,
    options: FieldDeclarationOptions = {},
  ) {
    assertValidIdentifier(name, "field name");
    super(
      name,
      fieldType,
      initializer,
      options.isStatic ?? false,
      options.isConstant ?? false,
      options.visibility ?? null,
      options.accessLevel ?? AccessLevel.PUBLIC,
    );
  }
}

export class MethodDeclaration extends AstMethodDeclaration {
  constructor(
    name: string,
    returnType: TypeRef = voidType(),
    parameters: ParameterInputLike[] = [],
    body: Statement[] = [],
    options: MethodDeclarationOptions = {},
  ) {
    assertValidIdentifier(name, "method name");
    super(
      name,
      returnType,
      normalizeParameters(parameters),
      body,
      options.isStatic ?? false,
      options.visibility ?? null,
      options.accessLevel ?? AccessLevel.PUBLIC,
    );
  }

  override getSignature(): string {
    return new MethodSignature(
      this.name,
      this.parameters.map((p) => p.paramType),
      this.returnType,
    ).toString();
  }

  getMethodSignature(): MethodSignature {
    return MethodSignature.fromMethod(this);
  }
}

export class ConstructorDeclaration extends AstConstructorDeclaration {
  constructor(
    name: string,
    parameters: ParameterInputLike[] = [],
    body: Statement[] = [],
    options: ConstructorDeclarationOptions = {},
  ) {
    assertValidIdentifier(name, "constructor name");
    super(name, normalizeParameters(parameters), body, options.visibility ?? null);
    this.accessLevel = options.accessLevel ?? AccessLevel.PUBLIC;
  }
}

export class ClassDeclaration extends AstClassDeclaration {
  constructor(
    name: string,
    superClass: string | null = "Object",
    constructors: ConstructorDeclaration[] = [],
    methods: MethodDeclaration[] = [],
    fields: FieldDeclaration[] = [],
    options: ClassDeclarationOptions = {},
  ) {
    assertValidIdentifier(name, "class name");
    super(
      name,
      superClass,
      options.modelType ?? null,
      options.visibility ?? null,
      constructors,
      methods,
      fields,
    );
  }

  addConstructor(constructorDeclaration: ConstructorDeclaration): this {
    attach(this, constructorDeclaration);
    this.constructors.push(constructorDeclaration);
    return this;
  }

  addMethod(method: MethodDeclaration): this {
    attach(this, method);
    this.methods.push(method);
    return this;
  }

  addField(field: FieldDeclaration): this {
    attach(this, field);
    this.fields.push(field);
    return this;
  }

  findMethod(name: string): MethodDeclaration | null {
    return (this.methods as MethodDeclaration[]).find((method) => method.name === name) ?? null;
  }

  findField(name: string): FieldDeclaration | null {
    return (this.fields as FieldDeclaration[]).find((field) => field.name === name) ?? null;
  }

  clone(nameOverride?: string): ClassDeclaration {
    const cloned = cloneClassDeclaration(this, nameOverride);
    return new ClassDeclaration(
      cloned.name,
      cloned.superClass,
      cloned.constructors.map((constructorDeclaration) => new ConstructorDeclaration(
        constructorDeclaration.name,
        constructorDeclaration.parameters,
        constructorDeclaration.body,
        {
          visibility: constructorDeclaration.visibility,
          accessLevel: constructorDeclaration.accessLevel,
        },
      )),
      cloned.methods.map((method) => new MethodDeclaration(
        method.name,
        method.returnType,
        method.parameters,
        method.body,
        {
          isStatic: method.isStatic,
          visibility: method.visibility,
          accessLevel: method.accessLevel,
        },
      )),
      cloned.fields.map((field) => new FieldDeclaration(
        field.name,
        field.fieldType,
        field.initializer,
        {
          isStatic: field.isStatic,
          isConstant: field.isConstant,
          visibility: field.visibility,
          accessLevel: field.accessLevel,
        },
      )),
      {
        modelType: cloned.modelType,
        visibility: cloned.visibility,
      },
    );
  }
}

export class InheritanceResolver {
  readonly #classes = new Map<string, ClassDeclaration>();

  constructor(classes: readonly ClassDeclaration[] = []) {
    this.register(...classes);
  }

  register(...classes: readonly ClassDeclaration[]): this {
    for (const declaration of classes) {
      this.#classes.set(declaration.name, declaration);
    }
    return this;
  }

  resolveClass(input: string | ClassDeclaration | null): ClassDeclaration | null {
    if (input instanceof ClassDeclaration) {
      return input;
    }
    if (typeof input !== "string") {
      return null;
    }
    return this.#classes.get(input) ?? null;
  }

  getHierarchy(input: string | ClassDeclaration | null): ClassDeclaration[] {
    const hierarchy: ClassDeclaration[] = [];
    const visited = new Set<string>();
    let current = this.resolveClass(input);
    while (current && !visited.has(current.name)) {
      hierarchy.push(current);
      visited.add(current.name);
      current = current.superClass ? this.resolveClass(current.superClass) : null;
    }
    return hierarchy;
  }

  resolveField(type: string | ClassDeclaration | null, fieldName: string): ResolvedMember<FieldDeclaration> | null {
    let depth = 0;
    for (const candidate of this.getHierarchy(type)) {
      const field = (candidate.fields as FieldDeclaration[]).find((entry) => entry.name === fieldName);
      if (field) {
        return { owner: candidate, member: field, depth };
      }
      depth += 1;
    }
    return null;
  }

  resolveMethod(
    type: string | ClassDeclaration | null,
    signatureOrName: MethodSignature | string,
    argumentTypes: readonly (TypeRef | null)[] = [],
  ): ResolvedMember<MethodDeclaration> | null {
    let depth = 0;
    for (const candidate of this.getHierarchy(type)) {
      for (const method of candidate.methods as MethodDeclaration[]) {
        if (signatureOrName instanceof MethodSignature) {
          if (signatureOrName.matchesMethod(method)) {
            return { owner: candidate, member: method, depth };
          }
          continue;
        }
        if (method.name !== signatureOrName || method.parameters.length !== argumentTypes.length) {
          continue;
        }
        const compatible = method.parameters.every((parameter, index) => {
          const actualType = argumentTypes[index] ?? null;
          return actualType === null || typeRefsAssignable(parameter.paramType, actualType);
        });
        if (compatible) {
          return { owner: candidate, member: method, depth };
        }
      }
      depth += 1;
    }
    return null;
  }
}
