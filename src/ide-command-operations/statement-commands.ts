import type { Command } from "../undo-redo";

// ---------------------------------------------------------------------------
// Statement / Method Commands
// ---------------------------------------------------------------------------

export class MoveStatementCommand implements Command {
  private movedStatement: string | null = null;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly methodName: string,
    private readonly fromIndex: number,
    private readonly toIndex: number,
  ) {}

  get description(): string {
    return `Move statement in "${this.methodName}" from ${this.fromIndex} to ${this.toIndex}`;
  }

  execute(): void {
    const stmts = this.requireStatements();
    if (this.fromIndex < 0 || this.fromIndex >= stmts.length) {
      throw new RangeError(`fromIndex ${this.fromIndex} out of bounds`);
    }
    this.movedStatement = stmts.splice(this.fromIndex, 1)[0];
    const insertAt = Math.max(0, Math.min(this.toIndex, stmts.length));
    stmts.splice(insertAt, 0, this.movedStatement);
  }

  undo(): void {
    if (this.movedStatement === null) return;
    const stmts = this.procedures.get(this.methodName);
    if (!stmts) return;
    const currentIdx = stmts.indexOf(this.movedStatement);
    if (currentIdx >= 0) {
      stmts.splice(currentIdx, 1);
      const restoreAt = Math.max(0, Math.min(this.fromIndex, stmts.length));
      stmts.splice(restoreAt, 0, this.movedStatement);
    }
  }

  private requireStatements(): string[] {
    const stmts = this.procedures.get(this.methodName);
    if (!stmts) throw new Error(`Method "${this.methodName}" not found`);
    return stmts;
  }
}

export class DeleteStatementCommand implements Command {
  private deletedStatement: string | null = null;
  private deletedIndex: number | null = null;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly methodName: string,
    private readonly index: number,
  ) {}

  get description(): string {
    return `Delete statement ${this.index} from "${this.methodName}"`;
  }

  execute(): void {
    const stmts = this.requireStatements();
    if (this.index < 0 || this.index >= stmts.length) {
      throw new RangeError(`index ${this.index} out of bounds`);
    }
    this.deletedStatement = stmts.splice(this.index, 1)[0];
    this.deletedIndex = this.index;
  }

  undo(): void {
    if (this.deletedStatement === null || this.deletedIndex === null) return;
    const stmts = this.procedures.get(this.methodName);
    if (stmts) {
      stmts.splice(this.deletedIndex, 0, this.deletedStatement);
    }
  }

  private requireStatements(): string[] {
    const stmts = this.procedures.get(this.methodName);
    if (!stmts) throw new Error(`Method "${this.methodName}" not found`);
    return stmts;
  }
}

export class ReplaceStatementCommand implements Command {
  private previousStatement: string | null = null;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly methodName: string,
    private readonly index: number,
    private readonly newStatement: string,
  ) {}

  get description(): string {
    return `Replace statement ${this.index} in "${this.methodName}"`;
  }

  execute(): void {
    const stmts = this.requireStatements();
    if (this.index < 0 || this.index >= stmts.length) {
      throw new RangeError(`index ${this.index} out of bounds`);
    }
    this.previousStatement = stmts[this.index];
    stmts[this.index] = this.newStatement;
  }

  undo(): void {
    if (this.previousStatement === null) return;
    const stmts = this.procedures.get(this.methodName);
    if (stmts && this.index < stmts.length) {
      stmts[this.index] = this.previousStatement;
    }
  }

  private requireStatements(): string[] {
    const stmts = this.procedures.get(this.methodName);
    if (!stmts) throw new Error(`Method "${this.methodName}" not found`);
    return stmts;
  }
}

export class RenameMethodCommand implements Command {
  private capturedStatements: string[] | null = null;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly oldName: string,
    private readonly newName: string,
  ) {}

  get description(): string {
    return `Rename method "${this.oldName}" to "${this.newName}"`;
  }

  execute(): void {
    if (!this.procedures.has(this.oldName)) {
      throw new Error(`Method "${this.oldName}" not found`);
    }
    if (this.procedures.has(this.newName)) {
      throw new Error(`Method "${this.newName}" already exists`);
    }
    this.capturedStatements = this.procedures.get(this.oldName)!;
    this.procedures.delete(this.oldName);
    this.procedures.set(this.newName, this.capturedStatements);
  }

  undo(): void {
    if (!this.capturedStatements) return;
    this.procedures.delete(this.newName);
    this.procedures.set(this.oldName, this.capturedStatements);
  }
}

// ---------------------------------------------------------------------------
// Method / Statement Commands (continued)
// ---------------------------------------------------------------------------

export class CreateMethodCommand implements Command {
  private created = false;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly methodName: string,
    private readonly initialStatements: string[] = [],
  ) {}

  get description(): string {
    return `Create method "${this.methodName}"`;
  }

  execute(): void {
    if (this.procedures.has(this.methodName)) {
      throw new Error(`Method "${this.methodName}" already exists`);
    }
    this.procedures.set(this.methodName, [...this.initialStatements]);
    this.created = true;
  }

  undo(): void {
    if (this.created) {
      this.procedures.delete(this.methodName);
      this.created = false;
    }
  }
}

export class DeleteMethodCommand implements Command {
  private capturedStatements: string[] | null = null;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly methodName: string,
  ) {}

  get description(): string {
    return `Delete method "${this.methodName}"`;
  }

  execute(): void {
    const stmts = this.procedures.get(this.methodName);
    if (!stmts) throw new Error(`Method "${this.methodName}" not found`);
    this.capturedStatements = [...stmts];
    this.procedures.delete(this.methodName);
  }

  undo(): void {
    if (this.capturedStatements) {
      this.procedures.set(this.methodName, [...this.capturedStatements]);
      this.capturedStatements = null;
    }
  }
}

export class AddStatementCommand implements Command {
  private added = false;
  private insertedAt: number | null = null;

  constructor(
    private readonly procedures: Map<string, string[]>,
    private readonly methodName: string,
    private readonly statement: string,
    private readonly index?: number,
  ) {}

  get description(): string {
    return `Add statement to "${this.methodName}"`;
  }

  execute(): void {
    const stmts = this.procedures.get(this.methodName);
    if (!stmts) throw new Error(`Method "${this.methodName}" not found`);
    const insertAt = this.index !== undefined
      ? Math.max(0, Math.min(this.index, stmts.length))
      : stmts.length;
    stmts.splice(insertAt, 0, this.statement);
    this.insertedAt = insertAt;
    this.added = true;
  }

  undo(): void {
    if (!this.added) return;
    const stmts = this.procedures.get(this.methodName);
    if (!stmts || this.insertedAt === null) return;
    stmts.splice(this.insertedAt, 1);
    this.insertedAt = null;
    this.added = false;
  }
}
