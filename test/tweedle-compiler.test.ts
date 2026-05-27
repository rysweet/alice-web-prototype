import { describe, expect, it } from "vitest";
import {
  CompilationUnit,
  CompilerError,
  ImportResolver,
  TweedleCompiler,
  TypeResolver,
} from "../src/tweedle-compiler.js";

describe("tweedle-compiler", () => {
  it("compiles multiple units into executable ASTs and resolves imports", () => {
    const compiler = new TweedleCompiler();
    const [mainUnit, helperUnit] = compiler.compileUnits([
      {
        path: "Main.tweedle",
        source: `import Helper;
class Main {
  Helper helper <- null;
  void main() {
    this.helper.say("Hello");
  }
}`,
      },
      {
        path: "Helper.tweedle",
        source: `class Helper {
  void say(String message) {
  }
}`,
      },
    ]);

    expect(mainUnit).toBeInstanceOf(CompilationUnit);
    expect(mainUnit.success).toBe(true);
    expect(mainUnit.imports).toEqual(["Helper"]);
    expect(mainUnit.errors).toEqual([]);
    expect(mainUnit.executableAst?.entryPoint).toBe("Main.main");
    expect(mainUnit.executableAst?.methods.map((method) => method.name)).toContain("main");

    const typeResolver = new TypeResolver([mainUnit, helperUnit]);
    expect(typeResolver.resolveTypeReference("Helper", mainUnit)).toBe(helperUnit);
  });

  it("wraps syntax errors with source locations", () => {
    const unit = new TweedleCompiler().compile("class { }", "Broken.tweedle");

    expect(unit.success).toBe(false);
    expect(unit.errors).toHaveLength(1);
    expect(unit.errors[0]).toBeInstanceOf(CompilerError);
    expect(unit.errors[0].code).toBe("syntax-error");
    expect(unit.errors[0].location).toMatchObject({
      filePath: "Broken.tweedle",
      line: 1,
    });
  });

  it("reports unknown imports and unresolved types", () => {
    const [unit] = new TweedleCompiler().compileUnits([
      {
        path: "Main.tweedle",
        source: `import Missing;
class Main {
  Missing helper <- null;
}`,
      },
    ]);

    expect(unit.success).toBe(false);
    expect(unit.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["unknown-import", "unknown-type"]));
  });

  it("reports unused variable and unreachable code warnings", () => {
    const unit = new TweedleCompiler().compile(`class Main {
  void main() {
    WholeNumber count <- 1;
    return;
    WholeNumber later <- 2;
  }
}`);

    expect(unit.errors).toEqual([]);
    expect(unit.warnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["unused-variable", "unreachable-code"]));
  });

  it("strips import declarations without disturbing class parsing", () => {
    const resolver = new ImportResolver();
    const source = `import Alpha;
import beta.Gamma;
class Demo { }`;

    expect(resolver.resolveImports(source)).toEqual(["Alpha", "beta.Gamma"]);
    expect(resolver.stripImports(source)).toContain("class Demo");
    expect(resolver.localName("beta.Gamma")).toBe("Gamma");
  });
});
