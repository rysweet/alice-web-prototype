import { describe, expect, it } from "vitest";
import {
  applyJointLimits,
  blendIkWithKeyframe,
  forwardVectorOf,
  orientationToEulerAngles,
  solveCcd,
  solveFabrik,
  trackIkTarget,
  type IkChainDefinition,
  type IkJoint,
} from "../src/ik-solver.js";

function armChain(overrides: Partial<IkJoint>[] = []): IkChainDefinition {
  const joints: IkJoint[] = [
    { name: "ROOT", position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, limits: overrides[0]?.limits },
    { name: "ELBOW", position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, limits: overrides[1]?.limits },
    { name: "HAND", position: { x: 2, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 }, limits: overrides[2]?.limits },
  ];
  return { joints };
}

describe("ik-solver", () => {
  it("solves reachable targets with CCD", () => {
    const result = solveCcd(armChain(), { x: 1.2, y: 1.2, z: 0 }, { iterations: 24, tolerance: 1e-4 });

    expect(result.distance).toBeLessThan(0.05);
    expect(result.endEffector.y).toBeGreaterThan(0.8);
  });

  it("solves reachable targets with FABRIK", () => {
    const result = solveFabrik(armChain(), { x: 1.4, y: 1.0, z: 0 }, { iterations: 24, tolerance: 1e-4 });

    expect(result.distance).toBeLessThan(0.05);
    expect(result.endEffector.y).toBeGreaterThan(0.7);
  });

  it("applies joint angle limits when clamping orientations", () => {
    const limited = applyJointLimits({ x: 0, y: 0, z: 0.70710678, w: 0.70710678 }, {
      z: { min: -0.2, max: 0.2 },
      twist: { min: -0.2, max: 0.2 },
    });
    const euler = orientationToEulerAngles(limited);

    expect(Math.abs(euler.z)).toBeLessThanOrEqual(0.2001);
  });

  it("supports point-at target tracking for end effectors", () => {
    const result = trackIkTarget(armChain(), {
      position: { x: 1.5, y: 1.0, z: 0 },
      kind: "point-at",
    }, "ccd", { iterations: 24, tolerance: 1e-4 });
    const forward = forwardVectorOf(result.joints[result.joints.length - 1]!.orientation);

    expect(forward.x).toBeGreaterThan(0.1);
    expect(forward.y).toBeGreaterThan(0.1);
  });

  it("blends IK poses with keyframe animation", () => {
    const keyframe = armChain().joints;
    const ikPose = solveCcd(armChain(), { x: 1.2, y: 1.2, z: 0 }).joints;
    const blended = blendIkWithKeyframe(ikPose, keyframe, 0.5);

    expect(blended[2]!.position.x).toBeLessThan(keyframe[2]!.position.x);
    expect(blended[2]!.position.x).toBeGreaterThan(ikPose[2]!.position.x);
    expect(blended[2]!.position.y).toBeGreaterThan(0.3);
    expect(blended[2]!.position.y).toBeLessThan(ikPose[2]!.position.y + 0.1);
  });
});
