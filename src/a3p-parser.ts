import JSZip from "jszip";
import type { JointNode, BoundingBox } from "./story-api/types";

/** A single object extracted from an Alice scene. */
export interface AliceObject {
  name: string;
  /** Java class name, e.g. "org.lgna.story.SGround" or user type like "User:Prop" */
  typeName: string;
  /** Resource class if any, e.g. "org.lgna.story.resources.prop.BananaTreeResource" */
  resourceType: string | null;
  position: { x: number; y: number; z: number } | null;
  orientation: { x: number; y: number; z: number; w: number } | null;
  size: { width: number; height: number; depth: number } | null;
  constructorArgs?: string[];
}

/** A parsed statement from the Alice AST. */
export interface AliceStatement {
  kind: string;
  /** For MethodCall: object.method(args) */
  object?: string;
  method?: string;
  arguments?: string[];
  /** For loops */
  count?: number;
  countExpression?: string;
  body?: AliceStatement[];
  itemType?: string;
  itemName?: string;
  collection?: string;
  /** For if/else */
  condition?: string;
  ifBody?: AliceStatement[];
  elseBody?: AliceStatement[];
  /** For try/catch */
  tryBody?: AliceStatement[];
  catchBody?: AliceStatement[];
  catchType?: string;
  catchVariable?: string;
  /** For switch/case */
  cases?: Array<{ value: string; body: AliceStatement[] }>;
  defaultCase?: AliceStatement[] | null;
  /** For events */
  event?: string;
  /** For return / throw */
  expression?: string;
  /** For variable */
  name?: string;
  varType?: string;
  value?: string;
}

/** A parsed method (procedure or function) from the Alice AST. */
export interface AliceMethod {
  name: string;
  isFunction: boolean;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
  statements: AliceStatement[];
}

export interface AliceFieldDefinition {
  name: string;
  typeName?: string | null;
  resourceType?: string | null;
  initializer?: string | null;
}

export interface AliceTypeDefinition {
  name: string;
  superTypeName?: string | null;
  methods?: AliceMethod[];
  constructors?: AliceMethod[];
  fields?: AliceFieldDefinition[];
}

/** Top-level result from parsing an .a3p file. */
export interface AliceProject {
  version: string;
  projectName: string;
  sceneObjects: AliceObject[];
  methods: AliceMethod[];
  types?: AliceTypeDefinition[];
  jointHierarchy?: JointNode[];
  boundingBoxes?: Record<string, BoundingBox>;
  textureRefs?: string[];
}

export interface A3PSourceMetadata {
  zip: JSZip | null;
  xmlEntryName: string;
  xmlText: string;
  snapshot: string;
}

export const DEFAULT_A3P_XML_ENTRY = "programType.xml";
export const LEGACY_A3P_XML_ENTRY = "program.xml";

const A3P_SOURCE = Symbol("a3p-source");
type AliceProjectWithSource = AliceProject & { [A3P_SOURCE]?: A3PSourceMetadata };

export function getA3PSource(project: AliceProject): A3PSourceMetadata | null {
  return (project as AliceProjectWithSource)[A3P_SOURCE] ?? null;
}

export function snapshotAliceProject(project: AliceProject): string {
  return JSON.stringify({
    version: project.version,
    projectName: project.projectName,
    sceneObjects: project.sceneObjects,
    methods: project.methods,
    types: project.types ?? [],
    jointHierarchy: project.jointHierarchy ?? [],
    boundingBoxes: project.boundingBoxes ?? {},
    textureRefs: project.textureRefs ?? [],
  });
}

function attachA3PSource(project: AliceProject, source: A3PSourceMetadata): void {
  Object.defineProperty(project, A3P_SOURCE, {
    value: source,
    enumerable: false,
    configurable: true,
    writable: true,
  });
}

/**
 * Parse an Alice .a3p file (ZIP) and extract the scene graph.
 * Works in both browser (File/ArrayBuffer) and Node (Buffer).
 */
export async function parseA3P(data: ArrayBuffer | Uint8Array): Promise<AliceProject> {
  const zip = await JSZip.loadAsync(data);
  return parseA3PFromZip(zip);
}

/** Internal: parse from an already-loaded JSZip instance (avoids re-parsing in readProject). */
export async function parseA3PFromZip(zip: JSZip): Promise<AliceProject> {
  await ensureNodeXml();
  const version = await readTextFile(zip, "version.txt");
  const xmlEntry = await readA3PXmlEntry(zip);
  const doc = parseXmlString(xmlEntry.text);

  const projectName = getProjectName(doc);
  const idx = indexNodes(doc.documentElement);
  const sceneObjects = extractSceneObjects(idx);
  const methods = extractMethods(idx.userMethods, idx.keyMap, { includeMain: false });
  const types = extractTypes(idx.namedUserTypes, idx.keyMap);
  const jointHierarchy = extractJointHierarchy(idx.jointImplementations);
  const boundingBoxes = extractBoundingBoxes(idx.modelResourceInfos);
  const textureRefs = extractTextureRefs(idx.textureReferences, zip);

  const project: AliceProject = {
    version: version.trim(),
    projectName,
    sceneObjects,
    methods,
    types,
    jointHierarchy,
    boundingBoxes,
    textureRefs,
  };

  attachA3PSource(project, {
    zip,
    xmlEntryName: xmlEntry.name,
    xmlText: xmlEntry.text,
    snapshot: snapshotAliceProject(project),
  });

  return project;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readTextFile(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) return "";
  return entry.async("string");
}

export async function readA3PXmlEntry(zip: JSZip): Promise<{ name: string; text: string }> {
  const entryName = zip.file(DEFAULT_A3P_XML_ENTRY)
    ? DEFAULT_A3P_XML_ENTRY
    : zip.file(LEGACY_A3P_XML_ENTRY)
      ? LEGACY_A3P_XML_ENTRY
      : null;

  if (!entryName) {
    throw new Error(
      `No ${DEFAULT_A3P_XML_ENTRY} or ${LEGACY_A3P_XML_ENTRY} found in .a3p archive`,
    );
  }

  const raw = await zip.file(entryName)!.async("uint8array");
  return { name: entryName, text: decodeXmlBytes(raw) };
}

function decodeXmlBytes(raw: Uint8Array): string {
  if (raw.length >= 2) {
    if (raw[0] === 0xfe && raw[1] === 0xff) {
      return decodeUtf16(raw, true);
    }
    if (raw[0] === 0xff && raw[1] === 0xfe) {
      return decodeUtf16(raw, false);
    }
    if (raw[0] === 0x00 || raw[1] === 0x00) {
      return decodeUtf16(raw, raw[0] === 0x00);
    }
  }

  return new TextDecoder("utf-8").decode(raw);
}

function decodeUtf16(bytes: Uint8Array, bigEndian: boolean): string {
  const label = bigEndian ? "utf-16be" : "utf-16le";
  return new TextDecoder(label).decode(bytes);
}

function parseXmlString(xml: string): Document {
  if (typeof globalThis.DOMParser !== "undefined") {
    return new globalThis.DOMParser().parseFromString(xml, "application/xml");
  }
  if (!_xmlDomParser) {
    throw new Error("Call initNodeXml() before parseXmlString in Node.js");
  }
  return _xmlDomParser.parseFromString(xml, "application/xml");
}

let _xmlDomParser: InstanceType<typeof DOMParser> | null = null;

async function ensureNodeXml(): Promise<void> {
  if (typeof globalThis.DOMParser !== "undefined") return;
  if (_xmlDomParser) return;
  const mod = await import("@xmldom/xmldom");
  _xmlDomParser = new (mod.DOMParser as unknown as typeof DOMParser)();
}

// ---------------------------------------------------------------------------
// Key-based reference resolution
// ---------------------------------------------------------------------------

interface NodeIndex {
  keyMap: Map<string, Element>;
  namedUserTypes: Element[];
  userMethods: Element[];
  jointImplementations: Element[];
  modelResourceInfos: Element[];
  textureReferences: Element[];
}

function indexNodes(root: Element): NodeIndex {
  const keyMap = new Map<string, Element>();
  const namedUserTypes: Element[] = [];
  const userMethods: Element[] = [];
  const jointImplementations: Element[] = [];
  const modelResourceInfos: Element[] = [];
  const textureReferences: Element[] = [];

  const allNodes = root.getElementsByTagName("node");
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i];
    const nodeType = n.getAttribute("type");
    const key = n.getAttribute("key");

    if (key && !keyMap.has(key) && (nodeType || n.childNodes.length > 0)) {
      keyMap.set(key, n);
    }

    switch (nodeType) {
      case "org.lgna.project.ast.NamedUserType":
        namedUserTypes.push(n);
        break;
      case "org.lgna.project.ast.UserMethod":
        userMethods.push(n);
        break;
      case "org.lgna.story.resourceutilities.JointImplementation":
        jointImplementations.push(n);
        break;
      case "org.lgna.story.resourceutilities.ModelResourceInfo":
        modelResourceInfos.push(n);
        break;
      case "org.lgna.story.resourceutilities.TextureReference":
        textureReferences.push(n);
        break;
    }
  }

  return { keyMap, namedUserTypes, userMethods, jointImplementations, modelResourceInfos, textureReferences };
}

function resolve(node: Element, keyMap: Map<string, Element>): Element {
  const key = node.getAttribute("key");
  if (!key) return node;
  if (node.getAttribute("type") || node.childNodes.length > 0) return node;
  return keyMap.get(key) ?? node;
}

// ---------------------------------------------------------------------------
// XML extraction
// ---------------------------------------------------------------------------

function getProjectName(doc: Document): string {
  const root = doc.documentElement;
  if (root.tagName !== "node") return "Unknown";
  return getPropertyText(root, "name") ?? "Unknown";
}

function extractSceneObjects(idx: NodeIndex): AliceObject[] {
  const objects: AliceObject[] = [];
  const sceneType = findSceneType(idx.namedUserTypes, idx.keyMap);
  if (!sceneType) return objects;

  const fieldNodes = getCollectionNodesResolved(sceneType, "fields", idx.keyMap)
    .filter((node) => node.getAttribute("type") === "org.lgna.project.ast.UserField");

  for (const field of fieldNodes) {
    const obj = parseUserField(field, idx.keyMap);
    if (obj) objects.push(obj);
  }

  enrichFromMethods(sceneType, objects, idx.keyMap);
  return objects;
}

function extractTypes(namedUserTypes: Element[], keyMap: Map<string, Element>): AliceTypeDefinition[] {
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

function extractConstructors(
  constructorNodes: Element[],
  keyMap: Map<string, Element>,
  typeName: string,
): AliceMethod[] {
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
  const initNode = getPropertyNode(field, "initializer", keyMap);
  if (!initNode) return null;
  const resourceType = extractResourceType(field, keyMap);
  if (resourceType) return resourceType;
  return initNode.getAttribute("type")?.split(".").pop() ?? null;
}

function findSceneType(namedUserTypes: Element[], keyMap: Map<string, Element>): Element | null {
  for (const n of namedUserTypes) {
    const superType = getSuperTypeName(n, keyMap);
    if (superType && superType.includes("SScene")) return n;
  }
  return null;
}

function getSuperTypeName(typeNode: Element, keyMap: Map<string, Element>): string | null {
  const superNode = getPropertyNode(typeNode, "superType", keyMap);
  return superNode ? extractResolvedTypeName(superNode, keyMap) : null;
}

function getPropertyText(node: Element, propName: string): string | null {
  const prop = getProperty(node, propName);
  if (!prop) return null;
  const val = directChild(prop, "value");
  return val?.textContent?.trim() ?? null;
}

function getProperty(node: Element, name: string): Element | null {
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i] as Element;
    if (c.nodeType === 1 && c.tagName === "property" && c.getAttribute("name") === name) {
      return c;
    }
  }
  return null;
}

function directChild(node: Element, tagName: string): Element | null {
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i] as Element;
    if (c.nodeType === 1 && c.tagName === tagName) return c;
  }
  return null;
}

function getPropertyNode(node: Element, propName: string, keyMap: Map<string, Element>): Element | null {
  const prop = getProperty(node, propName);
  if (!prop) return null;
  const child = directChild(prop, "node");
  return child ? resolve(child, keyMap) : null;
}

function getCollectionNodesResolved(parent: Element, propName: string, keyMap: Map<string, Element>): Element[] {
  const prop = getProperty(parent, propName);
  if (!prop) return [];
  const coll = directChild(prop, "collection");
  if (!coll) return [];
  const result: Element[] = [];
  for (let i = 0; i < coll.childNodes.length; i++) {
    const c = coll.childNodes[i] as Element;
    if (c.nodeType === 1 && c.tagName === "node") {
      result.push(resolve(c, keyMap));
    }
  }
  return result;
}

function extractResolvedTypeName(node: Element, keyMap: Map<string, Element>): string | null {
  const resolved = resolve(node, keyMap);
  const typeEl = directChild(resolved, "type");
  if (typeEl?.getAttribute("name")) {
    return typeEl.getAttribute("name");
  }

  const classText = getPropertyText(resolved, "class");
  if (classText) return classText;

  if (resolved.getAttribute("type") === "org.lgna.project.ast.NamedUserType") {
    return getPropertyText(resolved, "name");
  }

  return null;
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
  const initNode = getPropertyNode(field, "initializer", keyMap);
  if (!initNode) return null;
  const refs = initNode.getElementsByTagName("resourceReference");
  if (refs.length === 0) return null;
  return refs[0].getAttribute("name") ?? null;
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

/**
 * Walk method invocations inside the scene's setup to extract
 * setPositionRelativeToVehicle, setOrientationRelativeToVehicle, setSize.
 */
function enrichFromMethods(sceneType: Element, objects: AliceObject[], keyMap: Map<string, Element>): void {
  const byName = new Map<string, AliceObject>();
  for (const o of objects) byName.set(o.name, o);

  const allMethods = sceneType.getElementsByTagName("node");
  for (let i = 0; i < allMethods.length; i++) {
    const n = allMethods[i];
    if (n.getAttribute("type") !== "org.lgna.project.ast.MethodInvocation") continue;

    const methodNode = getPropertyNode(n, "method", keyMap);
    if (!methodNode) continue;
    const methodEl = directChild(methodNode, "method");
    if (!methodEl) continue;

    const methodName = methodEl.getAttribute("name") ?? "";
    const exprProp = getProperty(n, "expression");
    const fieldName = resolveFieldAccessName(exprProp, keyMap);
    if (!fieldName) continue;

    const obj = byName.get(fieldName);
    if (!obj) continue;

    const doubles = extractDoubleArgs(n);
    if (methodName === "setPositionRelativeToVehicle" && doubles.length >= 3) {
      obj.position = { x: doubles[0], y: doubles[1], z: doubles[2] };
    } else if (methodName === "setOrientationRelativeToVehicle" && doubles.length >= 4) {
      obj.orientation = { x: doubles[0], y: doubles[1], z: doubles[2], w: doubles[3] };
    } else if (methodName === "setSize" && doubles.length >= 3) {
      obj.size = { width: doubles[0], height: doubles[1], depth: doubles[2] };
    }
  }
}

function resolveFieldAccessName(prop: Element | null, keyMap: Map<string, Element>): string | null {
  if (!prop) return null;
  let exprNode = directChild(prop, "node");
  if (!exprNode) return null;
  exprNode = resolve(exprNode, keyMap);
  if (exprNode.getAttribute("type") !== "org.lgna.project.ast.FieldAccess") return null;
  const fieldNode = getPropertyNode(exprNode, "field", keyMap);
  return fieldNode ? getPropertyText(fieldNode, "name") : null;
}

function extractDoubleArgs(methodInvocation: Element): number[] {
  const doubles: number[] = [];
  const reqArgs = getProperty(methodInvocation, "requiredArguments");
  if (!reqArgs) return doubles;

  const allNodes = reqArgs.getElementsByTagName("node");
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i];
    if (n.getAttribute("type") === "org.lgna.project.ast.DoubleLiteral") {
      const val = getPropertyText(n, "value");
      if (val !== null) doubles.push(parseFloat(val));
    }
  }
  return doubles;
}

// ---------------------------------------------------------------------------
// Method / procedure / function extraction
// ---------------------------------------------------------------------------

function extractMethods(
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
  const rtNode = getPropertyNode(methodNode, "returnType", keyMap);
  if (!rtNode) return "void";
  return extractResolvedTypeName(rtNode, keyMap) ?? "void";
}

function extractParameters(methodNode: Element, keyMap: Map<string, Element>): Array<{ name: string; type: string }> {
  const params: Array<{ name: string; type: string }> = [];
  const paramNodes = getCollectionNodesResolved(methodNode, "requiredParameters", keyMap)
    .filter((child) => child.getAttribute("type") === "org.lgna.project.ast.UserParameter");

  for (const resolved of paramNodes) {
    const pName = getPropertyText(resolved, "name") ?? "unknown";
    const typeNode = getPropertyNode(resolved, "valueType", keyMap);
    params.push({
      name: pName,
      type: typeNode ? extractResolvedTypeName(typeNode, keyMap) ?? "Object" : "Object",
    });
  }

  return params;
}

function extractStatements(methodNode: Element, keyMap: Map<string, Element>): AliceStatement[] {
  const bodyNode = getPropertyNode(methodNode, "body", keyMap);
  if (!bodyNode) return [];

  const stmtsProp = getProperty(bodyNode, "statements");
  if (!stmtsProp) return [];

  const results: AliceStatement[] = [];
  const coll = directChild(stmtsProp, "collection");
  const container = coll ?? stmtsProp;

  for (let i = 0; i < container.childNodes.length; i++) {
    const s = container.childNodes[i] as Element;
    if (s.nodeType !== 1 || s.tagName !== "node") continue;
    const stmt = parseStatement(resolve(s, keyMap), keyMap);
    if (stmt) results.push(stmt);
  }

  return results;
}

function parseStatement(node: Element, keyMap: Map<string, Element>): AliceStatement | null {
  const nodeType = node.getAttribute("type") ?? "";

  if (nodeType === "org.lgna.project.ast.ExpressionStatement") {
    const exprNode = getPropertyNode(node, "expression", keyMap);
    if (!exprNode) return null;
    const exprType = exprNode.getAttribute("type") ?? "";

    if (exprType === "org.lgna.project.ast.MethodInvocation") {
      const methodNode = getPropertyNode(exprNode, "method", keyMap);
      return {
        kind: "MethodCall",
        method: methodNode ? getPropertyText(methodNode, "name") ?? "unknown" : "unknown",
        object: "this",
        arguments: [],
      };
    }
  }

  if (nodeType === "org.lgna.project.ast.Comment") {
    return { kind: "Comment", expression: getPropertyText(node, "text") ?? "" };
  }

  if (nodeType === "org.lgna.project.ast.CountLoop") {
    return { kind: "CountLoop", count: 1, body: [] };
  }

  if (nodeType === "org.lgna.project.ast.ConditionalStatement") {
    return { kind: "IfElse", condition: "unknown", ifBody: [], elseBody: [] };
  }

  if (nodeType === "org.lgna.project.ast.ReturnStatement") {
    return { kind: "ReturnStatement", expression: "unknown" };
  }

  if (nodeType === "org.lgna.project.ast.LocalDeclarationStatement") {
    return { kind: "VariableDeclaration", name: "unknown", varType: "Object", value: "" };
  }

  return { kind: nodeType.split(".").pop() ?? "Unknown" };
}

// ---------------------------------------------------------------------------
// Numeric safety
// ---------------------------------------------------------------------------

function safeFloat(text: string | null, fallback = 0): number {
  const n = parseFloat(text ?? String(fallback));
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Sprint 2: Joint Hierarchy Extraction
// ---------------------------------------------------------------------------

const MAX_JOINT_DEPTH = 64;

interface JointData {
  name: string;
  parentName: string | null;
  position: { x: number; y: number; z: number };
  orientation: { x: number; y: number; z: number; w: number };
}

function extractJointHierarchy(jointNodes: Element[]): JointNode[] {
  const joints: JointData[] = [];

  for (const n of jointNodes) {
    const name = getPropertyText(n, "jointName");
    if (!name) continue;

    joints.push({
      name,
      parentName: getPropertyText(n, "parent") ?? null,
      position: {
        x: safeFloat(getPropertyText(n, "positionX")),
        y: safeFloat(getPropertyText(n, "positionY")),
        z: safeFloat(getPropertyText(n, "positionZ")),
      },
      orientation: {
        x: safeFloat(getPropertyText(n, "orientationX")),
        y: safeFloat(getPropertyText(n, "orientationY")),
        z: safeFloat(getPropertyText(n, "orientationZ")),
        w: safeFloat(getPropertyText(n, "orientationW"), 1),
      },
    });
  }

  const childrenMap = new Map<string, JointData[]>();
  const roots: JointData[] = [];

  for (const joint of joints) {
    if (joint.parentName) {
      const siblings = childrenMap.get(joint.parentName) ?? [];
      siblings.push(joint);
      childrenMap.set(joint.parentName, siblings);
    } else {
      roots.push(joint);
    }
  }

  function buildNode(data: JointData, depth: number): JointNode {
    const children = depth < MAX_JOINT_DEPTH
      ? (childrenMap.get(data.name) ?? []).map((child) => buildNode(child, depth + 1))
      : [];

    return {
      name: data.name,
      parentName: data.parentName,
      children,
      localTransform: {
        position: data.position,
        orientation: data.orientation,
      },
    };
  }

  return roots.map((root) => buildNode(root, 1));
}

// ---------------------------------------------------------------------------
// Sprint 2: Bounding Box Extraction
// ---------------------------------------------------------------------------

function extractBoundingBoxes(resourceInfoNodes: Element[]): Record<string, BoundingBox> {
  const boxes: Record<string, BoundingBox> = {};

  for (const n of resourceInfoNodes) {
    const name = getPropertyText(n, "resourceName");
    if (!name) continue;

    boxes[name] = {
      min: {
        x: safeFloat(getPropertyText(n, "boundingBoxMinX")),
        y: safeFloat(getPropertyText(n, "boundingBoxMinY")),
        z: safeFloat(getPropertyText(n, "boundingBoxMinZ")),
      },
      max: {
        x: safeFloat(getPropertyText(n, "boundingBoxMaxX")),
        y: safeFloat(getPropertyText(n, "boundingBoxMaxY")),
        z: safeFloat(getPropertyText(n, "boundingBoxMaxZ")),
      },
    };
  }

  return boxes;
}

// ---------------------------------------------------------------------------
// Sprint 2: Texture Reference Extraction
// ---------------------------------------------------------------------------

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tga", ".webp",
]);

function isSafeTexturePath(p: string): boolean {
  if (p.includes("..") || p.startsWith("/") || p.includes("\0")) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(p)) return false;
  const dotIdx = p.lastIndexOf(".");
  if (dotIdx === -1) return false;
  return IMAGE_EXTENSIONS.has(p.substring(dotIdx).toLowerCase());
}

function extractTextureRefs(textureNodes: Element[], zip: JSZip): string[] {
  const refs = new Set<string>();

  for (const n of textureNodes) {
    const texPath = getPropertyText(n, "texturePath");
    if (texPath && isSafeTexturePath(texPath)) refs.add(texPath);
  }

  for (const zipPath of Object.keys(zip.files)) {
    if (zip.files[zipPath].dir) continue;
    if (isSafeTexturePath(zipPath)) refs.add(zipPath);
  }

  return [...refs].sort();
}
