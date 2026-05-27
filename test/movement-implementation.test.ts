import { describe, expect, it } from "vitest";
import { SBiped, SProp } from "../src/story-api/index.js";
import {
  MoveImplementation,
  OrientToUprightImplementation,
  PlaceImplementation,
  RollImplementation,
  StepDuration,
  StraightenOutJointsImplementation,
  TurnImplementation,
  VehicleAttachmentImplementation,
  type EntityTransformState,
} from "../src/movement-implementation.js";
import { rotateVector } from "../src/story-api/expanded-math.js";

function expectPositionCloseTo(
  actual: { x: number; y: number; z: number },
  expected: { x: number; y: number; z: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
}

function expectOrientationCloseTo(
  actual: { x: number; y: number; z: number; w: number },
  expected: { x: number; y: number; z: number; w: number },
): void {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
  expect(actual.z).toBeCloseTo(expected.z, 6);
  expect(actual.w).toBeCloseTo(expected.w, 6);
}

describe("movement-implementation", () => {
  it("computes translated transforms for direct, toward, and away movement", () => {
    const start: EntityTransformState = {
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    };
    const mover = new MoveImplementation(start);

    const forward = mover.move("FORWARD", 2);
    const toward = mover.moveToward({ x: 5, y: 2, z: 3 }, 3);
    const away = mover.moveAwayFrom({ x: 1, y: 5, z: 3 }, 2);

    expectPositionCloseTo(forward.position, { x: 1, y: 2, z: 1 });
    expectPositionCloseTo(toward.position, { x: 4, y: 2, z: 3 });
    expectPositionCloseTo(away.position, { x: 1, y: 0, z: 3 });
  });

  it("turns left and faces targets using planar headings", () => {
    const start: EntityTransformState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    };
    const turner = new TurnImplementation(start);

    const rotated = turner.turn("LEFT", 0.25);
    const facing = turner.turnToFace({ x: 5, y: 10, z: 0 });

    const turnedForward = rotateVector(rotated.orientation, { x: 0, y: 0, z: -1 });
    expect(turnedForward.x).toBeLessThan(-0.99);
    expect(Math.abs(turnedForward.z)).toBeLessThan(0.01);

    const facingForward = rotateVector(facing.orientation, { x: 0, y: 0, z: -1 });
    expect(facingForward.x).toBeCloseTo(1, 6);
    expect(facingForward.y).toBeCloseTo(0, 6);
    expect(Math.abs(facingForward.z)).toBeLessThan(1e-6);
  });

  it("rolls around the current forward axis and preserves heading", () => {
    const roller = new RollImplementation({
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    });

    const rolled = roller.roll("LEFT", 0.25);
    const forward = rotateVector(rolled.orientation, { x: 0, y: 0, z: -1 });
    const up = rotateVector(rolled.orientation, { x: 0, y: 1, z: 0 });

    expectPositionCloseTo(forward, { x: 0, y: 0, z: -1 });
    expect(Math.abs(up.x)).toBeGreaterThan(0.99);
    expect(Math.abs(up.y)).toBeLessThan(0.01);
  });

  it("orients upright while preserving planar look direction", () => {
    const start: EntityTransformState = {
      position: { x: 0, y: 0, z: 0 },
      orientation: new TurnImplementation({
        position: { x: 0, y: 0, z: 0 },
        orientation: new RollImplementation({
          position: { x: 0, y: 0, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
          size: { width: 1, height: 1, depth: 1 },
        }).roll("LEFT", 0.125).orientation,
        size: { width: 1, height: 1, depth: 1 },
      }).turn("LEFT", 0.25).orientation,
      size: { width: 1, height: 1, depth: 1 },
    };
    const upright = new OrientToUprightImplementation(start);

    const oriented = upright.orient();
    const forwardBefore = rotateVector(start.orientation, { x: 0, y: 0, z: -1 });
    const forwardAfter = rotateVector(oriented.orientation, { x: 0, y: 0, z: -1 });
    const upAfter = rotateVector(oriented.orientation, { x: 0, y: 1, z: 0 });

    expect(forwardAfter.x).toBeCloseTo(forwardBefore.x, 6);
    expect(forwardAfter.z).toBeCloseTo(forwardBefore.z, 6);
    expect(upAfter.x).toBeCloseTo(0, 6);
    expect(upAfter.y).toBeCloseTo(1, 6);
    expect(upright.rotationDelta().w).not.toBeCloseTo(1, 6);
  });

  it("places relative to targets and can match target transforms exactly", () => {
    const self = {
      position: { x: 0, y: 0, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 2, height: 4, depth: 6 },
    };
    const target = {
      position: { x: 10, y: 2, z: -8 },
      orientation: { x: 0, y: 0.70710678, z: 0, w: 0.70710678 },
      size: { width: 4, height: 2, depth: 8 },
    };
    const placement = new PlaceImplementation(self, target);

    const above = placement.place("ABOVE", 0.5);
    const aligned = placement.moveAndOrientTo();

    expectPositionCloseTo(above.position, { x: 10, y: 5.5, z: -8 });
    expectPositionCloseTo(aligned.position, target.position);
    expectOrientationCloseTo(aligned.orientation, target.orientation);
  });

  it("restores bind-pose transforms for every joint in a hierarchy", () => {
    const biped = new SBiped("hero");
    const straightener = new StraightenOutJointsImplementation(biped.getJointHierarchy());
    const currentPose = {
      HEAD: {
        position: { x: 1, y: 2, z: 3 },
        orientation: { x: 0, y: 0.5, z: 0.5, w: 0.5 },
      },
      LEFT_HAND: {
        position: { x: -2, y: 0, z: 0 },
        orientation: { x: 0.5, y: 0, z: 0, w: 0.5 },
      },
    };

    const reset = straightener.straighten(currentPose);

    expect(straightener.jointNames()).toContain("HEAD");
    expect(reset.HEAD).toEqual(
      biped.getJointHierarchy()[0]!.children[1]!.children[0]!.children[0]!.children[0]!.children[0]!.localTransform,
    );
    expect(reset.LEFT_HAND?.orientation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
  });

  it("computes vehicle-space corrections that preserve world transforms", () => {
    const childWorld = {
      position: { x: 8, y: 1, z: -4 },
      orientation: new TurnImplementation({
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        size: { width: 1, height: 1, depth: 1 },
      }).turn("LEFT", 0.25).orientation,
      size: { width: 1, height: 2, depth: 1 },
    };
    const vehicleWorld = {
      position: { x: 5, y: 1, z: -4 },
      orientation: new TurnImplementation({
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
        size: { width: 1, height: 1, depth: 1 },
      }).turn("RIGHT", 0.25).orientation,
      size: { width: 4, height: 2, depth: 4 },
    };

    const attachment = new VehicleAttachmentImplementation(childWorld).reparentTo(vehicleWorld);
    const restored = VehicleAttachmentImplementation.toAbsoluteSpace(attachment.local, vehicleWorld);

    expectPositionCloseTo(restored.position, childWorld.position);
    expectOrientationCloseTo(restored.orientation, childWorld.orientation);
  });

  it("derives per-step deltas for smooth animation timing", () => {
    const stepDuration = StepDuration.fromDuration(0.5, 8);

    expect(stepDuration.steps).toBe(4);
    expect(stepDuration.secondsPerStep).toBeCloseTo(0.125, 6);
    expect(stepDuration.delta(2)).toBeCloseTo(0.5, 6);
    expect(stepDuration.vectorDelta({ x: 6, y: 3, z: -9 })).toEqual({ x: 1.5, y: 0.75, z: -2.25 });
    expect(stepDuration.portionAtStep(2)).toBeCloseTo(0.5, 6);
  });

  it("matches existing story-api motion helpers for a concrete prop", () => {
    const prop = new SProp();
    const target = new SProp();
    target.position = { x: 3, y: 4, z: -9 };

    const toward = new MoveImplementation({
      position: prop.position,
      orientation: prop.orientation,
      size: prop.size,
    }).moveToward(target.position, 5);

    prop.moveToward(target, 5);

    expectPositionCloseTo(prop.position, toward.position);
  });
});
