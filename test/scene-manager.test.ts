// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import * as THREE from "three";
import type { AliceProject } from "../src/a3p-parser";
import { SceneManager } from "../src/scene-manager.js";

function makeProject(name: string): AliceProject {
  return {
    version: "3.6",
    projectName: name,
    sceneObjects: [],
    methods: [],
  };
}

describe("SceneManager", () => {
  it("starts empty with no active scene or transition", () => {
    const manager = new SceneManager();
    expect(manager.sceneNames).toEqual([]);
    expect(manager.sceneCount).toBe(0);
    expect(manager.activeSceneName).toBeNull();
    expect(manager.lastTransition).toBeNull();
    expect(manager.getActiveCamera()).toBeNull();
  });

  it("activates the first scene immediately and tracks lifecycle state", () => {
    const manager = new SceneManager();
    manager.addScene("intro", makeProject("Intro"));

    const scene = manager.getScene("intro");
    expect(scene?.lifecycle.isActive).toBe(true);
    expect(scene?.lifecycle.activationCount).toBe(1);
    expect(scene?.lifecycle.deactivationCount).toBe(0);
    expect(manager.activeSceneName).toBe("intro");
    expect(manager.getActiveCamera()).toBe(scene?.camera ?? null);
  });

  it("keeps later scenes inactive until selected", () => {
    const manager = new SceneManager();
    manager.addScene("intro", makeProject("Intro"));
    manager.addScene("battle", makeProject("Battle"));

    expect(manager.activeSceneName).toBe("intro");
    expect(manager.getScene("battle")?.lifecycle.isActive).toBe(false);
    expect(manager.getScene("battle")?.lifecycle.activationCount).toBe(0);
  });

  it("applies camera and atmosphere overrides per scene", () => {
    const manager = new SceneManager();
    manager.addScene("custom", makeProject("Custom"), {
      camera: {
        position: { x: 1, y: 2, z: 3 },
        target: { x: 4, y: 5, z: 6 },
        fov: 75,
      },
      atmosphere: {
        backgroundColor: "#112233",
        fogColor: "#334455",
        fogDensity: 0.05,
      },
    });

    const scene = manager.getScene("custom");
    expect(scene?.camera.position.toArray()).toEqual([1, 2, 3]);
    expect(scene?.cameraState.target).toEqual({ x: 4, y: 5, z: 6 });
    expect(scene?.camera.fov).toBe(75);
    expect((scene?.scene.background as THREE.Color).getHexString()).toBe("112233");
    expect(scene?.scene.fog).toBeInstanceOf(THREE.FogExp2);
  });

  it("switches scenes by deactivating the old scene before activating the next one", () => {
    const manager = new SceneManager();
    const events: string[] = [];

    manager.addScene("a", makeProject("A"), {
      onDeactivate: (scene) => events.push(`deactivate:${scene.name}:${scene.lifecycle.deactivationCount}`),
    });
    manager.addScene("b", makeProject("B"), {
      onActivate: (scene) => events.push(`activate:${scene.name}:${scene.lifecycle.activationCount}`),
    });

    manager.setActive("b", { kind: "fade", durationMs: 250 });

    expect(events).toEqual(["deactivate:a:1", "activate:b:1"]);
    expect(manager.activeSceneName).toBe("b");
    expect(manager.getScene("a")?.lifecycle.isActive).toBe(false);
    expect(manager.getScene("a")?.lifecycle.deactivationCount).toBe(1);
    expect(manager.getScene("b")?.lifecycle.isActive).toBe(true);
    expect(manager.lastTransition).toEqual({
      fromScene: "a",
      toScene: "b",
      kind: "fade",
      durationMs: 250,
      sequence: 1,
    });
  });

  it("fires transition callbacks with scene names only", () => {
    const manager = new SceneManager();
    manager.addScene("a", makeProject("A"));
    manager.addScene("b", makeProject("B"));

    const callback = vi.fn();
    manager.onTransition(callback);
    manager.setActive("b");

    expect(callback).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledWith("a", "b");
  });

  it("allows scene lifecycle listeners to be unsubscribed", () => {
    const manager = new SceneManager();
    manager.addScene("a", makeProject("A"));
    manager.addScene("b", makeProject("B"));

    const callback = vi.fn();
    const unsubscribe = manager.onSceneActivate("b", callback);
    unsubscribe();
    manager.setActive("b");

    expect(callback).not.toHaveBeenCalled();
  });

  it("updates per-scene camera state after creation", () => {
    const manager = new SceneManager();
    manager.addScene("a", makeProject("A"));
    manager.setSceneCamera("a", {
      position: { x: 9, y: 8, z: 7 },
      target: { x: 1, y: 0, z: -1 },
      minDistance: 2,
      maxDistance: 25,
    });

    expect(manager.getSceneCameraState("a")).toEqual({
      position: { x: 9, y: 8, z: 7 },
      target: { x: 1, y: 0, z: -1 },
      fov: 60,
      minDistance: 2,
      maxDistance: 25,
      maxPolarAngle: Math.PI * 0.95,
      enableDamping: true,
    });
    expect(manager.getScene("a")?.camera.position.toArray()).toEqual([9, 8, 7]);
  });

  it("updates atmosphere after creation", () => {
    const manager = new SceneManager();
    manager.addScene("a", makeProject("A"));
    manager.setSceneAtmosphere("a", {
      backgroundColor: "#abcdef",
      fogColor: "#fedcba",
      fogNear: 3,
      fogFar: 30,
    });

    const scene = manager.getScene("a");
    expect((scene?.scene.background as THREE.Color).getHexString()).toBe("abcdef");
    expect(scene?.scene.fog).toBeInstanceOf(THREE.Fog);
    expect(manager.getSceneAtmosphere("a")).toMatchObject({
      backgroundColor: "#abcdef",
      fogColor: "#fedcba",
      fogNear: 3,
      fogFar: 30,
    });
  });

  it("removing the active scene promotes the next available scene", () => {
    const manager = new SceneManager();
    manager.addScene("first", makeProject("First"));
    manager.addScene("second", makeProject("Second"));

    expect(manager.removeScene("first")).toBe(true);
    expect(manager.activeSceneName).toBe("second");
    expect(manager.getScene("second")?.lifecycle.isActive).toBe(true);
    expect(manager.getScene("second")?.lifecycle.activationCount).toBe(1);
  });

  it("setActive is a no-op for the current scene", () => {
    const manager = new SceneManager();
    manager.addScene("only", makeProject("Only"));

    manager.setActive("only", { kind: "crossfade", durationMs: 100 });

    expect(manager.lastTransition).toBeNull();
    expect(manager.getScene("only")?.lifecycle.activationCount).toBe(1);
  });
});
