import type { AliceProject } from "./a3p-parser.js";
import { SceneGraph } from "./scene-graph.js";
import { createProjectSceneNodes } from "./vm-scene-bridge-entities.js";
import type { ProjectSceneRegistration } from "./vm-scene-bridge-types.js";

export function createSceneGraphForProject(project: AliceProject, sceneGraph: SceneGraph = new SceneGraph()): ProjectSceneRegistration {
  const entityNodes = createProjectSceneNodes(project);
  for (const node of entityNodes.values()) {
    sceneGraph.root.addChild(node);
  }
  return { sceneGraph, entityNodes };
}
