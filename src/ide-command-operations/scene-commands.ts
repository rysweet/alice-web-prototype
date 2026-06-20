import type { Command } from "../undo-redo";
import type { Scene } from "../story-api/scene";
import type { SThing } from "../story-api/entities";
import type { Position, Orientation } from "../story-api/types";
import type { CameraView, GroupingTarget, SelectionModel } from "./contracts";

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
// Add / Remove Entity Commands
// ---------------------------------------------------------------------------

export class AddEntityToSceneCommand implements Command {
  private added = false;

  constructor(
    private readonly scene: Scene,
    private readonly entityName: string,
    private readonly entity: SThing,
  ) {}

  get description(): string {
    return `Add "${this.entityName}" to scene`;
  }

  execute(): void {
    if (this.scene.getEntity(this.entityName)) {
      throw new Error(`Entity "${this.entityName}" already exists`);
    }
    this.scene.addEntity(this.entityName, this.entity);
    this.added = true;
  }

  undo(): void {
    if (this.added) {
      this.scene.removeEntity(this.entityName);
      this.added = false;
    }
  }
}

export class RemoveEntityFromSceneCommand implements Command {
  private removedEntity: SThing | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly entityName: string,
  ) {}

  get description(): string {
    return `Remove "${this.entityName}" from scene`;
  }

  execute(): void {
    const entity = this.scene.getEntity(this.entityName);
    if (!entity) throw new Error(`Entity "${this.entityName}" not found`);
    this.removedEntity = entity;
    this.scene.removeEntity(this.entityName);
  }

  undo(): void {
    if (this.removedEntity) {
      this.scene.addEntity(this.entityName, this.removedEntity);
      this.removedEntity = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Group / Ungroup Commands
// ---------------------------------------------------------------------------

export class GroupEntitiesCommand implements Command {
  private previousSelections: ReadonlySet<string> | null = null;

  constructor(
    private readonly grouping: GroupingTarget,
    private readonly groupName: string,
    private readonly memberNames: string[],
    private readonly selection?: SelectionModel,
  ) {}

  get description(): string {
    return `Group ${this.memberNames.length} entities as "${this.groupName}"`;
  }

  execute(): void {
    for (const name of this.memberNames) {
      if (!this.grouping.getEntity(name)) {
        throw new Error(`Entity "${name}" not found for grouping`);
      }
    }
    if (this.selection) {
      this.previousSelections = new Set(this.selection.selected);
    }
    this.grouping.createGroup(this.groupName, [...this.memberNames]);
    if (this.selection) {
      this.selection.clear();
      this.selection.select([this.groupName]);
    }
  }

  undo(): void {
    this.grouping.dissolveGroup(this.groupName);
    if (this.selection && this.previousSelections) {
      this.selection.clear();
      this.selection.select(this.previousSelections);
    }
  }
}

export class UngroupEntitiesCommand implements Command {
  private dissolvedMembers: string[] = [];

  constructor(
    private readonly grouping: GroupingTarget,
    private readonly groupName: string,
    private readonly selection?: SelectionModel,
  ) {}

  get description(): string {
    return `Ungroup "${this.groupName}"`;
  }

  execute(): void {
    this.dissolvedMembers = this.grouping.dissolveGroup(this.groupName);
    if (this.selection) {
      this.selection.clear();
      this.selection.select(this.dissolvedMembers);
    }
  }

  undo(): void {
    if (this.dissolvedMembers.length > 0) {
      this.grouping.createGroup(this.groupName, this.dissolvedMembers);
      if (this.selection) {
        this.selection.clear();
        this.selection.select([this.groupName]);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scene Property Commands (continued)
// ---------------------------------------------------------------------------

export class SetSceneBackgroundCommand implements Command {
  private previousColor: string | undefined;
  private captured = false;

  constructor(
    private readonly scene: Scene,
    private readonly newColor: string,
  ) {}

  get description(): string {
    return `Set background color to ${this.newColor}`;
  }

  execute(): void {
    this.previousColor = this.scene.atmosphereColor;
    this.captured = true;
    this.scene.atmosphereColor = this.newColor;
  }

  undo(): void {
    if (this.captured) {
      this.scene.atmosphereColor = this.previousColor;
    }
  }
}
