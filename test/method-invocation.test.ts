import { describe, expect, it } from "vitest";
import { simpleTypeRef } from "../src/ast-nodes.js";
import {
  ClassDeclaration,
  ConstructorDeclaration,
  InheritanceResolver,
  MethodDeclaration,
  MethodSignature,
} from "../src/class-system.js";
import {
  ConstructorInvocation,
  InvocationFormatter,
  InvocationValidator,
  LambdaInvocation,
  MethodInvocation,
  MethodOverride,
  SuperCall,
} from "../src/method-invocation.js";

function buildResolver() {
  const base = new ClassDeclaration("Actor");
  base
    .addConstructor(new ConstructorDeclaration("Actor", [{ name: "name", paramType: simpleTypeRef("String") }]))
    .addMethod(new MethodDeclaration("move", { type: "VoidTypeRef" }, [{ name: "distance", paramType: simpleTypeRef("WholeNumber") }]))
    .addMethod(new MethodDeclaration("describe", simpleTypeRef("String")));

  const child = new ClassDeclaration("Hero", "Actor");
  child
    .addConstructor(new ConstructorDeclaration("Hero", [{ name: "name", paramType: simpleTypeRef("String") }]))
    .addMethod(new MethodDeclaration("describe", simpleTypeRef("String")));

  return { base, child, resolver: new InheritanceResolver([base, child]) };
}

describe("method-invocation", () => {
  it("resolves method calls and formats pseudocode", () => {
    const { resolver } = buildResolver();
    const invocation = new MethodInvocation("Hero", "move", [{ value: 1, type: simpleTypeRef("WholeNumber") }], resolver);
    const formatter = new InvocationFormatter();
    const validator = new InvocationValidator();

    expect(invocation.resolve()?.name).toBe("move");
    expect(invocation.getSignature()?.toString()).toBe("move(WholeNumber): void");
    expect(validator.validateMethodInvocation(invocation)).toEqual([]);
    expect(formatter.formatMethodInvocation(invocation)).toBe("Hero move 1");
  });

  it("validates constructor calls and super calls against inherited declarations", () => {
    const { child, resolver } = buildResolver();
    const constructorInvocation = new ConstructorInvocation(child, [{ value: "Ada", type: simpleTypeRef("String") }]);
    const superCall = new SuperCall(child, "describe", [], resolver);
    const validator = new InvocationValidator();
    const formatter = new InvocationFormatter();

    expect(constructorInvocation.resolve()?.name).toBe("Hero");
    expect(validator.validateConstructorInvocation(constructorInvocation)).toEqual([]);
    expect(superCall.resolveSuperMethod()?.name).toBe("describe");
    expect(validator.validateSuperCall(superCall)).toEqual([]);
    expect(formatter.formatConstructorInvocation(constructorInvocation)).toContain("new Hero");
    expect(formatter.formatSuperCall(superCall)).toBe("super describe");
  });

  it("flags incompatible overrides and invokes lambdas", () => {
    const { child, resolver } = buildResolver();
    const invalidOverride = new MethodDeclaration("describe", simpleTypeRef("WholeNumber"));
    const methodOverride = new MethodOverride(child, invalidOverride, resolver);
    const lambda = new LambdaInvocation(
      new MethodSignature("sum", [simpleTypeRef("WholeNumber"), simpleTypeRef("WholeNumber")], simpleTypeRef("WholeNumber")),
      (...args) => Number(args[0]) + Number(args[1]),
      [2, 3],
    );
    const validator = new InvocationValidator();
    const formatter = new InvocationFormatter();

    expect(validator.validateOverride(methodOverride)[0]?.kind).toBe("return-type");
    expect(lambda.invoke()).toBe(5);
    expect(validator.validateLambdaInvocation(lambda)).toEqual([]);
    expect(formatter.formatOverride(methodOverride)).toContain("Hero.describe overrides Actor.describe");
    expect(formatter.formatLambdaInvocation(lambda)).toBe("lambda sum(2, 3)");
  });
});
