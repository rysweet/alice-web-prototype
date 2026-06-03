/**
 * Scene Graph Abstraction Layer — Visitor pattern, coordinate bridge,
 * and transform utilities for Alice's scene hierarchy.
 *
 * Renderer-agnostic: no Three.js imports. Bridges scene-graph.ts types
 * with scenegraph-math-affine.ts types for coordinate conversion.
 *
 * See issue #87: Scene Graph Abstraction Layer.
 */

import {
  SceneGraphNode,
  GroupNode,
  VisualNode,
  CameraNode,
  LightNode,
  type Transform,
} from "./scene-graph.js";
import type { Vec3 } from "./story-api/types";
import { AffineMatrix4x4 } from "./scenegraph-math-affine.js";

// ── Visitor Interface ──────────────────────────────────────────────

/** Typed visitor for scene graph nodes. */
export interface SceneGraphVisitor<T> {
  visitGroup(node: GroupNode): T;
  visitVisual(node: VisualNode): T;
  visitCamera(node: CameraNode): T;
  visitLight(node: LightNode): T;
  visitUnknown(node: SceneGraphNode): T;
}

// ── Scene Tree Walker ──────────────────────────────────────────────

function dispatchVisit<T>(node: SceneGraphNode, visitor: SceneGraphVisitor<T>): T {
  if (node instanceof GroupNode) return visitor.visitGroup(node);
  if (node instanceof VisualNode) return visitor.visitVisual(node);
  if (node instanceof CameraNode) return visitor.visitCamera(node);
  if (node instanceof LightNode) return visitor.visitLight(node);
  return visitor.visitUnknown(node);
}

/**
 * Walks a scene graph tree in pre-order DFS, dispatching each node
 * to the appropriate visitor method. Returns an array of visitor results.
 */
export function walkSceneGraph<T>(root: SceneGraphNode, visitor: SceneGraphVisitor<T>): T[] {
  const results: T[] = [];

  function walk(node: SceneGraphNode): void {
    results.push(dispatchVisit(node, visitor));
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(root);
  return results;
}

// ── Concrete Visitors ──────────────────────────────────────────────

/** Counts nodes by returning 1 for each visited node. */
export class NodeCounter implements SceneGraphVisitor<number> {
  visitGroup(): number { return 1; }
  visitVisual(): number { return 1; }
  visitCamera(): number { return 1; }
  visitLight(): number { return 1; }
  visitUnknown(): number { return 1; }
}

/** Collects node name + local transform for every node. */
export interface TransformEntry {
  readonly name: string;
  readonly transform: Transform;
}

export class TransformCollector implements SceneGraphVisitor<TransformEntry> {
  private collect(node: SceneGraphNode): TransformEntry {
    return {
      name: node.name,
      transform: node.getTransformation(),
    };
  }

  visitGroup(node: GroupNode): TransformEntry { return this.collect(node); }
  visitVisual(node: VisualNode): TransformEntry { return this.collect(node); }
  visitCamera(node: CameraNode): TransformEntry { return this.collect(node); }
  visitLight(node: LightNode): TransformEntry { return this.collect(node); }
  visitUnknown(node: SceneGraphNode): TransformEntry { return this.collect(node); }
}

// ── Coordinate Bridge: Transform ↔ AffineMatrix4x4 ────────────────

/**
 * Converts a scene-graph Transform (position + quaternion orientation + scale)
 * to an AffineMatrix4x4 (rotation matrix + translation point).
 */
export function transformToAffine(transform: Transform): AffineMatrix4x4 {
  const { position, orientation, scale } = transform;

  return AffineMatrix4x4.compose(
    { x: position.x, y: position.y, z: position.z },
    { x: orientation.x, y: orientation.y, z: orientation.z, w: orientation.w },
    { x: scale.x, y: scale.y, z: scale.z },
  );
}

/**
 * Converts an AffineMatrix4x4 back to a scene-graph Transform.
 * Decomposes the matrix into translation, quaternion rotation, and scale.
 */
export function affineToTransform(affine: AffineMatrix4x4): Transform {
  const { translation, quaternion, scale } = affine.decompose();

  return {
    position: { x: translation.x, y: translation.y, z: translation.z },
    orientation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
    scale: { x: scale.x, y: scale.y, z: scale.z },
  };
}

// ── Forward Direction Bridge ───────────────────────────────────────
// Alice: entity forward = +Z (right-handed, Y-up)
// Three.js: camera forward = -Z (right-handed, Y-up)

/**
 * Converts an Alice forward direction (Z+) to Three.js forward (Z-).
 * Negates only the Z component.
 */
export function aliceForwardToThreeForward(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z === 0 ? 0 : -v.z };
}

/**
 * Converts a Three.js forward direction (Z-) to Alice forward (Z+).
 * Negates only the Z component.
 */
export function threeForwardToAliceForward(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z === 0 ? 0 : -v.z };
}
