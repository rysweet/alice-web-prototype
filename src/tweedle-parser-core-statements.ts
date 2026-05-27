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

export function parseStatement(parser: Parser): Statement {
  // doInOrder { ... }
  if (parser.check(TT.DO_IN_ORDER)) {
    parser.advance();
    const body = parser.parseBlock();
    return { type: "DoInOrder", body };
  }

  // doTogether { ... }
  if (parser.check(TT.DO_TOGETHER)) {
    parser.advance();
    const body = parser.parseBlock();
    return { type: "DoTogether", body };
  }

  // if (cond) { ... } [else { ... }]
  if (parser.check(TT.IF)) {
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

  // forEach (Type name in collection) { ... }
  if (parser.check(TT.FOR_EACH)) {
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

  // countUpTo (expr) { ... }
  if (parser.check(TT.COUNT_UP_TO)) {
    parser.advance();
    parser.expect(TT.LPAREN, "'('");
    const count = parser.parseExpression();
    parser.expect(TT.RPAREN, "')'");
    const body = parser.parseBlock();
    return { type: "CountUpTo", count, body };
  }

  // while (cond) { ... }
  if (parser.check(TT.WHILE)) {
    parser.advance();
    parser.expect(TT.LPAREN, "'('");
    const condition = parser.parseExpression();
    parser.expect(TT.RPAREN, "')'");
    const body = parser.parseBlock();
    return { type: "WhileLoop", condition, body };
  }

  // try { ... } catch (Type name) { ... } / catch (name Type) { ... }
  if (parser.check(TT.TRY)) {
    parser.advance();
    const tryBody = parser.parseBlock();
    parser.expect(TT.CATCH, "'catch'");
    parser.expect(TT.LPAREN, "'('");
    let catchType: TypeRef;
    let catchVariable: string;
    if (parser.check(TT.IDENTIFIER) && parser.peekAt(1).type === TT.IDENTIFIER) {
      const first = parser.advance().text;
      const second = parser.advance().text;
      if (/^[A-Z]/.test(first)) {
        catchType = { type: "SimpleTypeRef", name: first, isArray: false, arrayDimensions: 0 };
        catchVariable = second;
      } else {
        catchVariable = first;
        catchType = { type: "SimpleTypeRef", name: second, isArray: false, arrayDimensions: 0 };
      }
    } else {
      catchType = parser.parseTypeRef();
      catchVariable = parser.expect(TT.IDENTIFIER, "variable name").text;
    }
    parser.expect(TT.RPAREN, "')'");
    const catchBody = parser.parseBlock();
    return { type: "TryCatch", tryBody, catchType, catchVariable, catchBody };
  }

  // switch (expr) { case val: { ... } ... default: { ... } }
  if (parser.check(TT.SWITCH)) {
    parser.advance();
    parser.expect(TT.LPAREN, "'('");
    const expression = parser.parseExpression();
    parser.expect(TT.RPAREN, "')'");
    parser.expect(TT.LBRACE, "'{'");
    const cases: Array<{ value: Expression; body: Statement[] }> = [];
    let defaultCase: Statement[] | null = null;
    while (!parser.check(TT.RBRACE) && !parser.check(TT.EOF)) {
      if (parser.check(TT.CASE)) {
        parser.advance();
        const value = parser.parseExpression();
        parser.expect(TT.COLON, "':'");
        const body = parser.parseBlock();
        cases.push({ value, body });
      } else if (parser.check(TT.DEFAULT)) {
        parser.advance();
        parser.expect(TT.COLON, "':'");
        defaultCase = parser.parseBlock();
      } else {
        parser.fail("Expected 'case' or 'default'");
      }
    }
    parser.expect(TT.RBRACE, "'}'");
    return { type: "SwitchCase", expression, cases, defaultCase };
  }

  // return [expr];
  if (parser.check(TT.RETURN)) {
    parser.advance();
    if (parser.match(TT.SEMI)) {
      return { type: "Return", expression: null };
    }
    const expression = parser.parseExpression();
    parser.expect(TT.SEMI, "';'");
    return { type: "Return", expression };
  }

  if (parser.check(TT.LBRACE)) {
    return { type: "Block", body: parser.parseBlock() };
  }

  if (parser.check(TT.THIS) && parser.peekAt(1).type === TT.LPAREN) {
    const args = parser.parseConstructorInvocationArguments(TT.THIS);
    parser.expect(TT.SEMI, "';'");
    return { type: "ThisConstructorInvocationStatement", arguments: args };
  }

  if (parser.check(TT.SUPER) && parser.peekAt(1).type === TT.LPAREN) {
    const args = parser.parseConstructorInvocationArguments(TT.SUPER);
    parser.expect(TT.SEMI, "';'");
    return { type: "SuperConstructorInvocationStatement", arguments: args };
  }

  // Disabled block: *< ... >*
  if (parser.check(TT.DISABLED_BLOCK)) {
    const tok = parser.advance();
    return { type: "DisabledBlock", raw: tok.text };
  }

  // constant Type name <- value;
  if (parser.check(TT.CONSTANT)) {
    parser.advance();
    return parser.parseLocalVariable(true);
  }

  // Local variable: Type name <- value;
  if (parser.isLocalVarStart()) {
    return parser.parseLocalVariable(false);
  }

  // Expression statement
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
