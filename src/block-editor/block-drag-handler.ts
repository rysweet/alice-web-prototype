import {
  insertStatement,
  moveStatement,
  removeStatement,
  type BlockNode,
  type EditableUserType,
} from "../ast-editing-operations.js";
import {
  BooleanLiteral,
  CommentStatement,
  ConditionalStatement,
  CountLoop,
  DoInOrder,
  DoTogether,
  ExpressionStatement,
  ForEachLoop,
  IntegerLiteral,
  LocalVariableDeclarationStatement,
  MethodDeclaration,
  MethodInvocation,
  NullLiteral,
  StringLiteral,
  ThisExpression,
  WhileLoop,
  simpleTypeRef,
} from "../ast-nodes.js";
import { DataTransferHelper, HTML5DragSourceAdapter, HTML5DropZoneAdapter, type DataTransferLike, type DragEventLike } from "../drag-drop-html5-adapter.js";
import type { CodeBlockPayload } from "../drag-drop-bridge.js";
import type { ToolboxCategory, ToolboxTemplateDescriptor } from "./block-toolbox.js";

const MAX_DRAG_INDEX = 100_000;
const DEFAULT_TOOLBOX_TEMPLATE: ToolboxTemplateDescriptor = {
  kind: "method-call",
  category: "Actions",
  label: "call method",
};
const BUILTIN_TEMPLATE_KINDS = new Set([
  "if",
  "while",
  "for-each",
  "count",
  "do-in-order",
  "do-together",
  "local",
  "comment",
]);

type DragDescriptor = ToolboxDragDescriptor | StatementDragDescriptor;

interface ToolboxDragDescriptor {
  readonly source: "toolbox";
  readonly template: ToolboxTemplateDescriptor;
}

interface StatementDragDescriptor {
  readonly source: "statement";
  readonly statementId?: string;
  readonly ownerId: string;
  readonly index: number;
}

export interface BlockDragHandlerOptions {
  readonly procedure: MethodDeclaration;
  readonly currentType: EditableUserType | null;
  readonly root: HTMLElement;
  readonly trashZone: HTMLElement;
  readonly onMutate: () => void;
}

export class BlockDragHandler {
  private activeIndicator: HTMLElement | null = null;

  constructor(private readonly options: BlockDragHandlerOptions) {}

  connect(): void {
    this.options.root.addEventListener("dragstart", this.handleDragStart);
    this.options.root.addEventListener("dragover", this.handleDragOver);
    this.options.root.addEventListener("drop", this.handleDrop);
    this.options.root.addEventListener("dragleave", this.handleDragLeave);
    this.options.root.addEventListener("dragend", this.handleDragEnd);
  }

  disconnect(): void {
    this.options.root.removeEventListener("dragstart", this.handleDragStart);
    this.options.root.removeEventListener("dragover", this.handleDragOver);
    this.options.root.removeEventListener("drop", this.handleDrop);
    this.options.root.removeEventListener("dragleave", this.handleDragLeave);
    this.options.root.removeEventListener("dragend", this.handleDragEnd);
  }

  private readonly handleDragStart = (event: Event): void => {
    const dragEvent = event as unknown as DragEventLike & { target: EventTarget | null };
    const element = dragEvent.target instanceof Element ? dragEvent.target.closest<HTMLElement>("[data-drag-source]") : null;
    if (!element) {
      return;
    }

    const payload = this.createPayload(element);
    if (!payload) {
      return;
    }
    const source = new HTML5DragSourceAdapter({
      elementId: element.dataset.nodeId ?? element.dataset.statementKind ?? "toolbox-item",
      payload,
      label: element.textContent ?? payload.statementKind,
    });
    source.handleDragStart(dragEvent);
  };

  private readonly handleDragOver = (event: Event): void => {
    const dragEvent = event as unknown as DragEventLike & { target: EventTarget | null };
    const zone = this.findDropZone(dragEvent.target);
    if (!zone) {
      return;
    }
    if (!this.readAcceptedPayload(zone, dragEvent)) {
      return;
    }
    const adapter = this.createDropAdapter(zone, () => undefined);
    if (adapter.handleDragOver(dragEvent)) {
      this.setActiveIndicator(zone);
    }
  };

  private readonly handleDrop = (event: Event): void => {
    const dragEvent = event as unknown as DragEventLike & { target: EventTarget | null };
    const zone = this.findDropZone(dragEvent.target);
    if (!zone) {
      return;
    }
    if (!this.readAcceptedPayload(zone, dragEvent)) {
      return;
    }
    const adapter = this.createDropAdapter(zone, (payload) => this.commitDrop(zone, payload));
    if (adapter.handleDrop(dragEvent)) {
      this.clearIndicators();
    }
  };

  private readonly handleDragLeave = (): void => {
    this.clearIndicators();
  };

  private readonly handleDragEnd = (): void => {
    this.clearIndicators();
  };

  private createPayload(element: HTMLElement): CodeBlockPayload | null {
    const descriptor = createDragDescriptor(element);
    if (!descriptor) {
      return null;
    }
    return {
      type: "code-block",
      statementKind: element.dataset.statementKind ?? element.dataset.statementType ?? "statement",
      template: JSON.stringify(descriptor),
    };
  }

  private findDropZone(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) {
      return null;
    }
    return target.closest<HTMLElement>("[data-drop-zone]");
  }

  private createDropAdapter(zone: HTMLElement, onDrop: (payload: CodeBlockPayload) => void): HTML5DropZoneAdapter {
    return new HTML5DropZoneAdapter(
      zone.dataset.ownerId ?? zone.id ?? "drop-zone",
      zone.dataset.dropZone ?? "code-editor",
      ["code-block"],
      {
        onDrop: (payload) => {
          if (payload.type === "code-block") {
            onDrop(payload);
          }
        },
      },
    );
  }

  private readAcceptedPayload(zone: HTMLElement, event: DragEventLike): CodeBlockPayload | null {
    if (!event.dataTransfer) {
      return null;
    }
    const payload = DataTransferHelper.readPayload(event.dataTransfer);
    if (!payload || payload.type !== "code-block") {
      return null;
    }
    const descriptor = parseDragDescriptor(payload.template);
    if (!descriptor || !this.canCommitDescriptor(zone, descriptor)) {
      return null;
    }
    return payload;
  }

  private canCommitDescriptor(zone: HTMLElement, descriptor: DragDescriptor): boolean {
    if (zone.dataset.dropZone === "trash") {
      return this.resolveStatementSource(descriptor) !== null;
    }
    const target = this.resolveInsertTarget(zone);
    if (!target) {
      return false;
    }
    if (descriptor.source === "toolbox") {
      return this.isAllowedToolboxTemplate(descriptor.template);
    }
    return this.resolveStatementSource(descriptor) !== null;
  }

  private commitDrop(zone: HTMLElement, payload: CodeBlockPayload): boolean {
    const descriptor = parseDragDescriptor(payload.template);
    if (!descriptor || !this.canCommitDescriptor(zone, descriptor)) {
      return false;
    }

    if (zone.dataset.dropZone === "trash") {
      const source = this.resolveStatementSource(descriptor);
      if (source) {
        removeStatement(source.owner, source.index);
        this.options.onMutate();
        return true;
      }
      return false;
    }

    const target = this.resolveInsertTarget(zone);
    if (!target) {
      return false;
    }
    const { owner, insertIndex } = target;

    if (descriptor.source === "toolbox" && descriptor.template) {
      insertStatement(owner, insertIndex, this.createStatement(descriptor.template));
      this.options.onMutate();
      return true;
    }

    const source = this.resolveStatementSource(descriptor);
    if (source) {
      if (source.owner === owner) {
        moveStatement(owner, source.index, insertIndex);
      } else {
        const statement = removeStatement(source.owner, source.index);
        insertStatement(owner, insertIndex, statement);
      }
      this.options.onMutate();
      return true;
    }
    return false;
  }

  private createStatement(template: ToolboxTemplateDescriptor) {
    const currentType = this.options.currentType;
    switch (template.kind) {
      case "if":
        return new ConditionalStatement(new BooleanLiteral(true), [], []);
      case "while":
        return new WhileLoop(new BooleanLiteral(true), []);
      case "for-each":
        return new ForEachLoop(simpleTypeRef("String"), "item", new NullLiteral(), []);
      case "count":
        return new CountLoop(null, null, new IntegerLiteral(3), []);
      case "do-in-order":
        return new DoInOrder([]);
      case "do-together":
        return new DoTogether([]);
      case "local":
        return new LocalVariableDeclarationStatement("value", simpleTypeRef("String"), new StringLiteral(""), false);
      case "comment":
        return new CommentStatement("comment");
      case "method-call": {
        const target = currentType ? new ThisExpression(currentType.toTypeRef()) : null;
        const method = currentType?.methods.find((candidate) => candidate.name === template.methodName) ?? null;
        return new ExpressionStatement(new MethodInvocation(target, template.methodName ?? "call", [], method));
      }
      default:
        return new ExpressionStatement(new MethodInvocation(null, template.kind, [], null));
    }
  }

  private findOwnerById(ownerId: string): BlockNode | null {
    if (this.options.procedure.id === ownerId) {
      return this.options.procedure;
    }
    let found: BlockNode | null = null;
    this.options.procedure.traverse((node) => {
      if (!found && "body" in node && Array.isArray((node as BlockNode).body) && node.id === ownerId) {
        found = node as BlockNode;
      }
    });
    return found;
  }

  private resolveInsertTarget(zone: HTMLElement): { owner: BlockNode; insertIndex: number } | null {
    const ownerId = zone.dataset.ownerId;
    if (!ownerId) {
      return null;
    }
    const owner = this.findOwnerById(ownerId);
    if (!owner) {
      return null;
    }
    const insertIndex = parseDropIndex(zone.dataset.insertIndex ?? "0", owner.body.length);
    return insertIndex === null ? null : { owner, insertIndex };
  }

  private resolveStatementSource(descriptor: DragDescriptor): { owner: BlockNode; index: number } | null {
    if (descriptor.source !== "statement") {
      return null;
    }
    const owner = this.findOwnerById(descriptor.ownerId);
    if (!owner || !isIndexWithinBody(descriptor.index, owner.body.length)) {
      return null;
    }
    return { owner, index: descriptor.index };
  }

  private isAllowedToolboxTemplate(template: ToolboxTemplateDescriptor): boolean {
    if (BUILTIN_TEMPLATE_KINDS.has(template.kind)) {
      return true;
    }
    if (template.kind !== "method-call") {
      return false;
    }
    if (!template.methodName) {
      return this.options.currentType === null;
    }
    return this.options.currentType?.methods.some((method) => method !== this.options.procedure && method.name === template.methodName) ?? false;
  }

  private setActiveIndicator(zone: HTMLElement): void {
    if (this.activeIndicator === zone) {
      return;
    }
    this.clearIndicators();
    this.activeIndicator = zone;
    zone.classList.add("is-active");
  }

  private clearIndicators(): void {
    this.activeIndicator?.classList.remove("is-active");
    this.activeIndicator = null;
    this.options.trashZone.classList.remove("is-active");
  }
}

function parseDragDescriptor(raw: string): DragDescriptor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) {
    return null;
  }
  if (parsed.source === "toolbox") {
    if (!isRecord(parsed.template)) {
      return null;
    }
    const template = parseToolboxTemplateDescriptor(parsed.template);
    return template ? { source: "toolbox", template } : null;
  }
  if (parsed.source === "statement") {
    if (typeof parsed.ownerId !== "string" || !isBoundedDragIndex(parsed.index)) {
      return null;
    }
    const statementId = typeof parsed.statementId === "string" ? parsed.statementId : undefined;
    return {
      source: "statement",
      statementId,
      ownerId: parsed.ownerId,
      index: parsed.index,
    };
  }
  return null;
}

function createDragDescriptor(element: HTMLElement): DragDescriptor | null {
  if (element.dataset.dragSource === "toolbox") {
    const template = parseTemplateDescriptor(element.dataset.template);
    return template ? { source: "toolbox", template } : null;
  }
  if (element.dataset.dragSource === "statement") {
    const index = parseDragIndex(element.dataset.index);
    if (!element.dataset.ownerId || index === null) {
      return null;
    }
    return {
      source: "statement",
      statementId: element.dataset.nodeId,
      ownerId: element.dataset.ownerId,
      index,
    };
  }
  return null;
}

function parseTemplateDescriptor(raw: string | undefined): ToolboxTemplateDescriptor | null {
  if (!raw) {
    return DEFAULT_TOOLBOX_TEMPLATE;
  }
  try {
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? parseToolboxTemplateDescriptor(parsed) : null;
  } catch {
    return null;
  }
}

function parseToolboxTemplateDescriptor(template: Record<string, unknown>): ToolboxTemplateDescriptor | null {
  const kind = nonEmptyString(template.kind);
  const category = isToolboxCategory(template.category) ? template.category : null;
  const label = nonEmptyString(template.label);
  if (!kind || !category || !label) {
    return null;
  }
  const methodName = template.methodName === undefined ? undefined : nonEmptyString(template.methodName);
  if (template.methodName !== undefined && !methodName) {
    return null;
  }
  if (template.parameterTypes !== undefined && !isStringArray(template.parameterTypes)) {
    return null;
  }
  return {
    kind,
    category,
    label,
    methodName,
    parameterTypes: isStringArray(template.parameterTypes) ? template.parameterTypes : undefined,
  };
}

function parseDropIndex(raw: string, maxInclusive: number): number | null {
  const index = parseDragIndex(raw);
  return index !== null && index <= maxInclusive ? index : null;
}

function parseDragIndex(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    return null;
  }
  const index = Number(raw);
  return isBoundedDragIndex(index) ? index : null;
}

function isIndexWithinBody(index: number, bodyLength: number): boolean {
  return isBoundedDragIndex(index) && index < bodyLength;
}

function isBoundedDragIndex(index: unknown): index is number {
  return typeof index === "number" && Number.isSafeInteger(index) && index >= 0 && index <= MAX_DRAG_INDEX;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolboxCategory(value: unknown): value is ToolboxCategory {
  return value === "Control" || value === "Actions" || value === "Variables" || value === "Comments";
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function createDataTransferStore(initialData: Record<string, string> = {}): DataTransferLike {
  const store = new Map<string, string>(Object.entries(initialData));
  return {
    get types() {
      return [...store.keys()];
    },
    effectAllowed: "uninitialized",
    dropEffect: "none",
    setData(type, value) {
      store.set(type, value);
    },
    getData(type) {
      return store.get(type) ?? "";
    },
    clearData(type) {
      if (type) {
        store.delete(type);
      } else {
        store.clear();
      }
    },
  };
}

export function createDragEvent(type: string, dataTransfer: DataTransferLike, target: HTMLElement): DragEventLike & Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: dataTransfer },
    target: { value: target },
    clientX: { value: 0 },
    clientY: { value: 0 },
  });
  return event as DragEventLike & Event;
}

export function primeDataTransfer(payload: CodeBlockPayload, dataTransfer: DataTransferLike): void {
  DataTransferHelper.writePayload(dataTransfer, payload);
}
