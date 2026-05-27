import type { OperationHistory } from "./croquet-operations";

export type Perspective = "code" | "scene" | "run";
export type EditorMode = "code" | "scene" | "design" | "preview";

export interface CursorPosition {
  readonly line: number;
  readonly column: number;
  readonly offset?: number;
}

function cloneCursorPosition(position: CursorPosition): CursorPosition {
  return { ...position };
}

function normalizeZoomLevel(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export class PerspectiveState {
  private activePerspective: Perspective;
  private previousPerspective: Perspective | null;

  constructor(active: Perspective = "code", previous: Perspective | null = null) {
    this.activePerspective = active;
    this.previousPerspective = previous;
  }

  get active(): Perspective {
    return this.activePerspective;
  }

  get previous(): Perspective | null {
    return this.previousPerspective;
  }

  switchTo(next: Perspective): this {
    if (next !== this.activePerspective) {
      this.previousPerspective = this.activePerspective;
      this.activePerspective = next;
    }
    return this;
  }

  isActive(perspective: Perspective): boolean {
    return this.activePerspective === perspective;
  }
}

export class SelectionState<TEntity = unknown, TStatement = unknown, TType = unknown> {
  selectedEntity: TEntity | null;
  selectedStatement: TStatement | null;
  selectedType: TType | null;

  constructor(
    selectedEntity: TEntity | null = null,
    selectedStatement: TStatement | null = null,
    selectedType: TType | null = null,
  ) {
    this.selectedEntity = selectedEntity;
    this.selectedStatement = selectedStatement;
    this.selectedType = selectedType;
  }

  selectEntity(entity: TEntity | null): this {
    this.selectedEntity = entity;
    return this;
  }

  selectStatement(statement: TStatement | null): this {
    this.selectedStatement = statement;
    return this;
  }

  selectType(type: TType | null): this {
    this.selectedType = type;
    return this;
  }

  clear(): this {
    this.selectedEntity = null;
    this.selectedStatement = null;
    this.selectedType = null;
    return this;
  }
}

export class EditorState {
  private activeMode: EditorMode;
  private currentCursor: CursorPosition;
  private currentZoomLevel: number;

  constructor(mode: EditorMode = "code", cursor: CursorPosition = { line: 1, column: 1 }, zoomLevel = 1) {
    this.activeMode = mode;
    this.currentCursor = cloneCursorPosition(cursor);
    this.currentZoomLevel = normalizeZoomLevel(zoomLevel);
  }

  get mode(): EditorMode {
    return this.activeMode;
  }

  get cursorPosition(): CursorPosition {
    return cloneCursorPosition(this.currentCursor);
  }

  get zoomLevel(): number {
    return this.currentZoomLevel;
  }

  setMode(mode: EditorMode): this {
    this.activeMode = mode;
    return this;
  }

  setCursorPosition(position: CursorPosition): this {
    this.currentCursor = cloneCursorPosition(position);
    return this;
  }

  setZoomLevel(zoomLevel: number): this {
    this.currentZoomLevel = normalizeZoomLevel(zoomLevel);
    return this;
  }
}

export class ProjectState<TProject = unknown> {
  loadedProject: TProject | null;
  dirty: boolean;
  savePath: string | null;

  constructor(loadedProject: TProject | null = null, dirty = false, savePath: string | null = null) {
    this.loadedProject = loadedProject;
    this.dirty = dirty;
    this.savePath = savePath;
  }

  get hasProject(): boolean {
    return this.loadedProject !== null;
  }

  open(project: TProject, savePath: string | null = null): this {
    this.loadedProject = project;
    this.dirty = false;
    this.savePath = savePath;
    return this;
  }

  markDirty(isDirty = true): this {
    this.dirty = isDirty;
    return this;
  }

  markSaved(savePath: string | null = this.savePath): this {
    this.dirty = false;
    this.savePath = savePath;
    return this;
  }

  close(): this {
    this.loadedProject = null;
    this.dirty = false;
    this.savePath = null;
    return this;
  }
}

type UndoRedoHistory = Pick<OperationHistory, "canUndo" | "canRedo" | "undoDepth" | "redoDepth" | "undo" | "redo">;

export class UndoRedoState {
  private history: UndoRedoHistory | null;

  constructor(history: UndoRedoHistory | null = null) {
    this.history = history;
  }

  attach(history: UndoRedoHistory | null): this {
    this.history = history;
    return this;
  }

  get canUndo(): boolean {
    return this.history?.canUndo ?? false;
  }

  get canRedo(): boolean {
    return this.history?.canRedo ?? false;
  }

  get undoDepth(): number {
    return this.history?.undoDepth ?? 0;
  }

  get redoDepth(): number {
    return this.history?.redoDepth ?? 0;
  }

  undo() {
    return this.history?.undo() ?? null;
  }

  redo() {
    return this.history?.redo() ?? null;
  }
}

export class IdeState<TProject = unknown, TEntity = unknown, TStatement = unknown, TType = unknown> {
  readonly project: ProjectState<TProject>;
  readonly selection: SelectionState<TEntity, TStatement, TType>;
  readonly editor: EditorState;
  readonly perspective: PerspectiveState;
  readonly undoRedo: UndoRedoState;

  constructor(options: {
    readonly project?: ProjectState<TProject>;
    readonly selection?: SelectionState<TEntity, TStatement, TType>;
    readonly editor?: EditorState;
    readonly perspective?: PerspectiveState;
    readonly undoRedo?: UndoRedoState;
  } = {}) {
    this.project = options.project ?? new ProjectState<TProject>();
    this.selection = options.selection ?? new SelectionState<TEntity, TStatement, TType>();
    this.editor = options.editor ?? new EditorState();
    this.perspective = options.perspective ?? new PerspectiveState();
    this.undoRedo = options.undoRedo ?? new UndoRedoState();
  }

  openProject(project: TProject, savePath: string | null = null): this {
    this.project.open(project, savePath);
    return this;
  }

  selectEntity(entity: TEntity | null): this {
    this.selection.selectEntity(entity);
    return this;
  }

  selectStatement(statement: TStatement | null): this {
    this.selection.selectStatement(statement);
    return this;
  }

  selectType(type: TType | null): this {
    this.selection.selectType(type);
    return this;
  }

  clearSelection(): this {
    this.selection.clear();
    return this;
  }

  switchPerspective(perspective: Perspective): this {
    this.perspective.switchTo(perspective);
    return this;
  }

  setEditorMode(mode: EditorMode): this {
    this.editor.setMode(mode);
    return this;
  }

  setCursorPosition(position: CursorPosition): this {
    this.editor.setCursorPosition(position);
    return this;
  }

  setZoomLevel(zoomLevel: number): this {
    this.editor.setZoomLevel(zoomLevel);
    return this;
  }

  attachHistory(history: UndoRedoHistory | null): this {
    this.undoRedo.attach(history);
    return this;
  }
}
