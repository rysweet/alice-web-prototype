import { Argument, isNamedSimpleTypeRef, simpleTypeRef } from "./ast-nodes-common-core.js";
import { Parameter } from "./ast-nodes-declarations-base.js";
import { RawArgument, RawParameter } from "./ast-nodes-declarations-raw.js";
import { JavaField } from "./ast-nodes-declarations-runtime.js";
import { ArithmeticInfixExpression, ArrayAccessExpression, ArrayLength, AssignmentExpression, BinaryOpExpression, BitwiseInfixExpression, ConditionalInfixExpression, InstanceOfExpression, LambdaExpression, LogicalComplement, ParenthesizedExpression, RelationalInfixExpression, ResourceExpression, ShiftInfixExpression, StringConcatenation, TypeCastExpression, TypeExpression, UnaryOpExpression, UserLambda } from "./ast-nodes-expressions-operators.js";
import { ArrayInstanceCreation, ArrayLiteralExpression, BooleanLiteral, DoubleLiteral, FieldAccess, IdentifierExpression, InstanceCreation, IntegerLiteral, LocalAccess, MethodInvocation, NewArrayExpression, NewInstanceExpression, NullLiteral, ParameterAccess, StringLiteral, SuperExpression, ThisExpression, TypeLiteral } from "./ast-nodes-expressions-primary.js";
import { RawExpression } from "./ast-nodes-expressions-raw.js";
import { Expression } from "./ast-nodes-expressions-union.js";

export function hydrateArgument(argument: RawArgument): Argument {
  return {
    name: argument.name,
    value: hydrateExpression(argument.value),
  };
}

export function hydrateParameter(parameter: RawParameter): Parameter {
  return {
    name: parameter.name,
    paramType: parameter.paramType,
    isVarArgs: parameter.isVarArgs,
    defaultValue: parameter.defaultValue ? hydrateExpression(parameter.defaultValue) : null,
  };
}

function hydrateBinaryByOperator(operator: string, left: Expression, right: Expression): Expression {
  const leftType = left.getType();
  const rightType = right.getType();
  if (operator === "+" && (isNamedSimpleTypeRef(leftType, "String")
    || isNamedSimpleTypeRef(rightType, "String"))) {
    return new StringConcatenation(left, right);
  }
  if (ArithmeticInfixExpression.OPERATORS.has(operator)) {
    return new ArithmeticInfixExpression(operator, left, right);
  }
  if (RelationalInfixExpression.OPERATORS.has(operator)) {
    return new RelationalInfixExpression(operator, left, right);
  }
  if (ConditionalInfixExpression.OPERATORS.has(operator)) {
    return new ConditionalInfixExpression(operator, left, right);
  }
  if (BitwiseInfixExpression.OPERATORS.has(operator)) {
    return new BitwiseInfixExpression(operator, left, right);
  }
  if (ShiftInfixExpression.OPERATORS.has(operator)) {
    return new ShiftInfixExpression(operator, left, right);
  }
  return new BinaryOpExpression(operator, left, right);
}

export function hydrateExpression(expression: RawExpression): Expression {
  switch (expression.type) {
    case "Literal":
      switch (expression.literalType) {
        case "number": {
          const value = expression.value as number;
          return Number.isInteger(value)
            ? new IntegerLiteral(value)
            : new DoubleLiteral(value);
        }
        case "string":
          return new StringLiteral(expression.value as string);
        case "boolean":
          return new BooleanLiteral(expression.value as boolean);
        case "null":
          return new NullLiteral();
      }
      throw new Error(`Unsupported literal type: ${JSON.stringify(expression)}`);
    case "This":
      return new ThisExpression();
    case "Super":
      return new SuperExpression();
    case "Identifier":
      return new IdentifierExpression(expression.name);
    case "LocalAccess":
      return new LocalAccess(expression.name, expression.valueType ?? simpleTypeRef("Object"));
    case "ParameterAccess":
      return new ParameterAccess(expression.name, expression.valueType ?? simpleTypeRef("Object"));
    case "MemberAccess":
      return new FieldAccess(hydrateExpression(expression.target), expression.memberName);
    case "FieldAccess":
      return new FieldAccess(
        hydrateExpression(expression.target),
        expression.memberName,
        expression.fieldType ? new JavaField(expression.memberName, expression.fieldType) : null,
      );
    case "MethodInvocation":
      return new MethodInvocation(
        expression.target ? hydrateExpression(expression.target) : null,
        expression.methodName,
        expression.arguments.map(hydrateArgument),
      );
    case "NewInstance":
      return new NewInstanceExpression(
        expression.className,
        expression.arguments.map(hydrateArgument),
      );
    case "InstanceCreation":
      return new InstanceCreation(
        expression.className,
        expression.arguments.map(hydrateArgument),
      );
    case "NewArray":
      return new NewArrayExpression(
        expression.elementType,
        expression.elements.map(hydrateExpression),
        expression.size ? hydrateExpression(expression.size) : null,
      );
    case "ArrayInstanceCreation":
      return new ArrayInstanceCreation(
        expression.elementType,
        expression.elements.map(hydrateExpression),
        expression.size ? hydrateExpression(expression.size) : null,
        expression.lengths ?? [],
      );
    case "ArrayLiteral":
      return new ArrayLiteralExpression(expression.elements.map(hydrateExpression));
    case "ArrayLength":
      return new ArrayLength(hydrateExpression(expression.array));
    case "BinaryOp":
      return hydrateBinaryByOperator(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "ArithmeticInfixExpression":
      return new ArithmeticInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "BitwiseInfixExpression":
      return new BitwiseInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "ConditionalInfixExpression":
      return new ConditionalInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "RelationalInfixExpression":
      return new RelationalInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "ShiftInfixExpression":
      return new ShiftInfixExpression(
        expression.operator,
        hydrateExpression(expression.left),
        hydrateExpression(expression.right),
      );
    case "StringConcatenation":
      return new StringConcatenation(
        hydrateExpression(expression.leftOperand),
        hydrateExpression(expression.rightOperand),
      );
    case "UnaryOp": {
      const operand = hydrateExpression(expression.operand);
      return expression.operator === "!"
        ? new LogicalComplement(operand)
        : new UnaryOpExpression(expression.operator, operand);
    }
    case "LogicalComplement":
      return new LogicalComplement(hydrateExpression(expression.operand));
    case "Assignment":
      return new AssignmentExpression(
        hydrateExpression(expression.target),
        hydrateExpression(expression.value),
      );
    case "ArrayAccess":
      return new ArrayAccessExpression(
        hydrateExpression(expression.target),
        hydrateExpression(expression.index),
      );
    case "TypeCast":
      return new TypeCastExpression(hydrateExpression(expression.expression), expression.targetType);
    case "InstanceOf":
      return new InstanceOfExpression(hydrateExpression(expression.expression), expression.testType);
    case "Parenthesized":
      return new ParenthesizedExpression(hydrateExpression(expression.expression));
    case "ResourceExpression":
      return new ResourceExpression(expression.resourceType, expression.resource);
    case "TypeExpression":
      return new TypeExpression(expression.valueType);
    case "TypeLiteral":
      return new TypeLiteral(expression.valueType);
    case "LambdaExpression":
      return new LambdaExpression(new UserLambda(expression.raw));
  }
  throw new Error(`Unsupported expression node: ${JSON.stringify(expression)}`);
}
