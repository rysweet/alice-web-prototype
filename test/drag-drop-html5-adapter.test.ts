/**
 * Tests for HTML5 drag-and-drop adapter from issue #88's "What Would Add Value" section.
 *
 * Covers: DataTransferHelper, HTML5DragSourceAdapter, HTML5DropZoneAdapter,
 * HTML5DragDropCoordinator, payload validation, lifecycle, and error handling.
 */
import { describe, expect, it, vi } from "vitest";
import {
  DataTransferHelper,
  HTML5DragSourceAdapter,
  HTML5DropZoneAdapter,
  HTML5DragDropCoordinator,
  type DataTransferLike,
  type DragEventLike,
} from "../src/drag-drop-html5-adapter";
import { DRAG_MIME_TYPE, type DragPayload } from "../src/drag-drop-bridge";

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function createFakeDataTransfer(data: Record<string, string> = {}): DataTransferLike {
  const store = new Map<string, string>(Object.entries(data));
  return {
    get types() { return [...store.keys()]; },
    effectAllowed: "uninitialized",
    dropEffect: "none",
    setData(type: string, val: string) { store.set(type, val); },
    getData(type: string) { return store.get(type) ?? ""; },
    clearData(type?: string) { type ? store.delete(type) : store.clear(); },
  };
}

function createFakeDragEvent(
  type: string,
  dt?: DataTransferLike,
  x = 100,
  y = 200,
): DragEventLike & { prevented: boolean; stopped: boolean } {
  return {
    type,
    clientX: x,
    clientY: y,
    dataTransfer: dt ?? null,
    prevented: false,
    stopped: false,
    preventDefault() { (this as any).prevented = true; },
    stopPropagation() { (this as any).stopped = true; },
  };
}

const ENTITY_PAYLOAD: DragPayload = {
  type: "entity",
  entityName: "Cat",
  entityType: "SModel",
};

const CODE_PAYLOAD: DragPayload = {
  type: "code-block",
  statementKind: "doInOrder",
  template: "doInOrder { }",
};

// ---------------------------------------------------------------------------
// DataTransferHelper
// ---------------------------------------------------------------------------

describe("DataTransferHelper", () => {
  it("writes and reads a payload roundtrip", () => {
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, ENTITY_PAYLOAD);
    expect(dt.effectAllowed).toBe("copyMove");
    const result = DataTransferHelper.readPayload(dt);
    expect(result).toEqual(ENTITY_PAYLOAD);
  });

  it("returns null for missing MIME type", () => {
    const dt = createFakeDataTransfer();
    expect(DataTransferHelper.readPayload(dt)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    const dt = createFakeDataTransfer({ [DRAG_MIME_TYPE]: "not json" });
    expect(DataTransferHelper.readPayload(dt)).toBeNull();
  });

  it("returns null for unknown payload type", () => {
    const dt = createFakeDataTransfer({
      [DRAG_MIME_TYPE]: JSON.stringify({ type: "unknown" }),
    });
    expect(DataTransferHelper.readPayload(dt)).toBeNull();
  });

  it("returns null for malformed payload", () => {
    const dt = createFakeDataTransfer({
      [DRAG_MIME_TYPE]: JSON.stringify({ type: "entity" }), // missing entityName
    });
    expect(DataTransferHelper.readPayload(dt)).toBeNull();
  });

  it("detects Alice data", () => {
    const dt = createFakeDataTransfer({ [DRAG_MIME_TYPE]: "{}" });
    expect(DataTransferHelper.hasAliceData(dt)).toBe(true);
  });

  it("detects absence of Alice data", () => {
    const dt = createFakeDataTransfer();
    expect(DataTransferHelper.hasAliceData(dt)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HTML5DragSourceAdapter
// ---------------------------------------------------------------------------

describe("HTML5DragSourceAdapter", () => {
  it("handles dragstart and writes payload", () => {
    const source = new HTML5DragSourceAdapter({
      elementId: "entity-cat",
      payload: ENTITY_PAYLOAD,
    });
    const dt = createFakeDataTransfer();
    const event = createFakeDragEvent("dragstart", dt);
    expect(source.handleDragStart(event)).toBe(true);
    expect(DataTransferHelper.readPayload(dt)).toEqual(ENTITY_PAYLOAD);
  });

  it("returns false when no dataTransfer", () => {
    const source = new HTML5DragSourceAdapter({
      elementId: "entity-cat",
      payload: ENTITY_PAYLOAD,
    });
    const event = createFakeDragEvent("dragstart");
    expect(source.handleDragStart(event)).toBe(false);
  });

  it("creates a DragProxy", () => {
    const source = new HTML5DragSourceAdapter({
      elementId: "entity-cat",
      payload: ENTITY_PAYLOAD,
      label: "Cat entity",
    });
    const proxy = source.createProxy({ x: 10, y: 20 });
    expect(proxy.sourceId).toBe("entity-cat");
    expect(proxy.label).toBe("Cat entity");
    expect(proxy.position).toEqual({ x: 10, y: 20 });
  });
});

// ---------------------------------------------------------------------------
// HTML5DropZoneAdapter
// ---------------------------------------------------------------------------

describe("HTML5DropZoneAdapter", () => {
  it("accepts valid dragover and calls preventDefault", () => {
    const onDrop = vi.fn();
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity"], { onDrop });
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, ENTITY_PAYLOAD);
    const event = createFakeDragEvent("dragover", dt, 50, 60);
    expect(zone.handleDragOver(event)).toBe(true);
    expect(event.prevented).toBe(true);
    expect(dt.dropEffect).toBe("move");
  });

  it("rejects dragover with wrong type", () => {
    const onDrop = vi.fn();
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity"], { onDrop });
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, CODE_PAYLOAD);
    const event = createFakeDragEvent("dragover", dt);
    expect(zone.handleDragOver(event)).toBe(false);
    expect(event.prevented).toBe(false);
  });

  it("handles drop and invokes callback", () => {
    const onDrop = vi.fn();
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity"], { onDrop });
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, ENTITY_PAYLOAD);
    const event = createFakeDragEvent("drop", dt, 100, 200);
    expect(zone.handleDrop(event)).toBe(true);
    expect(event.prevented).toBe(true);
    expect(event.stopped).toBe(true);
    expect(onDrop).toHaveBeenCalledWith(ENTITY_PAYLOAD, { x: 100, y: 200 });
  });

  it("rejects drop with invalid payload", () => {
    const onDrop = vi.fn();
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity"], { onDrop });
    const dt = createFakeDataTransfer();
    const event = createFakeDragEvent("drop", dt);
    expect(zone.handleDrop(event)).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("tracks drop history", () => {
    const onDrop = vi.fn();
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity", "gallery-item"], { onDrop });
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, ENTITY_PAYLOAD);
    zone.handleDrop(createFakeDragEvent("drop", dt));
    expect(zone.dropHistory.length).toBe(1);
    expect(zone.dropHistory[0].payload).toEqual(ENTITY_PAYLOAD);
  });

  it("calls dragenter and dragleave callbacks", () => {
    const onDragEnter = vi.fn();
    const onDragLeave = vi.fn();
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity"], {
      onDrop: vi.fn(),
      onDragEnter,
      onDragLeave,
    });
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, ENTITY_PAYLOAD);
    zone.handleDragEnter(createFakeDragEvent("dragenter", dt));
    expect(onDragEnter).toHaveBeenCalled();
    zone.handleDragLeave();
    expect(onDragLeave).toHaveBeenCalled();
  });

  it("checks accepted types", () => {
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity", "gallery-item"], { onDrop: vi.fn() });
    expect(zone.accepts("entity")).toBe(true);
    expect(zone.accepts("gallery-item")).toBe(true);
    expect(zone.accepts("code-block")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HTML5DragDropCoordinator
// ---------------------------------------------------------------------------

describe("HTML5DragDropCoordinator", () => {
  it("coordinates a full drag-drop lifecycle", () => {
    const coordinator = new HTML5DragDropCoordinator();
    const dropped: DragPayload[] = [];
    const zone = new HTML5DropZoneAdapter("scene", "scene-editor", ["entity"], {
      onDrop: (payload) => dropped.push(payload),
    });
    coordinator.registerZone(zone);

    const source = new HTML5DragSourceAdapter({ elementId: "ent-1", payload: ENTITY_PAYLOAD });
    const dt = createFakeDataTransfer();
    const startEvent = createFakeDragEvent("dragstart", dt);
    expect(coordinator.beginDrag(source, startEvent)).toBe(true);
    expect(coordinator.isDragging).toBe(true);

    const overEvent = createFakeDragEvent("dragover", dt);
    expect(coordinator.dragOver("scene", overEvent)).toBe(true);

    const dropEvent = createFakeDragEvent("drop", dt);
    expect(coordinator.drop("scene", dropEvent)).toBe(true);
    expect(coordinator.isDragging).toBe(false);
    expect(dropped).toEqual([ENTITY_PAYLOAD]);
  });

  it("rejects drop on unregistered zone", () => {
    const coordinator = new HTML5DragDropCoordinator();
    const dt = createFakeDataTransfer();
    DataTransferHelper.writePayload(dt, ENTITY_PAYLOAD);
    expect(coordinator.drop("nonexistent", createFakeDragEvent("drop", dt))).toBe(false);
  });

  it("unregisters zones", () => {
    const coordinator = new HTML5DragDropCoordinator();
    const zone = new HTML5DropZoneAdapter("z1", "type", ["entity"], { onDrop: vi.fn() });
    coordinator.registerZone(zone);
    expect(coordinator.unregisterZone("z1")).toBe(true);
    expect(coordinator.getZone("z1")).toBeUndefined();
  });

  it("endDrag clears active state", () => {
    const coordinator = new HTML5DragDropCoordinator();
    const source = new HTML5DragSourceAdapter({ elementId: "e1", payload: ENTITY_PAYLOAD });
    const dt = createFakeDataTransfer();
    coordinator.beginDrag(source, createFakeDragEvent("dragstart", dt));
    coordinator.endDrag();
    expect(coordinator.isDragging).toBe(false);
    expect(coordinator.currentPayload).toBeNull();
  });
});
