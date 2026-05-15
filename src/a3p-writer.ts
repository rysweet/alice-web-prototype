/**
 * Write a modified Alice project back to .a3p ZIP format.
 * Supports adding comments to methods and modifying scene objects.
 */
import JSZip from "jszip";
import * as fs from "fs";
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
  fs.mkdirSync(require("path").dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);

  return { bytesWritten: output.length, modificationsApplied: applied };
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
