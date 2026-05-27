import { Comment } from "./ast-nodes-expressions-primary.js";
import { BlockStatement, CommentStatement, ConstructorBlockStatement, ConstructorInvocationStatement, DisabledBlockStatement, ExpressionStatement, LocalDeclarationStatement, LocalVariableDeclarationStatement, ReturnStatement, SuperConstructorInvocationStatement, SwitchCaseStatement, ThisConstructorInvocationStatement, TryCatchStatement } from "./ast-nodes-statements-blocks.js";
import { ConditionalStatement, CountLoop, CountUpToStatement, DoInOrder, DoInOrderStatement, DoTogether, DoTogetherStatement, EachInArrayTogether, EachInIterableTogether, ForEachInArrayLoop, ForEachInIterableLoop, ForEachLoop, WhileLoop, WhileLoopStatement } from "./ast-nodes-statements-control.js";

export type Statement =
  | DoInOrderStatement
  | DoTogetherStatement
  | ConditionalStatement
  | ForEachLoop
  | CountUpToStatement
  | WhileLoopStatement
  | TryCatchStatement
  | SwitchCaseStatement
  | ReturnStatement
  | ExpressionStatement
  | LocalVariableDeclarationStatement
  | BlockStatement
  | DisabledBlockStatement
  | CommentStatement
  | ConstructorBlockStatement
  | ConstructorInvocationStatement
  | ThisConstructorInvocationStatement
  | SuperConstructorInvocationStatement
  | CountLoop
  | ForEachInArrayLoop
  | ForEachInIterableLoop
  | EachInArrayTogether
  | EachInIterableTogether
  | LocalDeclarationStatement
  | DoInOrder
  | DoTogether
  | WhileLoop
  | Comment;
