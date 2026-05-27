type StatementKind =
  | "if"
  | "while"
  | "for-each"
  | "do-in-order"
  | "do-together"
  | "return"
  | "expression"
  | "local-declaration";

export interface StatementValidationIssue {
  readonly path: string;
  readonly message: string;
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function typesCompatible(expected: string | null | undefined, actual: string | null | undefined): boolean {
  if (!expected || !actual) {
    return true;
  }
  if (expected === actual || expected === "Object") {
    return true;
  }
  const numeric = new Set(["WholeNumber", "DecimalNumber", "Number"]);
  return numeric.has(expected) && numeric.has(actual);
}

export abstract class StatementNode {
  abstract readonly kind: StatementKind;
}

export type Statement =
  | IfStatement
  | WhileLoop
  | ForEachLoop
  | DoInOrder
  | DoTogether
  | ReturnStatement
  | ExpressionStatement
  | LocalDeclaration;

export class StatementBlock {
  readonly statements: Statement[];

  constructor(statements: readonly Statement[] = []) {
    this.statements = [...statements];
  }

  add(statement: Statement): this {
    this.statements.push(statement);
    return this;
  }

  clone(): StatementBlock {
    return new StatementBlock([...this.statements]);
  }
}

export class IfStatement extends StatementNode {
  readonly kind = "if" as const;

  constructor(
    readonly condition: string,
    readonly thenBlock: StatementBlock = new StatementBlock(),
    readonly elseBlock: StatementBlock | null = null,
  ) {
    super();
  }
}

export class WhileLoop extends StatementNode {
  readonly kind = "while" as const;

  constructor(
    readonly condition: string,
    readonly body: StatementBlock = new StatementBlock(),
  ) {
    super();
  }
}

export class ForEachLoop extends StatementNode {
  readonly kind = "for-each" as const;

  constructor(
    readonly itemName: string,
    readonly itemType: string,
    readonly collectionExpression: string,
    readonly body: StatementBlock = new StatementBlock(),
  ) {
    super();
  }
}

export class DoInOrder extends StatementNode {
  readonly kind = "do-in-order" as const;

  constructor(readonly body: StatementBlock = new StatementBlock()) {
    super();
  }
}

export class DoTogether extends StatementNode {
  readonly kind = "do-together" as const;

  constructor(readonly body: StatementBlock = new StatementBlock()) {
    super();
  }
}

export class ReturnStatement extends StatementNode {
  readonly kind = "return" as const;

  constructor(
    readonly expression: string | null = null,
    readonly expressionType: string | null = null,
  ) {
    super();
  }
}

export class ExpressionStatement extends StatementNode {
  readonly kind = "expression" as const;

  constructor(readonly expression: string) {
    super();
  }
}

export class LocalDeclaration extends StatementNode {
  readonly kind = "local-declaration" as const;

  constructor(
    readonly name: string,
    readonly typeName: string,
    readonly initializer: string | null = null,
    readonly initializerType: string | null = null,
  ) {
    super();
  }
}

export interface StatementTemplate {
  readonly kind: StatementKind;
  readonly defaults?: Record<string, unknown>;
}

export class StatementFactory {
  create(kind: StatementKind, defaults: Record<string, unknown> = {}): Statement {
    switch (kind) {
      case "if":
        return new IfStatement((defaults.condition as string) ?? "true");
      case "while":
        return new WhileLoop((defaults.condition as string) ?? "true");
      case "for-each":
        return new ForEachLoop(
          (defaults.itemName as string) ?? "item",
          (defaults.itemType as string) ?? "Object",
          (defaults.collectionExpression as string) ?? "items",
        );
      case "do-in-order":
        return new DoInOrder();
      case "do-together":
        return new DoTogether();
      case "return":
        return new ReturnStatement((defaults.expression as string | null) ?? null, (defaults.expressionType as string | null) ?? null);
      case "expression":
        return new ExpressionStatement((defaults.expression as string) ?? "doSomething()\n");
      case "local-declaration":
        return new LocalDeclaration(
          (defaults.name as string) ?? "value",
          (defaults.typeName as string) ?? "Object",
          (defaults.initializer as string | null) ?? null,
          (defaults.initializerType as string | null) ?? null,
        );
    }
  }

  fromTemplate(template: StatementTemplate): Statement {
    return this.create(template.kind, template.defaults ?? {});
  }
}

export interface StatementValidationContext {
  readonly expectedReturnType?: string | null;
}

export class StatementValidator {
  validateBlock(block: StatementBlock, context: StatementValidationContext = {}): StatementValidationIssue[] {
    const issues: StatementValidationIssue[] = [];
    block.statements.forEach((statement, index) => {
      this.validateStatement(statement, `/statements/${index}`, issues, context);
    });
    return issues;
  }

  private validateStatement(
    statement: Statement,
    path: string,
    issues: StatementValidationIssue[],
    context: StatementValidationContext,
  ): void {
    switch (statement.kind) {
      case "if":
        if (!statement.condition.trim()) {
          issues.push({ path: `${path}/condition`, message: "If statements require a condition." });
        }
        issues.push(...this.validateBlock(statement.thenBlock, context));
        if (statement.elseBlock) {
          issues.push(...this.validateBlock(statement.elseBlock, context));
        }
        break;
      case "while":
        if (!statement.condition.trim()) {
          issues.push({ path: `${path}/condition`, message: "While loops require a condition." });
        }
        issues.push(...this.validateBlock(statement.body, context));
        break;
      case "for-each":
        if (!isIdentifier(statement.itemName)) {
          issues.push({ path: `${path}/itemName`, message: "For-each loop variables must be valid identifiers." });
        }
        if (!statement.collectionExpression.trim()) {
          issues.push({ path: `${path}/collectionExpression`, message: "For-each loops require a collection expression." });
        }
        issues.push(...this.validateBlock(statement.body, context));
        break;
      case "do-in-order":
      case "do-together":
        issues.push(...this.validateBlock(statement.body, context));
        break;
      case "return":
        if (!typesCompatible(context.expectedReturnType, statement.expressionType)) {
          issues.push({ path: `${path}/expressionType`, message: "Return expression type does not match the enclosing method." });
        }
        break;
      case "expression":
        if (!statement.expression.trim()) {
          issues.push({ path: `${path}/expression`, message: "Expression statements must not be blank." });
        }
        break;
      case "local-declaration":
        if (!isIdentifier(statement.name)) {
          issues.push({ path: `${path}/name`, message: "Local variable names must be valid identifiers." });
        }
        if (!typesCompatible(statement.typeName, statement.initializerType)) {
          issues.push({ path: `${path}/initializerType`, message: "Initializer type is incompatible with the declared local type." });
        }
        break;
    }
  }
}

function indent(level: number): string {
  return "  ".repeat(level);
}

export class StatementFormatter {
  formatBlock(block: StatementBlock, depth = 0): string {
    return block.statements.map((statement) => this.formatStatement(statement, depth)).join("\n");
  }

  formatStatement(statement: Statement, depth = 0): string {
    const prefix = indent(depth);
    switch (statement.kind) {
      case "if":
        return [
          `${prefix}if ${statement.condition} then`,
          this.formatBlock(statement.thenBlock, depth + 1),
          statement.elseBlock ? `${prefix}else\n${this.formatBlock(statement.elseBlock, depth + 1)}` : null,
          `${prefix}end if`,
        ].filter((value): value is string => Boolean(value)).join("\n");
      case "while":
        return `${prefix}while ${statement.condition}\n${this.formatBlock(statement.body, depth + 1)}\n${prefix}end while`;
      case "for-each":
        return `${prefix}for each ${statement.itemType} ${statement.itemName} in ${statement.collectionExpression}\n${this.formatBlock(statement.body, depth + 1)}\n${prefix}end for each`;
      case "do-in-order":
        return `${prefix}do in order\n${this.formatBlock(statement.body, depth + 1)}\n${prefix}end do in order`;
      case "do-together":
        return `${prefix}do together\n${this.formatBlock(statement.body, depth + 1)}\n${prefix}end do together`;
      case "return":
        return `${prefix}return${statement.expression ? ` ${statement.expression}` : ""}`;
      case "expression":
        return `${prefix}${statement.expression}`;
      case "local-declaration":
        return `${prefix}${statement.typeName} ${statement.name}${statement.initializer ? ` = ${statement.initializer}` : ""}`;
    }
  }
}
