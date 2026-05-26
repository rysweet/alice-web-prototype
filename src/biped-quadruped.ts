import type { AnimationClip, AnimationObserver, AnimationStyleLike } from "./animation";
import {
  SBiped as StoryBiped,
  SFlyer as StoryFlyer,
  SJointedModel,
  SQuadruped as StoryQuadruped,
  SSlitherer as StorySlitherer,
  SSwimmer as StorySwimmer,
  type Orientation,
  type Position,
  type TurnDirection,
} from "./story-api";
import {
  BipedJoints,
  FlyerJoints,
  JointedModelResource,
  QuadrupedJoints,
  createJointedModelResourceFromModel,
} from "./joint-system";

export interface AnimationState {
  readonly name: string;
  readonly joints: readonly string[];
  readonly distance?: number;
  readonly amount?: number;
}

function axisAngle(axis: "x" | "y" | "z", revolutions: number): Orientation {
  const radians = revolutions * Math.PI * 2;
  const half = radians * 0.5;
  const sine = Math.sin(half);
  return axis === "x"
    ? { x: sine, y: 0, z: 0, w: Math.cos(half) }
    : axis === "y"
      ? { x: 0, y: sine, z: 0, w: Math.cos(half) }
      : { x: 0, y: 0, z: sine, w: Math.cos(half) };
}

function bindResource(model: SJointedModel, name: string): JointedModelResource {
  return createJointedModelResourceFromModel(name, model);
}

function animationState(name: string, joints: readonly string[], detail: Partial<AnimationState> = {}): AnimationState {
  return { name, joints, ...detail };
}

export const DEFAULT_BIPED_ANIMATIONS = Object.freeze(["walk", "turn", "gesture"] as const);
export const DEFAULT_QUADRUPED_ANIMATIONS = Object.freeze(["trot", "gallop", "tailWag"] as const);
export const DEFAULT_FLYER_ANIMATIONS = Object.freeze(["wingFlap", "soar", "land", "takeoff"] as const);
export const DEFAULT_SWIMMER_ANIMATIONS = Object.freeze(["swim", "dive", "surface"] as const);

export class SBiped extends StoryBiped {
  readonly resource = bindResource(this, "SBiped");
  readonly jointMappings = BipedJoints;
  readonly defaultAnimations = DEFAULT_BIPED_ANIMATIONS;
  lastAnimation: AnimationState | null = null;

  walk(distance = 1): AnimationState {
    this.move("FORWARD", distance);
    this.strikePose({
      LEFT_SHOULDER: { orientation: axisAngle("x", 0.0625) },
      RIGHT_SHOULDER: { orientation: axisAngle("x", -0.0625) },
      LEFT_HIP: { orientation: axisAngle("x", -0.0625) },
      RIGHT_HIP: { orientation: axisAngle("x", 0.0625) },
    });
    return (this.lastAnimation = animationState("walk", ["LEFT_SHOULDER", "RIGHT_SHOULDER", "LEFT_HIP", "RIGHT_HIP"], { distance }));
  }

  turn(
    direction: TurnDirection,
    amount: number,
    duration?: number,
    style?: AnimationStyleLike,
    observer?: AnimationObserver,
  ): AnimationClip | null {
    const clip = super.turn(direction, amount, duration, style, observer);
    this.lastAnimation = animationState("turn", ["SPINE_UPPER", "HEAD"], { amount });
    return clip;
  }

  gesture(kind: "wave" | "point" | "nod" = "wave"): AnimationState {
    if (kind === "point") {
      this.strikePose({
        RIGHT_SHOULDER: { orientation: axisAngle("x", -0.125) },
        RIGHT_ELBOW: { orientation: axisAngle("x", -0.0625) },
      });
      return (this.lastAnimation = animationState("gesture", ["RIGHT_SHOULDER", "RIGHT_ELBOW"]));
    }
    if (kind === "nod") {
      this.strikePose({ HEAD: { orientation: axisAngle("x", 0.03125) } });
      return (this.lastAnimation = animationState("gesture", ["HEAD"]));
    }
    this.strikePose({
      LEFT_SHOULDER: { orientation: axisAngle("z", -0.125) },
      LEFT_ELBOW: { orientation: axisAngle("x", -0.0625) },
    });
    return (this.lastAnimation = animationState("gesture", ["LEFT_SHOULDER", "LEFT_ELBOW"]));
  }
}

export class SQuadruped extends StoryQuadruped {
  readonly resource = bindResource(this, "SQuadruped");
  readonly jointMappings = QuadrupedJoints;
  readonly defaultAnimations = DEFAULT_QUADRUPED_ANIMATIONS;
  lastAnimation: AnimationState | null = null;

  trot(distance = 1.5): AnimationState {
    this.move("FORWARD", distance);
    this.strikePose({
      FRONT_LEFT_SHOULDER: { orientation: axisAngle("x", 0.0625) },
      FRONT_RIGHT_SHOULDER: { orientation: axisAngle("x", -0.0625) },
      BACK_LEFT_HIP: { orientation: axisAngle("x", -0.0625) },
      BACK_RIGHT_HIP: { orientation: axisAngle("x", 0.0625) },
    });
    return (this.lastAnimation = animationState("trot", ["FRONT_LEFT_SHOULDER", "FRONT_RIGHT_SHOULDER", "BACK_LEFT_HIP", "BACK_RIGHT_HIP"], { distance }));
  }

  gallop(distance = 3): AnimationState {
    this.move("FORWARD", distance);
    this.strikePose({
      FRONT_LEFT_SHOULDER: { orientation: axisAngle("x", 0.125) },
      FRONT_RIGHT_SHOULDER: { orientation: axisAngle("x", 0.125) },
      BACK_LEFT_HIP: { orientation: axisAngle("x", -0.125) },
      BACK_RIGHT_HIP: { orientation: axisAngle("x", -0.125) },
    });
    return (this.lastAnimation = animationState("gallop", ["FRONT_LEFT_SHOULDER", "FRONT_RIGHT_SHOULDER", "BACK_LEFT_HIP", "BACK_RIGHT_HIP"], { distance }));
  }

  tailWag(amount = 0.125): AnimationState {
    this.strikePose({ TAIL_0: { orientation: axisAngle("y", amount) } });
    return (this.lastAnimation = animationState("tailWag", ["TAIL_0"], { amount }));
  }
}

export class SFlyer extends StoryFlyer {
  readonly resource = bindResource(this, "SFlyer");
  readonly jointMappings = FlyerJoints;
  readonly defaultAnimations = DEFAULT_FLYER_ANIMATIONS;
  lastAnimation: AnimationState | null = null;

  wingFlap(amount = 0.125): AnimationState {
    this.strikePose({
      LEFT_WING_SHOULDER: { orientation: axisAngle("z", amount) },
      RIGHT_WING_SHOULDER: { orientation: axisAngle("z", -amount) },
    });
    return (this.lastAnimation = animationState("wingFlap", ["LEFT_WING_SHOULDER", "RIGHT_WING_SHOULDER"], { amount }));
  }

  soar(distance = 4): AnimationState {
    this.move("FORWARD", distance);
    return (this.lastAnimation = animationState("soar", ["SPINE_UPPER"], { distance }));
  }

  land(depth = 1): AnimationState {
    this.move("DOWN", depth);
    return (this.lastAnimation = animationState("land", ["LEFT_HIP", "RIGHT_HIP"], { distance: depth }));
  }

  takeoff(height = 2): AnimationState {
    this.wingFlap(0.1875);
    this.move("UP", height);
    return (this.lastAnimation = animationState("takeoff", ["LEFT_WING_SHOULDER", "RIGHT_WING_SHOULDER"], { distance: height }));
  }
}

export class SSwimmer extends StorySwimmer {
  readonly resource = bindResource(this, "SSwimmer");
  readonly defaultAnimations = DEFAULT_SWIMMER_ANIMATIONS;
  lastAnimation: AnimationState | null = null;

  swim(distance = 2): AnimationState {
    this.move("FORWARD", distance);
    this.strikePose({ TAIL: { orientation: axisAngle("y", 0.0625) } });
    return (this.lastAnimation = animationState("swim", ["TAIL"], { distance }));
  }

  dive(depth = 1): AnimationState {
    this.move("DOWN", depth);
    return (this.lastAnimation = animationState("dive", ["NECK"], { distance: depth }));
  }

  surface(height = 1): AnimationState {
    this.move("UP", height);
    return (this.lastAnimation = animationState("surface", ["NECK"], { distance: height }));
  }
}

export class SMarineMammal extends SSwimmer {
  readonly resource = bindResource(this, "SMarineMammal");

  tailWag(amount = 0.125): AnimationState {
    this.strikePose({ TAIL: { orientation: axisAngle("y", amount) } });
    return (this.lastAnimation = animationState("tailWag", ["TAIL"], { amount }));
  }
}

export class SSlitherer extends StorySlitherer {
  readonly resource = bindResource(this, "SSlitherer");
  readonly defaultAnimations = Object.freeze(["slither"] as const);
  lastAnimation: AnimationState | null = null;

  slither(distance = 2): AnimationState {
    this.move("FORWARD", distance);
    this.strikePose({
      NECK: { orientation: axisAngle("y", 0.0625) },
      SPINE_BASE: { orientation: axisAngle("y", -0.0625) },
      SPINE_MIDDLE: { orientation: axisAngle("y", 0.0625) },
      SPINE_UPPER: { orientation: axisAngle("y", -0.0625) },
    });
    return (this.lastAnimation = animationState("slither", ["NECK", "SPINE_BASE", "SPINE_MIDDLE", "SPINE_UPPER"], { distance }));
  }
}

export function getBoundResource(model: {
  readonly resource: JointedModelResource;
}): JointedModelResource {
  return model.resource;
}

export function getAbsolutePose(model: SJointedModel): { position: Position; orientation: Orientation } {
  return {
    position: model.imp.getAbsolutePosition(),
    orientation: model.imp.getAbsoluteOrientation(),
  };
}
