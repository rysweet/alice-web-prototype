// ═══════════════════════════════════════════════════════════════════════════
// tweedle-type-system.ts — Full type hierarchy with assignability checks
//
// Provides: TypeHierarchy with discriminated-union type nodes (AbstractType),
// matching Java AbstractType/JavaType/UserType patterns.
// Pure computation, no I/O, no external dependencies beyond tweedle-parser.
// ═══════════════════════════════════════════════════════════════════════════

import type { ClassDecl, MethodDecl, FieldDecl } from "./tweedle-parser.js";

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

export type TypeKind = "primitive" | "java" | "user";

export interface PrimitiveType {
  readonly kind: "primitive";
  readonly name: string;
  isAssignableTo(target: AbstractType): boolean;
}

export interface JavaType {
  readonly kind: "java";
  readonly name: string;
  readonly superType: JavaType | null;
  isAssignableTo(target: AbstractType): boolean;
}

export interface UserType {
  readonly kind: "user";
  readonly name: string;
  readonly superType: JavaType | UserType | null;
  readonly classDecl: ClassDecl;
  readonly methods: MethodDecl[];
  readonly fields: FieldDecl[];
  isAssignableTo(target: AbstractType): boolean;
}

export type AbstractType = PrimitiveType | JavaType | UserType;

export interface TypeHierarchy {
  resolve(name: string): AbstractType | null;
  allTypes(): AbstractType[];
  isAssignableTo(source: AbstractType, target: AbstractType): boolean;
  supertypesOf(type: AbstractType): AbstractType[];
}

// ── Built-in Type Registry ───────────────────────────────────────────────

const PRIMITIVE_NAMES = new Set([
  "DecimalNumber",
  "WholeNumber",
  "TextString",
  "Boolean",
]);

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

export function createTypeHierarchy(classes: ClassDecl[]): TypeHierarchy {
  const typeMap = new Map<string, AbstractType>();
  const publicTypes: AbstractType[] = [];

  // ── 1. Register primitives ─────────────────────────────────────────
  for (const name of PRIMITIVE_NAMES) {
    const prim: PrimitiveType = {
      kind: "primitive",
      name,
      isAssignableTo: null!,
    };
    typeMap.set(name, prim);
    publicTypes.push(prim);
  }

  // ── 2. Register built-in entity types ──────────────────────────────
  for (const entry of BUILTIN_HIERARCHY) {
    const jt: JavaType = {
      kind: "java",
      name: entry.name,
      superType: null!,
      isAssignableTo: null!,
    };
    typeMap.set(entry.name, jt);
    publicTypes.push(jt);
  }

  // Link java type superType pointers
  for (const entry of BUILTIN_HIERARCHY) {
    if (entry.superClass) {
      (typeMap.get(entry.name) as any).superType =
        typeMap.get(entry.superClass) as JavaType;
    } else {
      (typeMap.get(entry.name) as any).superType = null;
    }
  }

  // ── 3. Register null type (resolvable but not in allTypes) ─────────
  const nullType: JavaType = {
    kind: "java",
    name: "null",
    superType: null,
    isAssignableTo: null!,
  };
  typeMap.set("null", nullType);

  // ── 4. Register user classes ───────────────────────────────────────
  for (const cls of classes) {
    if (typeMap.has(cls.name)) {
      throw new TweedleTypeError(
        `Type '${cls.name}' is already defined`,
        cls.name,
        "duplicate class",
      );
    }
    const ut: UserType = {
      kind: "user",
      name: cls.name,
      superType: null!,
      classDecl: cls,
      methods: cls.methods,
      fields: cls.fields,
      isAssignableTo: null!,
    };
    typeMap.set(cls.name, ut);
    publicTypes.push(ut);
  }

  // ── 5. Detect inheritance cycles ───────────────────────────────────
  const verified = new Set<string>();
  for (const cls of classes) {
    const visited = new Set<string>();
    let current: string | null = cls.name;
    while (current !== null && !verified.has(current)) {
      if (visited.has(current)) {
        throw new TweedleTypeError(
          `Inheritance cycle detected involving '${current}'`,
          current,
          "cycle",
        );
      }
      visited.add(current);
      const type = typeMap.get(current);
      if (!type) break;
      if (type.kind === "user") {
        current = type.classDecl.superClass;
      } else {
        // Reached a built-in or primitive — no cycle possible
        break;
      }
    }
    for (const name of visited) verified.add(name);
  }

  // ── 6. Link user type superType pointers ───────────────────────────
  for (const cls of classes) {
    if (cls.superClass) {
      const parent = typeMap.get(cls.superClass) ?? null;
      (typeMap.get(cls.name) as any).superType = parent;
    } else {
      (typeMap.get(cls.name) as any).superType = null;
    }
  }

  // ── 7. Assignability logic ─────────────────────────────────────────
  function hierarchyIsAssignableTo(
    source: AbstractType,
    target: AbstractType,
  ): boolean {
    if (source === target) return true;

    // null → non-primitive
    if (source.name === "null") {
      return target.kind !== "primitive";
    }

    // Numeric widening: WholeNumber → DecimalNumber
    if (source.name === "WholeNumber" && target.name === "DecimalNumber") {
      return true;
    }

    // Primitives: only identity (already checked above)
    if (source.kind === "primitive") return false;

    // Walk supertype chain for java/user types
    let cur: JavaType | UserType | null = source.superType;
    while (cur !== null) {
      if (cur === target) return true;
      cur = cur.superType;
    }
    return false;
  }

  // ── 8. Attach isAssignableTo method to every type node ─────────────
  for (const type of typeMap.values()) {
    (type as any).isAssignableTo = (target: AbstractType): boolean =>
      hierarchyIsAssignableTo(type, target);
  }

  // ── 9. supertypesOf ────────────────────────────────────────────────
  function supertypesOf(type: AbstractType): AbstractType[] {
    if (type.kind === "primitive") {
      if (type.name === "WholeNumber") {
        return [type, typeMap.get("DecimalNumber")!];
      }
      return [type];
    }

    const chain: AbstractType[] = [];
    let cur: JavaType | UserType | null = type;
    while (cur !== null) {
      chain.push(cur);
      cur = cur.superType;
    }
    return chain;
  }

  // ── Return TypeHierarchy ───────────────────────────────────────────
  return {
    resolve(name: string): AbstractType | null {
      return typeMap.get(name) ?? null;
    },
    allTypes(): AbstractType[] {
      return [...publicTypes];
    },
    isAssignableTo: hierarchyIsAssignableTo,
    supertypesOf,
  };
}
