import type { TypeRef } from "../ast-nodes.js";
import type { JavaCodeGenerationOptions } from "./types.js";
import { JavaCodeGenerationError } from "./types.js";

type AstRecord = Record<string, unknown>;

const DEFAULT_INDENT = "  ";
const JAVA_KEYWORDS = new Set([
  "abstract",
  "boolean",
  "break",
  "case",
  "catch",
  "class",
  "default",
  "double",
  "else",
  "extends",
  "false",
  "final",
  "for",
  "if",
  "int",
  "new",
  "null",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "void",
  "while",
]);

const TYPE_NAME_MAP: Record<string, string> = {
  WholeNumber: "int",
  Integer: "int",
  DecimalNumber: "double",
  Double: "double",
  Boolean: "boolean",
};
export function generateJavaSource(node: unknown, options: JavaCodeGenerationOptions = {}): string {
  const indent = options.indent ?? DEFAULT_INDENT;
  const rendered = renderNode(node, { indent }, 0);
  return rendered.trimEnd();
}
function renderNode(node: unknown, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  if (Array.isArray(node)) {
    return node.map((entry) => renderNode(entry, options, depth)).join("\n");
  }
  if (!isRecord(node)) {
    throw new JavaCodeGenerationError("Unsupported node", typeof node);
  }

  switch (readType(node)) {
    case "ClassDeclaration":
      return renderClass(node, options, depth);
    case "FieldDeclaration":
      return renderField(node, options, depth);
    case "ConstructorDeclaration":
      return renderConstructor(node, options, depth);
    case "MethodDeclaration":
      return renderMethod(node, options, depth);
    case "ExpressionStatement":
      return `${indent(depth, options)}${renderExpression(readRecord(node, "expression"), options)};`;
    case "Return":
      return renderReturn(node, options, depth);
    case "LocalVariableDeclaration":
    case "LocalDeclarationStatement":
      return renderLocalDeclaration(node, options, depth);
    case "IfElse":
      return renderIfElse(node, options, depth);
    case "SwitchCase":
      return renderSwitch(node, options, depth);
    case "WhileLoop":
      return renderBlockHeader(`while (${renderExpression(readRecord(node, "condition"), options)})`, readArray(node, "body"), options, depth);
    case "ForEach":
      return renderBlockHeader(
        `for (${renderTypeRef(readTypeRef(node, "itemType"))} ${readString(node, "itemName")} : ${renderExpression(readRecord(node, "collection"), options)})`,
        readArray(node, "body"),
        options,
        depth,
      );
    case "CountUpTo":
      return renderBlockHeader(
        `for (int index = 0; index < ${renderExpression(readRecord(node, "count"), options)}; index++)`,
        readArray(node, "body"),
        options,
        depth,
      );
    case "TryCatch": {
      const head = renderBlockHeader("try", readArray(node, "tryBody"), options, depth);
      const catchType = renderTypeRef(readTypeRef(node, "catchType"));
      const catchVariable = readString(node, "catchVariable");
      return `${head} catch (${catchType} ${catchVariable}) ${renderInlineBlock(readArray(node, "catchBody"), options, depth)}`;
    }
    case "Block":
    case "ConstructorBlockStatement":
      return `${indent(depth, options)}${renderInlineBlock(readArray(node, "body"), options, depth)}`;
    case "ThisConstructorInvocationStatement":
      return `${indent(depth, options)}this(${renderArguments(readArguments(node), options)});`;
    case "SuperConstructorInvocationStatement":
      return `${indent(depth, options)}super(${renderArguments(readArguments(node), options)});`;
    case "DoInOrder":
      return renderCommentedBlock("doInOrder", readArray(node, "body"), options, depth);
    case "DoTogether":
      return renderCommentedBlock("doTogether", readArray(node, "body"), options, depth);
    case "DisabledBlock":
      return `${indent(depth, options)}/* disabled: ${escapeBlockComment(readString(node, "raw"))} */`;
    case "Comment":
      return renderComment(readString(node, "text"), options, depth);
    default:
      return `${indent(depth, options)}${renderExpression(node, options)};`;
  }
}

function renderClass(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const headerParts = [renderVisibility(node), renderTypeModifiers(node), "class", readString(node, "name")]
    .filter(Boolean);
  const typeParameters = renderTypeParameters(node.typeParameters);
  if (typeParameters) {
    headerParts[headerParts.length - 1] += typeParameters;
  }
  const superClass = readNullableString(node, "superClass");
  if (superClass && superClass !== "Object") {
    headerParts.push("extends", mapTypeName(superClass));
  }
  const members = [
    ...readArray(node, "fields").map((field) => renderField(asRecord(field), options, depth + 1)),
    ...readArray(node, "constructors").map((ctor) => renderConstructor(asRecord(ctor), options, depth + 1)),
    ...readArray(node, "methods").map((method) => renderMethod(asRecord(method), options, depth + 1)),
  ].filter((member) => member.length > 0);

  if (members.length === 0) {
    return `${indent(depth, options)}${headerParts.join(" ")} {\n${indent(depth, options)}}`;
  }

  return `${indent(depth, options)}${headerParts.join(" ")} {\n${members.join("\n\n")}\n${indent(depth, options)}}`;
}

function renderField(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const parts = [renderVisibility(node), readBoolean(node, "isStatic") ? "static" : "", readBoolean(node, "isConstant") ? "final" : "", renderTypeRef(readTypeRef(node, "fieldType")), readString(node, "name")]
    .filter(Boolean);
  const initializer = node.initializer ? ` = ${renderExpression(asRecord(node.initializer), options)}` : "";
  return `${indent(depth, options)}${parts.join(" ")}${initializer};`;
}

function renderConstructor(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const parts = [renderVisibility(node), readString(node, "name")].filter(Boolean);
  return `${indent(depth, options)}${parts.join(" ")}(${renderParameters(readArray(node, "parameters"), options)}) ${renderInlineBlock(readArray(node, "body"), options, depth)}`;
}

function renderMethod(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const parts = [
    renderVisibility(node),
    readBoolean(node, "isStatic") ? "static" : "",
    renderMethodModifiers(node),
    renderTypeRef(readTypeRef(node, "returnType")),
    `${readString(node, "name")}${renderTypeParameters(node.typeParameters)}(${renderParameters(readArray(node, "parameters"), options)})`,
  ].filter(Boolean);
  return `${indent(depth, options)}${parts.join(" ")} ${renderInlineBlock(readArray(node, "body"), options, depth)}`;
}

function renderReturn(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const expression = node.expression ? ` ${renderExpression(asRecord(node.expression), options)}` : "";
  return `${indent(depth, options)}return${expression};`;
}

function renderLocalDeclaration(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const isConstant = readBoolean(node, "isConstant") || (node.local && readBoolean(asRecord(node.local), "isFinal"));
  const name = hasString(node, "name") ? readString(node, "name") : readString(asRecord(node.local), "name");
  const varType = hasRecord(node, "varType") ? readTypeRef(node, "varType") : readTypeRef(asRecord(node.local), "valueType");
  const initializer = hasRecord(node, "initializer") ? asRecord(node.initializer) : readRecord(node, "initializer");
  const prefix = isConstant ? "final " : "";
  return `${indent(depth, options)}${prefix}${renderTypeRef(varType)} ${name} = ${renderExpression(initializer, options)};`;
}

function renderIfElse(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const head = renderBlockHeader(`if (${renderExpression(readRecord(node, "condition"), options)})`, readArray(node, "ifBody"), options, depth);
  const elseBody = readNullableArray(node, "elseBody");
  if (!elseBody) {
    return head;
  }
  return `${head} else ${renderInlineBlock(elseBody, options, depth)}`;
}

function renderSwitch(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const lines = [`${indent(depth, options)}switch (${renderExpression(readRecord(node, "expression"), options)}) {`];
  for (const entry of readArray(node, "cases")) {
    const switchCase = asRecord(entry);
    lines.push(`${indent(depth + 1, options)}case ${renderExpression(readRecord(switchCase, "value"), options)}:`);
    lines.push(...renderStatementLines(readArray(switchCase, "body"), options, depth + 2));
    lines.push(`${indent(depth + 2, options)}break;`);
  }
  const defaultCase = readNullableArray(node, "defaultCase");
  if (defaultCase) {
    lines.push(`${indent(depth + 1, options)}default:`);
    lines.push(...renderStatementLines(defaultCase, options, depth + 2));
  }
  lines.push(`${indent(depth, options)}}`);
  return lines.join("\n");
}

function renderCommentedBlock(label: string, body: unknown[], options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  return `${indent(depth, options)}// ${label}\n${indent(depth, options)}${renderInlineBlock(body, options, depth)}`;
}

function renderBlockHeader(header: string, body: unknown[], options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  return `${indent(depth, options)}${header} ${renderInlineBlock(body, options, depth)}`;
}

function renderInlineBlock(body: unknown[], options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  const lines = renderStatementLines(body, options, depth + 1);
  if (lines.length === 0) {
    return "{}";
  }
  return `{\n${lines.join("\n")}\n${indent(depth, options)}}`;
}

function renderStatementLines(body: unknown[], options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string[] {
  return body.map((statement) => renderNode(statement, options, depth));
}

function renderParameters(parameters: unknown[], options: Required<Pick<JavaCodeGenerationOptions, "indent">>): string {
  return parameters.map((parameter) => renderParameter(asRecord(parameter), options)).join(", ");
}

function renderParameter(parameter: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>): string {
  const varArgs = readBoolean(parameter, "isVarArgs") ? "..." : "";
  const defaultValue = parameter.defaultValue ? ` /* default ${renderExpression(asRecord(parameter.defaultValue), options)} */` : "";
  return `${renderTypeRef(readTypeRef(parameter, "paramType"))}${varArgs} ${readString(parameter, "name")}${defaultValue}`;
}

function renderArguments(argumentsList: AstRecord[], options: Required<Pick<JavaCodeGenerationOptions, "indent">>): string {
  return argumentsList.map((argument) => {
    const value = renderExpression(readRecord(argument, "value"), options);
    const name = readNullableString(argument, "name");
    return name ? `/* ${name} */ ${value}` : value;
  }).join(", ");
}

function renderExpression(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>): string {
  switch (readType(node)) {
    case "Literal":
      return renderLiteral(node);
    case "This":
      return "this";
    case "Super":
      return "super";
    case "Identifier":
      return readString(node, "name");
    case "MemberAccess":
      return `${renderExpression(readRecord(node, "target"), options)}.${readString(node, "memberName")}`;
    case "MethodInvocation": {
      const target = node.target ? `${renderExpression(asRecord(node.target), options)}.` : "";
      return `${target}${readString(node, "methodName")}(${renderArguments(readArguments(node), options)})`;
    }
    case "NewInstance":
    case "InstanceCreation":
      return `new ${mapTypeName(readString(node, "className"))}(${renderArguments(readArguments(node), options)})`;
    case "NewArray":
      return renderNewArray(node, options);
    case "ArrayLiteral":
      return `{ ${readArray(node, "elements").map((element) => renderExpression(asRecord(element), options)).join(", ")} }`;
    case "BinaryOp":
      return `${renderExpression(readRecord(node, "left"), options)} ${readString(node, "operator")} ${renderExpression(readRecord(node, "right"), options)}`;
    case "UnaryOp":
      return `${readString(node, "operator")}${renderExpression(readRecord(node, "operand"), options)}`;
    case "Assignment":
      return `${renderExpression(readRecord(node, "target"), options)} = ${renderExpression(readRecord(node, "value"), options)}`;
    case "ArrayAccess":
      return `${renderExpression(readRecord(node, "target"), options)}[${renderExpression(readRecord(node, "index"), options)}]`;
    case "TypeCast":
      return `((${renderTypeRef(readTypeRef(node, "targetType"))}) ${renderExpression(readRecord(node, "expression"), options)})`;
    case "InstanceOf":
      return `${renderExpression(readRecord(node, "expression"), options)} instanceof ${renderTypeRef(readTypeRef(node, "testType"))}`;
    case "Parenthesized":
      return `(${renderExpression(readRecord(node, "expression"), options)})`;
    case "LambdaExpression":
      return readString(node, "raw");
    case "TypeLiteral":
      return `${renderTypeRef(readTypeRef(node, "valueType"))}.class`;
    default:
      throw new JavaCodeGenerationError("Unsupported expression", readType(node));
  }
}

function renderLiteral(node: AstRecord): string {
  switch (readString(node, "literalType")) {
    case "string":
      return JSON.stringify(String(node.value ?? ""));
    case "boolean":
      return String(Boolean(node.value));
    case "null":
      return "null";
    case "number":
      return String(node.value);
    default:
      throw new JavaCodeGenerationError("Unsupported literal", readType(node));
  }
}

function renderNewArray(node: AstRecord, options: Required<Pick<JavaCodeGenerationOptions, "indent">>): string {
  const elementType = renderTypeRef(readTypeRef(node, "elementType"));
  const elements = readArray(node, "elements");
  if (node.size && elements.length === 0) {
    return `new ${elementType}[${renderExpression(asRecord(node.size), options)}]`;
  }
  return `new ${elementType}[] { ${elements.map((element) => renderExpression(asRecord(element), options)).join(", ")} }`;
}

function renderTypeRef(typeRef: TypeRef): string {
  switch (typeRef.type) {
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return typeRef.raw;
    case "SimpleTypeRef": {
      const extendedTypeRef = typeRef as TypeRef & {
        typeArguments?: TypeRef[];
        arrayDimensions?: number;
      };
      const typeArguments = extendedTypeRef.typeArguments && extendedTypeRef.typeArguments.length > 0
        ? `<${extendedTypeRef.typeArguments.map(renderTypeRef).join(", ")}>`
        : "";
      const dimensions = extendedTypeRef.arrayDimensions ?? (typeRef.isArray ? 1 : 0);
      return `${mapTypeName(typeRef.name)}${typeArguments}${"[]".repeat(dimensions)}`;
    }
  }
}

function renderVisibility(node: AstRecord): string {
  const rawVisibility = readNullableString(node, "visibility") ?? readNullableString(node, "accessLevel");
  if (!rawVisibility) {
    return "";
  }
  const normalized = rawVisibility.replace(/^@/, "").toLowerCase();
  return normalized === "package" ? "" : normalized;
}

function renderTypeModifiers(node: AstRecord): string {
  const modifier = readNullableString(node, "finalAbstractOrNeither")?.toLowerCase();
  if (modifier === "final" || modifier === "abstract") {
    return modifier;
  }
  return "";
}

function renderMethodModifiers(node: AstRecord): string {
  const modifiers: string[] = [];
  if (readBoolean(node, "isAbstract")) {
    modifiers.push("abstract");
  }
  if (readBoolean(node, "isFinal")) {
    modifiers.push("final");
  }
  return modifiers.join(" ");
}

function renderTypeParameters(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return "";
  }
  return `<${value.map((entry) => String(entry)).join(", ")}>`;
}

function renderComment(text: string, options: Required<Pick<JavaCodeGenerationOptions, "indent">>, depth: number): string {
  if (text.includes("\n")) {
    return `${indent(depth, options)}/* ${escapeBlockComment(text)} */`;
  }
  return `${indent(depth, options)}// ${text}`;
}

function escapeBlockComment(value: string): string {
  return value.replace(/\*\//g, "* /");
}

function mapTypeName(name: string): string {
  return TYPE_NAME_MAP[name] ?? name;
}

function indent(depth: number, options: Required<Pick<JavaCodeGenerationOptions, "indent">>): string {
  return options.indent.repeat(depth);
}

function readType(node: AstRecord): string {
  if (typeof node.type === "string") {
    return node.type;
  }
  throw new JavaCodeGenerationError("Missing type discriminator", "unknown");
}

function readTypeRef(node: AstRecord, key: string): TypeRef {
  const value = node[key];
  if (isRecord(value) && typeof value.type === "string") {
    return value as TypeRef;
  }
  throw new JavaCodeGenerationError(`Missing type reference '${key}'`, readType(node));
}

function readString(node: AstRecord, key: string): string {
  const value = node[key];
  if (typeof value === "string") {
    return value;
  }
  throw new JavaCodeGenerationError(`Missing string '${key}'`, readType(node));
}

function readNullableString(node: AstRecord, key: string): string | null {
  const value = node[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(node: AstRecord, key: string): boolean {
  return node[key] === true;
}

function readArray(node: AstRecord, key: string): unknown[] {
  const value = node[key];
  return Array.isArray(value) ? value : [];
}

function readNullableArray(node: AstRecord, key: string): unknown[] | null {
  const value = node[key];
  return Array.isArray(value) ? value : null;
}

function readRecord(node: AstRecord, key: string): AstRecord {
  return asRecord(node[key]);
}

function readArguments(node: AstRecord): AstRecord[] {
  if (Array.isArray(node.arguments)) {
    return node.arguments.map(asRecord);
  }
  const ordered = ["requiredArguments", "variableArguments", "keyedArguments"]
    .flatMap((key) => readArray(node, key));
  return ordered.map(asRecord);
}

function hasRecord(node: AstRecord, key: string): boolean {
  return isRecord(node[key]);
}

function hasString(node: AstRecord, key: string): boolean {
  return typeof node[key] === "string";
}

function asRecord(value: unknown): AstRecord {
  if (isRecord(value)) {
    return value;
  }
  throw new JavaCodeGenerationError("Expected object node", typeof value);
}

function isRecord(value: unknown): value is AstRecord {
  return value !== null && typeof value === "object";
}

function isIdentifierStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentifierPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}
