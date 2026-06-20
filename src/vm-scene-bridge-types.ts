import type { AnimationQueue } from "./animation-loop.js";
import type { SceneGraph, SceneGraphNode } from "./scene-graph.js";
import type { Vec3 } from "./story-api/types.js";
import type { ScreenPosition } from "./vm-scene-bridge-mapping.js";

export type SceneNode = SceneGraphNode;
export type { ScreenPosition };

export interface ProjectSceneRegistration {
  readonly sceneGraph: SceneGraph;
  readonly entityNodes: ReadonlyMap<string, SceneGraphNode>;
}

export interface SpeechBubbleOverlay {
  readonly entityId: string;
  readonly kind: "say" | "think";
  readonly text: string;
  readonly element: HTMLElement | null;
  readonly persistent: boolean;
}

export interface VmSceneBridgeOptions {
  readonly animationQueue?: AnimationQueue | null;
  readonly overlayContainer?: HTMLElement | null;
  readonly projectWorldToScreen?: (worldPosition: Vec3, entityId: string, node: SceneGraphNode) => ScreenPosition;
  readonly defaultBubbleDurationMs?: number;
}

export interface VmSceneRuntimeOptions extends VmSceneBridgeOptions {
  readonly sceneGraph?: SceneGraph;
  readonly render?: (simulationTimeMs: number) => void;
}
