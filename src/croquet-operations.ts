import type { Scene } from "./story-api/scene";
import type { SThing } from "./story-api/entities";
import type { Orientation, Position, Size } from "./story-api/types";

export interface OperationMetadata {
  readonly kind?: string;
  readonly [key: string]: unknown;
}

interface OperationLifecycle {
  readonly execute: () => void;
  readonly undo: () => void;
  readonly redo?: () => void;
}

function clonePosition(value: Position): Position {
  return { ...value };
}

function cloneOrientation(value: Orientation): Orientation {
  return { ...value };
}

function cloneSize(value: Size): Size {
  return { ...value };
}

export class Operation {
  private applied = false;

  constructor(
    readonly name: string,
    private readonly lifecycle: OperationLifecycle,
    readonly metadata: OperationMetadata = {},
  ) {}

  get isApplied(): boolean {
    return this.applied;
  }

  execute(): this {
    if (!this.applied) {
      this.lifecycle.execute();
      this.applied = true;
    }
    return this;
  }

  undo(): this {
    if (this.applied) {
      this.lifecycle.undo();
      this.applied = false;
    }
    return this;
  }

  redo(): this {
    if (!this.applied) {
      (this.lifecycle.redo ?? this.lifecycle.execute)();
      this.applied = true;
    }
    return this;
  }
}

export class CompoundOperation extends Operation {
  readonly operations: readonly Operation[];

  constructor(name: string, operations: readonly Operation[]) {
    const members = [...operations];
    super(
      name,
      {
        execute: () => {
          const executed: Operation[] = [];
          try {
            for (const operation of members) {
              operation.execute();
              executed.push(operation);
            }
          } catch (error) {
            for (const operation of executed.reverse()) {
              operation.undo();
            }
            throw error;
          }
        },
        undo: () => {
          for (const operation of [...members].reverse()) {
            operation.undo();
          }
        },
        redo: () => {
          const redone: Operation[] = [];
          try {
            for (const operation of members) {
              operation.redo();
              redone.push(operation);
            }
          } catch (error) {
            for (const operation of redone.reverse()) {
              operation.undo();
            }
            throw error;
          }
        },
      },
      { kind: "compound", size: members.length },
    );
    this.operations = members;
  }
}

export interface OperationCheckpoint {
  readonly name: string;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly nextUndoName: string | null;
  readonly nextRedoName: string | null;
}

export class OperationHistory {
  private readonly undoStack: Operation[] = [];
  private readonly redoStack: Operation[] = [];
  private readonly checkpoints = new Map<string, OperationCheckpoint>();

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoDepth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  execute<T extends Operation>(operation: T): T {
    operation.execute();
    this.undoStack.push(operation);
    this.redoStack.length = 0;
    return operation;
  }

  undo(): Operation | null {
    const operation = this.undoStack.pop() ?? null;
    if (!operation) {
      return null;
    }
    operation.undo();
    this.redoStack.push(operation);
    return operation;
  }

  redo(): Operation | null {
    const operation = this.redoStack.pop() ?? null;
    if (!operation) {
      return null;
    }
    operation.redo();
    this.undoStack.push(operation);
    return operation;
  }

  createCheckpoint(name: string): OperationCheckpoint {
    const checkpoint: OperationCheckpoint = {
      name,
      undoDepth: this.undoStack.length,
      redoDepth: this.redoStack.length,
      nextUndoName: this.undoStack.at(-1)?.name ?? null,
      nextRedoName: this.redoStack.at(-1)?.name ?? null,
    };
    this.checkpoints.set(name, checkpoint);
    return checkpoint;
  }

  getCheckpoint(name: string): OperationCheckpoint | null {
    return this.checkpoints.get(name) ?? null;
  }

  listCheckpoints(): OperationCheckpoint[] {
    return [...this.checkpoints.values()];
  }

  isAtCheckpoint(name: string): boolean {
    const checkpoint = this.getCheckpoint(name);
    return checkpoint !== null
      && checkpoint.undoDepth === this.undoStack.length
      && checkpoint.redoDepth === this.redoStack.length;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.checkpoints.clear();
  }
}

type TransformTarget = Partial<{
  position: Position;
  orientation: Orientation;
  size: Size;
}>;

export interface DragTransform {
  readonly position?: Position;
  readonly orientation?: Orientation;
  readonly size?: Size;
}

function captureDragTransform(target: TransformTarget, mask: DragTransform): DragTransform {
  const snapshot: { position?: Position; orientation?: Orientation; size?: Size } = {};
  if (mask.position && target.position) {
    snapshot.position = clonePosition(target.position);
  }
  if (mask.orientation && target.orientation) {
    snapshot.orientation = cloneOrientation(target.orientation);
  }
  if (mask.size && target.size) {
    snapshot.size = cloneSize(target.size);
  }
  return snapshot;
}

function applyDragTransform(target: TransformTarget, transform: DragTransform): void {
  if (transform.position) {
    target.position = clonePosition(transform.position);
  }
  if (transform.orientation) {
    target.orientation = cloneOrientation(transform.orientation);
  }
  if (transform.size) {
    target.size = cloneSize(transform.size);
  }
}

export class DragOperation extends Operation {
  readonly target: TransformTarget;
  readonly transform: DragTransform;

  constructor(name: string, target: TransformTarget, transform: DragTransform) {
    const before = captureDragTransform(target, transform);
    const after = {
      position: transform.position ? clonePosition(transform.position) : undefined,
      orientation: transform.orientation ? cloneOrientation(transform.orientation) : undefined,
      size: transform.size ? cloneSize(transform.size) : undefined,
    };
    super(
      name,
      {
        execute: () => applyDragTransform(target, after),
        undo: () => applyDragTransform(target, before),
        redo: () => applyDragTransform(target, after),
      },
      { kind: "drag" },
    );
    this.target = target;
    this.transform = after;
  }
}

export type EditKind = "insert" | "delete" | "modify";
export type StatementContainer<TStatement> = TStatement[] | { statements: TStatement[] };

function getStatements<TStatement>(target: StatementContainer<TStatement>): TStatement[] {
  return Array.isArray(target) ? target : target.statements;
}

export class EditOperation<TStatement> extends Operation {
  readonly kind: EditKind;
  readonly index: number;

  constructor(name: string, target: StatementContainer<TStatement>, kind: EditKind, index: number, value?: TStatement) {
    let removedValue: TStatement | undefined;
    let previousValue: TStatement | undefined;
    const nextValue = value;
    super(
      name,
      {
        execute: () => {
          const statements = getStatements(target);
          switch (kind) {
            case "insert":
              statements.splice(index, 0, nextValue as TStatement);
              break;
            case "delete":
              if (index < 0 || index >= statements.length) {
                throw new RangeError(`statement index ${index} is out of bounds`);
              }
              removedValue = statements.splice(index, 1)[0];
              break;
            case "modify":
              if (index < 0 || index >= statements.length) {
                throw new RangeError(`statement index ${index} is out of bounds`);
              }
              previousValue = statements[index];
              statements[index] = nextValue as TStatement;
              break;
          }
        },
        undo: () => {
          const statements = getStatements(target);
          switch (kind) {
            case "insert":
              statements.splice(index, 1);
              break;
            case "delete":
              statements.splice(index, 0, removedValue as TStatement);
              break;
            case "modify":
              statements[index] = previousValue as TStatement;
              break;
          }
        },
        redo: () => {
          const statements = getStatements(target);
          switch (kind) {
            case "insert":
              statements.splice(index, 0, nextValue as TStatement);
              break;
            case "delete":
              statements.splice(index, 1);
              break;
            case "modify":
              statements[index] = nextValue as TStatement;
              break;
          }
        },
      },
      { kind: "edit", editKind: kind, index },
    );
    this.kind = kind;
    this.index = index;
  }
}

export class PropertyChangeOperation<TTarget extends object, K extends keyof TTarget> extends Operation {
  readonly property: K;

  constructor(
    name: string,
    target: TTarget & Record<K, TTarget[K]>,
    property: K,
    nextValue: TTarget[K],
    clone: (value: TTarget[K]) => TTarget[K] = (value) => value,
  ) {
    const previousValue = clone(target[property]);
    const appliedValue = clone(nextValue);
    super(
      name,
      {
        execute: () => {
          target[property] = clone(appliedValue);
        },
        undo: () => {
          target[property] = clone(previousValue);
        },
        redo: () => {
          target[property] = clone(appliedValue);
        },
      },
      { kind: "property-change", property: String(property) },
    );
    this.property = property;
  }
}

export class AddEntityOperation<TEntity extends SThing> extends Operation {
  readonly entityName: string;
  readonly entity: TEntity;

  constructor(name: string, scene: Scene, entityName: string, entity: TEntity) {
    super(
      name,
      {
        execute: () => {
          scene.addEntity(entityName, entity);
        },
        undo: () => {
          scene.removeEntity(entityName);
        },
        redo: () => {
          scene.addEntity(entityName, entity);
        },
      },
      { kind: "add-entity", entityName },
    );
    this.entityName = entityName;
    this.entity = entity;
  }
}

export class RemoveEntityOperation extends Operation {
  readonly entityName: string;

  constructor(name: string, scene: Scene, entityName: string) {
    let removedEntity: SThing | undefined;
    super(
      name,
      {
        execute: () => {
          removedEntity = scene.getEntity(entityName);
          if (!removedEntity) {
            throw new Error(`Entity \"${entityName}\" not found`);
          }
          scene.removeEntity(entityName);
        },
        undo: () => {
          if (removedEntity) {
            scene.addEntity(entityName, removedEntity);
          }
        },
        redo: () => {
          scene.removeEntity(entityName);
        },
      },
      { kind: "remove-entity", entityName },
    );
    this.entityName = entityName;
  }
}

export interface ReparentableEntity<TParent = unknown> {
  vehicle: TParent | null;
}

export class ReparentOperation<TEntity extends ReparentableEntity<any>> extends Operation {
  readonly entity: TEntity;
  readonly nextParent: TEntity["vehicle"];

  constructor(name: string, entity: TEntity, nextParent: TEntity["vehicle"]) {
    let previousParent = entity.vehicle;
    super(
      name,
      {
        execute: () => {
          previousParent = entity.vehicle;
          entity.vehicle = nextParent;
        },
        undo: () => {
          entity.vehicle = previousParent;
        },
        redo: () => {
          entity.vehicle = nextParent;
        },
      },
      { kind: "reparent" },
    );
    this.entity = entity;
    this.nextParent = nextParent;
  }
}
