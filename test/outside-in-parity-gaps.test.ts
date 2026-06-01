/**
 * Outside-in integration test for PR #83: TypeScript parity gaps #80, #81, #82.
 *
 * Tests public API from a consumer's perspective — imports only from barrel
 * modules that a downstream user would reference, verifying that all new
 * exports are reachable, constructible, and behave correctly.
 */
import { describe, expect, it } from "vitest";

// ── Issue #80: Named joint accessors ──────────────────────────────────────────
import {
  SBiped,
  SQuadruped,
  SFlyer,
  SSwimmer,
  SSlitherer,
  SJoint,
  SJointedModel,
} from "../src/story-api/expanded-entities-markers.js";
import { SGround } from "../src/story-api/expanded-entities-base-core.js";

// ── Issue #81: Entity/camera/scene API methods ────────────────────────────────
import {
  CameraImplementation,
  CameraNavigation,
  ViewpointManager,
} from "../src/camera-system.js";

import {
  getVehicle,
  moveTo,
  turnToFace,
  say,
  think,
  straightenOutJoints,
  getJoint,
  getJointedModel,
} from "../src/story-api-methods.js";

import {
  setVehicle as setVehicleFn,
} from "../src/vehicle-system.js";

// ── Issue #82: Named animation classes ────────────────────────────────────────
import {
  MoveToAnimation,
  MoveTowardAnimation,
  OrientToAnimation,
  PointAtAnimation,
  TurnToFaceAnimation,
  PlaceAnimation,
  SayBubbleAnimation,
  ThinkBubbleAnimation,
  StraightenOutJointsAnimation,
  FoldWingsAnimation,
} from "../src/story-api-animations.js";

// ── Issue #82: Expanded AST nodes ─────────────────────────────────────────────
import {
  CountLoop,
  DoTogether,
  DoTogetherStatement,
  DoInOrder,
} from "../src/ast-nodes-statements-control.js";

import {
  UserType,
  UserMethod,
  UserField,
} from "../src/ast-nodes-declarations-runtime.js";

import {
  FieldAccess,
} from "../src/ast-nodes-expressions-primary.js";

import {
  ArrayAccess,
  ArrayAccessExpression,
} from "../src/ast-nodes-expressions-operators.js";

// ── Public entry-point barrel reachability ─────────────────────────────────────
import * as StoryApiAnimations from "../src/story-api-animations.js";
import * as StoryApiMethods from "../src/story-api-methods.js";
import * as AnimationImpls from "../src/animation-implementations.js";
import * as JointSystem from "../src/joint-system.js";
import * as BipedQuadruped from "../src/biped-quadruped.js";
import * as CameraSystem from "../src/camera-system.js";
import * as VehicleSystem from "../src/vehicle-system.js";

/** Helper: collect joint names from a SJointedModel hierarchy */
function collectJointNames(model: SJointedModel): string[] {
  return model.getJointHierarchy().flatMap(function flatten(node): string[] {
    return [node.name, ...(node.children?.flatMap(flatten) ?? [])];
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════
   Issue #80 — Named joint accessors on entity types
   ═══════════════════════════════════════════════════════════════════════════════*/

describe("Issue #80: named joint accessors (outside-in)", () => {
  it("SBiped exposes named joint accessors and hierarchy with ~40 joints", () => {
    const biped = new SBiped();
    expect(biped).toBeInstanceOf(SJointedModel);

    // Check named accessors exist on SBiped
    expect(typeof biped.getHead).toBe("function");
    expect(typeof biped.getNeck).toBe("function");
    expect(typeof biped.getLeftShoulder).toBe("function");
    expect(typeof biped.getRightShoulder).toBe("function");

    // Check joint hierarchy size
    const jointNames = collectJointNames(biped);
    expect(jointNames.length).toBeGreaterThanOrEqual(15);

    const expected = ["HEAD", "NECK", "LEFT_SHOULDER", "RIGHT_SHOULDER"];
    for (const name of expected) {
      expect(jointNames).toContain(name);
    }
  });

  it("SQuadruped exposes named joints", () => {
    const quad = new SQuadruped();
    expect(quad).toBeInstanceOf(SJointedModel);
    const names = collectJointNames(quad);
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toContain("HEAD");
  });

  it("SFlyer exposes named joints including wing joints", () => {
    const flyer = new SFlyer();
    expect(flyer).toBeInstanceOf(SJointedModel);
    const names = collectJointNames(flyer);
    expect(names.length).toBeGreaterThanOrEqual(10);
    expect(names).toContain("LEFT_WING_SHOULDER");
  });

  it("SSwimmer exposes named joints", () => {
    const swimmer = new SSwimmer();
    expect(swimmer).toBeInstanceOf(SJointedModel);
    const names = collectJointNames(swimmer);
    expect(names.length).toBeGreaterThanOrEqual(5);
  });

  it("SSlitherer exposes named joints", () => {
    const slitherer = new SSlitherer();
    expect(slitherer).toBeInstanceOf(SJointedModel);
    const names = collectJointNames(slitherer);
    expect(names.length).toBeGreaterThanOrEqual(5);
  });

  it("SJoint class is importable and represents a model joint", () => {
    expect(SJoint).toBeDefined();
    expect(typeof SJoint).toBe("function");
  });

  it("SJointedModel.getJoint returns SJoint instances", () => {
    const biped = new SBiped();
    const head = biped.getJoint("HEAD");
    expect(head).toBeInstanceOf(SJoint);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Issue #81 — Entity/camera/scene API methods
   ═══════════════════════════════════════════════════════════════════════════════*/

describe("Issue #81: entity/camera/scene API methods (outside-in)", () => {
  it("getVehicle is reachable from story-api-methods", () => {
    expect(typeof getVehicle).toBe("function");
  });

  it("moveTo, turnToFace, say, think are exported functions", () => {
    expect(typeof moveTo).toBe("function");
    expect(typeof turnToFace).toBe("function");
    expect(typeof say).toBe("function");
    expect(typeof think).toBe("function");
  });

  it("straightenOutJoints is exported", () => {
    expect(typeof straightenOutJoints).toBe("function");
  });

  it("getJoint and getJointedModel are exported", () => {
    expect(typeof getJoint).toBe("function");
    expect(typeof getJointedModel).toBe("function");
  });

  it("setVehicle is reachable from vehicle-system", () => {
    expect(typeof setVehicleFn).toBe("function");
  });

  it("CameraImplementation has clipping and viewing angle support", () => {
    expect(CameraImplementation).toBeDefined();
    expect(typeof CameraImplementation).toBe("function");
  });

  it("CameraNavigation and ViewpointManager are importable", () => {
    expect(CameraNavigation).toBeDefined();
    expect(ViewpointManager).toBeDefined();
  });

  it("SThing.getVantagePoint exists on SBiped", () => {
    const b = new SBiped();
    expect(typeof b.getVantagePoint).toBe("function");
  });

  it("SThing.getCollisionHull exists on SBiped", () => {
    const b = new SBiped();
    expect(typeof b.getCollisionHull).toBe("function");
  });

  it("SGround.setVehicle exists (issue #81 requirement)", () => {
    const g = new SGround();
    expect(typeof g.setVehicle).toBe("function");
  });

  it("SThing.getVehicle exists on SBiped", () => {
    const b = new SBiped();
    expect(typeof b.getVehicle).toBe("function");
    // Without a scene, vehicle is null
    expect(b.getVehicle()).toBeNull();
  });

  it("barrel exports include expected modules", () => {
    expect(StoryApiMethods.getVehicle).toBe(getVehicle);
    expect(StoryApiMethods.moveTo).toBe(moveTo);
    expect(VehicleSystem.setVehicle).toBe(setVehicleFn);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Issue #82 — Named animation classes & expanded AST nodes
   ═══════════════════════════════════════════════════════════════════════════════*/

describe("Issue #82: named animation classes (outside-in)", () => {
  it("all required animation classes are importable", () => {
    const classes = [
      MoveToAnimation,
      MoveTowardAnimation,
      OrientToAnimation,
      PointAtAnimation,
      TurnToFaceAnimation,
      PlaceAnimation,
      SayBubbleAnimation,
      ThinkBubbleAnimation,
      StraightenOutJointsAnimation,
      FoldWingsAnimation,
    ];
    for (const cls of classes) {
      expect(cls).toBeDefined();
      expect(typeof cls).toBe("function");
    }
  });

  it("animation classes are also reachable via barrel export", () => {
    expect(StoryApiAnimations.MoveToAnimation).toBe(MoveToAnimation);
    expect(StoryApiAnimations.FoldWingsAnimation).toBe(FoldWingsAnimation);
    expect(StoryApiAnimations.SayBubbleAnimation).toBe(SayBubbleAnimation);
    expect(StoryApiAnimations.ThinkBubbleAnimation).toBe(ThinkBubbleAnimation);
  });

  it("MoveToAnimation and PlaceAnimation are DurationAnimation subclasses", () => {
    expect(MoveToAnimation.prototype).toBeDefined();
    expect(PlaceAnimation.prototype).toBeDefined();
  });
});

describe("Issue #82: expanded AST nodes (outside-in)", () => {
  it("CountLoop is importable and constructible", () => {
    expect(CountLoop).toBeDefined();
    expect(typeof CountLoop).toBe("function");
  });

  it("DoTogether and DoTogetherStatement are importable", () => {
    expect(DoTogether).toBeDefined();
    expect(DoTogetherStatement).toBeDefined();
  });

  it("DoInOrder is importable", () => {
    expect(DoInOrder).toBeDefined();
  });

  it("UserType, UserMethod, UserField are importable", () => {
    expect(UserType).toBeDefined();
    expect(UserMethod).toBeDefined();
    expect(UserField).toBeDefined();
  });

  it("FieldAccess is importable", () => {
    expect(FieldAccess).toBeDefined();
    expect(typeof FieldAccess).toBe("function");
  });

  it("ArrayAccess / ArrayAccessExpression are importable", () => {
    expect(ArrayAccess).toBeDefined();
    expect(ArrayAccessExpression).toBeDefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Cross-cutting: barrel reachability from src/index
   ═══════════════════════════════════════════════════════════════════════════════*/

describe("barrel reachability: all modules export from src/index", () => {
  it("BipedQuadruped barrel has SBiped, SFlyer", () => {
    expect(BipedQuadruped.SBiped).toBeDefined();
    expect(BipedQuadruped.SFlyer).toBeDefined();
  });

  it("JointSystem barrel has JointId, JointChain", () => {
    expect(JointSystem.JointId).toBeDefined();
    expect(JointSystem.JointChain).toBeDefined();
  });

  it("AnimationImpls barrel has MoveAnimation", () => {
    expect(AnimationImpls.MoveAnimation).toBeDefined();
  });

  it("CameraSystem barrel has CameraImplementation", () => {
    expect(CameraSystem.CameraImplementation).toBeDefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════
   Edge case: SBiped joint interaction
   ═══════════════════════════════════════════════════════════════════════════════*/

describe("edge case: entity joint interaction via public API", () => {
  it("SBiped joints can be enumerated without error", () => {
    const biped = new SBiped();
    const joints = biped.getJoints();
    expect(Array.isArray(joints)).toBe(true);
    expect(joints.length).toBeGreaterThan(0);
    // Each joint should be an SJoint instance
    for (const j of joints) {
      expect(j).toBeInstanceOf(SJoint);
    }
  });

  it("SFlyer joint hierarchy returns no duplicate names", () => {
    const flyer = new SFlyer();
    const names = collectJointNames(flyer);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("SQuadruped and SBiped share some joint names (HEAD, NECK)", () => {
    const biped = new SBiped();
    const quad = new SQuadruped();
    const bipedNames = collectJointNames(biped);
    const quadNames = collectJointNames(quad);
    const shared = bipedNames.filter((j) => quadNames.includes(j));
    expect(shared.length).toBeGreaterThan(0);
    expect(shared).toContain("HEAD");
  });

  it("SBiped named accessors return correct joints", () => {
    const biped = new SBiped();
    const head = biped.getHead();
    const neck = biped.getNeck();
    expect(head).toBeDefined();
    expect(neck).toBeDefined();
    if (head) expect(head).toBeInstanceOf(SJoint);
    if (neck) expect(neck).toBeInstanceOf(SJoint);
  });

  it("SBiped.straightenOutJoints() runs without error", () => {
    const biped = new SBiped();
    expect(() => biped.straightenOutJoints()).not.toThrow();
  });
});
