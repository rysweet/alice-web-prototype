/**
 * Clipboard for copy/paste of entities, source code, and AST nodes.
 * Uses structuredClone for deep cloning and generates unique names on paste.
 */
import type { AliceObject, AliceStatement } from "./a3p-parser";
import type { Scene } from "./story-api/scene";

export const CLIPBOARD_FORMATS = {
  entity: "application/x.alice.entity+json",
  code: "text/x.alice.code",
  astNode: "application/x.alice.ast-node+json",
  astNodeList: "application/x.alice.ast-node-list+json",
} as const;

export type ClipboardBuffer =
  | { kind: "entity"; format: typeof CLIPBOARD_FORMATS.entity; operation: "copy"; data: AliceObject }
  | { kind: "code"; format: typeof CLIPBOARD_FORMATS.code; operation: "copy"; data: string }
  | { kind: "ast-node"; format: typeof CLIPBOARD_FORMATS.astNode; operation: "copy" | "cut"; data: AliceStatement }
  | { kind: "ast-node-list"; format: typeof CLIPBOARD_FORMATS.astNodeList; operation: "copy" | "cut"; data: AliceStatement[] };

export class Clipboard {
  private _buffer: ClipboardBuffer | null = null;

  get isEmpty(): boolean {
    return this._buffer === null;
  }

  get hasEntity(): boolean {
    return this._buffer?.kind === "entity";
  }

  get hasCode(): boolean {
    return this._buffer?.kind === "code";
  }

  get hasAstNode(): boolean {
    return this._buffer?.kind === "ast-node" || this._buffer?.kind === "ast-node-list";
  }

  get contents(): ClipboardBuffer | null {
    return this._buffer ? structuredClone(this._buffer) : null;
  }

  get formats(): string[] {
    return this._buffer ? [this._buffer.format] : [];
  }

  hasFormat(format: string): boolean {
    return this._buffer?.format === format;
  }

  read(format: string): unknown | null {
    return this._buffer?.format === format ? structuredClone(this._buffer.data) : null;
  }

  copyEntity(obj: AliceObject): void {
    this._buffer = {
      kind: "entity",
      format: CLIPBOARD_FORMATS.entity,
      operation: "copy",
      data: structuredClone(obj),
    };
  }

  copyCode(code: string): void {
    this._buffer = {
      kind: "code",
      format: CLIPBOARD_FORMATS.code,
      operation: "copy",
      data: code,
    };
  }

  copyAstNode(node: AliceStatement): void {
    this._buffer = {
      kind: "ast-node",
      format: CLIPBOARD_FORMATS.astNode,
      operation: "copy",
      data: structuredClone(node),
    };
  }

  copyAstNodes(nodes: AliceStatement[]): void {
    this._buffer = {
      kind: "ast-node-list",
      format: CLIPBOARD_FORMATS.astNodeList,
      operation: "copy",
      data: structuredClone(nodes),
    };
  }

  cutAstNode(node: AliceStatement): void {
    this._buffer = {
      kind: "ast-node",
      format: CLIPBOARD_FORMATS.astNode,
      operation: "cut",
      data: structuredClone(node),
    };
  }

  cutAstNodes(nodes: AliceStatement[]): void {
    this._buffer = {
      kind: "ast-node-list",
      format: CLIPBOARD_FORMATS.astNodeList,
      operation: "cut",
      data: structuredClone(nodes),
    };
  }

  pasteEntity(scene: Scene): AliceObject | null {
    if (!this._buffer || this._buffer.kind !== "entity") return null;
    const cloned = structuredClone(this._buffer.data);
    cloned.name = this._uniqueName(cloned.name, scene);
    return cloned;
  }

  pasteCode(): string | null {
    if (!this._buffer || this._buffer.kind !== "code") return null;
    return this._buffer.data;
  }

  pasteAstNode(): AliceStatement | null {
    if (!this._buffer || this._buffer.kind !== "ast-node") return null;
    return structuredClone(this._buffer.data);
  }

  pasteAstNodes(): AliceStatement[] | null {
    if (!this._buffer) return null;
    if (this._buffer.kind === "ast-node") {
      return [structuredClone(this._buffer.data)];
    }
    if (this._buffer.kind === "ast-node-list") {
      return structuredClone(this._buffer.data);
    }
    return null;
  }

  clear(): void {
    this._buffer = null;
  }

  private _uniqueName(baseName: string, scene: Scene): string {
    const candidate = `${baseName}_copy`;
    if (!scene.getEntity(candidate)) return candidate;

    let counter = 2;
    while (scene.getEntity(`${baseName}_copy_${counter}`)) {
      counter++;
    }
    return `${baseName}_copy_${counter}`;
  }
}
