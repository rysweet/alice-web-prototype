/**
 * Expanded Command-pattern operations bridging the gap between
 * the ~20 existing commands and Java Alice's ~60 IDE operations.
 *
 * All commands implement the Command interface from undo-redo.ts and are
 * designed for use with UndoRedoManager. Multi-step commands use
 * rollback-safe execution (reversing completed steps on failure).
 */
import type { Command } from "./undo-redo";
import type { Scene } from "./story-api/scene";
import type { SThing } from "./story-api/entities";
import { SMovableTurnable, SModel } from "./story-api/entities";
import type { Position, Orientation } from "./story-api/types";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

/** Factory for cloning an entity. Required by DuplicateEntityCommand. */
export interface EntityCloneFactory {
  clone(entity: SThing): SThing;
}

/** Tracks which entity names are selected. */
export interface SelectionModel {
  readonly selected: ReadonlySet<string>;
  select(names: Iterable<string>): void;
  deselect(names: Iterable<string>): void;
  clear(): void;
}

/** Snapshot of a camera's spatial state. */
export interface CameraView {
  readonly position: Position;
  readonly orientation: Orientation;
}

// ---------------------------------------------------------------------------
// Entity Commands
// ---------------------------------------------------------------------------

export class SetVisibilityCommand implements Command {
  private previousValue: boolean | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly entityName: string,
    private readonly visible: boolean,
  ) {}

  get description(): string {
    return `Set "${this.entityName}" visibility to ${this.visible}`;
  }

  execute(): void {
    const entity = this.requireEntity();
    this.previousValue = entity.isShowing;
    entity.isShowing = this.visible;
  }

  undo(): void {
    if (this.previousValue === null) return;
    const entity = this.scene.getEntity(this.entityName);
    if (entity) {
      entity.isShowing = this.previousValue;
    }
  }

  private requireEntity(): SThing {
    const entity = this.scene.getEntity(this.entityName);
    if (!entity) throw new Error(`Entity "${this.entityName}" not found`);
    return entity;
  }
}

export class RenameEntityCommand implements Command {
  private capturedEntity: SThing | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly oldName: string,
    private readonly newName: string,
  ) {}

  get description(): string {
    return `Rename "${this.oldName}" to "${this.newName}"`;
  }

  execute(): void {
    const entity = this.scene.getEntity(this.oldName);
    if (!entity) throw new Error(`Entity "${this.oldName}" not found`);
    if (this.scene.getEntity(this.newName)) {
      throw new Error(`Entity "${this.newName}" already exists`);
    }
    this.capturedEntity = entity;
    this.scene.removeEntity(this.oldName);
    this.scene.addEntity(this.newName, entity);
  }

  undo(): void {
    if (!this.capturedEntity) return;
    this.scene.removeEntity(this.newName);
    this.scene.addEntity(this.oldName, this.capturedEntity);
  }
}

export class DuplicateEntityCommand implements Command {
  private clonedName: string | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly sourceName: string,
    private readonly targetName: string,
    private readonly factory: EntityCloneFactory,
  ) {}

  get description(): string {
    return `Duplicate "${this.sourceName}" as "${this.targetName}"`;
  }

  execute(): void {
    const source = this.scene.getEntity(this.sourceName);
    if (!source) throw new Error(`Entity "${this.sourceName}" not found`);
    const clone = this.factory.clone(source);
    this.scene.addEntity(this.targetName, clone);
    this.clonedName = this.targetName;
  }

  undo(): void {
    if (this.clonedName) {
      this.scene.removeEntity(this.clonedName);
    }
  }
}

export class SetEntityOpacityCommand implements Command {
  private previousOpacity: number | null = null;

  constructor(
    private readonly target: { opacity: number },
    private readonly entityName: string,
    private readonly newOpacity: number,
  ) {}

  get description(): string {
    return `Set "${this.entityName}" opacity to ${this.newOpacity}`;
  }

  execute(): void {
    this.previousOpacity = this.target.opacity;
    this.target.opacity = this.newOpacity;
  }

  undo(): void {
    if (this.previousOpacity !== null) {
      this.target.opacity = this.previousOpacity;
    }
  }
}

export class SetVehicleCommand implements Command {
  private previousVehicle: SThing | null = null;
  private capturedPrevious = false;

  constructor(
    private readonly entity: SModel,
    private readonly entityName: string,
    private readonly newVehicle: SThing | null,
  ) {}

  get description(): string {
    return `Set "${this.entityName}" vehicle`;
  }

  execute(): void {
    this.previousVehicle = this.entity.vehicle;
    this.capturedPrevious = true;
    this.entity.vehicle = this.newVehicle;
  }

  undo(): void {
    if (this.capturedPrevious) {
      this.entity.vehicle = this.previousVehicle;
    }
  }
}

export class SwapEntityPositionsCommand implements Command {
  private posA: Position | null = null;
  private posB: Position | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly nameA: string,
    private readonly nameB: string,
  ) {}

  get description(): string {
    return `Swap positions of "${this.nameA}" and "${this.nameB}"`;
  }

  execute(): void {
    const a = this.requireMovable(this.nameA);
    const b = this.requireMovable(this.nameB);
    this.posA = { ...a.position };
    this.posB = { ...b.position };
    a.position = { ...this.posB };
    b.position = { ...this.posA };
  }

  undo(): void {
    if (!this.posA || !this.posB) return;
    const a = this.scene.getEntity(this.nameA);
    const b = this.scene.getEntity(this.nameB);
    if (a instanceof SMovableTurnable) a.position = { ...this.posA };
    if (b instanceof SMovableTurnable) b.position = { ...this.posB };
  }

  private requireMovable(name: string): SMovableTurnable {
    const entity = this.scene.getEntity(name);
    if (!entity) throw new Error(`Entity "${name}" not found`);
    if (!(entity instanceof SMovableTurnable)) {
      throw new Error(`Entity "${name}" does not support position`);
    }
    return entity;
  }
}

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
// Scene Commands
// ---------------------------------------------------------------------------

export class SetScenePropertyCommand<T extends object, K extends string & keyof T> implements Command {
  private previousValue: T[K] | undefined = undefined;
  private captured = false;

  constructor(
    private readonly target: T,
    private readonly property: K,
    private readonly newValue: T[K],
  ) {}

  get description(): string {
    return `Set scene ${String(this.property)}`;
  }

  execute(): void {
    this.previousValue = this.target[this.property];
    this.captured = true;
    this.target[this.property] = this.newValue;
  }

  undo(): void {
    if (this.captured) {
      this.target[this.property] = this.previousValue as T[K];
    }
  }
}

export class ClearSceneCommand implements Command {
  private capturedEntities: Array<[string, SThing]> = [];

  constructor(private readonly scene: Scene) {}

  get description(): string {
    return "Clear scene";
  }

  execute(): void {
    this.capturedEntities = Array.from(this.scene.entities.entries());
    for (const [name] of this.capturedEntities) {
      this.scene.removeEntity(name);
    }
  }

  undo(): void {
    for (const [name, entity] of this.capturedEntities) {
      if (!this.scene.getEntity(name)) {
        this.scene.addEntity(name, entity);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Camera Commands
// ---------------------------------------------------------------------------

export class SetCameraViewCommand implements Command {
  private previousView: CameraView | null = null;

  constructor(
    private readonly camera: { position: Position; orientation: Orientation },
    private readonly newView: CameraView,
  ) {}

  get description(): string {
    return "Set camera view";
  }

  execute(): void {
    this.previousView = {
      position: { ...this.camera.position },
      orientation: { ...this.camera.orientation },
    };
    this.camera.position = { ...this.newView.position };
    this.camera.orientation = { ...this.newView.orientation };
  }

  undo(): void {
    if (!this.previousView) return;
    this.camera.position = { ...this.previousView.position };
    this.camera.orientation = { ...this.previousView.orientation };
  }
}

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
