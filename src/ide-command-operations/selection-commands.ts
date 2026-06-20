import type { Command } from "../undo-redo";
import type { SelectionModel } from "./contracts";

// ---------------------------------------------------------------------------
// Selection Commands
// ---------------------------------------------------------------------------

export class SelectionChangeCommand implements Command {
  private previousSelection: ReadonlySet<string> | null = null;

  constructor(
    private readonly model: SelectionModel,
    private readonly newSelection: ReadonlySet<string>,
  ) {}

  get description(): string {
    return `Select ${this.newSelection.size} entities`;
  }

  execute(): void {
    this.previousSelection = new Set(this.model.selected);
    this.model.clear();
    this.model.select(this.newSelection);
  }

  undo(): void {
    if (!this.previousSelection) return;
    this.model.clear();
    this.model.select(this.previousSelection);
  }
}

// ---------------------------------------------------------------------------
// Multi-Entity Selection Commands
// ---------------------------------------------------------------------------

export class AddToSelectionCommand implements Command {
  private readonly toAdd: string[];
  private alreadySelected: string[] = [];

  constructor(
    private readonly model: SelectionModel,
    names: readonly string[],
  ) {
    this.toAdd = [...names];
  }

  get description(): string {
    return `Add ${this.toAdd.length} to selection`;
  }

  execute(): void {
    this.alreadySelected = this.toAdd.filter((n) => this.model.selected.has(n));
    const newNames = this.toAdd.filter((n) => !this.model.selected.has(n));
    this.model.select(newNames);
  }

  undo(): void {
    const toRemove = this.toAdd.filter((n) => !this.alreadySelected.includes(n));
    this.model.deselect(toRemove);
  }
}

export class RemoveFromSelectionCommand implements Command {
  private removed: string[] = [];

  constructor(
    private readonly model: SelectionModel,
    private readonly names: readonly string[],
  ) {}

  get description(): string {
    return `Remove ${this.names.length} from selection`;
  }

  execute(): void {
    this.removed = [...this.names].filter((n) => this.model.selected.has(n));
    this.model.deselect(this.removed);
  }

  undo(): void {
    this.model.select(this.removed);
  }
}
