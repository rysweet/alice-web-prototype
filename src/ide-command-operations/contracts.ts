import type { SThing } from "../story-api/entities";
import type { Position, Orientation } from "../story-api/types";

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

/** Scene-level entity management contract for add/remove commands. */
export interface SceneEntityManager {
  addEntity(name: string, entity: SThing): void;
  removeEntity(name: string): SThing | undefined;
  getEntity(name: string): SThing | undefined;
  get entities(): ReadonlyMap<string, SThing>;
}

/** Grouping contract for group/ungroup operations. */
export interface GroupingTarget {
  getEntity(id: string): SThing | null;
  createGroup(name: string, memberNames: string[]): SThing;
  dissolveGroup(groupName: string): string[];
}
