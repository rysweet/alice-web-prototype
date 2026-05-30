/**
 * Command-pattern undo/redo for all scene/entity modifications.
 * Six command types plus composite, with a capped undo stack (100).
 */
import { Scene } from "./story-api/scene";
import {
  SModel,
  SMovableTurnable,
  STurnable,
} from "./story-api/entities";
import type { SThing } from "./story-api/entities";
import type { Position, Orientation, Size } from "./story-api/types";

export interface Command {
  execute(): void;
  undo(): void;
  readonly description: string;
}

const MAX_UNDO_STACK = 100;

export class UndoRedoManager {
  private _undoStack: Command[] = [];
  private _redoStack: Command[] = [];

  get canUndo(): boolean {
    return this._undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this._redoStack.length > 0;
  }

  get undoCount(): number {
    return this._undoStack.length;
  }

  get redoCount(): number {
    return this._redoStack.length;
  }

  execute(cmd: Command): void {
    cmd.execute();
    this._pushUndo(cmd);
    this._redoStack.length = 0;
  }

  undo(): void {
    const cmd = this._undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this._redoStack.push(cmd);
  }

  redo(): void {
    const cmd = this._redoStack.pop();
    if (!cmd) return;
    cmd.execute();
    this._pushUndo(cmd);
  }

  private _pushUndo(cmd: Command): void {
    this._undoStack.push(cmd);
    if (this._undoStack.length > MAX_UNDO_STACK) {
      this._undoStack.shift();
    }
  }

  clear(): void {
    this._undoStack.length = 0;
    this._redoStack.length = 0;
  }
}

export class AddEntityCommand implements Command {
  private readonly _scene: Scene;
  private readonly _name: string;
  private readonly _entity: SThing;

  constructor(scene: Scene, name: string, entity: SThing) {
    this._scene = scene;
    this._name = name;
    this._entity = entity;
  }

  get description(): string {
    return `Add entity "${this._name}"`;
  }

  execute(): void {
    this._scene.addEntity(this._name, this._entity);
  }

  undo(): void {
    this._scene.removeEntity(this._name);
  }
}

export class RemoveEntityCommand implements Command {
  private readonly _scene: Scene;
  private readonly _entityName: string;
  private _capturedEntity: SThing | null = null;

  constructor(scene: Scene, entityName: string) {
    this._scene = scene;
    this._entityName = entityName;
  }

  get description(): string {
    return `Remove entity "${this._entityName}"`;
  }

  execute(): void {
    const entity = this._scene.getEntity(this._entityName);
    if (!entity) {
      throw new Error(`Entity "${this._entityName}" not found`);
    }
    this._capturedEntity = entity;
    this._scene.removeEntity(this._entityName);
  }

  undo(): void {
    if (this._capturedEntity) {
      this._scene.addEntity(this._entityName, this._capturedEntity);
    }
  }
}

export class MoveEntityCommand implements Command {
  private readonly _scene: Scene;
  private readonly _entityName: string;
  private readonly _newPosition: Position;
  private readonly _oldPosition: Position | null;

  constructor(scene: Scene, entityName: string, newPosition: Position) {
    this._scene = scene;
    this._entityName = entityName;
    this._newPosition = { ...newPosition };
    const entity = scene.getEntity(entityName);
    if (entity instanceof SMovableTurnable) {
      this._oldPosition = { ...entity.position };
    } else {
      this._oldPosition = null;
    }
  }

  get description(): string {
    return `Move entity "${this._entityName}"`;
  }

  execute(): void {
    const entity = this._scene.getEntity(this._entityName);
    if (!entity || !(entity instanceof SMovableTurnable)) {
      throw new Error(
        `Entity "${this._entityName}" not found or does not support position`,
      );
    }
    entity.position = this._newPosition;
  }

  undo(): void {
    if (!this._oldPosition) return;
    const entity = this._scene.getEntity(this._entityName);
    if (entity instanceof SMovableTurnable) {
      entity.position = this._oldPosition;
    }
  }
}

export class RotateEntityCommand implements Command {
  private readonly _scene: Scene;
  private readonly _entityName: string;
  private readonly _newOrientation: Orientation;
  private readonly _oldOrientation: Orientation | null;

  constructor(scene: Scene, entityName: string, newOrientation: Orientation) {
    this._scene = scene;
    this._entityName = entityName;
    this._newOrientation = { ...newOrientation };
    const entity = scene.getEntity(entityName);
    if (entity instanceof STurnable) {
      this._oldOrientation = { ...entity.orientation };
    } else {
      this._oldOrientation = null;
    }
  }

  get description(): string {
    return `Rotate entity "${this._entityName}"`;
  }

  execute(): void {
    const entity = this._scene.getEntity(this._entityName);
    if (!entity || !(entity instanceof STurnable)) {
      throw new Error(
        `Entity "${this._entityName}" not found or does not support orientation`,
      );
    }
    entity.orientation = this._newOrientation;
  }

  undo(): void {
    if (!this._oldOrientation) return;
    const entity = this._scene.getEntity(this._entityName);
    if (entity instanceof STurnable) {
      entity.orientation = this._oldOrientation;
    }
  }
}

export class ResizeEntityCommand implements Command {
  private readonly _scene: Scene;
  private readonly _entityName: string;
  private readonly _newSize: Size;
  private readonly _oldSize: Size | null;

  constructor(scene: Scene, entityName: string, newSize: Size) {
    this._scene = scene;
    this._entityName = entityName;
    this._newSize = { ...newSize };
    const entity = scene.getEntity(entityName);
    if (entity instanceof SModel) {
      this._oldSize = { ...entity.size };
    } else {
      this._oldSize = null;
    }
  }

  get description(): string {
    return `Resize entity "${this._entityName}"`;
  }

  execute(): void {
    const entity = this._scene.getEntity(this._entityName);
    if (!entity || !(entity instanceof SModel)) {
      throw new Error(
        `Entity "${this._entityName}" not found or does not support size (must be SModel or subclass)`,
      );
    }
    entity.size = this._newSize;
  }

  undo(): void {
    if (!this._oldSize) return;
    const entity = this._scene.getEntity(this._entityName);
    if (entity instanceof SModel) {
      entity.size = this._oldSize;
    }
  }
}

export class CompositeCommand implements Command {
  private readonly _commands: Command[];

  constructor(commands: Command[]) {
    this._commands = [...commands];
  }

  get description(): string {
    return `Composite (${this._commands.length} commands)`;
  }

  execute(): void {
    for (const cmd of this._commands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this._commands.length - 1; i >= 0; i--) {
      this._commands[i].undo();
    }
  }
}

/** Command to create a new method (procedure or function). */
export class CreateMethodCommand implements Command {
  private readonly _procedures: Map<string, string[]>;
  private readonly _methodName: string;
  private readonly _isFunction: boolean;
  private readonly _returnType: string | null;

  constructor(
    procedures: Map<string, string[]>,
    methodName: string,
    isFunction = false,
    returnType: string | null = null,
  ) {
    this._procedures = procedures;
    this._methodName = methodName;
    this._isFunction = isFunction;
    this._returnType = returnType;
  }

  get description(): string {
    return `Create ${this._isFunction ? "function" : "procedure"} "${this._methodName}"`;
  }

  execute(): void {
    if (this._procedures.has(this._methodName)) {
      throw new Error(`Method "${this._methodName}" already exists`);
    }
    this._procedures.set(this._methodName, []);
  }

  undo(): void {
    this._procedures.delete(this._methodName);
  }
}

/** Command to delete a method (procedure or function). */
export class DeleteMethodCommand implements Command {
  private readonly _procedures: Map<string, string[]>;
  private readonly _methodName: string;
  private _capturedStatements: string[] | null = null;

  constructor(procedures: Map<string, string[]>, methodName: string) {
    this._procedures = procedures;
    this._methodName = methodName;
  }

  get description(): string {
    return `Delete method "${this._methodName}"`;
  }

  execute(): void {
    const statements = this._procedures.get(this._methodName);
    if (!statements) {
      throw new Error(`Method "${this._methodName}" not found`);
    }
    this._capturedStatements = [...statements];
    this._procedures.delete(this._methodName);
  }

  undo(): void {
    if (this._capturedStatements !== null) {
      this._procedures.set(this._methodName, [...this._capturedStatements]);
    }
  }
}

/** Command to insert a statement at a specific position in a method. */
export class InsertStatementCommand implements Command {
  private readonly _procedures: Map<string, string[]>;
  private readonly _methodName: string;
  private readonly _index: number;
  private readonly _statement: string;
  private _actualIndex: number | null = null;

  constructor(
    procedures: Map<string, string[]>,
    methodName: string,
    index: number,
    statement: string,
  ) {
    this._procedures = procedures;
    this._methodName = methodName;
    this._index = index;
    this._statement = statement;
  }

  get description(): string {
    return `Insert statement in "${this._methodName}" at ${this._index}`;
  }

  execute(): void {
    const statements = this._procedures.get(this._methodName);
    if (!statements) {
      throw new Error(`Method "${this._methodName}" not found`);
    }
    const idx = Math.max(0, Math.min(this._index, statements.length));
    statements.splice(idx, 0, this._statement);
    this._actualIndex = idx;
  }

  undo(): void {
    if (this._actualIndex === null) return;
    const statements = this._procedures.get(this._methodName);
    if (statements) {
      statements.splice(this._actualIndex, 1);
    }
  }
}
