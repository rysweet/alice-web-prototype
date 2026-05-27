import { ArithmeticInfixExpression, ArrayAccess, ArrayAccessExpression, ArrayLength, AssignmentExpression, BinaryOpExpression, BitwiseInfixExpression, ConditionalInfixExpression, FauxExpression, InstanceOfExpression, LambdaExpression, LogicalComplement, ParenthesizedExpression, RelationalInfixExpression, ResourceExpression, ShiftInfixExpression, StringConcatenation, TypeCastExpression, TypeExpression, UnaryOpExpression } from "./ast-nodes-expressions-operators.js";
import { ArrayInstanceCreation, ArrayLiteralExpression, BooleanLiteral, DoubleLiteral, FieldAccess, FloatLiteral, IdentifierExpression, InstanceCreation, IntegerLiteral, LocalAccess, MethodInvocation, NewArrayExpression, NewInstanceExpression, NullLiteral, ParameterAccess, StringLiteral, SuperExpression, ThisExpression, TypeLiteral } from "./ast-nodes-expressions-primary.js";

export type Expression =
  | IntegerLiteral
  | DoubleLiteral
  | FloatLiteral
  | StringLiteral
  | BooleanLiteral
  | NullLiteral
  | ThisExpression
  | SuperExpression
  | IdentifierExpression
  | LocalAccess
  | ParameterAccess
  | FieldAccess
  | MethodInvocation
  | NewInstanceExpression
  | InstanceCreation
  | NewArrayExpression
  | ArrayInstanceCreation
  | ArrayLiteralExpression
  | BinaryOpExpression
  | ArithmeticInfixExpression
  | BitwiseInfixExpression
  | ConditionalInfixExpression
  | RelationalInfixExpression
  | ShiftInfixExpression
  | StringConcatenation
  | UnaryOpExpression
  | LogicalComplement
  | AssignmentExpression
  | ArrayAccessExpression
  | ArrayAccess
  | ArrayLength
  | TypeCastExpression
  | InstanceOfExpression
  | ParenthesizedExpression
  | ResourceExpression
  | TypeExpression
  | TypeLiteral
  | LambdaExpression
  | FauxExpression;
