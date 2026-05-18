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

const ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\t": "\\t",
  "\r": "\\r",
};

function escapeString(value: string): string {
  return value.replace(/[\\"\n\t\r]/g, (ch) => ESCAPE_MAP[ch]);
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
    case "ArrayLiteral": {
      const elems = expr.elements
        .map((e) => genExpr(e, depth + 1))
        .join(", ");
      return `{${elems}}`;
    }
  }

  throw new TweedleCodegenError(
    `Unknown expression type: ${(expr as { type: string }).type}`,
    (expr as { type: string }).type,
  );
}

// ── Body Block Generation ────────────────────────────────────────────────

function genBody(
  stmts: Statement[],
  prefix: string,
  indent: string,
  innerDepth: number,
): string {
  const inner = indent + "  ";
  const lines = stmts
    .map((s) => inner + genStmt(s, inner, innerDepth))
    .join("\n");
  const header = prefix.length > 0 ? `${prefix} ` : "";
  return lines.length > 0
    ? `${header}{\n${lines}\n${indent}}`
    : `${header}{}`;
}

// ── Statement Generation ─────────────────────────────────────────────────

function genStmt(stmt: Statement, indent: string, depth: number): string {
  if (depth > MAX_DEPTH) {
    throw new TweedleCodegenError(
      "Maximum statement depth exceeded",
      "Statement",
    );
  }

  switch (stmt.type) {
    case "DoInOrder":
      return genBody(stmt.body, "doInOrder", indent, depth + 1);
    case "DoTogether":
      return genBody(stmt.body, "doTogether", indent, depth + 1);
    case "IfElse": {
      const cond = genExpr(stmt.condition, depth + 1);
      let result = genBody(stmt.ifBody, `if (${cond})`, indent, depth + 1);
      if (stmt.elseBody !== null) {
        result += " " + genBody(stmt.elseBody, "else", indent, depth + 1);
      }
      return result;
    }
    case "ForEach": {
      const itemType = genTypeRef(stmt.itemType);
      const collection = genExpr(stmt.collection, depth + 1);
      return genBody(
        stmt.body,
        `forEach (${itemType} ${stmt.itemName} in ${collection})`,
        indent,
        depth + 1,
      );
    }
    case "CountUpTo": {
      const count = genExpr(stmt.count, depth + 1);
      return genBody(stmt.body, `countUpTo (${count})`, indent, depth + 1);
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
    case "Block":
      return genBody(stmt.body, "", indent, depth + 1);
    case "DisabledBlock":
      return `*<${stmt.raw}>*`;
    case "WhileLoop": {
      const cond = genExpr(stmt.condition, depth + 1);
      return genBody(stmt.body, `while (${cond})`, indent, depth + 1);
    }
    case "TryCatch": {
      let result = genBody(stmt.tryBody, "try", indent, depth + 1);
      const catchType = genTypeRef(stmt.catchType);
      result += " " + genBody(stmt.catchBody, `catch (${catchType} ${stmt.catchVariable})`, indent, depth + 1);
      return result;
    }
    case "SwitchCase": {
      const swExpr = genExpr(stmt.expression, depth + 1);
      const swInner = indent + "  ";
      const entries: string[] = [];
      for (const c of stmt.cases) {
        const val = genExpr(c.value, depth + 1);
        entries.push(swInner + genBody(c.body, `case ${val}:`, swInner, depth + 1));
      }
      if (stmt.defaultCase !== null) {
        entries.push(swInner + genBody(stmt.defaultCase, "default:", swInner, depth + 1));
      }
      const swBody = entries.join("\n");
      return swBody.length > 0
        ? `switch (${swExpr}) {\n${swBody}\n${indent}}`
        : `switch (${swExpr}) {}`;
    }
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
  const params = ctor.parameters.map(genParameter).join(", ");
  return indent + genBody(ctor.body, `${ctor.name}(${params})`, indent, 0);
}

// ── Method Generation ────────────────────────────────────────────────────

function genMethod(method: MethodDecl, indent: string): string {
  const parts: string[] = [];
  if (method.isStatic) parts.push("static");
  parts.push(genTypeRef(method.returnType));
  parts.push(`${method.name}(${method.parameters.map(genParameter).join(", ")})`);
  return indent + genBody(method.body, parts.join(" "), indent, 0);
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
