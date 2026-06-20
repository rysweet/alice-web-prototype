import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  disposeSceneResources,
  markSceneOwnedGeometry,
  markSceneOwnedMaterial,
  markSceneOwnedMaterials,
} from "../src/scene-disposal";
import { buildScene } from "../src/scene-builder";
import type { AliceObject, AliceProject } from "../src/a3p-parser";

type FakeDisposable = {
  dispose: ReturnType<typeof vi.fn>;
  userData?: Record<string, unknown>;
};

function disposable(): FakeDisposable {
  return {
    dispose: vi.fn(),
    userData: {},
  };
}

function objectWithResources(geometry?: unknown, material?: unknown): THREE.Object3D {
  const object = new THREE.Object3D() as THREE.Object3D & {
    geometry?: unknown;
    material?: unknown;
  };
  object.geometry = geometry;
  object.material = material;
  return object;
}

function aliceObject(overrides: Partial<AliceObject> & { name: string; typeName: string }): AliceObject {
  return {
    resourceType: null,
    position: null,
    orientation: null,
    size: null,
    ...overrides,
  };
}

function projectWithObjects(sceneObjects: AliceObject[]): AliceProject {
  return {
    version: "3.6",
    projectName: "DisposalTest",
    sceneObjects,
    methods: [],
  };
}

describe("disposeSceneResources", () => {
  it("disposes each scene-owned geometry once and clears the old scene graph", () => {
    const scene = new THREE.Scene();
    const sharedGeometry = markSceneOwnedGeometry(disposable());
    scene.add(objectWithResources(sharedGeometry));
    scene.add(objectWithResources(sharedGeometry));

    disposeSceneResources(scene);

    expect(sharedGeometry.dispose).toHaveBeenCalledTimes(1);
    expect(scene.children).toHaveLength(0);
  });

  it("does not dispose unmarked shared geometries", () => {
    const scene = new THREE.Scene();
    const cachedGeometry = disposable();
    scene.add(objectWithResources(cachedGeometry));

    disposeSceneResources(scene);

    expect(cachedGeometry.dispose).not.toHaveBeenCalled();
  });

  it("disposes only materials explicitly marked as scene-owned", () => {
    const scene = new THREE.Scene();
    const sharedMaterial = disposable();
    const ownedMaterial = markSceneOwnedMaterial(disposable());
    scene.add(objectWithResources(undefined, sharedMaterial));
    scene.add(objectWithResources(undefined, ownedMaterial));

    disposeSceneResources(scene);

    expect(sharedMaterial.dispose).not.toHaveBeenCalled();
    expect(ownedMaterial.dispose).toHaveBeenCalledTimes(1);
  });

  it("handles owned material arrays without double-disposing shared entries", () => {
    const scene = new THREE.Scene();
    const sharedOwnedMaterial = disposable();
    const otherOwnedMaterial = disposable();
    markSceneOwnedMaterials([sharedOwnedMaterial, otherOwnedMaterial]);
    scene.add(objectWithResources(undefined, [sharedOwnedMaterial, otherOwnedMaterial]));
    scene.add(objectWithResources(undefined, [sharedOwnedMaterial]));

    disposeSceneResources(scene);

    expect(sharedOwnedMaterial.dispose).toHaveBeenCalledTimes(1);
    expect(otherOwnedMaterial.dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes scene-builder owned geometries without disposing cached ground geometry", () => {
    const { scene } = buildScene(projectWithObjects([
      aliceObject({ name: "ground", typeName: "org.lgna.story.SGround" }),
      aliceObject({
        name: "prop",
        typeName: "org.lgna.story.SProp",
        size: { width: 2, height: 1, depth: 1 },
      }),
    ]));
    const ground = scene.getObjectByName("ground") as THREE.Mesh;
    const prop = scene.getObjectByName("prop") as THREE.Mesh;
    const groundDispose = vi.spyOn(ground.geometry, "dispose");
    const propDispose = vi.spyOn(prop.geometry, "dispose");

    disposeSceneResources(scene);

    expect(groundDispose).not.toHaveBeenCalled();
    expect(propDispose).toHaveBeenCalledTimes(1);
  });
});
