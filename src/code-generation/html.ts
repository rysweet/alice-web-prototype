import { generateJavaSource } from "./java-source.js";
import type { JavaCodeGenerationOptions } from "./types.js";

const JAVA_KEYWORDS = new Set([
  "abstract", "boolean", "break", "case", "catch", "class", "default", "double", "else", "extends",
  "false", "final", "for", "if", "int", "new", "null", "private", "protected", "public", "return",
  "static", "super", "switch", "this", "throw", "true", "try", "void", "while",
]);

export function generateJavaHtml(node: unknown, options: JavaCodeGenerationOptions = {}): string {
  const source = generateJavaSource(node, options);
  const className = escapeHtml(options.htmlClassName ?? "alice-code");
  return `<pre class="${className}"><code>${highlightJava(source)}</code></pre>`;
}

function highlightJava(source: string): string {
  let index = 0;
  let html = "";
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index);
      const comment = source.slice(index, end === -1 ? source.length : end);
      html += `<span class="comment">${escapeHtml(comment)}</span>`;
      index = end === -1 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      const comment = source.slice(index, end === -1 ? source.length : end + 2);
      html += `<span class="comment">${escapeHtml(comment)}</span>`;
      index = end === -1 ? source.length : end + 2;
      continue;
    }
    if (source[index] === '"') {
      const end = findStringEnd(source, index + 1);
      html += `<span class="string">${escapeHtml(source.slice(index, end))}</span>`;
      index = end;
      continue;
    }
    if (isIdentifierStart(source[index])) {
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end])) {
        end += 1;
      }
      const word = source.slice(index, end);
      html += JAVA_KEYWORDS.has(word)
        ? `<span class="keyword">${word}</span>`
        : escapeHtml(word);
      index = end;
      continue;
    }
    html += escapeHtml(source[index]);
    index += 1;
  }
  return html;
}

function findStringEnd(source: string, start: number): number {
  let index = start;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === '"') {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}
