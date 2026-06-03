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
  return extractBlockStatements(bodyNode, keyMap);
}

function parseStatement(node: Element, keyMap: Map<string, Element>): AliceStatement | null {
  const nodeType = node.getAttribute("type") ?? "";

  if (nodeType === "org.lgna.project.ast.ExpressionStatement") {
    const expressionNode = getPropertyNode(node, "expression", keyMap);
    if (!expressionNode) return null;
    if (expressionNode.getAttribute("type") === "org.lgna.project.ast.MethodInvocation") {
      return parseMethodInvocation(expressionNode, keyMap);
    }
  }

  if (nodeType === "org.lgna.project.ast.Comment") {
    return { kind: "Comment", expression: getPropertyText(node, "text") ?? "" };
  }

  if (nodeType === "org.lgna.project.ast.DoInOrder") {
    return { kind: "DoInOrder", body: extractBodyStatements(node, keyMap) };
  }

  if (nodeType === "org.lgna.project.ast.DoTogether") {
    return { kind: "DoTogether", body: extractBodyStatements(node, keyMap) };
  }

  if (nodeType === "org.lgna.project.ast.WhileLoop") {
    return {
      kind: "WhileLoop",
      condition: extractExpressionSummary(node, "conditional", keyMap),
      body: extractBodyStatements(node, keyMap),
    };
  }

  if (nodeType === "org.lgna.project.ast.CountLoop") {
    const countValue = extractCountValue(node, keyMap);
    return {
      kind: "CountLoop",
      count: countValue,
      countExpression: String(countValue),
      body: extractBodyStatements(node, keyMap),
    };
  }

  if (nodeType === "org.lgna.project.ast.ConditionalStatement") {
    return parseConditionalStatement(node, keyMap);
  }

  if (nodeType === "org.lgna.project.ast.ForEachInArrayLoop") {
    return parseForEachLoop(node, keyMap, "ForEachLoop");
  }

  if (nodeType === "org.lgna.project.ast.EachInArrayTogether") {
    return parseForEachLoop(node, keyMap, "EachInArrayTogether");
  }

  if (nodeType === "org.lgna.project.ast.ReturnStatement") {
    return { kind: "ReturnStatement", expression: extractExpressionSummary(node, "expression", keyMap) };
  }

  if (nodeType === "org.lgna.project.ast.LocalDeclarationStatement") {
    return parseLocalDeclaration(node, keyMap);
  }

  return { kind: nodeType.split(".").pop() ?? "Unknown" };
}

function parseMethodInvocation(invocationNode: Element, keyMap: Map<string, Element>): AliceStatement {
  const callerObject = extractCallerName(invocationNode, keyMap);
  const methodName = extractMethodName(invocationNode, keyMap);
  const args = extractMethodArguments(invocationNode, keyMap);
  return { kind: "MethodCall", method: methodName, object: callerObject, arguments: args };
}

function extractCallerName(invocationNode: Element, keyMap: Map<string, Element>): string {
  const expressionProperty = getProperty(invocationNode, "expression");
  if (!expressionProperty) return "this";
  let exprNode = directChild(expressionProperty, "node");
  if (!exprNode) return "this";
  exprNode = resolve(exprNode, keyMap);
  const exprType = exprNode.getAttribute("type") ?? "";
  if (exprType === "org.lgna.project.ast.FieldAccess") {
    const fieldNode = getPropertyNode(exprNode, "field", keyMap);
    if (fieldNode) {
      const name = getPropertyText(fieldNode, "name");
      if (name) return name;
    }
  }
  if (exprType === "org.lgna.project.ast.ThisExpression") {
    return "this";
  }
  return "this";
}

function extractMethodName(invocationNode: Element, keyMap: Map<string, Element>): string {
  const methodNode = getPropertyNode(invocationNode, "method", keyMap);
  if (!methodNode) return "unknown";
  // JavaMethod: <method name="say"/>
  const methodElement = directChild(methodNode, "method");
  if (methodElement) {
    const name = methodElement.getAttribute("name");
    if (name) return name;
  }
  // UserMethod: <property name="name"><value>myMethod</value></property>
  const name = getPropertyText(methodNode, "name");
  return name ?? "unknown";
}

function extractMethodArguments(invocationNode: Element, keyMap: Map<string, Element>): string[] {
  const args: string[] = [];
  const requiredArgs = getProperty(invocationNode, "requiredArguments");
  if (!requiredArgs) return args;
  const collection = directChild(requiredArgs, "collection");
  const container = collection ?? requiredArgs;
  for (let i = 0; i < container.childNodes.length; i++) {
    const child = container.childNodes[i] as Element;
    if (child.nodeType !== 1 || child.tagName !== "node") continue;
    const resolved = resolve(child, keyMap);
    const exprProp = getProperty(resolved, "expression");
    if (exprProp) {
      let exprNode = directChild(exprProp, "node");
      if (exprNode) {
        exprNode = resolve(exprNode, keyMap);
        const val = getPropertyText(exprNode, "value");
        if (val !== null) { args.push(val); continue; }
      }
    }
    args.push("unknown");
  }
  return args;
}

function extractBodyStatements(parentNode: Element, keyMap: Map<string, Element>): AliceStatement[] {
  const bodyNode = getPropertyNode(parentNode, "body", keyMap);
  if (!bodyNode) return [];
  return extractBlockStatements(bodyNode, keyMap);
}

function extractBlockStatements(blockNode: Element, keyMap: Map<string, Element>): AliceStatement[] {
  const statementsProperty = getProperty(blockNode, "statements");
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

function extractExpressionSummary(node: Element, propertyName: string, keyMap: Map<string, Element>): string {
  const propNode = getPropertyNode(node, propertyName, keyMap);
  if (!propNode) return "unknown";
  const val = getPropertyText(propNode, "value");
  if (val !== null) return val;
  const typeName = propNode.getAttribute("type")?.split(".").pop() ?? "";
  if (typeName === "BooleanLiteral" || typeName === "StringLiteral" || typeName === "IntegerLiteral" || typeName === "DoubleLiteral") {
    return getPropertyText(propNode, "value") ?? "unknown";
  }
  return typeName || "unknown";
}

function extractCountValue(node: Element, keyMap: Map<string, Element>): number {
  const constantNode = getPropertyNode(node, "constant", keyMap);
  if (!constantNode) return 1;
  const val = getPropertyText(constantNode, "value");
  if (val !== null) {
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return 1;
}

function parseConditionalStatement(node: Element, keyMap: Map<string, Element>): AliceStatement {
  const pairsProperty = getProperty(node, "booleanExpressionBodyPairs");
  let condition = "unknown";
  let ifBody: AliceStatement[] = [];

  if (pairsProperty) {
    const collection = directChild(pairsProperty, "collection");
    const container = collection ?? pairsProperty;
    for (let i = 0; i < container.childNodes.length; i++) {
      const child = container.childNodes[i] as Element;
      if (child.nodeType !== 1 || child.tagName !== "node") continue;
      const pair = resolve(child, keyMap);
      condition = extractExpressionSummary(pair, "expression", keyMap);
      ifBody = extractBodyStatements(pair, keyMap);
      break; // only first pair for simple if/else
    }
  }

  const elseBodyNode = getPropertyNode(node, "elseBody", keyMap);
  const elseBody = elseBodyNode ? extractBlockStatements(elseBodyNode, keyMap) : [];

  return { kind: "IfElse", condition, ifBody, elseBody };
}

function parseForEachLoop(node: Element, keyMap: Map<string, Element>, kind: string): AliceStatement {
  const itemNode = getPropertyNode(node, "item", keyMap);
  const itemName = itemNode ? getPropertyText(itemNode, "name") ?? "item" : "item";

  let itemType: string | undefined;
  if (itemNode) {
    const typeNode = getPropertyNode(itemNode, "valueType", keyMap);
    if (typeNode) {
      itemType = extractResolvedTypeName(typeNode, keyMap) ?? undefined;
    }
  }

  const collectionValue = extractExpressionSummary(node, "array", keyMap);
  const body = extractBodyStatements(node, keyMap);

  return { kind, itemName, itemType, collection: collectionValue, body };
}

function parseLocalDeclaration(node: Element, keyMap: Map<string, Element>): AliceStatement {
  const localNode = getPropertyNode(node, "local", keyMap);
  const name = localNode ? getPropertyText(localNode, "name") ?? "unknown" : "unknown";
  let varType = "Object";
  if (localNode) {
    const typeNode = getPropertyNode(localNode, "valueType", keyMap);
    if (typeNode) {
      varType = extractResolvedTypeName(typeNode, keyMap) ?? "Object";
    }
  }
  const initNode = getPropertyNode(node, "initializer", keyMap);
  const value = initNode ? getPropertyText(initNode, "value") ?? "" : "";
  return { kind: "VariableDeclaration", name, varType, value };
}
