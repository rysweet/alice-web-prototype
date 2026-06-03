import { describe, expect, it } from "vitest";
import {
  CodeBlockDragHandler,
  CodeEditorDropHandler,
  DragDataTransfer,
  DragDropCoordinator,
  EntityDragHandler,
  GalleryItemDragHandler,
  SceneDropHandler,
  type CodeBlockPayload,
  type DragPayload,
  type EntityPayload,
  type GalleryItemPayload,
} from "../src/drag-drop-bridge";

describe("drag-drop-bridge", () => {
  // ---------- DragDataTransfer ----------

  it("serializes and deserializes code-block payloads", () => {
    const payload: CodeBlockPayload = { type: "code-block", statementKind: "say", template: 'this.say("Hello")' };
    const json = DragDataTransfer.serialize(payload);
    const result = DragDataTransfer.deserialize(json);
    expect(result).toEqual(payload);
  });

  it("serializes and deserializes entity payloads", () => {
    const payload: EntityPayload = { type: "entity", entityName: "Rabbit", entityType: "SBiped" };
    const json = DragDataTransfer.serialize(payload);
    const result = DragDataTransfer.deserialize(json);
    expect(result).toEqual(payload);
  });

  it("serializes and deserializes gallery-item payloads", () => {
    const payload: GalleryItemPayload = {
      type: "gallery-item",
      modelId: "bunny-001",
      category: "Animals",
      displayName: "Bunny",
    };
    const json = DragDataTransfer.serialize(payload);
    expect(DragDataTransfer.deserialize(json)).toEqual(payload);
  });

  it("returns null for invalid JSON", () => {
    expect(DragDataTransfer.deserialize("not json")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(DragDataTransfer.deserialize('{"type":"code-block"}')).toBeNull();
    expect(DragDataTransfer.deserialize('{"type":"entity","entityName":"x"}')).toBeNull();
    expect(DragDataTransfer.deserialize('{"type":"gallery-item","modelId":"x"}')).toBeNull();
  });

  it("returns null for unknown drag item types", () => {
    expect(DragDataTransfer.deserialize('{"type":"unknown"}')).toBeNull();
  });

  // ---------- Domain Drag Handlers ----------

  it("creates code block drag sources", () => {
    const handler = new CodeBlockDragHandler();
    const source = handler.createSource("say-block", "say", 'this.say("Hi")', "Say Block");
    const proxy = source.beginDrag({ x: 10, y: 20 });

    expect(proxy.sourceType).toBe("code-block");
    expect(proxy.label).toBe("Say Block");
    expect(proxy.payload.type).toBe("code-block");
    expect(proxy.payload.statementKind).toBe("say");
  });

  it("creates entity drag sources", () => {
    const handler = new EntityDragHandler();
    const source = handler.createSource("rabbit-drag", "Rabbit", "SBiped");
    const proxy = source.beginDrag();

    expect(proxy.sourceType).toBe("entity");
    expect(proxy.payload.entityName).toBe("Rabbit");
    expect(proxy.payload.entityType).toBe("SBiped");
  });

  it("creates gallery item drag sources", () => {
    const handler = new GalleryItemDragHandler();
    const source = handler.createSource("gallery-bunny", "bunny-001", "Animals", "Bunny");
    const proxy = source.beginDrag({ x: 0, y: 0 });

    expect(proxy.sourceType).toBe("gallery-item");
    expect(proxy.payload.modelId).toBe("bunny-001");
    expect(proxy.label).toBe("Bunny");
  });

  // ---------- Drop Handlers ----------

  it("scene drop handler accepts entity and gallery-item drops", () => {
    const dropped: DragPayload[] = [];
    const handler = new SceneDropHandler("scene", { onDrop: (payload) => dropped.push(payload) });

    expect(handler.target.accepts("entity")).toBe(true);
    expect(handler.target.accepts("gallery-item")).toBe(true);
    expect(handler.target.accepts("code-block")).toBe(false);
  });

  it("code editor drop handler accepts code-block drops", () => {
    const dropped: CodeBlockPayload[] = [];
    const handler = new CodeEditorDropHandler("editor", { onDrop: (payload) => dropped.push(payload) });

    expect(handler.target.accepts("code-block")).toBe(true);
    expect(handler.target.accepts("entity")).toBe(false);
  });

  // ---------- DragDropCoordinator ----------

  it("coordinates a full drag-drop cycle from source to target", () => {
    const coordinator = new DragDropCoordinator();
    const dropped: DragPayload[] = [];

    const sceneHandler = new SceneDropHandler("scene-view", {
      onDrop: (payload) => dropped.push(payload),
    });
    coordinator.registerTarget(sceneHandler.target);

    const galleryHandler = new GalleryItemDragHandler();
    const source = galleryHandler.createSource("bunny", "bunny-001", "Animals", "Bunny");

    const proxy = coordinator.beginDrag(source, { x: 0, y: 0 });
    expect(proxy).toBeDefined();
    expect(coordinator.active).toBe(proxy);

    coordinator.moveTo({ x: 50, y: 50 });
    expect(coordinator.active!.position).toEqual({ x: 50, y: 50 });

    expect(coordinator.canDrop("scene-view")).toBe(true);
    expect(coordinator.drop("scene-view")).toBe(true);
    expect(dropped.length).toBe(1);
    expect(dropped[0].type).toBe("gallery-item");
    expect(coordinator.active).toBeNull();
  });

  it("rejects drops that violate the policy", () => {
    const coordinator = new DragDropCoordinator();
    const editorHandler = new CodeEditorDropHandler("code-editor", { onDrop: () => {} });
    coordinator.registerTarget(editorHandler.target);

    const entityHandler = new EntityDragHandler();
    const source = entityHandler.createSource("rabbit", "Rabbit", "SBiped");
    coordinator.beginDrag(source);

    expect(coordinator.canDrop("code-editor")).toBe(false);
    expect(coordinator.drop("code-editor")).toBe(false);
  });

  it("cancels an active drag", () => {
    const coordinator = new DragDropCoordinator();
    const handler = new EntityDragHandler();
    coordinator.beginDrag(handler.createSource("a", "A", "SProp"));

    expect(coordinator.active).not.toBeNull();
    coordinator.cancel();
    expect(coordinator.active).toBeNull();
  });

  it("registers and unregisters drop targets", () => {
    const coordinator = new DragDropCoordinator();
    const target = new SceneDropHandler("t1", { onDrop: () => {} });
    coordinator.registerTarget(target.target);

    const handler = new EntityDragHandler();
    coordinator.beginDrag(handler.createSource("e", "E", "SProp"));
    expect(coordinator.canDrop("t1")).toBe(true);

    coordinator.unregisterTarget("t1");
    expect(coordinator.canDrop("t1")).toBe(false);
  });

  it("supports custom policy rules", () => {
    const coordinator = new DragDropCoordinator();
    coordinator.allowDrop("code-block", "scene-editor");

    const sceneHandler = new SceneDropHandler("scene", { onDrop: () => {} });
    coordinator.registerTarget(sceneHandler.target);

    const codeHandler = new CodeBlockDragHandler();
    coordinator.beginDrag(codeHandler.createSource("say", "say", "template"));

    expect(coordinator.canDrop("scene")).toBe(true);
  });

  it("returns false when no active drag for drop/canDrop/moveTo", () => {
    const coordinator = new DragDropCoordinator();
    expect(coordinator.canDrop("anything")).toBe(false);
    expect(coordinator.drop("anything")).toBe(false);
    expect(coordinator.moveTo({ x: 0, y: 0 })).toBeNull();
  });

  it("returns false when dropping on unknown target", () => {
    const coordinator = new DragDropCoordinator();
    const handler = new EntityDragHandler();
    coordinator.beginDrag(handler.createSource("e", "E", "SProp"));
    expect(coordinator.drop("nonexistent")).toBe(false);
  });
});
