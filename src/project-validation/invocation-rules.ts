import {
  directChild,
  elementsByTagName,
  extractFieldValueType,
  extractResolvedTypeName,
  findEnclosingTypeName,
  getCollectionNodesResolved,
  getPropertyNode,
  getPropertyText,
  normalizeTypeName,
  pushError,
  resolve,
  type ProjectValidationError,
  type ValidationContext,
} from "./shared.js";

interface MethodSignature {
  name: string;
  parameterTypes: string[];
  varArgs: boolean;
}

const KNOWN_TRANSFORM_METHOD_SIGNATURES = new Map<string, string[]>([
  ["setPositionRelativeToVehicle", ["java.lang.Double", "java.lang.Double", "java.lang.Double"]],
  ["setOrientationRelativeToVehicle", ["java.lang.Double", "java.lang.Double", "java.lang.Double", "java.lang.Double"]],
  ["setSize", ["java.lang.Double", "java.lang.Double", "java.lang.Double"]],
]);

export function validateMethodInvocations(
  context: ValidationContext,
  errors: ProjectValidationError[],
): void {
  for (const invocation of elementsByTagName(context.doc, "node")) {
    if (invocation.getAttribute("type") !== "org.lgna.project.ast.MethodInvocation") {
      continue;
    }
    const methodNode = getPropertyNode(invocation, "method", context.keyMap);
    if (!methodNode) {
      pushError(
        context,
        errors,
        invocation,
        "invalid-method-argument-count",
        "method invocation does not resolve its target method.",
      );
      continue;
    }
    const signature = readMethodSignature(methodNode, context.keyMap);
    if (!signature) {
      continue;
    }

    const argumentNodes = getArgumentNodes(invocation, context.keyMap);
    if (!matchesArgumentCount(signature, argumentNodes.length)) {
      pushError(
        context,
        errors,
        invocation,
        "invalid-method-argument-count",
        `method ${signature.name} expects ${describeParameterCount(signature)} but received ${argumentNodes.length}.`,
      );
      continue;
    }

    for (let index = 0; index < Math.min(signature.parameterTypes.length, argumentNodes.length); index += 1) {
      const expectedType = signature.parameterTypes[index]!;
      const actualType = inferExpressionType(argumentNodes[index]!, context);
      if (!actualType) {
        continue;
      }
      if (!isTypeAssignable(expectedType, actualType, context)) {
        pushError(
          context,
          errors,
          argumentNodes[index]!,
          "invalid-method-argument-type",
          `method ${signature.name} argument ${index + 1} expects ${expectedType} but received ${actualType}.`,
        );
      }
    }
  }
}

function readMethodSignature(methodNode: Element, keyMap: Map<string, Element>): MethodSignature | null {
  const resolved = resolve(methodNode, keyMap);
  const childMethod = directChild(resolved, "method");
  const childConstructor = directChild(resolved, "constructor");

  if (childMethod || childConstructor) {
    const signatureNode = childMethod ?? childConstructor;
    if (!signatureNode) {
      return null;
    }
    const parameterTypes = directChild(signatureNode, "parameters")
      ? elementsByTagName(signatureNode, "type")
        .map((typeNode) => typeNode.getAttribute("name")?.trim() ?? "")
        .filter((value) => value.length > 0)
      : [];
    const explicitName = childMethod?.getAttribute("name")
      ?? getPropertyText(resolved, "name")
      ?? "method";
    return {
      name: explicitName,
      parameterTypes: parameterTypes.length > 0
        ? parameterTypes
        : KNOWN_TRANSFORM_METHOD_SIGNATURES.get(explicitName) ?? parameterTypes,
      varArgs: (signatureNode.getAttribute("isVarArgs") ?? "false") === "true",
    };
  }

  const parameterTypes = getCollectionNodesResolved(resolved, "requiredParameters", keyMap)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserParameter")
    .map((node) => extractResolvedTypeName(getPropertyNode(node, "valueType", keyMap), keyMap) ?? "java.lang.Object");

  return {
    name: getPropertyText(resolved, "name") ?? "method",
    parameterTypes,
    varArgs: false,
  };
}

function getArgumentNodes(invocation: Element, keyMap: Map<string, Element>): Element[] {
  const required = getCollectionNodesResolved(invocation, "requiredArguments", keyMap);
  const variable = getCollectionNodesResolved(invocation, "variableArguments", keyMap);
  const keyed = getCollectionNodesResolved(invocation, "keyedArguments", keyMap);
  return [...required, ...variable, ...keyed];
}

function matchesArgumentCount(signature: MethodSignature, actualCount: number): boolean {
  if (signature.varArgs) {
    return actualCount >= Math.max(signature.parameterTypes.length - 1, 0);
  }
  return signature.parameterTypes.length === actualCount;
}

function describeParameterCount(signature: MethodSignature): string {
  if (signature.varArgs) {
    return `${Math.max(signature.parameterTypes.length - 1, 0)}+ arguments`;
  }
  return `${signature.parameterTypes.length} arguments`;
}

function inferExpressionType(expression: Element, context: ValidationContext): string | null {
  const resolved = resolve(expression, context.keyMap);
  const typeName = resolved.getAttribute("type") ?? "";
  switch (typeName) {
    case "org.lgna.project.ast.StringLiteral":
      return "java.lang.String";
    case "org.lgna.project.ast.BooleanLiteral":
      return "java.lang.Boolean";
    case "org.lgna.project.ast.DoubleLiteral":
      return "java.lang.Double";
    case "org.lgna.project.ast.FloatLiteral":
      return "java.lang.Float";
    case "org.lgna.project.ast.IntegerLiteral":
      return "java.lang.Integer";
    case "org.lgna.project.ast.LongLiteral":
      return "java.lang.Long";
    case "org.lgna.project.ast.NullLiteral":
      return "null";
    case "org.lgna.project.ast.ThisExpression":
      return findEnclosingTypeName(resolved, context.keyMap);
    case "org.lgna.project.ast.FieldAccess": {
      const fieldNode = getPropertyNode(resolved, "field", context.keyMap);
      return fieldNode ? extractFieldValueType(fieldNode, context.keyMap) : null;
    }
    case "org.lgna.project.ast.ParameterAccess": {
      const parameterNode = getPropertyNode(resolved, "parameter", context.keyMap);
      const valueType = parameterNode ? getPropertyNode(parameterNode, "valueType", context.keyMap) : null;
      return valueType ? extractResolvedTypeName(valueType, context.keyMap) : null;
    }
    case "org.lgna.project.ast.LocalAccess": {
      const localNode = getPropertyNode(resolved, "local", context.keyMap);
      const valueType = localNode ? getPropertyNode(localNode, "valueType", context.keyMap) : null;
      return valueType ? extractResolvedTypeName(valueType, context.keyMap) : null;
    }
    case "org.lgna.project.ast.MethodInvocation": {
      const methodNode = getPropertyNode(resolved, "method", context.keyMap);
      const returnType = methodNode ? getPropertyNode(methodNode, "returnType", context.keyMap) : null;
      return returnType ? extractResolvedTypeName(returnType, context.keyMap) : null;
    }
    case "org.lgna.project.ast.InstanceCreation": {
      const constructorNode = getPropertyNode(resolved, "constructor", context.keyMap);
      const signature = constructorNode ? readMethodSignature(constructorNode, context.keyMap) : null;
      const childConstructor = constructorNode ? directChild(resolve(constructorNode, context.keyMap), "constructor") : null;
      const declaring = childConstructor?.getElementsByTagName("declaringClass")[0]?.getAttribute("name") ?? null;
      return declaring ?? signature?.name ?? null;
    }
    default:
      return null;
  }
}

function isTypeAssignable(expectedType: string, actualType: string, context: ValidationContext): boolean {
  if (actualType === "null") {
    return true;
  }
  const expected = normalizeTypeName(expectedType);
  const actual = normalizeTypeName(actualType);
  if (expected === actual) {
    return true;
  }
  if (expected === "java.lang.Object") {
    return true;
  }
  if (expected === actualType || actual === expectedType) {
    return true;
  }
  let current = context.userTypes.get(actual);
  const visited = new Set<string>();
  while (current?.superTypeName && !visited.has(current.name)) {
    visited.add(current.name);
    const parent = normalizeTypeName(current.superTypeName);
    if (parent === expected) {
      return true;
    }
    current = context.userTypes.get(parent);
  }
  return false;
}
