import {
  type AliceFieldDefinition,
  type AliceMethod,
  type AliceObject,
  type AliceProject,
  type AliceTypeDefinition,
  type ImportedProjectAsset,
  type MaterialBinding,
  getA3PMethodSource,
  getA3PSource,
  snapshotAliceProject,
  snapshotAliceStatements,
} from "../a3p-parser.js";
import {
  MINIMAL_PROJECT_XML_TEMPLATE,
  appendBooleanProperty,
  appendStringProperty,
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
import { appendSupportedStatements } from "./statements.js";

export { LOWERED_A3P_STATEMENT_KINDS, SUPPORTED_A3P_STATEMENT_KINDS } from "./statements.js";

export function buildProjectXml(project: AliceProject, baseXmlText: string | null): string {
  const source = getA3PSource(project);
  if (baseXmlText !== null && source && source.snapshot === snapshotAliceProject(project)) {
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
    syncSceneObjectMetadata(doc, sceneTypeNode, project.sceneObjects);
    syncMethods(doc, sceneTypeNode, desiredMethods);
  }

  if (project.types?.length) {
    const typeMap = new Map<string, Element>();
    for (const node of typeNodes) {
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

  syncImportedAssets(doc, root, project.importedAssets ?? []);

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

function syncImportedAssets(doc: Document, root: Element, assets: ImportedProjectAsset[]): void {
  removeDirectChildren(root, "imported-assets");
  if (assets.length === 0) return;

  const importedAssetsNode = doc.createElement("imported-assets");
  for (const asset of assets) {
    const assetNode = doc.createElement("asset");
    assetNode.setAttribute("id", asset.id);
    assetNode.setAttribute("kind", asset.kind);
    assetNode.setAttribute("name", asset.name);
    assetNode.setAttribute("fileName", asset.fileName);
    assetNode.setAttribute("resourcePath", asset.resourcePath);
    assetNode.setAttribute("contentType", asset.contentType);
    assetNode.setAttribute("byteLength", String(asset.byteLength));
    importedAssetsNode.appendChild(assetNode);
  }
  root.appendChild(importedAssetsNode);
}

function syncSceneObjectMetadata(doc: Document, sceneTypeNode: Element, sceneObjects: AliceObject[]): void {
  const collection = ensureCollectionProperty(doc, sceneTypeNode, "fields");
  const byName = new Map(sceneObjects.map((object) => [object.name, object]));

  for (const fieldNode of directCollectionNodes(collection)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserField")) {
    const name = getPropertyText(fieldNode, "name");
    const object = name ? byName.get(name) : undefined;
    if (!object) continue;

    if (object.modelResourceId) {
      fieldNode.setAttribute("modelResourceId", object.modelResourceId);
    } else {
      fieldNode.removeAttribute("modelResourceId");
    }
    syncMaterialBindings(doc, fieldNode, object.materialBindings ?? []);
  }
}

function syncMaterialBindings(doc: Document, fieldNode: Element, bindings: MaterialBinding[]): void {
  removeDirectChildren(fieldNode, "material-bindings");
  if (bindings.length === 0) return;

  const bindingsNode = doc.createElement("material-bindings");
  for (const binding of bindings) {
    const bindingNode = doc.createElement("binding");
    bindingNode.setAttribute("target", binding.target);
    bindingNode.setAttribute("textureResourceId", binding.textureResourceId);
    bindingsNode.appendChild(bindingNode);
  }
  fieldNode.appendChild(bindingsNode);
}

function removeDirectChildren(parent: Element, tagName: string): void {
  for (let index = parent.childNodes.length - 1; index >= 0; index -= 1) {
    const child = parent.childNodes[index] as Element;
    if (child.nodeType === 1 && child.tagName === tagName) {
      parent.removeChild(child);
    }
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

  if (hasUnchangedSourceStatements(desired)) {
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

  if (hasUnchangedSourceStatements(desired)) {
    return;
  }

  const bodyNode = ensureConstructorBodyNode(doc, constructorNode, superTypeName);
  const statementsCollection = ensureCollectionProperty(doc, bodyNode, "statements");
  while (statementsCollection.firstChild) statementsCollection.removeChild(statementsCollection.firstChild);
  appendSupportedStatements(doc, statementsCollection, desired.statements);
}

function hasUnchangedSourceStatements(method: AliceMethod): boolean {
  const source = getA3PMethodSource(method);
  return source !== null && source.statementsSnapshot === snapshotAliceStatements(method.statements);
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

function appendNullProperty(doc: Document, parent: Element, propertyName: string): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  const valueNode = doc.createElement("value");
  valueNode.setAttribute("isNull", "true");
  property.appendChild(valueNode);
  parent.appendChild(property);
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
