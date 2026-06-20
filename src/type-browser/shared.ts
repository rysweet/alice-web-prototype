import {
  AbstractConstructor,
  AbstractField,
  AbstractMethod,
  AbstractNode,
  AbstractType,
  AccessLevel,
  ClassDeclaration,
  ConstructorDeclaration,
  FieldDeclaration,
  FieldModifierFinalVolatileOrNeither,
  JavaType,
  ManagementLevel,
  MethodDeclaration,
  UserParameter,
  simpleTypeRef,
  type Expression,
  type Statement,
  type TypeRef,
} from "../ast-nodes.js";
import { decodeAstNode, encodeAstNode } from "../ast-serialization.js";

export interface TypeSearchOptions {
  query?: string;
  assignableTo?: ClassDeclaration | AbstractType | TypeRef | string | null;
  includeBuiltins?: boolean;
}

export interface TypeHierarchyNode {
  type: AbstractType;
  depth: number;
  children: TypeHierarchyNode[];
}

export interface TypeMemberDescriptor {
  kind: "constructor" | "field" | "method";
  name: string;
  ownerType: string;
  inherited: boolean;
  declaration: AbstractConstructor | AbstractField | AbstractMethod;
  returnType: TypeRef | null;
  parameterTypes: TypeRef[];
}

export interface TypeImportStrategy {
  onTypeConflict?: "merge" | "rename" | "replace";
  onMemberConflict?: "rename" | "skip" | "replace";
}

export interface TypeImportMemberPlan {
  kind: "constructor" | "field" | "method";
  action: "add" | "rename" | "skip" | "replace";
  sourceName: string;
  targetName: string;
  conflictWith: string | null;
}

export interface TypeImportPlan {
  importedTypeName: string;
  targetTypeName: string;
  action: "add-type" | "merge-type" | "rename-type" | "replace-type";
  memberPlans: TypeImportMemberPlan[];
  warnings: string[];
}

export interface TypeBrowserLike {
  allTypes(includeBuiltins?: boolean): AbstractType[];
  resolveType(nameOrType: ClassDeclaration | AbstractType | TypeRef | string | null): AbstractType | null;
  registerType(type: ClassDeclaration): void;
  unregisterType(name: string): boolean;
}

export class TypeBrowserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TypeBrowserError";
  }
}

const DEFAULT_JAVA_TYPES: Array<{ name: string; superType: string | null; primitive?: boolean }> = [
  { name: "Object", superType: null },
  { name: "String", superType: "Object" },
  { name: "Boolean", superType: "Object" },
  { name: "WholeNumber", superType: "Object", primitive: true },
  { name: "DecimalNumber", superType: "Object", primitive: true },
  { name: "Type", superType: "Object" },
  { name: "SThing", superType: "Object" },
  { name: "SGround", superType: "SThing" },
  { name: "SScene", superType: "SThing" },
  { name: "STurnable", superType: "SThing" },
  { name: "SMovableTurnable", superType: "STurnable" },
  { name: "SCamera", superType: "SMovableTurnable" },
  { name: "SModel", superType: "SMovableTurnable" },
  { name: "SJointedModel", superType: "SModel" },
  { name: "SBiped", superType: "SJointedModel" },
  { name: "SFlyer", superType: "SJointedModel" },
  { name: "SQuadruped", superType: "SJointedModel" },
  { name: "SProp", superType: "SJointedModel" },
];

export function attachToOwner(owner: unknown, node: AbstractNode): void {
  (node as unknown as { setParent(parent: unknown): void }).setParent(owner);
}

function cloneNode<T extends Statement | Expression>(node: T): T {
  const cloned = decodeAstNode(encodeAstNode(node));
  if (cloned instanceof ClassDeclaration) {
    throw new TypeBrowserError("expected statement or expression clone");
  }
  return cloned as T;
}

export function cloneTypeRef(typeRef: TypeRef): TypeRef {
  switch (typeRef.type) {
    case "SimpleTypeRef":
      return { ...typeRef };
    case "VoidTypeRef":
      return { type: "VoidTypeRef" };
    case "LambdaTypeRef":
      return { ...typeRef };
  }
}

function cloneExpression(expression: Expression | null): Expression | null {
  return expression ? cloneNode(expression) : null;
}

function cloneParameter(parameter: UserParameter): UserParameter {
  return new UserParameter(
    parameter.name,
    cloneTypeRef(parameter.paramType),
    parameter.isVarArgs,
    cloneExpression(parameter.defaultValue),
    parameter.visibility,
  );
}

export function cloneMethodDeclaration(method: AbstractMethod): MethodDeclaration {
  const userMethod = method as MethodDeclaration;
  return new MethodDeclaration(
    method.name,
    cloneTypeRef(method.returnType),
    method.parameters.map(cloneParameter),
    method.body.map((statement) => cloneNode(statement)),
    method.isStatic,
    method.visibility,
    method.accessLevel,
    userMethod.isAbstract ?? false,
    userMethod.isFinal ?? false,
  );
}

export function cloneFieldDeclaration(field: AbstractField): FieldDeclaration {
  const userField = field as FieldDeclaration;
  return new FieldDeclaration(
    field.name,
    cloneTypeRef(field.fieldType),
    cloneExpression(field.initializer),
    field.isStatic,
    field.isConstant,
    field.visibility,
    field.accessLevel,
    userField.finalVolatileOrNeither ?? FieldModifierFinalVolatileOrNeither.NEITHER,
    userField.isTransient ?? false,
    userField.managementLevel ?? ManagementLevel.NONE,
    userField.isDeletionAllowed ?? true,
  );
}

export function cloneConstructorDeclaration(constructorDeclaration: AbstractConstructor): ConstructorDeclaration {
  return new ConstructorDeclaration(
    constructorDeclaration.name,
    constructorDeclaration.parameters.map(cloneParameter),
    constructorDeclaration.body.map((statement) => cloneNode(statement)),
    constructorDeclaration.visibility,
  );
}

export function cloneClassDeclaration(type: ClassDeclaration, nameOverride?: string): ClassDeclaration {
  return new ClassDeclaration(
    nameOverride ?? type.name,
    type.superClass,
    type.modelType,
    type.visibility,
    type.constructors.map((ctor) => cloneConstructorDeclaration(ctor)),
    type.methods.map((method) => cloneMethodDeclaration(method)),
    type.fields.map((field) => cloneFieldDeclaration(field)),
  );
}

export function signatureForMethod(method: AbstractMethod): string {
  return `${method.name}(${method.parameters.map((parameter) => typeRefToString(parameter.paramType)).join(",")})`;
}

export function signatureForConstructor(constructorDeclaration: AbstractConstructor): string {
  return `constructor(${constructorDeclaration.parameters.map((parameter) => typeRefToString(parameter.paramType)).join(",")})`;
}

export function typeRefToString(typeRef: TypeRef | null): string {
  if (!typeRef) return "null";
  switch (typeRef.type) {
    case "SimpleTypeRef":
      return `${typeRef.name}${typeRef.isArray ? "[]" : ""}`;
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return typeRef.raw;
  }
}

export function isValidIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export function assertValidIdentifier(value: string, kind = "identifier"): void {
  if (!isValidIdentifier(value)) {
    throw new TypeBrowserError(`${kind} must be a valid Java identifier`);
  }
}

export function createUniqueName(baseName: string, existingNames: Iterable<string>): string {
  const existing = new Set(existingNames);
  if (!existing.has(baseName)) {
    return baseName;
  }
  let suffix = 2;
  while (existing.has(`${baseName}${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}${suffix}`;
}

function ensureBuiltinType(name: string, superType: string | null, primitive = false): JavaType {
  const type = JavaType.getInstance(name)!;
  type.superTypeName = superType;
  type.primitive = primitive;
  return type;
}

export function defaultTypes(): AbstractType[] {
  return DEFAULT_JAVA_TYPES.map((entry) => ensureBuiltinType(entry.name, entry.superType, entry.primitive ?? false));
}

export function createDefaultClassDeclaration(name: string, superType = "Object"): ClassDeclaration {
  assertValidIdentifier(name, "type name");
  return new ClassDeclaration(
    name,
    superType,
    null,
    null,
    [new ConstructorDeclaration(name, [], [])],
    [new MethodDeclaration("initialize", { type: "VoidTypeRef" }, [], [], false, null, AccessLevel.PUBLIC, false, false)],
    [new FieldDeclaration("enabled", simpleTypeRef("Boolean"), null, false, false)],
  );
}
