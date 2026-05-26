import { describe, expect, it } from "vitest";
import { SBiped } from "../src/biped-quadruped.js";
import { SCamera, SProp } from "../src/story-api/index.js";
import {
  CameraVehicle,
  getPositionInVehicleSpace,
  getVehicle,
  getVehicleRoot,
  getVehicleTransform,
  resolveNestedVehicleTransform,
  resolveVehicleChain,
  setPositionInVehicleSpace,
  setVehicle,
} from "../src/vehicle-system.js";

describe("vehicle-system", () => {
  it("resolves nested vehicles and relative transforms", () => {
    const platform = new SProp();
    const hero = new SBiped("Hero");
    const camera = new SCamera();

    platform.position = { x: 10, y: 0, z: -5 };
    setVehicle(hero, platform);
    setPositionInVehicleSpace(hero, { x: 1, y: 0, z: -2 });
    setVehicle(camera, hero);
    setPositionInVehicleSpace(camera, { x: 0, y: 2, z: 6 });

    expect(getVehicle(hero)).toBe(platform);
    expect(resolveVehicleChain(camera).map((entity) => entity.constructor.name)).toEqual(["SProp", "SBiped", "SCamera"]);
    expect(getVehicleRoot(camera)).toBe(platform);
    expect(getPositionInVehicleSpace(hero)).toEqual({ x: 1, y: 0, z: -2 });
    expect(getVehicleTransform(camera).absolutePosition).toEqual({ x: 11, y: 2, z: -1 });
    expect(resolveNestedVehicleTransform(camera)).toHaveLength(3);
  });

  it("attaches cameras to moving vehicles and keeps the follow chain stable", () => {
    const hero = new SBiped("Hero");
    const cameraVehicle = new CameraVehicle(new SCamera(), { x: 0, y: 3, z: 8 });

    hero.position = { x: 4, y: 1, z: -6 };
    const firstFollow = cameraVehicle.follow(hero);
    hero.walk(2);
    const secondFollow = cameraVehicle.follow(hero);

    expect(cameraVehicle.getChain()).toEqual([hero, cameraVehicle.camera]);
    expect(firstFollow.positionInVehicleSpace).toEqual({ x: 0, y: 3, z: 8 });
    expect(secondFollow.absolutePosition.z).toBeCloseTo(hero.position.z + 8, 5);
    expect(cameraVehicle.camera.orientation.w).not.toBe(1);
  });
});
