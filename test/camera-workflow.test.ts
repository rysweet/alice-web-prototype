import { describe, expect, it } from "vitest";
import {
  CAMERA_MAX_PITCH_DEGREES,
  CAMERA_MIN_ORBIT_DISTANCE,
  CAMERA_MIN_PITCH_DEGREES,
  CameraMarkerNotFoundError,
  applyCameraPreset,
  cloneCameraWorkflowState,
  createDefaultCameraWorkflowState,
  deleteCameraMarker,
  focusCamera,
  listCameraMarkers,
  moveCamera,
  orbitCamera,
  panCamera,
  restoreCameraMarker,
  saveCameraMarker,
  setCameraMode,
  validateCameraWorkflowState,
  zoomCamera,
  type CameraSnapshot,
  type CameraVector3,
  type CameraWorkflowState,
} from "../src/camera-workflow.js";

function distance(left: CameraVector3, right: CameraVector3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function vectorDelta(before: CameraVector3, after: CameraVector3): CameraVector3 {
  return {
    x: after.x - before.x,
    y: after.y - before.y,
    z: after.z - before.z,
  };
}

function expectVectorClose(actual: CameraVector3, expected: CameraVector3, precision = 5): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

function expectFiniteCamera(camera: CameraSnapshot): void {
  for (const vector of [camera.position, camera.target, camera.up]) {
    expect(Number.isFinite(vector.x)).toBe(true);
    expect(Number.isFinite(vector.y)).toBe(true);
    expect(Number.isFinite(vector.z)).toBe(true);
  }

  expect(Number.isFinite(camera.yawDegrees)).toBe(true);
  expect(Number.isFinite(camera.pitchDegrees)).toBe(true);
  expect(Number.isFinite(camera.rollDegrees)).toBe(true);
  expect(Number.isFinite(camera.fieldOfViewDegrees)).toBe(true);
}

describe("camera workflow state model", () => {
  it("creates the default Alice home orbit camera state", () => {
    const state = createDefaultCameraWorkflowState();

    expect(state).toEqual({
      camera: {
        mode: "orbit",
        position: { x: 0, y: 5, z: 20 },
        target: { x: 0, y: 1, z: 0 },
        up: { x: 0, y: 1, z: 0 },
        yawDegrees: 0,
        pitchDegrees: expect.any(Number),
        rollDegrees: 0,
        fieldOfViewDegrees: 60,
        activePreset: "home",
      },
      markers: [],
      activeMarkerId: null,
    });
    expectFiniteCamera(state.camera);
    expect(state.camera.pitchDegrees).toBeGreaterThan(CAMERA_MIN_PITCH_DEGREES);
    expect(state.camera.pitchDegrees).toBeLessThan(CAMERA_MAX_PITCH_DEGREES);
    expect(distance(state.camera.position, state.camera.target)).toBeGreaterThan(CAMERA_MIN_ORBIT_DISTANCE);
  });

  it("validates finite serializable state and returns a defensive deep copy", () => {
    const state = saveCameraMarker(createDefaultCameraWorkflowState(), { name: "Intro view" });
    const validated = validateCameraWorkflowState(state);

    expect(validated).toEqual(state);
    expect(validated).not.toBe(state);
    expect(validated.camera).not.toBe(state.camera);
    expect(validated.markers[0]).not.toBe(state.markers[0]);
    expect(validated.markers[0]?.camera).not.toBe(state.markers[0]?.camera);
  });

  it("rejects invalid state before callers can persist corrupted camera data", () => {
    const validState = createDefaultCameraWorkflowState();
    const invalidState = cloneCameraWorkflowState(validState);
    invalidState.camera.position.x = Number.POSITIVE_INFINITY;

    expect(() => validateCameraWorkflowState(invalidState)).toThrow(TypeError);
    expect(validState.camera.position.x).toBe(0);
  });
});

describe("camera workflow movement", () => {
  it("moves orbit cameras along local axes and moves the target by the same delta", () => {
    const state = createDefaultCameraWorkflowState();
    const moved = moveCamera(state, { forward: 2, right: 1, up: 0.5 });

    expect(moved).not.toBe(state);
    expect(state.camera.activePreset).toBe("home");
    expect(moved.camera.activePreset).toBeNull();
    expect(distance(moved.camera.position, moved.camera.target)).toBeCloseTo(
      distance(state.camera.position, state.camera.target),
      5,
    );
    expectVectorClose(
      vectorDelta(state.camera.position, moved.camera.position),
      vectorDelta(state.camera.target, moved.camera.target),
    );
    expect(moved.camera.position.z).toBeLessThan(state.camera.position.z);
    expect(moved.camera.target.z).toBeLessThan(state.camera.target.z);
  });

  it("pans across the current view plane without changing orbit distance", () => {
    const state = createDefaultCameraWorkflowState();
    const panned = panCamera(state, { right: -2, up: 1 });

    expect(panned.camera.activePreset).toBeNull();
    expect(distance(panned.camera.position, panned.camera.target)).toBeCloseTo(
      distance(state.camera.position, state.camera.target),
      5,
    );
    expectVectorClose(
      vectorDelta(state.camera.position, panned.camera.position),
      vectorDelta(state.camera.target, panned.camera.target),
    );
    expect(panned.camera.position).not.toEqual(state.camera.position);
  });

  it("zooms orbit cameras by changing distance to target and respecting the minimum distance", () => {
    const state = createDefaultCameraWorkflowState();
    const zoomedIn = zoomCamera(state, { delta: -5 });
    const clamped = zoomCamera(state, { delta: -1_000 });

    expect(zoomedIn.camera.activePreset).toBeNull();
    expect(distance(zoomedIn.camera.position, zoomedIn.camera.target)).toBeLessThan(
      distance(state.camera.position, state.camera.target),
    );
    expect(distance(clamped.camera.position, clamped.camera.target)).toBeGreaterThanOrEqual(
      CAMERA_MIN_ORBIT_DISTANCE,
    );
  });

  it("focuses on a target with an optional distance without mutating the original state", () => {
    const state = createDefaultCameraWorkflowState();
    const focused = focusCamera(state, {
      target: { x: 4, y: 2, z: -3 },
      distance: 12,
    });

    expect(focused.camera.target).toEqual({ x: 4, y: 2, z: -3 });
    expect(distance(focused.camera.position, focused.camera.target)).toBeCloseTo(12, 5);
    expect(focused.camera.activePreset).toBeNull();
    expect(state.camera.target).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("orbits around the target and clamps first-person-safe pitch limits", () => {
    const state = createDefaultCameraWorkflowState();
    const orbited = orbitCamera(state, { yawDegrees: 45, pitchDegrees: -120 });

    expect(orbited.camera.activePreset).toBeNull();
    expect(orbited.camera.yawDegrees).toBeCloseTo(45, 5);
    expect(orbited.camera.pitchDegrees).toBe(CAMERA_MIN_PITCH_DEGREES);
    expect(distance(orbited.camera.position, orbited.camera.target)).toBeCloseTo(
      distance(state.camera.position, state.camera.target),
      5,
    );
    expect(orbited.camera.position).not.toEqual(state.camera.position);
  });

  it("rejects non-finite movement input without changing state", () => {
    const state = createDefaultCameraWorkflowState();

    expect(() => moveCamera(state, { forward: Number.NaN })).toThrow(TypeError);
    expect(() => panCamera(state, { right: Number.POSITIVE_INFINITY })).toThrow(TypeError);
    expect(() => zoomCamera(state, { delta: Number.NEGATIVE_INFINITY })).toThrow(TypeError);
    expect(() => focusCamera(state, { target: { x: 0, y: Number.NaN, z: 0 } })).toThrow(TypeError);
    expect(() => orbitCamera(state, { pitchDegrees: Number.POSITIVE_INFINITY })).toThrow(TypeError);
    expect(state).toEqual(createDefaultCameraWorkflowState());
  });
});

describe("camera workflow presets and first-person mode", () => {
  it("applies each standard Alice camera preset and marks it active", () => {
    for (const preset of ["home", "front", "back", "left", "right", "top", "isometric"] as const) {
      const state = applyCameraPreset(createDefaultCameraWorkflowState(), preset);

      expect(state.camera.mode).toBe("orbit");
      expect(state.camera.activePreset).toBe(preset);
      expectFiniteCamera(state.camera);
      expect(distance(state.camera.position, state.camera.target)).toBeGreaterThan(CAMERA_MIN_ORBIT_DISTANCE);
    }
  });

  it("rejects unknown presets and modes", () => {
    const state = createDefaultCameraWorkflowState();
    const applyPreset = applyCameraPreset as (
      currentState: CameraWorkflowState,
      preset: string,
    ) => CameraWorkflowState;
    const setMode = setCameraMode as (
      currentState: CameraWorkflowState,
      mode: string,
    ) => CameraWorkflowState;

    expect(() => applyPreset(state, "over-the-shoulder")).toThrow(TypeError);
    expect(() => setMode(state, "cinematic")).toThrow(TypeError);
  });

  it("switches to first-person mode, moves from the camera point of view, and zooms field of view", () => {
    const orbitState = createDefaultCameraWorkflowState();
    const firstPerson = setCameraMode(orbitState, "first-person");
    const moved = moveCamera(firstPerson, { forward: 3, right: 1 });
    const zoomed = zoomCamera(firstPerson, { delta: -15 });

    expect(firstPerson.camera.mode).toBe("first-person");
    expect(firstPerson.camera.activePreset).toBeNull();
    expect(firstPerson.camera.position).toEqual(orbitState.camera.position);
    expectFiniteCamera(firstPerson.camera);
    expect(moved.camera.position).not.toEqual(firstPerson.camera.position);
    expect(moved.camera.target).not.toEqual(firstPerson.camera.target);
    expect(distance(moved.camera.position, moved.camera.target)).toBeCloseTo(
      distance(firstPerson.camera.position, firstPerson.camera.target),
      5,
    );
    expect(zoomed.camera.fieldOfViewDegrees).toBeLessThan(firstPerson.camera.fieldOfViewDegrees);
    expect(zoomed.camera.fieldOfViewDegrees).toBeGreaterThanOrEqual(1);
    expect(zoomed.camera.position).toEqual(firstPerson.camera.position);
  });
});

describe("camera workflow markers", () => {
  it("saves trimmed marker snapshots as deep copies and lists deep-copied marker records", () => {
    const state = applyCameraPreset(createDefaultCameraWorkflowState(), "front");
    const saved = saveCameraMarker(state, { name: "  Intro view  " });
    const marker = saved.markers[0];

    expect(marker).toBeDefined();
    expect(marker?.id).toMatch(/^camera-marker-/);
    expect(marker?.name).toBe("Intro view");
    expect(marker?.camera).toEqual(state.camera);
    expect(Date.parse(marker?.createdAt ?? "")).not.toBeNaN();
    expect(saved.activeMarkerId).toBe(marker?.id);

    const moved = moveCamera(saved, { forward: 3 });
    expect(saved.markers[0]?.camera.position).toEqual(state.camera.position);
    expect(moved.markers[0]?.camera.position).toEqual(state.camera.position);

    const listed = listCameraMarkers(saved);
    expect(listed).toEqual(saved.markers);
    expect(listed).not.toBe(saved.markers);
    expect(listed[0]).not.toBe(saved.markers[0]);
    expect(listed[0]?.camera).not.toBe(saved.markers[0]?.camera);
  });

  it("restores marker snapshots including active preset and mode", () => {
    const firstPerson = setCameraMode(applyCameraPreset(createDefaultCameraWorkflowState(), "isometric"), "first-person");
    const saved = saveCameraMarker(firstPerson, { name: "First-person intro" });
    const moved = applyCameraPreset(moveCamera(saved, { forward: 2 }), "top");
    const restored = restoreCameraMarker(moved, saved.markers[0]?.id ?? "");

    expect(restored.camera).toEqual(saved.markers[0]?.camera);
    expect(restored.camera.mode).toBe("first-person");
    expect(restored.activeMarkerId).toBe(saved.markers[0]?.id);
  });

  it("deletes markers and clears the active marker when deleted", () => {
    const saved = saveCameraMarker(createDefaultCameraWorkflowState(), { name: "Intro view" });
    const markerId = saved.markers[0]?.id ?? "";
    const deleted = deleteCameraMarker(saved, markerId);

    expect(deleted.markers).toEqual([]);
    expect(deleted.activeMarkerId).toBeNull();
  });

  it("rejects invalid marker names and unknown marker IDs", () => {
    const state = createDefaultCameraWorkflowState();

    expect(() => saveCameraMarker(state, { name: "   " })).toThrow(TypeError);
    expect(() => saveCameraMarker(state, { name: "x".repeat(81) })).toThrow(TypeError);
    expect(() => restoreCameraMarker(state, "missing-marker")).toThrow(CameraMarkerNotFoundError);
    expect(() => deleteCameraMarker(state, "missing-marker")).toThrow(CameraMarkerNotFoundError);
  });
});
