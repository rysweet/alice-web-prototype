import type { Scene } from "./expanded-scene";
import {
  IDENTITY_ORIENTATION,
  UNIT_SCALE,
  UNIT_SIZE,
  ZERO_POSITION,
} from "./expanded-math";
import {
  CameraMarkerImp,
  JointImp,
  JointedModelImp,
  MarkerImp,
  ObjectMarkerImp,
  ProgramImp,
  SunImp,
  TargetImp,
  type TransformableImp,
} from "./expanded-implementation";
import type { JointId, JointNode, Orientation, Position, Size } from "./expanded-types";
import {
  type EntityImpFactory,
  type NamedEntityImpFactory,
  SMovableTurnable,
  SThing,
  STurnable,
} from "./expanded-entities-base-core";
import { SModel } from "./expanded-entities-base-models";

const nonEmptyString = (value: string): boolean => typeof value === "string" && value.trim().length > 0;

type JointAliases = Record<string, string>;

function joint(name: string, parentName: string | null, children: JointNode[] = []): JointNode {
  return {
    name,
    parentName,
    children,
    localTransform: {
      position: ZERO_POSITION,
      orientation: IDENTITY_ORIENTATION,
    },
  };
}

const GENERIC_JOINTS: JointNode[] = [joint("ROOT", null)];
const GENERIC_JOINT_ALIASES: JointAliases = {};
const BIPED_JOINTS: JointNode[] = [
  joint("ROOT", null, [
    joint("PELVIS_LOWER_BODY", "ROOT", [
      joint("LEFT_HIP", "PELVIS_LOWER_BODY", [joint("LEFT_KNEE", "LEFT_HIP", [joint("LEFT_ANKLE", "LEFT_KNEE", [joint("LEFT_FOOT", "LEFT_ANKLE")])])]),
      joint("RIGHT_HIP", "PELVIS_LOWER_BODY", [joint("RIGHT_KNEE", "RIGHT_HIP", [joint("RIGHT_ANKLE", "RIGHT_KNEE", [joint("RIGHT_FOOT", "RIGHT_ANKLE")])])]),
    ]),
    joint("SPINE_BASE", "ROOT", [
      joint("SPINE_MIDDLE", "SPINE_BASE", [
        joint("SPINE_UPPER", "SPINE_MIDDLE", [
          joint("NECK", "SPINE_UPPER", [joint("HEAD", "NECK", [joint("MOUTH", "HEAD"), joint("LEFT_EYE", "HEAD"), joint("RIGHT_EYE", "HEAD"), joint("LEFT_EYELID", "HEAD"), joint("RIGHT_EYELID", "HEAD")])]),
          joint("RIGHT_CLAVICLE", "SPINE_UPPER", [joint("RIGHT_SHOULDER", "RIGHT_CLAVICLE", [joint("RIGHT_ELBOW", "RIGHT_SHOULDER", [joint("RIGHT_WRIST", "RIGHT_ELBOW", [joint("RIGHT_HAND", "RIGHT_WRIST", [joint("RIGHT_THUMB", "RIGHT_HAND", [joint("RIGHT_THUMB_KNUCKLE", "RIGHT_THUMB")]), joint("RIGHT_INDEX_FINGER", "RIGHT_HAND", [joint("RIGHT_INDEX_FINGER_KNUCKLE", "RIGHT_INDEX_FINGER")]), joint("RIGHT_MIDDLE_FINGER", "RIGHT_HAND", [joint("RIGHT_MIDDLE_FINGER_KNUCKLE", "RIGHT_MIDDLE_FINGER")]), joint("RIGHT_PINKY_FINGER", "RIGHT_HAND", [joint("RIGHT_PINKY_FINGER_KNUCKLE", "RIGHT_PINKY_FINGER")])])])])])]),
          joint("LEFT_CLAVICLE", "SPINE_UPPER", [joint("LEFT_SHOULDER", "LEFT_CLAVICLE", [joint("LEFT_ELBOW", "LEFT_SHOULDER", [joint("LEFT_WRIST", "LEFT_ELBOW", [joint("LEFT_HAND", "LEFT_WRIST", [joint("LEFT_THUMB", "LEFT_HAND", [joint("LEFT_THUMB_KNUCKLE", "LEFT_THUMB")]), joint("LEFT_INDEX_FINGER", "LEFT_HAND", [joint("LEFT_INDEX_FINGER_KNUCKLE", "LEFT_INDEX_FINGER")]), joint("LEFT_MIDDLE_FINGER", "LEFT_HAND", [joint("LEFT_MIDDLE_FINGER_KNUCKLE", "LEFT_MIDDLE_FINGER")]), joint("LEFT_PINKY_FINGER", "LEFT_HAND", [joint("LEFT_PINKY_FINGER_KNUCKLE", "LEFT_PINKY_FINGER")])])])])])]),
        ]),
      ]),
    ]),
  ]),
];
const BIPED_JOINT_ALIASES: JointAliases = {
  PELVIS: "PELVIS_LOWER_BODY",
  SPINE: "SPINE_BASE",
  CHEST: "SPINE_UPPER",
};
const FLYER_JOINTS: JointNode[] = [
  joint("ROOT", null, [
    joint("SPINE_BASE", "ROOT", [
      joint("SPINE_MIDDLE", "SPINE_BASE", [
        joint("SPINE_UPPER", "SPINE_MIDDLE", [
          joint("NECK_0", "SPINE_UPPER", [joint("NECK_1", "NECK_0", [joint("HEAD", "NECK_1", [joint("MOUTH", "HEAD", [joint("LOWER_LIP", "MOUTH")]), joint("LEFT_EYE", "HEAD"), joint("RIGHT_EYE", "HEAD"), joint("LEFT_EYELID", "HEAD"), joint("RIGHT_EYELID", "HEAD")])])]),
          joint("LEFT_WING_SHOULDER", "SPINE_UPPER", [joint("LEFT_WING_ELBOW", "LEFT_WING_SHOULDER", [joint("LEFT_WING_WRIST", "LEFT_WING_ELBOW", [joint("LEFT_WING_TIP", "LEFT_WING_WRIST")])])]),
          joint("RIGHT_WING_SHOULDER", "SPINE_UPPER", [joint("RIGHT_WING_ELBOW", "RIGHT_WING_SHOULDER", [joint("RIGHT_WING_WRIST", "RIGHT_WING_ELBOW", [joint("RIGHT_WING_TIP", "RIGHT_WING_WRIST")])])]),
        ]),
      ]),
    ]),
    joint("PELVIS_LOWER_BODY", "ROOT", [
      joint("TAIL_0", "PELVIS_LOWER_BODY", [joint("TAIL_1", "TAIL_0", [joint("TAIL_2", "TAIL_1")])]),
      joint("LEFT_HIP", "PELVIS_LOWER_BODY", [joint("LEFT_KNEE", "LEFT_HIP", [joint("LEFT_ANKLE", "LEFT_KNEE", [joint("LEFT_FOOT", "LEFT_ANKLE")])])]),
      joint("RIGHT_HIP", "PELVIS_LOWER_BODY", [joint("RIGHT_KNEE", "RIGHT_HIP", [joint("RIGHT_ANKLE", "RIGHT_KNEE", [joint("RIGHT_FOOT", "RIGHT_ANKLE")])])]),
    ]),
  ]),
];
const FLYER_JOINT_ALIASES: JointAliases = {
  BODY: "SPINE_UPPER",
  LEFT_WING: "LEFT_WING_SHOULDER",
  RIGHT_WING: "RIGHT_WING_SHOULDER",
  TAIL: "TAIL_0",
  LEFT_LEG: "LEFT_HIP",
  RIGHT_LEG: "RIGHT_HIP",
};
const QUADRUPED_JOINTS: JointNode[] = [
  joint("ROOT", null, [
    joint("SPINE_BASE", "ROOT", [
      joint("SPINE_MIDDLE", "SPINE_BASE", [
        joint("SPINE_UPPER", "SPINE_MIDDLE", [
          joint("NECK", "SPINE_UPPER", [joint("HEAD", "NECK", [joint("LEFT_EYE", "HEAD"), joint("LEFT_EYELID", "HEAD"), joint("LEFT_EAR", "HEAD"), joint("MOUTH", "HEAD"), joint("RIGHT_EAR", "HEAD"), joint("RIGHT_EYE", "HEAD"), joint("RIGHT_EYELID", "HEAD")])]),
          joint("FRONT_LEFT_CLAVICLE", "SPINE_UPPER", [joint("FRONT_LEFT_SHOULDER", "FRONT_LEFT_CLAVICLE", [joint("FRONT_LEFT_KNEE", "FRONT_LEFT_SHOULDER", [joint("FRONT_LEFT_ANKLE", "FRONT_LEFT_KNEE", [joint("FRONT_LEFT_FOOT", "FRONT_LEFT_ANKLE", [joint("FRONT_LEFT_TOE", "FRONT_LEFT_FOOT")])])])])]),
          joint("FRONT_RIGHT_CLAVICLE", "SPINE_UPPER", [joint("FRONT_RIGHT_SHOULDER", "FRONT_RIGHT_CLAVICLE", [joint("FRONT_RIGHT_KNEE", "FRONT_RIGHT_SHOULDER", [joint("FRONT_RIGHT_ANKLE", "FRONT_RIGHT_KNEE", [joint("FRONT_RIGHT_FOOT", "FRONT_RIGHT_ANKLE", [joint("FRONT_RIGHT_TOE", "FRONT_RIGHT_FOOT")])])])])]),
        ]),
      ]),
    ]),
    joint("PELVIS_LOWER_BODY", "ROOT", [
      joint("TAIL_0", "PELVIS_LOWER_BODY", [joint("TAIL_1", "TAIL_0", [joint("TAIL_2", "TAIL_1", [joint("TAIL_3", "TAIL_2")])])]),
      joint("BACK_LEFT_HIP", "PELVIS_LOWER_BODY", [joint("BACK_LEFT_KNEE", "BACK_LEFT_HIP", [joint("BACK_LEFT_HOCK", "BACK_LEFT_KNEE", [joint("BACK_LEFT_ANKLE", "BACK_LEFT_HOCK", [joint("BACK_LEFT_FOOT", "BACK_LEFT_ANKLE", [joint("BACK_LEFT_TOE", "BACK_LEFT_FOOT")])])])])]),
      joint("BACK_RIGHT_HIP", "PELVIS_LOWER_BODY", [joint("BACK_RIGHT_KNEE", "BACK_RIGHT_HIP", [joint("BACK_RIGHT_HOCK", "BACK_RIGHT_KNEE", [joint("BACK_RIGHT_ANKLE", "BACK_RIGHT_HOCK", [joint("BACK_RIGHT_FOOT", "BACK_RIGHT_ANKLE", [joint("BACK_RIGHT_TOE", "BACK_RIGHT_FOOT")])])])])]),
    ]),
  ]),
];
const QUADRUPED_JOINT_ALIASES: JointAliases = {
  SPINE: "SPINE_UPPER",
  FRONT_LEFT_HIP: "FRONT_LEFT_CLAVICLE",
  FRONT_RIGHT_HIP: "FRONT_RIGHT_CLAVICLE",
  TAIL: "TAIL_0",
};
const PROP_JOINTS: JointNode[] = [joint("ROOT", null, [joint("BODY", "ROOT"), joint("HANDLE", "ROOT"), joint("MARKER", "ROOT")])];
const SLITHERER_JOINTS: JointNode[] = [joint("ROOT", null, [joint("NECK", "ROOT", [joint("HEAD", "NECK", [joint("MOUTH", "HEAD"), joint("LEFT_EYE", "HEAD", [joint("LEFT_EYELID", "LEFT_EYE")]), joint("RIGHT_EYE", "HEAD", [joint("RIGHT_EYELID", "RIGHT_EYE")])])]), joint("SPINE_BASE", "ROOT", [joint("SPINE_MIDDLE", "SPINE_BASE", [joint("SPINE_UPPER", "SPINE_MIDDLE", [joint("TAIL", "SPINE_UPPER")])])])])];
const SWIMMER_JOINTS: JointNode[] = [joint("ROOT", null, [joint("NECK", "ROOT", [joint("HEAD", "NECK", [joint("MOUTH", "HEAD"), joint("LEFT_EYE", "HEAD", [joint("LEFT_EYELID", "LEFT_EYE")]), joint("RIGHT_EYE", "HEAD", [joint("RIGHT_EYELID", "RIGHT_EYE")])])]), joint("FRONT_LEFT_FIN", "ROOT"), joint("FRONT_RIGHT_FIN", "ROOT"), joint("SPINE_BASE", "ROOT", [joint("SPINE_MIDDLE", "SPINE_BASE", [joint("TAIL", "SPINE_MIDDLE")])])])];

export class SMarker extends SMovableTurnable {
  constructor(
    nameOrImpFactory: NamedEntityImpFactory<MarkerImp> = (owner) => new MarkerImp(owner),
    impFactory?: EntityImpFactory<MarkerImp>,
  ) {
    super(
      nameOrImpFactory as NamedEntityImpFactory<TransformableImp>,
      impFactory ?? ((owner) => new MarkerImp(owner)),
    );
  }

  protected get markerImp(): MarkerImp {
    return this.imp as MarkerImp;
  }

  get size(): Size {
    return this.markerImp.size.value;
  }

  set size(value: Size) {
    this.markerImp.size.value = value;
  }

  get colorId(): string {
    return this.markerImp.color.value;
  }

  set colorId(value: string) {
    if (nonEmptyString(value)) {
      this.markerImp.color.value = value;
    }
  }

  get opacity(): number {
    return this.markerImp.opacity.value;
  }

  set opacity(value: number) {
    this.markerImp.opacity.value = value;
  }
}

export class SThingMarker extends SMarker { constructor() { super((owner) => new ObjectMarkerImp(owner)); } }
export class SCameraMarker extends SMarker { constructor() { super((owner) => new CameraMarkerImp(owner)); } }
export class STarget extends SMovableTurnable { constructor() { super((owner) => new TargetImp(owner)); } }
export class SSun extends STurnable { constructor() { super((owner) => new SunImp(owner)); } }

export class SJoint extends SMovableTurnable {
  readonly parent?: string;

  constructor(jointImp: JointImp) {
    super(() => jointImp);
    const jointId = jointImp.getJointId();
    this.parent = jointId.parent;
  }

  protected get jointImp(): JointImp {
    return this.imp as JointImp;
  }

  get isPivotVisible(): boolean {
    return this.jointImp.pivotVisible.value;
  }

  set isPivotVisible(value: boolean) {
    this.jointImp.pivotVisible.value = value;
  }

  get width(): number { return this.jointImp.size.value.width; }
  get height(): number { return this.jointImp.size.value.height; }
  get depth(): number { return this.jointImp.size.value.depth; }
}

export class SJointedModel extends SModel {
  readonly #jointCache = new Map<string, SJoint>();
  readonly #jointAliases: JointAliases;

  constructor(
    nameOrJointHierarchy?: string | JointNode[] | null,
    jointHierarchy: JointNode[] = GENERIC_JOINTS,
    jointAliases: JointAliases = GENERIC_JOINT_ALIASES,
  ) {
    const initialName = typeof nameOrJointHierarchy === "string" || nameOrJointHierarchy === null
      ? nameOrJointHierarchy
      : undefined;
    const hierarchy = Array.isArray(nameOrJointHierarchy) ? nameOrJointHierarchy : jointHierarchy;
    super(initialName ?? null, (owner) => new JointedModelImp(owner, hierarchy));
    this.#jointAliases = Object.fromEntries(
      Object.entries(jointAliases).map(([alias, canonical]) => [alias.toUpperCase(), canonical]),
    );
  }

  protected get jointedModelImp(): JointedModelImp {
    return this.imp as JointedModelImp;
  }

  protected joint(name: string): SJoint | undefined {
    return this.getJoint(name);
  }

  #resolveJointName(nameOrId: string | JointId): string {
    const requestedName = typeof nameOrId === "string" ? nameOrId : nameOrId.name;
    return this.#jointAliases[requestedName.toUpperCase()] ?? requestedName;
  }

  getJoint(nameOrId: string | JointId): SJoint | undefined {
    return this.getJointEntity(nameOrId);
  }

  getJointId(nameOrId: string | JointId): JointId | undefined {
    return this.jointedModelImp.getJoint(this.#resolveJointName(nameOrId));
  }

  getJointEntity(nameOrId: string | JointId): SJoint | undefined {
    const resolvedName = this.#resolveJointName(nameOrId);
    const key = resolvedName.toUpperCase();
    const cached = this.#jointCache.get(key);
    if (cached) return cached;
    const jointImp = this.jointedModelImp.getJointImplementation(resolvedName);
    if (!jointImp) return undefined;
    const jointEntity = new SJoint(jointImp);
    this.#jointCache.set(key, jointEntity);
    return jointEntity;
  }

  getJoints(): readonly SJoint[] {
    return this.jointedModelImp.getJoints().map((jointImp) => this.getJointEntity(jointImp.getJointId().name)!);
  }

  getJointHierarchy(): JointNode[] {
    return this.jointedModelImp.jointHierarchy;
  }

  straightenOutJoints(): void {
    this.jointedModelImp.straightenOutJoints();
  }

  strikePose(pose: Record<string, Partial<{ position: Position; orientation: Orientation }>>): void {
    this.jointedModelImp.strikePose(pose);
  }
}

export class SBiped extends SJointedModel {
  constructor(name?: string | null) {
    super(name, BIPED_JOINTS, BIPED_JOINT_ALIASES);
  }

  getRoot(): SJoint | undefined { return this.joint("ROOT"); }
  getPelvis(): SJoint | undefined { return this.joint("PELVIS_LOWER_BODY"); }
  getSpineBase(): SJoint | undefined { return this.joint("SPINE_BASE"); }
  getSpineMiddle(): SJoint | undefined { return this.joint("SPINE_MIDDLE"); }
  getSpineUpper(): SJoint | undefined { return this.joint("SPINE_UPPER"); }
  getNeck(): SJoint | undefined { return this.joint("NECK"); }
  getHead(): SJoint | undefined { return this.joint("HEAD"); }
  getMouth(): SJoint | undefined { return this.joint("MOUTH"); }
  getLeftEye(): SJoint | undefined { return this.joint("LEFT_EYE"); }
  getRightEye(): SJoint | undefined { return this.joint("RIGHT_EYE"); }
  getLeftEyelid(): SJoint | undefined { return this.joint("LEFT_EYELID"); }
  getRightEyelid(): SJoint | undefined { return this.joint("RIGHT_EYELID"); }
  getLeftHip(): SJoint | undefined { return this.joint("LEFT_HIP"); }
  getRightHip(): SJoint | undefined { return this.joint("RIGHT_HIP"); }
  getLeftKnee(): SJoint | undefined { return this.joint("LEFT_KNEE"); }
  getRightKnee(): SJoint | undefined { return this.joint("RIGHT_KNEE"); }
  getLeftAnkle(): SJoint | undefined { return this.joint("LEFT_ANKLE"); }
  getRightAnkle(): SJoint | undefined { return this.joint("RIGHT_ANKLE"); }
  getLeftFoot(): SJoint | undefined { return this.joint("LEFT_FOOT"); }
  getRightFoot(): SJoint | undefined { return this.joint("RIGHT_FOOT"); }
  getLeftClavicle(): SJoint | undefined { return this.joint("LEFT_CLAVICLE"); }
  getRightClavicle(): SJoint | undefined { return this.joint("RIGHT_CLAVICLE"); }
  getLeftShoulder(): SJoint | undefined { return this.joint("LEFT_SHOULDER"); }
  getRightShoulder(): SJoint | undefined { return this.joint("RIGHT_SHOULDER"); }
  getLeftElbow(): SJoint | undefined { return this.joint("LEFT_ELBOW"); }
  getRightElbow(): SJoint | undefined { return this.joint("RIGHT_ELBOW"); }
  getLeftWrist(): SJoint | undefined { return this.joint("LEFT_WRIST"); }
  getRightWrist(): SJoint | undefined { return this.joint("RIGHT_WRIST"); }
  getLeftHand(): SJoint | undefined { return this.joint("LEFT_HAND"); }
  getRightHand(): SJoint | undefined { return this.joint("RIGHT_HAND"); }
}

export class SFlyer extends SJointedModel {
  constructor(name?: string | null) {
    super(name, FLYER_JOINTS, FLYER_JOINT_ALIASES);
  }

  getRoot(): SJoint | undefined { return this.joint("ROOT"); }
  getSpineBase(): SJoint | undefined { return this.joint("SPINE_BASE"); }
  getSpineMiddle(): SJoint | undefined { return this.joint("SPINE_MIDDLE"); }
  getSpineUpper(): SJoint | undefined { return this.joint("SPINE_UPPER"); }
  getNeck(): SJoint | undefined { return this.joint("NECK_0"); }
  getHead(): SJoint | undefined { return this.joint("HEAD"); }
  getMouth(): SJoint | undefined { return this.joint("MOUTH"); }
  getLeftEye(): SJoint | undefined { return this.joint("LEFT_EYE"); }
  getRightEye(): SJoint | undefined { return this.joint("RIGHT_EYE"); }
  getLeftEyelid(): SJoint | undefined { return this.joint("LEFT_EYELID"); }
  getRightEyelid(): SJoint | undefined { return this.joint("RIGHT_EYELID"); }
  getLeftWingShoulder(): SJoint | undefined { return this.joint("LEFT_WING_SHOULDER"); }
  getLeftWingElbow(): SJoint | undefined { return this.joint("LEFT_WING_ELBOW"); }
  getLeftWingWrist(): SJoint | undefined { return this.joint("LEFT_WING_WRIST"); }
  getLeftWingTip(): SJoint | undefined { return this.joint("LEFT_WING_TIP"); }
  getRightWingShoulder(): SJoint | undefined { return this.joint("RIGHT_WING_SHOULDER"); }
  getRightWingElbow(): SJoint | undefined { return this.joint("RIGHT_WING_ELBOW"); }
  getRightWingWrist(): SJoint | undefined { return this.joint("RIGHT_WING_WRIST"); }
  getRightWingTip(): SJoint | undefined { return this.joint("RIGHT_WING_TIP"); }
  getTail(): SJoint | undefined { return this.joint("TAIL_0"); }
  getLeftHip(): SJoint | undefined { return this.joint("LEFT_HIP"); }
  getRightHip(): SJoint | undefined { return this.joint("RIGHT_HIP"); }
}

export class SQuadruped extends SJointedModel {
  constructor(name?: string | null) {
    super(name, QUADRUPED_JOINTS, QUADRUPED_JOINT_ALIASES);
  }

  getRoot(): SJoint | undefined { return this.joint("ROOT"); }
  getSpineBase(): SJoint | undefined { return this.joint("SPINE_BASE"); }
  getSpineMiddle(): SJoint | undefined { return this.joint("SPINE_MIDDLE"); }
  getSpineUpper(): SJoint | undefined { return this.joint("SPINE_UPPER"); }
  getNeck(): SJoint | undefined { return this.joint("NECK"); }
  getHead(): SJoint | undefined { return this.joint("HEAD"); }
  getMouth(): SJoint | undefined { return this.joint("MOUTH"); }
  getLeftEye(): SJoint | undefined { return this.joint("LEFT_EYE"); }
  getRightEye(): SJoint | undefined { return this.joint("RIGHT_EYE"); }
  getLeftEar(): SJoint | undefined { return this.joint("LEFT_EAR"); }
  getRightEar(): SJoint | undefined { return this.joint("RIGHT_EAR"); }
  getFrontLeftClavicle(): SJoint | undefined { return this.joint("FRONT_LEFT_CLAVICLE"); }
  getFrontLeftShoulder(): SJoint | undefined { return this.joint("FRONT_LEFT_SHOULDER"); }
  getFrontLeftKnee(): SJoint | undefined { return this.joint("FRONT_LEFT_KNEE"); }
  getFrontLeftAnkle(): SJoint | undefined { return this.joint("FRONT_LEFT_ANKLE"); }
  getFrontLeftFoot(): SJoint | undefined { return this.joint("FRONT_LEFT_FOOT"); }
  getFrontLeftToe(): SJoint | undefined { return this.joint("FRONT_LEFT_TOE"); }
  getFrontRightClavicle(): SJoint | undefined { return this.joint("FRONT_RIGHT_CLAVICLE"); }
  getFrontRightShoulder(): SJoint | undefined { return this.joint("FRONT_RIGHT_SHOULDER"); }
  getFrontRightKnee(): SJoint | undefined { return this.joint("FRONT_RIGHT_KNEE"); }
  getFrontRightAnkle(): SJoint | undefined { return this.joint("FRONT_RIGHT_ANKLE"); }
  getFrontRightFoot(): SJoint | undefined { return this.joint("FRONT_RIGHT_FOOT"); }
  getFrontRightToe(): SJoint | undefined { return this.joint("FRONT_RIGHT_TOE"); }
  getTail(): SJoint | undefined { return this.joint("TAIL_0"); }
  getBackLeftHip(): SJoint | undefined { return this.joint("BACK_LEFT_HIP"); }
  getBackRightHip(): SJoint | undefined { return this.joint("BACK_RIGHT_HIP"); }
}

export class SProp extends SJointedModel { constructor(name?: string | null) { super(name, PROP_JOINTS); } }
export class SSlitherer extends SJointedModel { constructor(name?: string | null) { super(name, SLITHERER_JOINTS); } get head(): SJoint | undefined { return this.getJointEntity("HEAD"); } get tail(): SJoint | undefined { return this.getJointEntity("TAIL"); } }
export class SSwimmer extends SJointedModel { constructor(name?: string | null) { super(name, SWIMMER_JOINTS); } swimTo(entity: SThing): void { this.moveAndOrientTo(entity); } get tail(): SJoint | undefined { return this.getJointEntity("TAIL"); } }

export class SProgram {
  #imp = new ProgramImp();

  get imp(): ProgramImp {
    return this.#imp;
  }

  get activeScene(): Scene | null {
    return this.#imp.activeScene as Scene | null;
  }

  setActiveScene(scene: Scene | null): void {
    this.#imp.setActiveScene(scene);
  }

  get simulationSpeedFactor(): number {
    return this.#imp.simulationSpeedFactor;
  }

  set simulationSpeedFactor(value: number) {
    this.#imp.simulationSpeedFactor = value;
  }
}

export class STransport extends SMovableTurnable {
  constructor(name?: string | null) {
    super(name);
  }
}

export class SVRHand extends SMovableTurnable {
  constructor(name?: string | null) {
    super(name);
  }
}

export class SVRHeadset extends SMovableTurnable {
  constructor(name?: string | null) {
    super(name);
  }
}

export class SVRUser extends SMovableTurnable {
  constructor(name?: string | null) {
    super(name);
  }
}

export class SAxes extends SMovableTurnable {
  constructor(name?: string | null) {
    super(name);
  }
}

export const STORY_API_DEFAULTS = {
  position: ZERO_POSITION,
  orientation: IDENTITY_ORIENTATION,
  size: UNIT_SIZE,
  scale: UNIT_SCALE,
};
