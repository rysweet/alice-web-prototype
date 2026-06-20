import type { Command } from "../undo-redo";

// ---------------------------------------------------------------------------
// Generic Property & Batch Commands
// ---------------------------------------------------------------------------

export class SetPropertyCommand<T> implements Command {
  private previousValue: T | undefined;
  private captured = false;

  constructor(
    private readonly target: Record<string, T>,
    private readonly property: string,
    private readonly newValue: T,
    private readonly entityName: string = "target",
  ) {}

  get description(): string {
    return `Set ${this.entityName}.${this.property}`;
  }

  execute(): void {
    this.previousValue = this.target[this.property];
    this.captured = true;
    this.target[this.property] = this.newValue;
  }

  undo(): void {
    if (this.captured) {
      this.target[this.property] = this.previousValue as T;
    }
  }
}

/**
 * Executes a list of commands atomically with rollback-safe semantics.
 * If command N fails, commands 0..N-1 are undone in reverse order.
 */
export class BatchCommand implements Command {
  private readonly commands: Command[];
  private executedCount = 0;

  constructor(
    private readonly label: string,
    commands: readonly Command[],
  ) {
    this.commands = [...commands];
  }

  get description(): string {
    return this.label;
  }

  execute(): void {
    this.executedCount = 0;
    try {
      for (const cmd of this.commands) {
        cmd.execute();
        this.executedCount++;
      }
    } catch (error) {
      for (let i = this.executedCount - 1; i >= 0; i--) {
        this.commands[i].undo();
      }
      this.executedCount = 0;
      throw error;
    }
  }

  undo(): void {
    for (let i = this.executedCount - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
    this.executedCount = 0;
  }
}

export class TogglePropertyCommand implements Command {
  private previousValue: boolean | null = null;

  constructor(
    private readonly target: Record<string, boolean>,
    private readonly property: string,
    private readonly propertyLabel: string = property,
  ) {}

  get description(): string {
    return `Toggle ${this.propertyLabel}`;
  }

  execute(): void {
    this.previousValue = this.target[this.property] ?? false;
    this.target[this.property] = !this.previousValue;
  }

  undo(): void {
    if (this.previousValue !== null) {
      this.target[this.property] = this.previousValue;
    }
  }
}
