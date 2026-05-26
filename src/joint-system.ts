import type {
  JointNode,
  JointId as StoryJointId,
  Orientation,
  Position,
  SJointedModel,
} from "./story-api";

export interface JointTransform {
  readonly position: Position;
  readonly orientation: Orientation;
}

export interface JointLimit {
  readonly min?: number;
  readonly max?: number;
}

export interface JointLimits {
  readonly pitch?: JointLimit;
  readonly yaw?: JointLimit;
  readonly roll?: JointLimit;
}

export interface JointVisualSegment {
  readonly joint: JointId;
  readonly from: Position;
  readonly to: Position;
}

const ZERO_POSITION: Position = { x: 0, y: 0, z: 0 };
const IDENTITY_ORIENTATION: Orientation = { x: 0, y: 0, z: 0, w: 1 };

function clonePosition(position: Position): Position {
  return { x: position.x, y: position.y, z: position.z };
}

function cloneOrientation(orientation: Orientation): Orientation {
  return { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w };
}

function addPosition(left: Position, right: Position): Position {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtractPosition(left: Position, right: Position): Position {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scalePosition(position: Position, scalar: number): Position {
  return { x: position.x * scalar, y: position.y * scalar, z: position.z * scalar };
}

function magnitude(position: Position): number {
  return Math.hypot(position.x, position.y, position.z);
}

function distance(left: Position, right: Position): number {
  return magnitude(subtractPosition(left, right));
}

function normalize(position: Position): Position {
  const length = magnitude(position);
  return length > 0 ? scalePosition(position, 1 / length) : ZERO_POSITION;
}

function quaternionMultiply(left: Orientation, right: Orientation): Orientation {
  return normalizeQuaternion({
    w: left.w * right.w - left.x * right.x - left.y * right.y - left.z * right.z,
    x: left.w * right.x + left.x * right.w + left.y * right.z - left.z * right.y,
    y: left.w * right.y - left.x * right.z + left.y * right.w + left.z * right.x,
    z: left.w * right.z + left.x * right.y - left.y * right.x + left.z * right.w,
  });
}

function normalizeQuaternion(orientation: Orientation): Orientation {
  const length = Math.hypot(orientation.x, orientation.y, orientation.z, orientation.w);
  if (length === 0) {
    return IDENTITY_ORIENTATION;
  }
  return {
    x: orientation.x / length,
    y: orientation.y / length,
    z: orientation.z / length,
    w: orientation.w / length,
  };
}

function orientationFromDirection(direction: Position): Orientation {
  const normalized = normalize(direction);
  if (magnitude(normalized) === 0) {
    return IDENTITY_ORIENTATION;
  }
  const yaw = Math.atan2(normalized.x, -normalized.z);
  const pitch = Math.atan2(normalized.y, Math.hypot(normalized.x, normalized.z));
  const yawHalf = yaw * 0.5;
  const pitchHalf = pitch * 0.5;
  return normalizeQuaternion({
    x: Math.sin(pitchHalf) * Math.cos(yawHalf),
    y: Math.cos(pitchHalf) * Math.sin(yawHalf),
    z: -Math.sin(pitchHalf) * Math.sin(yawHalf),
    w: Math.cos(pitchHalf) * Math.cos(yawHalf),
  });
}

function copyTransform(transform?: Partial<JointTransform>): JointTransform {
  return {
    position: clonePosition(transform?.position ?? ZERO_POSITION),
    orientation: cloneOrientation(transform?.orientation ?? IDENTITY_ORIENTATION),
  };
}

export class JointId {
  readonly parentChain: readonly string[];

  constructor(readonly name: string, parentChain: readonly string[] = []) {
    this.parentChain = [...parentChain];
  }

  get path(): readonly string[] {
    return [...this.parentChain, this.name];
  }

  child(name: string): JointId {
    return new JointId(name, this.path);
  }

  isAncestorOf(other: JointId): boolean {
    return this.path.every((segment, index) => other.path[index] === segment) && this.path.length < other.path.length;
  }

  toStoryApiJointId(): StoryJointId {
    const parent = this.parentChain[this.parentChain.length - 1];
    return parent ? { name: this.name, parent } : { name: this.name };
  }

  toString(): string {
    return this.path.join("/");
  }

  static fromPath(path: readonly string[]): JointId {
    if (path.length === 0) {
      throw new TypeError("joint path must contain at least one segment");
    }
    return new JointId(path[path.length - 1], path.slice(0, -1));
  }
}

export class JointImplementation {
  ikTarget: Position | null = null;
  readonly children: JointImplementation[] = [];

  localPosition: Position;
  localOrientation: Orientation;

  constructor(
    readonly id: JointId,
    transform: JointTransform = copyTransform(),
    readonly parent: JointImplementation | null = null,
    readonly limits: JointLimits = {},
  ) {
    this.localPosition = clonePosition(transform.position);
    this.localOrientation = cloneOrientation(transform.orientation);
    this.parent?.children.push(this);
  }

  get worldPosition(): Position {
    return this.parent ? addPosition(this.parent.worldPosition, this.localPosition) : clonePosition(this.localPosition);
  }

  get worldOrientation(): Orientation {
    return this.parent
      ? quaternionMultiply(this.parent.worldOrientation, this.localOrientation)
      : cloneOrientation(this.localOrientation);
  }

  get lengthToParent(): number {
    return magnitude(this.localPosition);
  }

  setIkTarget(target: Position | null): this {
    this.ikTarget = target ? clonePosition(target) : null;
    return this;
  }

  pointToward(target: Position): void {
    this.localOrientation = orientationFromDirection(subtractPosition(target, this.worldPosition));
    this.ikTarget = clonePosition(target);
  }
}

export class JointChain {
  readonly joints: readonly JointImplementation[];

  constructor(joints: readonly JointImplementation[]) {
    if (joints.length < 2) {
      throw new TypeError("joint chain requires at least two joints");
    }
    this.joints = [...joints];
  }

  get root(): JointImplementation {
    return this.joints[0];
  }

  get endEffector(): JointImplementation {
    return this.joints[this.joints.length - 1];
  }

  endEffectorDistanceTo(target: Position): number {
    return distance(this.endEffector.worldPosition, target);
  }

  solveCcd(target: Position, iterations = 8, tolerance = 1e-3): number {
    return this.solveFabrik(target, iterations, tolerance);
  }

  solveFabrik(target: Position, iterations = 8, tolerance = 1e-3): number {
    const targetPosition = clonePosition(target);
    const positions = this.joints.map((joint) => joint.worldPosition);
    const lengths = this.joints.slice(1).map((joint) => joint.lengthToParent);
    const totalLength = lengths.reduce((sum, length) => sum + length, 0);
    const rootPosition = positions[0];

    if (distance(rootPosition, targetPosition) >= totalLength) {
      const direction = normalize(subtractPosition(targetPosition, rootPosition));
      positions[0] = rootPosition;
      for (let index = 1; index < positions.length; index += 1) {
        positions[index] = addPosition(positions[index - 1], scalePosition(direction, lengths[index - 1]));
      }
      this.#applyPositions(positions);
      return this.endEffectorDistanceTo(targetPosition);
    }

    for (let iteration = 0; iteration < iterations; iteration += 1) {
      positions[positions.length - 1] = targetPosition;
      for (let index = positions.length - 2; index >= 0; index -= 1) {
        const direction = normalize(subtractPosition(positions[index], positions[index + 1]));
        positions[index] = addPosition(positions[index + 1], scalePosition(direction, lengths[index]));
      }
      positions[0] = rootPosition;
      for (let index = 1; index < positions.length; index += 1) {
        const direction = normalize(subtractPosition(positions[index], positions[index - 1]));
        positions[index] = addPosition(positions[index - 1], scalePosition(direction, lengths[index - 1]));
      }
      if (distance(positions[positions.length - 1], targetPosition) <= tolerance) {
        break;
      }
    }

    this.#applyPositions(positions);
    return this.endEffectorDistanceTo(targetPosition);
  }

  #applyPositions(worldPositions: readonly Position[]): void {
    for (const [index, joint] of this.joints.entries()) {
      const parent = joint.parent;
      const worldPosition = worldPositions[index];
      joint.localPosition = parent ? subtractPosition(worldPosition, parent.worldPosition) : clonePosition(worldPosition);
      if (index < worldPositions.length - 1) {
        joint.pointToward(worldPositions[index + 1]);
      }
    }
  }
}

export class JointedModelResource {
  readonly hierarchy: readonly JointNode[];
  readonly jointLimits: Readonly<Record<string, JointLimits>>;
  readonly bindPose: Readonly<Record<string, JointTransform>>;

  constructor(
    readonly name: string,
    hierarchy: readonly JointNode[],
    jointLimits: Readonly<Record<string, JointLimits>> = {},
  ) {
    this.hierarchy = JSON.parse(JSON.stringify(hierarchy)) as JointNode[];
    this.jointLimits = { ...jointLimits };
    this.bindPose = Object.freeze(Object.fromEntries(this.listJointIds().map((jointId) => {
      const node = this.#findNode(jointId.name);
      return [jointId.name, copyTransform(node?.localTransform)];
    })));
  }

  listJointIds(): JointId[] {
    const ids: JointId[] = [];
    const visit = (nodes: readonly JointNode[], ancestry: readonly string[]): void => {
      for (const node of nodes) {
        ids.push(new JointId(node.name, ancestry));
        visit(node.children, [...ancestry, node.name]);
      }
    };
    visit(this.hierarchy, []);
    return ids;
  }

  getJointId(name: string): JointId | undefined {
    return this.listJointIds().find((jointId) => jointId.name === name);
  }

  createImplementationMap(): ReadonlyMap<string, JointImplementation> {
    const implementations = new Map<string, JointImplementation>();
    const visit = (nodes: readonly JointNode[], parent: JointImplementation | null, ancestry: readonly string[]): void => {
      for (const node of nodes) {
        const jointId = new JointId(node.name, ancestry);
        const implementation = new JointImplementation(
          jointId,
          copyTransform(node.localTransform),
          parent,
          this.jointLimits[node.name] ?? {},
        );
        implementations.set(node.name, implementation);
        visit(node.children, implementation, [...ancestry, node.name]);
      }
    };
    visit(this.hierarchy, null, []);
    return implementations;
  }

  createChain(...jointNames: string[]): JointChain {
    const implementations = this.createImplementationMap();
    const joints = jointNames.map((name) => {
      const joint = implementations.get(name);
      if (!joint) {
        throw new TypeError(`unknown joint ${name}`);
      }
      return joint;
    });
    return new JointChain(joints);
  }

  #findNode(name: string): JointNode | undefined {
    const stack = [...this.hierarchy];
    while (stack.length > 0) {
      const current = stack.shift()!;
      if (current.name === name) {
        return current;
      }
      stack.unshift(...current.children);
    }
    return undefined;
  }
}

export function createJointedModelResource(
  name: string,
  hierarchy: readonly JointNode[],
  jointLimits: Readonly<Record<string, JointLimits>> = {},
): JointedModelResource {
  return new JointedModelResource(name, hierarchy, jointLimits);
}

export function createJointedModelResourceFromModel(
  name: string,
  model: SJointedModel,
  jointLimits: Readonly<Record<string, JointLimits>> = {},
): JointedModelResource {
  return new JointedModelResource(name, model.getJointHierarchy(), jointLimits);
}

export class JointVisualizer {
  readonly resource: JointedModelResource;

  constructor(resourceOrModel: JointedModelResource | SJointedModel, name = "JointedModel") {
    this.resource = resourceOrModel instanceof JointedModelResource
      ? resourceOrModel
      : createJointedModelResourceFromModel(name, resourceOrModel);
  }

  buildSegments(): JointVisualSegment[] {
    const implementations = this.resource.createImplementationMap();
    return [...implementations.values()]
      .filter((joint) => joint.parent)
      .map((joint) => ({
        joint: joint.id,
        from: joint.parent!.worldPosition,
        to: joint.worldPosition,
      }));
  }
}

export const BipedJoints = Object.freeze({
  ROOT: new JointId("ROOT"),
  PELVIS: new JointId("PELVIS_LOWER_BODY", ["ROOT"]),
  SPINE_BASE: new JointId("SPINE_BASE", ["ROOT"]),
  SPINE_UPPER: new JointId("SPINE_UPPER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE"]),
  HEAD: new JointId("HEAD", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "NECK"]),
  LEFT_SHOULDER: new JointId("LEFT_SHOULDER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "LEFT_CLAVICLE"]),
  LEFT_HAND: new JointId("LEFT_HAND", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "LEFT_CLAVICLE", "LEFT_SHOULDER", "LEFT_ELBOW", "LEFT_WRIST"]),
  RIGHT_SHOULDER: new JointId("RIGHT_SHOULDER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "RIGHT_CLAVICLE"]),
  RIGHT_HAND: new JointId("RIGHT_HAND", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "RIGHT_CLAVICLE", "RIGHT_SHOULDER", "RIGHT_ELBOW", "RIGHT_WRIST"]),
  LEFT_HIP: new JointId("LEFT_HIP", ["ROOT", "PELVIS_LOWER_BODY"]),
  RIGHT_HIP: new JointId("RIGHT_HIP", ["ROOT", "PELVIS_LOWER_BODY"]),
} as const);

export const QuadrupedJoints = Object.freeze({
  ROOT: new JointId("ROOT"),
  SPINE_UPPER: new JointId("SPINE_UPPER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE"]),
  HEAD: new JointId("HEAD", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "NECK"]),
  FRONT_LEFT_SHOULDER: new JointId("FRONT_LEFT_SHOULDER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "FRONT_LEFT_CLAVICLE"]),
  FRONT_RIGHT_SHOULDER: new JointId("FRONT_RIGHT_SHOULDER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "FRONT_RIGHT_CLAVICLE"]),
  BACK_LEFT_HIP: new JointId("BACK_LEFT_HIP", ["ROOT", "PELVIS_LOWER_BODY"]),
  BACK_RIGHT_HIP: new JointId("BACK_RIGHT_HIP", ["ROOT", "PELVIS_LOWER_BODY"]),
  TAIL: new JointId("TAIL_0", ["ROOT", "PELVIS_LOWER_BODY"]),
} as const);

export const FlyerJoints = Object.freeze({
  ROOT: new JointId("ROOT"),
  SPINE_UPPER: new JointId("SPINE_UPPER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE"]),
  HEAD: new JointId("HEAD", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER", "NECK_0", "NECK_1"]),
  LEFT_WING_SHOULDER: new JointId("LEFT_WING_SHOULDER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER"]),
  RIGHT_WING_SHOULDER: new JointId("RIGHT_WING_SHOULDER", ["ROOT", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER"]),
  TAIL: new JointId("TAIL_0", ["ROOT", "PELVIS_LOWER_BODY"]),
  LEFT_HIP: new JointId("LEFT_HIP", ["ROOT", "PELVIS_LOWER_BODY"]),
  RIGHT_HIP: new JointId("RIGHT_HIP", ["ROOT", "PELVIS_LOWER_BODY"]),
} as const);
