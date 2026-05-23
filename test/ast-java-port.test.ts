import { describe, expect, it } from "vitest";
import {
  ArithmeticInfixExpression,
  ArrayLength,
  BlockStatement,
  ClassDeclaration,
  ConstructorBlockStatement,
  FieldDeclaration,
  IntegerLiteral,
  LocalAccess,
  LogicalComplement,
  MethodDeclaration,
  NamedUserType,
  NodeListProperty,
  NodeProperty,
  ParameterAccess,
  ResourceExpression,
  ReturnStatement,
  StringConcatenation,
  SuperConstructorInvocationStatement,
  ThisConstructorInvocationStatement,
  TypeExpression,
  UserField,
  UserLocal,
  UserMethod,
  UserParameter,
  hydrateExpression,
  hydrateStatement,
  simpleTypeRef,
} from "../src/ast-nodes.js";

describe("Java AST parity ports", () => {
  it("keeps legacy declaration nodes in the richer Java-style hierarchy", () => {
    const ast = new ClassDeclaration(
      "Scene",
      "SScene",
      null,
      "@Public",
      [],
      [new MethodDeclaration("move", { type: "VoidTypeRef" }, [], [], false)],
      [new FieldDeclaration("camera", simpleTypeRef("SCamera"), null, false, false)],
    );

    expect(ast).toBeInstanceOf(NamedUserType);
    expect(ast.methods[0]).toBeInstanceOf(UserMethod);
    expect(ast.fields[0]).toBeInstanceOf(UserField);
    expect(ast.getDeclaredMethods()).toHaveLength(1);
    expect(ast.getDeclaredFields()).toHaveLength(1);
  });

  it("hydrates Java-specific expression variants with real typing logic", () => {
    const arithmetic = hydrateExpression({
      type: "ArithmeticInfixExpression",
      operator: "+",
      left: { type: "Literal", value: 1, literalType: "number" },
      right: { type: "Literal", value: 2, literalType: "number" },
    });
    const logical = hydrateExpression({
      type: "LogicalComplement",
      operand: { type: "Literal", value: true, literalType: "boolean" },
    });
    const local = hydrateExpression({
      type: "LocalAccess",
      name: "count",
      valueType: simpleTypeRef("WholeNumber"),
    });
    const parameter = hydrateExpression({
      type: "ParameterAccess",
      name: "message",
      valueType: simpleTypeRef("String"),
    });

    expect(arithmetic).toBeInstanceOf(ArithmeticInfixExpression);
    expect(arithmetic.getType()).toEqual(simpleTypeRef("WholeNumber"));
    expect(logical).toBeInstanceOf(LogicalComplement);
    expect(logical.getType()).toEqual(simpleTypeRef("Boolean"));
    expect(local).toBeInstanceOf(LocalAccess);
    expect(local.getType()).toEqual(simpleTypeRef("WholeNumber"));
    expect(parameter).toBeInstanceOf(ParameterAccess);
    expect(parameter.getType()).toEqual(simpleTypeRef("String"));
  });

  it("hydrates constructor/loop statements and preserves attached children", () => {
    const statement = hydrateStatement({
      type: "ConstructorBlockStatement",
      constructorInvocationStatement: {
        type: "ThisConstructorInvocationStatement",
        className: "Scene",
        arguments: [{ name: null, value: { type: "Literal", value: 1, literalType: "number" } }],
      },
      body: [
        {
          type: "Return",
          expression: { type: "Literal", value: 1, literalType: "number" },
        },
      ],
    });

    expect(statement).toBeInstanceOf(ConstructorBlockStatement);
    expect(statement.constructorInvocationStatement).toBeInstanceOf(ThisConstructorInvocationStatement);
    expect(statement.body[0]).toBeInstanceOf(ReturnStatement);
    expect(statement.body[0].parent).toBe(statement);
  });

  it("supports visitor dispatch and property wrappers", () => {
    const field = new FieldDeclaration("score", simpleTypeRef("WholeNumber"), new IntegerLiteral(1), false, false);
    const nodeProperty = new NodeProperty<FieldDeclaration | null>(field, null);
    const nodeList = new NodeListProperty<FieldDeclaration>(field);

    nodeProperty.setValue(field);
    nodeList.add(field);

    const visited = new StringConcatenation(new IntegerLiteral(1), new IntegerLiteral(2)).accept({
      visitStringConcatenation: () => "concat",
    });

    expect(nodeProperty.getValue()).toBe(field);
    expect(nodeList.getValue()).toEqual([field]);
    expect(visited).toBe("concat");
  });

  it("ports utility node types with concrete behavior", () => {
    const local = new UserLocal("items", simpleTypeRef("Thing", true), false);
    const parameter = new UserParameter("message", simpleTypeRef("String"));
    const field = new UserField("items", simpleTypeRef("Thing", true), null, false, false);
    const length = new ArrayLength(new LocalAccess(local));
    const typeExpression = new TypeExpression(simpleTypeRef("SCamera"));
    const resourceExpression = new ResourceExpression(simpleTypeRef("Paint"), { id: "white" });
    const constructorInvocation = new SuperConstructorInvocationStatement(null, []);

    expect(length.getType()).toEqual(simpleTypeRef("WholeNumber"));
    expect(typeExpression.getType()).toEqual(simpleTypeRef("Type"));
    expect(resourceExpression.getType()).toEqual(simpleTypeRef("Paint"));
    expect(field.getGetters()).toHaveLength(2);
    expect(field.getSetters()).toHaveLength(2);
    expect(parameter.paramType).toEqual(simpleTypeRef("String"));
    expect(constructorInvocation.arguments).toEqual([]);
  });
});
