import type { AliceMethod, AliceStatement } from "../a3p-parser.js";
import { appendBooleanProperty, appendStringProperty, generateUuid } from "./xml-tools.js";

export const SUPPORTED_A3P_STATEMENT_KINDS = [
  "Comment",
  "MethodCall",
  "CountLoop",
  "IfElse",
  "ReturnStatement",
  "VariableDeclaration",
  "DoInOrder",
  "DoTogether",
  "WhileLoop",
] as const;

export const LOWERED_A3P_STATEMENT_KINDS = [
  "VariableAssignment",
  "EventListener",
] as const;

const UNSUPPORTED_COLLECTION_LOOP_KINDS = new Set([
  "ForEachInArrayLoop",
  "ForEachInIterableLoop",
  "EachInArrayTogether",
  "EachInIterableTogether",
]);

export function appendSupportedStatements(doc: Document, collection: Element, statements: AliceMethod["statements"]): void {
  for (const statement of statements) {
    collection.appendChild(createStatementNode(doc, statement));
  }
}

function createStatementNode(doc: Document, statement: AliceMethod["statements"][number]): Element {
  switch (statement.kind) {
    case "Comment":
      return createCommentNode(doc, statement.expression ?? "");
    case "MethodCall":
      return createMethodCallNode(doc, statement);
    case "CountLoop": {
      const loopNode = createEnabledNode(doc, "org.lgna.project.ast.CountLoop");
      appendBlockBody(doc, loopNode, statement.body ?? []);
      return loopNode;
    }
    case "IfElse": {
      const condNode = createEnabledNode(doc, "org.lgna.project.ast.ConditionalStatement");
      appendConditionalBodies(doc, condNode, statement.ifBody ?? [], statement.elseBody ?? []);
      return condNode;
    }
    case "ReturnStatement":
      return createEnabledNode(doc, "org.lgna.project.ast.ReturnStatement");
    case "VariableDeclaration":
      return createEnabledNode(doc, "org.lgna.project.ast.LocalDeclarationStatement");
    case "VariableAssignment":
      return createCommentNode(
        doc,
        `VariableAssignment:${requireNonBlank(statement.name, "VariableAssignment.name")}=${requirePresent(
          statement.value,
          "VariableAssignment.value",
        )}`,
      );
    case "DoInOrder": {
      const doNode = createEnabledNode(doc, "org.lgna.project.ast.DoInOrder");
      appendBlockBody(doc, doNode, statement.body ?? []);
      return doNode;
    }
    case "DoTogether": {
      const dtNode = createEnabledNode(doc, "org.lgna.project.ast.DoTogether");
      appendBlockBody(doc, dtNode, statement.body ?? []);
      return dtNode;
    }
    case "WhileLoop": {
      const whNode = createEnabledNode(doc, "org.lgna.project.ast.WhileLoop");
      appendBlockBody(doc, whNode, statement.body ?? []);
      return whNode;
    }
    case "EventListener":
      return createCommentNode(doc, `EventListener:${requireNonBlank(statement.event, "EventListener.event")}`);
    case "ForEachLoop":
      throw new Error("Unsupported A3P statement kind: ForEachLoop cannot be lowered without faithful collection XML support");
    default:
      if (UNSUPPORTED_COLLECTION_LOOP_KINDS.has(statement.kind)) {
        throw new Error(
          `Unsupported A3P statement kind: ${statement.kind} cannot be serialized because item and collection expressions are not preserved`,
        );
      }
      throw new Error(`Unsupported A3P statement kind: ${statement.kind}`);
  }
}

function createMethodCallNode(doc: Document, statement: AliceStatement): Element {
  const exprStmt = createEnabledNode(doc, "org.lgna.project.ast.ExpressionStatement");

  const exprProp = doc.createElement("property");
  exprProp.setAttribute("name", "expression");
  const invocation = doc.createElement("node");
  invocation.setAttribute("type", "org.lgna.project.ast.MethodInvocation");
  invocation.setAttribute("uuid", generateUuid());

  const methodRef = doc.createElement("node");
  methodRef.setAttribute("type", "org.lgna.project.ast.JavaMethod");
  methodRef.setAttribute("uuid", generateUuid());
  appendStringProperty(doc, methodRef, "name", requireNonBlank(statement.method, "MethodCall.method"));
  const methodProp = doc.createElement("property");
  methodProp.setAttribute("name", "method");
  methodProp.appendChild(methodRef);
  invocation.appendChild(methodProp);

  if (statement.object && statement.object !== "this") {
    appendStringProperty(doc, invocation, "callerObject", statement.object);
  }

  if (statement.arguments?.length) {
    const argsProp = doc.createElement("property");
    argsProp.setAttribute("name", "requiredArguments");
    const argsCollection = doc.createElement("collection");
    argsCollection.setAttribute("type", "java.util.ArrayList");
    for (const arg of statement.arguments) {
      const argNode = doc.createElement("node");
      argNode.setAttribute("type", "org.lgna.project.ast.SimpleArgument");
      argNode.setAttribute("uuid", generateUuid());
      appendStringProperty(doc, argNode, "value", arg);
      argsCollection.appendChild(argNode);
    }
    argsProp.appendChild(argsCollection);
    invocation.appendChild(argsProp);
  }

  exprProp.appendChild(invocation);
  exprStmt.appendChild(exprProp);
  return exprStmt;
}

function createEnabledNode(doc: Document, type: string): Element {
  const node = doc.createElement("node");
  node.setAttribute("type", type);
  node.setAttribute("uuid", generateUuid());
  appendBooleanProperty(doc, node, "isEnabled", true);
  return node;
}

function createCommentNode(doc: Document, text: string): Element {
  const commentNode = createEnabledNode(doc, "org.lgna.project.ast.Comment");
  appendStringProperty(doc, commentNode, "text", text);
  return commentNode;
}

function appendBlockBody(doc: Document, parentNode: Element, statements: AliceStatement[]): void {
  appendBlockBodyNamed(doc, parentNode, "body", statements);
}

function appendConditionalBodies(doc: Document, parentNode: Element, ifBody: AliceStatement[], elseBody: AliceStatement[]): void {
  const pairsProp = doc.createElement("property");
  pairsProp.setAttribute("name", "booleanExpressionBodyPairs");
  const pairsCollection = doc.createElement("collection");
  pairsCollection.setAttribute("type", "java.util.ArrayList");
  const pairNode = doc.createElement("node");
  pairNode.setAttribute("type", "org.lgna.project.ast.BooleanExpressionBodyPair");
  pairNode.setAttribute("uuid", generateUuid());
  appendBooleanExpressionProperty(doc, pairNode, "expression", true);
  appendBlockBody(doc, pairNode, ifBody);
  pairsCollection.appendChild(pairNode);
  pairsProp.appendChild(pairsCollection);
  parentNode.appendChild(pairsProp);
  appendBlockBodyNamed(doc, parentNode, "elseBody", elseBody);
}

function appendBlockBodyNamed(doc: Document, parentNode: Element, propertyName: string, statements: AliceStatement[]): void {
  const bodyProp = doc.createElement("property");
  bodyProp.setAttribute("name", propertyName);
  const blockNode = doc.createElement("node");
  blockNode.setAttribute("type", "org.lgna.project.ast.BlockStatement");
  blockNode.setAttribute("uuid", generateUuid());
  const stmtsProp = doc.createElement("property");
  stmtsProp.setAttribute("name", "statements");
  const collection = doc.createElement("collection");
  collection.setAttribute("type", "java.util.ArrayList");
  appendSupportedStatements(doc, collection, statements);
  stmtsProp.appendChild(collection);
  blockNode.appendChild(stmtsProp);
  bodyProp.appendChild(blockNode);
  parentNode.appendChild(bodyProp);
}

function appendBooleanExpressionProperty(doc: Document, parentNode: Element, propertyName: string, value: boolean): void {
  const property = doc.createElement("property");
  property.setAttribute("name", propertyName);
  const literalNode = doc.createElement("node");
  literalNode.setAttribute("type", "org.lgna.project.ast.BooleanLiteral");
  literalNode.setAttribute("uuid", generateUuid());
  appendBooleanProperty(doc, literalNode, "value", value);
  property.appendChild(literalNode);
  parentNode.appendChild(property);
}

function requireNonBlank(value: string | undefined, fieldName: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${fieldName} is required for A3P statement serialization`);
  }
  return value;
}

function requirePresent(value: string | undefined, fieldName: string): string {
  if (value === undefined) {
    throw new Error(`${fieldName} is required for A3P statement serialization`);
  }
  return value;
}
