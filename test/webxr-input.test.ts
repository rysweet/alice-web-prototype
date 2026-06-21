// test/webxr-input.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  createWebXRInputTracker,
  normalizeWebXRInput,
  type WebXRInputSourceState,
  type WebXRInputState,
} from "../src/webxr-input.js";

const finiteMatrix = [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  2, 3, 4, 1,
];

function makePose(matrix = finiteMatrix) {
  return {
    transform: {
      matrix,
      position: { x: matrix[12], y: matrix[13], z: matrix[14] },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
  };
}

function source(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    handedness: "right",
    profiles: ["oculus-touch-v3"],
    targetRayMode: "tracked-pointer",
    targetRaySpace: { name: "target-ray" },
    gripSpace: { name: "grip" },
    gamepad: {
      axes: [0.25, -0.75],
      buttons: [
        { pressed: true, touched: true, value: 1 },
        { pressed: false, touched: true, value: 0.4 },
      ],
    },
    ...overrides,
  };
}

function evidenceCodes(state: WebXRInputState | WebXRInputSourceState): string[] {
  return state.evidence.map((item) => item.code);
}

describe("normalizeWebXRInput", () => {
  it("normalizes controller target ray, grip, gamepad, and pressed select/squeeze state", () => {
    const inputSource = source();
    const session = { inputSources: [inputSource] };
    const referenceSpace = { type: "local-floor" };
    const frame = {
      getPose: vi.fn((space: { name: string }) => makePose(space.name === "grip" ? finiteMatrix.map((n) => n + 1) : finiteMatrix)),
    };
    const tracker = createWebXRInputTracker();
    tracker.handleSelectStart({ inputSource });
    tracker.handleSqueezeStart({ inputSource });

    const state = normalizeWebXRInput(session, frame, referenceSpace, tracker.snapshot());

    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]).toMatchObject({
      id: "right:tracked-pointer:oculus-touch-v3",
      handedness: "right",
      profiles: ["oculus-touch-v3"],
      targetRayMode: "tracked-pointer",
      selectPressed: true,
      squeezePressed: true,
      gamepad: {
        axes: [0.25, -0.75],
        buttons: [
          { pressed: true, touched: true, value: 1 },
          { pressed: false, touched: true, value: 0.4 },
        ],
      },
    });
    expect(state.sources[0].targetRay?.position).toEqual({ x: 2, y: 3, z: 4 });
    expect(state.sources[0].grip?.position).toEqual({ x: 3, y: 4, z: 5 });
    expect(evidenceCodes(state)).toEqual([]);
  });

  it("records degraded evidence for missing optional controller and hand capabilities", () => {
    const inputSource = source({
      targetRaySpace: undefined,
      gripSpace: undefined,
      gamepad: undefined,
      hand: undefined,
    });
    const session = { inputSources: [inputSource] };
    const frame = { getPose: vi.fn() };

    const state = normalizeWebXRInput(session, frame, { type: "local" });

    expect(state.sources[0]).toMatchObject({
      targetRay: undefined,
      grip: undefined,
      hand: undefined,
      gamepad: undefined,
    });
    expect(evidenceCodes(state.sources[0])).toEqual(
      expect.arrayContaining([
        "controller-missing-target-ray",
        "controller-missing-grip",
        "controller-missing-gamepad",
        "hand-tracking-unsupported",
      ]),
    );
    expect(evidenceCodes(state)).toEqual(expect.arrayContaining(evidenceCodes(state.sources[0])));
  });

  it("rejects non-finite pose matrices and reports non-finite-pose evidence", () => {
    const inputSource = source();
    const session = { inputSources: [inputSource] };
    const frame = {
      getPose: vi.fn(() => makePose([1, 0, 0, 0, 0, Number.NaN, 0, 0, 0, 0, 1, 0, 2, 3, 4, 1])),
    };

    const state = normalizeWebXRInput(session, frame, { type: "local-floor" });

    expect(state.sources[0].targetRay).toBeUndefined();
    expect(state.sources[0].grip).toBeUndefined();
    expect(evidenceCodes(state)).toContain("non-finite-pose");
  });
});
