import type * as THREE from "three";

type DisposableResource = {
  dispose: () => void;
};

type ResourceWithUserData = {
  userData?: Record<string, unknown>;
};

type ObjectWithResources = {
  geometry?: unknown;
  material?: unknown;
};

const DISPOSE_WITH_SCENE = "disposeWithScene";

function isDisposableResource(value: unknown): value is DisposableResource {
  return typeof value === "object"
    && value !== null
    && "dispose" in value
    && typeof (value as { dispose?: unknown }).dispose === "function";
}

function materialList(material: unknown): unknown[] {
  return Array.isArray(material) ? material : [material];
}

function shouldDisposeSceneOwnedResource(resource: unknown): resource is DisposableResource {
  if (!isDisposableResource(resource)) {
    return false;
  }
  const userData = (resource as ResourceWithUserData).userData;
  return userData?.[DISPOSE_WITH_SCENE] === true;
}

function disposeOnce(resource: unknown, disposed: Set<DisposableResource>): void {
  if (!isDisposableResource(resource) || disposed.has(resource)) {
    return;
  }
  resource.dispose();
  disposed.add(resource);
}

/** Mark a disposable GPU resource as owned by its scene so scene teardown can dispose it. */
export function markSceneOwnedResource<T extends ResourceWithUserData>(resource: T): T {
  resource.userData = {
    ...resource.userData,
    [DISPOSE_WITH_SCENE]: true,
  };
  return resource;
}

/** Mark a geometry instance as owned by its scene so scene teardown can dispose it. */
export function markSceneOwnedGeometry<T extends ResourceWithUserData>(geometry: T): T {
  return markSceneOwnedResource(geometry);
}

/** Mark a material instance as owned by its scene so scene teardown can dispose it. */
export function markSceneOwnedMaterial<T extends ResourceWithUserData>(material: T): T {
  return markSceneOwnedResource(material);
}

/** Mark one material or a material array as owned by its scene. */
export function markSceneOwnedMaterials(material: unknown): void {
  for (const item of materialList(material)) {
    if (typeof item === "object" && item !== null) {
      markSceneOwnedMaterial(item as ResourceWithUserData);
    }
  }
}

/** Dispose GPU resources owned by a scene before the scene is replaced. */
export function disposeSceneResources(scene: THREE.Object3D | null | undefined): void {
  if (!scene) {
    return;
  }

  const disposedGeometries = new Set<DisposableResource>();
  const disposedMaterials = new Set<DisposableResource>();

  scene.traverse((object) => {
    const resources = object as ObjectWithResources;
    if (shouldDisposeSceneOwnedResource(resources.geometry)) {
      disposeOnce(resources.geometry, disposedGeometries);
    }

    for (const material of materialList(resources.material)) {
      if (shouldDisposeSceneOwnedResource(material)) {
        disposeOnce(material, disposedMaterials);
      }
    }
  });

  scene.clear();
}
