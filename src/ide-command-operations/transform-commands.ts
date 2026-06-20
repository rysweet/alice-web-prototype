import type { Command } from "../undo-redo";
import type { Scene } from "../story-api/scene";
import { SMovableTurnable } from "../story-api/entities";
import type { Position, Orientation } from "../story-api/types";

// ---------------------------------------------------------------------------
// Entity Transform Commands
// ---------------------------------------------------------------------------

export class SetEntityPositionCommand implements Command {
  private previousPosition: Position | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly entityName: string,
    private readonly newPosition: Position,
  ) {}

  get description(): string {
    return `Move "${this.entityName}"`;
  }

  execute(): void {
    const entity = this.scene.getEntity(this.entityName);
    if (!entity) throw new Error(`Entity "${this.entityName}" not found`);
    if (!(entity instanceof SMovableTurnable)) {
      throw new Error(`Entity "${this.entityName}" does not support position`);
    }
    this.previousPosition = { ...entity.position };
    entity.position = { ...this.newPosition };
  }

  undo(): void {
    if (!this.previousPosition) return;
    const entity = this.scene.getEntity(this.entityName);
    if (entity instanceof SMovableTurnable) {
      entity.position = { ...this.previousPosition };
    }
  }
}

export class SetEntityOrientationCommand implements Command {
  private previousOrientation: Orientation | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly entityName: string,
    private readonly newOrientation: Orientation,
  ) {}

  get description(): string {
    return `Rotate "${this.entityName}"`;
  }

  execute(): void {
    const entity = this.scene.getEntity(this.entityName);
    if (!entity) throw new Error(`Entity "${this.entityName}" not found`);
    if (!(entity instanceof SMovableTurnable)) {
      throw new Error(`Entity "${this.entityName}" does not support orientation`);
    }
    this.previousOrientation = { ...entity.orientation };
    entity.orientation = { ...this.newOrientation };
  }

  undo(): void {
    if (!this.previousOrientation) return;
    const entity = this.scene.getEntity(this.entityName);
    if (entity instanceof SMovableTurnable) {
      entity.orientation = { ...this.previousOrientation };
    }
  }
}

export class SetEntitySizeCommand implements Command {
  private previousSize: { width: number; height: number; depth: number } | null = null;

  constructor(
    private readonly target: { width: number; height: number; depth: number },
    private readonly entityName: string,
    private readonly newSize: { width: number; height: number; depth: number },
  ) {}

  get description(): string {
    return `Resize "${this.entityName}"`;
  }

  execute(): void {
    this.previousSize = {
      width: this.target.width,
      height: this.target.height,
      depth: this.target.depth,
    };
    this.target.width = this.newSize.width;
    this.target.height = this.newSize.height;
    this.target.depth = this.newSize.depth;
  }

  undo(): void {
    if (this.previousSize) {
      this.target.width = this.previousSize.width;
      this.target.height = this.previousSize.height;
      this.target.depth = this.previousSize.depth;
    }
  }
}
