import { describe, expect, it } from "vitest";
import { IntegerLiteral, StringLiteral, simpleTypeRef } from "../src/ast-nodes.js";
import {
  ClassDeclaration,
  ConstructorDeclaration,
  FieldDeclaration,
  InheritanceResolver,
  MethodDeclaration,
  MethodSignature,
} from "../src/class-system.js";

function buildHierarchy() {
  const base = new ClassDeclaration("Actor");
  base
    .addConstructor(new ConstructorDeclaration("Actor"))
    .addField(new FieldDeclaration("name", simpleTypeRef("String"), new StringLiteral("Ada")))
    .addMethod(new MethodDeclaration("greet", simpleTypeRef("String"), [{ name: "message", paramType: simpleTypeRef("String") }]));

  const child = new ClassDeclaration("Hero", "Actor");
  child
    .addField(new FieldDeclaration("score", simpleTypeRef("WholeNumber"), new IntegerLiteral(10)))
    .addMethod(new MethodDeclaration("jump", { type: "VoidTypeRef" }));

  return { base, child, resolver: new InheritanceResolver([base, child]) };
}

describe("class-system", () => {
  it("tracks declarations and resolves inherited members", () => {
    const { child, resolver } = buildHierarchy();

    const field = resolver.resolveField(child, "name");
    const method = resolver.resolveMethod(child, "greet", [simpleTypeRef("String")]);

    expect(child.findField("score")?.name).toBe("score");
    expect(child.findMethod("jump")?.name).toBe("jump");
    expect(field?.owner.name).toBe("Actor");
    expect(field?.member.name).toBe("name");
    expect(method?.owner.name).toBe("Actor");
    expect(method?.member.name).toBe("greet");
    expect(method?.depth).toBe(1);
  });

  it("builds comparable method signatures", () => {
    const signature = new MethodSignature("greet", [simpleTypeRef("String")], simpleTypeRef("String"));
    const matchingMethod = new MethodDeclaration("greet", simpleTypeRef("String"), [{ name: "message", paramType: simpleTypeRef("String") }]);
    const mismatchedMethod = new MethodDeclaration("greet", simpleTypeRef("String"), [{ name: "count", paramType: simpleTypeRef("WholeNumber") }]);

    expect(signature.equals(MethodSignature.fromMethod(matchingMethod))).toBe(true);
    expect(signature.matchesMethod(matchingMethod)).toBe(true);
    expect(signature.matchesMethod(mismatchedMethod)).toBe(false);
    expect(signature.toString()).toBe("greet(String): String");
  });

  it("clones class declarations without sharing member instances", () => {
    const { child } = buildHierarchy();
    const cloned = child.clone("HeroClone");

    expect(cloned.name).toBe("HeroClone");
    expect(cloned.fields).toHaveLength(1);
    expect(cloned.methods).toHaveLength(1);
    expect(cloned.fields[0]).not.toBe(child.fields[0]);
    expect(cloned.methods[0]).not.toBe(child.methods[0]);
  });
});
