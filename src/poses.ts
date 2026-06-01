export interface PoseDefinition {
  readonly name: string;
  readonly jointRotations: Readonly<Record<string, number>>;
}

export interface PoseableEntity {
  jointRotations: Record<string, number>;
}

export const STAND_POSE: PoseDefinition = Object.freeze({
  name: "stand",
  jointRotations: Object.freeze({
    PELVIS_LOWER_BODY: 0,
    SPINE_BASE: 0,
    SPINE_MIDDLE: 0,
    SPINE_UPPER: 0,
    LEFT_HIP: 0,
    RIGHT_HIP: 0,
    LEFT_KNEE: 0,
    RIGHT_KNEE: 0,
    LEFT_ANKLE: 0,
    RIGHT_ANKLE: 0,
    LEFT_SHOULDER: 0,
    RIGHT_SHOULDER: 0,
    LEFT_ELBOW: 0,
    RIGHT_ELBOW: 0,
  }),
});

export const SIT_POSE: PoseDefinition = Object.freeze({
  name: "sit",
  jointRotations: Object.freeze({
    PELVIS_LOWER_BODY: -0.1,
    LEFT_HIP: -1.4,
    RIGHT_HIP: -1.4,
    LEFT_KNEE: 1.4,
    RIGHT_KNEE: 1.4,
    LEFT_ANKLE: 0.1,
    RIGHT_ANKLE: 0.1,
    LEFT_SHOULDER: -0.2,
    RIGHT_SHOULDER: -0.2,
    LEFT_ELBOW: 0.5,
    RIGHT_ELBOW: 0.5,
  }),
});

export const WALK_READY_POSE: PoseDefinition = Object.freeze({
  name: "walk_ready",
  jointRotations: Object.freeze({
    PELVIS_LOWER_BODY: 0,
    LEFT_HIP: -0.15,
    RIGHT_HIP: 0.15,
    LEFT_KNEE: 0.1,
    RIGHT_KNEE: 0.05,
    LEFT_SHOULDER: 0.15,
    RIGHT_SHOULDER: -0.15,
    LEFT_ELBOW: -0.3,
    RIGHT_ELBOW: -0.3,
  }),
});

const WALK_STRIDE_POSE: PoseDefinition = Object.freeze({
  name: "walk_stride",
  jointRotations: Object.freeze({
    PELVIS_LOWER_BODY: 0,
    LEFT_HIP: 0.35,
    RIGHT_HIP: -0.35,
    LEFT_KNEE: 0.05,
    RIGHT_KNEE: 0.4,
    LEFT_SHOULDER: -0.35,
    RIGHT_SHOULDER: 0.35,
    LEFT_ELBOW: -0.3,
    RIGHT_ELBOW: -0.3,
  }),
});

const WALK_PASS_POSE: PoseDefinition = Object.freeze({
  name: "walk_pass",
  jointRotations: Object.freeze({
    PELVIS_LOWER_BODY: 0,
    LEFT_HIP: 0,
    RIGHT_HIP: 0,
    LEFT_KNEE: 0.1,
    RIGHT_KNEE: 0.1,
    LEFT_SHOULDER: 0,
    RIGHT_SHOULDER: 0,
    LEFT_ELBOW: -0.3,
    RIGHT_ELBOW: -0.3,
  }),
});

const WALK_STRIDE_MIRROR_POSE: PoseDefinition = Object.freeze({
  name: "walk_stride_mirror",
  jointRotations: Object.freeze({
    PELVIS_LOWER_BODY: 0,
    LEFT_HIP: -0.35,
    RIGHT_HIP: 0.35,
    LEFT_KNEE: 0.4,
    RIGHT_KNEE: 0.05,
    LEFT_SHOULDER: 0.35,
    RIGHT_SHOULDER: -0.35,
    LEFT_ELBOW: -0.3,
    RIGHT_ELBOW: -0.3,
  }),
});

export function applyPose(entity: PoseableEntity, pose: PoseDefinition): void {
  entity.jointRotations = { ...entity.jointRotations, ...pose.jointRotations };
}

export function createWalkCycle(): PoseDefinition[] {
  return [WALK_READY_POSE, WALK_STRIDE_POSE, WALK_PASS_POSE, WALK_STRIDE_MIRROR_POSE];
}
