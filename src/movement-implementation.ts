import type {
  JointNode,
  MoveDirection,
  Orientation,
  Position,
  RollDirection,
  Size,
  SpatialRelation,
  TransformSnapshot,
  TurnDirection,
  Vec3,
} from "./story-api";
import {
  IDENTITY_ORIENTATION,
  UNIT_SIZE,
  ZERO_POSITION,
  addVec3,
  cloneOrientation,
  clonePosition,
  cloneSize,
  magnitudeVec3,
  normalizeQuaternion,
  normalizeVec3,
  orientationFromLookDirection,
  quaternionConjugate,
  quaternionFromAxisAngle,
  quaternionMultiply,
  relationOffset,
  revolutionsToRadians,
  rotateVector,
  scaleVec3,
  subtractVec3,
  vectorFromMoveDirection,
} from "./story-api/expanded-math";

export interface EntityTransformState {
  readonly position: Position;
  readonly orientation: Orientation;
  readonly size: Size;
}

export interface VehicleAttachmentResult {
  readonly absolute: EntityTransformState;
  readonly local: EntityTransformState;
  readonly vehicle: EntityTransformState | null;
}

export type JointTransformMap = Readonly<Record<string, TransformSnapshot>>;

function cloneTransform(transform: Partial<EntityTransformState>): EntityTransformState {
  return {
    position: clonePosition(transform.position ?? ZERO_POSITION),
    orientation: cloneOrientation(transform.orientation ?? IDENTITY_ORIENTATION),
    size: cloneSize(transform.size ?? UNIT_SIZE),
  };
}

function cloneTransformSnapshot(transform: TransformSnapshot): TransformSnapshot {
  return {
    position: clonePosition(transform.position),
    orientation: cloneOrientation(transform.orientation),
  };
}

function rotateDisplacement(orientation: Orientation, vector: Position): Position {
  const magnitude = magnitudeVec3(vector);
  if (magnitude === 0) {
    return clonePosition(ZERO_POSITION);
  }
  return scaleVec3(normalizeVec3(rotateVector(orientation, vector)), magnitude);
}

export class StepDuration {
  readonly totalSeconds: number;
  readonly steps: number;
  readonly secondsPerStep: number;

  constructor(totalSeconds: number, steps: number) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
      throw new TypeError("totalSeconds must be a non-negative finite number");
    }
    if (!Number.isFinite(steps) || steps <= 0) {
      throw new TypeError("steps must be a positive finite number");
    }
    this.totalSeconds = totalSeconds;
    this.steps = Math.max(1, Math.round(steps));
    this.secondsPerStep = totalSeconds / this.steps;
  }

  get millisecondsPerStep(): number {
    return this.secondsPerStep * 1000;
  }

  delta(total: number): number {
    return total / this.steps;
  }

  vectorDelta(vector: Position): Position {
    return {
      x: this.delta(vector.x),
      y: this.delta(vector.y),
      z: this.delta(vector.z),
    };
  }

  portionAtStep(stepIndex: number): number {
    if (stepIndex <= 0) {
      return 0;
    }
    if (stepIndex >= this.steps) {
      return 1;
    }
    return stepIndex / this.steps;
  }

  static fromDuration(totalSeconds: number, framesPerSecond = 60): StepDuration {
    if (!Number.isFinite(framesPerSecond) || framesPerSecond <= 0) {
      throw new TypeError("framesPerSecond must be a positive finite number");
    }
    const steps = totalSeconds <= 0 ? 1 : Math.max(1, Math.round(totalSeconds * framesPerSecond));
    return new StepDuration(totalSeconds, steps);
  }
}

export class MoveImplementation {
  readonly transform: EntityTransformState;

  constructor(transform: Partial<EntityTransformState>) {
    this.transform = cloneTransform(transform);
  }

  move(direction: MoveDirection | Vec3, amount: number): EntityTransformState {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const basis = typeof direction === "string"
      ? rotateVector(this.transform.orientation, vectorFromMoveDirection(direction))
      : normalizeVec3(direction);
    const offset = scaleVec3(normalizeVec3(basis), amount);
    return {
      ...this.transform,
      position: addVec3(this.transform.position, offset),
    };
  }

  moveToward(target: Position, amount: number): EntityTransformState {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const delta = subtractVec3(target, this.transform.position);
    const movement = magnitudeVec3(delta) > 0
      ? scaleVec3(normalizeVec3(delta), amount)
      : { x: 0, y: 0, z: amount };
    return {
      ...this.transform,
      position: addVec3(this.transform.position, movement),
    };
  }

  moveAwayFrom(target: Position, amount: number): EntityTransformState {
    return this.moveToward(target, -amount);
  }
}

export class TurnImplementation {
  readonly transform: EntityTransformState;

  constructor(transform: Partial<EntityTransformState>) {
    this.transform = cloneTransform(transform);
  }

  turn(direction: TurnDirection, amount: number): EntityTransformState {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const signed = direction === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(signed));
    return {
      ...this.transform,
      orientation: quaternionMultiply(delta, this.transform.orientation),
    };
  }

  turnToFace(target: Position): EntityTransformState {
    const direction = subtractVec3(target, this.transform.position);
    const planarDirection = { x: direction.x, y: 0, z: direction.z };
    if (magnitudeVec3(planarDirection) === 0) {
      return cloneTransform(this.transform);
    }
    return {
      ...this.transform,
      orientation: orientationFromLookDirection(planarDirection),
    };
  }
}

export class RollImplementation {
  readonly transform: EntityTransformState;

  constructor(transform: Partial<EntityTransformState>) {
    this.transform = cloneTransform(transform);
  }

  roll(direction: RollDirection, amount: number): EntityTransformState {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const signed = direction === "LEFT" ? amount : -amount;
    const forwardAxis = rotateVector(this.transform.orientation, { x: 0, y: 0, z: -1 });
    const delta = quaternionFromAxisAngle(
      forwardAxis.x,
      forwardAxis.y,
      forwardAxis.z,
      revolutionsToRadians(signed),
    );
    return {
      ...this.transform,
      orientation: quaternionMultiply(delta, this.transform.orientation),
    };
  }
}

export class OrientToUprightImplementation {
  readonly transform: EntityTransformState;

  constructor(transform: Partial<EntityTransformState>) {
    this.transform = cloneTransform(transform);
  }

  targetOrientation(): Orientation {
    const forward = rotateVector(this.transform.orientation, { x: 0, y: 0, z: -1 });
    const planarForward = { x: forward.x, y: 0, z: forward.z };
    return orientationFromLookDirection(planarForward);
  }

  rotationDelta(): Orientation {
    return normalizeQuaternion(
      quaternionMultiply(this.targetOrientation(), quaternionConjugate(this.transform.orientation)),
    );
  }

  orient(): EntityTransformState {
    return {
      ...this.transform,
      orientation: this.targetOrientation(),
    };
  }
}

export class PlaceImplementation {
  readonly transform: EntityTransformState;
  readonly target: EntityTransformState;

  constructor(transform: Partial<EntityTransformState>, target: Partial<EntityTransformState>) {
    this.transform = cloneTransform(transform);
    this.target = cloneTransform(target);
  }

  moveAndOrientTo(): EntityTransformState {
    return {
      ...this.transform,
      position: clonePosition(this.target.position),
      orientation: cloneOrientation(this.target.orientation),
    };
  }

  place(relation: SpatialRelation, offset = 0): EntityTransformState {
    const relationDistance = (() => {
      switch (relation) {
        case "ABOVE":
        case "BELOW":
          return (this.target.size.height + this.transform.size.height) / 2 + offset;
        case "LEFT_OF":
        case "RIGHT_OF":
          return (this.target.size.width + this.transform.size.width) / 2 + offset;
        case "IN_FRONT_OF":
        case "BEHIND":
          return (this.target.size.depth + this.transform.size.depth) / 2 + offset;
      }
    })();
    return {
      ...this.transform,
      position: addVec3(this.target.position, relationOffset(relation, relationDistance)),
    };
  }
}

function collectBindPose(nodes: readonly JointNode[]): JointTransformMap {
  const pose: Record<string, TransformSnapshot> = {};
  const visit = (jointNodes: readonly JointNode[]): void => {
    for (const node of jointNodes) {
      pose[node.name] = cloneTransformSnapshot(node.localTransform);
      visit(node.children);
    }
  };
  visit(nodes);
  return pose;
}

export class StraightenOutJointsImplementation {
  readonly bindPose: JointTransformMap;

  constructor(joints: readonly JointNode[]) {
    this.bindPose = collectBindPose(joints);
  }

  straighten(currentPose: JointTransformMap = {}): Record<string, TransformSnapshot> {
    const nextPose: Record<string, TransformSnapshot> = Object.fromEntries(
      Object.entries(currentPose).map(([name, transform]) => [name, cloneTransformSnapshot(transform)]),
    );
    for (const [name, transform] of Object.entries(this.bindPose)) {
      nextPose[name] = cloneTransformSnapshot(transform);
    }
    return nextPose;
  }

  jointNames(): string[] {
    return Object.keys(this.bindPose).sort((left, right) => left.localeCompare(right));
  }
}

export class VehicleAttachmentImplementation {
  readonly absolute: EntityTransformState;

  constructor(absolute: Partial<EntityTransformState>) {
    this.absolute = cloneTransform(absolute);
  }

  reparentTo(vehicle: Partial<EntityTransformState> | null): VehicleAttachmentResult {
    const resolvedVehicle = vehicle ? cloneTransform(vehicle) : null;
    return {
      absolute: cloneTransform(this.absolute),
      local: VehicleAttachmentImplementation.toLocalSpace(this.absolute, resolvedVehicle),
      vehicle: resolvedVehicle,
    };
  }

  static toLocalSpace(
    absolute: Partial<EntityTransformState>,
    vehicle: Partial<EntityTransformState> | null,
  ): EntityTransformState {
    const absoluteTransform = cloneTransform(absolute);
    if (!vehicle) {
      return absoluteTransform;
    }
    const vehicleTransform = cloneTransform(vehicle);
    const inverseVehicleOrientation = quaternionConjugate(vehicleTransform.orientation);
    const localPosition = rotateDisplacement(
      inverseVehicleOrientation,
      subtractVec3(absoluteTransform.position, vehicleTransform.position),
    );
    return {
      ...absoluteTransform,
      position: localPosition,
      orientation: quaternionMultiply(inverseVehicleOrientation, absoluteTransform.orientation),
    };
  }

  static toAbsoluteSpace(
    local: Partial<EntityTransformState>,
    vehicle: Partial<EntityTransformState> | null,
  ): EntityTransformState {
    const localTransform = cloneTransform(local);
    if (!vehicle) {
      return localTransform;
    }
    const vehicleTransform = cloneTransform(vehicle);
    return {
      ...localTransform,
      position: addVec3(vehicleTransform.position, rotateDisplacement(vehicleTransform.orientation, localTransform.position)),
      orientation: quaternionMultiply(vehicleTransform.orientation, localTransform.orientation),
    };
  }
}
