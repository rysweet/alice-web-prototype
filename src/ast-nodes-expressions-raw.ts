import { TypeRef } from "./ast-nodes-common-core.js";
import { RawArgument } from "./ast-nodes-declarations-raw.js";

export type RawExpression =
  | { type: "Literal"; value: number | string | boolean | null; literalType: "number" | "string" | "boolean" | "null" }
  | { type: "This" }
  | { type: "Super" }
  | { type: "Identifier"; name: string }
  | { type: "LocalAccess"; name: string; valueType?: TypeRef }
  | { type: "ParameterAccess"; name: string; valueType?: TypeRef }
  | { type: "MemberAccess"; target: RawExpression; memberName: string }
  | { type: "FieldAccess"; target: RawExpression; memberName: string; fieldType?: TypeRef }
  | { type: "MethodInvocation"; target: RawExpression | null; methodName: string; arguments: RawArgument[] }
  | { type: "NewInstance"; className: string; arguments: RawArgument[] }
  | { type: "InstanceCreation"; className: string; arguments: RawArgument[] }
  | { type: "NewArray"; elementType: TypeRef; elements: RawExpression[]; size: RawExpression | null }
  | { type: "ArrayInstanceCreation"; elementType: TypeRef; elements: RawExpression[]; size: RawExpression | null; lengths?: number[] }
  | { type: "ArrayLiteral"; elements: RawExpression[] }
  | { type: "ArrayLength"; array: RawExpression }
  | { type: "BinaryOp"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "ArithmeticInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "BitwiseInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "ConditionalInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "RelationalInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "ShiftInfixExpression"; operator: string; left: RawExpression; right: RawExpression }
  | { type: "StringConcatenation"; leftOperand: RawExpression; rightOperand: RawExpression }
  | { type: "UnaryOp"; operator: string; operand: RawExpression }
  | { type: "LogicalComplement"; operand: RawExpression }
  | { type: "Assignment"; target: RawExpression; value: RawExpression }
  | { type: "ArrayAccess"; target: RawExpression; index: RawExpression }
  | { type: "TypeCast"; expression: RawExpression; targetType: TypeRef }
  | { type: "InstanceOf"; expression: RawExpression; testType: TypeRef }
  | { type: "Parenthesized"; expression: RawExpression }
  | { type: "ResourceExpression"; resourceType: TypeRef; resource: unknown }
  | { type: "TypeExpression"; valueType: TypeRef }
  | { type: "TypeLiteral"; valueType: TypeRef }
  | { type: "LambdaExpression"; raw: string };
