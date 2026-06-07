import type { AliceObject, AliceProject } from "./a3p-parser.js";
import {
  CameraNode,
  GroupNode,
  LightNode,
  SceneGraph,
  type SceneGraphNode,
  type Transform,
  VisualNode,
} from "./scene-graph.js";
import { IDENTITY_ORIENTATION, UNIT_SCALE } from "./vm-scene-bridge-transforms.js";

export interface ProjectSceneRegistration {
  readonly sceneGraph: SceneGraph;
  readonly entityNodes: ReadonlyMap<string, SceneGraphNode>;
}

export function chooseNodeForObject(object: AliceObject): SceneGraphNode {
  if (/camera/i.test(object.typeName)) {
    return new CameraNode(object.name);
  }
  if (/sun|light/i.test(object.typeName)) {
    return new LightNode(object.name, "directional");
  }
  if (/scene/i.test(object.typeName)) {
    return new GroupNode(object.name);
  }
  const node = new VisualNode(object.name);
  node.meshRef = object.resourceType;
  return node;
}

export function transformFromObject(object: AliceObject): Transform {
  return {
    position: object.position ? { ...object.position } : { x: 0, y: 0, z: 0 },
    orientation: object.orientation ? { ...object.orientation } : { ...IDENTITY_ORIENTATION },
    scale: object.size
      ? { x: object.size.width, y: object.size.height, z: object.size.depth }
      : { ...UNIT_SCALE },
  };
}

export function targetEntityIdOf(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "name" in value) {
    const named = value as { name?: unknown };
    return typeof named.name === "string" ? named.name : null;
  }
  return null;
}

export function createProjectSceneRegistration(
  project: AliceProject,
  sceneGraph: SceneGraph = new SceneGraph(),
): ProjectSceneRegistration {
  const entityNodes = new Map<string, SceneGraphNode>();
  for (const object of project.sceneObjects) {
    const node = chooseNodeForObject(object);
    node.localTransform = transformFromObject(object);
    sceneGraph.root.addChild(node);
    entityNodes.set(object.name, node);
  }
  return { sceneGraph, entityNodes };
}
