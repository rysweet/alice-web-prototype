// ═══════════════════════════════════════════════════════════════════════════
// serialization.ts — Project serialization matching XmlProjectIo/JsonProjectIo
//
// Provides: serialize/deserialize for AliceProject in JSON and XML formats
// with full round-trip fidelity. Uses @xmldom/xmldom for XML processing.
// ═══════════════════════════════════════════════════════════════════════════

import {
  DOMParser,
  XMLSerializer,
  DOMImplementation,
  Document as XmlDocument,
  Element as XmlElement,
} from "@xmldom/xmldom";
import type {
  AliceProject,
  AliceObject,
  AliceMethod,
  AliceStatement,
} from "./a3p-parser.js";
import type { JointNode, BoundingBox } from "./story-api/types.js";

// ── Error Class ──────────────────────────────────────────────────────────

export class SerializationError extends Error {
  constructor(
    message: string,
    public readonly format: string,
  ) {
    super(message);
    this.name = "SerializationError";
  }
}

// ── Public Types ─────────────────────────────────────────────────────────

export type SerializationFormat = "json" | "xml";

export interface SerializationOptions {
  format: SerializationFormat;
  pretty?: boolean;
}

// ── Public API ───────────────────────────────────────────────────────────

export function serialize(
  project: AliceProject,
  options: SerializationOptions,
): string {
  if (options.format === "json") {
    return options.pretty === false
      ? JSON.stringify(project)
      : serializeToJson(project);
  }
  return serializeToXml(project);
}

export function deserialize(
  data: string,
  format: SerializationFormat,
): AliceProject {
  if (format === "json") return deserializeFromJson(data);
  return deserializeFromXml(data);
}

// ═══════════════════════════════════════════════════════════════════════════
// JSON
// ═══════════════════════════════════════════════════════════════════════════

export function serializeToJson(project: AliceProject): string {
  return JSON.stringify(project, null, 2);
}

export function deserializeFromJson(json: string): AliceProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e: unknown) {
    throw new SerializationError(
      `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
      "json",
    );
  }
  return validateProject(parsed, "json");
}

function validateProject(obj: unknown, format: string): AliceProject {
  if (!obj || typeof obj !== "object") {
    throw new SerializationError("Expected an object", format);
  }
  const record = obj as Record<string, unknown>;
  if (!("version" in record) || !record.version) {
    throw new SerializationError(
      "Missing required field: version",
      format,
    );
  }
  if (!("projectName" in record) || !record.projectName) {
    throw new SerializationError(
      "Missing required field: projectName",
      format,
    );
  }
  if (!("sceneObjects" in record)) {
    throw new SerializationError(
      "Missing required field: sceneObjects",
      format,
    );
  }
  if (!("methods" in record)) {
    throw new SerializationError(
      "Missing required field: methods",
      format,
    );
  }
  if (!Array.isArray(record.sceneObjects)) {
    throw new SerializationError(
      "sceneObjects must be an array",
      format,
    );
  }
  if (!Array.isArray(record.methods)) {
    throw new SerializationError("methods must be an array", format);
  }
  return obj as AliceProject;
}

// ═══════════════════════════════════════════════════════════════════════════
// XML Serialization
// ═══════════════════════════════════════════════════════════════════════════

export function serializeToXml(project: AliceProject): string {
  const impl = new DOMImplementation();
  const doc = impl.createDocument(null, "alice-project");
  const root = doc.documentElement!;

  root.setAttribute("version", project.version);
  root.setAttribute("projectName", project.projectName);

  // Scene objects
  const sceneObjectsEl = doc.createElement("scene-objects");
  for (const obj of project.sceneObjects) {
    sceneObjectsEl.appendChild(serializeSceneObject(doc, obj));
  }
  root.appendChild(sceneObjectsEl);

  // Methods
  const methodsEl = doc.createElement("methods");
  for (const method of project.methods) {
    methodsEl.appendChild(serializeMethod(doc, method));
  }
  root.appendChild(methodsEl);

  // Optional: joint hierarchy
  if (project.jointHierarchy !== undefined) {
    const jhEl = doc.createElement("joint-hierarchy");
    for (const joint of project.jointHierarchy) {
      jhEl.appendChild(serializeJoint(doc, joint));
    }
    root.appendChild(jhEl);
  }

  // Optional: bounding boxes
  if (project.boundingBoxes !== undefined) {
    const bbEl = doc.createElement("bounding-boxes");
    for (const [name, box] of Object.entries(project.boundingBoxes)) {
      bbEl.appendChild(serializeBoundingBox(doc, name, box));
    }
    root.appendChild(bbEl);
  }

  // Optional: texture refs
  if (project.textureRefs !== undefined) {
    const trEl = doc.createElement("texture-refs");
    for (const path of project.textureRefs) {
      const refEl = doc.createElement("texture-ref");
      refEl.setAttribute("path", path);
      trEl.appendChild(refEl);
    }
    root.appendChild(trEl);
  }

  return new XMLSerializer().serializeToString(root);
}

function serializeSceneObject(doc: XmlDocument, obj: AliceObject): XmlElement {
  const el = doc.createElement("scene-object");
  el.setAttribute("name", obj.name);
  el.setAttribute("typeName", obj.typeName);
  if (obj.resourceType !== null) {
    el.setAttribute("resourceType", obj.resourceType);
  }

  if (obj.position !== null) {
    const pos = doc.createElement("position");
    pos.setAttribute("x", String(obj.position.x));
    pos.setAttribute("y", String(obj.position.y));
    pos.setAttribute("z", String(obj.position.z));
    el.appendChild(pos);
  }

  if (obj.orientation !== null) {
    const ori = doc.createElement("orientation");
    ori.setAttribute("x", String(obj.orientation.x));
    ori.setAttribute("y", String(obj.orientation.y));
    ori.setAttribute("z", String(obj.orientation.z));
    ori.setAttribute("w", String(obj.orientation.w));
    el.appendChild(ori);
  }

  if (obj.size !== null) {
    const size = doc.createElement("size");
    size.setAttribute("width", String(obj.size.width));
    size.setAttribute("height", String(obj.size.height));
    size.setAttribute("depth", String(obj.size.depth));
    el.appendChild(size);
  }

  return el;
}

function serializeMethod(doc: XmlDocument, method: AliceMethod): XmlElement {
  const el = doc.createElement("method");
  el.setAttribute("name", method.name);
  el.setAttribute("isFunction", String(method.isFunction));
  el.setAttribute("returnType", method.returnType);

  const paramsEl = doc.createElement("parameters");
  for (const param of method.parameters) {
    const pEl = doc.createElement("parameter");
    pEl.setAttribute("name", param.name);
    pEl.setAttribute("type", param.type);
    paramsEl.appendChild(pEl);
  }
  el.appendChild(paramsEl);

  const stmtsEl = doc.createElement("statements");
  for (const stmt of method.statements) {
    stmtsEl.appendChild(serializeStatement(doc, stmt));
  }
  el.appendChild(stmtsEl);

  return el;
}

function serializeStatement(doc: XmlDocument, stmt: AliceStatement): XmlElement {
  const el = doc.createElement("statement");
  el.setAttribute("kind", stmt.kind);

  // Simple string/number attributes
  if (stmt.object !== undefined) el.setAttribute("object", stmt.object);
  if (stmt.method !== undefined) el.setAttribute("method", stmt.method);
  if (stmt.count !== undefined) el.setAttribute("count", String(stmt.count));
  if (stmt.condition !== undefined)
    el.setAttribute("condition", stmt.condition);
  if (stmt.expression !== undefined)
    el.setAttribute("expression", stmt.expression);
  if (stmt.name !== undefined) el.setAttribute("name", stmt.name);
  if (stmt.varType !== undefined) el.setAttribute("varType", stmt.varType);
  if (stmt.value !== undefined) el.setAttribute("value", stmt.value);
  if (stmt.event !== undefined) el.setAttribute("event", stmt.event);

  // Array fields
  if (stmt.arguments !== undefined) {
    const argsEl = doc.createElement("arguments");
    for (const arg of stmt.arguments) {
      const argEl = doc.createElement("argument");
      argEl.setAttribute("value", arg);
      argsEl.appendChild(argEl);
    }
    el.appendChild(argsEl);
  }

  if (stmt.body !== undefined) {
    const bodyEl = doc.createElement("body");
    for (const child of stmt.body) {
      bodyEl.appendChild(serializeStatement(doc, child));
    }
    el.appendChild(bodyEl);
  }

  if (stmt.ifBody !== undefined) {
    const ifEl = doc.createElement("if-body");
    for (const child of stmt.ifBody) {
      ifEl.appendChild(serializeStatement(doc, child));
    }
    el.appendChild(ifEl);
  }

  if (stmt.elseBody !== undefined) {
    const elseEl = doc.createElement("else-body");
    for (const child of stmt.elseBody) {
      elseEl.appendChild(serializeStatement(doc, child));
    }
    el.appendChild(elseEl);
  }

  return el;
}

function serializeJoint(doc: XmlDocument, joint: JointNode): XmlElement {
  const el = doc.createElement("joint");
  el.setAttribute("name", joint.name);
  if (joint.parentName !== null) {
    el.setAttribute("parentName", joint.parentName);
  }

  const transformEl = doc.createElement("local-transform");
  const posEl = doc.createElement("position");
  posEl.setAttribute("x", String(joint.localTransform.position.x));
  posEl.setAttribute("y", String(joint.localTransform.position.y));
  posEl.setAttribute("z", String(joint.localTransform.position.z));
  transformEl.appendChild(posEl);

  const oriEl = doc.createElement("orientation");
  oriEl.setAttribute("x", String(joint.localTransform.orientation.x));
  oriEl.setAttribute("y", String(joint.localTransform.orientation.y));
  oriEl.setAttribute("z", String(joint.localTransform.orientation.z));
  oriEl.setAttribute("w", String(joint.localTransform.orientation.w));
  transformEl.appendChild(oriEl);
  el.appendChild(transformEl);

  const childrenEl = doc.createElement("children");
  for (const child of joint.children) {
    childrenEl.appendChild(serializeJoint(doc, child));
  }
  el.appendChild(childrenEl);

  return el;
}

function serializeBoundingBox(
  doc: XmlDocument,
  name: string,
  box: BoundingBox,
): XmlElement {
  const el = doc.createElement("bounding-box");
  el.setAttribute("name", name);

  const minEl = doc.createElement("min");
  minEl.setAttribute("x", String(box.min.x));
  minEl.setAttribute("y", String(box.min.y));
  minEl.setAttribute("z", String(box.min.z));
  el.appendChild(minEl);

  const maxEl = doc.createElement("max");
  maxEl.setAttribute("x", String(box.max.x));
  maxEl.setAttribute("y", String(box.max.y));
  maxEl.setAttribute("z", String(box.max.z));
  el.appendChild(maxEl);

  return el;
}

// ═══════════════════════════════════════════════════════════════════════════
// XML Deserialization
// ═══════════════════════════════════════════════════════════════════════════

export function deserializeFromXml(xml: string): AliceProject {
  let doc: XmlDocument;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(xml, "text/xml");
  } catch (e: unknown) {
    throw new SerializationError(
      `Malformed XML: ${e instanceof Error ? e.message : String(e)}`,
      "xml",
    );
  }

  const root = doc.documentElement;
  if (!root || root.nodeName !== "alice-project") {
    throw new SerializationError(
      `Expected root element 'alice-project', got '${root?.nodeName ?? "none"}'`,
      "xml",
    );
  }

  const version = root.getAttribute("version");
  const projectName = root.getAttribute("projectName");
  if (!version) {
    throw new SerializationError("Missing version attribute", "xml");
  }
  if (!projectName) {
    throw new SerializationError("Missing projectName attribute", "xml");
  }

  const sceneObjectsEl = getChild(root, "scene-objects");
  if (!sceneObjectsEl) {
    throw new SerializationError(
      "Missing required element: scene-objects",
      "xml",
    );
  }

  const methodsEl = getChild(root, "methods");
  if (!methodsEl) {
    throw new SerializationError(
      "Missing required element: methods",
      "xml",
    );
  }

  const sceneObjects = getChildren(sceneObjectsEl, "scene-object").map(
    deserializeSceneObject,
  );
  const methods = getChildren(methodsEl, "method").map(deserializeMethod);

  const project: AliceProject = {
    version,
    projectName,
    sceneObjects,
    methods,
  };

  // Optional elements
  const jhEl = getChild(root, "joint-hierarchy");
  if (jhEl) {
    project.jointHierarchy = getChildren(jhEl, "joint").map(deserializeJoint);
  }

  const bbEl = getChild(root, "bounding-boxes");
  if (bbEl) {
    project.boundingBoxes = {};
    for (const boxEl of getChildren(bbEl, "bounding-box")) {
      const name = boxEl.getAttribute("name")!;
      project.boundingBoxes[name] = deserializeBoundingBoxEl(boxEl);
    }
  }

  const trEl = getChild(root, "texture-refs");
  if (trEl) {
    project.textureRefs = getChildren(trEl, "texture-ref").map(
      (el) => el.getAttribute("path")!,
    );
  }

  return project;
}

function deserializeSceneObject(el: XmlElement): AliceObject {
  const name = el.getAttribute("name")!;
  const typeName = el.getAttribute("typeName")!;
  const resourceType = el.getAttribute("resourceType");

  const posEl = getChild(el, "position");
  const position = posEl
    ? {
        x: Number(posEl.getAttribute("x")),
        y: Number(posEl.getAttribute("y")),
        z: Number(posEl.getAttribute("z")),
      }
    : null;

  const oriEl = getChild(el, "orientation");
  const orientation = oriEl
    ? {
        x: Number(oriEl.getAttribute("x")),
        y: Number(oriEl.getAttribute("y")),
        z: Number(oriEl.getAttribute("z")),
        w: Number(oriEl.getAttribute("w")),
      }
    : null;

  const sizeEl = getChild(el, "size");
  const size = sizeEl
    ? {
        width: Number(sizeEl.getAttribute("width")),
        height: Number(sizeEl.getAttribute("height")),
        depth: Number(sizeEl.getAttribute("depth")),
      }
    : null;

  return { name, typeName, resourceType, position, orientation, size };
}

function deserializeMethod(el: XmlElement): AliceMethod {
  const name = el.getAttribute("name")!;
  const isFunction = el.getAttribute("isFunction") === "true";
  const returnType = el.getAttribute("returnType")!;

  const paramsEl = getChild(el, "parameters");
  const parameters = paramsEl
    ? getChildren(paramsEl, "parameter").map((pEl) => ({
        name: pEl.getAttribute("name")!,
        type: pEl.getAttribute("type")!,
      }))
    : [];

  const stmtsEl = getChild(el, "statements");
  const statements = stmtsEl
    ? getChildren(stmtsEl, "statement").map(deserializeStatementEl)
    : [];

  return { name, isFunction, returnType, parameters, statements };
}

function deserializeStatementEl(el: XmlElement): AliceStatement {
  const kind = el.getAttribute("kind")!;
  const stmt: AliceStatement = { kind };

  // Simple attributes
  const object = el.getAttribute("object");
  if (object !== null) stmt.object = object;
  const method = el.getAttribute("method");
  if (method !== null) stmt.method = method;
  const count = el.getAttribute("count");
  if (count !== null) stmt.count = Number(count);
  const condition = el.getAttribute("condition");
  if (condition !== null) stmt.condition = condition;
  const expression = el.getAttribute("expression");
  if (expression !== null) stmt.expression = expression;
  const name = el.getAttribute("name");
  if (name !== null) stmt.name = name;
  const varType = el.getAttribute("varType");
  if (varType !== null) stmt.varType = varType;
  const value = el.getAttribute("value");
  if (value !== null) stmt.value = value;
  const event = el.getAttribute("event");
  if (event !== null) stmt.event = event;

  // Array children
  const argsEl = getChild(el, "arguments");
  if (argsEl) {
    stmt.arguments = getChildren(argsEl, "argument").map(
      (a) => a.getAttribute("value")!,
    );
  }
  const bodyEl = getChild(el, "body");
  if (bodyEl) {
    stmt.body = getChildren(bodyEl, "statement").map(deserializeStatementEl);
  }
  const ifBodyEl = getChild(el, "if-body");
  if (ifBodyEl) {
    stmt.ifBody = getChildren(ifBodyEl, "statement").map(
      deserializeStatementEl,
    );
  }
  const elseBodyEl = getChild(el, "else-body");
  if (elseBodyEl) {
    stmt.elseBody = getChildren(elseBodyEl, "statement").map(
      deserializeStatementEl,
    );
  }

  return stmt;
}

function deserializeJoint(el: XmlElement): JointNode {
  const name = el.getAttribute("name")!;
  const parentName = el.getAttribute("parentName");

  const transformEl = getChild(el, "local-transform")!;
  const posEl = getChild(transformEl, "position")!;
  const oriEl = getChild(transformEl, "orientation")!;

  const localTransform = {
    position: {
      x: Number(posEl.getAttribute("x")),
      y: Number(posEl.getAttribute("y")),
      z: Number(posEl.getAttribute("z")),
    },
    orientation: {
      x: Number(oriEl.getAttribute("x")),
      y: Number(oriEl.getAttribute("y")),
      z: Number(oriEl.getAttribute("z")),
      w: Number(oriEl.getAttribute("w")),
    },
  };

  const childrenEl = getChild(el, "children");
  const children = childrenEl
    ? getChildren(childrenEl, "joint").map(deserializeJoint)
    : [];

  return { name, parentName, children, localTransform };
}

function deserializeBoundingBoxEl(el: XmlElement): BoundingBox {
  const minEl = getChild(el, "min")!;
  const maxEl = getChild(el, "max")!;
  return {
    min: {
      x: Number(minEl.getAttribute("x")),
      y: Number(minEl.getAttribute("y")),
      z: Number(minEl.getAttribute("z")),
    },
    max: {
      x: Number(maxEl.getAttribute("x")),
      y: Number(maxEl.getAttribute("y")),
      z: Number(maxEl.getAttribute("z")),
    },
  };
}

// ── DOM Helpers ──────────────────────────────────────────────────────────

function getChild(parent: XmlElement, tagName: string): XmlElement | null {
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1 && node.nodeName === tagName) {
      return node as XmlElement;
    }
  }
  return null;
}

function getChildren(parent: XmlElement, tagName: string): XmlElement[] {
  const result: XmlElement[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (node.nodeType === 1 && node.nodeName === tagName) {
      result.push(node as XmlElement);
    }
  }
  return result;
}
