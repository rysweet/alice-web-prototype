// ═══════════════════════════════════════════════════════════════════════════
// tweedle-codegen.ts — AST → Tweedle source code generator
//
// Converts a ClassDecl AST back into valid Tweedle source code.
// Pure function, no I/O, no external dependencies.
// ═══════════════════════════════════════════════════════════════════════════

import type {
  ClassDecl,
  ConstructorDecl,
  MethodDecl,
  FieldDecl,
  Statement,
  Expression,
  TypeRef,
  Parameter,
  Argument,
} from "./tweedle-parser.js";

const MAX_DEPTH = 100;

// ── Error Class ──────────────────────────────────────────────────────────

export class TweedleCodegenError extends Error {
  constructor(
    message: string,
    public readonly nodeType: string,
  ) {
    super(message);
    this.name = "TweedleCodegenError";
  }
}

// ── String Escaping ──────────────────────────────────────────────────────

function escapeString(value: string): string {
  let result = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    switch (ch) {
      case "\\": result += "\\\\"; break;
      case '"': result += '\\"'; break;
      case "\n": result += "\\n"; break;
      case "\t": result += "\\t"; break;
      case "\r": result += "\\r"; break;
      default: result += ch;
    }
  }
  return result;
}

// ── TypeRef Generation ───────────────────────────────────────────────────

function genTypeRef(ref: TypeRef): string {
  switch (ref.type) {
    case "VoidTypeRef":
      return "void";
    case "SimpleTypeRef":
      return ref.isArray ? `${ref.name}[]` : ref.name;
    case "LambdaTypeRef":
      return ref.raw;
  }
}

// ── Parameter Generation ─────────────────────────────────────────────────

function genParameter(param: Parameter): string {
  const typeStr = genTypeRef(param.paramType);
  const varargs = param.isVarArgs ? "..." : "";
  let result = `${typeStr}${varargs} ${param.name}`;
  if (param.defaultValue !== null) {
    result += ` <- ${genExpr(param.defaultValue, 0)}`;
  }
  return result;
}

// ── Argument Generation ──────────────────────────────────────────────────

function genArgument(arg: Argument, depth: number): string {
  const value = genExpr(arg.value, depth);
  return arg.name !== null ? `${arg.name}: ${value}` : value;
}

// ── Expression Generation ────────────────────────────────────────────────

function genExpr(expr: Expression, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new TweedleCodegenError(
      "Maximum expression depth exceeded",
      "Expression",
    );
  }

  switch (expr.type) {
    case "Literal": {
      switch (expr.literalType) {
        case "number": return String(expr.value);
        case "string": return `"${escapeString(expr.value as string)}"`;
        case "boolean": return String(expr.value);
        case "null": return "null";
      }
      break;
    }
    case "This":
      return "this";
    case "Super":
      return "super";
    case "Identifier":
      return expr.name;
    case "MemberAccess":
      return `${genExpr(expr.target, depth + 1)}.${expr.memberName}`;
    case "MethodInvocation": {
      const args = expr.arguments
        .map((a) => genArgument(a, depth + 1))
        .join(", ");
      if (expr.target === null) {
        return `${expr.methodName}(${args})`;
      }
      return `${genExpr(expr.target, depth + 1)}.${expr.methodName}(${args})`;
    }
    case "NewInstance": {
      const args = expr.arguments
        .map((a) => genArgument(a, depth + 1))
        .join(", ");
      return `new ${expr.className}(${args})`;
    }
    case "NewArray": {
      const typeStr = genTypeRef(expr.elementType);
      if (expr.size !== null) {
        return `new ${typeStr}[${genExpr(expr.size, depth + 1)}]`;
      }
      const elements = expr.elements
        .map((e) => genExpr(e, depth + 1))
        .join(", ");
      return `new ${typeStr}[] {${elements}}`;
    }
    case "BinaryOp":
      return `${genExpr(expr.left, depth + 1)} ${expr.operator} ${genExpr(expr.right, depth + 1)}`;
    case "UnaryOp":
      return `${expr.operator}${genExpr(expr.operand, depth + 1)}`;
    case "Assignment":
      return `${genExpr(expr.target, depth + 1)} <- ${genExpr(expr.value, depth + 1)}`;
    case "ArrayAccess":
      return `${genExpr(expr.target, depth + 1)}[${genExpr(expr.index, depth + 1)}]`;
    case "TypeCast":
      return `${genExpr(expr.expression, depth + 1)} as ${genTypeRef(expr.targetType)}`;
    case "InstanceOf":
      return `${genExpr(expr.expression, depth + 1)} instanceof ${genTypeRef(expr.testType)}`;
    case "Parenthesized":
      return `(${genExpr(expr.expression, depth + 1)})`;
  }

  throw new TweedleCodegenError(
    `Unknown expression type: ${(expr as { type: string }).type}`,
    (expr as { type: string }).type,
  );
}

// ── Statement Generation ─────────────────────────────────────────────────

function genStmt(stmt: Statement, indent: string, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new TweedleCodegenError(
      "Maximum statement depth exceeded",
      "Statement",
    );
  }

  const inner = indent + "  ";

  switch (stmt.type) {
    case "DoInOrder": {
      const body = stmt.body
        .map((s) => inner + genStmt(s, inner, depth + 1))
        .join("\n");
      return body.length > 0
        ? `doInOrder {\n${body}\n${indent}}`
        : `doInOrder {}`;
    }
    case "DoTogether": {
      const body = stmt.body
        .map((s) => inner + genStmt(s, inner, depth + 1))
        .join("\n");
      return body.length > 0
        ? `doTogether {\n${body}\n${indent}}`
        : `doTogether {}`;
    }
    case "IfElse": {
      const cond = genExpr(stmt.condition, depth + 1);
      const ifBody = stmt.ifBody
        .map((s) => inner + genStmt(s, inner, depth + 1))
        .join("\n");
      let result = ifBody.length > 0
        ? `if (${cond}) {\n${ifBody}\n${indent}}`
        : `if (${cond}) {}`;
      if (stmt.elseBody !== null) {
        const elseBody = stmt.elseBody
          .map((s) => inner + genStmt(s, inner, depth + 1))
          .join("\n");
        result += elseBody.length > 0
          ? ` else {\n${elseBody}\n${indent}}`
          : ` else {}`;
      }
      return result;
    }
    case "ForEach": {
      const itemType = genTypeRef(stmt.itemType);
      const collection = genExpr(stmt.collection, depth + 1);
      const body = stmt.body
        .map((s) => inner + genStmt(s, inner, depth + 1))
        .join("\n");
      return body.length > 0
        ? `forEach (${itemType} ${stmt.itemName} in ${collection}) {\n${body}\n${indent}}`
        : `forEach (${itemType} ${stmt.itemName} in ${collection}) {}`;
    }
    case "CountUpTo": {
      const count = genExpr(stmt.count, depth + 1);
      const body = stmt.body
        .map((s) => inner + genStmt(s, inner, depth + 1))
        .join("\n");
      return body.length > 0
        ? `countUpTo (${count}) {\n${body}\n${indent}}`
        : `countUpTo (${count}) {}`;
    }
    case "Return":
      return stmt.expression !== null
        ? `return ${genExpr(stmt.expression, depth + 1)};`
        : "return;";
    case "ExpressionStatement":
      return `${genExpr(stmt.expression, depth + 1)};`;
    case "LocalVariableDeclaration": {
      const typeStr = genTypeRef(stmt.varType);
      const init = genExpr(stmt.initializer, depth + 1);
      const prefix = stmt.isConstant ? "constant " : "";
      return `${prefix}${typeStr} ${stmt.name} <- ${init};`;
    }
    case "Block": {
      const body = stmt.body
        .map((s) => inner + genStmt(s, inner, depth + 1))
        .join("\n");
      return body.length > 0
        ? `{\n${body}\n${indent}}`
        : `{}`;
    }
    case "DisabledBlock":
      return `*<${stmt.raw}>*`;
  }

  throw new TweedleCodegenError(
    `Unknown statement type: ${(stmt as { type: string }).type}`,
    (stmt as { type: string }).type,
  );
}

// ── Field Generation ─────────────────────────────────────────────────────

function genField(field: FieldDecl, indent: string): string {
  const parts: string[] = [];
  if (field.isStatic) parts.push("static");
  if (field.isConstant) parts.push("constant");
  parts.push(genTypeRef(field.fieldType));
  parts.push(field.name);
  if (field.initializer !== null) {
    parts.push("<-");
    parts.push(genExpr(field.initializer, 0));
  }
  return `${indent}${parts.join(" ")};`;
}

// ── Constructor Generation ───────────────────────────────────────────────

function genConstructor(ctor: ConstructorDecl, indent: string): string {
  const inner = indent + "  ";
  const params = ctor.parameters.map(genParameter).join(", ");
  const body = ctor.body
    .map((s) => inner + genStmt(s, inner, 0))
    .join("\n");
  return body.length > 0
    ? `${indent}${ctor.name}(${params}) {\n${body}\n${indent}}`
    : `${indent}${ctor.name}(${params}) {}`;
}

// ── Method Generation ────────────────────────────────────────────────────

function genMethod(method: MethodDecl, indent: string): string {
  const inner = indent + "  ";
  const parts: string[] = [];
  if (method.isStatic) parts.push("static");
  parts.push(genTypeRef(method.returnType));
  parts.push(`${method.name}(${method.parameters.map(genParameter).join(", ")})`);
  const signature = parts.join(" ");
  const body = method.body
    .map((s) => inner + genStmt(s, inner, 0))
    .join("\n");
  return body.length > 0
    ? `${indent}${signature} {\n${body}\n${indent}}`
    : `${indent}${signature} {}`;
}

// ── Public API ───────────────────────────────────────────────────────────

export function generateTweedle(ast: ClassDecl): string {
  if (ast == null) {
    throw new TweedleCodegenError(
      "Cannot generate code from null or undefined AST",
      "null",
    );
  }

  const indent = "  ";
  const members: string[] = [];

  // Fields first
  for (const field of ast.fields) {
    members.push(genField(field, indent));
  }

  // Constructors
  for (const ctor of ast.constructors) {
    members.push(genConstructor(ctor, indent));
  }

  // Methods
  for (const method of ast.methods) {
    members.push(genMethod(method, indent));
  }

  // Class header
  let header = `class ${ast.name}`;
  if (ast.superClass !== null) {
    header += ` extends ${ast.superClass}`;
  }
  if (ast.modelType !== null) {
    header += ` models ${ast.modelType}`;
  }

  const body = members.join("\n\n");
  return body.length > 0
    ? `${header} {\n${body}\n}\n`
    : `${header} {}\n`;
}

export function generateStatement(stmt: Statement): string {
  return genStmt(stmt, "", 0);
}

export function generateExpression(expr: Expression): string {
  return genExpr(expr, 0);
}
