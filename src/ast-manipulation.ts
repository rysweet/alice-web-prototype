import {
  AbstractExpression,
  AbstractNode,
  ArrayAccessExpression,
  AssignmentExpression,
  BinaryOpExpression,
  ClassDeclaration,
  ConstructorDeclaration,
  ExpressionStatement,
  FieldAccess,
  FieldDeclaration,
  LocalDeclarationStatement,
  MethodDeclaration,
  MethodInvocation,
  ParenthesizedExpression,
  ReturnStatement,
  TypeCastExpression,
  UnaryOpExpression,
  type Expression,
  type Statement,
} from "./ast-nodes.js";
import { decodeAstNode, encodeAstNode, type AstSerializableNode } from "./ast-serialization.js";

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

export class ASTManipulationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ASTManipulationError";
  }
}

export interface ASTValidationIssue {
  readonly nodeId: string;
  readonly message: string;
}

export interface ASTDiffResult {
  readonly changed: boolean;
  readonly before: string;
  readonly after: string;
  readonly differences: string[];
}

export class ASTInserter {
  insertStatement<T extends AbstractNode & { body: Statement[] }>(owner: T, statement: Statement, index = owner.body.length): Statement[] {
    if (index < 0 || index > owner.body.length) {
      throw new ASTManipulationError(`Insertion index ${index} is out of bounds.`);
    }
    statement.setParent(owner);
    owner.body.splice(index, 0, statement);
    return owner.body;
  }
}

export class ASTRemover {
  removeStatement<T extends AbstractNode & { body: Statement[] }>(owner: T, index: number): Statement {
    if (index < 0 || index >= owner.body.length) {
      throw new ASTManipulationError(`Removal index ${index} is out of bounds.`);
    }
    const [removed] = owner.body.splice(index, 1);
    return removed!;
  }

  removeExpression(root: AstSerializableNode, expressionId: string): boolean {
    const expression = findExpression(root, expressionId);
    if (!expression || !expression.parent) {
      return false;
    }
    return replaceOnParent(expression.parent, expression, null);
  }
}

export class ASTMover {
  moveStatement<T extends AbstractNode & { body: Statement[] }>(owner: T, fromIndex: number, toIndex: number): Statement[] {
    if (fromIndex < 0 || fromIndex >= owner.body.length) {
      throw new ASTManipulationError(`Move source index ${fromIndex} is out of bounds.`);
    }
    if (toIndex < 0 || toIndex >= owner.body.length) {
      throw new ASTManipulationError(`Move target index ${toIndex} is out of bounds.`);
    }
    const [statement] = owner.body.splice(fromIndex, 1);
    owner.body.splice(Math.min(toIndex, owner.body.length), 0, statement!);
    statement!.setParent(owner);
    return owner.body;
  }
}

export class ASTCopier {
  deepCopy<T extends AstSerializableNode>(node: T): T {
    return decodeAstNode(encodeAstNode(node)) as T;
  }
}

export class ASTReplacer {
  replaceExpression(root: AstSerializableNode, expressionId: string, replacement: Expression): boolean {
    const expression = findExpression(root, expressionId);
    if (!expression || !expression.parent) {
      return false;
    }
    return replaceOnParent(expression.parent, expression, replacement);
  }
}

export class ASTValidator {
  validate(root: AstSerializableNode): ASTValidationIssue[] {
    const issues: ASTValidationIssue[] = [];
    const rootNode = root as AbstractNode;
    const seen = new Set<string>();

    rootNode.traverse((node) => {
      if (seen.has(node.id)) {
        issues.push({ nodeId: node.id, message: "Duplicate node identifier encountered." });
      }
      seen.add(node.id);

      if (node !== rootNode && node.parent === null) {
        issues.push({ nodeId: node.id, message: "Detached node has no parent." });
      }
      if (node.getRoot() !== rootNode) {
        issues.push({ nodeId: node.id, message: "Node root chain is inconsistent." });
      }
      if (node instanceof MethodDeclaration && !isIdentifier(node.name)) {
        issues.push({ nodeId: node.id, message: "Method names must be valid identifiers." });
      }
      if (node instanceof FieldDeclaration && !isIdentifier(node.name)) {
        issues.push({ nodeId: node.id, message: "Field names must be valid identifiers." });
      }
    });

    if (rootNode instanceof ClassDeclaration) {
      for (const constructorDeclaration of rootNode.constructors as ConstructorDeclaration[]) {
        if (constructorDeclaration.name !== rootNode.name) {
          issues.push({
            nodeId: constructorDeclaration.id,
            message: `Constructor ${constructorDeclaration.name} must match class name ${rootNode.name}.`,
          });
        }
      }
    }

    return issues;
  }
}

export class ASTDiff {
  diff(before: AstSerializableNode, after: AstSerializableNode): ASTDiffResult {
    const beforeText = encodeAstNode(before);
    const afterText = encodeAstNode(after);
    const beforeLines = tokenize(beforeText);
    const afterLines = tokenize(afterText);
    const differences: string[] = [];
    const max = Math.max(beforeLines.length, afterLines.length);
    for (let index = 0; index < max; index += 1) {
      if (beforeLines[index] === afterLines[index]) {
        continue;
      }
      if (beforeLines[index] !== undefined) {
        differences.push(`- ${beforeLines[index]}`);
      }
      if (afterLines[index] !== undefined) {
        differences.push(`+ ${afterLines[index]}`);
      }
    }
    return {
      changed: beforeText !== afterText,
      before: beforeText,
      after: afterText,
      differences,
    };
  }
}

function tokenize(xml: string): string[] {
  return xml.replace(/></g, ">\n<").split("\n");
}

function findExpression(root: AstSerializableNode, expressionId: string): Expression | null {
  let found: AbstractExpression | null = null;
  (root as AbstractNode).traverse((node) => {
    if (!found && node instanceof AbstractExpression && node.id === expressionId) {
      found = node;
    }
  });
  return found;
}

function replaceOnParent(parent: AbstractNode, target: Expression, replacement: Expression | null): boolean {
  if (parent instanceof ReturnStatement && parent.expression === target) {
    parent.expression = replacement;
  } else if (parent instanceof FieldDeclaration && parent.initializer === target) {
    parent.initializer = replacement;
  } else if (parent instanceof ExpressionStatement && replacement && parent.expression === target) {
    parent.expression = replacement;
  } else if (parent instanceof LocalDeclarationStatement && replacement && parent.initializer === target) {
    parent.initializer = replacement;
  } else if (parent instanceof AssignmentExpression && replacement) {
    if (parent.target === target) {
      parent.target = replacement;
    } else if (parent.value === target) {
      parent.value = replacement;
    } else {
      return false;
    }
  } else if (parent instanceof BinaryOpExpression && replacement) {
    if (parent.left === target) {
      parent.left = replacement;
    } else if (parent.right === target) {
      parent.right = replacement;
    } else {
      return false;
    }
  } else if (parent instanceof UnaryOpExpression && replacement && parent.operand === target) {
    parent.operand = replacement;
  } else if (parent instanceof FieldAccess && replacement && parent.target === target) {
    parent.target = replacement;
  } else if (parent instanceof ArrayAccessExpression && replacement) {
    if (parent.target === target) {
      parent.target = replacement;
    } else if (parent.index === target) {
      parent.index = replacement;
    } else {
      return false;
    }
  } else if (parent instanceof TypeCastExpression && replacement && parent.expression === target) {
    parent.expression = replacement;
  } else if (parent instanceof ParenthesizedExpression && replacement && parent.expression === target) {
    parent.expression = replacement;
  } else if (parent instanceof MethodInvocation && replacement && parent.target === target) {
    parent.target = replacement;
  } else {
    return false;
  }

  if (replacement) {
    replacement.setParent(parent);
  }
  return true;
}
