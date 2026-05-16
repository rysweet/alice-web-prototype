import { describe, it, expect } from "vitest";
import { parseTweedle, TweedleParseError } from "../src/tweedle-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. PUBLIC API & ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

describe("parseTweedle – public API", () => {
  it("exports parseTweedle as a function", () => {
    expect(typeof parseTweedle).toBe("function");
  });

  it("exports TweedleParseError as a class", () => {
    expect(TweedleParseError).toBeDefined();
    expect(typeof TweedleParseError).toBe("function");
  });

  it("TweedleParseError is an Error subclass", () => {
    const err = new TweedleParseError("test", 1, 0, "{", "identifier");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TweedleParseError);
  });

  it("TweedleParseError exposes line, column, found, expected", () => {
    const err = new TweedleParseError("msg", 3, 5, "{", "identifier");
    expect(err.line).toBe(3);
    expect(err.column).toBe(5);
    expect(err.found).toBe("{");
    expect(err.expected).toBe("identifier");
    expect(err.message).toBe("msg");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. SECURITY GUARDS
// ═══════════════════════════════════════════════════════════════════════════

describe("security guards", () => {
  it("rejects source longer than 1 MB", () => {
    const huge = "class X { }".padEnd(1_048_577, " ");
    expect(() => parseTweedle(huge)).toThrow(TweedleParseError);
  });

  it("accepts source at exactly 1 MB", () => {
    const source = "class X { }" + " ".repeat(1_048_576 - 11);
    expect(() => parseTweedle(source)).not.toThrow();
  });

  it("rejects deeply nested expressions exceeding depth 100", () => {
    // Build 101 levels of nesting: (((((...(1)...)))))
    const open = "(".repeat(101);
    const close = ")".repeat(101);
    const source = `class X { void m() { WholeNumber x <- ${open}1${close}; } }`;
    expect(() => parseTweedle(source)).toThrow(TweedleParseError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CLASS DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("class declarations", () => {
  it("parses a minimal empty class", () => {
    const ast = parseTweedle("class Foo { }");
    expect(ast.type).toBe("ClassDeclaration");
    expect(ast.name).toBe("Foo");
    expect(ast.superClass).toBeNull();
    expect(ast.modelType).toBeNull();
    expect(ast.constructors).toEqual([]);
    expect(ast.methods).toEqual([]);
    expect(ast.fields).toEqual([]);
  });

  it("parses extends clause", () => {
    const ast = parseTweedle("class Flyer extends SThing { }");
    expect(ast.name).toBe("Flyer");
    expect(ast.superClass).toBe("SThing");
  });

  it("parses models clause", () => {
    const ast = parseTweedle("class Scene extends SScene models Scene { }");
    expect(ast.name).toBe("Scene");
    expect(ast.superClass).toBe("SScene");
    expect(ast.modelType).toBe("Scene");
  });

  it("parses class without extends but with body", () => {
    const ast = parseTweedle(`class Default {
      static Duration duration() {
        return Duration.ONE_SECOND;
      }
    }`);
    expect(ast.name).toBe("Default");
    expect(ast.superClass).toBeNull();
    expect(ast.methods).toHaveLength(1);
  });

  it("throws on missing class name", () => {
    expect(() => parseTweedle("class { }")).toThrow(TweedleParseError);
    try {
      parseTweedle("class { }");
    } catch (e) {
      expect(e).toBeInstanceOf(TweedleParseError);
      const pe = e as InstanceType<typeof TweedleParseError>;
      expect(pe.found).toBe("{");
      expect(pe.expected).toContain("identifier");
    }
  });

  it("throws on missing opening brace", () => {
    expect(() => parseTweedle("class Foo }")).toThrow(TweedleParseError);
  });

  it("throws on empty input", () => {
    expect(() => parseTweedle("")).toThrow(TweedleParseError);
  });

  it("throws on non-class declaration", () => {
    expect(() => parseTweedle("void main() { }")).toThrow(TweedleParseError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. VISIBILITY ANNOTATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("visibility annotations", () => {
  it("parses @CompletelyHidden on class", () => {
    const ast = parseTweedle("@CompletelyHidden class Hidden { }");
    expect(ast.visibility).toBe("@CompletelyHidden");
  });

  it("parses @TuckedAway on method", () => {
    const ast = parseTweedle(`class X {
      @TuckedAway void helper() { }
    }`);
    expect(ast.methods[0].visibility).toBe("@TuckedAway");
  });

  it("parses @PrimeTime on method", () => {
    const ast = parseTweedle(`class X {
      @PrimeTime void show() { }
    }`);
    expect(ast.methods[0].visibility).toBe("@PrimeTime");
  });

  it("parses @CompletelyHidden on field", () => {
    const ast = parseTweedle(`class X {
      @CompletelyHidden SThing vehicle <- null;
    }`);
    expect(ast.fields[0].visibility).toBe("@CompletelyHidden");
  });

  it("class without annotation has null visibility", () => {
    const ast = parseTweedle("class Foo { }");
    expect(ast.visibility).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. CONSTRUCTORS
// ═══════════════════════════════════════════════════════════════════════════

describe("constructors", () => {
  it("parses empty constructor", () => {
    const ast = parseTweedle(`class Foo {
      Foo() { }
    }`);
    expect(ast.constructors).toHaveLength(1);
    expect(ast.constructors[0].type).toBe("ConstructorDeclaration");
    expect(ast.constructors[0].name).toBe("Foo");
    expect(ast.constructors[0].parameters).toEqual([]);
    expect(ast.constructors[0].body).toEqual([]);
  });

  it("parses constructor with parameters", () => {
    const ast = parseTweedle(`class Scene {
      Scene(SBiped bunny, SFlyer blueJay) {
        super();
        this.bunny <- bunny;
      }
    }`);
    expect(ast.constructors).toHaveLength(1);
    const ctor = ast.constructors[0];
    expect(ctor.parameters).toHaveLength(2);
    expect(ctor.parameters[0].name).toBe("bunny");
    expect(ctor.parameters[0].paramType).toEqual({
      type: "SimpleTypeRef",
      name: "SBiped",
      isArray: false,
    });
    expect(ctor.parameters[1].name).toBe("blueJay");
  });

  it("parses constructor with super() call in body", () => {
    const ast = parseTweedle(`class Scene extends SScene {
      Scene() {
        super();
      }
    }`);
    const body = ast.constructors[0].body;
    expect(body).toHaveLength(1);
    expect(body[0].type).toBe("ExpressionStatement");
  });

  it("disambiguates constructor from method (no return type)", () => {
    const ast = parseTweedle(`class Demo {
      Demo() { }
      void demo() { }
    }`);
    expect(ast.constructors).toHaveLength(1);
    expect(ast.methods).toHaveLength(1);
    expect(ast.constructors[0].name).toBe("Demo");
    expect(ast.methods[0].name).toBe("demo");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. METHOD DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("method declarations", () => {
  it("parses void method with no parameters", () => {
    const ast = parseTweedle(`class X {
      void doStuff() { }
    }`);
    expect(ast.methods).toHaveLength(1);
    const m = ast.methods[0];
    expect(m.type).toBe("MethodDeclaration");
    expect(m.name).toBe("doStuff");
    expect(m.returnType).toEqual({ type: "VoidTypeRef" });
    expect(m.parameters).toEqual([]);
    expect(m.isStatic).toBe(false);
    expect(m.visibility).toBeNull();
  });

  it("parses method with return type", () => {
    const ast = parseTweedle(`class X {
      WholeNumber getCount() {
        return 42;
      }
    }`);
    const m = ast.methods[0];
    expect(m.returnType).toEqual({
      type: "SimpleTypeRef",
      name: "WholeNumber",
      isArray: false,
    });
  });

  it("parses static method", () => {
    const ast = parseTweedle(`class X {
      static Duration duration() {
        return Duration.ONE_SECOND;
      }
    }`);
    expect(ast.methods[0].isStatic).toBe(true);
  });

  it("parses method with array return type", () => {
    const ast = parseTweedle(`class X {
      SJoint[] getTailArray() {
        return new SJoint[]{};
      }
    }`);
    const m = ast.methods[0];
    expect(m.returnType).toEqual({
      type: "SimpleTypeRef",
      name: "SJoint",
      isArray: true,
    });
  });

  it("parses method with default parameters", () => {
    const ast = parseTweedle(`class X {
      void move(Duration duration <- Default.duration(), AnimationStyle style <- Default.animationStyle()) { }
    }`);
    const params = ast.methods[0].parameters;
    expect(params).toHaveLength(2);
    expect(params[0].name).toBe("duration");
    expect(params[0].defaultValue).not.toBeNull();
    expect(params[0].defaultValue!.type).toBe("MethodInvocation");
    expect(params[1].name).toBe("style");
    expect(params[1].defaultValue).not.toBeNull();
  });

  it("parses method with varargs parameter", () => {
    const ast = parseTweedle(`class X {
      void addAll(SThing... things) { }
    }`);
    const params = ast.methods[0].parameters;
    expect(params).toHaveLength(1);
    expect(params[0].name).toBe("things");
    expect(params[0].isVarArgs).toBe(true);
  });

  it("parses method with visibility and static combined", () => {
    const ast = parseTweedle(`class X {
      @TuckedAway static SThing[] getDefault() { return new SThing[]{}; }
    }`);
    const m = ast.methods[0];
    expect(m.visibility).toBe("@TuckedAway");
    expect(m.isStatic).toBe(true);
  });

  it("parses multiple methods in a class", () => {
    const ast = parseTweedle(`class X {
      void a() { }
      void b() { }
      void c() { }
    }`);
    expect(ast.methods).toHaveLength(3);
    expect(ast.methods.map((m) => m.name)).toEqual(["a", "b", "c"]);
  });

  it("parses method with lambda type parameter", () => {
    const ast = parseTweedle(`class X {
      void addListener(<SceneActivationEvent->void> listener) { }
    }`);
    const params = ast.methods[0].parameters;
    expect(params).toHaveLength(1);
    expect(params[0].paramType.type).toBe("LambdaTypeRef");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. FIELD DECLARATIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("field declarations", () => {
  it("parses field without initializer", () => {
    const ast = parseTweedle(`class X {
      SBiped bunny;
    }`);
    expect(ast.fields).toHaveLength(1);
    const f = ast.fields[0];
    expect(f.type).toBe("FieldDeclaration");
    expect(f.name).toBe("bunny");
    expect(f.fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "SBiped",
      isArray: false,
    });
    expect(f.initializer).toBeNull();
    expect(f.isStatic).toBe(false);
    expect(f.isConstant).toBe(false);
  });

  it("parses field with initializer", () => {
    const ast = parseTweedle(`class X {
      SGround ground <- new SGround();
    }`);
    const f = ast.fields[0];
    expect(f.name).toBe("ground");
    expect(f.initializer).not.toBeNull();
    expect(f.initializer!.type).toBe("NewInstance");
  });

  it("parses constant field", () => {
    const ast = parseTweedle(`class X {
      constant WholeNumber MAX_SIZE <- 10;
    }`);
    const f = ast.fields[0];
    expect(f.isConstant).toBe(true);
    expect(f.name).toBe("MAX_SIZE");
  });

  it("parses static field", () => {
    const ast = parseTweedle(`class X {
      static TextString DEFAULT_NAME <- "unnamed";
    }`);
    expect(ast.fields[0].isStatic).toBe(true);
  });

  it("parses field with null initializer", () => {
    const ast = parseTweedle(`class X {
      @CompletelyHidden SThing vehicle <- null;
    }`);
    const f = ast.fields[0];
    expect(f.initializer).not.toBeNull();
    expect(f.initializer!.type).toBe("Literal");
    const lit = f.initializer as { type: "Literal"; value: null; literalType: string };
    expect(lit.value).toBeNull();
    expect(lit.literalType).toBe("null");
    expect(f.visibility).toBe("@CompletelyHidden");
  });

  it("parses multiple fields", () => {
    const ast = parseTweedle(`class Scene extends SScene models Scene {
      SGround ground <- new SGround();
      SCamera camera <- new SCamera();
      Box box <- new Box();
    }`);
    expect(ast.fields).toHaveLength(3);
    expect(ast.fields.map((f) => f.name)).toEqual(["ground", "camera", "box"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. TYPE REFERENCES
// ═══════════════════════════════════════════════════════════════════════════

describe("type references", () => {
  it("parses simple class type", () => {
    const ast = parseTweedle(`class X { SBiped bunny; }`);
    expect(ast.fields[0].fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "SBiped",
      isArray: false,
    });
  });

  it("parses void return type", () => {
    const ast = parseTweedle(`class X { void m() { } }`);
    expect(ast.methods[0].returnType).toEqual({ type: "VoidTypeRef" });
  });

  it("parses array type", () => {
    const ast = parseTweedle(`class X { SJoint[] joints; }`);
    expect(ast.fields[0].fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "SJoint",
      isArray: true,
    });
  });

  it("parses primitive types", () => {
    const ast = parseTweedle(`class X {
      WholeNumber a;
      DecimalNumber b;
      TextString c;
      Boolean d;
    }`);
    expect(ast.fields[0].fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "WholeNumber",
      isArray: false,
    });
    expect(ast.fields[1].fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "DecimalNumber",
      isArray: false,
    });
    expect(ast.fields[2].fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "TextString",
      isArray: false,
    });
    expect(ast.fields[3].fieldType).toEqual({
      type: "SimpleTypeRef",
      name: "Boolean",
      isArray: false,
    });
  });

  it("parses lambda type ref as opaque", () => {
    const ast = parseTweedle(`class X {
      void addListener(<SceneActivationEvent->void> listener) { }
    }`);
    const paramType = ast.methods[0].parameters[0].paramType;
    expect(paramType.type).toBe("LambdaTypeRef");
    expect((paramType as { type: "LambdaTypeRef"; raw: string }).raw).toContain(
      "SceneActivationEvent"
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. STATEMENTS
// ═══════════════════════════════════════════════════════════════════════════

describe("statements – do in order", () => {
  it("parses do in order block", () => {
    const ast = parseTweedle(`class X {
      void m() {
        doInOrder {
          this.bunny.say("First");
          this.bunny.say("Second");
        }
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("DoInOrder");
    const doInOrder = stmt as { type: "DoInOrder"; body: unknown[] };
    expect(doInOrder.body).toHaveLength(2);
  });
});

describe("statements – do together", () => {
  it("parses do together block", () => {
    const ast = parseTweedle(`class X {
      void m() {
        doTogether {
          this.bunny.say("Hi");
          this.cat.say("Hello");
        }
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("DoTogether");
    const doTogether = stmt as { type: "DoTogether"; body: unknown[] };
    expect(doTogether.body).toHaveLength(2);
  });
});

describe("statements – if/else", () => {
  it("parses if without else", () => {
    const ast = parseTweedle(`class X {
      void m() {
        if (this.flag) {
          this.doSomething();
        }
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("IfElse");
    const ifElse = stmt as {
      type: "IfElse";
      condition: unknown;
      ifBody: unknown[];
      elseBody: unknown[] | null;
    };
    expect(ifElse.condition).toBeDefined();
    expect(ifElse.ifBody).toHaveLength(1);
    expect(ifElse.elseBody).toBeNull();
  });

  it("parses if with else", () => {
    const ast = parseTweedle(`class X {
      void m() {
        if (this.flag) {
          this.doA();
        } else {
          this.doB();
        }
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "IfElse";
      ifBody: unknown[];
      elseBody: unknown[] | null;
    };
    expect(stmt.type).toBe("IfElse");
    expect(stmt.ifBody).toHaveLength(1);
    expect(stmt.elseBody).not.toBeNull();
    expect(stmt.elseBody).toHaveLength(1);
  });

  it("parses if condition with comparison", () => {
    const ast = parseTweedle(`class X {
      void m() {
        if (this.count == 0) {
          this.reset();
        }
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "IfElse";
      condition: { type: string };
    };
    expect(stmt.condition.type).toBe("BinaryOp");
  });
});

describe("statements – for each", () => {
  it("parses forEach loop", () => {
    const ast = parseTweedle(`class X {
      void m() {
        forEach (SThing thing in this.getThings()) {
          thing.say("hello");
        }
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("ForEach");
    const forEach = stmt as {
      type: "ForEach";
      itemType: { type: string; name: string };
      itemName: string;
      collection: unknown;
      body: unknown[];
    };
    expect(forEach.itemType.name).toBe("SThing");
    expect(forEach.itemName).toBe("thing");
    expect(forEach.body).toHaveLength(1);
  });
});

describe("statements – count up to", () => {
  it("parses countUpTo loop", () => {
    const ast = parseTweedle(`class X {
      void m() {
        countUpTo (index < 5) {
          this.step();
        }
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("CountUpTo");
    const countUp = stmt as {
      type: "CountUpTo";
      count: unknown;
      body: unknown[];
    };
    expect(countUp.body).toHaveLength(1);
  });
});

describe("statements – return", () => {
  it("parses return with expression", () => {
    const ast = parseTweedle(`class X {
      WholeNumber get() {
        return 42;
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("Return");
    const ret = stmt as {
      type: "Return";
      expression: { type: string; value: number } | null;
    };
    expect(ret.expression).not.toBeNull();
    expect(ret.expression!.type).toBe("Literal");
    expect(ret.expression!.value).toBe(42);
  });

  it("parses return without expression", () => {
    const ast = parseTweedle(`class X {
      void m() {
        return;
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "Return";
      expression: unknown | null;
    };
    expect(stmt.type).toBe("Return");
    expect(stmt.expression).toBeNull();
  });

  it("parses return with null", () => {
    const ast = parseTweedle(`class X {
      SScene getScene() {
        return null;
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: null };
    };
    expect(stmt.expression!.type).toBe("Literal");
    expect(stmt.expression!.value).toBeNull();
  });
});

describe("statements – expression statements", () => {
  it("parses method call as statement", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.bunny.say("Hello!");
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("ExpressionStatement");
    const exprStmt = stmt as {
      type: "ExpressionStatement";
      expression: { type: string };
    };
    expect(exprStmt.expression.type).toBe("MethodInvocation");
  });

  it("parses assignment as statement", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.name <- "Alice";
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: { type: string };
    };
    expect(stmt.expression.type).toBe("Assignment");
  });
});

describe("statements – local variable declarations", () => {
  it("parses local variable with initializer", () => {
    const ast = parseTweedle(`class X {
      void m() {
        WholeNumber count <- 0;
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("LocalVariableDeclaration");
    const decl = stmt as {
      type: "LocalVariableDeclaration";
      name: string;
      varType: { type: string; name: string };
      initializer: { type: string };
      isConstant: boolean;
    };
    expect(decl.name).toBe("count");
    expect(decl.varType.name).toBe("WholeNumber");
    expect(decl.isConstant).toBe(false);
  });

  it("parses constant local variable", () => {
    const ast = parseTweedle(`class X {
      void m() {
        constant TextString greeting <- "hello";
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "LocalVariableDeclaration";
      isConstant: boolean;
    };
    expect(stmt.isConstant).toBe(true);
  });
});

describe("statements – disabled blocks", () => {
  it("parses NODE_DISABLE/NODE_ENABLE as DisabledBlock", () => {
    const ast = parseTweedle(`class X {
      void m() {
        *< this.bunny.say("disabled"); >*
      }
    }`);
    const stmt = ast.methods[0].body[0];
    expect(stmt.type).toBe("DisabledBlock");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. EXPRESSIONS
// ═══════════════════════════════════════════════════════════════════════════

describe("expressions – literals", () => {
  it("parses integer literal", () => {
    const ast = parseTweedle(`class X {
      WholeNumber get() { return 42; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: number; literalType: string };
    };
    expect(ret.expression.type).toBe("Literal");
    expect(ret.expression.value).toBe(42);
    expect(ret.expression.literalType).toBe("number");
  });

  it("parses float literal", () => {
    const ast = parseTweedle(`class X {
      DecimalNumber get() { return 3.14; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: number };
    };
    expect(ret.expression.value).toBeCloseTo(3.14);
  });

  it("parses negative float literal with exponent", () => {
    const ast = parseTweedle(`class X {
      DecimalNumber get() { return 6.12323E-17; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: number };
    };
    expect(ret.expression.value).toBeCloseTo(6.12323e-17);
  });

  it("parses string literal", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return "hello world"; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: string; literalType: string };
    };
    expect(ret.expression.value).toBe("hello world");
    expect(ret.expression.literalType).toBe("string");
  });

  it("parses string literal with escape sequences", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return "line1\\nline2"; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: string };
    };
    expect(ret.expression.value).toBe("line1\nline2");
  });

  it("parses boolean literal true", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return true; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: boolean; literalType: string };
    };
    expect(ret.expression.value).toBe(true);
    expect(ret.expression.literalType).toBe("boolean");
  });

  it("parses boolean literal false", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return false; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: boolean };
    };
    expect(ret.expression.value).toBe(false);
  });

  it("parses null literal", () => {
    const ast = parseTweedle(`class X {
      SThing get() { return null; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; value: null; literalType: string };
    };
    expect(ret.expression.value).toBeNull();
    expect(ret.expression.literalType).toBe("null");
  });
});

describe("expressions – this and super", () => {
  it("parses this reference", () => {
    const ast = parseTweedle(`class X {
      SThing get() { return this; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string };
    };
    expect(ret.expression.type).toBe("This");
  });

  it("parses super() call", () => {
    const ast = parseTweedle(`class X extends Y {
      X() { super(); }
    }`);
    const stmt = ast.constructors[0].body[0] as {
      type: "ExpressionStatement";
      expression: { type: string };
    };
    // super() is a method invocation on Super
    expect(stmt.expression.type).toBe("MethodInvocation");
  });

  it("parses super with named arguments", () => {
    const ast = parseTweedle(`class SFlyer extends SJointedModel {
      SFlyer(FlyerResource resource) {
        super(resource: resource);
      }
    }`);
    const stmt = ast.constructors[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        arguments: Array<{ name: string | null; value: unknown }>;
      };
    };
    expect(stmt.expression.arguments).toHaveLength(1);
    expect(stmt.expression.arguments[0].name).toBe("resource");
  });
});

describe("expressions – member access", () => {
  it("parses this.field", () => {
    const ast = parseTweedle(`class X {
      SThing get() { return this.bunny; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        target: { type: string };
        memberName: string;
      };
    };
    expect(ret.expression.type).toBe("MemberAccess");
    expect(ret.expression.target.type).toBe("This");
    expect(ret.expression.memberName).toBe("bunny");
  });

  it("parses chained member access", () => {
    const ast = parseTweedle(`class X {
      SThing get() { return this.bunny.head; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        target: { type: string; target: { type: string }; memberName: string };
        memberName: string;
      };
    };
    expect(ret.expression.type).toBe("MemberAccess");
    expect(ret.expression.memberName).toBe("head");
    expect(ret.expression.target.type).toBe("MemberAccess");
    expect(ret.expression.target.memberName).toBe("bunny");
  });

  it("parses enum-like member access (Type.MEMBER)", () => {
    const ast = parseTweedle(`class X {
      void m() { return Duration.ONE_SECOND; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        target: { type: string; name: string };
        memberName: string;
      };
    };
    expect(ret.expression.type).toBe("MemberAccess");
    expect(ret.expression.target.type).toBe("Identifier");
    expect(ret.expression.target.name).toBe("Duration");
    expect(ret.expression.memberName).toBe("ONE_SECOND");
  });
});

describe("expressions – method invocation", () => {
  it("parses simple method call on this", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.doSomething();
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        target: { type: string };
        methodName: string;
        arguments: unknown[];
      };
    };
    expect(stmt.expression.type).toBe("MethodInvocation");
    expect(stmt.expression.target.type).toBe("This");
    expect(stmt.expression.methodName).toBe("doSomething");
    expect(stmt.expression.arguments).toEqual([]);
  });

  it("parses method call with named arguments", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.bunny.move(direction: MoveDirection.FORWARD, amount: 1.0);
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        methodName: string;
        arguments: Array<{ name: string | null; value: { type: string } }>;
      };
    };
    expect(stmt.expression.methodName).toBe("move");
    expect(stmt.expression.arguments).toHaveLength(2);
    expect(stmt.expression.arguments[0].name).toBe("direction");
    expect(stmt.expression.arguments[0].value.type).toBe("MemberAccess");
    expect(stmt.expression.arguments[1].name).toBe("amount");
    expect(stmt.expression.arguments[1].value.type).toBe("Literal");
  });

  it("parses chained method calls", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.bunny.getHead().turn(direction: TurnDirection.LEFT, amount: 0.5);
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        methodName: string;
        target: {
          type: string;
          methodName: string;
        };
      };
    };
    expect(stmt.expression.type).toBe("MethodInvocation");
    expect(stmt.expression.methodName).toBe("turn");
    expect(stmt.expression.target.type).toBe("MethodInvocation");
    expect(stmt.expression.target.methodName).toBe("getHead");
  });

  it("parses free-standing method call (no target)", () => {
    const ast = parseTweedle(`class X {
      void m() {
        doSomething();
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: { type: string; methodName: string };
    };
    expect(stmt.expression.type).toBe("MethodInvocation");
    expect(stmt.expression.methodName).toBe("doSomething");
  });
});

describe("expressions – identifiers", () => {
  it("parses simple identifier", () => {
    const ast = parseTweedle(`class X {
      SThing get() { return bunny; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; name: string };
    };
    expect(ret.expression.type).toBe("Identifier");
    expect(ret.expression.name).toBe("bunny");
  });

  it("parses $-prefixed identifiers", () => {
    const ast = parseTweedle(`class X {
      void m() {
        $SceneGraph.createEntity(thing: this);
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        target: { type: string; name: string };
      };
    };
    expect(stmt.expression.target.type).toBe("Identifier");
    expect(stmt.expression.target.name).toBe("$SceneGraph");
  });
});

describe("expressions – new instance", () => {
  it("parses new with no arguments", () => {
    const ast = parseTweedle(`class X {
      void m() {
        SGround g <- new SGround();
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "LocalVariableDeclaration";
      initializer: {
        type: string;
        className: string;
        arguments: unknown[];
      };
    };
    expect(stmt.initializer.type).toBe("NewInstance");
    expect(stmt.initializer.className).toBe("SGround");
    expect(stmt.initializer.arguments).toEqual([]);
  });

  it("parses new with named arguments", () => {
    const ast = parseTweedle(`class X {
      void m() {
        Color c <- new Color(red: 0.5, green: 0.3, blue: 0.1);
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "LocalVariableDeclaration";
      initializer: {
        type: string;
        className: string;
        arguments: Array<{ name: string | null }>;
      };
    };
    expect(stmt.initializer.type).toBe("NewInstance");
    expect(stmt.initializer.className).toBe("Color");
    expect(stmt.initializer.arguments).toHaveLength(3);
    expect(stmt.initializer.arguments[0].name).toBe("red");
  });
});

describe("expressions – new array", () => {
  it("parses new empty array", () => {
    const ast = parseTweedle(`class X {
      SThing[] get() { return new SThing[]{}; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        elementType: { type: string; name: string };
        elements: unknown[];
      };
    };
    expect(ret.expression.type).toBe("NewArray");
    expect(ret.expression.elementType.name).toBe("SThing");
    expect(ret.expression.elements).toEqual([]);
  });
});

describe("expressions – binary operators", () => {
  it("parses arithmetic operators", () => {
    const ast = parseTweedle(`class X {
      DecimalNumber get() { return 2 + 3; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        operator: string;
        left: { type: string };
        right: { type: string };
      };
    };
    expect(ret.expression.type).toBe("BinaryOp");
    expect(ret.expression.operator).toBe("+");
  });

  it("parses multiplication with higher precedence than addition", () => {
    const ast = parseTweedle(`class X {
      DecimalNumber get() { return 2 + 3 * 4; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        operator: string;
        left: { type: string; value: number };
        right: { type: string; operator: string };
      };
    };
    // Should parse as 2 + (3 * 4)
    expect(ret.expression.operator).toBe("+");
    expect(ret.expression.right.type).toBe("BinaryOp");
    expect(ret.expression.right.operator).toBe("*");
  });

  it("parses string concatenation operator ..", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return "hello" .. " " .. "world"; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.type).toBe("BinaryOp");
    expect(ret.expression.operator).toBe("..");
  });

  it("parses comparison operators", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return this.count == 0; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.type).toBe("BinaryOp");
    expect(ret.expression.operator).toBe("==");
  });

  it("parses != operator", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return this.name != null; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.operator).toBe("!=");
  });

  it("parses logical operators", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return true && false; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.operator).toBe("&&");
  });

  it("parses || operator", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return true || false; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.operator).toBe("||");
  });

  it("parses relational operators", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return this.x >= 0; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.operator).toBe(">=");
  });
});

describe("expressions – assignment", () => {
  it("parses <- assignment", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.name <- "Alice";
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        target: { type: string; memberName: string };
        value: { type: string; value: string };
      };
    };
    expect(stmt.expression.type).toBe("Assignment");
    expect(stmt.expression.target.memberName).toBe("name");
    expect(stmt.expression.value.value).toBe("Alice");
  });

  it("assignment is right-associative", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.a <- this.b <- 1;
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        target: { memberName: string };
        value: { type: string; target: { memberName: string } };
      };
    };
    // a <- (b <- 1): outer target is a, inner assignment is b <- 1
    expect(stmt.expression.type).toBe("Assignment");
    expect(stmt.expression.target.memberName).toBe("a");
    expect(stmt.expression.value.type).toBe("Assignment");
    expect(stmt.expression.value.target.memberName).toBe("b");
  });
});

describe("expressions – unary operators", () => {
  it("parses ! (not) operator", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return !this.flag; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string; operand: { type: string } };
    };
    expect(ret.expression.type).toBe("UnaryOp");
    expect(ret.expression.operator).toBe("!");
  });

  it("parses unary minus", () => {
    const ast = parseTweedle(`class X {
      DecimalNumber get() { return -1.0; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(ret.expression.type).toBe("UnaryOp");
    expect(ret.expression.operator).toBe("-");
  });
});

describe("expressions – type cast (as)", () => {
  it("parses as cast expression", () => {
    const ast = parseTweedle(`class X {
      SBiped get() { return this.thing as SBiped; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        expression: { type: string };
        targetType: { type: string; name: string };
      };
    };
    expect(ret.expression.type).toBe("TypeCast");
    expect(ret.expression.targetType.name).toBe("SBiped");
  });
});

describe("expressions – instanceof", () => {
  it("parses instanceof expression", () => {
    const ast = parseTweedle(`class X {
      Boolean check() { return this.thing instanceof SFlyer; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        expression: { type: string };
        testType: { type: string; name: string };
      };
    };
    expect(ret.expression.type).toBe("InstanceOf");
    expect(ret.expression.testType.name).toBe("SFlyer");
  });
});

describe("expressions – parenthesized", () => {
  it("parses parenthesized expression", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return (this.vehicle == null) || this.flag; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        operator: string;
        left: { type: string };
      };
    };
    expect(ret.expression.type).toBe("BinaryOp");
    expect(ret.expression.operator).toBe("||");
    expect(ret.expression.left.type).toBe("Parenthesized");
  });
});

describe("expressions – array access", () => {
  it("parses array index access", () => {
    const ast = parseTweedle(`class X {
      SThing get() { return this.items[0]; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        target: { type: string };
        index: { type: string; value: number };
      };
    };
    expect(ret.expression.type).toBe("ArrayAccess");
    expect(ret.expression.index.value).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. LEXER EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("lexer – comments", () => {
  it("handles single-line comments", () => {
    const ast = parseTweedle(`class X {
      // this is a comment
      void m() { }
    }`);
    expect(ast.methods).toHaveLength(1);
  });

  it("handles block comments", () => {
    const ast = parseTweedle(`class X {
      /* block
         comment */
      void m() { }
    }`);
    expect(ast.methods).toHaveLength(1);
  });

  it("handles comment inside method body", () => {
    const ast = parseTweedle(`class X {
      void m() {
        // Do something
        this.doIt();
      }
    }`);
    expect(ast.methods[0].body).toHaveLength(1);
  });
});

describe("lexer – whitespace", () => {
  it("handles minimal whitespace", () => {
    const ast = parseTweedle("class X{void m(){}}");
    expect(ast.name).toBe("X");
    expect(ast.methods).toHaveLength(1);
  });

  it("handles excessive whitespace and newlines", () => {
    const ast = parseTweedle(`

      class   X
        extends   Y
      {

        void   m  (  )  {  }

      }

    `);
    expect(ast.name).toBe("X");
    expect(ast.superClass).toBe("Y");
  });
});

describe("lexer – string escapes", () => {
  it("handles escaped double quote", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return "say \\"hello\\""; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { value: string };
    };
    expect(ret.expression.value).toBe('say "hello"');
  });

  it("handles escaped backslash", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return "path\\\\file"; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { value: string };
    };
    expect(ret.expression.value).toBe("path\\file");
  });

  it("handles tab escape", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return "a\\tb"; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { value: string };
    };
    expect(ret.expression.value).toBe("a\tb");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. UNSUPPORTED CONSTRUCTS
// ═══════════════════════════════════════════════════════════════════════════

describe("unsupported constructs", () => {
  it("throws on enum declaration", () => {
    expect(() => parseTweedle("enum Color { RED, GREEN, BLUE }")).toThrow(
      TweedleParseError
    );
    try {
      parseTweedle("enum Color { RED, GREEN, BLUE }");
    } catch (e) {
      expect((e as Error).message).toContain("not yet supported");
    }
  });

  it("throws on lambda expression in body", () => {
    expect(() =>
      parseTweedle(`class X {
        void m() {
          this.addListener(listener: (SceneActivationEvent event) -> {
            this.doIt();
          });
        }
      }`)
    ).toThrow(TweedleParseError);
    try {
      parseTweedle(`class X {
        void m() {
          this.addListener(listener: (SceneActivationEvent event) -> {
            this.doIt();
          });
        }
      }`);
    } catch (e) {
      expect((e as Error).message).toContain("not yet supported");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. INTEGRATION TESTS – REALISTIC TWEEDLE FILES
// ═══════════════════════════════════════════════════════════════════════════

describe("integration – Default.twe (all static methods)", () => {
  const source = `class Default {
  static Duration duration() {
    return Duration.ONE_SECOND;
  }

  static AnimationStyle animationStyle() {
    return AnimationStyle.BEGIN_AND_END_GENTLY;
  }

  static DecimalNumber volume(){
    return 1.0;
  }

  static SThing[] clickableVisuals() {
    return new SThing[]{};
  }
}`;

  it("parses all methods as static", () => {
    const ast = parseTweedle(source);
    expect(ast.name).toBe("Default");
    expect(ast.superClass).toBeNull();
    expect(ast.methods.length).toBeGreaterThanOrEqual(4);
    for (const m of ast.methods) {
      expect(m.isStatic).toBe(true);
    }
  });

  it("parses array return type correctly", () => {
    const ast = parseTweedle(source);
    const clickable = ast.methods.find(
      (m) => m.name === "clickableVisuals"
    )!;
    expect(clickable.returnType).toEqual({
      type: "SimpleTypeRef",
      name: "SThing",
      isArray: true,
    });
  });
});

describe("integration – SThing.twe excerpt", () => {
  const source = `class SThing {
  SThing() {
  }

  @CompletelyHidden VantagePoint getVantagePoint(SThing asSeenBy) {
    if (asSeenBy == vehicle) {
      return getLocalTransformation();
    }
    if (asSeenBy == this) {
      return VantagePoint.IDENTITY;
    }
    return asSeenBy.getInverseAbsoluteTransformation().multiply(other: getAbsoluteTransformation());
  }

  @TuckedAway TextString getName() {
    return this.name;
  }

  @TuckedAway void setName(TextString name) {
    this.name <- name;
    $SceneGraph.setEntityName(thing: this, name: name);
  }

  TextString toString() {
    if(this.name != null) {
      return this.name;
    } else {
      return "unnamed " .. $System.getClassName(instance: this);
    }
  }

  @CompletelyHidden SThing vehicle <- null;
  @CompletelyHidden TextString name <- "Unnamed";
}`;

  it("parses constructor, methods, and fields", () => {
    const ast = parseTweedle(source);
    expect(ast.constructors).toHaveLength(1);
    expect(ast.methods.length).toBeGreaterThanOrEqual(4);
    expect(ast.fields).toHaveLength(2);
  });

  it("parses if/else in toString", () => {
    const ast = parseTweedle(source);
    const toString = ast.methods.find((m) => m.name === "toString")!;
    expect(toString.body[0].type).toBe("IfElse");
    const ifElse = toString.body[0] as {
      type: "IfElse";
      elseBody: unknown[] | null;
    };
    expect(ifElse.elseBody).not.toBeNull();
  });

  it("parses $-prefixed service calls", () => {
    const ast = parseTweedle(source);
    const setName = ast.methods.find((m) => m.name === "setName")!;
    const secondStmt = setName.body[1] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        target: { type: string; name: string };
        methodName: string;
      };
    };
    expect(secondStmt.expression.target.name).toBe("$SceneGraph");
    expect(secondStmt.expression.methodName).toBe("setEntityName");
  });

  it("parses string concat with .. in toString else branch", () => {
    const ast = parseTweedle(source);
    const toString = ast.methods.find((m) => m.name === "toString")!;
    const ifElse = toString.body[0] as {
      type: "IfElse";
      elseBody: Array<{ type: string }>;
    };
    const retStmt = ifElse.elseBody![0] as {
      type: "Return";
      expression: { type: string; operator: string };
    };
    expect(retStmt.expression.type).toBe("BinaryOp");
    expect(retStmt.expression.operator).toBe("..");
  });

  it("parses chained method call expression", () => {
    const ast = parseTweedle(source);
    const getVP = ast.methods.find(
      (m) => m.name === "getVantagePoint"
    )!;
    // The last statement is a return with chained calls
    const lastStmt = getVP.body[getVP.body.length - 1] as {
      type: "Return";
      expression: { type: string; methodName: string };
    };
    expect(lastStmt.expression.type).toBe("MethodInvocation");
    expect(lastStmt.expression.methodName).toBe("multiply");
  });
});

describe("integration – Scene.twe excerpt (models clause + named args)", () => {
  const source = `class Scene extends SScene models Scene {
  Scene() {
    super();
  }

  void myFirstMethod() {
  }

  SGround ground <- new SGround();
  SCamera camera <- new SCamera();

  void performGeneratedSetUp() {
    this.setAtmosphereColor(color: new Color(red: 0.0, green: 0.0941, blue: 0.294));
    this.ground.setPaint(paint: SurfaceAppearance.DARK_GRASS);
    this.ground.setOpacity(opacity: new Portion(portion: 1.0));
    this.camera.setOrientationRelativeToVehicle(orientation: new Orientation(x: 0.0, y: 0.995185, z: 0.0980144, w: 6.12323E-17));
  }

  SGround getGround() {
    return this.ground;
  }
}`;

  it("parses models clause", () => {
    const ast = parseTweedle(source);
    expect(ast.modelType).toBe("Scene");
  });

  it("parses fields interspersed with methods", () => {
    const ast = parseTweedle(source);
    expect(ast.fields).toHaveLength(2);
    expect(ast.fields.map((f) => f.name)).toEqual(["ground", "camera"]);
  });

  it("parses nested new-instance in named argument", () => {
    const ast = parseTweedle(source);
    const setup = ast.methods.find(
      (m) => m.name === "performGeneratedSetUp"
    )!;
    // First statement: this.setAtmosphereColor(color: new Color(...))
    const stmt = setup.body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        arguments: Array<{
          name: string | null;
          value: { type: string; className: string };
        }>;
      };
    };
    expect(stmt.expression.arguments[0].name).toBe("color");
    expect(stmt.expression.arguments[0].value.type).toBe("NewInstance");
    expect(stmt.expression.arguments[0].value.className).toBe("Color");
  });

  it("parses scientific notation in new-instance args", () => {
    const ast = parseTweedle(source);
    const setup = ast.methods.find(
      (m) => m.name === "performGeneratedSetUp"
    )!;
    // Last statement has 6.12323E-17
    const lastStmt = setup.body[setup.body.length - 1] as {
      type: "ExpressionStatement";
      expression: {
        arguments: Array<{
          value: {
            arguments: Array<{
              name: string;
              value: { type: string; value: number };
            }>;
          };
        }>;
      };
    };
    const orientArgs =
      lastStmt.expression.arguments[0].value.arguments;
    const wArg = orientArgs.find((a) => a.name === "w")!;
    expect(wArg.value.type).toBe("Literal");
    expect(wArg.value.value).toBeCloseTo(6.12323e-17);
  });
});

describe("integration – SFlyer.twe excerpt (default params + array return)", () => {
  const source = `class SFlyer extends SJointedModel {
    SFlyer(FlyerResource resource) {
        super(resource: resource);
    }

    void spreadWings(Duration duration <- Default.duration(), AnimationStyle animationStyle <- Default.animationStyle()) {
        this.strikePose(pose: currentResource.spreadWingsPose, duration: duration, animationStyle: animationStyle);
    }

    SJoint[] getTailArray() {
        return this.getJointArray(jointIdArray: currentResource.tailArray);
    }

    SJoint getRoot() {
        return this.getJoint(jointId: FlyerResource.ROOT);
    }
}`;

  it("parses constructor with super(resource: resource)", () => {
    const ast = parseTweedle(source);
    expect(ast.constructors).toHaveLength(1);
    expect(ast.constructors[0].parameters).toHaveLength(1);
    expect(ast.constructors[0].parameters[0].paramType).toEqual({
      type: "SimpleTypeRef",
      name: "FlyerResource",
      isArray: false,
    });
  });

  it("parses methods with default parameters", () => {
    const ast = parseTweedle(source);
    const spread = ast.methods.find((m) => m.name === "spreadWings")!;
    expect(spread.parameters).toHaveLength(2);
    expect(spread.parameters[0].defaultValue).not.toBeNull();
    expect(spread.parameters[1].defaultValue).not.toBeNull();
  });

  it("parses SJoint[] array return type", () => {
    const ast = parseTweedle(source);
    const getTail = ast.methods.find((m) => m.name === "getTailArray")!;
    expect(getTail.returnType).toEqual({
      type: "SimpleTypeRef",
      name: "SJoint",
      isArray: true,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. OPERATOR PRECEDENCE
// ═══════════════════════════════════════════════════════════════════════════

describe("operator precedence", () => {
  it("&& binds tighter than ||", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return a || b && c; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        operator: string;
        right: { type: string; operator: string };
      };
    };
    // a || (b && c)
    expect(ret.expression.operator).toBe("||");
    expect(ret.expression.right.operator).toBe("&&");
  });

  it("== binds tighter than &&", () => {
    const ast = parseTweedle(`class X {
      Boolean get() { return a == b && c == d; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        operator: string;
        left: { operator: string };
        right: { operator: string };
      };
    };
    // (a == b) && (c == d)
    expect(ret.expression.operator).toBe("&&");
    expect(ret.expression.left.operator).toBe("==");
    expect(ret.expression.right.operator).toBe("==");
  });

  it("<- is lowest precedence (below ||)", () => {
    const ast = parseTweedle(`class X {
      void m() { this.flag <- true || false; }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: {
        type: string;
        value: { type: string; operator: string };
      };
    };
    // flag <- (true || false)
    expect(stmt.expression.type).toBe("Assignment");
    expect(stmt.expression.value.type).toBe("BinaryOp");
    expect(stmt.expression.value.operator).toBe("||");
  });

  it(".. binds between + and relational", () => {
    const ast = parseTweedle(`class X {
      TextString get() { return a + b .. c; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: {
        type: string;
        operator: string;
        left: { operator: string };
      };
    };
    // (a + b) .. c
    expect(ret.expression.operator).toBe("..");
    expect(ret.expression.left.operator).toBe("+");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. ERROR MESSAGES & LINE/COLUMN TRACKING
// ═══════════════════════════════════════════════════════════════════════════

describe("error reporting", () => {
  it("reports correct line number for error on line 2", () => {
    try {
      parseTweedle(`class X {
  void m( {
  }
}`);
      expect.fail("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TweedleParseError);
      const pe = e as InstanceType<typeof TweedleParseError>;
      expect(pe.line).toBe(2);
    }
  });

  it("reports found token text", () => {
    try {
      parseTweedle("class { }");
      expect.fail("should have thrown");
    } catch (e) {
      const pe = e as InstanceType<typeof TweedleParseError>;
      expect(pe.found).toBe("{");
    }
  });

  it("reports expected description", () => {
    try {
      parseTweedle("class { }");
      expect.fail("should have thrown");
    } catch (e) {
      const pe = e as InstanceType<typeof TweedleParseError>;
      expect(pe.expected).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 16. MIXED MEMBER ORDERING
// ═══════════════════════════════════════════════════════════════════════════

describe("mixed member ordering", () => {
  it("handles fields between methods (real Alice pattern)", () => {
    const ast = parseTweedle(`class Scene extends SScene models Scene {
      Scene() { super(); }
      void initializeEventListeners() { }
      void myFirstMethod() { }
      SGround ground <- new SGround();
      SCamera camera <- new SCamera();
      void performCustomSetup() { }
      SGround getGround() { return this.ground; }
    }`);
    expect(ast.constructors).toHaveLength(1);
    expect(ast.methods).toHaveLength(4);
    expect(ast.fields).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 17. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("edge cases", () => {
  it("handles method with empty body", () => {
    const ast = parseTweedle(`class X {
      void m() { }
    }`);
    expect(ast.methods[0].body).toEqual([]);
  });

  it("handles class with only fields", () => {
    const ast = parseTweedle(`class X {
      WholeNumber a;
      TextString b;
    }`);
    expect(ast.methods).toEqual([]);
    expect(ast.constructors).toEqual([]);
    expect(ast.fields).toHaveLength(2);
  });

  it("handles class with only a constructor", () => {
    const ast = parseTweedle(`class X {
      X() { }
    }`);
    expect(ast.constructors).toHaveLength(1);
    expect(ast.methods).toEqual([]);
    expect(ast.fields).toEqual([]);
  });

  it("handles semicolons in class body", () => {
    const ast = parseTweedle(`class X {
      ;
      void m() { }
      ;
    }`);
    expect(ast.methods).toHaveLength(1);
  });

  it("handles optional default parameter with method call default", () => {
    const ast = parseTweedle(`class X {
      void setColor(Color color,
                     Duration duration <- Default.duration(),
                     AnimationStyle animationStyle <- Default.animationStyle()) {
        this.doIt();
      }
    }`);
    const params = ast.methods[0].parameters;
    expect(params).toHaveLength(3);
    expect(params[0].defaultValue).toBeNull();
    expect(params[1].defaultValue).not.toBeNull();
    expect(params[2].defaultValue).not.toBeNull();
  });

  it("handles deeply chained member access and method calls", () => {
    const ast = parseTweedle(`class X {
      void m() {
        this.a.b.c.d();
      }
    }`);
    const stmt = ast.methods[0].body[0] as {
      type: "ExpressionStatement";
      expression: { type: string; methodName: string };
    };
    expect(stmt.expression.type).toBe("MethodInvocation");
    expect(stmt.expression.methodName).toBe("d");
  });

  it("handles multi-line method parameters", () => {
    const ast = parseTweedle(`class X {
      void setColor(Color color,
                     Duration duration <- Default.duration(),
                     AnimationStyle animationStyle <- Default.animationStyle()) {
      }
    }`);
    expect(ast.methods[0].parameters).toHaveLength(3);
  });

  it("handles 0 as integer literal", () => {
    const ast = parseTweedle(`class X {
      WholeNumber get() { return 0; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { value: number };
    };
    expect(ret.expression.value).toBe(0);
  });

  it("handles .5 as float literal", () => {
    const ast = parseTweedle(`class X {
      DecimalNumber get() { return 0.5; }
    }`);
    const ret = ast.methods[0].body[0] as {
      type: "Return";
      expression: { value: number };
    };
    expect(ret.expression.value).toBeCloseTo(0.5);
  });
});
