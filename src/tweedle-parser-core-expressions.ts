import { KEYWORDS, TT } from "./tweedle-lexer.js";
const MAX_PARSE_DEPTH = 100;
import type { Parser } from "./tweedle-parser-core-base.js";
import type { Argument, Expression, TypeRef } from "./tweedle-parser-declarations.js";

const BP_ASSIGN = { left: 2, right: 1 };
const BP_OR     = { left: 4, right: 5 };
const BP_AND    = { left: 6, right: 7 };
const BP_EQ     = { left: 8, right: 9 };
const BP_CMP    = { left: 10, right: 11 };
const BP_CONCAT = { left: 12, right: 13 };
const BP_ADD    = { left: 14, right: 15 };
const BP_MUL    = { left: 16, right: 17 };

function binaryBp(type: TT): { left: number; right: number } | null {
  switch (type) {
    case TT.ASSIGN:  return BP_ASSIGN;
    case TT.OR_OR:   return BP_OR;
    case TT.AND_AND: return BP_AND;
    case TT.EQ_EQ: case TT.NOT_EQ: return BP_EQ;
    case TT.LT: case TT.GT: case TT.LT_EQ: case TT.GT_EQ: return BP_CMP;
    case TT.DOT_DOT: return BP_CONCAT;
    case TT.PLUS: case TT.MINUS: return BP_ADD;
    case TT.STAR: case TT.SLASH: case TT.PERCENT: return BP_MUL;
    default: return null;
  }
}

// Pre-built reverse map — O(1) lookup instead of iterating KEYWORDS
const TOKEN_NAMES = new Map<TT, string>();
for (const [k, v] of KEYWORDS) TOKEN_NAMES.set(v, `'${k}'`);
TOKEN_NAMES.set(TT.IDENTIFIER, "identifier");
TOKEN_NAMES.set(TT.LPAREN, "'('");
TOKEN_NAMES.set(TT.RPAREN, "')'");
TOKEN_NAMES.set(TT.LBRACE, "'{'");
TOKEN_NAMES.set(TT.RBRACE, "'}'");
TOKEN_NAMES.set(TT.SEMI, "';'");
TOKEN_NAMES.set(TT.ASSIGN, "'<-'");

function tokenName(type: TT): string {
  return TOKEN_NAMES.get(type) ?? String(type);
}

function joinTokenText(parts: string[]): string {
  return parts
    .join(" ")
    .replace(/\s+([)\]};,.])/g, "$1")
    .replace(/([(\[{])\s+/g, "$1")
    .replace(/\s+(->)/g, " $1")
    .replace(/(<-)\s+/g, "$1 ")
    .replace(/\s+(<)/g, " $1")
    .trim();
}

export function parseExpression(parser: Parser, minBp = 0): Expression {
  let left = parser.parsePrefix();

  for (;;) {
    const tok = parser.peek();

    if (tok.type === TT.ARROW) {
      break;
    }

    // Postfix / high-precedence operators (bp = 20)
    if (tok.type === TT.DOT && 20 >= minBp) {
      parser.advance();
      const memberName = parser.expect(TT.IDENTIFIER, "member name").text;
      left = { type: "MemberAccess", target: left, memberName };
      continue;
    }

    if (tok.type === TT.LPAREN && 20 >= minBp) {
      const args = parser.parseArgumentList();
      left = parser.toMethodInvocation(left, args);
      continue;
    }

    if (tok.type === TT.LBRACKET && 20 >= minBp) {
      parser.advance();
      const index = parser.parseExpression();
      parser.expect(TT.RBRACKET, "']'");
      left = { type: "ArrayAccess", target: left, index };
      continue;
    }

    if (tok.type === TT.AS && 20 >= minBp) {
      parser.advance();
      const targetType = parser.parseTypeRef();
      left = { type: "TypeCast", expression: left, targetType };
      continue;
    }

    // instanceof (bp = 10)
    if (tok.type === TT.INSTANCEOF && 10 >= minBp) {
      parser.advance();
      const testType = parser.parseTypeRef();
      left = { type: "InstanceOf", expression: left, testType };
      continue;
    }

    // Binary operators
    const bp = binaryBp(tok.type);
    if (bp === null || bp.left < minBp) break;

    // Assignment (right-associative)
    if (tok.type === TT.ASSIGN) {
      parser.advance();
      const value = parser.parseExpression(bp.right);
      left = { type: "Assignment", target: left, value };
      continue;
    }

    // Standard binary operator
    parser.advance();
    const right = parser.parseExpression(bp.right);
    left = { type: "BinaryOp", operator: tok.text, left, right };
  }

  return left;
}

export function parsePrefix(parser: Parser): Expression {
  const tok = parser.peek();

  // Unary operators
  if (tok.type === TT.NOT || tok.type === TT.MINUS) {
    parser.advance();
    const operand = parser.parseExpression(18);
    return { type: "UnaryOp", operator: tok.text, operand };
  }

  // Parenthesized expression or lambda detection
  if (tok.type === TT.LPAREN) {
    if (parser.isLambdaExpression()) {
      return parser.parseLambdaExpression();
    }
    parser.advance();
    parser.depth++;
    if (parser.depth > MAX_PARSE_DEPTH) {
      parser.fail("Maximum parse depth exceeded", parser.peek());
    }
    const expr = parser.parseExpression();
    parser.depth--;
    parser.expect(TT.RPAREN, "')'");
    return { type: "Parenthesized", expression: expr };
  }

  // Number literal
  if (tok.type === TT.NUMBER) {
    parser.advance();
    return { type: "Literal", value: parseFloat(tok.text), literalType: "number" };
  }

  // String literal
  if (tok.type === TT.STRING) {
    parser.advance();
    return { type: "Literal", value: tok.text, literalType: "string" };
  }

  // Boolean literals
  if (tok.type === TT.TRUE || tok.type === TT.FALSE) {
    parser.advance();
    return { type: "Literal", value: tok.type === TT.TRUE, literalType: "boolean" };
  }

  // null literal
  if (tok.type === TT.NULL_LIT) {
    parser.advance();
    return { type: "Literal", value: null, literalType: "null" };
  }

  // parser
  if (tok.type === TT.THIS) {
    parser.advance();
    return { type: "This" };
  }

  // super
  if (tok.type === TT.SUPER) {
    parser.advance();
    return { type: "Super" };
  }

  // new
  if (tok.type === TT.NEW) {
    return parser.parseNewExpression();
  }

  // identifier
  if (tok.type === TT.IDENTIFIER) {
    parser.advance();
    return { type: "Identifier", name: tok.text };
  }

  // array literal: {expr, expr, ...}
  if (tok.type === TT.LBRACE) {
    parser.advance();
    const elements: Expression[] = [];
    if (!parser.check(TT.RBRACE)) {
      elements.push(parser.parseExpression());
      while (parser.match(TT.COMMA)) {
        elements.push(parser.parseExpression());
      }
    }
    parser.expect(TT.RBRACE, "'}'");
    return { type: "ArrayLiteral", elements };
  }

  parser.fail(`Unexpected token '${tok.text || "end of input"}'`, tok);
}

export function isLambdaExpression(parser: Parser): boolean {
  // Look for pattern: ( ... ) ->
  let i = 1;
  let depth = 1;
  while (depth > 0) {
    const t = parser.peekAt(i);
    if (t.type === TT.EOF) return false;
    if (t.type === TT.LPAREN) depth++;
    if (t.type === TT.RPAREN) depth--;
    i++;
  }
  return parser.peekAt(i).type === TT.ARROW;
}

export function parseLambdaExpression(parser: Parser): Expression {
  const raw = parser.captureLambdaRaw();
  return { type: "LambdaExpression", raw };
}

export function captureLambdaRaw(parser: Parser): string {
  const parts: string[] = [];
  let depth = 0;
  while (!parser.check(TT.EOF)) {
    const tok = parser.advance();
    parts.push(tok.text);
    if (tok.type === TT.LPAREN || tok.type === TT.LBRACE || tok.type === TT.LBRACKET) depth++;
    if (tok.type === TT.RPAREN || tok.type === TT.RBRACE || tok.type === TT.RBRACKET) depth--;
    if (tok.type === TT.ARROW) {
      continue;
    }
    if (depth === 0 && (tok.type === TT.RBRACE || tok.type === TT.RPAREN)) {
      if (parser.peek().type !== TT.ARROW) {
        break;
      }
    }
    if (depth === 0 && (tok.type === TT.SEMI || tok.type === TT.COMMA)) {
      parser.pos--;
      parts.pop();
      break;
    }
  }
  return joinTokenText(parts);
}

export function parseConstructorInvocationArguments(parser: Parser, keyword: TT.THIS | TT.SUPER): Argument[] {
  parser.expect(keyword);
  return parser.parseArgumentList();
}

export function lookaheadTypeRefEnd(parser: Parser, start: number): number | null {
  let index = start;
  if (parser.tokens[index]?.type !== TT.IDENTIFIER) {
    return null;
  }
  index += 1;
  if (parser.tokens[index]?.type === TT.LT) {
    let depth = 1;
    index += 1;
    while (depth > 0) {
      const tok = parser.tokens[index];
      if (!tok) return null;
      if (tok.type === TT.ARROW) return null;
      if (tok.type === TT.LT) depth++;
      if (tok.type === TT.GT) depth--;
      index += 1;
    }
  }
  while (parser.tokens[index]?.type === TT.LBRACKET && parser.tokens[index + 1]?.type === TT.RBRACKET) {
    index += 2;
  }
  return index;
}

export function parseNewExpression(parser: Parser): Expression {
  parser.advance();
  const className = parser.expect(TT.IDENTIFIER, "class name").text;
  const elementType: TypeRef = { type: "SimpleTypeRef", name: className, isArray: false, arrayDimensions: 0 };

  if (parser.check(TT.LBRACKET)) {
    parser.advance();
    let size: Expression | null = null;
    if (!parser.check(TT.RBRACKET)) {
      size = parser.parseExpression();
    }
    parser.expect(TT.RBRACKET, "']'");
    if (parser.check(TT.LBRACE)) {
      parser.advance();
      const elements: Expression[] = [];
      while (!parser.check(TT.RBRACE) && !parser.check(TT.EOF)) {
        elements.push(parser.parseExpression());
        if (!parser.check(TT.RBRACE)) parser.expect(TT.COMMA, "','");
      }
      parser.expect(TT.RBRACE, "'}'");
      return { type: "NewArray", elementType, elements, size };
    }
    return { type: "NewArray", elementType, elements: [], size };
  }

  // new Type(args)
  const args = parser.parseArgumentList();
  return { type: "NewInstance", className, arguments: args };
}

export function parseArgumentList(parser: Parser): Argument[] {
  parser.expect(TT.LPAREN, "'('");
  const args: Argument[] = [];
  while (!parser.check(TT.RPAREN) && !parser.check(TT.EOF)) {
    if (args.length > 0) parser.expect(TT.COMMA, "','");
    args.push(parser.parseArgument());
  }
  parser.expect(TT.RPAREN, "')'");
  return args;
}

export function parseArgument(parser: Parser): Argument {
  // Named argument: identifier: expression
  if (parser.check(TT.IDENTIFIER) && parser.peekAt(1).type === TT.COLON) {
    const name = parser.advance().text;
    parser.advance();
    const value = parser.parseExpression();
    return { name, value };
  }
  // Positional argument
  const value = parser.parseExpression();
  return { name: null, value };
}

export function toMethodInvocation(parser: Parser, left: Expression, args: Argument[]): Expression {
  if (left.type === "MemberAccess") {
    return {
      type: "MethodInvocation",
      target: left.target,
      methodName: left.memberName,
      arguments: args,
    };
  }
  if (left.type === "Identifier") {
    return {
      type: "MethodInvocation",
      target: null,
      methodName: left.name,
      arguments: args,
    };
  }
  if (left.type === "Super") {
    return {
      type: "MethodInvocation",
      target: left,
      methodName: "super",
      arguments: args,
    };
  }
  parser.fail(`Cannot invoke '${left.type}' as a method`);
}
