import {
  type AliceFieldDefinition,
  type AliceMethod,
  type AliceObject,
  type AliceProject,
  type AliceStatement,
  type AliceTypeDefinition,
  getA3PSource,
  snapshotAliceProject,
} from "../a3p-parser.js";
import {
  MINIMAL_PROJECT_XML_TEMPLATE,
  directChild,
  directCollectionNodes,
  ensureXmlTools,
  findSceneTypeDefinition,
  findSceneTypeNode,
  generateUuid,
  getNamedUserTypeNodes,
  getProperty,
  getPropertyNode,
  getPropertyText,
  parseXmlString,
  preserveXmlDeclaration,
  serializeXmlString,
} from "./xml-tools.js";

export const SUPPORTED_A3P_STATEMENT_KINDS = [
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
  "VariableAssignment",
  "EventListener",
  "ForEach",
] as const;

export function buildProjectXml(project: AliceProject, baseXmlText: string | null): string {
  const source = getA3PSource(project);
  if (baseXmlText !== null && source?.snapshot === snapshotAliceProject(project)) {
    return baseXmlText;
  }

  const doc = parseXmlString(baseXmlText ?? MINIMAL_PROJECT_XML_TEMPLATE);
  const root = doc.documentElement;
  setPropertyText(doc, root, "name", project.projectName || "Program");

  const typeNodes = getNamedUserTypeNodes(doc);
  const sceneTypeNode = findSceneTypeNode(typeNodes);
  const sceneType = findSceneTypeDefinition(project.types);

  if (sceneTypeNode) {
    const desiredFields = buildDesiredSceneFields(project, sceneType);
    const desiredMethods = buildDesiredSceneMethods(project, sceneType);
    if (sceneType?.name) {
      setPropertyText(doc, sceneTypeNode, "name", sceneType.name);
    }
    syncFields(doc, sceneTypeNode, desiredFields);
    syncMethods(doc, sceneTypeNode, desiredMethods);
  }

  if (project.types?.length) {
    const typeMap = new Map<string, Element>();
    for (const node of getNamedUserTypeNodes(doc)) {
      const name = getPropertyText(node, "name");
      if (name) typeMap.set(name, node);
    }

    for (const type of project.types) {
      const isSceneType = type.superTypeName?.includes("SScene") ?? false;
      let targetNode = isSceneType ? sceneTypeNode : typeMap.get(type.name) ?? null;
      if (!targetNode && !isSceneType) {
        targetNode = createNamedUserTypeNode(doc, type, root.getAttribute("version"));
        ensureCollectionProperty(doc, root, "declaredTypes").appendChild(targetNode);
        typeMap.set(type.name, targetNode);
      }
      if (targetNode) {
        syncNamedUserType(doc, targetNode, type);
      }
    }
  }

  return preserveXmlDeclaration(baseXmlText, serializeXmlString(doc));
}

function buildDesiredSceneFields(project: AliceProject, sceneType: AliceTypeDefinition | null): AliceFieldDefinition[] {
  const fields = [...(sceneType?.fields ?? [])];
  const seen = new Set(fields.map((field) => field.name));
  for (const object of project.sceneObjects) {
    if (!seen.has(object.name)) {
      fields.push(fieldFromSceneObject(object));
      seen.add(object.name);
    }
  }
  return fields;
}

function buildDesiredSceneMethods(project: AliceProject, sceneType: AliceTypeDefinition | null): AliceMethod[] {
  const methods = [...(sceneType?.methods ?? [])];
  const seen = new Set(methods.map((method) => method.name));
  const knownTypeMethodNames = new Set<string>();
  for (const type of project.types ?? []) {
    for (const method of type.methods ?? []) {
      knownTypeMethodNames.add(method.name);
    }
  }
  for (const method of project.methods) {
    if (!knownTypeMethodNames.has(method.name) && !seen.has(method.name)) {
      methods.push(method);
      seen.add(method.name);
    }
  }
  return methods;
}

function fieldFromSceneObject(object: AliceObject): AliceFieldDefinition {
  return {
    name: object.name,
    typeName: object.typeName,
    resourceType: object.resourceType,
    initializer: object.resourceType ?? null,
  };
}

function syncNamedUserType(doc: Document, typeNode: Element, desired: AliceTypeDefinition): void {
  setPropertyText(doc, typeNode, "name", desired.name);
  if (desired.superTypeName) {
    setTypeProperty(doc, typeNode, "superType", desired.superTypeName);
  }
  if (desired.fields) syncFields(doc, typeNode, desired.fields);
  if (desired.methods) syncMethods(doc, typeNode, desired.methods);
  if (desired.constructors) syncConstructors(doc, typeNode, desired);
}

function syncFields(doc: Document, typeNode: Element, desiredFields: AliceFieldDefinition[]): void {
  const collection = ensureCollectionProperty(doc, typeNode, "fields");
  const existingFields = directCollectionNodes(collection)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserField");

  for (let index = 0; index < existingFields.length && index < desiredFields.length; index += 1) {
    updateFieldNode(doc, existingFields[index], desiredFields[index]);
  }
  for (let index = existingFields.length; index < desiredFields.length; index += 1) {
    collection.appendChild(createFieldNode(doc, desiredFields[index]));
  }
}

function updateFieldNode(doc: Document, fieldNode: Element, desired: AliceFieldDefinition): void {
  setPropertyText(doc, fieldNode, "name", desired.name);
  if (desired.typeName) setTypeProperty(doc, fieldNode, "valueType", desired.typeName);
  if (desired.resourceType) setResourceInitializer(doc, fieldNode, desired.resourceType);
}

function syncMethods(doc: Document, typeNode: Element, desiredMethods: AliceMethod[]): void {
  const collection = ensureCollectionProperty(doc, typeNode, "methods");
  const existingMethods = directCollectionNodes(collection)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserMethod");
  const desiredNames = new Set(desiredMethods.map((method) => method.name));
  const existingByName = new Map<string, Element>();

  for (const methodNode of existingMethods) {
    const name = getPropertyText(methodNode, "name");
    if (name) existingByName.set(name, methodNode);
  }

  for (let index = 0; index < Math.min(existingMethods.length, desiredMethods.length); index += 1) {
    const existingNode = existingMethods[index];
    const existingName = getPropertyText(existingNode, "name");
    const desired = desiredMethods[index];
    if (existingName && existingName !== desired.name && !desiredNames.has(existingName) && !existingByName.has(desired.name)) {
      setPropertyText(doc, existingNode, "name", desired.name);
      syncMethodSignature(doc, existingNode, desired);
      existingByName.delete(existingName);
      existingByName.set(desired.name, existingNode);
    }
  }

  for (const desired of desiredMethods) {
    const existingNode = existingByName.get(desired.name);
    if (existingNode) {
      syncMethodSignature(doc, existingNode, desired);
    } else {
      collection.appendChild(createMethodNode(doc, desired));
    }
  }
}

function syncMethodSignature(doc: Document, methodNode: Element, desired: AliceMethod): void {
  setPropertyText(doc, methodNode, "name", desired.name);
  setTypeProperty(doc, methodNode, "returnType", desired.isFunction ? desired.returnType : "void");
  const paramsCollection = ensureCollectionProperty(doc, methodNode, "requiredParameters");
  while (paramsCollection.firstChild) paramsCollection.removeChild(paramsCollection.firstChild);
  for (const parameter of desired.parameters) {
    paramsCollection.appendChild(createParameterNode(doc, parameter.name, parameter.type));
  }

  if (desired.statements.length === 0) {
    return;
  }

  let bodyNode = getPropertyNode(methodNode, "body");
  if (!bodyNode) {
    const bodyProperty = doc.createElement("property");
    bodyProperty.setAttribute("name", "body");
    bodyNode = doc.createElement("node");
    bodyNode.setAttribute("type", "org.lgna.project.ast.BlockStatement");
    bodyNode.setAttribute("uuid", generateUuid());
    appendBooleanProperty(doc, bodyNode, "isEnabled", true);
    bodyProperty.appendChild(bodyNode);
    methodNode.appendChild(bodyProperty);
  }

  const statementsCollection = ensureCollectionProperty(doc, bodyNode, "statements");
  while (statementsCollection.firstChild) statementsCollection.removeChild(statementsCollection.firstChild);
  appendSupportedStatements(doc, statementsCollection, desired.statements);
}

function syncConstructors(doc: Document, typeNode: Element, desiredType: AliceTypeDefinition): void {
  const desiredConstructors = desiredType.constructors ?? [];
  const collection = ensureCollectionProperty(doc, typeNode, "constructors");
  const existingConstructors = directCollectionNodes(collection)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.NamedUserConstructor");

  for (let index = 0; index < existingConstructors.length && index < desiredConstructors.length; index += 1) {
    syncConstructorSignature(doc, existingConstructors[index], desiredConstructors[index], desiredType.superTypeName ?? null);
  }
  for (let index = existingConstructors.length; index < desiredConstructors.length; index += 1) {
    collection.appendChild(createConstructorNode(doc, desiredConstructors[index], desiredType.superTypeName ?? null));
  }
}

function syncConstructorSignature(
  doc: Document,
  constructorNode: Element,
  desired: AliceMethod,
  superTypeName: string | null,
): void {
  const paramsCollection = ensureCollectionProperty(doc, constructorNode, "requiredParameters");
  while (paramsCollection.firstChild) paramsCollection.removeChild(paramsCollection.firstChild);
  for (const parameter of desired.parameters) {
    paramsCollection.appendChild(createParameterNode(doc, parameter.name, parameter.type));
  }

  const bodyNode = ensureConstructorBodyNode(doc, constructorNode, superTypeName);
  const statementsCollection = ensureCollectionProperty(doc, bodyNode, "statements");
  while (statementsCollection.firstChild) statementsCollection.removeChild(statementsCollection.firstChild);
  appendSupportedStatements(doc, statementsCollection, desired.statements);
}

function createMethodNode(doc: Document, method: AliceMethod): Element {
  const methodNode = doc.createElement("node");
  methodNode.setAttribute("type", "org.lgna.project.ast.UserMethod");
  methodNode.setAttribute("uuid", generateUuid());
  appendBooleanProperty(doc, methodNode, "isStatic", false);
  appendBooleanProperty(doc, methodNode, "isAbstract", false);
  appendBooleanProperty(doc, methodNode, "isFinal", false);
  appendStringProperty(doc, methodNode, "name", method.name);
  appendStringProperty(doc, methodNode, "accessLevel", "PRIVATE", "org.lgna.project.ast.AccessLevel");
  appendBooleanProperty(doc, methodNode, "isSynchronized", false);
  appendBooleanProperty(doc, methodNode, "isStrictFloatingPoint", false);
  appendTypeProperty(doc, methodNode, "returnType", method.isFunction ? method.returnType : "void");

  const paramsProperty = doc.createElement("property");
  paramsProperty.setAttribute("name", "requiredParameters");
  const paramsCollection = doc.createElement("collection");
  paramsCollection.setAttribute("type", "java.util.ArrayList");
  for (const parameter of method.parameters) {
    paramsCollection.appendChild(createParameterNode(doc, parameter.name, parameter.type));
  }
  paramsProperty.appendChild(paramsCollection);
  methodNode.appendChild(paramsProperty);

  const bodyProperty = doc.createElement("property");
  bodyProperty.setAttribute("name", "body");
  const bodyNode = doc.createElement("node");
  bodyNode.setAttribute("type", "org.lgna.project.ast.BlockStatement");
  bodyNode.setAttribute("uuid", generateUuid());
  const statementsProperty = doc.createElement("property");
  statementsProperty.setAttribute("name", "statements");
  const statementsCollection = doc.createElement("collection");
  statementsCollection.setAttribute("type", "java.util.ArrayList");
  appendSupportedStatements(doc, statementsCollection, method.statements);
  statementsProperty.appendChild(statementsCollection);
  bodyNode.appendChild(statementsProperty);
  appendBooleanProperty(doc, bodyNode, "isEnabled", true);
  bodyProperty.appendChild(bodyNode);
  methodNode.appendChild(bodyProperty);

  appendStringProperty(doc, methodNode, "managementLevel", "NONE", "org.lgna.project.ast.ManagementLevel");
  appendBooleanProperty(doc, methodNode, "isSignatureLocked", false);
  appendBooleanProperty(doc, methodNode, "isDeletionAllowed", true);
  return methodNode;
}

function createConstructorNode(doc: Document, constructor: AliceMethod, superTypeName: string | null): Element {
  const constructorNode = doc.createElement("node");
  constructorNode.setAttribute("type", "org.lgna.project.ast.NamedUserConstructor");
  constructorNode.setAttribute("uuid", generateUuid());

  const paramsCollection = appendCollectionProperty(doc, constructorNode, "requiredParameters");
  for (const parameter of constructor.parameters) {
    paramsCollection.appendChild(createParameterNode(doc, parameter.name, parameter.type));
  }
  const bodyProperty = doc.createElement("property");
  bodyProperty.setAttribute("name", "body");
  bodyProperty.appendChild(createConstructorBodyNode(doc, superTypeName, constructor.statements));
  constructorNode.appendChild(bodyProperty);

  appendStringProperty(doc, constructorNode, "accessLevel", "PUBLIC", "org.lgna.project.ast.AccessLevel");
  appendStringProperty(doc, constructorNode, "managementLevel", "NONE", "org.lgna.project.ast.ManagementLevel");
  appendBooleanProperty(doc, constructorNode, "isSignatureLocked", false);
  appendBooleanProperty(doc, constructorNode, "isDeletionAllowed", false);
  return constructorNode;
}

function createConstructorBodyNode(
  doc: Document,
  superTypeName: string | null,
  statements: AliceMethod["statements"] = [],
): Element {
  const bodyNode = doc.createElement("node");
  bodyNode.setAttribute("type", "org.lgna.project.ast.ConstructorBlockStatement");
  bodyNode.setAttribute("uuid", generateUuid());

  const constructorInvocationProperty = doc.createElement("property");
  constructorInvocationProperty.setAttribute("name", "constructorInvocationStatement");
  const invocationNode = doc.createElement("node");
  invocationNode.setAttribute("type", "org.lgna.project.ast.SuperConstructorInvocationStatement");
  invocationNode.setAttribute("uuid", generateUuid());
  const constructorProperty = doc.createElement("property");
  constructorProperty.setAttribute("name", "constructor");
  constructorProperty.appendChild(createJavaConstructorNode(doc, superTypeName));
  invocationNode.appendChild(constructorProperty);
  appendCollectionProperty(doc, invocationNode, "requiredArguments");
  appendCollectionProperty(doc, invocationNode, "variableArguments");
  appendCollectionProperty(doc, invocationNode, "keyedArguments");
  appendBooleanProperty(doc, invocationNode, "isEnabled", true);
  constructorInvocationProperty.appendChild(invocationNode);
  bodyNode.appendChild(constructorInvocationProperty);

  const statementsCollection = appendCollectionProperty(doc, bodyNode, "statements");
  appendSupportedStatements(doc, statementsCollection, statements);
  appendBooleanProperty(doc, bodyNode, "isEnabled", true);
  return bodyNode;
}

function ensureConstructorBodyNode(doc: Document, constructorNode: Element, superTypeName: string | null): Element {
  const bodyProperty = ensureProperty(doc, constructorNode, "body");
  let bodyNode = directChild(bodyProperty, "node");
  if (!bodyNode) {
    while (bodyProperty.firstChild) bodyProperty.removeChild(bodyProperty.firstChild);
    bodyNode = createConstructorBodyNode(doc, superTypeName);
    bodyProperty.appendChild(bodyNode);
  }
  return bodyNode;
}

function createJavaConstructorNode(doc: Document, declaringClassName: string | null): Element {
  const constructorNode = doc.createElement("node");
  constructorNode.setAttribute("type", "org.lgna.project.ast.JavaConstructor");
  constructorNode.setAttribute("uuid", generateUuid());
  const constructorElement = doc.createElement("constructor");
  constructorElement.setAttribute("isVarArgs", "false");
  const declaringClass = doc.createElement("declaringClass");
  declaringClass.setAttribute("name", declaringClassName || "java.lang.Object");
  constructorElement.appendChild(declaringClass);
  constructorElement.appendChild(doc.createElement("parameters"));
  constructorNode.appendChild(constructorElement);
  return constructorNode;
}

function createNamedUserTypeNode(doc: Document, type: AliceTypeDefinition, version: string | null): Element {
  const typeNode = doc.createElement("node");
  typeNode.setAttribute("type", "org.lgna.project.ast.NamedUserType");
  typeNode.setAttribute("uuid", generateUuid());
  if (version) {
    typeNode.setAttribute("version", version);
  }
  appendStringProperty(doc, typeNode, "name", type.name);
  appendNullProperty(doc, typeNode, "_package");
  appendCollectionProperty(doc, typeNode, "constructors");
  appendStringProperty(doc, typeNode, "accessLevel", "PUBLIC", "org.lgna.project.ast.AccessLevel");
  appendStringProperty(doc, typeNode, "finalAbstractOrNeither", "NEITHER", "org.lgna.project.ast.TypeModifierFinalAbstractOrNeither");
  appendBooleanProperty(doc, typeNode, "isStrictFloatingPoint", false);
  appendTypeProperty(doc, typeNode, "superType", type.superTypeName || "java.lang.Object");
  appendCollectionProperty(doc, typeNode, "methods");
  appendCollectionProperty(doc, typeNode, "fields");
  return typeNode;
}

function appendSupportedStatements(doc: Document, collection: Element, statements: AliceMethod["statements"]): void {
  for (const statement of statements) {
    collection.appendChild(createStatementNode(doc, statement));
  }
}

function createStatementNode(doc: Document, statement: AliceMethod["statements"][number]): Element {
  switch (statement.kind) {
    case "Comment": {
      const commentNode = doc.createElement("node");
      commentNode.setAttribute("type", "org.lgna.project.ast.Comment");
      commentNode.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, commentNode, "text", statement.expression ?? "");
      appendBooleanProperty(doc, commentNode, "isEnabled", true);
      return commentNode;
    }
    case "MethodCall": {
      return createExpressionStatementNode(doc, createMethodInvocationNode(doc, statement));
    }
    case "CountLoop": {
      const loopNode = doc.createElement("node");
      loopNode.setAttribute("type", "org.lgna.project.ast.CountLoop");
      loopNode.setAttribute("uuid", generateUuid());
      appendBooleanProperty(doc, loopNode, "isEnabled", true);
      appendStringProperty(doc, loopNode, "count", String(statement.count ?? 1), "java.lang.Integer");
      appendBlockBody(doc, loopNode, statement.body ?? []);
      return loopNode;
    }
    case "IfElse": {
      const condNode = doc.createElement("node");
      condNode.setAttribute("type", "org.lgna.project.ast.ConditionalStatement");
      condNode.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, condNode, "condition", statement.condition ?? "unknown");
      appendStatementBlockProperty(doc, condNode, "ifBody", statement.ifBody ?? []);
      appendStatementBlockProperty(doc, condNode, "elseBody", statement.elseBody ?? []);
      appendBooleanProperty(doc, condNode, "isEnabled", true);
      return condNode;
    }
    case "ReturnStatement": {
      const retNode = doc.createElement("node");
      retNode.setAttribute("type", "org.lgna.project.ast.ReturnStatement");
      retNode.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, retNode, "expression", statement.expression ?? "");
      appendBooleanProperty(doc, retNode, "isEnabled", true);
      return retNode;
    }
    case "VariableDeclaration": {
      const declNode = doc.createElement("node");
      declNode.setAttribute("type", "org.lgna.project.ast.LocalDeclarationStatement");
      declNode.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, declNode, "name", statement.name ?? "unknown");
      appendTypeProperty(doc, declNode, "varType", statement.varType ?? "java.lang.Object");
      appendStringProperty(doc, declNode, "value", statement.value ?? "");
      appendBooleanProperty(doc, declNode, "isEnabled", true);
      return declNode;
    }
    case "DoInOrder": {
      const doNode = doc.createElement("node");
      doNode.setAttribute("type", "org.lgna.project.ast.DoInOrder");
      doNode.setAttribute("uuid", generateUuid());
      appendBooleanProperty(doc, doNode, "isEnabled", true);
      appendBlockBody(doc, doNode, statement.body ?? []);
      return doNode;
    }
    case "DoTogether": {
      const dtNode = doc.createElement("node");
      dtNode.setAttribute("type", "org.lgna.project.ast.DoTogether");
      dtNode.setAttribute("uuid", generateUuid());
      appendBooleanProperty(doc, dtNode, "isEnabled", true);
      appendBlockBody(doc, dtNode, statement.body ?? []);
      return dtNode;
    }
    case "WhileLoop": {
      const whNode = doc.createElement("node");
      whNode.setAttribute("type", "org.lgna.project.ast.WhileLoop");
      whNode.setAttribute("uuid", generateUuid());
      appendBooleanProperty(doc, whNode, "isEnabled", true);
      appendStringProperty(doc, whNode, "condition", statement.condition ?? "unknown");
      appendBlockBody(doc, whNode, statement.body ?? []);
      return whNode;
    }
    case "ForEachInArrayLoop": {
      return createForEachInArrayLoopNode(doc, "org.lgna.project.ast.ForEachInArrayLoop", statement);
    }
    case "EachInArrayTogether": {
      return createForEachInArrayLoopNode(doc, "org.lgna.project.ast.EachInArrayTogether", statement);
    }
    case "VariableAssignment": {
      const assignment = doc.createElement("node");
      assignment.setAttribute("type", "org.lgna.project.ast.AssignmentExpression");
      assignment.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, assignment, "leftHandSide", statement.name ?? "unknown");
      appendStringProperty(doc, assignment, "rightHandSide", statement.value ?? "");
      return createExpressionStatementNode(doc, assignment);
    }
    case "EventListener": {
      const invocation = createMethodInvocationNode(doc, {
        kind: "MethodCall",
        object: statement.object ?? "this",
        method: statement.event ?? "unknown",
        arguments: [],
      });
      const argsCollection = ensureCollectionProperty(doc, invocation, "requiredArguments");
      const lambda = doc.createElement("node");
      lambda.setAttribute("type", "org.lgna.project.ast.LambdaExpression");
      lambda.setAttribute("uuid", generateUuid());
      appendBlockBody(doc, lambda, statement.body ?? []);
      argsCollection.appendChild(lambda);
      return createExpressionStatementNode(doc, invocation);
    }
    case "ForEach": {
      return createForEachInArrayLoopNode(doc, "org.lgna.project.ast.ForEachInArrayLoop", statement);
    }
    default:
      throw new Error(`Unsupported A3P statement kind: ${statement.kind}`);
  }
}

function createMethodInvocationNode(doc: Document, statement: AliceStatement): Element {
  const invocation = doc.createElement("node");
  invocation.setAttribute("type", "org.lgna.project.ast.MethodInvocation");
  invocation.setAttribute("uuid", generateUuid());

  const methodRef = doc.createElement("node");
  methodRef.setAttribute("type", "org.lgna.project.ast.JavaMethod");
  methodRef.setAttribute("uuid", generateUuid());
  appendStringProperty(doc, methodRef, "name", statement.method || "unknown");
  const methodProp = doc.createElement("property");
  methodProp.setAttribute("name", "method");
  methodProp.appendChild(methodRef);
  invocation.appendChild(methodProp);

  if (statement.object && statement.object !== "this") {
    appendStringProperty(doc, invocation, "callerObject", statement.object);
  }

  if (statement.arguments?.length) {
    const argsCollection = appendCollectionProperty(doc, invocation, "requiredArguments");
    for (const arg of statement.arguments) {
      const argNode = doc.createElement("node");
      argNode.setAttribute("type", "org.lgna.project.ast.SimpleArgument");
      argNode.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, argNode, "value", arg);
      argsCollection.appendChild(argNode);
    }
  }

  return invocation;
}

function createExpressionStatementNode(doc: Document, expressionNode: Element): Element {
  const exprStmt = doc.createElement("node");
  exprStmt.setAttribute("type", "org.lgna.project.ast.ExpressionStatement");
  exprStmt.setAttribute("uuid", generateUuid());
  appendBooleanProperty(doc, exprStmt, "isEnabled", true);

  const exprProp = doc.createElement("property");
  exprProp.setAttribute("name", "expression");
  exprProp.appendChild(expressionNode);
  exprStmt.appendChild(exprProp);
  return exprStmt;
}

function createForEachInArrayLoopNode(doc: Document, nodeType: string, statement: AliceStatement): Element {
      const feNode = doc.createElement("node");
      feNode.setAttribute("type", nodeType);
      feNode.setAttribute("uuid", generateUuid());
      appendBooleanProperty(doc, feNode, "isEnabled", true);
      appendTypeProperty(doc, feNode, "itemType", statement.itemType ?? "java.lang.Object");
      appendStringProperty(doc, feNode, "itemName", statement.itemName ?? "item");
      appendStringProperty(doc, feNode, "array", statement.collection ?? "unknown");
      appendBlockBody(doc, feNode, statement.body ?? []);
      return feNode;
}

function appendBlockBody(doc: Document, parentNode: Element, statements: AliceStatement[]): void {
  appendStatementBlockProperty(doc, parentNode, "body", statements);
}

function appendStatementBlockProperty(doc: Document, parentNode: Element, propertyName: string, statements: AliceStatement[]): void {
  const bodyProp = doc.createElement("property");
  bodyProp.setAttribute("name", propertyName);
  const blockNode = doc.createElement("node");
  blockNode.setAttribute("type", "org.lgna.project.ast.BlockStatement");
  blockNode.setAttribute("uuid", generateUuid());
  const stmtsProp = doc.createElement("property");
  stmtsProp.setAttribute("name", "statements");
  const collection = doc.createElement("collection");
  collection.setAttribute("type", "java.util.ArrayList");
  appendSupportedStatements(doc, collection, statements);
  stmtsProp.appendChild(collection);
  blockNode.appendChild(stmtsProp);
  appendBooleanProperty(doc, blockNode, "isEnabled", true);
  bodyProp.appendChild(blockNode);
  parentNode.appendChild(bodyProp);
}

function createParameterNode(doc: Document, name: string, typeName: string): Element {
  const parameterNode = doc.createElement("node");
  parameterNode.setAttribute("type", "org.lgna.project.ast.UserParameter");
  parameterNode.setAttribute("uuid", generateUuid());
  appendStringProperty(doc, parameterNode, "name", name);
  appendTypeProperty(doc, parameterNode, "valueType", typeName || "java.lang.Object");
  return parameterNode;
}

function createFieldNode(doc: Document, field: AliceFieldDefinition): Element {
  const fieldNode = doc.createElement("node");
  fieldNode.setAttribute("type", "org.lgna.project.ast.UserField");
  fieldNode.setAttribute("uuid", generateUuid());
  appendStringProperty(doc, fieldNode, "name", field.name);
  appendTypeProperty(doc, fieldNode, "valueType", field.typeName || "java.lang.Object");
  if (field.resourceType) setResourceInitializer(doc, fieldNode, field.resourceType);
  return fieldNode;
}

function setResourceInitializer(doc: Document, fieldNode: Element, resourceType: string): void {
  const property = ensureProperty(doc, fieldNode, "initializer");
  while (property.firstChild) property.removeChild(property.firstChild);
  const initNode = doc.createElement("node");
  initNode.setAttribute("type", "org.lgna.project.ast.InstanceCreation");
  initNode.setAttribute("uuid", generateUuid());
  const ref = doc.createElement("resourceReference");
  ref.setAttribute("name", resourceType);
  initNode.appendChild(ref);
  property.appendChild(initNode);
}

function setTypeProperty(doc: Document, parent: Element, propertyName: string, typeName: string): void {
  const property = ensureProperty(doc, parent, propertyName);
  while (property.firstChild) property.removeChild(property.firstChild);
  property.appendChild(createTypeNode(doc, typeName));
}

function appendTypeProperty(doc: Document, parent: Element, propertyName: string, typeName: string): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  property.appendChild(createTypeNode(doc, typeName));
  parent.appendChild(property);
}

function appendCollectionProperty(doc: Document, parent: Element, propertyName: string): Element {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  const collection = doc.createElement("collection");
  collection.setAttribute("type", "java.util.ArrayList");
  property.appendChild(collection);
  parent.appendChild(property);
  return collection;
}

function createTypeNode(doc: Document, typeName: string): Element {
  const node = doc.createElement("node");
  node.setAttribute("type", "org.lgna.project.ast.JavaType");
  node.setAttribute("uuid", generateUuid());
  const type = doc.createElement("type");
  type.setAttribute("name", typeName || "java.lang.Object");
  node.appendChild(type);
  return node;
}

function appendStringProperty(doc: Document, parent: Element, propertyName: string, value: string, valueType = "java.lang.String"): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  const valueNode = doc.createElement("value");
  valueNode.setAttribute("type", valueType);
  valueNode.appendChild(doc.createTextNode(value));
  property.appendChild(valueNode);
  parent.appendChild(property);
}

function appendNullProperty(doc: Document, parent: Element, propertyName: string): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  const valueNode = doc.createElement("value");
  valueNode.setAttribute("isNull", "true");
  property.appendChild(valueNode);
  parent.appendChild(property);
}

function appendBooleanProperty(doc: Document, parent: Element, propertyName: string, value: boolean): void {
  appendStringProperty(doc, parent, propertyName, String(value), "java.lang.Boolean");
}

function setPropertyText(doc: Document, parent: Element, propertyName: string, value: string): void {
  const property = ensureProperty(doc, parent, propertyName);
  const valueNode = ensureValueNode(doc, property, "java.lang.String");
  valueNode.textContent = value;
}

function ensureCollectionProperty(doc: Document, parent: Element, propertyName: string): Element {
  const property = ensureProperty(doc, parent, propertyName);
  let collection = directChild(property, "collection");
  if (!collection) {
    collection = doc.createElement("collection");
    collection.setAttribute("type", "java.util.ArrayList");
    while (property.firstChild) property.removeChild(property.firstChild);
    property.appendChild(collection);
  }
  if (!collection.getAttribute("type")) {
    collection.setAttribute("type", "java.util.ArrayList");
  }
  return collection;
}

function ensureProperty(doc: Document, parent: Element, propertyName: string): Element {
  let property = getProperty(parent, propertyName);
  if (!property) {
    property = doc.createElement("property");
    property.setAttribute("name", propertyName);
    parent.appendChild(property);
  }
  return property;
}

function ensureValueNode(doc: Document, property: Element, valueType: string): Element {
  let valueNode = directChild(property, "value");
  if (!valueNode) {
    while (property.firstChild) property.removeChild(property.firstChild);
    valueNode = doc.createElement("value");
    property.appendChild(valueNode);
  }
  valueNode.setAttribute("type", valueType);
  return valueNode;
}

export function appendCommentToMethod(baseXmlText: string | null, methodName: string, commentText: string): string {
  const doc = parseXmlString(baseXmlText ?? MINIMAL_PROJECT_XML_TEMPLATE);
  const methodNodes = getNamedUserTypeNodes(doc).flatMap((typeNode) => directCollectionNodes(ensureCollectionProperty(doc, typeNode, "methods")))
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserMethod");

  for (const methodNode of methodNodes) {
    if (getPropertyText(methodNode, "name") !== methodName) continue;
    const bodyNode = getPropertyNode(methodNode, "body");
    if (!bodyNode) break;
    const collection = ensureCollectionProperty(doc, bodyNode, "statements");
    appendSupportedStatements(doc, collection, [{ kind: "Comment", expression: commentText }]);
    break;
  }

  return preserveXmlDeclaration(baseXmlText, serializeXmlString(doc));
}

export { ensureXmlTools };
