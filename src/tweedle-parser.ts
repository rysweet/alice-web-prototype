// ═══════════════════════════════════════════════════════════════════════════
// tweedle-parser.ts — Tweedle AST parser for the Alice web prototype
//
// Transforms Tweedle source code into a typed AST.
// Pure function, no I/O, no external dependencies.
// ═══════════════════════════════════════════════════════════════════════════

const MAX_SOURCE_LENGTH = 1_048_576; // 1 MB
const MAX_PARSE_DEPTH = 100;

// ── Token Types ──────────────────────────────────────────────────────────

enum TT {
  NUMBER, STRING, IDENTIFIER, ANNOTATION,
  CLASS, EXTENDS, MODELS, VOID, STATIC, CONSTANT,
  NEW, RETURN, IF, ELSE,
  FOR_EACH, DO_IN_ORDER, DO_TOGETHER, COUNT_UP_TO,
  THIS, SUPER, TRUE, FALSE, NULL_LIT,
  AS, INSTANCEOF, ENUM, IN,
  LPAREN, RPAREN, LBRACE, RBRACE, LBRACKET, RBRACKET,
  SEMI, COMMA, DOT, COLON, ELLIPSIS,
  PLUS, MINUS, STAR, SLASH, PERCENT,
  EQ_EQ, NOT_EQ, LT, GT, LT_EQ, GT_EQ,
  AND_AND, OR_OR, NOT,
  ASSIGN, DOT_DOT, ARROW,
  DISABLED_BLOCK,
  EOF,
}

const KEYWORDS = new Map<string, TT>([
  ["class", TT.CLASS], ["extends", TT.EXTENDS], ["models", TT.MODELS],
  ["void", TT.VOID], ["static", TT.STATIC], ["constant", TT.CONSTANT],
  ["new", TT.NEW], ["return", TT.RETURN],
  ["if", TT.IF], ["else", TT.ELSE],
  ["forEach", TT.FOR_EACH], ["doInOrder", TT.DO_IN_ORDER],
  ["doTogether", TT.DO_TOGETHER], ["countUpTo", TT.COUNT_UP_TO],
  ["this", TT.THIS], ["super", TT.SUPER],
  ["true", TT.TRUE], ["false", TT.FALSE], ["null", TT.NULL_LIT],
  ["as", TT.AS], ["instanceof", TT.INSTANCEOF],
  ["enum", TT.ENUM], ["in", TT.IN],
]);

interface Token {
  type: TT;
  text: string;
  line: number;
  column: number;
}

// ── AST Types ────────────────────────────────────────────────────────────

export type TypeRef =
  | { type: "SimpleTypeRef"; name: string; isArray: boolean }
  | { type: "VoidTypeRef" }
  | { type: "LambdaTypeRef"; raw: string };

export type Parameter = {
  name: string;
  paramType: TypeRef;
  isVarArgs: boolean;
  defaultValue: Expression | null;
};

export type Argument = {
  name: string | null;
  value: Expression;
};

export type Statement =
  | { type: "DoInOrder"; body: Statement[] }
  | { type: "DoTogether"; body: Statement[] }
  | { type: "IfElse"; condition: Expression; ifBody: Statement[]; elseBody: Statement[] | null }
  | { type: "ForEach"; itemType: TypeRef; itemName: string; collection: Expression; body: Statement[] }
  | { type: "CountUpTo"; count: Expression; body: Statement[] }
  | { type: "Return"; expression: Expression | null }
  | { type: "ExpressionStatement"; expression: Expression }
  | { type: "LocalVariableDeclaration"; name: string; varType: TypeRef; initializer: Expression; isConstant: boolean }
  | { type: "Block"; body: Statement[] }
  | { type: "DisabledBlock"; raw: string };

export type Expression =
  | { type: "Literal"; value: number | string | boolean | null; literalType: "number" | "string" | "boolean" | "null" }
  | { type: "This" }
  | { type: "Super" }
  | { type: "Identifier"; name: string }
  | { type: "MemberAccess"; target: Expression; memberName: string }
  | { type: "MethodInvocation"; target: Expression | null; methodName: string; arguments: Argument[] }
  | { type: "NewInstance"; className: string; arguments: Argument[] }
  | { type: "NewArray"; elementType: TypeRef; elements: Expression[]; size: Expression | null }
  | { type: "BinaryOp"; operator: string; left: Expression; right: Expression }
  | { type: "UnaryOp"; operator: string; operand: Expression }
  | { type: "Assignment"; target: Expression; value: Expression }
  | { type: "ArrayAccess"; target: Expression; index: Expression }
  | { type: "TypeCast"; expression: Expression; targetType: TypeRef }
  | { type: "InstanceOf"; expression: Expression; testType: TypeRef }
  | { type: "Parenthesized"; expression: Expression };

export type ConstructorDecl = {
  type: "ConstructorDeclaration";
  name: string;
  parameters: Parameter[];
  body: Statement[];
  visibility: string | null;
};

export type MethodDecl = {
  type: "MethodDeclaration";
  name: string;
  returnType: TypeRef;
  parameters: Parameter[];
  body: Statement[];
  isStatic: boolean;
  visibility: string | null;
};

export type FieldDecl = {
  type: "FieldDeclaration";
  name: string;
  fieldType: TypeRef;
  initializer: Expression | null;
  isStatic: boolean;
  isConstant: boolean;
  visibility: string | null;
};

export type ClassDecl = {
  type: "ClassDeclaration";
  name: string;
  superClass: string | null;
  modelType: string | null;
  visibility: string | null;
  constructors: ConstructorDecl[];
  methods: MethodDecl[];
  fields: FieldDecl[];
};

// ── TweedleParseError ────────────────────────────────────────────────────

export class TweedleParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly found: string,
    public readonly expected: string,
  ) {
    super(message);
    this.name = "TweedleParseError";
  }
}

// ── Lexer ────────────────────────────────────────────────────────────────

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || (c >= "0" && c <= "9");
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const len = source.length;
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  function ch(offset = 0): string {
    const i = pos + offset;
    return i < len ? source[i] : "\0";
  }

  function col(): number { return pos - lineStart; }

  function advance(): string {
    const c = source[pos++];
    if (c === "\n") { line++; lineStart = pos; }
    return c;
  }

  function emit(type: TT, text: string, l: number, c: number): void {
    tokens.push({ type, text, line: l, column: c });
  }

  while (pos < len) {
    const c0 = ch();
    const sLine = line;
    const sCol = col();

    // Whitespace
    if (c0 === " " || c0 === "\t" || c0 === "\r" || c0 === "\n") { advance(); continue; }

    // Line comment
    if (c0 === "/" && ch(1) === "/") {
      while (pos < len && ch() !== "\n") advance();
      continue;
    }

    // Block comment
    if (c0 === "/" && ch(1) === "*") {
      advance(); advance();
      while (pos < len) {
        if (ch() === "*" && ch(1) === "/") { advance(); advance(); break; }
        advance();
      }
      continue;
    }

    // Disabled block: *< ... >*
    if (c0 === "*" && ch(1) === "<") {
      advance(); advance();
      const start = pos;
      while (pos < len) {
        if (ch() === ">" && ch(1) === "*") {
          const raw = source.slice(start, pos);
          advance(); advance();
          emit(TT.DISABLED_BLOCK, raw, sLine, sCol);
          break;
        }
        advance();
      }
      continue;
    }

    // String literal
    if (c0 === '"') {
      advance();
      let value = "";
      while (pos < len && ch() !== '"') {
        if (ch() === "\\") {
          advance();
          const esc = advance();
          switch (esc) {
            case "n": value += "\n"; break;
            case "t": value += "\t"; break;
            case "r": value += "\r"; break;
            case '"': value += '"'; break;
            case "\\": value += "\\"; break;
            default: value += esc;
          }
        } else {
          value += advance();
        }
      }
      if (pos < len) advance(); // closing "
      emit(TT.STRING, value, sLine, sCol);
      continue;
    }

    // Number literal — use slice to avoid O(n²) string concatenation
    if (isDigit(c0)) {
      const numStart = pos;
      pos++;
      while (pos < len && isDigit(source[pos])) pos++;
      if (pos < len && source[pos] === "." && (pos + 1 >= len || source[pos + 1] !== ".")) {
        pos++;
        while (pos < len && isDigit(source[pos])) pos++;
      }
      if (pos < len && (source[pos] === "E" || source[pos] === "e")) {
        pos++;
        if (pos < len && (source[pos] === "+" || source[pos] === "-")) pos++;
        while (pos < len && isDigit(source[pos])) pos++;
      }
      emit(TT.NUMBER, source.slice(numStart, pos), sLine, sCol);
      continue;
    }

    // Identifier / keyword — use slice to avoid O(n²) string concatenation
    if (isIdentStart(c0)) {
      const idStart = pos;
      pos++;
      while (pos < len && isIdentPart(source[pos])) pos++;
      const id = source.slice(idStart, pos);
      const kw = KEYWORDS.get(id);
      emit(kw !== undefined ? kw : TT.IDENTIFIER, id, sLine, sCol);
      continue;
    }

    // Annotation (@Identifier)
    if (c0 === "@") {
      advance();
      let name = "@";
      while (pos < len && isIdentPart(ch())) name += advance();
      emit(TT.ANNOTATION, name, sLine, sCol);
      continue;
    }

    // Operators and delimiters
    advance();
    switch (c0) {
      case "(": emit(TT.LPAREN, "(", sLine, sCol); break;
      case ")": emit(TT.RPAREN, ")", sLine, sCol); break;
      case "{": emit(TT.LBRACE, "{", sLine, sCol); break;
      case "}": emit(TT.RBRACE, "}", sLine, sCol); break;
      case "[": emit(TT.LBRACKET, "[", sLine, sCol); break;
      case "]": emit(TT.RBRACKET, "]", sLine, sCol); break;
      case ";": emit(TT.SEMI, ";", sLine, sCol); break;
      case ",": emit(TT.COMMA, ",", sLine, sCol); break;
      case ":": emit(TT.COLON, ":", sLine, sCol); break;
      case "+": emit(TT.PLUS, "+", sLine, sCol); break;
      case "%": emit(TT.PERCENT, "%", sLine, sCol); break;
      case "/": emit(TT.SLASH, "/", sLine, sCol); break;
      case "!":
        if (ch() === "=") { advance(); emit(TT.NOT_EQ, "!=", sLine, sCol); }
        else emit(TT.NOT, "!", sLine, sCol);
        break;
      case "<":
        if (ch() === "-") { advance(); emit(TT.ASSIGN, "<-", sLine, sCol); }
        else if (ch() === "=") { advance(); emit(TT.LT_EQ, "<=", sLine, sCol); }
        else emit(TT.LT, "<", sLine, sCol);
        break;
      case ">":
        if (ch() === "=") { advance(); emit(TT.GT_EQ, ">=", sLine, sCol); }
        else emit(TT.GT, ">", sLine, sCol);
        break;
      case "&":
        if (ch() === "&") { advance(); emit(TT.AND_AND, "&&", sLine, sCol); }
        break;
      case "|":
        if (ch() === "|") { advance(); emit(TT.OR_OR, "||", sLine, sCol); }
        break;
      case "-":
        if (ch() === ">") { advance(); emit(TT.ARROW, "->", sLine, sCol); }
        else emit(TT.MINUS, "-", sLine, sCol);
        break;
      case ".":
        if (ch() === "." && ch(1) === ".") { advance(); advance(); emit(TT.ELLIPSIS, "...", sLine, sCol); }
        else if (ch() === ".") { advance(); emit(TT.DOT_DOT, "..", sLine, sCol); }
        else emit(TT.DOT, ".", sLine, sCol);
        break;
      case "*": emit(TT.STAR, "*", sLine, sCol); break;
      case "=":
        if (ch() === "=") { advance(); emit(TT.EQ_EQ, "==", sLine, sCol); }
        break;
      // Unknown characters are silently skipped
    }
  }

  emit(TT.EOF, "", line, col());
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────────

class Parser {
  private pos = 0;
  private depth = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1];
  }

  private peekAt(offset: number): Token {
    const i = this.pos + offset;
    return this.tokens[i] ?? this.tokens[this.tokens.length - 1];
  }

  private advance(): Token {
    const tok = this.peek();
    if (tok.type !== TT.EOF) this.pos++;
    return tok;
  }

  private check(type: TT): boolean {
    return this.peek().type === type;
  }

  private match(type: TT): boolean {
    if (this.check(type)) { this.advance(); return true; }
    return false;
  }

  private expect(type: TT, expected?: string): Token {
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

  private fail(message: string, tok?: Token): never {
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
      this.fail("Enum declarations are not yet supported", this.peek());
    }

    this.expect(TT.CLASS, "'class'");
    const name = this.expect(TT.IDENTIFIER, "class name (identifier)").text;

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

    return { type: "ClassDeclaration", name, superClass, modelType, visibility, constructors, methods, fields };
  }

  // ── Member Declarations ────────────────────────────────────────────────

  private parseMember(
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

    // void → method
    if (this.check(TT.VOID)) {
      this.advance();
      const returnType: TypeRef = { type: "VoidTypeRef" };
      const mName = this.expect(TT.IDENTIFIER, "method name").text;
      const params = this.parseParameters();
      const body = this.parseBlock();
      methods.push({
        type: "MethodDeclaration", name: mName, returnType, parameters: params,
        body, isStatic, visibility,
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
        body, visibility,
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
        parameters: params, body, isStatic, visibility,
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

  private parseTypeRef(): TypeRef {
    if (this.check(TT.VOID)) {
      this.advance();
      return { type: "VoidTypeRef" };
    }

    if (this.check(TT.LT)) {
      return this.parseLambdaTypeRef();
    }

    const name = this.expect(TT.IDENTIFIER, "type name").text;
    let isArray = false;
    if (this.check(TT.LBRACKET) && this.peekAt(1).type === TT.RBRACKET) {
      this.advance(); this.advance();
      isArray = true;
    }
    return { type: "SimpleTypeRef", name, isArray };
  }

  private parseLambdaTypeRef(): TypeRef {
    this.advance();
    const parts: string[] = [];
    let depth = 1;
    while (!this.check(TT.EOF)) {
      const tok = this.peek();
      if (tok.type === TT.LT) depth++;
      if (tok.type === TT.GT) {
        depth--;
        if (depth === 0) { this.advance(); break; }
      }
      parts.push(this.advance().text);
    }
    return { type: "LambdaTypeRef", raw: parts.join("") };
  }

  // ── Parameters ─────────────────────────────────────────────────────────

  private parseParameters(): Parameter[] {
    this.expect(TT.LPAREN, "'('");
    const params: Parameter[] = [];
    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      if (params.length > 0) this.expect(TT.COMMA, "','");
      params.push(this.parseParameter());
    }
    this.expect(TT.RPAREN, "')'");
    return params;
  }

  private parseParameter(): Parameter {
    const paramType = this.parseTypeRef();
    const isVarArgs = this.match(TT.ELLIPSIS);
    const name = this.expect(TT.IDENTIFIER, "parameter name").text;
    let defaultValue: Expression | null = null;
    if (this.match(TT.ASSIGN)) {
      defaultValue = this.parseExpression();
    }
    return { name, paramType, isVarArgs, defaultValue };
  }

  // ── Block & Statements ─────────────────────────────────────────────────

  private parseBlock(): Statement[] {
    this.depth++;
    if (this.depth > MAX_PARSE_DEPTH) {
      this.fail("Maximum nesting depth exceeded");
    }
    this.expect(TT.LBRACE, "'{'");
    const stmts: Statement[] = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      stmts.push(this.parseStatement());
    }
    this.expect(TT.RBRACE, "'}'");
    this.depth--;
    return stmts;
  }

  private parseStatement(): Statement {
    // doInOrder { ... }
    if (this.check(TT.DO_IN_ORDER)) {
      this.advance();
      const body = this.parseBlock();
      return { type: "DoInOrder", body };
    }

    // doTogether { ... }
    if (this.check(TT.DO_TOGETHER)) {
      this.advance();
      const body = this.parseBlock();
      return { type: "DoTogether", body };
    }

    // if (cond) { ... } [else { ... }]
    if (this.check(TT.IF)) {
      this.advance();
      this.expect(TT.LPAREN, "'('");
      const condition = this.parseExpression();
      this.expect(TT.RPAREN, "')'");
      const ifBody = this.parseBlock();
      let elseBody: Statement[] | null = null;
      if (this.match(TT.ELSE)) {
        elseBody = this.parseBlock();
      }
      return { type: "IfElse", condition, ifBody, elseBody };
    }

    // forEach (Type name in collection) { ... }
    if (this.check(TT.FOR_EACH)) {
      this.advance();
      this.expect(TT.LPAREN, "'('");
      const itemType = this.parseTypeRef();
      const itemName = this.expect(TT.IDENTIFIER, "variable name").text;
      this.expect(TT.IN, "'in'");
      const collection = this.parseExpression();
      this.expect(TT.RPAREN, "')'");
      const body = this.parseBlock();
      return { type: "ForEach", itemType, itemName, collection, body };
    }

    // countUpTo (expr) { ... }
    if (this.check(TT.COUNT_UP_TO)) {
      this.advance();
      this.expect(TT.LPAREN, "'('");
      const count = this.parseExpression();
      this.expect(TT.RPAREN, "')'");
      const body = this.parseBlock();
      return { type: "CountUpTo", count, body };
    }

    // return [expr];
    if (this.check(TT.RETURN)) {
      this.advance();
      if (this.match(TT.SEMI)) {
        return { type: "Return", expression: null };
      }
      const expression = this.parseExpression();
      this.expect(TT.SEMI, "';'");
      return { type: "Return", expression };
    }

    // Disabled block: *< ... >*
    if (this.check(TT.DISABLED_BLOCK)) {
      const tok = this.advance();
      return { type: "DisabledBlock", raw: tok.text };
    }

    // constant Type name <- value;
    if (this.check(TT.CONSTANT)) {
      this.advance();
      return this.parseLocalVariable(true);
    }

    // Local variable: Type name <- value;
    if (this.isLocalVarStart()) {
      return this.parseLocalVariable(false);
    }

    // Expression statement
    const expr = this.parseExpression();
    this.expect(TT.SEMI, "';'");
    return { type: "ExpressionStatement", expression: expr };
  }

  private isLocalVarStart(): boolean {
    if (!this.check(TT.IDENTIFIER)) return false;
    const next = this.peekAt(1);
    // Type name pattern
    if (next.type === TT.IDENTIFIER) return true;
    // Type[] name pattern
    if (next.type === TT.LBRACKET &&
        this.peekAt(2).type === TT.RBRACKET &&
        this.peekAt(3).type === TT.IDENTIFIER) return true;
    return false;
  }

  private parseLocalVariable(isConstant: boolean): Statement {
    const varType = this.parseTypeRef();
    const name = this.expect(TT.IDENTIFIER, "variable name").text;
    this.expect(TT.ASSIGN, "'<-'");
    const initializer = this.parseExpression();
    this.expect(TT.SEMI, "';'");
    return { type: "LocalVariableDeclaration", name, varType, initializer, isConstant };
  }

  // ── Expressions (Pratt Parser) ─────────────────────────────────────────

  private parseExpression(minBp = 0): Expression {
    let left = this.parsePrefix();

    for (;;) {
      const tok = this.peek();

      // Lambda expression detection (unsupported)
      if (tok.type === TT.ARROW) {
        this.fail("Lambda expressions are not yet supported", tok);
      }

      // Postfix / high-precedence operators (bp = 20)
      if (tok.type === TT.DOT && 20 >= minBp) {
        this.advance();
        const memberName = this.expect(TT.IDENTIFIER, "member name").text;
        left = { type: "MemberAccess", target: left, memberName };
        continue;
      }

      if (tok.type === TT.LPAREN && 20 >= minBp) {
        const args = this.parseArgumentList();
        left = this.toMethodInvocation(left, args);
        continue;
      }

      if (tok.type === TT.LBRACKET && 20 >= minBp) {
        this.advance();
        const index = this.parseExpression();
        this.expect(TT.RBRACKET, "']'");
        left = { type: "ArrayAccess", target: left, index };
        continue;
      }

      if (tok.type === TT.AS && 20 >= minBp) {
        this.advance();
        const targetType = this.parseTypeRef();
        left = { type: "TypeCast", expression: left, targetType };
        continue;
      }

      // instanceof (bp = 10)
      if (tok.type === TT.INSTANCEOF && 10 >= minBp) {
        this.advance();
        const testType = this.parseTypeRef();
        left = { type: "InstanceOf", expression: left, testType };
        continue;
      }

      // Binary operators
      const bp = binaryBp(tok.type);
      if (bp === null || bp.left < minBp) break;

      // Assignment (right-associative)
      if (tok.type === TT.ASSIGN) {
        this.advance();
        const value = this.parseExpression(bp.right);
        left = { type: "Assignment", target: left, value };
        continue;
      }

      // Standard binary operator
      this.advance();
      const right = this.parseExpression(bp.right);
      left = { type: "BinaryOp", operator: tok.text, left, right };
    }

    return left;
  }

  private parsePrefix(): Expression {
    const tok = this.peek();

    // Unary operators
    if (tok.type === TT.NOT || tok.type === TT.MINUS) {
      this.advance();
      const operand = this.parseExpression(18);
      return { type: "UnaryOp", operator: tok.text, operand };
    }

    // Parenthesized expression or lambda detection
    if (tok.type === TT.LPAREN) {
      if (this.isLambdaExpression()) {
        this.fail("Lambda expressions are not yet supported", tok);
      }
      this.advance();
      this.depth++;
      if (this.depth > MAX_PARSE_DEPTH) {
        this.fail("Maximum parse depth exceeded", this.peek());
      }
      const expr = this.parseExpression();
      this.depth--;
      this.expect(TT.RPAREN, "')'");
      return { type: "Parenthesized", expression: expr };
    }

    // Number literal
    if (tok.type === TT.NUMBER) {
      this.advance();
      return { type: "Literal", value: parseFloat(tok.text), literalType: "number" };
    }

    // String literal
    if (tok.type === TT.STRING) {
      this.advance();
      return { type: "Literal", value: tok.text, literalType: "string" };
    }

    // Boolean literals
    if (tok.type === TT.TRUE || tok.type === TT.FALSE) {
      this.advance();
      return { type: "Literal", value: tok.type === TT.TRUE, literalType: "boolean" };
    }

    // null literal
    if (tok.type === TT.NULL_LIT) {
      this.advance();
      return { type: "Literal", value: null, literalType: "null" };
    }

    // this
    if (tok.type === TT.THIS) {
      this.advance();
      return { type: "This" };
    }

    // super
    if (tok.type === TT.SUPER) {
      this.advance();
      return { type: "Super" };
    }

    // new
    if (tok.type === TT.NEW) {
      return this.parseNewExpression();
    }

    // identifier
    if (tok.type === TT.IDENTIFIER) {
      this.advance();
      return { type: "Identifier", name: tok.text };
    }

    this.fail(`Unexpected token '${tok.text || "end of input"}'`, tok);
  }

  private isLambdaExpression(): boolean {
    // Look for pattern: ( ... ) ->
    let i = 1;
    let depth = 1;
    while (depth > 0) {
      const t = this.peekAt(i);
      if (t.type === TT.EOF) return false;
      if (t.type === TT.LPAREN) depth++;
      if (t.type === TT.RPAREN) depth--;
      i++;
    }
    return this.peekAt(i).type === TT.ARROW;
  }

  private parseNewExpression(): Expression {
    this.advance();
    const className = this.expect(TT.IDENTIFIER, "class name").text;

    // new Type[]{elements} or new Type[size]
    if (this.check(TT.LBRACKET)) {
      this.advance();
      this.expect(TT.RBRACKET, "']'");
      this.expect(TT.LBRACE, "'{'");
      const elements: Expression[] = [];
      while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
        elements.push(this.parseExpression());
        if (!this.check(TT.RBRACE)) this.expect(TT.COMMA, "','");
      }
      this.expect(TT.RBRACE, "'}'");
      return {
        type: "NewArray",
        elementType: { type: "SimpleTypeRef", name: className, isArray: false },
        elements,
        size: null,
      };
    }

    // new Type(args)
    const args = this.parseArgumentList();
    return { type: "NewInstance", className, arguments: args };
  }

  private parseArgumentList(): Argument[] {
    this.expect(TT.LPAREN, "'('");
    const args: Argument[] = [];
    while (!this.check(TT.RPAREN) && !this.check(TT.EOF)) {
      if (args.length > 0) this.expect(TT.COMMA, "','");
      args.push(this.parseArgument());
    }
    this.expect(TT.RPAREN, "')'");
    return args;
  }

  private parseArgument(): Argument {
    // Named argument: identifier: expression
    if (this.check(TT.IDENTIFIER) && this.peekAt(1).type === TT.COLON) {
      const name = this.advance().text;
      this.advance();
      const value = this.parseExpression();
      return { name, value };
    }
    // Positional argument
    const value = this.parseExpression();
    return { name: null, value };
  }

  private toMethodInvocation(left: Expression, args: Argument[]): Expression {
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
    this.fail(`Cannot invoke '${left.type}' as a method`);
  }
}

// ── Binding Power Tables ─────────────────────────────────────────────────

// Pre-allocated binding power objects — avoids per-expression GC pressure
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

// ── Public API ───────────────────────────────────────────────────────────

export function parseTweedle(source: string): ClassDecl {
  if (source.length > MAX_SOURCE_LENGTH) {
    throw new TweedleParseError(
      `Source exceeds maximum length of ${MAX_SOURCE_LENGTH} characters`,
      1, 0, "", "source within size limit",
    );
  }
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parse();
}
