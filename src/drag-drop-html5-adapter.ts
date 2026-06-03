/**
 * HTML5 Drag-and-Drop adapter bridging native browser DragEvent to
 * the Alice drag-drop-system abstractions.
 *
 * Handles MIME type management, payload validation, effectAllowed/dropEffect,
 * and the full drag lifecycle (dragstart → dragover → drop → dragend).
 * External/unknown data is safely ignored.
 */
import type { DragPosition } from "./drag-drop-system";
import { DragProxy, DragSource, DropPolicy } from "./drag-drop-system";
import type { DragPayload, DragItemType } from "./drag-drop-bridge";
import { DragDataTransfer, DRAG_MIME_TYPE } from "./drag-drop-bridge";

// ---------------------------------------------------------------------------
// Native Event Interfaces (minimal, for testability without DOM)
// ---------------------------------------------------------------------------

export interface DataTransferLike {
  readonly types: readonly string[];
  effectAllowed: string;
  dropEffect: string;
  setData(type: string, data: string): void;
  getData(type: string): string;
  clearData(type?: string): void;
}

export interface DragEventLike {
  readonly type: string;
  readonly clientX: number;
  readonly clientY: number;
  readonly dataTransfer: DataTransferLike | null;
  preventDefault(): void;
  stopPropagation(): void;
}

// ---------------------------------------------------------------------------
// DataTransfer Helper
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_SIZE = 65536;

export class DataTransferHelper {
  /** Write an Alice DragPayload to a DataTransfer. */
  static writePayload(dt: DataTransferLike, payload: DragPayload): void {
    const json = DragDataTransfer.serialize(payload);
    if (json.length > MAX_PAYLOAD_SIZE) {
      throw new Error(`Payload exceeds max size (${json.length} > ${MAX_PAYLOAD_SIZE})`);
    }
    dt.setData(DRAG_MIME_TYPE, json);
    dt.effectAllowed = "copyMove";
  }

  /** Read and validate an Alice DragPayload from a DataTransfer. Returns null for external/invalid data. */
  static readPayload(dt: DataTransferLike): DragPayload | null {
    if (!dt.types.includes(DRAG_MIME_TYPE)) {
      return null;
    }
    const json = dt.getData(DRAG_MIME_TYPE);
    if (!json || json.length > MAX_PAYLOAD_SIZE) {
      return null;
    }
    return DragDataTransfer.deserialize(json);
  }

  /** Check if the DataTransfer contains Alice drag data. */
  static hasAliceData(dt: DataTransferLike): boolean {
    return dt.types.includes(DRAG_MIME_TYPE);
  }
}

// ---------------------------------------------------------------------------
// HTML5 Drag Source Adapter
// ---------------------------------------------------------------------------

export interface HTML5DragSourceOptions {
  readonly elementId: string;
  readonly payload: DragPayload;
  readonly label?: string;
}

export class HTML5DragSourceAdapter {
  readonly elementId: string;
  readonly payload: DragPayload;
  readonly label: string;

  constructor(options: HTML5DragSourceOptions) {
    this.elementId = options.elementId;
    this.payload = options.payload;
    this.label = options.label ?? options.payload.type;
  }

  /** Handle the native dragstart event — writes payload to DataTransfer. */
  handleDragStart(event: DragEventLike): boolean {
    if (!event.dataTransfer) return false;
    try {
      DataTransferHelper.writePayload(event.dataTransfer, this.payload);
      return true;
    } catch (error) {
      console.warn("Failed to write drag payload to DataTransfer:", error);
      return false;
    }
  }

  /** Create an internal DragProxy for the Alice drag-drop system. */
  createProxy(position?: DragPosition): DragProxy<DragPayload> {
    const source = new DragSource<DragPayload>({
      id: this.elementId,
      type: this.payload.type,
      label: this.label,
      payload: this.payload,
    });
    return source.beginDrag(position ?? { x: 0, y: 0 });
  }
}

// ---------------------------------------------------------------------------
// HTML5 Drop Zone Adapter
// ---------------------------------------------------------------------------

export interface DropZoneCallbacks {
  onDragEnter?(payload: DragPayload, position: DragPosition): void;
  onDragOver?(payload: DragPayload, position: DragPosition): void;
  onDragLeave?(): void;
  onDrop(payload: DragPayload, position: DragPosition): void;
}

export class HTML5DropZoneAdapter {
  readonly elementId: string;
  readonly targetType: string;
  readonly acceptedTypes: ReadonlySet<DragItemType>;
  private readonly callbacks: DropZoneCallbacks;
  readonly dropHistory: Array<{ payload: DragPayload; position: DragPosition }> = [];

  constructor(
    elementId: string,
    targetType: string,
    acceptedTypes: readonly DragItemType[],
    callbacks: DropZoneCallbacks,
  ) {
    this.elementId = elementId;
    this.targetType = targetType;
    this.acceptedTypes = new Set(acceptedTypes);
    this.callbacks = callbacks;
  }

  /** Handle native dragover — validates and accepts/rejects the drop. */
  handleDragOver(event: DragEventLike): boolean {
    if (!event.dataTransfer) return false;
    const payload = DataTransferHelper.readPayload(event.dataTransfer);
    if (!payload || !this.acceptedTypes.has(payload.type)) {
      return false;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const position = { x: event.clientX, y: event.clientY };
    this.callbacks.onDragOver?.(payload, position);
    return true;
  }

  /** Handle native dragenter. */
  handleDragEnter(event: DragEventLike): boolean {
    if (!event.dataTransfer) return false;
    const payload = DataTransferHelper.readPayload(event.dataTransfer);
    if (!payload || !this.acceptedTypes.has(payload.type)) return false;
    event.preventDefault();
    const position = { x: event.clientX, y: event.clientY };
    this.callbacks.onDragEnter?.(payload, position);
    return true;
  }

  /** Handle native dragleave. */
  handleDragLeave(): void {
    this.callbacks.onDragLeave?.();
  }

  /** Handle native drop — validates payload and invokes callback. */
  handleDrop(event: DragEventLike): boolean {
    if (!event.dataTransfer) return false;
    const payload = DataTransferHelper.readPayload(event.dataTransfer);
    if (!payload || !this.acceptedTypes.has(payload.type)) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    const position = { x: event.clientX, y: event.clientY };
    this.dropHistory.push({ payload, position });
    this.callbacks.onDrop(payload, position);
    return true;
  }

  /** Check if this zone would accept a given payload type. */
  accepts(type: DragItemType): boolean {
    return this.acceptedTypes.has(type);
  }
}

// ---------------------------------------------------------------------------
// HTML5 DnD Coordinator
// ---------------------------------------------------------------------------

export class HTML5DragDropCoordinator {
  private readonly zones = new Map<string, HTML5DropZoneAdapter>();
  private readonly policy = new DropPolicy();
  private activeDragPayload: DragPayload | null = null;

  registerZone(zone: HTML5DropZoneAdapter): void {
    this.zones.set(zone.elementId, zone);
    for (const type of zone.acceptedTypes) {
      this.policy.allow(type, zone.targetType);
    }
  }

  unregisterZone(elementId: string): boolean {
    return this.zones.delete(elementId);
  }

  /** Start tracking a drag from a source adapter. */
  beginDrag(source: HTML5DragSourceAdapter, event: DragEventLike): boolean {
    const started = source.handleDragStart(event);
    if (started) {
      this.activeDragPayload = source.payload;
    }
    return started;
  }

  /** Dispatch a dragover event to the zone under the cursor. */
  dragOver(zoneId: string, event: DragEventLike): boolean {
    const zone = this.zones.get(zoneId);
    return zone ? zone.handleDragOver(event) : false;
  }

  /** Dispatch a drop event to the target zone. */
  drop(zoneId: string, event: DragEventLike): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    const result = zone.handleDrop(event);
    if (result) {
      this.activeDragPayload = null;
    }
    return result;
  }

  /** End the current drag session. */
  endDrag(): void {
    this.activeDragPayload = null;
  }

  get isDragging(): boolean {
    return this.activeDragPayload !== null;
  }

  get currentPayload(): DragPayload | null {
    return this.activeDragPayload;
  }

  getZone(elementId: string): HTML5DropZoneAdapter | undefined {
    return this.zones.get(elementId);
  }
}
