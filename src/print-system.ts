import { generateTweedle } from "./tweedle-codegen.js";
import { parseTweedle, type ClassDecl } from "./tweedle-parser.js";

export type PrintableTweedleInput = string | ClassDecl;
export type PrintTheme = "light" | "dark";

export interface PrintRenderOptions {
  title?: string;
  theme?: PrintTheme;
  className?: string;
  includeLineNumbers?: boolean;
}

export interface PrintableDocument {
  title: string;
  text: string;
  html: string;
  standalonePage: string;
}

const DEFAULT_CLASS_NAME = "alice-print-block";
const TWEEDLE_KEYWORDS = new Set([
  "as",
  "case",
  "catch",
  "class",
  "constant",
  "countUpTo",
  "default",
  "doInOrder",
  "doTogether",
  "else",
  "enum",
  "extends",
  "false",
  "forEach",
  "if",
  "in",
  "instanceof",
  "models",
  "new",
  "null",
  "return",
  "static",
  "super",
  "this",
  "true",
  "try",
  "void",
  "while",
  "switch",
]);

const TOKEN_REGEX = /\/\/.*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|\b\d+(?:\.\d+)?\b|\b[A-Za-z_][A-Za-z0-9_]*\b/g;

const INLINE_PRINT_STYLES = `
.alice-print {
  border: 1px solid #d0d7de;
  border-radius: 12px;
  overflow: hidden;
  background: #ffffff;
  color: #1f2328;
}
.alice-print--dark {
  background: #0d1117;
  color: #f0f6fc;
  border-color: #30363d;
}
.alice-print__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(128, 128, 128, 0.25);
  font: 600 0.95rem/1.2 system-ui, sans-serif;
}
.alice-print__title {
  margin: 0;
  font: inherit;
}
.alice-print__meta {
  font: 500 0.8rem/1.2 system-ui, sans-serif;
  opacity: 0.75;
}
.${DEFAULT_CLASS_NAME} {
  margin: 0;
  padding: 1rem;
  overflow: auto;
  font: 500 0.95rem/1.55 "Fira Code", "Cascadia Code", Consolas, monospace;
  white-space: pre-wrap;
}
.alice-print__line {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
}
.alice-print__line-number {
  user-select: none;
  opacity: 0.45;
  text-align: right;
  min-width: 2ch;
}
.alice-print__keyword {
  color: #8250df;
  font-weight: 700;
}
.alice-print__string {
  color: #0a7f42;
}
.alice-print__number {
  color: #0550ae;
}
.alice-print__comment {
  color: #6e7781;
  font-style: italic;
}
.alice-print--dark .alice-print__keyword {
  color: #d2a8ff;
}
.alice-print--dark .alice-print__string {
  color: #7ee787;
}
.alice-print--dark .alice-print__number {
  color: #79c0ff;
}
.alice-print--dark .alice-print__comment {
  color: #8b949e;
}
`;

export function formatPrintableTweedleSource(input: PrintableTweedleInput): string {
  const ast = resolveAst(input);
  return stripTrailingWhitespace(generateTweedle(ast)).trimEnd() + "\n";
}

export function printToText(input: PrintableTweedleInput): string {
  return formatPrintableTweedleSource(input);
}

export function printToHtml(input: PrintableTweedleInput, options: PrintRenderOptions = {}): string {
  const source = formatPrintableTweedleSource(input);
  const ast = resolveAst(input);
  const className = escapeAttributeValue(options.className ?? DEFAULT_CLASS_NAME);
  const title = escapeHtml(resolveTitle(ast, options.title));
  const theme = normalizePrintTheme(options.theme);
  const sectionClassName = escapeAttributeValue(`alice-print alice-print--${theme}`);
  const codeBlock = renderCodeBlock(source, className, options.includeLineNumbers ?? true);

  return `<style>${INLINE_PRINT_STYLES}</style><section class="${sectionClassName}"><header class="alice-print__header"><h1 class="alice-print__title">${title}</h1><span class="alice-print__meta">Tweedle source</span></header>${codeBlock}</section>`;
}

export function exportAsStandalonePage(input: PrintableTweedleInput, options: PrintRenderOptions = {}): string {
  const ast = resolveAst(input);
  const title = resolveTitle(ast, options.title);
  const html = printToHtml(ast, options);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  ${html}
</body>
</html>`;
}

export function createPrintableDocument(input: PrintableTweedleInput, options: PrintRenderOptions = {}): PrintableDocument {
  const ast = resolveAst(input);
  return {
    title: resolveTitle(ast, options.title),
    text: printToText(ast),
    html: printToHtml(ast, options),
    standalonePage: exportAsStandalonePage(ast, options),
  };
}

function resolveAst(input: PrintableTweedleInput): ClassDecl {
  return typeof input === "string" ? parseTweedle(input) : input;
}

function resolveTitle(ast: ClassDecl, title?: string): string {
  return title?.trim() || `${ast.name} — Printable Tweedle`;
}

function normalizePrintTheme(theme: unknown): PrintTheme {
  return theme === "dark" ? "dark" : "light";
}

function renderCodeBlock(source: string, className: string, includeLineNumbers: boolean): string {
  const lines = source.replace(/\n$/, "").split("\n");
  if (!includeLineNumbers) {
    return `<pre class="${className}"><code>${highlightTweedle(source)}</code></pre>`;
  }
  const renderedLines = lines
    .map((line, index) => `<span class="alice-print__line"><span class="alice-print__line-number">${index + 1}</span><span>${highlightTweedle(line) || "&nbsp;"}</span></span>`)
    .join("\n");
  return `<pre class="${className}"><code>${renderedLines}</code></pre>`;
}

function highlightTweedle(source: string): string {
  let html = "";
  let cursor = 0;
  source.replace(TOKEN_REGEX, (match, offset: number) => {
    html += escapeHtml(source.slice(cursor, offset));
    html += wrapToken(match);
    cursor = offset + match.length;
    return match;
  });
  html += escapeHtml(source.slice(cursor));
  return html;
}

function wrapToken(token: string): string {
  const escaped = escapeHtml(token);
  if (token.startsWith("//") || token.startsWith("/*")) {
    return `<span class="alice-print__comment">${escaped}</span>`;
  }
  if (token.startsWith('"')) {
    return `<span class="alice-print__string">${escaped}</span>`;
  }
  if (/^\d/.test(token)) {
    return `<span class="alice-print__number">${escaped}</span>`;
  }
  if (TWEEDLE_KEYWORDS.has(token)) {
    return `<span class="alice-print__keyword">${escaped}</span>`;
  }
  return escaped;
}

function stripTrailingWhitespace(source: string): string {
  return source.replace(/[ \t]+$/gm, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function escapeAttributeValue(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
