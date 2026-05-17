import type { Position, Orientation, Size, JointId } from "./types";

/** Base entity — name only, no spatial properties. */
export class SThing {}

/** Ground plane — extends SThing with no additional capabilities. */
export class SGround extends SThing {}

/** Scene entity — extends SThing with no additional capabilities. */
export class SScene extends SThing {}

/** Adds orientation (quaternion) to SThing. */
export class STurnable extends SThing {
  private _orientation: Orientation = { x: 0, y: 0, z: 0, w: 1 };

  get orientation(): Orientation {
    return this._orientation;
  }

  set orientation(value: Orientation) {
    if (
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.z) ||
      !Number.isFinite(value.w)
    ) {
      return;
    }
    this._orientation = value;
  }
}

/** Adds position to STurnable. */
export class SMovableTurnable extends STurnable {
  private _position: Position = { x: 0, y: 0, z: 0 };

  get position(): Position {
    return this._position;
  }

  set position(value: Position) {
    if (
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.z)
    ) {
      return;
    }
    this._position = value;
  }
}

/** Camera — position + orientation, no size or joints. */
export class SCamera extends SMovableTurnable {}

/** Adds size to SMovableTurnable. */
export class SModel extends SMovableTurnable {
  private _size: Size = { width: 1, height: 1, depth: 1 };

  get size(): Size {
    return this._size;
  }

  set size(value: Size) {
    if (
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height) ||
      !Number.isFinite(value.depth)
    ) {
      return;
    }
    this._size = value;
  }
}

/** Adds joint hierarchy (not yet populated) to SModel. */
export class SJointedModel extends SModel {
  getJoint(_name: string): JointId | undefined {
    return undefined;
  }
}

/** Humanoid characters. */
export class SBiped extends SJointedModel {}

/** Flying creatures. */
export class SFlyer extends SJointedModel {}

/** Four-legged animals. */
export class SQuadruped extends SJointedModel {}

/** Inanimate objects with joints. */
export class SProp extends SJointedModel {}
