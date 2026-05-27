// Split from tweedle-parser.ts

import { TweedleParseError } from "./tweedle-parser-declarations.js";

const MAX_SOURCE_LENGTH = 1_048_576; // 1 MB
const MAX_PARSE_DEPTH = 100;

// ── Token Types ──────────────────────────────────────────────────────────

export enum TT {
  NUMBER, STRING, IDENTIFIER, ANNOTATION,
  CLASS, EXTENDS, MODELS, VOID, STATIC, CONSTANT,
  NEW, RETURN, IF, ELSE,
  FOR_EACH, DO_IN_ORDER, DO_TOGETHER, COUNT_UP_TO,
  THIS, SUPER, TRUE, FALSE, NULL_LIT,
  AS, INSTANCEOF, ENUM, IN,
  WHILE, TRY, CATCH, SWITCH, CASE, DEFAULT,
  LPAREN, RPAREN, LBRACE, RBRACE, LBRACKET, RBRACKET,
  SEMI, COMMA, DOT, COLON, ELLIPSIS,
  PLUS, MINUS, STAR, SLASH, PERCENT,
  EQ_EQ, NOT_EQ, LT, GT, LT_EQ, GT_EQ,
  AND_AND, OR_OR, NOT,
  ASSIGN, DOT_DOT, ARROW,
  DISABLED_BLOCK,
  EOF,
}

export const KEYWORDS = new Map<string, TT>([
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
  ["while", TT.WHILE], ["try", TT.TRY], ["catch", TT.CATCH],
  ["switch", TT.SWITCH], ["case", TT.CASE], ["default", TT.DEFAULT],
]);

export interface Token {
  type: TT;
  text: string;
  line: number;
  column: number;
}

function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_" || c === "$";
}

function isIdentPart(c: string): boolean {
  return isIdentStart(c) || (c >= "0" && c <= "9");
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}

export function tokenize(source: string): Token[] {
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
        else throw new TweedleParseError(`Unexpected character '&' (did you mean '&&'?)`, sLine, sCol, "&", "&&");
        break;
      case "|":
        if (ch() === "|") { advance(); emit(TT.OR_OR, "||", sLine, sCol); }
        else throw new TweedleParseError(`Unexpected character '|' (did you mean '||'?)`, sLine, sCol, "|", "||");
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
        else throw new TweedleParseError(`Unexpected character '=' (Tweedle uses '<-' for assignment and '==' for equality)`, sLine, sCol, "=", "<- or ==");
        break;
      default:
        throw new TweedleParseError(`Unexpected character '${c0}'`, sLine, sCol, c0, "valid token");
    }
  }

  emit(TT.EOF, "", line, col());
  return tokens;
}
