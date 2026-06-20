import { TT } from "./tweedle-lexer.js";
const MAX_PARSE_DEPTH = 100;
import type { Parser } from "./tweedle-parser-core-base.js";
import type { Expression, Statement, TypeRef } from "./tweedle-parser-declarations.js";

export function parseBlock(parser: Parser): Statement[] {
  parser.depth++;
  if (parser.depth > MAX_PARSE_DEPTH) {
    parser.fail("Maximum nesting depth exceeded");
  }
  parser.expect(TT.LBRACE, "'{'");
  const stmts: Statement[] = [];
  while (!parser.check(TT.RBRACE) && !parser.check(TT.EOF)) {
    stmts.push(parser.parseStatement());
  }
  parser.expect(TT.RBRACE, "'}'");
  parser.depth--;
  return stmts;
}

type StatementParser = {
  matches: (parser: Parser) => boolean;
  parse: (parser: Parser) => Statement;
};

const ORDERED_STATEMENT_PARSERS: StatementParser[] = [
  { matches: (parser) => parser.check(TT.DO_IN_ORDER), parse: parseDoInOrderStatement },
  { matches: (parser) => parser.check(TT.DO_TOGETHER), parse: parseDoTogetherStatement },
  { matches: (parser) => parser.check(TT.IF), parse: parseIfElseStatement },
  { matches: (parser) => parser.check(TT.FOR_EACH), parse: parseForEachStatement },
  { matches: (parser) => parser.check(TT.COUNT_UP_TO), parse: parseCountUpToStatement },
  { matches: isContextualCountStatement, parse: parseContextualCountStatement },
  { matches: (parser) => parser.check(TT.WHILE), parse: parseWhileStatement },
  { matches: (parser) => parser.check(TT.TRY), parse: parseTryCatchStatement },
  { matches: (parser) => parser.check(TT.SWITCH), parse: parseSwitchStatement },
  { matches: (parser) => parser.check(TT.RETURN), parse: parseReturnStatement },
  { matches: (parser) => parser.check(TT.LBRACE), parse: parseBlockStatement },
  { matches: isThisConstructorInvocationStatement, parse: parseThisConstructorInvocationStatement },
  { matches: isSuperConstructorInvocationStatement, parse: parseSuperConstructorInvocationStatement },
  { matches: (parser) => parser.check(TT.DISABLED_BLOCK), parse: parseDisabledBlockStatement },
  { matches: (parser) => parser.check(TT.CONSTANT), parse: parseConstantLocalVariableStatement },
  { matches: (parser) => parser.isLocalVarStart(), parse: parseLocalVariableStatement },
];

export function parseStatement(parser: Parser): Statement {
  for (const statementParser of ORDERED_STATEMENT_PARSERS) {
    if (statementParser.matches(parser)) {
      return statementParser.parse(parser);
    }
  }

  return parseExpressionStatement(parser);
}

function parseDoInOrderStatement(parser: Parser): Statement {
  parser.advance();
  const body = parser.parseBlock();
  return { type: "DoInOrder", body };
}

function parseDoTogetherStatement(parser: Parser): Statement {
  parser.advance();
  const body = parser.parseBlock();
  return { type: "DoTogether", body };
}

function parseIfElseStatement(parser: Parser): Statement {
  parser.advance();
  parser.expect(TT.LPAREN, "'('");
  const condition = parser.parseExpression();
  parser.expect(TT.RPAREN, "')'");
  const ifBody = parser.parseBlock();
  let elseBody: Statement[] | null = null;
  if (parser.match(TT.ELSE)) {
    elseBody = parser.parseBlock();
  }
  return { type: "IfElse", condition, ifBody, elseBody };
}

function parseForEachStatement(parser: Parser): Statement {
  parser.advance();
  parser.expect(TT.LPAREN, "'('");
  const itemType = parser.parseTypeRef();
  const itemName = parser.expect(TT.IDENTIFIER, "variable name").text;
  parser.expect(TT.IN, "'in'");
  const collection = parser.parseExpression();
  parser.expect(TT.RPAREN, "')'");
  const body = parser.parseBlock();
  return { type: "ForEach", itemType, itemName, collection, body };
}

function parseCountUpToStatement(parser: Parser): Statement {
  parser.advance();
  return parseCountLoop(parser);
}

function isContextualCountStatement(parser: Parser): boolean {
  return parser.check(TT.IDENTIFIER) && parser.peek().text === "count" && parser.peekAt(1).type === TT.LPAREN;
}

function parseContextualCountStatement(parser: Parser): Statement {
  parser.advance();
  return parseCountLoop(parser);
}

function parseCountLoop(parser: Parser): Statement {
  parser.expect(TT.LPAREN, "'('");
  const count = parser.parseExpression();
  parser.expect(TT.RPAREN, "')'");
  const body = parser.parseBlock();
  return { type: "CountUpTo", count, body };
}

function parseWhileStatement(parser: Parser): Statement {
  parser.advance();
  parser.expect(TT.LPAREN, "'('");
  const condition = parser.parseExpression();
  parser.expect(TT.RPAREN, "')'");
  const body = parser.parseBlock();
  return { type: "WhileLoop", condition, body };
}

function parseTryCatchStatement(parser: Parser): Statement {
  parser.advance();
  const tryBody = parser.parseBlock();
  parser.expect(TT.CATCH, "'catch'");
  parser.expect(TT.LPAREN, "'('");
  const { catchType, catchVariable } = parseCatchBinding(parser);
  parser.expect(TT.RPAREN, "')'");
  const catchBody = parser.parseBlock();
  return { type: "TryCatch", tryBody, catchType, catchVariable, catchBody };
}

function parseCatchBinding(parser: Parser): { catchType: TypeRef; catchVariable: string } {
  if (parser.check(TT.IDENTIFIER) && parser.peekAt(1).type === TT.IDENTIFIER) {
    const first = parser.advance().text;
    const second = parser.advance().text;
    if (/^[A-Z]/.test(first)) {
      return {
        catchType: { type: "SimpleTypeRef", name: first, isArray: false, arrayDimensions: 0 },
        catchVariable: second,
      };
    }

    return {
      catchType: { type: "SimpleTypeRef", name: second, isArray: false, arrayDimensions: 0 },
      catchVariable: first,
    };
  }

  const catchType = parser.parseTypeRef();
  const catchVariable = parser.expect(TT.IDENTIFIER, "variable name").text;
  return { catchType, catchVariable };
}

function parseSwitchStatement(parser: Parser): Statement {
  parser.advance();
  parser.expect(TT.LPAREN, "'('");
  const expression = parser.parseExpression();
  parser.expect(TT.RPAREN, "')'");
  parser.expect(TT.LBRACE, "'{'");
  const cases: Array<{ value: Expression; body: Statement[] }> = [];
  let defaultCase: Statement[] | null = null;
  while (!parser.check(TT.RBRACE) && !parser.check(TT.EOF)) {
    if (parser.check(TT.CASE)) {
      cases.push(parseSwitchCase(parser));
    } else if (parser.check(TT.DEFAULT)) {
      defaultCase = parseSwitchDefault(parser);
    } else {
      parser.fail("Expected 'case' or 'default'");
    }
  }
  parser.expect(TT.RBRACE, "'}'");
  return { type: "SwitchCase", expression, cases, defaultCase };
}

function parseSwitchCase(parser: Parser): { value: Expression; body: Statement[] } {
  parser.advance();
  const value = parser.parseExpression();
  parser.expect(TT.COLON, "':'");
  const body = parser.parseBlock();
  return { value, body };
}

function parseSwitchDefault(parser: Parser): Statement[] {
  parser.advance();
  parser.expect(TT.COLON, "':'");
  return parser.parseBlock();
}

function parseReturnStatement(parser: Parser): Statement {
  parser.advance();
  if (parser.match(TT.SEMI)) {
    return { type: "Return", expression: null };
  }
  const expression = parser.parseExpression();
  parser.expect(TT.SEMI, "';'");
  return { type: "Return", expression };
}

function parseBlockStatement(parser: Parser): Statement {
  return { type: "Block", body: parser.parseBlock() };
}

function isThisConstructorInvocationStatement(parser: Parser): boolean {
  return parser.check(TT.THIS) && parser.peekAt(1).type === TT.LPAREN;
}

function parseThisConstructorInvocationStatement(parser: Parser): Statement {
  const args = parser.parseConstructorInvocationArguments(TT.THIS);
  parser.expect(TT.SEMI, "';'");
  return { type: "ThisConstructorInvocationStatement", arguments: args };
}

function isSuperConstructorInvocationStatement(parser: Parser): boolean {
  return parser.check(TT.SUPER) && parser.peekAt(1).type === TT.LPAREN;
}

function parseSuperConstructorInvocationStatement(parser: Parser): Statement {
  const args = parser.parseConstructorInvocationArguments(TT.SUPER);
  parser.expect(TT.SEMI, "';'");
  return { type: "SuperConstructorInvocationStatement", arguments: args };
}

function parseDisabledBlockStatement(parser: Parser): Statement {
  const tok = parser.advance();
  return { type: "DisabledBlock", raw: tok.text };
}

function parseConstantLocalVariableStatement(parser: Parser): Statement {
  parser.advance();
  return parser.parseLocalVariable(true);
}

function parseLocalVariableStatement(parser: Parser): Statement {
  return parser.parseLocalVariable(false);
}

function parseExpressionStatement(parser: Parser): Statement {
  const expr = parser.parseExpression();
  parser.expect(TT.SEMI, "';'");
  return { type: "ExpressionStatement", expression: expr };
}

export function isLocalVarStart(parser: Parser): boolean {
  const end = parser.lookaheadTypeRefEnd(parser.pos);
  return end !== null && parser.tokens[end]?.type === TT.IDENTIFIER && parser.tokens[end + 1]?.type === TT.ASSIGN;
}

export function parseLocalVariable(parser: Parser, isConstant: boolean): Statement {
  const varType = parser.parseTypeRef();
  const name = parser.expect(TT.IDENTIFIER, "variable name").text;
  parser.expect(TT.ASSIGN, "'<-'");
  const initializer = parser.parseExpression();
  parser.expect(TT.SEMI, "';'");
  return { type: "LocalVariableDeclaration", name, varType, initializer, isConstant };
}
