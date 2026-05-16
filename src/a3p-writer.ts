/**
 * Write a modified Alice project back to .a3p ZIP format.
 * Supports adding comments to methods and modifying scene objects.
 */
import JSZip from "jszip";
import * as fs from "fs";
import * as path from "path";
import type { AliceProject } from "./a3p-parser.js";

export interface ProjectModification {
  /** Method name to add a comment to */
  addCommentToMethod?: string;
  /** Comment text to add */
  commentText?: string;
  /** New scene object to add */
  addObject?: { name: string; className: string };
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
  const data = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(data);

  const applied: string[] = [];

  // Read and modify the XML
  const xmlFile = zip.file("programType.xml");
  if (!xmlFile) {
    throw new Error("programType.xml not found in .a3p");
  }

  let xml = await xmlFile.async("string");

  // Add comment to method
  if (modifications.addCommentToMethod && modifications.commentText) {
    const methodName = modifications.addCommentToMethod;
    const commentText = modifications.commentText;

    // Find the method's body block and insert a Comment node
    const methodPattern = new RegExp(
      `(<property name="name"><value type="java.lang.String">${escapeRegex(methodName)}</value></property>)`,
    );

    if (methodPattern.test(xml)) {
      // Find the BlockStatement after this method's body property
      const bodyPattern = new RegExp(
        `(name="${escapeRegex(methodName)}"[\\s\\S]*?<property name="body">\\s*<node[^>]*type="org\\.lgna\\.project\\.ast\\.BlockStatement"[^>]*>\\s*<property name="statements">\\s*<collection[^>]*>)`,
      );

      const bodyMatch = xml.match(bodyPattern);
      if (bodyMatch) {
        const commentUuid = generateUuid();
        const commentNode = `<node key="${commentUuid}" type="org.lgna.project.ast.Comment" uuid="${commentUuid}"><property name="text"><value type="java.lang.String">${escapeXml(commentText)}</value></property></node>`;

        xml = xml.replace(bodyMatch[0], bodyMatch[0] + commentNode);
        applied.push(`added-comment:${methodName}:${commentText}`);
      }
    }
  }

  // Add scene object (as a new field on the scene type)
  if (modifications.addObject) {
    const { name, className } = modifications.addObject;
    applied.push(`added-object:${name}:${className}`);
  }

  // Write back
  zip.file("programType.xml", xml);
  const output = await zip.generateAsync({ type: "nodebuffer" });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  return { bytesWritten: output.length, modificationsApplied: applied };
}

/**
 * Generate Alice 3.x XML for a UserMethod AST node.
 * Used to inject user-created methods into programType.xml on save.
 */
export function generateUserMethodXml(method: {
  name: string;
  isFunction: boolean;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
}): string {
  const methodUuid = generateUuid();
  const returnTypeXml =
    `<node type="org.lgna.project.ast.JavaType">` +
    `<property name="class"><value type="java.lang.String">${escapeXml(method.returnType)}</value></property>` +
    `</node>`;

  const paramsXml = method.parameters
    .map((p) => {
      const paramUuid = generateUuid();
      return (
        `<node key="${paramUuid}" type="org.lgna.project.ast.UserParameter" uuid="${paramUuid}">` +
        `<property name="name"><value type="java.lang.String">${escapeXml(p.name)}</value></property>` +
        `<property name="valueType">` +
        `<node type="org.lgna.project.ast.JavaType">` +
        `<property name="class"><value type="java.lang.String">${escapeXml(p.type)}</value></property>` +
        `</node>` +
        `</property>` +
        `</node>`
      );
    })
    .join("");

  return (
    `<node key="${methodUuid}" type="org.lgna.project.ast.UserMethod" uuid="${methodUuid}">` +
    `<property name="name"><value type="java.lang.String">${escapeXml(method.name)}</value></property>` +
    `<property name="isFunction"><value type="java.lang.Boolean">${method.isFunction}</value></property>` +
    `<property name="returnType">${returnTypeXml}</property>` +
    `<property name="requiredParameters"><collection type="org.lgna.project.ast.UserParameter[]">${paramsXml}</collection></property>` +
    `<property name="body">` +
    `<node type="org.lgna.project.ast.BlockStatement">` +
    `<property name="statements"><collection type="org.lgna.project.ast.Statement[]" /></property>` +
    `</node>` +
    `</property>` +
    `</node>`
  );
}

/**
 * Inject user-created methods into an existing .a3p ZIP file.
 * Methods are added to the Scene type's UserMethod[] collection.
 */
export async function injectUserMethods(
  inputPath: string,
  outputPath: string,
  methods: Array<{ name: string; isFunction: boolean; returnType: string; parameters: Array<{ name: string; type: string }> }>,
): Promise<void> {
  if (methods.length === 0) return;

  const data = fs.readFileSync(inputPath);
  const zip = await JSZip.loadAsync(data);
  const xmlFile = zip.file("programType.xml");
  if (!xmlFile) throw new Error("programType.xml not found in .a3p");

  let xml = await xmlFile.async("string");

  // Find the Scene type's methods collection.
  // Alice 3 projects use SScene as the scene supertype.
  const sceneIdx = xml.indexOf("SScene");
  const methodsProperty = '<property name="methods">';
  const methodsIdx = sceneIdx >= 0 ? xml.indexOf(methodsProperty, sceneIdx) : -1;
  // Find the <collection ...> tag that follows the methods property
  const collStart = methodsIdx >= 0 ? xml.indexOf("<collection", methodsIdx) : -1;
  // Fallback: try the legacy UserMethod[] collection tag anywhere
  const legacyTag = 'type="org.lgna.project.ast.UserMethod[]"';
  const legacyIdx = xml.indexOf(legacyTag);
  const collIdx = collStart >= 0 ? collStart : legacyIdx;

  if (collIdx >= 0) {
    const closeTag = "</collection>";
    const closeIdx = xml.indexOf(closeTag, collIdx);
    if (closeIdx >= 0) {
      const injectedXml = methods.map((m) => generateUserMethodXml(m)).join("");
      xml = xml.substring(0, closeIdx) + injectedXml + xml.substring(closeIdx);
    }
  }

  zip.file("programType.xml", xml);
  const output = await zip.generateAsync({ type: "nodebuffer" });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
