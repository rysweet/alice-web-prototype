import {
  AbstractDeclaration,
  ClassDeclaration,
  FieldAccess,
  MethodInvocation,
  NamedUserType,
  UserField,
  UserMethod,
} from "../ast-nodes.js";
import type { Scope } from "./shared.js";
import { isSupportedDeclaration } from "./shared.js";

export function resolveIdentifier(
  name: string,
  scope: Scope,
  typeIndex: Map<string, NamedUserType | ClassDeclaration>,
): AbstractDeclaration | null {
  return scope.locals.get(name)
    ?? scope.parameters.get(name)
    ?? findFieldInHierarchy(scope.currentType, name, typeIndex)
    ?? findTypeInHierarchy(scope.currentType, name, typeIndex)
    ?? null;
}

export function resolveFieldAccess(
  expression: FieldAccess,
  scope: Scope,
  typeIndex: Map<string, NamedUserType | ClassDeclaration>,
): AbstractDeclaration | null {
  if (expression.field && isSupportedDeclaration(expression.field)) {
    return expression.field;
  }
  const targetType = expression.target.getType();
  const targetTypeName = targetType?.type === "SimpleTypeRef" ? targetType.name : scope.currentType?.name;
  return targetTypeName
    ? findFieldInHierarchy(typeIndex.get(targetTypeName) ?? scope.currentType, expression.memberName, typeIndex)
    : null;
}

export function resolveMethodInvocation(
  expression: MethodInvocation,
  scope: Scope,
  typeIndex: Map<string, NamedUserType | ClassDeclaration>,
): AbstractDeclaration | null {
  if (expression.method && isSupportedDeclaration(expression.method)) {
    return expression.method;
  }
  const targetType = expression.target?.getType() ?? null;
  const targetTypeName = targetType?.type === "SimpleTypeRef" ? targetType.name : scope.currentType?.name;
  if (!targetTypeName) return null;
  return findMethodInHierarchy(typeIndex.get(targetTypeName) ?? scope.currentType, expression.methodName, expression.arguments.length, typeIndex);
}

function findFieldInHierarchy(
  type: NamedUserType | ClassDeclaration | null | undefined,
  name: string,
  typeIndex: Map<string, NamedUserType | ClassDeclaration>,
): UserField | null {
  if (!type) return null;
  const own = type.fields.find((field) => field.name === name) ?? null;
  return own ?? (type.superClass ? findFieldInHierarchy(typeIndex.get(type.superClass) ?? null, name, typeIndex) : null);
}

function findMethodInHierarchy(
  type: NamedUserType | ClassDeclaration | null | undefined,
  name: string,
  argumentCount: number,
  typeIndex: Map<string, NamedUserType | ClassDeclaration>,
): UserMethod | null {
  if (!type) return null;
  const own = type.methods.find((method) => method.name === name && method.parameters.length === argumentCount) ?? null;
  return own ?? (type.superClass ? findMethodInHierarchy(typeIndex.get(type.superClass) ?? null, name, argumentCount, typeIndex) : null);
}

function findTypeInHierarchy(
  type: NamedUserType | ClassDeclaration | null,
  name: string,
  typeIndex: Map<string, NamedUserType | ClassDeclaration>,
): NamedUserType | ClassDeclaration | null {
  if (type?.name === name) return type;
  return typeIndex.get(name) ?? null;
}
