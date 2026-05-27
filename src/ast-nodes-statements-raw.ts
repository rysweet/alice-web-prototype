import { TypeRef } from "./ast-nodes-common-core.js";
import { RawArgument } from "./ast-nodes-declarations-raw.js";
import { RawExpression } from "./ast-nodes-expressions-raw.js";

export type RawStatement =
  | { type: "DoInOrder"; body: RawStatement[] }
  | { type: "DoTogether"; body: RawStatement[] }
  | { type: "IfElse"; condition: RawExpression; ifBody: RawStatement[]; elseBody: RawStatement[] | null }
  | { type: "ConditionalStatement"; booleanExpressionBodyPairs: Array<{ expression: RawExpression; body: RawStatement[] }>; elseBody: RawStatement[] | null }
  | { type: "ForEach"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "ForEachInArrayLoop"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "ForEachInIterableLoop"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "EachInArrayTogether"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "EachInIterableTogether"; itemType: TypeRef; itemName: string; collection: RawExpression; body: RawStatement[] }
  | { type: "CountUpTo"; count: RawExpression; body: RawStatement[] }
  | { type: "CountLoop"; count: RawExpression; body: RawStatement[]; variableName?: string | null; constantName?: string | null }
  | { type: "WhileLoop"; condition: RawExpression; body: RawStatement[] }
  | { type: "TryCatch"; tryBody: RawStatement[]; catchType: TypeRef; catchVariable: string; catchBody: RawStatement[] }
  | { type: "SwitchCase"; expression: RawExpression; cases: Array<{ value: RawExpression; body: RawStatement[] }>; defaultCase: RawStatement[] | null }
  | { type: "Return"; expression: RawExpression | null; expressionType?: TypeRef | null }
  | { type: "ExpressionStatement"; expression: RawExpression }
  | { type: "LocalVariableDeclaration"; name: string; varType: TypeRef; initializer: RawExpression; isConstant: boolean }
  | { type: "LocalDeclarationStatement"; name: string; varType: TypeRef; initializer: RawExpression; isConstant: boolean }
  | { type: "Block"; body: RawStatement[] }
  | { type: "ConstructorBlockStatement"; constructorInvocationStatement?: RawStatement; body: RawStatement[] }
  | { type: "ConstructorInvocationStatement"; className?: string | null; arguments?: RawArgument[] }
  | { type: "ThisConstructorInvocationStatement"; className?: string | null; arguments?: RawArgument[] }
  | { type: "SuperConstructorInvocationStatement"; className?: string | null; arguments?: RawArgument[] }
  | { type: "DisabledBlock"; raw: string }
  | { type: "Comment"; text: string };
