import { describe, expect, it } from "vitest";
import {
  CameraImplementation,
  CameraInterpolation,
  CameraMarker,
  CameraNavigation,
  PointOfView,
  ViewpointManager,
} from "../src/camera-system.js";
import { SCamera, SProp } from "../src/story-api/index.js";

describe("camera-system", () => {
  it("captures and reapplies points of view and projection settings", () => {
    const camera = new SCamera();
    const implementation = new CameraImplementation(camera);
    camera.position = { x: 1, y: 2, z: 3 };
    camera.orientation = { x: 0, y: 0.5, z: 0, w: 0.8660254 };
    camera.setFieldOfView(0.4);

    const pointOfView = implementation.capturePointOfView();
    implementation.setProjectionMode("orthographic");
    implementation.setOrthographicExtents(20, 15);
    camera.position = { x: 9, y: 9, z: 9 };
    implementation.applyPointOfView(pointOfView);

    expect(pointOfView).toBeInstanceOf(PointOfView);
    expect(implementation.projectionMode).toBe("orthographic");
    expect(implementation.orthographicExtents).toEqual({ width: 20, height: 15 });
    expect(camera.position).toEqual({ x: 1, y: 2, z: 3 });
    expect(camera.getFieldOfView()).toBeCloseTo(0.4, 5);
  });

  it("orbits, pans, zooms, and flies cameras between markers", () => {
    const camera = new SCamera();
    const target = new SProp();
    target.position = { x: 0, y: 0, z: 0 };
    camera.position = { x: 0, y: 2, z: 10 };
    const implementation = new CameraImplementation(camera);
    const navigation = new CameraNavigation(implementation);

    navigation.orbit(target, 0.25);
    const afterOrbit = { ...camera.position };
    navigation.pan({ x: 1, y: 0, z: -2 });
    navigation.zoom(0.1);
    const marker = new CameraMarker("closeup", { x: 5, y: 4, z: 3 }, { x: 0, y: 0, z: 0, w: 1 }, 0.2);
    const fly = navigation.flyThrough(marker, 1000);
    const halfway = fly.update(500);
    fly.update(500);

    expect(Math.abs(afterOrbit.x)).toBeGreaterThan(0);
    expect(camera.position).toEqual({ x: 5, y: 4, z: 3 });
    expect(halfway.position.x).toBeGreaterThan(0);
    expect(camera.getFieldOfView()).toBeCloseTo(0.2, 5);
  });

  it("interpolates between markers and cycles named viewpoints", () => {
    const camera = new SCamera();
    const implementation = new CameraImplementation(camera);
    const manager = new ViewpointManager(implementation);
    const first = new CameraMarker("first", { x: 1, y: 2, z: 3 }, { x: 0, y: 0, z: 0, w: 1 }, 0.5);
    const second = new CameraMarker("second", { x: -2, y: 4, z: 6 }, { x: 0, y: 0.7071068, z: 0, w: 0.7071068 }, 0.25);

    manager.add(first);
    manager.add(second);
    expect(manager.cycle()).toBe(first);
    expect(camera.position).toEqual(first.position);
    expect(manager.cycle()).toBe(second);
    expect(camera.position).toEqual(second.position);

    const interpolation = new CameraInterpolation(camera, second, first, 1000, (portion) => portion);
    expect(interpolation.update(500).position.x).toBeCloseTo(-0.5, 5);
    interpolation.update(500);
    expect(camera.position).toEqual(first.position);
  });
});
