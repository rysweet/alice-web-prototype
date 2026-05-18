import { describe, it, expect } from "vitest";
import { parseTweedle } from "../src/tweedle-parser.js";
import {
  generateTweedle,
  generateStatement,
  generateExpression,
  TweedleCodegenError,
} from "../src/tweedle-codegen.js";
import type {
  ClassDecl,
  Statement,
  Expression,
  TypeRef,
  Parameter,
  Argument,
} from "../src/tweedle-parser.js";

// ═══════════════════════════════════════════════════════════════════════════
// 1. PUBLIC API & ERROR CLASS
// ═══════════════════════════════════════════════════════════════════════════

describe("generateTweedle – public API", () => {
  it("exports generateTweedle as a function", () => {
    expect(typeof generateTweedle).toBe("function");
  });

  it("exports generateStatement as a function", () => {
    expect(typeof generateStatement).toBe("function");
  });

  it("exports generateExpression as a function", () => {
    expect(typeof generateExpression).toBe("function");
  });

  it("exports TweedleCodegenError as a class", () => {
    expect(TweedleCodegenError).toBeDefined();
    expect(typeof TweedleCodegenError).toBe("function");
  });

  it("TweedleCodegenError is an Error subclass", () => {
    const err = new TweedleCodegenError("test", "SomeNode");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TweedleCodegenError);
  });

  it("TweedleCodegenError exposes nodeType", () => {
    const err = new TweedleCodegenError("msg", "BadNode");
    expect(err.message).toBe("msg");
    expect(err.nodeType).toBe("BadNode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. SECURITY GUARDS
// ═══════════════════════════════════════════════════════════════════════════

describe("Security guards", () => {
  it("throws TweedleCodegenError on null input", () => {
    expect(() => generateTweedle(null as unknown as ClassDecl)).toThrow(
      TweedleCodegenError,
    );
  });

  it("throws TweedleCodegenError on undefined input", () => {
    expect(() => generateTweedle(undefined as unknown as ClassDecl)).toThrow(
      TweedleCodegenError,
    );
  });

  it("null input error has nodeType 'null'", () => {
    try {
      generateTweedle(null as unknown as ClassDecl);
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(TweedleCodegenError);
      expect((e as TweedleCodegenError).nodeType).toBe("null");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. CLASS DECLARATION GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Class declaration generation", () => {
  it("generates minimal class", () => {
    const ast = parseTweedle("class Foo extends SThing { Foo() {} }");
    const output = generateTweedle(ast);
    expect(output).toContain("class Foo extends SThing");
    expect(output).toContain("{");
    expect(output).toContain("}");
  });

  it("generates class with models clause", () => {
    const ast = parseTweedle(
      "class MyScene extends SScene models MySceneModel { MyScene() {} }",
    );
    const output = generateTweedle(ast);
    expect(output).toContain("models MySceneModel");
  });

  it("output ends with a trailing newline", () => {
    const ast = parseTweedle("class Foo extends SThing { Foo() {} }");
    const output = generateTweedle(ast);
    expect(output.endsWith("\n")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. CONSTRUCTOR GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Constructor generation", () => {
  it("generates constructor with class name", () => {
    const ast = parseTweedle("class Foo extends SThing { Foo() {} }");
    const output = generateTweedle(ast);
    expect(output).toContain("Foo()");
  });

  it("generates constructor with parameters", () => {
    const ast = parseTweedle(
      "class Foo extends SThing { Foo(DecimalNumber x, TextString name) {} }",
    );
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber x");
    expect(output).toContain("TextString name");
  });

  it("generates constructor body", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {
          this.x <- 42;
        }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("this.x <- 42");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. METHOD GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Method generation", () => {
  it("generates void method", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doStuff() {
          doInOrder {}
        }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("void doStuff()");
  });

  it("generates method with return type", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        DecimalNumber getVal() {
          return 42;
        }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber getVal()");
  });

  it("generates static method", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        static DecimalNumber compute(DecimalNumber x) {
          return x * 2;
        }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("static DecimalNumber compute");
  });

  it("generates method with parameters", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void move(DecimalNumber amount) {
          doInOrder {}
        }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber amount");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. FIELD GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Field generation", () => {
  it("generates field with initializer", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        DecimalNumber score <- 0;
        Foo() {}
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber score <- 0;");
  });

  it("generates constant field", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        constant TextString GREETING <- "hello";
        Foo() {}
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("constant TextString GREETING");
  });

  it("generates static field", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        static WholeNumber count <- 0;
        Foo() {}
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("static WholeNumber count");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. STATEMENT GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Statement generation", () => {
  it("generates DoInOrder", () => {
    const stmt: Statement = {
      type: "DoInOrder",
      body: [],
    };
    const output = generateStatement(stmt);
    expect(output).toContain("doInOrder");
    expect(output).toContain("{");
    expect(output).toContain("}");
  });

  it("generates DoTogether", () => {
    const stmt: Statement = {
      type: "DoTogether",
      body: [],
    };
    const output = generateStatement(stmt);
    expect(output).toContain("doTogether");
  });

  it("generates IfElse with else", () => {
    const stmt: Statement = {
      type: "IfElse",
      condition: { type: "Literal", value: true, literalType: "boolean" },
      ifBody: [],
      elseBody: [],
    };
    const output = generateStatement(stmt);
    expect(output).toContain("if");
    expect(output).toContain("else");
  });

  it("generates IfElse without else", () => {
    const stmt: Statement = {
      type: "IfElse",
      condition: { type: "Literal", value: true, literalType: "boolean" },
      ifBody: [],
      elseBody: null,
    };
    const output = generateStatement(stmt);
    expect(output).toContain("if");
    expect(output).not.toContain("else");
  });

  it("generates ForEach", () => {
    const stmt: Statement = {
      type: "ForEach",
      itemType: { type: "SimpleTypeRef", name: "SBiped", isArray: false },
      itemName: "character",
      collection: { type: "Identifier", name: "characters" },
      body: [],
    };
    const output = generateStatement(stmt);
    expect(output).toContain("forEach");
    expect(output).toContain("SBiped character");
    expect(output).toContain("in");
  });

  it("generates CountUpTo", () => {
    const stmt: Statement = {
      type: "CountUpTo",
      count: { type: "Literal", value: 10, literalType: "number" },
      body: [],
    };
    const output = generateStatement(stmt);
    expect(output).toContain("countUpTo");
    expect(output).toContain("10");
  });

  it("generates Return with expression", () => {
    const stmt: Statement = {
      type: "Return",
      expression: { type: "Literal", value: 42, literalType: "number" },
    };
    const output = generateStatement(stmt);
    expect(output).toBe("return 42;");
  });

  it("generates Return without expression", () => {
    const stmt: Statement = {
      type: "Return",
      expression: null,
    };
    const output = generateStatement(stmt);
    expect(output).toBe("return;");
  });

  it("generates ExpressionStatement", () => {
    const stmt: Statement = {
      type: "ExpressionStatement",
      expression: {
        type: "MethodInvocation",
        target: { type: "This" },
        methodName: "doStuff",
        arguments: [],
      },
    };
    const output = generateStatement(stmt);
    expect(output).toContain("this.doStuff()");
    expect(output).toMatch(/;$/);
  });

  it("generates LocalVariableDeclaration", () => {
    const stmt: Statement = {
      type: "LocalVariableDeclaration",
      name: "total",
      varType: { type: "SimpleTypeRef", name: "DecimalNumber", isArray: false },
      initializer: { type: "Literal", value: 0, literalType: "number" },
      isConstant: false,
    };
    const output = generateStatement(stmt);
    expect(output).toContain("DecimalNumber total <- 0;");
  });

  it("generates constant LocalVariableDeclaration", () => {
    const stmt: Statement = {
      type: "LocalVariableDeclaration",
      name: "name",
      varType: { type: "SimpleTypeRef", name: "TextString", isArray: false },
      initializer: { type: "Literal", value: "Alice", literalType: "string" },
      isConstant: true,
    };
    const output = generateStatement(stmt);
    expect(output).toContain("constant");
    expect(output).toContain("TextString name");
  });

  it("generates DisabledBlock", () => {
    const stmt: Statement = {
      type: "DisabledBlock",
      raw: "/* disabled code */",
    };
    const output = generateStatement(stmt);
    expect(output).toContain("/* disabled code */");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 8. EXPRESSION GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Expression generation", () => {
  it("generates number literal (integer)", () => {
    const expr: Expression = { type: "Literal", value: 42, literalType: "number" };
    expect(generateExpression(expr)).toBe("42");
  });

  it("generates number literal (decimal)", () => {
    const expr: Expression = { type: "Literal", value: 3.14, literalType: "number" };
    expect(generateExpression(expr)).toBe("3.14");
  });

  it("generates number literal (zero)", () => {
    const expr: Expression = { type: "Literal", value: 0, literalType: "number" };
    expect(generateExpression(expr)).toBe("0");
  });

  it("generates string literal", () => {
    const expr: Expression = { type: "Literal", value: "hello", literalType: "string" };
    expect(generateExpression(expr)).toBe('"hello"');
  });

  it("generates boolean true", () => {
    const expr: Expression = { type: "Literal", value: true, literalType: "boolean" };
    expect(generateExpression(expr)).toBe("true");
  });

  it("generates boolean false", () => {
    const expr: Expression = { type: "Literal", value: false, literalType: "boolean" };
    expect(generateExpression(expr)).toBe("false");
  });

  it("generates null", () => {
    const expr: Expression = { type: "Literal", value: null, literalType: "null" };
    expect(generateExpression(expr)).toBe("null");
  });

  it("generates This", () => {
    expect(generateExpression({ type: "This" })).toBe("this");
  });

  it("generates Super", () => {
    expect(generateExpression({ type: "Super" })).toBe("super");
  });

  it("generates Identifier", () => {
    expect(generateExpression({ type: "Identifier", name: "myVar" })).toBe("myVar");
  });

  it("generates MemberAccess", () => {
    const expr: Expression = {
      type: "MemberAccess",
      target: { type: "This" },
      memberName: "bunny",
    };
    expect(generateExpression(expr)).toBe("this.bunny");
  });

  it("generates chained MemberAccess", () => {
    const expr: Expression = {
      type: "MemberAccess",
      target: {
        type: "MemberAccess",
        target: { type: "This" },
        memberName: "bunny",
      },
      memberName: "position",
    };
    expect(generateExpression(expr)).toBe("this.bunny.position");
  });

  it("generates MethodInvocation with no args", () => {
    const expr: Expression = {
      type: "MethodInvocation",
      target: { type: "This" },
      methodName: "doStuff",
      arguments: [],
    };
    expect(generateExpression(expr)).toBe("this.doStuff()");
  });

  it("generates MethodInvocation with positional args", () => {
    const expr: Expression = {
      type: "MethodInvocation",
      target: { type: "This" },
      methodName: "move",
      arguments: [
        { name: null, value: { type: "Literal", value: 1, literalType: "number" } },
      ],
    };
    expect(generateExpression(expr)).toBe("this.move(1)");
  });

  it("generates MethodInvocation with named args", () => {
    const expr: Expression = {
      type: "MethodInvocation",
      target: { type: "This" },
      methodName: "move",
      arguments: [
        {
          name: "direction",
          value: { type: "Identifier", name: "UP" },
        },
        {
          name: "amount",
          value: { type: "Literal", value: 1.0, literalType: "number" },
        },
      ],
    };
    const result = generateExpression(expr);
    expect(result).toContain("direction: UP");
    expect(result).toContain("amount: 1");
  });

  it("generates MethodInvocation without target", () => {
    const expr: Expression = {
      type: "MethodInvocation",
      target: null,
      methodName: "doSomething",
      arguments: [
        { name: null, value: { type: "Literal", value: 1, literalType: "number" } },
      ],
    };
    expect(generateExpression(expr)).toBe("doSomething(1)");
  });

  it("generates NewInstance", () => {
    const expr: Expression = {
      type: "NewInstance",
      className: "Color",
      arguments: [
        { name: null, value: { type: "Literal", value: 1.0, literalType: "number" } },
        { name: null, value: { type: "Literal", value: 0.0, literalType: "number" } },
        { name: null, value: { type: "Literal", value: 0.0, literalType: "number" } },
      ],
    };
    const result = generateExpression(expr);
    expect(result).toContain("new Color(");
    expect(result).toContain("1");
    expect(result).toContain("0");
  });

  it("generates NewArray with elements", () => {
    const expr: Expression = {
      type: "NewArray",
      elementType: { type: "SimpleTypeRef", name: "DecimalNumber", isArray: false },
      elements: [
        { type: "Literal", value: 1, literalType: "number" },
        { type: "Literal", value: 2, literalType: "number" },
        { type: "Literal", value: 3, literalType: "number" },
      ],
      size: null,
    };
    const result = generateExpression(expr);
    expect(result).toContain("new DecimalNumber[]");
    expect(result).toContain("1");
    expect(result).toContain("2");
    expect(result).toContain("3");
  });

  it("generates NewArray with size", () => {
    const expr: Expression = {
      type: "NewArray",
      elementType: { type: "SimpleTypeRef", name: "DecimalNumber", isArray: false },
      elements: [],
      size: { type: "Literal", value: 10, literalType: "number" },
    };
    const result = generateExpression(expr);
    expect(result).toContain("new DecimalNumber[10]");
  });

  it("generates BinaryOp", () => {
    const expr: Expression = {
      type: "BinaryOp",
      operator: "+",
      left: { type: "Literal", value: 1, literalType: "number" },
      right: { type: "Literal", value: 2, literalType: "number" },
    };
    expect(generateExpression(expr)).toBe("1 + 2");
  });

  it("generates UnaryOp (not)", () => {
    const expr: Expression = {
      type: "UnaryOp",
      operator: "!",
      operand: { type: "Identifier", name: "done" },
    };
    expect(generateExpression(expr)).toBe("!done");
  });

  it("generates UnaryOp (negate)", () => {
    const expr: Expression = {
      type: "UnaryOp",
      operator: "-",
      operand: { type: "Identifier", name: "amount" },
    };
    expect(generateExpression(expr)).toBe("-amount");
  });

  it("generates Assignment", () => {
    const expr: Expression = {
      type: "Assignment",
      target: {
        type: "MemberAccess",
        target: { type: "This" },
        memberName: "score",
      },
      value: { type: "Literal", value: 100, literalType: "number" },
    };
    expect(generateExpression(expr)).toBe("this.score <- 100");
  });

  it("generates ArrayAccess", () => {
    const expr: Expression = {
      type: "ArrayAccess",
      target: { type: "Identifier", name: "items" },
      index: { type: "Literal", value: 0, literalType: "number" },
    };
    expect(generateExpression(expr)).toBe("items[0]");
  });

  it("generates TypeCast", () => {
    const expr: Expression = {
      type: "TypeCast",
      expression: { type: "Identifier", name: "value" },
      targetType: { type: "SimpleTypeRef", name: "DecimalNumber", isArray: false },
    };
    const result = generateExpression(expr);
    expect(result).toContain("as DecimalNumber");
  });

  it("generates InstanceOf", () => {
    const expr: Expression = {
      type: "InstanceOf",
      expression: { type: "Identifier", name: "entity" },
      testType: { type: "SimpleTypeRef", name: "SBiped", isArray: false },
    };
    const result = generateExpression(expr);
    expect(result).toContain("instanceof SBiped");
  });

  it("generates Parenthesized", () => {
    const expr: Expression = {
      type: "Parenthesized",
      expression: {
        type: "BinaryOp",
        operator: "+",
        left: { type: "Identifier", name: "a" },
        right: { type: "Identifier", name: "b" },
      },
    };
    expect(generateExpression(expr)).toBe("(a + b)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 9. STRING ESCAPING
// ═══════════════════════════════════════════════════════════════════════════

describe("String escaping", () => {
  it("escapes backslash", () => {
    const expr: Expression = {
      type: "Literal",
      value: "back\\slash",
      literalType: "string",
    };
    const result = generateExpression(expr);
    expect(result).toBe('"back\\\\slash"');
  });

  it("escapes double quotes", () => {
    const expr: Expression = {
      type: "Literal",
      value: 'say "hello"',
      literalType: "string",
    };
    const result = generateExpression(expr);
    expect(result).toBe('"say \\"hello\\""');
  });

  it("escapes newline", () => {
    const expr: Expression = {
      type: "Literal",
      value: "line1\nline2",
      literalType: "string",
    };
    const result = generateExpression(expr);
    expect(result).toBe('"line1\\nline2"');
  });

  it("escapes tab", () => {
    const expr: Expression = {
      type: "Literal",
      value: "col1\tcol2",
      literalType: "string",
    };
    const result = generateExpression(expr);
    expect(result).toBe('"col1\\tcol2"');
  });

  it("escapes carriage return", () => {
    const expr: Expression = {
      type: "Literal",
      value: "line1\rline2",
      literalType: "string",
    };
    const result = generateExpression(expr);
    expect(result).toBe('"line1\\rline2"');
  });

  it("handles empty string", () => {
    const expr: Expression = {
      type: "Literal",
      value: "",
      literalType: "string",
    };
    expect(generateExpression(expr)).toBe('""');
  });

  it("handles string with multiple special characters", () => {
    const expr: Expression = {
      type: "Literal",
      value: 'say "hi"\nbye\\end',
      literalType: "string",
    };
    const result = generateExpression(expr);
    expect(result).toBe('"say \\"hi\\"\\nbye\\\\end"');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 10. TYPE REFERENCE GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("TypeRef generation", () => {
  it("generates simple type", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        DecimalNumber getVal() { return 0; }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber getVal()");
  });

  it("generates array type", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        DecimalNumber[] scores <- new DecimalNumber[] {1, 2, 3};
        Foo() {}
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber[]");
  });

  it("generates void return type", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doIt() { doInOrder {} }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("void doIt()");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 11. PARAMETER GENERATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Parameter generation", () => {
  it("generates varargs parameter", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doMany(DecimalNumber... values) { doInOrder {} }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("DecimalNumber... values");
  });

  it("generates parameter with default value", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doIt(SBiped character <- null) { doInOrder {} }
      }
    `);
    const output = generateTweedle(ast);
    expect(output).toContain("SBiped character <- null");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 12. INDENTATION
// ═══════════════════════════════════════════════════════════════════════════

describe("Indentation (2 spaces per level)", () => {
  it("class body is indented by 2 spaces", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doStuff() { doInOrder {} }
      }
    `);
    const output = generateTweedle(ast);
    const lines = output.split("\n");
    const methodLine = lines.find((l) => l.includes("void doStuff"));
    expect(methodLine).toBeDefined();
    expect(methodLine!.startsWith("  ")).toBe(true);
  });

  it("method body is indented by 4 spaces", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doStuff() {
          return;
        }
      }
    `);
    const output = generateTweedle(ast);
    const lines = output.split("\n");
    const returnLine = lines.find((l) => l.includes("return;"));
    expect(returnLine).toBeDefined();
    expect(returnLine!.startsWith("    ")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 13. ROUNDTRIP: parse → generate → parse
// ═══════════════════════════════════════════════════════════════════════════

describe("Roundtrip (parse → generate → parse)", () => {
  it("roundtrips a minimal class", () => {
    const source = "class Foo extends SThing { Foo() {} }";
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with methods and fields", () => {
    const source = `class Calc extends SThing {
  DecimalNumber value <- 0;
  Calc() {
    this.value <- 10;
  }
  DecimalNumber getValue() {
    return this.value;
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with doInOrder and doTogether", () => {
    const source = `class Scene extends SScene {
  Scene() {}
  void run() {
    doInOrder {
      this.bunny.say("hi");
    }
    doTogether {
      this.bunny.turn(0.5);
      this.cat.turn(0.5);
    }
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with if/else", () => {
    const source = `class Logic extends SThing {
  Logic() {}
  void check(DecimalNumber x) {
    if (x > 0) {
      this.say("positive");
    } else {
      this.say("non-positive");
    }
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with forEach", () => {
    const source = `class Loop extends SThing {
  Loop() {}
  void greetAll() {
    forEach (SBiped character in this.getCharacters()) {
      character.say("Hello!");
    }
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with countUpTo", () => {
    const source = `class Counter extends SThing {
  Counter() {}
  void countUp() {
    countUpTo (10) {
      this.say("counting");
    }
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with string escapes", () => {
    const source = `class Esc extends SThing {
  Esc() {}
  void run() {
    TextString s <- "hello\\nworld";
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with local variable declaration", () => {
    const source = `class Locals extends SThing {
  Locals() {}
  void run() {
    DecimalNumber total <- 0;
    constant TextString name <- "Alice";
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with binary and unary operations", () => {
    const source = `class Math extends SThing {
  Math() {}
  DecimalNumber compute(DecimalNumber x) {
    return -(x + 1) * 2;
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });

  it("roundtrips a class with new instance and array access", () => {
    const source = `class Arrays extends SThing {
  Arrays() {}
  void run() {
    DecimalNumber[] items <- new DecimalNumber[] {1, 2, 3};
    DecimalNumber first <- items[0];
  }
}`;
    const ast1 = parseTweedle(source);
    const output = generateTweedle(ast1);
    const ast2 = parseTweedle(output);
    expect(JSON.stringify(ast1)).toBe(JSON.stringify(ast2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 14. EDGE CASES
// ═══════════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  it("generates class with no methods or fields (only constructor)", () => {
    const ast = parseTweedle("class Empty extends SThing { Empty() {} }");
    const output = generateTweedle(ast);
    expect(output).toContain("class Empty extends SThing");
    expect(output).toContain("Empty()");
  });

  it("generates negative number literal", () => {
    const expr: Expression = {
      type: "UnaryOp",
      operator: "-",
      operand: { type: "Literal", value: 1, literalType: "number" },
    };
    expect(generateExpression(expr)).toBe("-1");
  });

  it("generates 0.5 number literal", () => {
    const expr: Expression = { type: "Literal", value: 0.5, literalType: "number" };
    expect(generateExpression(expr)).toBe("0.5");
  });

  it("handles Block statement", () => {
    const stmt: Statement = {
      type: "Block",
      body: [
        {
          type: "Return",
          expression: { type: "Literal", value: 1, literalType: "number" },
        },
      ],
    };
    const output = generateStatement(stmt);
    expect(output).toContain("{");
    expect(output).toContain("return 1;");
    expect(output).toContain("}");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 15. BLANK LINES BETWEEN MEMBERS
// ═══════════════════════════════════════════════════════════════════════════

describe("Blank lines between members", () => {
  it("inserts blank line between constructor and method", () => {
    const ast = parseTweedle(`
      class Foo extends SThing {
        Foo() {}
        void doStuff() {
          doInOrder {}
        }
      }
    `);
    const output = generateTweedle(ast);
    // There should be an empty line between the closing brace of constructor
    // and the method declaration
    expect(output).toMatch(/}\n\n\s+void doStuff/);
  });
});
