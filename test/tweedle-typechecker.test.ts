import { describe, it, expect } from "vitest";
import { parseTweedle } from "../src/tweedle-parser.js";
import {
  createTypeEnvironment,
  TweedleTypeError,
} from "../src/tweedle-typechecker.js";
import type {
  TypeEnvironment,
  MethodCallResult,
  ResolvedType,
} from "../src/tweedle-typechecker.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. PUBLIC API & ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

describe("createTypeEnvironment – public API", () => {
  it("exports createTypeEnvironment as a function", () => {
    expect(typeof createTypeEnvironment).toBe("function");
  });

  it("exports TweedleTypeError as a class", () => {
    expect(TweedleTypeError).toBeDefined();
    expect(typeof TweedleTypeError).toBe("function");
  });

  it("TweedleTypeError is an Error subclass", () => {
    const err = new TweedleTypeError("test", "Foo", "detail");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TweedleTypeError);
  });

  it("TweedleTypeError exposes typeName and detail", () => {
    const err = new TweedleTypeError("msg", "MyClass", "duplicate class");
    expect(err.message).toBe("msg");
    expect(err.typeName).toBe("MyClass");
    expect(err.detail).toBe("duplicate class");
  });

  it("creates an environment from empty array", () => {
    const env = createTypeEnvironment([]);
    expect(env).toBeDefined();
  });

  it("creates an environment from a single class", () => {
    const cls = parseTweedle("class Foo extends SThing { Foo() {} }");
    const env = createTypeEnvironment([cls]);
    expect(env).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. BUILT-IN TYPES
// ═══════════════════════════════════════════════════════════════════════════

describe("Built-in types", () => {
  it("resolves DecimalNumber", () => {
    const env = createTypeEnvironment([]);
    const t = env.resolveType("DecimalNumber");
    expect(t).not.toBeNull();
    expect(t!.name).toBe("DecimalNumber");
  });

  it("resolves WholeNumber", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("WholeNumber")).not.toBeNull();
  });

  it("resolves TextString", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("TextString")).not.toBeNull();
  });

  it("resolves Boolean", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("Boolean")).not.toBeNull();
  });

  it("resolves SThing", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SThing")).not.toBeNull();
  });

  it("resolves SScene", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SScene")).not.toBeNull();
  });

  it("resolves SGround", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SGround")).not.toBeNull();
  });

  it("resolves STurnable", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("STurnable")).not.toBeNull();
  });

  it("resolves SMovableTurnable", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SMovableTurnable")).not.toBeNull();
  });

  it("resolves SCamera", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SCamera")).not.toBeNull();
  });

  it("resolves SModel", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SModel")).not.toBeNull();
  });

  it("resolves SJointedModel", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SJointedModel")).not.toBeNull();
  });

  it("resolves SBiped", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SBiped")).not.toBeNull();
  });

  it("resolves SFlyer", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SFlyer")).not.toBeNull();
  });

  it("resolves SQuadruped", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SQuadruped")).not.toBeNull();
  });

  it("resolves SProp", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("SProp")).not.toBeNull();
  });

  it("returns null for unknown type", () => {
    const env = createTypeEnvironment([]);
    expect(env.resolveType("NoSuchType")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. TYPE RESOLUTION — user-defined classes
// ═══════════════════════════════════════════════════════════════════════════

describe("Type resolution (user-defined classes)", () => {
  it("resolves a user-defined class", () => {
    const cls = parseTweedle("class Bunny extends SBiped { Bunny() {} }");
    const env = createTypeEnvironment([cls]);
    const resolved = env.resolveType("Bunny");
    expect(resolved).not.toBeNull();
    expect(resolved!.name).toBe("Bunny");
  });

  it("resolved type has superClass", () => {
    const cls = parseTweedle("class Bunny extends SBiped { Bunny() {} }");
    const env = createTypeEnvironment([cls]);
    const resolved = env.resolveType("Bunny");
    expect(resolved!.superClass).toBe("SBiped");
  });

  it("resolves multiple user-defined classes", () => {
    const a = parseTweedle("class Animal extends SThing { Animal() {} }");
    const b = parseTweedle("class Dog extends Animal { Dog() {} }");
    const env = createTypeEnvironment([a, b]);
    expect(env.resolveType("Animal")).not.toBeNull();
    expect(env.resolveType("Dog")).not.toBeNull();
  });

  it("resolves user class extending another user class", () => {
    const a = parseTweedle("class Animal extends SThing { Animal() {} }");
    const b = parseTweedle("class Dog extends Animal { Dog() {} }");
    const env = createTypeEnvironment([a, b]);
    const dog = env.resolveType("Dog");
    expect(dog!.superClass).toBe("Animal");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. ASSIGNABILITY — same type
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – same type", () => {
  it("same class is assignable to itself", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "SBiped")).toBe(true);
  });

  it("same primitive is assignable to itself", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("DecimalNumber", "DecimalNumber")).toBe(true);
  });

  it("TextString is assignable to itself", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("TextString", "TextString")).toBe(true);
  });

  it("Boolean is assignable to itself", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("Boolean", "Boolean")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. ASSIGNABILITY — subclass → superclass
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – subclass → superclass", () => {
  it("SBiped → SThing (transitive)", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "SThing")).toBe(true);
  });

  it("SBiped → SJointedModel", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "SJointedModel")).toBe(true);
  });

  it("SBiped → SModel", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "SModel")).toBe(true);
  });

  it("SBiped → SMovableTurnable", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "SMovableTurnable")).toBe(true);
  });

  it("SBiped → STurnable", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "STurnable")).toBe(true);
  });

  it("SCamera → SMovableTurnable", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SCamera", "SMovableTurnable")).toBe(true);
  });

  it("user-defined class → built-in superclass", () => {
    const cls = parseTweedle("class Bunny extends SBiped { Bunny() {} }");
    const env = createTypeEnvironment([cls]);
    expect(env.isAssignableTo("Bunny", "SBiped")).toBe(true);
    expect(env.isAssignableTo("Bunny", "SThing")).toBe(true);
  });

  it("user chain: Puppy → Dog → Animal → SThing", () => {
    const animal = parseTweedle("class Animal extends SThing { Animal() {} }");
    const dog = parseTweedle("class Dog extends Animal { Dog() {} }");
    const puppy = parseTweedle("class Puppy extends Dog { Puppy() {} }");
    const env = createTypeEnvironment([animal, dog, puppy]);
    expect(env.isAssignableTo("Puppy", "Dog")).toBe(true);
    expect(env.isAssignableTo("Puppy", "Animal")).toBe(true);
    expect(env.isAssignableTo("Puppy", "SThing")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. ASSIGNABILITY — superclass → subclass (NOT allowed)
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – superclass → subclass (rejected)", () => {
  it("SThing → SBiped is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SThing", "SBiped")).toBe(false);
  });

  it("SModel → SBiped is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SModel", "SBiped")).toBe(false);
  });

  it("SBiped → SFlyer is false (siblings)", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "SFlyer")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. ASSIGNABILITY — null
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – null", () => {
  it("null → class type is true", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("null", "SBiped")).toBe(true);
  });

  it("null → SThing is true", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("null", "SThing")).toBe(true);
  });

  it("null → user-defined class is true", () => {
    const cls = parseTweedle("class Bunny extends SBiped { Bunny() {} }");
    const env = createTypeEnvironment([cls]);
    expect(env.isAssignableTo("null", "Bunny")).toBe(true);
  });

  it("null → DecimalNumber is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("null", "DecimalNumber")).toBe(false);
  });

  it("null → WholeNumber is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("null", "WholeNumber")).toBe(false);
  });

  it("null → TextString is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("null", "TextString")).toBe(false);
  });

  it("null → Boolean is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("null", "Boolean")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. ASSIGNABILITY — WholeNumber / DecimalNumber
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – numeric widening", () => {
  it("WholeNumber → DecimalNumber is true (widening)", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("WholeNumber", "DecimalNumber")).toBe(true);
  });

  it("DecimalNumber → WholeNumber is false (narrowing)", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("DecimalNumber", "WholeNumber")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. ASSIGNABILITY — unknown types
// ═══════════════════════════════════════════════════════════════════════════

describe("isAssignableTo – unknown types", () => {
  it("unknown source → known target is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("Foo", "SBiped")).toBe(false);
  });

  it("known source → unknown target is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("SBiped", "Bar")).toBe(false);
  });

  it("unknown source → unknown target is false", () => {
    const env = createTypeEnvironment([]);
    expect(env.isAssignableTo("Foo", "Bar")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. METHOD CALL VALIDATION — valid calls
// ═══════════════════════════════════════════════════════════════════════════

describe("checkMethodCall – valid calls", () => {
  it("validates a zero-arg void method", () => {
    const cls = parseTweedle(`
      class MyScene extends SScene {
        MyScene() {}
        void doStuff() {
          doInOrder {}
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("MyScene", "doStuff", []);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.returnType).toEqual({ type: "VoidTypeRef" });
  });

  it("validates a method with matching arg types", () => {
    const cls = parseTweedle(`
      class Calc extends SThing {
        Calc() {}
        DecimalNumber add(DecimalNumber a, DecimalNumber b) {
          return a + b;
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("Calc", "add", [
      "DecimalNumber",
      "DecimalNumber",
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates subtype argument (WholeNumber where DecimalNumber expected)", () => {
    const cls = parseTweedle(`
      class Calc extends SThing {
        Calc() {}
        DecimalNumber square(DecimalNumber x) {
          return x * x;
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("Calc", "square", ["WholeNumber"]);
    expect(result.valid).toBe(true);
  });

  it("returns the method's return type", () => {
    const cls = parseTweedle(`
      class Greeter extends SThing {
        Greeter() {}
        TextString greet() {
          return "hi";
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("Greeter", "greet", []);
    expect(result.valid).toBe(true);
    expect(result.returnType).toEqual({
      type: "SimpleTypeRef",
      name: "TextString",
      isArray: false,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. METHOD CALL VALIDATION — errors
// ═══════════════════════════════════════════════════════════════════════════

describe("checkMethodCall – errors", () => {
  it("reports unknown class", () => {
    const env = createTypeEnvironment([]);
    const result = env.checkMethodCall("NoSuchClass", "method", []);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports unknown method", () => {
    const cls = parseTweedle(`
      class MyScene extends SScene {
        MyScene() {}
        void doStuff() {
          doInOrder {}
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("MyScene", "noSuchMethod", []);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("noSuchMethod"))).toBe(true);
  });

  it("reports wrong argument count", () => {
    const cls = parseTweedle(`
      class MyScene extends SScene {
        MyScene() {}
        void doStuff() {
          doInOrder {}
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("MyScene", "doStuff", ["TextString"]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("reports type mismatch in arguments", () => {
    const cls = parseTweedle(`
      class Calc extends SThing {
        Calc() {}
        DecimalNumber add(DecimalNumber a, DecimalNumber b) {
          return a + b;
        }
      }
    `);
    const env = createTypeEnvironment([cls]);
    const result = env.checkMethodCall("Calc", "add", [
      "TextString",
      "DecimalNumber",
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returnType is null when call is invalid", () => {
    const env = createTypeEnvironment([]);
    const result = env.checkMethodCall("Nonexistent", "method", []);
    expect(result.returnType).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. METHOD CALL VALIDATION — inherited methods
// ═══════════════════════════════════════════════════════════════════════════

describe("checkMethodCall – inherited methods", () => {
  it("finds method defined on superclass", () => {
    const base = parseTweedle(`
      class Animal extends SThing {
        Animal() {}
        void speak() {
          doInOrder {}
        }
      }
    `);
    const derived = parseTweedle(`
      class Dog extends Animal {
        Dog() {}
      }
    `);
    const env = createTypeEnvironment([base, derived]);
    const result = env.checkMethodCall("Dog", "speak", []);
    expect(result.valid).toBe(true);
  });

  it("finds method defined on grandparent class", () => {
    const a = parseTweedle(`
      class A extends SThing {
        A() {}
        void base_method() {
          doInOrder {}
        }
      }
    `);
    const b = parseTweedle("class B extends A { B() {} }");
    const c = parseTweedle("class C extends B { C() {} }");
    const env = createTypeEnvironment([a, b, c]);
    const result = env.checkMethodCall("C", "base_method", []);
    expect(result.valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. CYCLE DETECTION
// ═══════════════════════════════════════════════════════════════════════════

describe("Cycle detection", () => {
  it("throws TweedleTypeError for direct cycle (A extends B, B extends A)", () => {
    const a = parseTweedle("class A extends B { A() {} }");
    const b = parseTweedle("class B extends A { B() {} }");
    expect(() => createTypeEnvironment([a, b])).toThrow(TweedleTypeError);
  });

  it("cycle error mentions the involved classes", () => {
    const a = parseTweedle("class A extends B { A() {} }");
    const b = parseTweedle("class B extends A { B() {} }");
    try {
      createTypeEnvironment([a, b]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TweedleTypeError);
      expect((e as TweedleTypeError).message).toMatch(/cycle/i);
    }
  });

  it("throws for transitive cycle (A → B → C → A)", () => {
    const a = parseTweedle("class A extends C { A() {} }");
    const b = parseTweedle("class B extends A { B() {} }");
    const c = parseTweedle("class C extends B { C() {} }");
    expect(() => createTypeEnvironment([a, b, c])).toThrow(TweedleTypeError);
  });

  it("self-referencing class (A extends A) throws", () => {
    const a = parseTweedle("class A extends A { A() {} }");
    expect(() => createTypeEnvironment([a])).toThrow(TweedleTypeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. DUPLICATE CLASS DETECTION
// ═══════════════════════════════════════════════════════════════════════════

describe("Duplicate class detection", () => {
  it("throws TweedleTypeError for duplicate class names", () => {
    const c1 = parseTweedle("class Foo extends SThing { Foo() {} }");
    const c2 = parseTweedle("class Foo extends SThing { Foo() {} }");
    expect(() => createTypeEnvironment([c1, c2])).toThrow(TweedleTypeError);
  });

  it("duplicate error mentions the class name", () => {
    const c1 = parseTweedle("class Foo extends SThing { Foo() {} }");
    const c2 = parseTweedle("class Foo extends SThing { Foo() {} }");
    try {
      createTypeEnvironment([c1, c2]);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TweedleTypeError);
      expect((e as TweedleTypeError).message).toMatch(/Foo/);
    }
  });

  it("does not throw when user class shadows no built-in type", () => {
    const cls = parseTweedle("class UniqueClassName extends SThing { UniqueClassName() {} }");
    expect(() => createTypeEnvironment([cls])).not.toThrow();
  });
});
