import { describe, expect, it } from "vitest";
import { ExpressionStatement, IntegerLiteral, ReturnStatement, StringLiteral, simpleTypeRef } from "../src/ast-nodes.js";
import { ClassDeclaration, MethodDeclaration } from "../src/class-system.js";
import {
  ASTCopier,
  ASTDiff,
  ASTInserter,
  ASTMover,
  ASTRemover,
  ASTReplacer,
  ASTValidator,
} from "../src/ast-manipulation.js";

describe("ast-manipulation", () => {
  it("inserts moves and removes statements inside method bodies", () => {
    const method = new MethodDeclaration("run", { type: "VoidTypeRef" }, [], [
      new ExpressionStatement(new StringLiteral("alpha")),
      new ExpressionStatement(new StringLiteral("omega")),
    ]);
    const inserter = new ASTInserter();
    const mover = new ASTMover();
    const remover = new ASTRemover();
    const inserted = new ExpressionStatement(new StringLiteral("middle"));

    inserter.insertStatement(method, inserted, 1);
    expect(method.body).toHaveLength(3);
    expect((method.body[1] as ExpressionStatement).expression).toBe(inserted.expression);
    expect(inserted.parent).toBe(method);

    mover.moveStatement(method, 1, 0);
    expect(((method.body[0] as ExpressionStatement).expression as StringLiteral).value).toBe("middle");

    const removed = remover.removeStatement(method, 2);
    expect(removed).toBeInstanceOf(ExpressionStatement);
    expect(method.body).toHaveLength(2);
  });

  it("deep copies trees and computes diffs for changed expressions", () => {
    const original = new ClassDeclaration("Counter", "Object", [], [
      new MethodDeclaration("value", simpleTypeRef("WholeNumber"), [], [
        new ReturnStatement(new IntegerLiteral(1), simpleTypeRef("WholeNumber")),
      ]),
    ]);
    const copier = new ASTCopier();
    const replacer = new ASTReplacer();
    const differ = new ASTDiff();
    const copy = copier.deepCopy(original);
    const returnStatement = copy.methods[0]!.body[0] as ReturnStatement;

    expect(copy).not.toBe(original);
    expect(copy.methods[0]).not.toBe(original.methods[0]);

    const replaced = replacer.replaceExpression(copy, returnStatement.expression!.id, new IntegerLiteral(99));
    const diff = differ.diff(original, copy);

    expect(replaced).toBe(true);
    expect((returnStatement.expression as IntegerLiteral).value).toBe(99);
    expect(diff.changed).toBe(true);
    expect(diff.differences.join("\n")).toContain("IntegerLiteral");
  });

  it("validates modified trees remain structurally sound", () => {
    const type = new ClassDeclaration("Greeter", "Object", [], [
      new MethodDeclaration("greet", { type: "VoidTypeRef" }, [], [
        new ExpressionStatement(new StringLiteral("hello")),
      ]),
    ]);
    const validator = new ASTValidator();

    expect(validator.validate(type)).toEqual([]);
  });
});
