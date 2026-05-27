import { simpleTypeRef } from "./ast-nodes-common-core.js";
import { UserLocal } from "./ast-nodes-declarations-base.js";
import { JavaConstructor } from "./ast-nodes-declarations-runtime.js";
import { hydrateArgument, hydrateExpression } from "./ast-nodes-expressions-hydrate.js";
import { BlockStatement, CommentStatement, ConstructorBlockStatement, ConstructorInvocationStatement, DisabledBlockStatement, ExpressionStatement, LocalVariableDeclarationStatement, ReturnStatement, SuperConstructorInvocationStatement, SwitchCaseStatement, ThisConstructorInvocationStatement, TryCatchStatement } from "./ast-nodes-statements-blocks.js";
import { ConditionalStatement, CountLoop, CountUpToStatement, DoInOrderStatement, DoTogetherStatement, EachInArrayTogether, EachInIterableTogether, ForEachInArrayLoop, ForEachInIterableLoop, ForEachLoop, WhileLoopStatement } from "./ast-nodes-statements-control.js";
import { RawStatement } from "./ast-nodes-statements-raw.js";
import { Statement } from "./ast-nodes-statements-union.js";

export function hydrateStatement(statement: RawStatement): Statement {
  switch (statement.type) {
    case "DoInOrder":
      return new DoInOrderStatement(statement.body.map(hydrateStatement));
    case "DoTogether":
      return new DoTogetherStatement(statement.body.map(hydrateStatement));
    case "IfElse":
      return new ConditionalStatement(
        hydrateExpression(statement.condition),
        statement.ifBody.map(hydrateStatement),
        statement.elseBody ? statement.elseBody.map(hydrateStatement) : null,
      );
    case "ConditionalStatement": {
      const first = statement.booleanExpressionBodyPairs[0];
      return new ConditionalStatement(
        hydrateExpression(first?.expression ?? { type: "Literal", value: true, literalType: "boolean" }),
        (first?.body ?? []).map(hydrateStatement),
        statement.elseBody ? statement.elseBody.map(hydrateStatement) : null,
      );
    }
    case "ForEach":
      return new ForEachLoop(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "ForEachInArrayLoop":
      return new ForEachInArrayLoop(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "ForEachInIterableLoop":
      return new ForEachInIterableLoop(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "EachInArrayTogether":
      return new EachInArrayTogether(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "EachInIterableTogether":
      return new EachInIterableTogether(
        statement.itemType,
        statement.itemName,
        hydrateExpression(statement.collection),
        statement.body.map(hydrateStatement),
      );
    case "CountUpTo":
      return new CountUpToStatement(
        hydrateExpression(statement.count),
        statement.body.map(hydrateStatement),
      );
    case "CountLoop":
      return new CountLoop(
        statement.variableName ? new UserLocal(statement.variableName, simpleTypeRef("WholeNumber"), false) : null,
        statement.constantName ? new UserLocal(statement.constantName, simpleTypeRef("WholeNumber"), true) : null,
        hydrateExpression(statement.count),
        statement.body.map(hydrateStatement),
      );
    case "WhileLoop":
      return new WhileLoopStatement(
        hydrateExpression(statement.condition),
        statement.body.map(hydrateStatement),
      );
    case "TryCatch":
      return new TryCatchStatement(
        statement.tryBody.map(hydrateStatement),
        statement.catchType,
        statement.catchVariable,
        statement.catchBody.map(hydrateStatement),
      );
    case "SwitchCase":
      return new SwitchCaseStatement(
        hydrateExpression(statement.expression),
        statement.cases.map((switchCase) => ({
          value: hydrateExpression(switchCase.value),
          body: switchCase.body.map(hydrateStatement),
        })),
        statement.defaultCase ? statement.defaultCase.map(hydrateStatement) : null,
      );
    case "Return":
      return new ReturnStatement(
        statement.expression ? hydrateExpression(statement.expression) : null,
        statement.expressionType ?? null,
      );
    case "ExpressionStatement":
      return new ExpressionStatement(hydrateExpression(statement.expression));
    case "LocalVariableDeclaration":
    case "LocalDeclarationStatement":
      return new LocalVariableDeclarationStatement(
        statement.name,
        statement.varType,
        hydrateExpression(statement.initializer),
        statement.isConstant,
      );
    case "Block":
      return new BlockStatement(statement.body.map(hydrateStatement));
    case "ConstructorBlockStatement":
      return new ConstructorBlockStatement(
        statement.constructorInvocationStatement
          ? hydrateStatement(statement.constructorInvocationStatement) as ConstructorInvocationStatement
          : new SuperConstructorInvocationStatement(null),
        statement.body.map(hydrateStatement),
      );
    case "ConstructorInvocationStatement":
      return new ConstructorInvocationStatement(
        statement.className ? new JavaConstructor(statement.className) : null,
        (statement.arguments ?? []).map(hydrateArgument),
      );
    case "ThisConstructorInvocationStatement":
      return new ThisConstructorInvocationStatement(
        statement.className ? new JavaConstructor(statement.className) : null,
        (statement.arguments ?? []).map(hydrateArgument),
      );
    case "SuperConstructorInvocationStatement":
      return new SuperConstructorInvocationStatement(
        statement.className ? new JavaConstructor(statement.className) : null,
        (statement.arguments ?? []).map(hydrateArgument),
      );
    case "DisabledBlock":
      return new DisabledBlockStatement(statement.raw);
    case "Comment":
      return new CommentStatement(statement.text);
  }
  throw new Error(`Unsupported statement node: ${JSON.stringify(statement)}`);
}
