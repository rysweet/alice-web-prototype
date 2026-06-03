import {
  extractResolvedTypeName,
  getCollectionNodesResolved,
  getProperty,
  getPropertyNode,
  getPropertyText,
  directChild,
  resolve,
} from "./dom.js";
import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceObject,
  AliceStatement,
  AliceTypeDefinition,
} from "./types.js";

export const PARSED_A3P_STATEMENT_KINDS = [
  "Comment",
  "MethodCall",
  "CountLoop",
  "IfElse",
  "ReturnStatement",
  "VariableDeclaration",
  "DoInOrder",
  "DoTogether",
  "WhileLoop",
  "ForEachInArrayLoop",
  "EachInArrayTogether",
] as const;

export function extractSceneObjects(namedUserTypes: Element[], keyMap: Map<string, Element>): AliceObject[] {
  const objects: AliceObject[] = [];
  const sceneType = findSceneType(namedUserTypes, keyMap);
  if (!sceneType) return objects;

  const fieldNodes = getCollectionNodesResolved(sceneType, "fields", keyMap)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserField");

  for (const field of fieldNodes) {
    const object = parseUserField(field, keyMap);
    if (object) objects.push(object);
  }

  enrichFromMethods(sceneType, objects, keyMap);
  return objects;
}

export function extractTypes(namedUserTypes: Element[], keyMap: Map<string, Element>): AliceTypeDefinition[] {
  const types: AliceTypeDefinition[] = [];
  const seen = new Set<string>();

  for (const node of namedUserTypes) {
    const identity = node.getAttribute("key") ?? node.getAttribute("uuid") ?? `${types.length}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const name = getPropertyText(node, "name");
    if (!name) continue;

    const methodNodes = getCollectionNodesResolved(node, "methods", keyMap)
      .filter((child) => child.getAttribute("type") === "org.lgna.project.ast.UserMethod");
    const constructorNodes = getCollectionNodesResolved(node, "constructors", keyMap)
      .filter((child) => child.getAttribute("type") === "org.lgna.project.ast.NamedUserConstructor");

    types.push({
      name,
      superTypeName: getSuperTypeName(node, keyMap),
      methods: extractMethods(methodNodes, keyMap, { includeMain: true }),
      constructors: extractConstructors(constructorNodes, keyMap, name),
      fields: extractFieldDefinitions(node, keyMap),
    });
  }

  return types;
}

function extractConstructors(constructorNodes: Element[], keyMap: Map<string, Element>, typeName: string): AliceMethod[] {
  return constructorNodes.map((node) => ({
    name: typeName,
    isFunction: false,
    returnType: typeName,
    parameters: extractParameters(node, keyMap),
    statements: extractStatements(node, keyMap),
  }));
}

function extractFieldDefinitions(typeNode: Element, keyMap: Map<string, Element>): AliceFieldDefinition[] {
  const fields: AliceFieldDefinition[] = [];
  const fieldNodes = getCollectionNodesResolved(typeNode, "fields", keyMap)
    .filter((child) => child.getAttribute("type") === "org.lgna.project.ast.UserField");

  for (const field of fieldNodes) {
    const name = getPropertyText(field, "name");
    if (!name) continue;
    fields.push({
      name,
      typeName: extractFieldValueType(field, keyMap),
      resourceType: extractResourceType(field, keyMap),
      initializer: summarizeInitializer(field, keyMap),
    });
  }

  return fields;
}

function summarizeInitializer(field: Element, keyMap: Map<string, Element>): string | null {
  const initializer = getPropertyNode(field, "initializer", keyMap);
  if (!initializer) return null;
  const resourceType = extractResourceType(field, keyMap);
  if (resourceType) return resourceType;
  return initializer.getAttribute("type")?.split(".").pop() ?? null;
}

function findSceneType(namedUserTypes: Element[], keyMap: Map<string, Element>): Element | null {
  for (const node of namedUserTypes) {
    const superType = getSuperTypeName(node, keyMap);
    if (superType && superType.includes("SScene")) return node;
  }
  return null;
}

function getSuperTypeName(typeNode: Element, keyMap: Map<string, Element>): string | null {
  const superNode = getPropertyNode(typeNode, "superType", keyMap);
  return superNode ? extractResolvedTypeName(superNode, keyMap) : null;
}

function extractFieldValueType(field: Element, keyMap: Map<string, Element>): string | null {
  const valueTypeNode = getPropertyNode(field, "valueType", keyMap);
  if (!valueTypeNode) return null;

  const resolved = resolve(valueTypeNode, keyMap);
  if (resolved.getAttribute("type") === "org.lgna.project.ast.NamedUserType") {
    const userTypeName = getPropertyText(resolved, "name");
    const superTypeName = getSuperTypeName(resolved, keyMap);
    return superTypeName ?? userTypeName ?? null;
  }

  return extractResolvedTypeName(resolved, keyMap);
}

function extractResourceType(field: Element, keyMap: Map<string, Element>): string | null {
  const initializer = getPropertyNode(field, "initializer", keyMap);
  if (!initializer) return null;
  const refs = initializer.getElementsByTagName("resourceReference");
  if (refs.length === 0) return null;

  const reference = refs[0];
  const resourceName = reference.getAttribute("name");
  if (resourceName?.includes(".")) {
    return resourceName;
  }

  const declaringClass = directChild(reference, "declaringClass")?.getAttribute("name");
  return declaringClass ?? resourceName ?? null;
}

function parseUserField(field: Element, keyMap: Map<string, Element>): AliceObject | null {
  const name = getPropertyText(field, "name");
  if (!name) return null;

  let typeName = extractFieldValueType(field, keyMap) ?? "unknown";
  const valueTypeNode = getPropertyNode(field, "valueType", keyMap);
  if (valueTypeNode?.getAttribute("type") === "org.lgna.project.ast.NamedUserType") {
    const superTypeName = getSuperTypeName(valueTypeNode, keyMap);
    if (superTypeName) {
      typeName = superTypeName;
    }
  }

  const resourceType = extractResourceType(field, keyMap);
  return { name, typeName, resourceType, position: null, orientation: null, size: null };
}

function enrichFromMethods(sceneType: Element, objects: AliceObject[], keyMap: Map<string, Element>): void {
  const byName = new Map<string, AliceObject>();
  for (const object of objects) byName.set(object.name, object);

  const allMethods = sceneType.getElementsByTagName("node");
  for (let i = 0; i < allMethods.length; i++) {
    const node = allMethods[i];
    if (node.getAttribute("type") !== "org.lgna.project.ast.MethodInvocation") continue;

    const methodNode = getPropertyNode(node, "method", keyMap);
    if (!methodNode) continue;
    const methodElement = directChild(methodNode, "method");
    if (!methodElement) continue;

    const methodName = methodElement.getAttribute("name") ?? "";
    const expressionProperty = getProperty(node, "expression");
    const fieldName = resolveFieldAccessName(expressionProperty, keyMap);
    if (!fieldName) continue;

    const object = byName.get(fieldName);
    if (!object) continue;

    const doubles = extractDoubleArgs(node);
    if (methodName === "setPositionRelativeToVehicle" && doubles.length >= 3) {
      object.position = { x: doubles[0], y: doubles[1], z: doubles[2] };
    } else if (methodName === "setOrientationRelativeToVehicle" && doubles.length >= 4) {
      object.orientation = { x: doubles[0], y: doubles[1], z: doubles[2], w: doubles[3] };
    } else if (methodName === "setSize" && doubles.length >= 3) {
      object.size = { width: doubles[0], height: doubles[1], depth: doubles[2] };
    }
  }
}

function resolveFieldAccessName(property: Element | null, keyMap: Map<string, Element>): string | null {
  if (!property) return null;
  let expressionNode = directChild(property, "node");
  if (!expressionNode) return null;
  expressionNode = resolve(expressionNode, keyMap);
  if (expressionNode.getAttribute("type") !== "org.lgna.project.ast.FieldAccess") return null;
  const fieldNode = getPropertyNode(expressionNode, "field", keyMap);
  return fieldNode ? getPropertyText(fieldNode, "name") : null;
}

function extractDoubleArgs(methodInvocation: Element): number[] {
  const doubles: number[] = [];
  const requiredArguments = getProperty(methodInvocation, "requiredArguments");
  if (!requiredArguments) return doubles;

  const allNodes = requiredArguments.getElementsByTagName("node");
  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    if (node.getAttribute("type") === "org.lgna.project.ast.DoubleLiteral") {
      const value = getPropertyText(node, "value");
      if (value !== null) doubles.push(parseFloat(value));
    }
  }
  return doubles;
}

export function extractMethods(
  methodNodes: Element[],
  keyMap: Map<string, Element>,
  options: { includeMain: boolean },
): AliceMethod[] {
  const methods: AliceMethod[] = [];

  for (const node of methodNodes) {
    const name = getPropertyText(node, "name");
    if (!name) continue;
    if (!options.includeMain && name === "main") continue;

    const returnType = extractReturnType(node, keyMap);
    methods.push({
      name,
      isFunction: returnType !== "void" && returnType !== "",
      returnType,
      parameters: extractParameters(node, keyMap),
      statements: extractStatements(node, keyMap),
    });
  }

  return methods;
}

function extractReturnType(methodNode: Element, keyMap: Map<string, Element>): string {
  const returnTypeNode = getPropertyNode(methodNode, "returnType", keyMap);
  if (!returnTypeNode) return "void";
  return extractResolvedTypeName(returnTypeNode, keyMap) ?? "void";
}

function extractParameters(methodNode: Element, keyMap: Map<string, Element>): Array<{ name: string; type: string }> {
  const parameters: Array<{ name: string; type: string }> = [];
  const paramNodes = getCollectionNodesResolved(methodNode, "requiredParameters", keyMap)
    .filter((child) => child.getAttribute("type") === "org.lgna.project.ast.UserParameter");

  for (const resolved of paramNodes) {
    const name = getPropertyText(resolved, "name") ?? "unknown";
    const typeNode = getPropertyNode(resolved, "valueType", keyMap);
    parameters.push({
      name,
      type: typeNode ? extractResolvedTypeName(typeNode, keyMap) ?? "Object" : "Object",
    });
  }

  return parameters;
}

function extractStatements(methodNode: Element, keyMap: Map<string, Element>): AliceStatement[] {
  const bodyNode = getPropertyNode(methodNode, "body", keyMap);
  if (!bodyNode) return [];

  const statementsProperty = getProperty(bodyNode, "statements");
  if (!statementsProperty) return [];

  const results: AliceStatement[] = [];
  const collection = directChild(statementsProperty, "collection");
  const container = collection ?? statementsProperty;

  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i] as Element;
    if (child.nodeType !== 1 || child.tagName !== "node") continue;
    const statement = parseStatement(resolve(child, keyMap), keyMap);
    if (statement) results.push(statement);
  }

  return results;
}

function parseStatement(node: Element, keyMap: Map<string, Element>): AliceStatement | null {
  const nodeType = node.getAttribute("type") ?? "";

  if (nodeType === "org.lgna.project.ast.ExpressionStatement") {
    const expressionNode = getPropertyNode(node, "expression", keyMap);
    if (!expressionNode) return null;
    if (expressionNode.getAttribute("type") === "org.lgna.project.ast.MethodInvocation") {
      const methodNode = getPropertyNode(expressionNode, "method", keyMap);
      const callerObject = getPropertyText(expressionNode, "callerObject") ?? "this";
      const args = extractArguments(expressionNode, keyMap);
      return {
        kind: "MethodCall",
        method: methodNode ? getPropertyText(methodNode, "name") || "unknown" : "unknown",
        object: callerObject,
        arguments: args,
      };
    }
  }

  if (nodeType === "org.lgna.project.ast.Comment") {
    return { kind: "Comment", expression: getPropertyText(node, "text") ?? "" };
  }
  if (nodeType === "org.lgna.project.ast.CountLoop") {
    return {
      kind: "CountLoop",
      count: parseIntegerProperty(node, "count") ?? 1,
      body: parseStatementBlock(node, "body", keyMap),
    };
  }
  if (nodeType === "org.lgna.project.ast.ConditionalStatement") {
    return {
      kind: "IfElse",
      condition: getPropertyText(node, "condition") ?? "unknown",
      ifBody: parseStatementBlock(node, "ifBody", keyMap),
      elseBody: parseStatementBlock(node, "elseBody", keyMap),
    };
  }
  if (nodeType === "org.lgna.project.ast.ReturnStatement") {
    return { kind: "ReturnStatement", expression: getPropertyText(node, "expression") ?? "unknown" };
  }
  if (nodeType === "org.lgna.project.ast.LocalDeclarationStatement") {
    return {
      kind: "VariableDeclaration",
      name: getPropertyText(node, "name") ?? "unknown",
      varType: getTypePropertyName(node, "varType", keyMap) ?? "Object",
      value: getPropertyText(node, "value") ?? "",
    };
  }
  if (nodeType === "org.lgna.project.ast.DoInOrder") {
    const body = parseStatementBlock(node, "body", keyMap);
    return { kind: "DoInOrder", body };
  }
  if (nodeType === "org.lgna.project.ast.DoTogether") {
    const body = parseStatementBlock(node, "body", keyMap);
    return { kind: "DoTogether", body };
  }
  if (nodeType === "org.lgna.project.ast.WhileLoop") {
    const body = parseStatementBlock(node, "body", keyMap);
    return { kind: "WhileLoop", condition: getPropertyText(node, "condition") ?? "unknown", body };
  }
  if (nodeType === "org.lgna.project.ast.ForEachInArrayLoop") {
    const body = parseStatementBlock(node, "body", keyMap);
    return {
      kind: "ForEachInArrayLoop",
      itemType: getTypePropertyName(node, "itemType", keyMap) ?? "Object",
      itemName: getPropertyText(node, "itemName") ?? "item",
      collection: getPropertyText(node, "array") ?? getPropertyText(node, "collection") ?? "unknown",
      body,
    };
  }
  if (nodeType === "org.lgna.project.ast.EachInArrayTogether") {
    const body = parseStatementBlock(node, "body", keyMap);
    return {
      kind: "EachInArrayTogether",
      itemType: getTypePropertyName(node, "itemType", keyMap) ?? "Object",
      itemName: getPropertyText(node, "itemName") ?? "item",
      collection: getPropertyText(node, "array") ?? getPropertyText(node, "collection") ?? "unknown",
      body,
    };
  }

  return { kind: nodeType.split(".").pop() ?? "Unknown" };
}

function parseIntegerProperty(node: Element, propertyName: string): number | null {
  const text = getPropertyText(node, propertyName);
  if (text === null) return null;
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? value : null;
}

function getTypePropertyName(node: Element, propertyName: string, keyMap: Map<string, Element>): string | null {
  const typeNode = getPropertyNode(node, propertyName, keyMap);
  return typeNode ? extractResolvedTypeName(typeNode, keyMap) : null;
}

function extractArguments(invocationNode: Element, keyMap: Map<string, Element>): string[] {
  const args: string[] = [];
  const argNodes = getCollectionNodesResolved(invocationNode, "requiredArguments", keyMap);
  for (const argNode of argNodes) {
    const value = getPropertyText(argNode, "value");
    if (value !== null && value !== undefined) {
      args.push(value);
    }
  }
  return args;
}

function parseStatementBlock(parentNode: Element, propertyName: string, keyMap: Map<string, Element>): AliceStatement[] {
  const bodyNode = getPropertyNode(parentNode, propertyName, keyMap);
  if (!bodyNode) return [];
  const statementsProperty = getProperty(bodyNode, "statements");
  if (!statementsProperty) return [];
  const results: AliceStatement[] = [];
  const collection = directChild(statementsProperty, "collection");
  const container = collection ?? statementsProperty;
  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i] as Element;
    if (child.nodeType !== 1 || child.tagName !== "node") continue;
    const statement = parseStatement(resolve(child, keyMap), keyMap);
    if (statement) results.push(statement);
  }
  return results;
}
