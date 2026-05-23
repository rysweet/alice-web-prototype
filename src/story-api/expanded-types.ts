/** 3D position in Alice's Y-up coordinate system. */
export interface Position {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Quaternion orientation. */
export interface Orientation {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

/** Axis-aligned size or scale triple. */
export interface Size {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

/** Identifies a joint in a jointed model's skeleton hierarchy. */
export interface JointId {
  readonly name: string;
  readonly parent?: string;
}

/** 3D vector for math contexts (bounding boxes, transforms). */
export type Vec3 = Position;

/** Axis-aligned bounding box with min/max corners. */
export interface BoundingBox {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Local transform snapshot for an entity or joint. */
export interface TransformSnapshot {
  readonly position: Vec3;
  readonly orientation: Orientation;
}

/** Node in a skeleton joint hierarchy tree. */
export interface JointNode {
  readonly name: string;
  readonly parentName: string | null;
  readonly children: JointNode[];
  readonly localTransform: TransformSnapshot;
}

/** Captured text bubble state for say()/think(). */
export interface SpeechBubbleState {
  readonly kind: "say" | "think";
  readonly text: string;
  readonly duration: number;
}

export type MoveDirection =
  | "FORWARD"
  | "BACKWARD"
  | "LEFT"
  | "RIGHT"
  | "UP"
  | "DOWN";

export type TurnDirection = "LEFT" | "RIGHT";
export type RollDirection = "LEFT" | "RIGHT";

export type SpatialRelation =
  | "ABOVE"
  | "BELOW"
  | "LEFT_OF"
  | "RIGHT_OF"
  | "IN_FRONT_OF"
  | "BEHIND";
