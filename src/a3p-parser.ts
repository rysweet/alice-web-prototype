import JSZip from "jszip";

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
  body?: AliceStatement[];
  /** For if/else */
  condition?: string;
  ifBody?: AliceStatement[];
  elseBody?: AliceStatement[];
  /** For events */
  event?: string;
  /** For return */
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

/** Top-level result from parsing an .a3p file. */
export interface AliceProject {
  version: string;
  projectName: string;
  sceneObjects: AliceObject[];
  methods: AliceMethod[];
}

/**
 * Parse an Alice .a3p file (ZIP) and extract the scene graph.
 * Works in both browser (File/ArrayBuffer) and Node (Buffer).
 */
export async function parseA3P(data: ArrayBuffer | Uint8Array): Promise<AliceProject> {
  const zip = await JSZip.loadAsync(data);

  await ensureNodeXml();
  const version = await readTextFile(zip, "version.txt");
  const xmlText = await readXml(zip);
  const doc = parseXmlString(xmlText);

  const projectName = getProjectName(doc);
  const sceneObjects = extractSceneObjects(doc);
  const keyMap = buildKeyMap(doc.documentElement);
  const methods = extractMethods(doc, keyMap);

  return { version: version.trim(), projectName, sceneObjects, methods };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readTextFile(zip: JSZip, name: string): Promise<string> {
  const entry = zip.file(name);
  if (!entry) return "";
  return entry.async("string");
}

async function readXml(zip: JSZip): Promise<string> {
  const entry = zip.file("programType.xml");
  if (!entry) throw new Error("No programType.xml found in .a3p archive");

  // Detect encoding: the file may be UTF-16BE, UTF-16LE, or UTF-8/ASCII.
  const raw = await entry.async("uint8array");

  // UTF-16 BOM detection
  if (raw.length >= 2) {
    if (raw[0] === 0xfe && raw[1] === 0xff) {
      return decodeUtf16(raw, true); // big-endian
    }
    if (raw[0] === 0xff && raw[1] === 0xfe) {
      return decodeUtf16(raw, false); // little-endian
    }
    // Heuristic: if second byte is 0x00, likely UTF-16 big-endian without BOM
    if (raw[0] === 0x00 || raw[1] === 0x00) {
      const isBE = raw[0] === 0x00;
      return decodeUtf16(raw, isBE);
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
  // Node.js: use the lazily-loaded xmldom parser
  if (!_xmlDomParser) {
    throw new Error("Call initNodeXml() before parseXmlString in Node.js");
  }
  return _xmlDomParser.parseFromString(xml, "application/xml");
}

// Lazy-loaded Node.js XML parser
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

/**
 * Alice XML uses a key-based reference system: `<node key="X" type="...">...children...</node>`
 * is a definition, while `<node key="X"/>` (no type, no children) is a reference.
 * Build a map from key → definition element so we can resolve references.
 */
function buildKeyMap(root: Element): Map<string, Element> {
  const map = new Map<string, Element>();
  const allNodes = root.getElementsByTagName("node");
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i];
    const key = n.getAttribute("key");
    if (!key) continue;
    // A definition has a `type` attribute or has child elements
    if (n.getAttribute("type") || n.childNodes.length > 0) {
      // Only store first definition (some keys appear multiple times as refs)
      if (!map.has(key)) {
        map.set(key, n);
      }
    }
  }
  return map;
}

/** Resolve a node: if it's a keyref (no type, no children), return the definition. */
function resolve(node: Element, keyMap: Map<string, Element>): Element {
  const key = node.getAttribute("key");
  if (!key) return node;
  // If this node has a type attribute or children, it's a definition
  if (node.getAttribute("type") || node.childNodes.length > 0) return node;
  // Otherwise, it's a reference – resolve it
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

function extractSceneObjects(doc: Document): AliceObject[] {
  const objects: AliceObject[] = [];
  const root = doc.documentElement;

  const keyMap = buildKeyMap(root);

  // Find the Scene NamedUserType (superType = org.lgna.story.SScene)
  const sceneType = findSceneType(root, keyMap);
  if (!sceneType) return objects;

  // Gather all field nodes inside the scene's "fields" property, resolving refs
  const fieldNodes = getCollectionNodesResolved(sceneType, "fields", keyMap);

  for (const field of fieldNodes) {
    const obj = parseUserField(field, keyMap);
    if (obj) objects.push(obj);
  }

  // Extract position/orientation/size from scene setup methods
  enrichFromMethods(sceneType, objects, keyMap);

  return objects;
}

function findSceneType(root: Element, keyMap: Map<string, Element>): Element | null {
  // Walk all <node type="org.lgna.project.ast.NamedUserType"> and find the one
  // whose superType contains "SScene".
  const allNodes = root.getElementsByTagName("node");
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i];
    if (n.getAttribute("type") !== "org.lgna.project.ast.NamedUserType") continue;
    const superType = getSuperTypeName(n, keyMap);
    if (superType && superType.includes("SScene")) return n;
  }
  return null;
}

function getSuperTypeName(typeNode: Element, keyMap: Map<string, Element>): string | null {
  const prop = getProperty(typeNode, "superType");
  if (!prop) return null;
  let inner = directChild(prop, "node");
  if (!inner) return null;
  inner = resolve(inner, keyMap);
  const te = directChild(inner, "type");
  return te?.getAttribute("name") ?? null;
}

/** Get the text content of a <property name="X"><value>TEXT</value></property> */
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

function getCollectionNodes(parent: Element, propName: string, nodeType: string): Element[] {
  const prop = getProperty(parent, propName);
  if (!prop) return [];
  const coll = directChild(prop, "collection");
  if (!coll) return [];
  const result: Element[] = [];
  for (let i = 0; i < coll.childNodes.length; i++) {
    const c = coll.childNodes[i] as Element;
    if (c.nodeType === 1 && c.tagName === "node" && c.getAttribute("type") === nodeType) {
      result.push(c);
    }
  }
  return result;
}

/** Like getCollectionNodes but resolves key references and doesn't filter by type. */
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

function parseUserField(field: Element, keyMap: Map<string, Element>): AliceObject | null {
  const name = getPropertyText(field, "name");
  if (!name) return null;

  let typeName = "unknown";
  const vtProp = getProperty(field, "valueType");
  if (vtProp) {
    let vtNode = directChild(vtProp, "node");
    if (vtNode) {
      vtNode = resolve(vtNode, keyMap);
      const te = directChild(vtNode, "type");
      if (te) {
        typeName = te.getAttribute("name") ?? "unknown";
      } else {
        // Inline NamedUserType – grab its name + superType
        const utName = getPropertyText(vtNode, "name");
        const superName = getSuperTypeName(vtNode, keyMap);
        typeName = superName ?? `User:${utName ?? "unknown"}`;
      }
    }
  }

  let resourceType: string | null = null;
  const initProp = getProperty(field, "initializer");
  if (initProp) {
    let initNode = directChild(initProp, "node");
    if (initNode) {
      initNode = resolve(initNode, keyMap);
      const allRefs = initNode.getElementsByTagName("resourceReference");
      if (allRefs.length > 0) {
        resourceType = allRefs[0].getAttribute("name") ?? null;
      }
    }
  }

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

    const methodProp = getProperty(n, "method");
    if (!methodProp) continue;
    let methodNode = directChild(methodProp, "node");
    if (!methodNode) continue;
    methodNode = resolve(methodNode, keyMap);
    const methodEl = directChild(methodNode, "method");
    if (!methodEl) continue;

    const methodName = methodEl.getAttribute("name") ?? "";

    // Try to find which field this invocation is on via expression > FieldAccess > field
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
  const fieldProp = getProperty(exprNode, "field");
  if (!fieldProp) return null;
  let fieldNode = directChild(fieldProp, "node");
  if (!fieldNode) return null;
  fieldNode = resolve(fieldNode, keyMap);
  return getPropertyText(fieldNode, "name");
}

function extractDoubleArgs(methodInvocation: Element): number[] {
  const doubles: number[] = [];
  const reqArgs = getProperty(methodInvocation, "requiredArguments");
  if (!reqArgs) return doubles;

  // Walk into the argument's expression tree and collect DoubleLiteral values in order
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

function extractMethods(doc: Document, keyMap: Map<string, Element>): AliceMethod[] {
  const methods: AliceMethod[] = [];
  const allNodes = doc.getElementsByTagName("node");

  for (let i = 0; i < allNodes.length; i++) {
    const node = allNodes[i];
    const nodeType = node.getAttribute("type");
    if (nodeType !== "org.lgna.project.ast.UserMethod") continue;

    const name = getPropertyText(node, "name");
    if (!name || name === "main") continue;

    const returnType = extractReturnType(node, keyMap);
    const isFunction = returnType !== "void" && returnType !== "";
    const parameters = extractParameters(node, keyMap);
    const statements = extractStatements(node, keyMap);

    methods.push({ name, isFunction, returnType, parameters, statements });
  }

  return methods;
}

function extractReturnType(methodNode: Element, keyMap: Map<string, Element>): string {
  const rtProp = getProperty(methodNode, "returnType");
  if (!rtProp) return "void";
  let rtNode = directChild(rtProp, "node");
  if (!rtNode) return "void";
  rtNode = resolve(rtNode, keyMap);
  const rtType = rtNode.getAttribute("type") ?? "";
  if (rtType === "org.lgna.project.ast.JavaType") {
    const cls = getPropertyText(rtNode, "class");
    if (cls === "void" || cls === "java.lang.Void") return "void";
    return cls ?? "void";
  }
  return "void";
}

function extractParameters(methodNode: Element, keyMap: Map<string, Element>): Array<{ name: string; type: string }> {
  const params: Array<{ name: string; type: string }> = [];
  const paramNodes = getCollectionNodes(methodNode, "requiredParameters", "org.lgna.project.ast.UserParameter");
  for (const p of paramNodes) {
    const resolved = resolve(p, keyMap);
    const pName = getPropertyText(resolved, "name") ?? "unknown";
    const vtProp = getProperty(resolved, "valueType");
    let pType = "Object";
    if (vtProp) {
      let vtNode = directChild(vtProp, "node");
      if (vtNode) {
        vtNode = resolve(vtNode, keyMap);
        pType = getPropertyText(vtNode, "class") ?? "Object";
      }
    }
    params.push({ name: pName, type: pType });
  }
  return params;
}

function extractStatements(methodNode: Element, keyMap: Map<string, Element>): AliceStatement[] {
  const bodyProp = getProperty(methodNode, "body");
  if (!bodyProp) return [];
  let bodyNode = directChild(bodyProp, "node");
  if (!bodyNode) return [];
  bodyNode = resolve(bodyNode, keyMap);

  const stmtsProp = getProperty(bodyNode, "statements");
  if (!stmtsProp) return [];

  const results: AliceStatement[] = [];
  const stmtNodes = stmtsProp.getElementsByTagName("node");

  for (let i = 0; i < stmtNodes.length; i++) {
    const s = stmtNodes[i];
    // Only process direct children of the statements collection
    if (s.parentElement !== stmtsProp && s.parentElement?.parentElement !== stmtsProp) continue;

    const stmt = parseStatement(resolve(s, keyMap), keyMap);
    if (stmt) results.push(stmt);
  }

  return results;
}

function parseStatement(node: Element, keyMap: Map<string, Element>): AliceStatement | null {
  const nodeType = node.getAttribute("type") ?? "";

  if (nodeType === "org.lgna.project.ast.ExpressionStatement") {
    const exprProp = getProperty(node, "expression");
    if (!exprProp) return null;
    let exprNode = directChild(exprProp, "node");
    if (!exprNode) return null;
    exprNode = resolve(exprNode, keyMap);
    const exprType = exprNode.getAttribute("type") ?? "";

    if (exprType === "org.lgna.project.ast.MethodInvocation") {
      const methodProp = getProperty(exprNode, "method");
      let methodName = "unknown";
      if (methodProp) {
        let mn = directChild(methodProp, "node");
        if (mn) {
          mn = resolve(mn, keyMap);
          methodName = getPropertyText(mn, "name") ?? "unknown";
        }
      }
      return { kind: "MethodCall", method: methodName, object: "this", arguments: [] };
    }
  }

  if (nodeType === "org.lgna.project.ast.Comment") {
    const text = getPropertyText(node, "text") ?? "";
    return { kind: "Comment", expression: text };
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
