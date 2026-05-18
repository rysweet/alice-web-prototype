/**
 * Clipboard for copy/paste of entities (AliceObject) and code blocks.
 * Uses structuredClone for deep cloning and generates unique names on paste.
 */
import type { AliceObject } from "./a3p-parser";
import type { Scene } from "./story-api/scene";

export type ClipboardBuffer =
  | { kind: "entity"; data: AliceObject }
  | { kind: "code"; data: string };

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

  get contents(): ClipboardBuffer | null {
    return this._buffer;
  }

  copyEntity(obj: AliceObject): void {
    this._buffer = { kind: "entity", data: structuredClone(obj) };
  }

  copyCode(code: string): void {
    this._buffer = { kind: "code", data: code };
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
