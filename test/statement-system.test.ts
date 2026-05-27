import { describe, expect, it } from "vitest";
import {
  DoInOrder,
  DoTogether,
  ExpressionStatement,
  ForEachLoop,
  IfStatement,
  LocalDeclaration,
  ReturnStatement,
  StatementBlock,
  StatementFactory,
  StatementFormatter,
  StatementValidator,
  WhileLoop,
} from "../src/statement-system.js";

describe("statement-system", () => {
  it("creates statement templates for every requested statement kind", () => {
    const factory = new StatementFactory();

    expect(factory.create("if")).toBeInstanceOf(IfStatement);
    expect(factory.create("while")).toBeInstanceOf(WhileLoop);
    expect(factory.create("for-each")).toBeInstanceOf(ForEachLoop);
    expect(factory.create("do-in-order")).toBeInstanceOf(DoInOrder);
    expect(factory.create("do-together")).toBeInstanceOf(DoTogether);
    expect(factory.create("return")).toBeInstanceOf(ReturnStatement);
    expect(factory.create("expression")).toBeInstanceOf(ExpressionStatement);
    expect(factory.create("local-declaration")).toBeInstanceOf(LocalDeclaration);
  });

  it("validates statement structure identifiers and return types", () => {
    const validator = new StatementValidator();
    const block = new StatementBlock([
      new IfStatement("", new StatementBlock([new ExpressionStatement("")])),
      new LocalDeclaration("1bad", "WholeNumber", "hello", "String"),
      new ReturnStatement("hero", "Actor"),
    ]);

    const issues = validator.validateBlock(block, { expectedReturnType: "WholeNumber" });

    expect(issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      "If statements require a condition.",
      "Expression statements must not be blank.",
      "Local variable names must be valid identifiers.",
      "Initializer type is incompatible with the declared local type.",
      "Return expression type does not match the enclosing method.",
    ]));
  });

  it("formats nested blocks into readable pseudocode", () => {
    const formatter = new StatementFormatter();
    const block = new StatementBlock([
      new LocalDeclaration("score", "WholeNumber", "0", "WholeNumber"),
      new DoInOrder(new StatementBlock([
        new IfStatement(
          "score > 10",
          new StatementBlock([new ExpressionStatement("celebrate()")]),
          new StatementBlock([new ExpressionStatement("keepPlaying()")]),
        ),
        new WhileLoop("score < 20", new StatementBlock([
          new ForEachLoop("enemy", "Enemy", "enemies", new StatementBlock([
            new ExpressionStatement("tag(enemy)"),
          ])),
        ])),
      ])),
      new DoTogether(new StatementBlock([
        new ExpressionStatement("animateHero()"),
        new ReturnStatement("score", "WholeNumber"),
      ])),
    ]);

    const formatted = formatter.formatBlock(block);

    expect(formatted).toContain("WholeNumber score = 0");
    expect(formatted).toContain("if score > 10 then");
    expect(formatted).toContain("for each Enemy enemy in enemies");
    expect(formatted).toContain("do together");
    expect(formatted).toContain("return score");
  });
});
