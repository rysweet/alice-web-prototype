import { initializeRuntimeObject } from "./tweedle-vm-builtins-runtime.js";
import { RuntimeObject, VMState } from "./tweedle-vm-core-types.js";
import { scopeLookup } from "./tweedle-vm-stack-scope.js";

export function evaluateValue(state: VMState, expr: unknown): unknown {
  if (typeof expr !== "string") {
    return expr;
  }

  const trimmed = expr.trim();
  if (trimmed.length === 0) {
    return "";
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return unescapeQuotedString(trimmed.slice(1, -1));
  }
  if (trimmed === "null") {
    return null;
  }
  if (trimmed === "true" || trimmed === "false") {
    return trimmed;
  }

  const binaryValue = evaluateBinaryExpression(state, trimmed);
  if (binaryValue !== undefined) {
    return binaryValue;
  }

  const newInstance = parseNewInstanceExpression(trimmed);
  if (newInstance) {
    return instantiateAnonymousObject(state, newInstance.className, newInstance.args);
  }

  const arrayAccess = parseArrayAccessExpression(trimmed);
  if (arrayAccess) {
    const target = evaluateValue(state, arrayAccess.target);
    const index = toArrayIndex(evaluateValue(state, arrayAccess.index));
    if (Array.isArray(target) && index !== null) {
      return target[index];
    }
    return trimmed;
  }

  const directObject = state.objectMap.get(trimmed);
  if (directObject) {
    return directObject;
  }

  const fieldPath = parseFieldPathExpression(trimmed);
  if (fieldPath) {
    const owner = resolveObjectForPath(state, fieldPath.root);
    if (owner && owner.fields.has(fieldPath.member)) {
      return owner.fields.get(fieldPath.member);
    }
  }

  const scopedValue = scopeLookup(state, trimmed);
  if (scopedValue !== undefined) {
    return scopedValue;
  }

  if (state.currentSelf?.fields.has(trimmed)) {
    return state.currentSelf.fields.get(trimmed);
  }

  const newArraySizeExpr = parseNewArraySizeExpression(trimmed);
  if (newArraySizeExpr !== null) {
    const size = toArrayIndex(evaluateValue(state, newArraySizeExpr));
    if (size !== null) {
      return Array.from({ length: size }, () => null);
    }
  }

  const arrayLiteral = parseArrayLiteralExpression(trimmed);
  if (arrayLiteral) {
    return arrayLiteral.map((element) => evaluateArrayElement(state, element));
  }

  return trimmed;
}

function evaluateArrayElement(state: VMState, expr: string): unknown {
  const trimmed = expr.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return unescapeQuotedString(trimmed.slice(1, -1));
  }
  return evaluateValue(state, trimmed);
}

function unescapeQuotedString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

export function parseArrayAccessExpression(expr: string): { target: string; index: string } | null {
  const match = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\[(.+)\]$/);
  if (!match) {
    return null;
  }
  return { target: match[1], index: match[2].trim() };
}

function parseNewArraySizeExpression(expr: string): string | null {
  const match = expr.match(/^new\s+[A-Za-z_][A-Za-z0-9_.]*\[(.+)\]$/);
  return match ? match[1].trim() : null;
}

function parseNewInstanceExpression(expr: string): { className: string; args: string[] } | null {
  const match = expr.match(/^new\s+([A-Za-z_][A-Za-z0-9_.]*)\((.*)\)$/);
  if (!match) {
    return null;
  }
  return { className: match[1], args: match[2].trim() ? splitTopLevel(match[2].trim()) : [] };
}

export function parseFieldPathExpression(expr: string): { root: string; member: string } | null {
  const match = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  return match ? { root: match[1], member: match[2] } : null;
}

export function resolveRuntimeObjectByName(state: VMState, name: string): RuntimeObject | null {
  if (name === "this") {
    return state.currentSelf;
  }
  const scopedValue = scopeLookup(state, name);
  if (isRuntimeObject(scopedValue)) {
    return scopedValue;
  }
  const direct = state.objectMap.get(name);
  if (direct) {
    return direct;
  }
  const value = evaluateValue(state, name);
  return isRuntimeObject(value) ? value : null;
}

export function resolveObjectForPath(state: VMState, root: string): RuntimeObject | null {
  return resolveRuntimeObjectByName(state, root);
}

function isRuntimeObject(value: unknown): value is RuntimeObject {
  return typeof value === "object" && value !== null && "typeName" in value && "fields" in value;
}

function evaluateBinaryExpression(state: VMState, expr: string): unknown {
  const precedence = [
    ["||"],
    ["&&"],
    ["==", "!=", "<=", ">=", "<", ">"],
    [".."],
    ["+", "-"],
    ["*", "/", "%"],
  ];
  for (const operators of precedence) {
    const split = splitByOperators(expr, operators);
    if (!split) {
      continue;
    }
    const left = evaluateValue(state, split.left);
    const right = evaluateValue(state, split.right);
    return applyBinaryOperator(split.operator, left, right);
  }
  return undefined;
}

function splitByOperators(source: string, operators: string[]): { left: string; operator: string; right: string } | null {
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const prev = index > 0 ? source[index - 1] : "";
    if (quote) {
      if (char === quote && prev !== "\\") {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      depth += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth !== 0) {
      continue;
    }
    for (const operator of operators) {
      if (source.startsWith(operator, index)) {
        return {
          left: source.slice(0, index).trim(),
          operator,
          right: source.slice(index + operator.length).trim(),
        };
      }
    }
  }
  return null;
}

function applyBinaryOperator(operator: string, left: unknown, right: unknown): unknown {
  switch (operator) {
    case "||":
      return Boolean(left === true || left === "true" || right === true || right === "true");
    case "&&":
      return Boolean((left === true || left === "true") && (right === true || right === "true"));
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case "<":
      return numericValue(left) < numericValue(right);
    case ">":
      return numericValue(left) > numericValue(right);
    case "<=":
      return numericValue(left) <= numericValue(right);
    case ">=":
      return numericValue(left) >= numericValue(right);
    case "..":
      return `${valueToString(left)}${valueToString(right)}`;
    case "+": {
      const leftNumber = maybeNumber(left);
      const rightNumber = maybeNumber(right);
      return leftNumber !== null && rightNumber !== null
        ? String(leftNumber + rightNumber)
        : `${valueToString(left)}${valueToString(right)}`;
    }
    case "-":
      return String(numericValue(left) - numericValue(right));
    case "*":
      return String(numericValue(left) * numericValue(right));
    case "/": {
      const divisor = numericValue(right);
      if (divisor === 0) {
        throw new TypeError("division by zero");
      }
      return String(numericValue(left) / divisor);
    }
    case "%": {
      const divisor = numericValue(right);
      if (divisor === 0) {
        throw new TypeError("division by zero");
      }
      return String(numericValue(left) % divisor);
    }
    default:
      return undefined;
  }
}

function maybeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function numericValue(value: unknown): number {
  return maybeNumber(value) ?? 0;
}

function instantiateAnonymousObject(state: VMState, className: string, args: string[]): RuntimeObject {
  const runtimeObject: RuntimeObject = {
    name: `${className}#${state.objectMap.size + 1}`,
    typeName: className,
    fields: new Map(),
    source: { name: className, typeName: className, resourceType: null, position: null, orientation: null, size: null },
  };
  initializeRuntimeObject(runtimeObject, state, args);
  return runtimeObject;
}

function parseArrayLiteralExpression(expr: string): string[] | null {
  if (
    !((expr.startsWith("[") && expr.endsWith("]")) ||
      (expr.startsWith("{") && expr.endsWith("}")))
  ) {
    return null;
  }
  const inner = expr.slice(1, -1).trim();
  if (!inner) {
    return [];
  }
  return splitTopLevel(inner);
}

function splitTopLevel(source: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const prev = i > 0 ? source[i - 1] : "";

    if (quote) {
      current += ch;
      if (ch === quote && prev !== "\\") {
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === "[" || ch === "{" || ch === "(") {
      depth++;
      current += ch;
      continue;
    }

    if (ch === "]" || ch === "}" || ch === ")") {
      depth = Math.max(0, depth - 1);
      current += ch;
      continue;
    }

    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

export function toArrayIndex(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(numeric) || numeric < 0) {
    return null;
  }
  return numeric;
}

export function valueToString(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => valueToString(entry)).join(", ")}]`;
  }
  if (value instanceof Map) {
    return `{${[...value.entries()].map(([key, entry]) => `${key}: ${valueToString(entry)}`).join(", ")}}`;
  }
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return String(value);
}
