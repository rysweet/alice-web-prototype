// ═══════════════════════════════════════════════════════════════════════════
// tweedle-typechecker.ts — Type resolution and assignability for Tweedle AST
//
// Provides: TypeEnvironment with resolveType, isAssignableTo, checkMethodCall.
// Pure computation, no I/O, no external dependencies.
// ═══════════════════════════════════════════════════════════════════════════

import type { ClassDecl, TypeRef, MethodDecl } from "./tweedle-parser.js";

// ── Error Class ──────────────────────────────────────────────────────────

export class TweedleTypeError extends Error {
  constructor(
    message: string,
    public readonly typeName: string,
    public readonly detail: string,
  ) {
    super(message);
    this.name = "TweedleTypeError";
  }
}

// ── Public Types ─────────────────────────────────────────────────────────

export interface ResolvedType {
  name: string;
  superClass: string | null;
  isPrimitive: boolean;
  methods: MethodDecl[];
  classDecl: ClassDecl | null;
}

export interface MethodCallResult {
  valid: boolean;
  errors: string[];
  returnType: TypeRef | null;
}

export interface TypeEnvironment {
  resolveType(name: string): ResolvedType | null;
  isAssignableTo(source: string, target: string): boolean;
  checkMethodCall(
    className: string,
    methodName: string,
    argTypes: string[],
  ): MethodCallResult;
}

// ── Built-in Type Registry ───────────────────────────────────────────────

const PRIMITIVES = new Set(["DecimalNumber", "WholeNumber", "TextString", "Boolean"]);

interface BuiltinEntry {
  name: string;
  superClass: string | null;
}

const BUILTIN_HIERARCHY: BuiltinEntry[] = [
  { name: "SThing", superClass: null },
  { name: "SGround", superClass: "SThing" },
  { name: "SScene", superClass: "SThing" },
  { name: "STurnable", superClass: "SThing" },
  { name: "SMovableTurnable", superClass: "STurnable" },
  { name: "SCamera", superClass: "SMovableTurnable" },
  { name: "SModel", superClass: "SMovableTurnable" },
  { name: "SJointedModel", superClass: "SModel" },
  { name: "SBiped", superClass: "SJointedModel" },
  { name: "SFlyer", superClass: "SJointedModel" },
  { name: "SQuadruped", superClass: "SJointedModel" },
  { name: "SProp", superClass: "SJointedModel" },
];

// ── Factory ──────────────────────────────────────────────────────────────

export function createTypeEnvironment(classes: ClassDecl[]): TypeEnvironment {
  const registry = new Map<string, ResolvedType>();

  // Register primitives
  for (const name of PRIMITIVES) {
    registry.set(name, {
      name,
      superClass: null,
      isPrimitive: true,
      methods: [],
      classDecl: null,
    });
  }

  // Register built-in class hierarchy
  for (const entry of BUILTIN_HIERARCHY) {
    registry.set(entry.name, {
      name: entry.name,
      superClass: entry.superClass,
      isPrimitive: false,
      methods: [],
      classDecl: null,
    });
  }

  // Register user-defined classes — check for duplicates
  for (const cls of classes) {
    if (registry.has(cls.name)) {
      throw new TweedleTypeError(
        `Duplicate class name '${cls.name}'`,
        cls.name,
        "duplicate class",
      );
    }
    registry.set(cls.name, {
      name: cls.name,
      superClass: cls.superClass,
      isPrimitive: false,
      methods: cls.methods,
      classDecl: cls,
    });
  }

  // Detect inheritance cycles
  for (const cls of classes) {
    const visited = new Set<string>();
    let current: string | null = cls.name;
    while (current !== null) {
      if (visited.has(current)) {
        throw new TweedleTypeError(
          `Inheritance cycle detected involving '${current}'`,
          current,
          "cycle",
        );
      }
      visited.add(current);
      const resolved = registry.get(current);
      current = resolved?.superClass ?? null;
    }
  }

  return {
    resolveType(name: string): ResolvedType | null {
      return registry.get(name) ?? null;
    },

    isAssignableTo(source: string, target: string): boolean {
      if (source === target) return true;

      // null is assignable to any class type but not primitives
      if (source === "null") {
        const targetType = registry.get(target);
        if (!targetType) return false;
        return !targetType.isPrimitive;
      }

      // WholeNumber → DecimalNumber widening
      if (source === "WholeNumber" && target === "DecimalNumber") return true;

      // Walk the inheritance chain
      const sourceType = registry.get(source);
      if (!sourceType) return false;
      if (sourceType.isPrimitive) return false;

      const targetType = registry.get(target);
      if (!targetType) return false;

      let current: string | null = sourceType.superClass;
      const visited = new Set<string>([source]);
      while (current !== null) {
        if (current === target) return true;
        if (visited.has(current)) return false;
        visited.add(current);
        const resolved = registry.get(current);
        current = resolved?.superClass ?? null;
      }

      return false;
    },

    checkMethodCall(
      className: string,
      methodName: string,
      argTypes: string[],
    ): MethodCallResult {
      const classType = registry.get(className);
      if (!classType) {
        return {
          valid: false,
          errors: [`Unknown class '${className}'`],
          returnType: null,
        };
      }

      // Search for method in class and its ancestors
      let method: MethodDecl | null = null;
      let current: string | null = className;
      const visited = new Set<string>();

      while (current !== null && !method) {
        if (visited.has(current)) break;
        visited.add(current);

        const resolved = registry.get(current);
        if (!resolved) break;

        const found = resolved.methods.find((m) => m.name === methodName);
        if (found) {
          method = found;
          break;
        }
        current = resolved.superClass;
      }

      if (!method) {
        return {
          valid: false,
          errors: [`Method '${methodName}' not found on class '${className}'`],
          returnType: null,
        };
      }

      const errors: string[] = [];

      // Check argument count
      if (argTypes.length !== method.parameters.length) {
        errors.push(
          `Expected ${method.parameters.length} argument(s) for '${methodName}', got ${argTypes.length}`,
        );
        return { valid: false, errors, returnType: null };
      }

      // Check argument types
      for (let i = 0; i < argTypes.length; i++) {
        const param = method.parameters[i];
        const paramTypeName =
          param.paramType.type === "SimpleTypeRef"
            ? param.paramType.name
            : param.paramType.type === "VoidTypeRef"
              ? "void"
              : "unknown";

        if (!this.isAssignableTo(argTypes[i], paramTypeName)) {
          errors.push(
            `Argument ${i + 1}: '${argTypes[i]}' is not assignable to '${paramTypeName}'`,
          );
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, returnType: null };
      }

      return { valid: true, errors: [], returnType: method.returnType };
    },
  };
}
