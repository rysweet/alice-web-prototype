// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ProcedureBlockView } from "../src/block-editor/procedure-block-view.js";
import { createDataTransferStore, primeDataTransfer } from "../src/block-editor/block-drag-handler.js";
import { CommentStatement, type Statement } from "../src/ast-nodes.js";
import { ClassDeclaration, MethodDeclaration } from "../src/class-system.js";
import type { DragEventLike } from "../src/drag-drop-html5-adapter.js";

function dispatchDragEvent(target: HTMLElement, type: string, store = createDataTransferStore()): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: store },
    clientX: { value: 0 },
    clientY: { value: 0 },
  });
  target.dispatchEvent(event as DragEventLike & Event);
}

describe("block-editor integration", () => {
  it("renders a procedure and inserts a toolbox block through drag and drop", () => {
    document.body.innerHTML = "";
    const procedure = new MethodDeclaration("run", { type: "VoidTypeRef" }, [], []);
    const type = new ClassDeclaration("Actor", "Object", [], [procedure], []);
    const view = new ProcedureBlockView(procedure, type);
    view.mount(document.body);

    const store = createDataTransferStore();
    const toolboxItem = view.element.querySelector<HTMLElement>("[data-drag-source='toolbox'][data-statement-kind='comment']")!;
    const dropZone = view.element.querySelector<HTMLElement>(`[data-owner-id='${procedure.id}'][data-insert-index='0']`)!;

    dispatchDragEvent(toolboxItem, "dragstart", store);
    dispatchDragEvent(dropZone, "dragover", store);
    dispatchDragEvent(dropZone, "drop", store);

    expect(procedure.body[0]).toBeInstanceOf(CommentStatement);
    expect(view.element.querySelectorAll(".alice-block").length).toBeGreaterThan(0);
    expect(view.element.textContent).toContain("Trash");
  });

  it("ignores malformed inner template JSON without mutating", () => {
    document.body.innerHTML = "";
    const procedure = new MethodDeclaration("run", { type: "VoidTypeRef" }, [], []);
    const type = new ClassDeclaration("Actor", "Object", [], [procedure], []);
    const view = new ProcedureBlockView(procedure, type);
    view.mount(document.body);

    const store = createDataTransferStore();
    const dropZone = view.element.querySelector<HTMLElement>(`[data-owner-id='${procedure.id}'][data-insert-index='0']`)!;
    primeDataTransfer({ type: "code-block", statementKind: "comment", template: "{\"source\":\"toolbox\"," }, store);

    expect(() => dispatchDragEvent(dropZone, "dragover", store)).not.toThrow();
    expect(() => dispatchDragEvent(dropZone, "drop", store)).not.toThrow();
    expect(procedure.body).toHaveLength(0);
  });

  it("ignores payloads with invalid owner index or toolbox descriptors", () => {
    document.body.innerHTML = "";
    const existing = new CommentStatement("keep");
    const procedure = new MethodDeclaration("run", { type: "VoidTypeRef" }, [], [existing]);
    const type = new ClassDeclaration("Actor", "Object", [], [procedure], []);
    const view = new ProcedureBlockView(procedure, type);
    view.mount(document.body);

    const dropZone = view.element.querySelector<HTMLElement>(`[data-owner-id='${procedure.id}'][data-insert-index='0']`)!;
    const invalidDescriptors = [
      { source: "statement", ownerId: "missing-owner", index: 0 },
      { source: "statement", ownerId: procedure.id, index: -1 },
      { source: "statement", ownerId: procedure.id, index: 1.5 },
      { source: "statement", ownerId: procedure.id, index: 100_001 },
      { source: "unknown", ownerId: procedure.id, index: 0 },
      { source: "toolbox", template: { kind: "evil();", category: "Actions", label: "evil" } },
      { source: "toolbox", template: { kind: "method-call", category: "Actions", label: "missing", methodName: "missing" } },
    ];

    for (const descriptor of invalidDescriptors) {
      const store = createDataTransferStore();
      primeDataTransfer({ type: "code-block", statementKind: "comment", template: JSON.stringify(descriptor) }, store);

      expect(() => dispatchDragEvent(dropZone, "dragover", store)).not.toThrow();
      expect(() => dispatchDragEvent(dropZone, "drop", store)).not.toThrow();
      expect(procedure.body).toEqual([existing]);
    }
  });
});
