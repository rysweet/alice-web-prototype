/**
 * Expanded IDE command operations — closing the gap from ~30 toward Java Alice's ~60.
 *
 * Split into two categories per rubber-duck review:
 * - Undoable model commands: entity transforms, statement mutations, refactors
 * - Non-undoable IDE actions: find, navigation, view toggles (undoable = false)
 *
 * Each command domain uses a narrow receiver interface so commands can be
 * tested against fakes without concrete IDE infrastructure.
 */
import type { Command } from "./undo-redo";
import type { SelectionModel } from "./ide-command-operations";

function throwNonUndoableUndo(description: string): never {
  throw new Error(
    `Command "${description}" is non-undoable; UndoRedoManager skips it and undo() must not be called directly.`,
  );
}

// ---------------------------------------------------------------------------
// Receiver Interfaces (narrow, per-domain)
// ---------------------------------------------------------------------------

export interface CodeEditorReceiver {
  readonly content: string;
  setContent(content: string): void;
  getSelection(): { start: number; end: number };
  setSelection(start: number, end: number): void;
  insertAt(offset: number, text: string): void;
  deleteRange(start: number, end: number): string;
  getLineCount(): number;
  getLineContent(line: number): string;
}

export interface PerspectiveReceiver {
  readonly activePerspective: string;
  switchTo(perspectiveId: string): void;
  readonly availablePerspectives: readonly string[];
}

export interface PanelReceiver {
  isPanelVisible(panelId: string): boolean;
  showPanel(panelId: string): void;
  hidePanel(panelId: string): void;
}

export interface CameraReceiver {
  readonly position: { x: number; y: number; z: number };
  readonly rotation: { x: number; y: number; z: number };
  setPosition(x: number, y: number, z: number): void;
  setRotation(x: number, y: number, z: number): void;
  lookAt(x: number, y: number, z: number): void;
}

export interface EntityTransformReceiver {
  getEntityPosition(name: string): { x: number; y: number; z: number } | null;
  setEntityPosition(name: string, x: number, y: number, z: number): void;
  getEntityRotation(name: string): { x: number; y: number; z: number } | null;
  setEntityRotation(name: string, x: number, y: number, z: number): void;
  getEntityScale(name: string): { x: number; y: number; z: number } | null;
  setEntityScale(name: string, x: number, y: number, z: number): void;
  isEntityLocked(name: string): boolean;
  setEntityLocked(name: string, locked: boolean): void;
}

export interface SearchReceiver {
  readonly results: readonly SearchResult[];
  search(query: string, options?: SearchOptions): SearchResult[];
  replace(query: string, replacement: string, options?: SearchOptions): number;
  clearResults(): void;
}

export interface SearchResult {
  readonly line: number;
  readonly column: number;
  readonly length: number;
  readonly text: string;
}

export interface SearchOptions {
  readonly caseSensitive?: boolean;
  readonly wholeWord?: boolean;
  readonly regex?: boolean;
}

// ---------------------------------------------------------------------------
// Code Editing Commands (undoable)
// ---------------------------------------------------------------------------

export class IndentCommand implements Command {
  private previousContent: string | null = null;

  constructor(
    private readonly editor: CodeEditorReceiver,
    private readonly indentStr: string = "  ",
  ) {}

  get description(): string {
    return "Indent all lines";
  }

  execute(): void {
    this.previousContent = this.editor.content;
    const lines = this.editor.content.split("\n");
    const indented = lines.map((l) => this.indentStr + l);
    this.editor.setContent(indented.join("\n"));
  }

  undo(): void {
    if (this.previousContent !== null) {
      this.editor.setContent(this.previousContent);
    }
  }
}

export class DedentCommand implements Command {
  private previousContent: string | null = null;

  constructor(
    private readonly editor: CodeEditorReceiver,
    private readonly indentStr: string = "  ",
  ) {}

  get description(): string {
    return "Dedent all lines";
  }

  execute(): void {
    this.previousContent = this.editor.content;
    const content = this.editor.content;
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(this.indentStr)) {
        lines[i] = lines[i].slice(this.indentStr.length);
      }
    }
    this.editor.setContent(lines.join("\n"));
  }

  undo(): void {
    if (this.previousContent !== null) {
      this.editor.setContent(this.previousContent);
    }
  }
}

export class ToggleCommentCommand implements Command {
  private previousContent: string | null = null;

  constructor(
    private readonly editor: CodeEditorReceiver,
    private readonly commentPrefix: string = "// ",
  ) {}

  get description(): string {
    return "Toggle comment";
  }

  execute(): void {
    this.previousContent = this.editor.content;
    const lines = this.editor.content.split("\n");
    const allCommented = lines.every(
      (l) => l.trim() === "" || l.trimStart().startsWith(this.commentPrefix),
    );
    const newLines = allCommented
      ? lines.map((l) => {
          const idx = l.indexOf(this.commentPrefix);
          return idx >= 0 ? l.slice(0, idx) + l.slice(idx + this.commentPrefix.length) : l;
        })
      : lines.map((l) => (l.trim() === "" ? l : this.commentPrefix + l));
    this.editor.setContent(newLines.join("\n"));
  }

  undo(): void {
    if (this.previousContent !== null) {
      this.editor.setContent(this.previousContent);
    }
  }
}

export class SortStatementsCommand implements Command {
  private previousContent: string | null = null;

  constructor(private readonly editor: CodeEditorReceiver) {}

  get description(): string {
    return "Sort statements alphabetically";
  }

  execute(): void {
    this.previousContent = this.editor.content;
    const lines = this.editor.content.split("\n");
    lines.sort((a, b) => a.trimStart().localeCompare(b.trimStart()));
    this.editor.setContent(lines.join("\n"));
  }

  undo(): void {
    if (this.previousContent !== null) {
      this.editor.setContent(this.previousContent);
    }
  }
}

// ---------------------------------------------------------------------------
// View / Navigation Commands (non-undoable)
// ---------------------------------------------------------------------------

export class SwitchPerspectiveCommand implements Command {
  readonly undoable = false;

  constructor(
    private readonly receiver: PerspectiveReceiver,
    private readonly targetPerspective: string,
  ) {}

  get description(): string {
    return `Switch to ${this.targetPerspective} perspective`;
  }

  execute(): void {
    if (!this.receiver.availablePerspectives.includes(this.targetPerspective)) {
      throw new Error(`Unknown perspective: "${this.targetPerspective}"`);
    }
    this.receiver.switchTo(this.targetPerspective);
  }

  undo(): never {
    throwNonUndoableUndo(this.description);
  }
}

export class TogglePanelCommand implements Command {
  readonly undoable = false;

  constructor(
    private readonly receiver: PanelReceiver,
    private readonly panelId: string,
  ) {}

  get description(): string {
    return `Toggle panel "${this.panelId}"`;
  }

  execute(): void {
    if (this.receiver.isPanelVisible(this.panelId)) {
      this.receiver.hidePanel(this.panelId);
    } else {
      this.receiver.showPanel(this.panelId);
    }
  }

  undo(): never {
    throwNonUndoableUndo(this.description);
  }
}

export class GoToLineCommand implements Command {
  readonly undoable = false;

  constructor(
    private readonly editor: CodeEditorReceiver,
    private readonly line: number,
  ) {}

  get description(): string {
    return `Go to line ${this.line}`;
  }

  execute(): void {
    const lineCount = this.editor.getLineCount();
    if (this.line < 1 || this.line > lineCount) {
      throw new Error(`Line ${this.line} out of range (1-${lineCount})`);
    }
    let offset = 0;
    for (let i = 1; i < this.line; i++) {
      offset += this.editor.getLineContent(i).length + 1;
    }
    this.editor.setSelection(offset, offset);
  }

  undo(): never {
    throwNonUndoableUndo(this.description);
  }
}

// ---------------------------------------------------------------------------
// Search Commands (non-undoable find, undoable replace)
// ---------------------------------------------------------------------------

export class FindInCodeCommand implements Command {
  readonly undoable = false;
  private foundResults: SearchResult[] = [];

  constructor(
    private readonly receiver: SearchReceiver,
    private readonly query: string,
    private readonly options?: SearchOptions,
  ) {}

  get description(): string {
    return `Find "${this.query}"`;
  }

  get results(): readonly SearchResult[] {
    return this.foundResults;
  }

  execute(): void {
    this.foundResults = this.receiver.search(this.query, this.options);
  }

  undo(): never {
    throwNonUndoableUndo(this.description);
  }
}

export class ReplaceInCodeCommand implements Command {
  private previousContent: string | null = null;
  private replacementCount = 0;

  constructor(
    private readonly editor: CodeEditorReceiver,
    private readonly receiver: SearchReceiver,
    private readonly query: string,
    private readonly replacement: string,
    private readonly options?: SearchOptions,
  ) {}

  get description(): string {
    return `Replace "${this.query}" with "${this.replacement}"`;
  }

  get count(): number {
    return this.replacementCount;
  }

  execute(): void {
    this.previousContent = this.editor.content;
    this.replacementCount = this.receiver.replace(this.query, this.replacement, this.options);
  }

  undo(): void {
    if (this.previousContent !== null) {
      this.editor.setContent(this.previousContent);
    }
  }
}

// ---------------------------------------------------------------------------
// Camera Commands (undoable)
// ---------------------------------------------------------------------------

export interface CameraBookmark {
  readonly name: string;
  readonly position: { x: number; y: number; z: number };
  readonly rotation: { x: number; y: number; z: number };
}

export class CameraBookmarkStore {
  private readonly bookmarks = new Map<string, CameraBookmark>();

  save(name: string, position: { x: number; y: number; z: number }, rotation: { x: number; y: number; z: number }): void {
    this.bookmarks.set(name, { name, position: { ...position }, rotation: { ...rotation } });
  }

  get(name: string): CameraBookmark | null {
    return this.bookmarks.get(name) ?? null;
  }

  delete(name: string): boolean {
    return this.bookmarks.delete(name);
  }

  list(): CameraBookmark[] {
    return [...this.bookmarks.values()];
  }
}

export class StoreCameraBookmarkCommand implements Command {
  private previousBookmark: CameraBookmark | null = null;

  constructor(
    private readonly store: CameraBookmarkStore,
    private readonly camera: CameraReceiver,
    private readonly bookmarkName: string,
  ) {}

  get description(): string {
    return `Store camera bookmark "${this.bookmarkName}"`;
  }

  execute(): void {
    this.previousBookmark = this.store.get(this.bookmarkName);
    this.store.save(this.bookmarkName, this.camera.position, this.camera.rotation);
  }

  undo(): void {
    if (this.previousBookmark) {
      this.store.save(this.previousBookmark.name, this.previousBookmark.position, this.previousBookmark.rotation);
    } else {
      this.store.delete(this.bookmarkName);
    }
  }
}

export class RestoreCameraBookmarkCommand implements Command {
  private previousPosition: { x: number; y: number; z: number } | null = null;
  private previousRotation: { x: number; y: number; z: number } | null = null;

  constructor(
    private readonly store: CameraBookmarkStore,
    private readonly camera: CameraReceiver,
    private readonly bookmarkName: string,
  ) {}

  get description(): string {
    return `Restore camera bookmark "${this.bookmarkName}"`;
  }

  execute(): void {
    const bookmark = this.store.get(this.bookmarkName);
    if (!bookmark) throw new Error(`Bookmark "${this.bookmarkName}" not found`);
    this.previousPosition = { ...this.camera.position };
    this.previousRotation = { ...this.camera.rotation };
    this.camera.setPosition(bookmark.position.x, bookmark.position.y, bookmark.position.z);
    this.camera.setRotation(bookmark.rotation.x, bookmark.rotation.y, bookmark.rotation.z);
  }

  undo(): void {
    if (this.previousPosition && this.previousRotation) {
      this.camera.setPosition(this.previousPosition.x, this.previousPosition.y, this.previousPosition.z);
      this.camera.setRotation(this.previousRotation.x, this.previousRotation.y, this.previousRotation.z);
    }
  }
}

export class FocusOnEntityCommand implements Command {
  private previousPosition: { x: number; y: number; z: number } | null = null;
  private previousRotation: { x: number; y: number; z: number } | null = null;

  constructor(
    private readonly camera: CameraReceiver,
    private readonly transforms: EntityTransformReceiver,
    private readonly entityName: string,
    private readonly distance: number = 5,
  ) {}

  get description(): string {
    return `Focus camera on "${this.entityName}"`;
  }

  execute(): void {
    const pos = this.transforms.getEntityPosition(this.entityName);
    if (!pos) throw new Error(`Entity "${this.entityName}" not found`);
    this.previousPosition = { ...this.camera.position };
    this.previousRotation = { ...this.camera.rotation };
    this.camera.setPosition(pos.x, pos.y + this.distance, pos.z + this.distance);
    this.camera.lookAt(pos.x, pos.y, pos.z);
  }

  undo(): void {
    if (this.previousPosition && this.previousRotation) {
      this.camera.setPosition(this.previousPosition.x, this.previousPosition.y, this.previousPosition.z);
      this.camera.setRotation(this.previousRotation.x, this.previousRotation.y, this.previousRotation.z);
    }
  }
}

// ---------------------------------------------------------------------------
// Entity Transform Commands (undoable)
// ---------------------------------------------------------------------------

export class ResetEntityTransformCommand implements Command {
  private previousPosition: { x: number; y: number; z: number } | null = null;
  private previousRotation: { x: number; y: number; z: number } | null = null;
  private previousScale: { x: number; y: number; z: number } | null = null;

  constructor(
    private readonly transforms: EntityTransformReceiver,
    private readonly entityName: string,
  ) {}

  get description(): string {
    return `Reset transform of "${this.entityName}"`;
  }

  execute(): void {
    this.previousPosition = this.transforms.getEntityPosition(this.entityName);
    this.previousRotation = this.transforms.getEntityRotation(this.entityName);
    this.previousScale = this.transforms.getEntityScale(this.entityName);
    if (!this.previousPosition) throw new Error(`Entity "${this.entityName}" not found`);
    this.transforms.setEntityPosition(this.entityName, 0, 0, 0);
    this.transforms.setEntityRotation(this.entityName, 0, 0, 0);
    this.transforms.setEntityScale(this.entityName, 1, 1, 1);
  }

  undo(): void {
    if (this.previousPosition) {
      this.transforms.setEntityPosition(this.entityName, this.previousPosition.x, this.previousPosition.y, this.previousPosition.z);
    }
    if (this.previousRotation) {
      this.transforms.setEntityRotation(this.entityName, this.previousRotation.x, this.previousRotation.y, this.previousRotation.z);
    }
    if (this.previousScale) {
      this.transforms.setEntityScale(this.entityName, this.previousScale.x, this.previousScale.y, this.previousScale.z);
    }
  }
}

export class LockEntityCommand implements Command {
  private wasLocked = false;

  constructor(
    private readonly transforms: EntityTransformReceiver,
    private readonly entityName: string,
  ) {}

  get description(): string {
    return `Lock "${this.entityName}"`;
  }

  execute(): void {
    this.wasLocked = this.transforms.isEntityLocked(this.entityName);
    this.transforms.setEntityLocked(this.entityName, true);
  }

  undo(): void {
    this.transforms.setEntityLocked(this.entityName, this.wasLocked);
  }
}

export class UnlockEntityCommand implements Command {
  private wasLocked = true;

  constructor(
    private readonly transforms: EntityTransformReceiver,
    private readonly entityName: string,
  ) {}

  get description(): string {
    return `Unlock "${this.entityName}"`;
  }

  execute(): void {
    this.wasLocked = this.transforms.isEntityLocked(this.entityName);
    this.transforms.setEntityLocked(this.entityName, false);
  }

  undo(): void {
    this.transforms.setEntityLocked(this.entityName, this.wasLocked);
  }
}

export class AlignEntitiesCommand implements Command {
  private previousPositions: Map<string, { x: number; y: number; z: number }> = new Map();

  constructor(
    private readonly transforms: EntityTransformReceiver,
    private readonly entityNames: readonly string[],
    private readonly axis: "x" | "y" | "z",
    private readonly alignTo: "first" | "center" = "first",
  ) {}

  get description(): string {
    return `Align ${this.entityNames.length} entities on ${this.axis} axis`;
  }

  execute(): void {
    this.previousPositions.clear();
    const positions: { name: string; pos: { x: number; y: number; z: number } }[] = [];
    for (const name of this.entityNames) {
      const pos = this.transforms.getEntityPosition(name);
      if (pos) {
        this.previousPositions.set(name, { ...pos });
        positions.push({ name, pos: { ...pos } });
      }
    }
    if (positions.length < 2) return;

    let targetValue: number;
    if (this.alignTo === "center") {
      const values = positions.map((p) => p.pos[this.axis]);
      targetValue = values.reduce((a, b) => a + b, 0) / values.length;
    } else {
      targetValue = positions[0].pos[this.axis];
    }

    for (const { name, pos } of positions) {
      const newPos = { ...pos, [this.axis]: targetValue };
      this.transforms.setEntityPosition(name, newPos.x, newPos.y, newPos.z);
    }
  }

  undo(): void {
    for (const [name, pos] of this.previousPositions) {
      this.transforms.setEntityPosition(name, pos.x, pos.y, pos.z);
    }
  }
}

export class DistributeEntitiesCommand implements Command {
  private previousPositions: Map<string, { x: number; y: number; z: number }> = new Map();

  constructor(
    private readonly transforms: EntityTransformReceiver,
    private readonly entityNames: readonly string[],
    private readonly axis: "x" | "y" | "z",
  ) {}

  get description(): string {
    return `Distribute ${this.entityNames.length} entities along ${this.axis} axis`;
  }

  execute(): void {
    this.previousPositions.clear();
    const entries: { name: string; pos: { x: number; y: number; z: number } }[] = [];
    for (const name of this.entityNames) {
      const pos = this.transforms.getEntityPosition(name);
      if (pos) {
        this.previousPositions.set(name, { ...pos });
        entries.push({ name, pos: { ...pos } });
      }
    }
    if (entries.length < 3) return;

    entries.sort((a, b) => a.pos[this.axis] - b.pos[this.axis]);
    const first = entries[0].pos[this.axis];
    const last = entries[entries.length - 1].pos[this.axis];
    const step = (last - first) / (entries.length - 1);

    for (let i = 1; i < entries.length - 1; i++) {
      const newPos = { ...entries[i].pos, [this.axis]: first + step * i };
      this.transforms.setEntityPosition(entries[i].name, newPos.x, newPos.y, newPos.z);
    }
  }

  undo(): void {
    for (const [name, pos] of this.previousPositions) {
      this.transforms.setEntityPosition(name, pos.x, pos.y, pos.z);
    }
  }
}

// ---------------------------------------------------------------------------
// Selection Commands (undoable)
// ---------------------------------------------------------------------------

export class InvertSelectionCommand implements Command {
  private previousSelection: string[] = [];

  constructor(
    private readonly model: SelectionModel,
    private readonly allEntityNames: readonly string[],
  ) {}

  get description(): string {
    return "Invert selection";
  }

  execute(): void {
    this.previousSelection = [...this.model.selected];
    const unselected = this.allEntityNames.filter((n) => !this.model.selected.has(n));
    this.model.clear();
    this.model.select(unselected);
  }

  undo(): void {
    this.model.clear();
    this.model.select(this.previousSelection);
  }
}

export class SelectByTypeCommand implements Command {
  private previousSelection: string[] = [];

  constructor(
    private readonly model: SelectionModel,
    private readonly typeFilter: (name: string) => boolean,
    private readonly allEntityNames: readonly string[],
    private readonly typeName: string = "type",
  ) {}

  get description(): string {
    return `Select all of type "${this.typeName}"`;
  }

  execute(): void {
    this.previousSelection = [...this.model.selected];
    this.model.clear();
    this.model.select(this.allEntityNames.filter(this.typeFilter));
  }

  undo(): void {
    this.model.clear();
    this.model.select(this.previousSelection);
  }
}

// ---------------------------------------------------------------------------
// Command-Action Registry (connects shortcuts to commands)
// ---------------------------------------------------------------------------

export type CommandFactory = () => Command;

export class CommandActionRegistry {
  private readonly factories = new Map<string, CommandFactory>();

  register(actionId: string, factory: CommandFactory): void {
    this.factories.set(actionId, factory);
  }

  unregister(actionId: string): boolean {
    return this.factories.delete(actionId);
  }

  has(actionId: string): boolean {
    return this.factories.has(actionId);
  }

  create(actionId: string): Command | null {
    const factory = this.factories.get(actionId);
    return factory ? factory() : null;
  }

  list(): string[] {
    return [...this.factories.keys()];
  }
}
