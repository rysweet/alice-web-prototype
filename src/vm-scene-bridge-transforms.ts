import {
  type SceneGraphNode,
  type Transform,
  quaternionMultiply,
  rotateVec3ByQuaternion,
} from "./scene-graph.js";
import {
  addVec3,
  normalizeQuaternion,
  quaternionConjugate,
  quaternionMultiply as multiplyOrientation,
  subtractVec3,
} from "./story-api/expanded-math.js";
import type { Orientation, Vec3 } from "./story-api/types.js";

export const IDENTITY_ORIENTATION: Orientation = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
export const UNIT_SCALE: Vec3 = Object.freeze({ x: 1, y: 1, z: 1 });

export function identityTransform(): Transform {
  return {
    position: { x: 0, y: 0, z: 0 },
    orientation: { ...IDENTITY_ORIENTATION },
    scale: { ...UNIT_SCALE },
  };
}

export function cloneTransform(value: Transform): Transform {
  return {
    position: { ...value.position },
    orientation: { ...value.orientation },
    scale: { ...value.scale },
  };
}

function multiplyVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x * right.x,
    y: left.y * right.y,
    z: left.z * right.z,
  };
}

function divideVec3(left: Vec3, right: Vec3): Vec3 {
  return {
    x: right.x === 0 ? 0 : left.x / right.x,
    y: right.y === 0 ? 0 : left.y / right.y,
    z: right.z === 0 ? 0 : left.z / right.z,
  };
}

function invertOrientation(orientation: Orientation): Orientation {
  return normalizeQuaternion(quaternionConjugate(orientation));
}

export function combineTransforms(parent: Transform, child: Transform): Transform {
  const scaled = multiplyVec3(parent.scale, child.position);
  const rotated = rotateVec3ByQuaternion(scaled, parent.orientation);
  return {
    position: addVec3(parent.position, rotated),
    orientation: normalizeQuaternion(quaternionMultiply(parent.orientation, child.orientation)),
    scale: multiplyVec3(parent.scale, child.scale),
  };
}

export function worldToLocalTransform(parentWorld: Transform, world: Transform): Transform {
  const inverseParentOrientation = invertOrientation(parentWorld.orientation);
  const offset = subtractVec3(world.position, parentWorld.position);
  const unrotated = rotateVec3ByQuaternion(offset, inverseParentOrientation);
  return {
    position: divideVec3(unrotated, parentWorld.scale),
    orientation: normalizeQuaternion(multiplyOrientation(inverseParentOrientation, world.orientation)),
    scale: divideVec3(world.scale, parentWorld.scale),
  };
}

export function projectedWorldForNode(
  node: SceneGraphNode | null,
  localForNode: (node: SceneGraphNode) => Transform | null | undefined,
): Transform {
  if (!node) {
    return identityTransform();
  }
  const chain: SceneGraphNode[] = [];
  let current: SceneGraphNode | null = node;
  while (current) {
    chain.push(current);
    current = current.parent;
  }

  let world = identityTransform();
  for (let index = chain.length - 1; index >= 0; index--) {
    const currentNode = chain[index]!;
    world = combineTransforms(world, localForNode(currentNode) ?? currentNode.localTransform);
  }
  return world;
}
