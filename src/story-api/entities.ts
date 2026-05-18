import type { Position, Orientation, Size, JointId } from "./types";

/** Base entity — visibility only, no spatial properties. */
export class SThing {
  private _isShowing: boolean = true;

  get isShowing(): boolean {
    return this._isShowing;
  }

  set isShowing(value: boolean) {
    if (typeof value !== "boolean") return;
    this._isShowing = value;
  }
}

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

/** Adds position and paint to STurnable. */
export class SMovableTurnable extends STurnable {
  private _position: Position = { x: 0, y: 0, z: 0 };
  private _paint: string = "WHITE";

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

  get paint(): string {
    return this._paint;
  }

  set paint(value: string) {
    if (typeof value !== "string" || value === "") return;
    this._paint = value;
  }
}

/** Camera — position + orientation, no size or joints. */
export class SCamera extends SMovableTurnable {}

/** Adds size, color, opacity, and vehicle to SMovableTurnable. */
export class SModel extends SMovableTurnable {
  private _size: Size = { width: 1, height: 1, depth: 1 };
  private _color: string = "WHITE";
  private _opacity: number = 1.0;
  private _vehicle: SThing | null = null;

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

  get color(): string {
    return this._color;
  }

  set color(value: string) {
    if (typeof value !== "string" || value === "") return;
    this._color = value;
  }

  get opacity(): number {
    return this._opacity;
  }

  set opacity(value: number) {
    if (!Number.isFinite(value)) return;
    this._opacity = value;
  }

  get vehicle(): SThing | null {
    return this._vehicle;
  }

  set vehicle(value: SThing | null) {
    if (value === null) {
      this._vehicle = null;
      return;
    }
    if (!(value instanceof SThing)) return;
    this._vehicle = value;
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
