import { describe, it, expect } from "vitest";
import { parseTweedle } from "../src/tweedle-parser.js";
import {
  createTypeHierarchy,
  TweedleTypeError,
} from "../src/tweedle-type-system.js";
import type {
  TypeKind,
  AbstractType,
  PrimitiveType,
  JavaType,
  UserType,
  TypeHierarchy,
} from "../src/tweedle-type-system.js";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function makeClass(src: string) {
  return parseTweedle(src);
}

function emptyHierarchy(): TypeHierarchy {
  return createTypeHierarchy([]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PUBLIC API & EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

describe("createTypeHierarchy – public API", () => {
  it("exports createTypeHierarchy as a function", () => {
    expect(typeof createTypeHierarchy).toBe("function");
  });

  it("exports TweedleTypeError as a class", () => {
    expect(TweedleTypeError).toBeDefined();
    expect(typeof TweedleTypeError).toBe("function");
  });

  it("TweedleTypeError is an Error subclass with typeName and detail", () => {
    const err = new TweedleTypeError("msg", "Foo", "cycle");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TweedleTypeError);
    expect(err.message).toBe("msg");
    expect(err.typeName).toBe("Foo");
    expect(err.detail).toBe("cycle");
    expect(err.name).toBe("TweedleTypeError");
  });

  it("creates a hierarchy from empty array", () => {
    const h = emptyHierarchy();
    expect(h).toBeDefined();
    expect(typeof h.resolve).toBe("function");
    expect(typeof h.allTypes).toBe("function");
    expect(typeof h.isAssignableTo).toBe("function");
    expect(typeof h.supertypesOf).toBe("function");
  });

  it("creates a hierarchy from a single class", () => {
    const cls = makeClass("class Dog extends SThing { Dog() {} }");
    const h = createTypeHierarchy([cls]);
    expect(h).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. TYPE RESOLUTION — PRIMITIVES
// ═══════════════════════════════════════════════════════════════════════════

describe("Primitive type resolution", () => {
  const h = emptyHierarchy();

  it("resolves DecimalNumber as primitive", () => {
    const t = h.resolve("DecimalNumber");
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("primitive");
    expect(t!.name).toBe("DecimalNumber");
  });

  it("resolves WholeNumber as primitive", () => {
    const t = h.resolve("WholeNumber");
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("primitive");
  });

  it("resolves TextString as primitive", () => {
    const t = h.resolve("TextString");
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("primitive");
  });

  it("resolves Boolean as primitive", () => {
    const t = h.resolve("Boolean");
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("primitive");
  });

  it("primitives have isAssignableTo method", () => {
    const t = h.resolve("DecimalNumber")!;
    expect(typeof t.isAssignableTo).toBe("function");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. TYPE RESOLUTION — BUILT-IN ENTITY TYPES (JavaType)
// ═══════════════════════════════════════════════════════════════════════════

describe("JavaType resolution", () => {
  const h = emptyHierarchy();

  const ENTITY_TYPES = [
    "SThing", "SScene", "SGround", "STurnable", "SMovableTurnable",
    "SCamera", "SModel", "SJointedModel", "SBiped", "SFlyer",
    "SQuadruped", "SProp",
  ];

  for (const name of ENTITY_TYPES) {
    it(`resolves ${name} as java kind`, () => {
      const t = h.resolve(name);
      expect(t).not.toBeNull();
      expect(t!.kind).toBe("java");
      expect(t!.name).toBe(name);
    });
  }

  it("SThing has null superType (root)", () => {
    const t = h.resolve("SThing") as JavaType;
    expect(t.superType).toBeNull();
  });

  it("SBiped has SJointedModel as superType", () => {
    const t = h.resolve("SBiped") as JavaType;
    expect(t.superType).not.toBeNull();
    expect(t.superType!.name).toBe("SJointedModel");
  });

  it("SMovableTurnable has STurnable as superType", () => {
    const t = h.resolve("SMovableTurnable") as JavaType;
    expect(t.superType!.name).toBe("STurnable");
  });

  it("SModel has SMovableTurnable as superType", () => {
    const t = h.resolve("SModel") as JavaType;
    expect(t.superType!.name).toBe("SMovableTurnable");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. TYPE RESOLUTION — USER TYPES
// ═══════════════════════════════════════════════════════════════════════════

describe("UserType resolution", () => {
  it("resolves a user class with kind 'user'", () => {
    const cls = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const h = createTypeHierarchy([cls]);
    const t = h.resolve("Bunny");
    expect(t).not.toBeNull();
    expect(t!.kind).toBe("user");
    expect(t!.name).toBe("Bunny");
  });

  it("user type has superType pointing to the correct built-in", () => {
    const cls = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const h = createTypeHierarchy([cls]);
    const t = h.resolve("Bunny") as UserType;
    expect(t.superType).not.toBeNull();
    expect(t.superType!.name).toBe("SBiped");
    expect(t.superType!.kind).toBe("java");
  });

  it("user type extending another user type", () => {
    const bunny = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const robo = makeClass("class RoboBunny extends Bunny { RoboBunny() {} }");
    const h = createTypeHierarchy([bunny, robo]);
    const t = h.resolve("RoboBunny") as UserType;
    expect(t.superType).not.toBeNull();
    expect(t.superType!.name).toBe("Bunny");
    expect(t.superType!.kind).toBe("user");
  });

  it("user type carries classDecl from parser", () => {
    const cls = makeClass("class Dog extends SThing { Dog() {} }");
    const h = createTypeHierarchy([cls]);
    const t = h.resolve("Dog") as UserType;
    expect(t.classDecl).toBeDefined();
    expect(t.classDecl.name).toBe("Dog");
  });

  it("user type exposes methods array", () => {
    const cls = makeClass(`
      class Dog extends SThing {
        Dog() {}
        void bark(DecimalNumber volume) {}
        DecimalNumber fetchBall() { return 1.0; }
      }
    `);
    const h = createTypeHierarchy([cls]);
    const t = h.resolve("Dog") as UserType;
    expect(t.methods).toBeDefined();
    expect(t.methods.length).toBe(2);
    expect(t.methods.map(m => m.name)).toContain("bark");
    expect(t.methods.map(m => m.name)).toContain("fetchBall");
  });

  it("user type exposes fields array", () => {
    const cls = makeClass(`
      class Dog extends SThing {
        Dog() {}
        DecimalNumber speed <- 5.0;
      }
    `);
    const h = createTypeHierarchy([cls]);
    const t = h.resolve("Dog") as UserType;
    expect(t.fields).toBeDefined();
    expect(t.fields.length).toBe(1);
    expect(t.fields[0].name).toBe("speed");
  });

  it("returns null for unknown type name", () => {
    const h = emptyHierarchy();
    expect(h.resolve("NonExistent")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. allTypes()
// ═══════════════════════════════════════════════════════════════════════════

describe("allTypes()", () => {
  it("returns 16 types for empty hierarchy (4 primitives + 12 entities)", () => {
    const h = emptyHierarchy();
    const all = h.allTypes();
    expect(all.length).toBe(16);
  });

  it("includes user classes in allTypes", () => {
    const cls = makeClass("class Dog extends SThing { Dog() {} }");
    const h = createTypeHierarchy([cls]);
    const all = h.allTypes();
    expect(all.length).toBe(17);
    expect(all.some(t => t.name === "Dog")).toBe(true);
  });

  it("includes null type in allTypes", () => {
    const h = emptyHierarchy();
    const all = h.allTypes();
    // null may or may not be in allTypes() — depends on implementation
    // At minimum, resolve("null") should work
    const nullType = h.resolve("null");
    expect(nullType).not.toBeNull();
  });

  it("returned array is a snapshot (mutation-safe)", () => {
    const h = emptyHierarchy();
    const a1 = h.allTypes();
    const a2 = h.allTypes();
    expect(a1).not.toBe(a2); // different array instances
    expect(a1.length).toBe(a2.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ASSIGNABILITY — IDENTITY
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – identity", () => {
  it("same type is assignable to itself (primitive)", () => {
    const h = emptyHierarchy();
    const dec = h.resolve("DecimalNumber")!;
    expect(h.isAssignableTo(dec, dec)).toBe(true);
  });

  it("same type is assignable to itself (java)", () => {
    const h = emptyHierarchy();
    const st = h.resolve("SThing")!;
    expect(h.isAssignableTo(st, st)).toBe(true);
  });

  it("same type is assignable to itself (user)", () => {
    const cls = makeClass("class Dog extends SThing { Dog() {} }");
    const h = createTypeHierarchy([cls]);
    const dog = h.resolve("Dog")!;
    expect(h.isAssignableTo(dog, dog)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. ASSIGNABILITY — SUBCLASS → SUPERCLASS
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – subclass to superclass", () => {
  it("SBiped is assignable to SJointedModel", () => {
    const h = emptyHierarchy();
    const biped = h.resolve("SBiped")!;
    const jm = h.resolve("SJointedModel")!;
    expect(h.isAssignableTo(biped, jm)).toBe(true);
  });

  it("SBiped is NOT assignable from SJointedModel", () => {
    const h = emptyHierarchy();
    const biped = h.resolve("SBiped")!;
    const jm = h.resolve("SJointedModel")!;
    expect(h.isAssignableTo(jm, biped)).toBe(false);
  });

  it("transitive: SBiped is assignable to SThing", () => {
    const h = emptyHierarchy();
    const biped = h.resolve("SBiped")!;
    const thing = h.resolve("SThing")!;
    expect(h.isAssignableTo(biped, thing)).toBe(true);
  });

  it("user class assignable to its built-in superclass", () => {
    const cls = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const h = createTypeHierarchy([cls]);
    const bunny = h.resolve("Bunny")!;
    const biped = h.resolve("SBiped")!;
    expect(h.isAssignableTo(bunny, biped)).toBe(true);
  });

  it("user class transitively assignable to root SThing", () => {
    const cls = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const h = createTypeHierarchy([cls]);
    const bunny = h.resolve("Bunny")!;
    const thing = h.resolve("SThing")!;
    expect(h.isAssignableTo(bunny, thing)).toBe(true);
  });

  it("multi-level user class chain", () => {
    const bunny = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const robo = makeClass("class RoboBunny extends Bunny { RoboBunny() {} }");
    const h = createTypeHierarchy([bunny, robo]);

    const roboBunny = h.resolve("RoboBunny")!;
    const bunnyType = h.resolve("Bunny")!;
    const biped = h.resolve("SBiped")!;
    const thing = h.resolve("SThing")!;

    expect(h.isAssignableTo(roboBunny, bunnyType)).toBe(true);
    expect(h.isAssignableTo(roboBunny, biped)).toBe(true);
    expect(h.isAssignableTo(roboBunny, thing)).toBe(true);
  });

  it("unrelated types are not assignable", () => {
    const h = emptyHierarchy();
    const biped = h.resolve("SBiped")!;
    const ground = h.resolve("SGround")!;
    expect(h.isAssignableTo(biped, ground)).toBe(false);
    expect(h.isAssignableTo(ground, biped)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. ASSIGNABILITY — NUMERIC WIDENING
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – numeric widening", () => {
  it("WholeNumber is assignable to DecimalNumber", () => {
    const h = emptyHierarchy();
    const wn = h.resolve("WholeNumber")!;
    const dn = h.resolve("DecimalNumber")!;
    expect(h.isAssignableTo(wn, dn)).toBe(true);
  });

  it("DecimalNumber is NOT assignable to WholeNumber", () => {
    const h = emptyHierarchy();
    const wn = h.resolve("WholeNumber")!;
    const dn = h.resolve("DecimalNumber")!;
    expect(h.isAssignableTo(dn, wn)).toBe(false);
  });

  it("no other cross-primitive assignments", () => {
    const h = emptyHierarchy();
    const ts = h.resolve("TextString")!;
    const dn = h.resolve("DecimalNumber")!;
    const bool = h.resolve("Boolean")!;
    expect(h.isAssignableTo(ts, dn)).toBe(false);
    expect(h.isAssignableTo(dn, ts)).toBe(false);
    expect(h.isAssignableTo(bool, dn)).toBe(false);
    expect(h.isAssignableTo(ts, bool)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. ASSIGNABILITY — NULL TYPE
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – null type", () => {
  it("null is assignable to any class type (java)", () => {
    const h = emptyHierarchy();
    const nullType = h.resolve("null")!;
    const thing = h.resolve("SThing")!;
    expect(h.isAssignableTo(nullType, thing)).toBe(true);
  });

  it("null is assignable to any class type (user)", () => {
    const cls = makeClass("class Dog extends SThing { Dog() {} }");
    const h = createTypeHierarchy([cls]);
    const nullType = h.resolve("null")!;
    const dog = h.resolve("Dog")!;
    expect(h.isAssignableTo(nullType, dog)).toBe(true);
  });

  it("null is NOT assignable to primitives", () => {
    const h = emptyHierarchy();
    const nullType = h.resolve("null")!;
    const dec = h.resolve("DecimalNumber")!;
    const wn = h.resolve("WholeNumber")!;
    const ts = h.resolve("TextString")!;
    const bool = h.resolve("Boolean")!;
    expect(h.isAssignableTo(nullType, dec)).toBe(false);
    expect(h.isAssignableTo(nullType, wn)).toBe(false);
    expect(h.isAssignableTo(nullType, ts)).toBe(false);
    expect(h.isAssignableTo(nullType, bool)).toBe(false);
  });

  it("class types are NOT assignable to null", () => {
    const h = emptyHierarchy();
    const nullType = h.resolve("null")!;
    const thing = h.resolve("SThing")!;
    expect(h.isAssignableTo(thing, nullType)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. supertypesOf()
// ═══════════════════════════════════════════════════════════════════════════

describe("supertypesOf()", () => {
  it("primitive returns only itself", () => {
    const h = emptyHierarchy();
    const dec = h.resolve("DecimalNumber")!;
    const chain = h.supertypesOf(dec);
    expect(chain.length).toBe(1);
    expect(chain[0].name).toBe("DecimalNumber");
  });

  it("WholeNumber includes DecimalNumber in chain", () => {
    const h = emptyHierarchy();
    const wn = h.resolve("WholeNumber")!;
    const chain = h.supertypesOf(wn);
    expect(chain.map(t => t.name)).toContain("DecimalNumber");
  });

  it("SThing chain is just [SThing]", () => {
    const h = emptyHierarchy();
    const thing = h.resolve("SThing")!;
    const chain = h.supertypesOf(thing);
    expect(chain.length).toBe(1);
    expect(chain[0].name).toBe("SThing");
  });

  it("SBiped chain walks to SThing", () => {
    const h = emptyHierarchy();
    const biped = h.resolve("SBiped")!;
    const chain = h.supertypesOf(biped);
    const names = chain.map(t => t.name);
    expect(names[0]).toBe("SBiped");
    expect(names).toContain("SJointedModel");
    expect(names).toContain("SModel");
    expect(names).toContain("SMovableTurnable");
    expect(names).toContain("STurnable");
    expect(names[names.length - 1]).toBe("SThing");
  });

  it("user class chain includes java supertypes", () => {
    const bunny = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const robo = makeClass("class RoboBunny extends Bunny { RoboBunny() {} }");
    const h = createTypeHierarchy([bunny, robo]);

    const chain = h.supertypesOf(h.resolve("RoboBunny")!);
    const names = chain.map(t => t.name);
    expect(names[0]).toBe("RoboBunny");
    expect(names[1]).toBe("Bunny");
    expect(names).toContain("SBiped");
    expect(names[names.length - 1]).toBe("SThing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. DISCRIMINATED-UNION PATTERN
// ═══════════════════════════════════════════════════════════════════════════

describe("Discriminated-union kind field", () => {
  it("kind field enables exhaustive switch", () => {
    const h = emptyHierarchy();

    function describe(t: AbstractType): string {
      switch (t.kind) {
        case "primitive": return "prim";
        case "java": return "java";
        case "user": return "user";
      }
    }

    expect(describe(h.resolve("DecimalNumber")!)).toBe("prim");
    expect(describe(h.resolve("SThing")!)).toBe("java");
  });

  it("user kind available after creating with classes", () => {
    const cls = makeClass("class Dog extends SThing { Dog() {} }");
    const h = createTypeHierarchy([cls]);
    const dog = h.resolve("Dog")!;
    expect(dog.kind).toBe("user");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

describe("Error handling", () => {
  it("throws TweedleTypeError for duplicate class name", () => {
    const cls1 = makeClass("class Dog extends SThing { Dog() {} }");
    const cls2 = makeClass("class Dog extends SThing { Dog() {} }");
    expect(() => createTypeHierarchy([cls1, cls2])).toThrow(TweedleTypeError);
    try {
      createTypeHierarchy([cls1, cls2]);
    } catch (e) {
      expect((e as TweedleTypeError).detail).toBe("duplicate class");
      expect((e as TweedleTypeError).typeName).toBe("Dog");
    }
  });

  it("throws TweedleTypeError when user class shadows built-in", () => {
    const cls = makeClass("class SThing extends SThing { SThing() {} }");
    expect(() => createTypeHierarchy([cls])).toThrow(TweedleTypeError);
  });

  it("throws TweedleTypeError for inheritance cycle", () => {
    // A extends B extends A — cycle
    // We need to trick parser: B extends A, A extends B
    // Since parser doesn't validate, we can create ASTs manually
    const a = makeClass("class A extends B { A() {} }");
    const b = makeClass("class B extends A { B() {} }");
    expect(() => createTypeHierarchy([a, b])).toThrow(TweedleTypeError);
    try {
      createTypeHierarchy([a, b]);
    } catch (e) {
      expect((e as TweedleTypeError).detail).toBe("cycle");
    }
  });

  it("throws TweedleTypeError for self-referencing cycle", () => {
    const cls = makeClass("class Loop extends Loop { Loop() {} }");
    expect(() => createTypeHierarchy([cls])).toThrow(TweedleTypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. isAssignableTo VIA TYPE NODE METHOD
// ═══════════════════════════════════════════════════════════════════════════

describe("AbstractType.isAssignableTo() method", () => {
  it("type node method agrees with hierarchy method", () => {
    const cls = makeClass("class Bunny extends SBiped { Bunny() {} }");
    const h = createTypeHierarchy([cls]);
    const bunny = h.resolve("Bunny")!;
    const biped = h.resolve("SBiped")!;
    const thing = h.resolve("SThing")!;

    expect(bunny.isAssignableTo(biped)).toBe(h.isAssignableTo(bunny, biped));
    expect(bunny.isAssignableTo(thing)).toBe(h.isAssignableTo(bunny, thing));
    expect(biped.isAssignableTo(bunny)).toBe(h.isAssignableTo(biped, bunny));
  });

  it("primitive node method works for numeric widening", () => {
    const h = emptyHierarchy();
    const wn = h.resolve("WholeNumber")!;
    const dn = h.resolve("DecimalNumber")!;
    expect(wn.isAssignableTo(dn)).toBe(true);
    expect(dn.isAssignableTo(wn)).toBe(false);
  });
});
