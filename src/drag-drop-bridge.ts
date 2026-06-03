/**
 * Domain-specific drag-and-drop abstractions for Alice IDE.
 *
 * Wraps the generic drag-drop-system with typed handlers for
 * the three main Alice drag sources: code blocks, entities, and gallery items.
 * Uses a custom MIME type for payload transfer and validates payloads on drop.
 */
import {
  DragProxy,
  DragSource,
  DropPolicy,
  DropTarget,
  type DragPosition,
} from "./drag-drop-system";

// ---------------------------------------------------------------------------
// Drag Item Types
// ---------------------------------------------------------------------------

export type DragItemType = "code-block" | "entity" | "gallery-item";

export const DRAG_MIME_TYPE = "application/x-alice-drag-item";

// ---------------------------------------------------------------------------
// Typed Payloads
// ---------------------------------------------------------------------------

export interface CodeBlockPayload {
  readonly type: "code-block";
  readonly statementKind: string;
  readonly template: string;
}

export interface EntityPayload {
  readonly type: "entity";
  readonly entityName: string;
  readonly entityType: string;
}

export interface GalleryItemPayload {
  readonly type: "gallery-item";
  readonly modelId: string;
  readonly category: string;
  readonly displayName: string;
}

export type DragPayload = CodeBlockPayload | EntityPayload | GalleryItemPayload;

// ---------------------------------------------------------------------------
// Payload Serialization & Validation
// ---------------------------------------------------------------------------

export class DragDataTransfer {
  /** Serialize a typed payload to a JSON string with MIME key. */
  static serialize(payload: DragPayload): string {
    return JSON.stringify(payload);
  }

  /** Deserialize and validate a drag payload. Returns null if invalid. */
  static deserialize(data: string): DragPayload | null {
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
        return null;
      }
      if (!isValidDragItemType(parsed.type)) {
        return null;
      }
      return DragDataTransfer.validate(parsed);
    } catch {
      return null;
    }
  }

  private static validate(parsed: Record<string, unknown>): DragPayload | null {
    switch (parsed.type) {
      case "code-block":
        if (typeof parsed.statementKind === "string" && typeof parsed.template === "string") {
          return parsed as unknown as CodeBlockPayload;
        }
        return null;
      case "entity":
        if (typeof parsed.entityName === "string" && typeof parsed.entityType === "string") {
          return parsed as unknown as EntityPayload;
        }
        return null;
      case "gallery-item":
        if (typeof parsed.modelId === "string" && typeof parsed.category === "string" && typeof parsed.displayName === "string") {
          return parsed as unknown as GalleryItemPayload;
        }
        return null;
      default:
        return null;
    }
  }
}

function isValidDragItemType(type: string): type is DragItemType {
  return type === "code-block" || type === "entity" || type === "gallery-item";
}

// ---------------------------------------------------------------------------
// Domain-Specific Drag Handlers
// ---------------------------------------------------------------------------

export class CodeBlockDragHandler {
  createSource(id: string, statementKind: string, template: string, label?: string): DragSource<CodeBlockPayload> {
    return new DragSource<CodeBlockPayload>({
      id,
      type: "code-block",
      label: label ?? statementKind,
      payload: { type: "code-block", statementKind, template },
    });
  }
}

export class EntityDragHandler {
  createSource(id: string, entityName: string, entityType: string, label?: string): DragSource<EntityPayload> {
    return new DragSource<EntityPayload>({
      id,
      type: "entity",
      label: label ?? entityName,
      payload: { type: "entity", entityName, entityType },
    });
  }
}

export class GalleryItemDragHandler {
  createSource(
    id: string,
    modelId: string,
    category: string,
    displayName: string,
  ): DragSource<GalleryItemPayload> {
    return new DragSource<GalleryItemPayload>({
      id,
      type: "gallery-item",
      label: displayName,
      payload: { type: "gallery-item", modelId, category, displayName },
    });
  }
}

// ---------------------------------------------------------------------------
// Domain-Specific Drop Handlers
// ---------------------------------------------------------------------------

export interface DropHandlerCallbacks<T extends DragPayload = DragPayload> {
  onDrop: (payload: T, position: DragPosition) => void;
}

export class SceneDropHandler {
  readonly target: DropTarget<DragPayload>;

  constructor(id: string, callbacks: DropHandlerCallbacks) {
    this.target = new DropTarget<DragPayload>({
      id,
      type: "scene-editor",
      accepts: ["entity", "gallery-item"],
      onDrop: (proxy) => callbacks.onDrop(proxy.payload, proxy.position),
    });
  }
}

export class CodeEditorDropHandler {
  readonly target: DropTarget<DragPayload>;

  constructor(id: string, callbacks: DropHandlerCallbacks<CodeBlockPayload>) {
    this.target = new DropTarget<DragPayload>({
      id,
      type: "code-editor",
      accepts: ["code-block"],
      onDrop: (proxy) => {
        if (proxy.payload.type === "code-block") {
          callbacks.onDrop(proxy.payload as CodeBlockPayload, proxy.position);
        }
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Drag-Drop Coordinator
// ---------------------------------------------------------------------------

export class DragDropCoordinator {
  private readonly policy = new DropPolicy();
  private readonly targets = new Map<string, DropTarget<DragPayload>>();
  private activeProxy: DragProxy<DragPayload> | null = null;

  constructor() {
    // Default policy rules for Alice IDE
    this.policy.allow("code-block", "code-editor");
    this.policy.allow("entity", "scene-editor");
    this.policy.allow("gallery-item", "scene-editor");
  }

  /** Register a custom policy rule. */
  allowDrop(sourceType: string, targetType: string): void {
    this.policy.allow(sourceType, targetType);
  }

  /** Register a drop target. */
  registerTarget(target: DropTarget<DragPayload>): void {
    this.targets.set(target.id, target);
  }

  /** Unregister a drop target. */
  unregisterTarget(targetId: string): boolean {
    return this.targets.delete(targetId);
  }

  /** Start a drag from a source at a given position. */
  beginDrag(source: DragSource<DragPayload>, position: DragPosition = { x: 0, y: 0 }): DragProxy<DragPayload> {
    this.activeProxy = source.beginDrag(position);
    return this.activeProxy;
  }

  /** Move the current drag proxy to a new position. */
  moveTo(position: DragPosition): DragProxy<DragPayload> | null {
    if (!this.activeProxy) return null;
    this.activeProxy.moveTo(position);
    return this.activeProxy;
  }

  /** Attempt to drop on a named target. Returns true on success. */
  drop(targetId: string): boolean {
    if (!this.activeProxy) return false;
    const target = this.targets.get(targetId);
    if (!target) return false;
    const result = target.drop(this.activeProxy, this.policy);
    if (result) {
      this.activeProxy = null;
    }
    return result;
  }

  /** Check if the active proxy can be dropped on a target. */
  canDrop(targetId: string): boolean {
    if (!this.activeProxy) return false;
    const target = this.targets.get(targetId);
    if (!target) return false;
    return this.policy.validate(this.activeProxy, target);
  }

  /** Cancel the current drag. */
  cancel(): void {
    this.activeProxy = null;
  }

  /** Get the active drag proxy, if any. */
  get active(): DragProxy<DragPayload> | null {
    return this.activeProxy;
  }
}
