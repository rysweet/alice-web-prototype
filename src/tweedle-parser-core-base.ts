import { hydrateClassDecl, type RawClassDecl } from "./ast-nodes.js";
import { KEYWORDS, TT, tokenize, type Token } from "./tweedle-lexer.js";
import {
  type Argument,
  applyDeclarationMetadata,
  type ClassDecl,
  type ConstructorDecl,
  type EnumValueDecl,
  type Expression,
  type FieldDecl,
  type MethodDecl,
  type Parameter,
  type Statement,
  TweedleParseError,
  type TypeRef,
} from "./tweedle-parser-declarations.js";
import {
  isLocalVarStart,
  parseBlock,
  parseLocalVariable,
  parseStatement,
} from "./tweedle-parser-core-statements.js";
import {
  isLambdaExpression,
  lookaheadTypeRefEnd,
  parseArgument,
  parseArgumentList,
  parseConstructorInvocationArguments,
  parseExpression,
  parseLambdaExpression,
  parseNewExpression,
  parsePrefix,
  captureLambdaRaw,
  toMethodInvocation,
} from "./tweedle-parser-core-expressions.js";
const MAX_PARSE_DEPTH = 100;
export class Parser {
  pos = 0;
  depth = 0;
  readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }
  // ── Utilities ──────────────────────────────────────────────────────────
  peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  peekAt(offset: number): Token {
    const i = this.pos + offset;
    return this.tokens[i] ?? this.tokens[this.tokens.length - 1];
  }

  advance(): Token {
    const tok = this.peek();
    if (tok.type !== TT.EOF) this.pos++;
    return tok;
  }

  check(type: TT): boolean {
    return this.peek().type === type;
  }

  match(type: TT): boolean {
    if (this.check(type)) { this.advance(); return true; }
    return false;
  }

  expect(type: TT, expected?: string): Token {
    const tok = this.peek();
    if (tok.type === type) return this.advance();
    const exp = expected ?? tokenName(type);
    throw new TweedleParseError(
      `Expected ${exp} but found '${tok.text || "end of input"}'`,
      tok.line, tok.column,
      tok.text || "end of input",
      exp,
    );
  }

  fail(message: string, tok?: Token): never {
    const t = tok ?? this.peek();
    throw new TweedleParseError(
      message, t.line, t.column,
      t.text || "end of input", "",
    );
  }

  // ── Top-level ──────────────────────────────────────────────────────────

  parse(): ClassDecl {
    let visibility: string | null = null;
    if (this.check(TT.ANNOTATION)) visibility = this.advance().text;

    if (this.check(TT.ENUM)) {
      return this.parseEnumDeclaration(visibility);
    }

    this.expect(TT.CLASS, "'class'");
    const name = this.expect(TT.IDENTIFIER, "class name (identifier)").text;
    const typeParameters = this.parseOptionalTypeParameterNames();

    let superClass: string | null = null;
    if (this.match(TT.EXTENDS)) {
      superClass = this.expect(TT.IDENTIFIER, "superclass name").text;
    }

    let modelType: string | null = null;
    if (this.match(TT.MODELS)) {
      modelType = this.expect(TT.IDENTIFIER, "model type name").text;
    }

    this.expect(TT.LBRACE, "'{'");

    const constructors: ConstructorDecl[] = [];
    const methods: MethodDecl[] = [];
    const fields: FieldDecl[] = [];

    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.match(TT.SEMI)) continue; // stray semicolons
      this.parseMember(name, constructors, methods, fields);
    }

    this.expect(TT.RBRACE, "'}'");

    return { type: "ClassDeclaration", name, superClass, modelType, visibility, constructors, methods, fields, typeParameters };
  }

  parseEnumDeclaration(visibility: string | null): ClassDecl {
    this.expect(TT.ENUM, "'enum'");
    const name = this.expect(TT.IDENTIFIER, "enum name").text;
    this.expect(TT.LBRACE, "'{'");

    const enumValues: EnumValueDecl[] = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.check(TT.SEMI)) {
        this.advance();
        break;
      }
      const valueName = this.expect(TT.IDENTIFIER, "enum value").text;
      const argumentsList = this.check(TT.LPAREN) ? this.parseArgumentList() : [];
      enumValues.push({ name: valueName, arguments: argumentsList });
      if (!this.match(TT.COMMA)) {
        break;
      }
      if (this.check(TT.RBRACE)) {
        break;
      }
    }

    const constructors: ConstructorDecl[] = [];
    const methods: MethodDecl[] = [];
    const fields: FieldDecl[] = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      if (this.match(TT.SEMI)) continue;
      this.parseMember(name, constructors, methods, fields);
    }
    this.expect(TT.RBRACE, "'}'");

    return {
      type: "ClassDeclaration",
      name,
      superClass: null,
      modelType: null,
      visibility,
      constructors,
      methods,
      fields,
      isEnum: true,
      enumValues,
    };
  }

  // ── Member Declarations ────────────────────────────────────────────────

  parseMember(
    className: string,
    constructors: ConstructorDecl[],
    methods: MethodDecl[],
    fields: FieldDecl[],
  ): void {
    let visibility: string | null = null;
    if (this.check(TT.ANNOTATION)) visibility = this.advance().text;

    let isStatic = false;
    let isConstant = false;
    if (this.check(TT.STATIC)) { this.advance(); isStatic = true; }
    if (this.check(TT.CONSTANT)) { this.advance(); isConstant = true; }
    const typeParameters = this.parseOptionalTypeParameterNames();

    // void → method
    if (this.check(TT.VOID)) {
      this.advance();
      const returnType: TypeRef = { type: "VoidTypeRef" };
      const mName = this.expect(TT.IDENTIFIER, "method name").text;
      const params = this.parseParameters();
      const body = this.parseBlock();
      methods.push({
        type: "MethodDeclaration", name: mName, returnType, parameters: params,
        body, isStatic, visibility, typeParameters,
      });
      return;
    }

    // IDENTIFIER( → constructor (no return type before name)
    if (this.check(TT.IDENTIFIER) && this.peekAt(1).type === TT.LPAREN && !isStatic && !isConstant) {
      const cName = this.advance().text;
      const params = this.parseParameters();
      const body = this.parseBlock();
      constructors.push({
        type: "ConstructorDeclaration", name: cName, parameters: params,
        body, visibility, typeParameters,
      });
      return;
    }

    // Otherwise: parse type → name → decide method vs field
    const typeRef = this.parseTypeRef();
    const mName = this.expect(TT.IDENTIFIER, "member name").text;

    if (this.check(TT.LPAREN)) {
      // Method
      const params = this.parseParameters();
      const body = this.parseBlock();
      methods.push({
        type: "MethodDeclaration", name: mName, returnType: typeRef,
        parameters: params, body, isStatic, visibility, typeParameters,
      });
    } else {
      // Field
      let initializer: Expression | null = null;
      if (this.match(TT.ASSIGN)) {
        initializer = this.parseExpression();
      }
      this.expect(TT.SEMI, "';'");
      fields.push({
        type: "FieldDeclaration", name: mName, fieldType: typeRef,
        initializer, isStatic, isConstant, visibility,
      });
    }
  }

  // ── Type References ────────────────────────────────────────────────────

  parseTypeRef(): TypeRef {
    if (this.check(TT.VOID)) {
      this.advance();
      return { type: "VoidTypeRef" };
    }

    if (this.check(TT.LT)) {
      return this.parseLambdaTypeRef();
    }

    const name = this.expect(TT.IDENTIFIER, "type name").text;
    const typeArguments = this.parseOptionalTypeArguments();
    let arrayDimensions = 0;
    while (this.check(TT.LBRACKET) && this.peekAt(1).type === TT.RBRACKET) {
      this.advance();
      this.advance();
      arrayDimensions += 1;
    }
    return {
      type: "SimpleTypeRef",
      name,
      isArray: arrayDimensions > 0,
      arrayDimensions,
      typeArguments,
    };
  }

  parseLambdaTypeRef(): TypeRef {
    const raw = this.captureDelimitedRaw(TT.LT, TT.GT);
    return { type: "LambdaTypeRef", raw };
  }

  parseOptionalTypeArguments(): TypeRef[] | undefined {
    if (!this.check(TT.LT)) {
      return undefined;
    }
    this.expect(TT.LT, "'<'");
    const args: TypeRef[] = [];
    while (!this.check(TT.GT) && !this.check(TT.EOF)) {
      if (args.length > 0) this.expect(TT.COMMA, "','");
      args.push(this.parseTypeRef());
    }
    this.expect(TT.GT, "'>'");
    return args;
  }

  parseOptionalTypeParameterNames(): string[] | undefined {
    if (!this.looksLikeTypeParameterList()) {
      return undefined;
    }
    this.expect(TT.LT, "'<'");
    const names: string[] = [];
    while (!this.check(TT.GT) && !this.check(TT.EOF)) {
      if (names.length > 0) this.expect(TT.COMMA, "','");
      names.push(this.expect(TT.IDENTIFIER, "type parameter name").text);
    }
    this.expect(TT.GT, "'>'");
    return names;
  }

  looksLikeTypeParameterList(): boolean {
    if (!this.check(TT.LT)) {
      return false;
    }
    let offset = 1;
    let expectIdentifier = true;
    while (true) {
      const tok = this.peekAt(offset);
      if (tok.type === TT.EOF || tok.type === TT.ARROW) {
        return false;
      }
      if (expectIdentifier) {
        if (tok.type !== TT.IDENTIFIER) {
          return false;
        }
        expectIdentifier = false;
        offset += 1;
        continue;
      }
      if (tok.type === TT.COMMA) {
        expectIdentifier = true;
        offset += 1;
        continue;
      }
      if (tok.type === TT.GT) {
        return this.peekAt(offset + 1).type !== TT.ARROW;
      }
      return false;
    }
  }

  captureDelimitedRaw(open: TT, close: TT): string {
    const parts: string[] = [];
    const openText = this.expect(open).text;
    parts.push(openText);
    let depth = 1;
    while (!this.check(TT.EOF)) {
      const tok = this.advance();
      parts.push(tok.text);
      if (tok.type === open) depth++;
      if (tok.type === close) {
        depth--;
        if (depth === 0) {
          break;
        }
      }
    }
    return joinTokenText(parts);
  }

  // ── Parameters ─────────────────────────────────────────────────────────

  parseParameters(): Parameter[] {
    this.expect(TT.LPAREN, "'('");
    const params: Parameter[] = [];
    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      if (params.length > 0) this.expect(TT.COMMA, "','");
      params.push(this.parseParameter());
    }
    this.expect(TT.RPAREN, "')'");
    return params;
  }

  parseParameter(): Parameter {
    const paramType = this.parseTypeRef();
    const isVarArgs = this.match(TT.ELLIPSIS);
    const name = this.expect(TT.IDENTIFIER, "parameter name").text;
    let defaultValue: Expression | null = null;
    if (this.match(TT.ASSIGN)) {
      defaultValue = this.parseExpression();
    }
    return { name, paramType, isVarArgs, defaultValue };
  }


  parseBlock(): Statement[] {
    return parseBlock(this);
  }

  parseStatement(): Statement {
    return parseStatement(this);
  }

  isLocalVarStart(): boolean {
    return isLocalVarStart(this);
  }

  parseLocalVariable(isConstant: boolean): Statement {
    return parseLocalVariable(this, isConstant);
  }

  parseExpression(minBp = 0): Expression {
    return parseExpression(this, minBp);
  }

  parsePrefix(): Expression {
    return parsePrefix(this);
  }

  isLambdaExpression(): boolean {
    return isLambdaExpression(this);
  }

  parseLambdaExpression(): Expression {
    return parseLambdaExpression(this);
  }

  captureLambdaRaw(): string {
    return captureLambdaRaw(this);
  }

  parseConstructorInvocationArguments(keyword: TT.THIS | TT.SUPER): Argument[] {
    return parseConstructorInvocationArguments(this, keyword);
  }

  lookaheadTypeRefEnd(start: number): number | null {
    return lookaheadTypeRefEnd(this, start);
  }

  parseNewExpression(): Expression {
    return parseNewExpression(this);
  }

  parseArgumentList(): Argument[] {
    return parseArgumentList(this);
  }

  parseArgument(): Argument {
    return parseArgument(this);
  }

  toMethodInvocation(left: Expression, args: Argument[]): Expression {
    return toMethodInvocation(this, left, args);
  }
}
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

export function parseTweedle(source: string): ClassDecl {
  if (source.length > 1_048_576) {
    throw new TweedleParseError("Source exceeds maximum supported length", 1, 1, "", "source <= 1 MB");
  }
  const parser = new Parser(tokenize(source));
  const raw = parser.parse();
  return applyDeclarationMetadata(raw, hydrateClassDecl(raw as RawClassDecl) as unknown as ClassDecl);
}
