import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import {
  DEFAULT_A3P_XML_ENTRY,
  getA3PSource,
  snapshotAliceProject,
  type AliceFieldDefinition,
  type AliceMethod,
  type AliceObject,
  type AliceProject,
  type AliceTypeDefinition,
} from "./a3p-parser.js";

export interface ProjectModification {
  /** Method name to add a comment to */
  addCommentToMethod?: string;
  /** Comment text to add */
  commentText?: string;
  /** New scene object to add */
  addObject?: { name: string; className: string };
}

export interface WriteA3POptions {
  xmlEntryName?: string;
  baseXmlText?: string | null;
  manifest?: Record<string, unknown> | null;
  thumbnail?: Uint8Array | null;
  resources?: Map<string, Uint8Array>;
  preserveSourceEntries?: boolean;
}

const INTERNAL_AST_VERSION = "3.10062";
const SPECIAL_RESOURCE_PATHS = new Set([
  "__original_xml__",
  "programType.xml",
  "program.xml",
  "manifest.json",
  "thumbnail.png",
  "version.txt",
]);

/**
 * Serialize an Alice project back to .a3p ZIP format.
 * Uses the parsed source archive when available so real Alice projects round-trip faithfully.
 */
export async function writeA3P(
  project: AliceProject,
  options: WriteA3POptions = {},
): Promise<Uint8Array> {
  await ensureXmlTools();
  const source = getA3PSource(project);
  const xmlEntryName = options.xmlEntryName ?? source?.xmlEntryName ?? DEFAULT_A3P_XML_ENTRY;
  const baseXmlText = options.baseXmlText ?? source?.xmlText ?? null;
  const zip = new JSZip();

  if (options.resources) {
    writeExplicitResources(zip, options.resources);
  } else if (options.preserveSourceEntries !== false && source?.zip) {
    await copySourceEntries(zip, source.zip, new Set([xmlEntryName, "version.txt"]));
  }

  zip.file("version.txt", project.version);
  zip.file(xmlEntryName, buildProjectXml(project, baseXmlText));

  if (options.manifest !== undefined) {
    if (options.manifest !== null) {
      zip.file("manifest.json", JSON.stringify(options.manifest, null, 2));
    }
  }

  if (options.thumbnail !== undefined && options.thumbnail !== null) {
    zip.file("thumbnail.png", options.thumbnail);
  }

  return zip.generateAsync({ type: "uint8array" });
}

/**
 * Read a .a3p file, apply modifications, and write it back.
 * Returns the modified ZIP as a Buffer.
 */
export async function modifyAndWriteA3P(
  inputPath: string,
  outputPath: string,
  modifications: ProjectModification,
): Promise<{ bytesWritten: number; modificationsApplied: string[] }> {
  await ensureXmlTools();
  const data = fs.readFileSync(inputPath);
  const project = await (await import("./a3p-parser.js")).parseA3P(data);
  const source = getA3PSource(project);
  let baseXmlText = source?.xmlText ?? null;
  const applied: string[] = [];

  if (modifications.addCommentToMethod && modifications.commentText) {
    baseXmlText = appendCommentToMethod(
      baseXmlText,
      modifications.addCommentToMethod,
      modifications.commentText,
    );
    applied.push(
      `added-comment:${modifications.addCommentToMethod}:${modifications.commentText}`,
    );
  }

  if (modifications.addObject) {
    project.sceneObjects.push({
      name: modifications.addObject.name,
      typeName: modifications.addObject.className,
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
    });
    const sceneType = findSceneTypeDefinition(project.types);
    if (sceneType) {
      sceneType.fields = [
        ...(sceneType.fields ?? []),
        { name: modifications.addObject.name, typeName: modifications.addObject.className },
      ];
    }
    applied.push(`added-object:${modifications.addObject.name}:${modifications.addObject.className}`);
  }

  const output = await writeA3P(project, { baseXmlText });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  return { bytesWritten: output.length, modificationsApplied: applied };
}

async function copySourceEntries(target: JSZip, sourceZip: JSZip, skip: Set<string>): Promise<void> {
  for (const [entryName, entry] of Object.entries(sourceZip.files)) {
    if (skip.has(entryName)) continue;
    if (entry.dir) continue;
    target.file(entryName, await entry.async("uint8array"));
  }
}

function writeExplicitResources(zip: JSZip, resources: Map<string, Uint8Array>): void {
  for (const [resourcePath, bytes] of resources) {
    if (SPECIAL_RESOURCE_PATHS.has(resourcePath)) continue;
    zip.file(resourcePath, bytes);
  }
}

function buildProjectXml(project: AliceProject, baseXmlText: string | null): string {
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
    for (const node of typeNodes) {
      const name = getPropertyText(node, "name");
      if (name) typeMap.set(name, node);
    }

    for (const type of project.types) {
      const targetNode = type.superTypeName?.includes("SScene")
        ? sceneTypeNode
        : typeMap.get(type.name) ?? null;
      if (!targetNode) continue;
      syncNamedUserType(doc, targetNode, type);
    }
  }

  const serialized = serializeXmlString(doc);
  return preserveXmlDeclaration(baseXmlText, serialized);
}

function buildDesiredSceneFields(
  project: AliceProject,
  sceneType: AliceTypeDefinition | null,
): AliceFieldDefinition[] {
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

function buildDesiredSceneMethods(
  project: AliceProject,
  sceneType: AliceTypeDefinition | null,
): AliceMethod[] {
  const methods = [...(sceneType?.methods ?? [])];
  const seen = new Set(methods.map((method) => method.name));
  const knownTypeMethodNames = new Set<string>();

  for (const type of project.types ?? []) {
    for (const method of type.methods ?? []) {
      knownTypeMethodNames.add(method.name);
    }
  }

  for (const method of project.methods) {
    if (knownTypeMethodNames.has(method.name) || seen.has(method.name)) continue;
    methods.push(method);
    seen.add(method.name);
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
  if (desired.fields) {
    syncFields(doc, typeNode, desired.fields);
  }
  if (desired.methods) {
    syncMethods(doc, typeNode, desired.methods);
  }
}

function syncFields(doc: Document, typeNode: Element, desiredFields: AliceFieldDefinition[]): void {
  const collection = ensureCollectionProperty(doc, typeNode, "fields");
  const existingFields = directCollectionNodes(collection)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserField");

  for (let index = 0; index < existingFields.length && index < desiredFields.length; index++) {
    updateFieldNode(doc, existingFields[index], desiredFields[index]);
  }

  for (let index = existingFields.length; index < desiredFields.length; index++) {
    collection.appendChild(createFieldNode(doc, desiredFields[index]));
  }
}

function updateFieldNode(doc: Document, fieldNode: Element, desired: AliceFieldDefinition): void {
  setPropertyText(doc, fieldNode, "name", desired.name);
  if (desired.typeName) {
    setTypeProperty(doc, fieldNode, "valueType", desired.typeName);
  }
  if (desired.resourceType) {
    setResourceInitializer(doc, fieldNode, desired.resourceType);
  }
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

  for (let index = 0; index < Math.min(existingMethods.length, desiredMethods.length); index++) {
    const existingNode = existingMethods[index];
    const existingName = getPropertyText(existingNode, "name");
    const desired = desiredMethods[index];
    if (
      existingName &&
      existingName !== desired.name &&
      !desiredNames.has(existingName) &&
      !existingByName.has(desired.name)
    ) {
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
      continue;
    }
    collection.appendChild(createMethodNode(doc, desired));
  }
}

function syncMethodSignature(doc: Document, methodNode: Element, desired: AliceMethod): void {
  setPropertyText(doc, methodNode, "name", desired.name);
  setTypeProperty(doc, methodNode, "returnType", desired.isFunction ? desired.returnType : "void");
  const paramsCollection = ensureCollectionProperty(doc, methodNode, "requiredParameters");
  while (paramsCollection.firstChild) {
    paramsCollection.removeChild(paramsCollection.firstChild);
  }
  for (const parameter of desired.parameters) {
    paramsCollection.appendChild(createParameterNode(doc, parameter.name, parameter.type));
  }

  const existingBody = getPropertyNode(methodNode, "body");
  if (!existingBody || desired.statements.length === 0) {
    return;
  }

  const statementsCollection = ensureCollectionProperty(doc, existingBody, "statements");
  while (statementsCollection.firstChild) {
    statementsCollection.removeChild(statementsCollection.firstChild);
  }
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

function appendSupportedStatements(doc: Document, collection: Element, statements: AliceMethod["statements"]): void {
  for (const statement of statements) {
    if (statement.kind !== "Comment") continue;
    const commentNode = doc.createElement("node");
    commentNode.setAttribute("type", "org.lgna.project.ast.Comment");
    commentNode.setAttribute("uuid", generateUuid());
    appendStringProperty(doc, commentNode, "text", statement.expression ?? "");
    appendBooleanProperty(doc, commentNode, "isEnabled", true);
    collection.appendChild(commentNode);
  }
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
  if (field.resourceType) {
    setResourceInitializer(doc, fieldNode, field.resourceType);
  }
  return fieldNode;
}

function setResourceInitializer(doc: Document, fieldNode: Element, resourceType: string): void {
  const property = ensureProperty(doc, fieldNode, "initializer");
  while (property.firstChild) {
    property.removeChild(property.firstChild);
  }

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
  while (property.firstChild) {
    property.removeChild(property.firstChild);
  }
  property.appendChild(createTypeNode(doc, typeName));
}

function appendTypeProperty(doc: Document, parent: Element, propertyName: string, typeName: string): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  property.appendChild(createTypeNode(doc, typeName));
  parent.appendChild(property);
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

function appendStringProperty(
  doc: Document,
  parent: Element,
  propertyName: string,
  value: string,
  valueType = "java.lang.String",
): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  const valueNode = doc.createElement("value");
  valueNode.setAttribute("type", valueType);
  valueNode.appendChild(doc.createTextNode(value));
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
    while (property.firstChild) {
      property.removeChild(property.firstChild);
    }
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
    while (property.firstChild) {
      property.removeChild(property.firstChild);
    }
    valueNode = doc.createElement("value");
    property.appendChild(valueNode);
  }
  valueNode.setAttribute("type", valueType);
  return valueNode;
}

function appendCommentToMethod(
  baseXmlText: string | null,
  methodName: string,
  commentText: string,
): string {
  const doc = parseXmlString(baseXmlText ?? MINIMAL_PROJECT_XML_TEMPLATE);
  const methodNodes = elementsByTagName(doc, "node")
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserMethod");

  for (const methodNode of methodNodes) {
    if (getPropertyText(methodNode, "name") !== methodName) continue;
    const bodyNode = getPropertyNode(methodNode, "body");
    if (!bodyNode) break;
    const collection = ensureCollectionProperty(doc, bodyNode, "statements");
    appendSupportedStatements(doc, collection, [{ kind: "Comment", expression: commentText }]);
    break;
  }

  const serialized = serializeXmlString(doc);
  return preserveXmlDeclaration(baseXmlText, serialized);
}

function getNamedUserTypeNodes(doc: Document): Element[] {
  return elementsByTagName(doc, "node")
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.NamedUserType");
}

function findSceneTypeNode(typeNodes: Element[]): Element | null {
  for (const node of typeNodes) {
    const superType = getTypePropertyName(node, "superType");
    if (superType?.includes("SScene")) return node;
  }
  return null;
}

function findSceneTypeDefinition(types: AliceTypeDefinition[] | undefined): AliceTypeDefinition | null {
  if (!types?.length) return null;
  return types.find((type) => type.superTypeName?.includes("SScene"))
    ?? types.find((type) => type.name === "Scene")
    ?? null;
}

function getTypePropertyName(parent: Element, propertyName: string): string | null {
  const propertyNode = getPropertyNode(parent, propertyName);
  if (!propertyNode) return null;
  const typeNode = directChild(propertyNode, "type");
  if (typeNode?.getAttribute("name")) {
    return typeNode.getAttribute("name");
  }
  return getPropertyText(propertyNode, "name");
}

function getProperty(parent: Element, propertyName: string): Element | null {
  for (let index = 0; index < parent.childNodes.length; index++) {
    const child = parent.childNodes[index] as Element;
    if (child.nodeType === 1 && child.tagName === "property" && child.getAttribute("name") === propertyName) {
      return child;
    }
  }
  return null;
}

function getPropertyNode(parent: Element, propertyName: string): Element | null {
  const property = getProperty(parent, propertyName);
  return property ? directChild(property, "node") : null;
}

function getPropertyText(parent: Element, propertyName: string): string | null {
  const property = getProperty(parent, propertyName);
  if (!property) return null;
  const valueNode = directChild(property, "value");
  return valueNode?.textContent?.trim() ?? null;
}

function directChild(parent: Element, tagName: string): Element | null {
  for (let index = 0; index < parent.childNodes.length; index++) {
    const child = parent.childNodes[index] as Element;
    if (child.nodeType === 1 && child.tagName === tagName) return child;
  }
  return null;
}

function directCollectionNodes(collection: Element): Element[] {
  const nodes: Element[] = [];
  for (let index = 0; index < collection.childNodes.length; index++) {
    const child = collection.childNodes[index] as Element;
    if (child.nodeType === 1 && child.tagName === "node") {
      nodes.push(child);
    }
  }
  return nodes;
}

function elementsByTagName(parent: Document | Element, tagName: string): Element[] {
  const result: Element[] = [];
  const nodes = parent.getElementsByTagName(tagName);
  for (let index = 0; index < nodes.length; index++) {
    result.push(nodes[index]);
  }
  return result;
}

let xmlDomParser: InstanceType<typeof DOMParser> | null = null;
let xmlSerializerCtor: (new () => XMLSerializer) | null = null;

function preserveXmlDeclaration(baseXmlText: string | null, serialized: string): string {
  const declaration = baseXmlText?.match(/^<\?xml[^>]*\?>/u)?.[0] ?? null;
  if (!declaration || serialized.startsWith("<?xml")) {
    return serialized;
  }
  return `${declaration}${serialized.startsWith("\n") ? "" : "\n"}${serialized}`;
}

function parseXmlString(xml: string): Document {
  if (typeof globalThis.DOMParser !== "undefined") {
    return new globalThis.DOMParser().parseFromString(xml, "application/xml");
  }
  if (!xmlDomParser) {
    throw new Error("XML parser not initialized");
  }
  return xmlDomParser.parseFromString(xml, "application/xml");
}

function serializeXmlString(doc: Document): string {
  if (typeof globalThis.XMLSerializer !== "undefined") {
    return new globalThis.XMLSerializer().serializeToString(doc);
  }
  if (!xmlSerializerCtor) {
    throw new Error("XML serializer not initialized");
  }
  return new xmlSerializerCtor().serializeToString(doc);
}

async function ensureXmlTools(): Promise<void> {
  if (typeof globalThis.DOMParser !== "undefined" && typeof globalThis.XMLSerializer !== "undefined") {
    return;
  }
  if (xmlDomParser && xmlSerializerCtor) return;
  const mod = await import("@xmldom/xmldom");
  xmlDomParser = new (mod.DOMParser as unknown as typeof DOMParser)();
  xmlSerializerCtor = mod.XMLSerializer as unknown as new () => XMLSerializer;
}

function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

const MINIMAL_PROJECT_XML_TEMPLATE = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<node key="1" type="org.lgna.project.ast.NamedUserType" uuid="program-root" version="${INTERNAL_AST_VERSION}">
  <property name="name"><value type="java.lang.String">Program</value></property>
  <property name="_package"><value isNull="true"/></property>
  <property name="constructors"><collection type="java.util.ArrayList"><node key="2" type="org.lgna.project.ast.NamedUserConstructor" uuid="program-ctor"><property name="requiredParameters"><collection type="java.util.ArrayList"/></property><property name="accessLevel"><value type="org.lgna.project.ast.AccessLevel">PUBLIC</value></property><property name="body"><node type="org.lgna.project.ast.ConstructorBlockStatement" uuid="program-ctor-body"><property name="constructorInvocationStatement"><node type="org.lgna.project.ast.SuperConstructorInvocationStatement" uuid="program-super-call"><property name="constructor"><node key="3" type="org.lgna.project.ast.JavaConstructor" uuid="program-super-constructor"><constructor isVarArgs="false"><declaringClass name="org.lgna.story.SProgram"/><parameters/></constructor></node></property><property name="requiredArguments"><collection type="java.util.ArrayList"/></property><property name="variableArguments"><collection type="java.util.ArrayList"/></property><property name="keyedArguments"><collection type="java.util.ArrayList"/></property><property name="isEnabled"><value type="java.lang.Boolean">true</value></property></node></property><property name="statements"><collection type="java.util.ArrayList"/></property><property name="isEnabled"><value type="java.lang.Boolean">true</value></property></node></property><property name="managementLevel"><value type="org.lgna.project.ast.ManagementLevel">NONE</value></property><property name="isSignatureLocked"><value type="java.lang.Boolean">false</value></property><property name="isDeletionAllowed"><value type="java.lang.Boolean">false</value></property></node></collection></property>
  <property name="accessLevel"><value type="org.lgna.project.ast.AccessLevel">PUBLIC</value></property>
  <property name="finalAbstractOrNeither"><value type="org.lgna.project.ast.TypeModifierFinalAbstractOrNeither">NEITHER</value></property>
  <property name="isStrictFloatingPoint"><value type="java.lang.Boolean">false</value></property>
  <property name="superType"><node key="4" type="org.lgna.project.ast.JavaType" uuid="program-super-type"><type name="org.lgna.story.SProgram"/></node></property>
  <property name="methods"><collection type="java.util.ArrayList"/></property>
  <property name="fields"><collection type="java.util.ArrayList"><node key="5" type="org.lgna.project.ast.UserField" uuid="scene-field"><property name="name"><value type="java.lang.String">myScene</value></property><property name="valueType"><node key="6" type="org.lgna.project.ast.NamedUserType" uuid="scene-type" version="${INTERNAL_AST_VERSION}"><property name="name"><value type="java.lang.String">Scene</value></property><property name="_package"><value isNull="true"/></property><property name="constructors"><collection type="java.util.ArrayList"><node key="7" type="org.lgna.project.ast.NamedUserConstructor" uuid="scene-ctor"><property name="requiredParameters"><collection type="java.util.ArrayList"/></property><property name="accessLevel"><value type="org.lgna.project.ast.AccessLevel">PUBLIC</value></property><property name="body"><node type="org.lgna.project.ast.ConstructorBlockStatement" uuid="scene-ctor-body"><property name="constructorInvocationStatement"><node type="org.lgna.project.ast.SuperConstructorInvocationStatement" uuid="scene-super-call"><property name="constructor"><node key="8" type="org.lgna.project.ast.JavaConstructor" uuid="scene-super-constructor"><constructor isVarArgs="false"><declaringClass name="org.lgna.story.SScene"/><parameters/></constructor></node></property><property name="requiredArguments"><collection type="java.util.ArrayList"/></property><property name="variableArguments"><collection type="java.util.ArrayList"/></property><property name="keyedArguments"><collection type="java.util.ArrayList"/></property><property name="isEnabled"><value type="java.lang.Boolean">true</value></property></node></property><property name="statements"><collection type="java.util.ArrayList"/></property><property name="isEnabled"><value type="java.lang.Boolean">true</value></property></node></property><property name="managementLevel"><value type="org.lgna.project.ast.ManagementLevel">NONE</value></property><property name="isSignatureLocked"><value type="java.lang.Boolean">false</value></property><property name="isDeletionAllowed"><value type="java.lang.Boolean">false</value></property></node></collection></property><property name="accessLevel"><value type="org.lgna.project.ast.AccessLevel">PUBLIC</value></property><property name="finalAbstractOrNeither"><value type="org.lgna.project.ast.TypeModifierFinalAbstractOrNeither">NEITHER</value></property><property name="isStrictFloatingPoint"><value type="java.lang.Boolean">false</value></property><property name="superType"><node key="9" type="org.lgna.project.ast.JavaType" uuid="scene-super-type"><type name="org.lgna.story.SScene"/></node></property><property name="methods"><collection type="java.util.ArrayList"/></property><property name="fields"><collection type="java.util.ArrayList"/></property></node></property></node></collection></property>
</node>`;
