export * from "./expanded-entities";

import { SJointedModel, SModel, SThing } from "./expanded-entities";
import type { BoundingBox, JointId, JointNode, Orientation, Position, Size } from "./expanded-types";
import { cloneBoundingBox, flattenJointHierarchy, isBoundingBox } from "./expanded-types";
import { describeSpeechBubble } from "./types";

export interface EntityTransformSnapshot {
  readonly name: string | null;
  readonly typeName: string;
  readonly position: Position | null;
  readonly orientation: Orientation | null;
  readonly size: Size | null;
}

export interface EntityDiagnostics {
  readonly name: string | null;
  readonly typeName: string;
  readonly hasBoundingBox: boolean;
  readonly isShowing: boolean;
  readonly supportsJoints: boolean;
  readonly jointCount: number;
  readonly speechBubbleSummary: string | null;
}

export function getEntityBoundingBox(entity: SThing): BoundingBox | null {
  return entity.imp.getBoundingBox();
}

export function cloneEntityBoundingBox(entity: SThing): BoundingBox | null {
  const box = getEntityBoundingBox(entity);
  return box ? cloneBoundingBox(box) : null;
}

export function hasEntityBoundingBox(entity: SThing): boolean {
  return isBoundingBox(entity.imp.getBoundingBox());
}

export function listJointNames(entity: SJointedModel): string[] {
  return flattenJointHierarchy(entity.getJointHierarchy()).map((node) => node.name);
}

export function listJointNodes(entity: SJointedModel): JointNode[] {
  return flattenJointHierarchy(entity.getJointHierarchy());
}

export function getJointCount(entity: SJointedModel): number {
  return listJointNodes(entity).length;
}

export function hasJoint(entity: SJointedModel, joint: string | JointId): boolean {
  return entity.getJointId(joint) !== undefined;
}

export function findJointNode(entity: SJointedModel, joint: string | JointId): JointNode | null {
  const jointName = typeof joint === "string" ? joint : joint.name;
  return listJointNodes(entity).find((node) => node.name === jointName) ?? null;
}

export function getJointPath(entity: SJointedModel, joint: string | JointId): string[] {
  const jointName = typeof joint === "string" ? joint : joint.name;
  const nodes = listJointNodes(entity);
  const byName = new Map<string, JointNode>();
  let target: JointNode | null = null;
  for (const node of nodes) {
    byName.set(node.name, node);
    if (target === null && node.name === jointName) {
      target = node;
    }
  }

  if (!target) {
    return [];
  }

  const path: string[] = [target.name];
  let currentParent = target.parentName;
  while (currentParent) {
    path.unshift(currentParent);
    currentParent = byName.get(currentParent)?.parentName ?? null;
  }
  return path;
}

export function listLeafJointNames(entity: SJointedModel): string[] {
  return listJointNodes(entity)
    .filter((node) => node.children.length === 0)
    .map((node) => node.name);
}

export function listJointNamesMatching(entity: SJointedModel, pattern: RegExp | string): string[] {
  const matcher = typeof pattern === "string"
    ? (name: string) => name.includes(pattern)
    : (name: string) => pattern.test(name);
  return listJointNames(entity).filter(matcher);
}

export function getSpeechBubbleSummary(entity: SModel): string | null {
  return describeSpeechBubble(entity.speechBubbleEntity ?? entity.speechBubble);
}

export function describeEntity(entity: SThing): string {
  const name = entity.name ?? `unnamed ${entity.constructor.name}`;
  const box = getEntityBoundingBox(entity);
  const boxText = box
    ? `${box.max.x - box.min.x}×${box.max.y - box.min.y}×${box.max.z - box.min.z}`
    : "no-bounds";
  return `${name} (${entity.constructor.name}, ${boxText})`;
}

export function captureEntityTransform(entity: SThing): EntityTransformSnapshot {
  const position = "position" in entity ? (entity as SThing & { position: Position }).position : null;
  const orientation = "orientation" in entity ? (entity as SThing & { orientation: Orientation }).orientation : null;
  const size = "size" in entity ? (entity as SThing & { size: Size }).size : null;
  return {
    name: entity.name,
    typeName: entity.constructor.name,
    position,
    orientation,
    size,
  };
}

export function collectEntityDiagnostics(entity: SThing): EntityDiagnostics {
  const supportsJoints = entity instanceof SJointedModel;
  return {
    name: entity.name,
    typeName: entity.constructor.name,
    hasBoundingBox: hasEntityBoundingBox(entity),
    isShowing: entity.isShowing,
    supportsJoints,
    jointCount: supportsJoints ? getJointCount(entity) : 0,
    speechBubbleSummary: entity instanceof SModel ? getSpeechBubbleSummary(entity) : null,
  };
}

export function renameEntity<T extends SThing>(entity: T, name: string): T {
  entity.setName(name);
  return entity;
}

export function requireEntityName(entity: SThing): string {
  const name = entity.getName();
  if (!name) {
    throw new TypeError(`entity ${entity.constructor.name} does not have a name`);
  }
  return name;
}

export function ensureJointedModel(entity: SThing): SJointedModel {
  if (!(entity instanceof SJointedModel)) {
    throw new TypeError(`${entity.constructor.name} does not support joints`);
  }
  return entity;
}

export function getSharedJointNames(
  left: SJointedModel,
  right: SJointedModel,
): string[] {
  const rightNames = new Set(listJointNames(right));
  return listJointNames(left).filter((name) => rightNames.has(name));
}

export function getJointHierarchySummary(entity: SJointedModel): Array<{
  readonly name: string;
  readonly parentName: string | null;
  readonly depth: number;
}> {
  const summary: Array<{ name: string; parentName: string | null; depth: number }> = [];
  const visit = (nodes: readonly JointNode[], depth: number): void => {
    for (const node of nodes) {
      summary.push({ name: node.name, parentName: node.parentName, depth });
      visit(node.children, depth + 1);
    }
  };
  visit(entity.getJointHierarchy(), 0);
  return summary;
}

export function describeJointedModel(entity: SJointedModel): string {
  const diagnostics = collectEntityDiagnostics(entity);
  const root = entity.getJointHierarchy()[0]?.name ?? "<none>";
  return `${diagnostics.typeName}[name=${diagnostics.name ?? "unnamed"}, joints=${diagnostics.jointCount}, root=${root}]`;
}
