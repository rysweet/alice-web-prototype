import { describe, expect, it } from "vitest";
import {
  ArithmeticExpression,
  BooleanLiteral,
  FieldAccessExpression,
  LogicalExpression,
  MethodCallExpression,
  NullExpression,
  NumberLiteral,
  RelationalExpression,
  StringConcatenation,
  StringLiteral,
  ThisExpression,
  evaluateExpression,
} from "../src/expression-types.js";

describe("expression-types", () => {
  it("evaluates arithmetic and relational expressions", () => {
    const arithmetic = new ArithmeticExpression(
      "modulo",
      new ArithmeticExpression("multiply", new NumberLiteral(7), new NumberLiteral(3)),
      new NumberLiteral(5),
    );
    const relation = new RelationalExpression("gt", arithmetic, new NumberLiteral(0));

    expect(arithmetic.evaluate()).toBe(1);
    expect(relation.evaluate()).toBe(true);
  });

  it("short-circuits logical expressions", () => {
    let evaluatedRight = false;
    const right = {
      evaluate: () => {
        evaluatedRight = true;
        return true;
      },
    };

    expect(new LogicalExpression("or", new BooleanLiteral(true), right).evaluate()).toBe(true);
    expect(evaluatedRight).toBe(false);
    expect(new LogicalExpression("not", new BooleanLiteral(false)).evaluate()).toBe(true);
  });

  it("concatenates strings and resolves field access from this", () => {
    const thisValue = { name: "Alice", role: "guide" };
    const name = new FieldAccessExpression(new ThisExpression(), "name");
    const text = new StringConcatenation(new StringLiteral("Hello "), name);

    expect(text.evaluate({ thisValue })).toBe("Hello Alice");
    expect(evaluateExpression(new FieldAccessExpression(new ThisExpression(), "role"), { thisValue })).toBe("guide");
  });

  it("invokes object methods and returns their values", () => {
    const greeter = {
      prefix: "Hi",
      greet(name: string, punctuation: string) {
        return `${this.prefix} ${name}${punctuation}`;
      },
    };
    const methodCall = new MethodCallExpression(
      greeter,
      "greet",
      [new StringLiteral("world"), new StringLiteral("!")],
    );

    expect(methodCall.evaluate()).toBe("Hi world!");
  });

  it("preserves literal values for strings, booleans, numbers, null, and this", () => {
    expect(new NumberLiteral(3.5).evaluate()).toBe(3.5);
    expect(new StringLiteral("scene").evaluate()).toBe("scene");
    expect(new BooleanLiteral(true).evaluate()).toBe(true);
    expect(new NullExpression().evaluate()).toBeNull();
    expect(new ThisExpression().evaluate({ thisValue: { active: true } })).toEqual({ active: true });
  });
});
