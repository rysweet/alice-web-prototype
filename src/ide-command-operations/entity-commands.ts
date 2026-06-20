import type { Command } from "../undo-redo";
import type { Scene } from "../story-api/scene";
import type { SThing } from "../story-api/entities";
import { SMovableTurnable, SModel } from "../story-api/entities";
import type { Position } from "../story-api/types";
import type { EntityCloneFactory } from "./contracts";

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
