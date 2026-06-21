// test/webxr-locomotion.test.ts
import { describe, expect, it } from "vitest";
import {
  createWebXRLocomotion,
  type WebXRInputState,
  type WebXRLocomotionMode,
} from "../src/webxr-locomotion.js";

function inputWithAxes(axes: number[]): WebXRInputState {
  return {
    sources: [
      {
        id: "right:tracked-pointer:oculus-touch-v3",
        handedness: "right",
        profiles: ["oculus-touch-v3"],
        targetRayMode: "tracked-pointer",
        selectPressed: false,
        squeezePressed: false,
        gamepad: {
          axes,
          buttons: [],
        },
        evidence: [],
      },
    ],
    evidence: [],
  };
}

function codes(result: { evidence: { code: string }[] }): string[] {
  return result.evidence.map((item) => item.code);
}

describe("createWebXRLocomotion", () => {
  it("uses combined mode and safe movement defaults when no config is provided", () => {
    const locomotion = createWebXRLocomotion();

    expect(locomotion.mode).toBe("combined");
    expect(locomotion.config).toMatchObject({
      smoothSpeedMetersPerSecond: 1.5,
      clickMoveMaxDistanceMeters: 25,
      clickMoveStepMeters: 0,
      verticalMovement: false,
      movementSurfaceNames: ["ground", "floor", "terrain"],
    });
  });

  it.each<WebXRLocomotionMode>([
    "disabled",
    "controller-smooth",
    "point-click",
    "click-move",
    "combined",
  ])("accepts explicit locomotion mode %s", (mode) => {
    const locomotion = createWebXRLocomotion({ mode });

    expect(locomotion.mode).toBe(mode);
  });

  it("returns finite clamped smooth movement deltas from controller axes", () => {
    const locomotion = createWebXRLocomotion({
      mode: "controller-smooth",
      smoothSpeedMetersPerSecond: 1.5,
    });

    const result = locomotion.update(inputWithAxes([0.5, -2]), 1);

    expect(result.type).toBe("movement");
    expect(result.deltaMeters.x).toBeCloseTo(0.75);
    expect(result.deltaMeters.y).toBe(0);
    expect(result.deltaMeters.z).toBeCloseTo(-1.5);
    expect(result.clamped).toBe(true);
    expect(result.evidence).toEqual([]);
  });

  it("does not move on disabled locomotion and records locomotion-disabled evidence", () => {
    const locomotion = createWebXRLocomotion({ mode: "disabled" });

    const result = locomotion.update(inputWithAxes([1, 1]), 0.5);

    expect(result.type).toBe("none");
    expect(result.deltaMeters).toEqual({ x: 0, y: 0, z: 0 });
    expect(codes(result)).toContain("locomotion-disabled");
  });

  it("ignores non-finite axes and reports non-finite-pose evidence", () => {
    const locomotion = createWebXRLocomotion({ mode: "controller-smooth" });

    const result = locomotion.update(inputWithAxes([Number.POSITIVE_INFINITY, Number.NaN]), 1);

    expect(result.type).toBe("none");
    expect(result.deltaMeters).toEqual({ x: 0, y: 0, z: 0 });
    expect(codes(result)).toContain("non-finite-pose");
  });
});
