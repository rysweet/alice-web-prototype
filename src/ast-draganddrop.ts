import {
  ExpressionProperty,
  FieldAccess,
  MethodInvocation,
  StringLiteral,
  ThisExpression,
  type Expression,
  type Statement,
  type TypeRef,
  typeRefName,
  typeRefsAssignable,
} from "./ast-nodes.js";
import { decodeAstNode, encodeAstNode } from "./ast-serialization.js";
import { CodeEditor, type StatementListLocation, type StatementListModel, summarizeStatement } from "./code-editor.js";
import type { TransferData } from "./user-interaction.js";

export type DragKind = "statement" | "expression";
export type DragEffect = "copy" | "move";
export type AnyDragModel = StatementDragModel | ExpressionDragModel;

interface SerializedDragPayload {
  kind: DragKind;
  effect: DragEffect;
  label: string;
  xml: string;
}

type DragModelDecoder = (data: TransferData<SerializedDragPayload>) => AnyDragModel;

const dragModelDecoders = new Map<string, DragModelDecoder>();

function registerDragMimeType(mimeType: string, decoder: DragModelDecoder): string {
  if (!dragModelDecoders.has(mimeType)) {
    dragModelDecoders.set(mimeType, decoder);
  }
  return mimeType;
}

function cloneDragNode<TNode extends Statement | Expression>(node: TNode): TNode {
  return decodeAstNode(encodeAstNode(node)) as TNode;
}

function decodeDragNode<TNode extends Statement | Expression>(data: TransferData<SerializedDragPayload>): TNode {
  return decodeAstNode(data.payload.xml) as TNode;
}

function describeExpression(expression: Expression): string {
  if (expression instanceof StringLiteral) {
    return JSON.stringify(expression.value);
  }
  if (expression instanceof FieldAccess) {
    return `${describeExpression(expression.target)}.${expression.memberName}`;
  }
  if (expression instanceof MethodInvocation) {
    const target = expression.target ? `${describeExpression(expression.target)}.` : "";
    return `${target}${expression.methodName}()`;
  }
  if (expression instanceof ThisExpression) {
    return "this";
  }
  if ("value" in expression && typeof expression.value !== "object") {
    return String(expression.value);
  }
  if ("name" in expression && typeof expression.name === "string") {
    return expression.name;
  }
  return expression.type;
}

function wouldCreateDescendantDrop(statement: Statement, targetList: StatementListModel): boolean {
  let current: StatementListModel | null = targetList;
  while (current) {
    if (current.parentStatement === statement) {
      return true;
    }
    current = current.parentList;
  }
  return false;
}

function typeLabel(typeRef: TypeRef | null): string {
  if (typeRef === null) {
    return "unknown";
  }
  if (typeRef.type === "SimpleTypeRef") {
    return `${typeRef.name}${typeRef.isArray ? "[]" : ""}`;
  }
  return typeRefName(typeRef) ?? typeRef.type;
}

export function getRegisteredDragMimeTypes(): string[] {
  return [...dragModelDecoders.keys()].sort();
}

export function deserializeDragModel(data: TransferData<SerializedDragPayload>): AnyDragModel | null {
  const decoder = dragModelDecoders.get(data.type);
  return decoder ? decoder(data) : null;
}

export abstract class DragModel<TNode extends Statement | Expression> {
  protected static registerMimeType(mimeType: string, decoder: DragModelDecoder): string {
    return registerDragMimeType(mimeType, decoder);
  }

  static isMimeTypeRegistered(mimeType: string): boolean {
    return dragModelDecoders.has(mimeType);
  }

  protected constructor(
    public readonly mimeType: string,
    public readonly node: TNode,
    public readonly label: string,
    public readonly effect: DragEffect = "copy",
  ) {}

  abstract readonly kind: DragKind;

  createTransferData(): TransferData<SerializedDragPayload> {
    return {
      type: this.mimeType,
      payload: {
        kind: this.kind,
        effect: this.effect,
        label: this.label,
        xml: encodeAstNode(this.node),
      },
    };
  }

  cloneNode(): TNode {
    return cloneDragNode(this.node);
  }

  matchesTransferData(data: TransferData<SerializedDragPayload>): boolean {
    return data.type === this.mimeType;
  }
}

export class StatementDragModel extends DragModel<Statement> {
  static readonly MIME_TYPE = DragModel.registerMimeType(
    "application/x-alice-statement",
    (data) => new StatementDragModel(decodeDragNode<Statement>(data), {
      label: data.payload.label,
      effect: data.payload.effect,
    }),
  );

  readonly kind = "statement" as const;
  readonly source: StatementListLocation | null;

  constructor(statement: Statement, options: { source?: StatementListLocation | null; label?: string; effect?: DragEffect } = {}) {
    super(
      StatementDragModel.MIME_TYPE,
      statement,
      options.label ?? summarizeStatement(statement),
      options.effect ?? (options.source ? "move" : "copy"),
    );
    this.source = options.source ?? null;
  }
}

export class ExpressionDragModel extends DragModel<Expression> {
  static readonly MIME_TYPE = DragModel.registerMimeType(
    "application/x-alice-expression",
    (data) => new ExpressionDragModel(decodeDragNode<Expression>(data), {
      label: data.payload.label,
      effect: data.payload.effect,
    }),
  );

  readonly kind = "expression" as const;

  constructor(expression: Expression, options: { label?: string; effect?: DragEffect } = {}) {
    super(
      ExpressionDragModel.MIME_TYPE,
      expression,
      options.label ?? describeExpression(expression),
      options.effect ?? "copy",
    );
  }

  getExpressionType(): TypeRef | null {
    return this.node.getType();
  }
}

export interface DragFeedback {
  targetId: string | null;
  state: "idle" | "valid" | "invalid";
  dropEffect: DragEffect | "none";
  message: string;
  previewClassName: "alice-drop-idle" | "alice-drop-valid" | "alice-drop-invalid";
}

export interface DropReceptor {
  readonly id: string;
  canAccept(model: AnyDragModel): boolean;
  getFeedback(model: AnyDragModel): DragFeedback;
  drop(model: AnyDragModel): boolean;
}

function idleFeedback(): DragFeedback {
  return {
    targetId: null,
    state: "idle",
    dropEffect: "none",
    message: "No active drag",
    previewClassName: "alice-drop-idle",
  };
}

function validFeedback(targetId: string, message: string, effect: DragEffect): DragFeedback {
  return {
    targetId,
    state: "valid",
    dropEffect: effect,
    message,
    previewClassName: "alice-drop-valid",
  };
}

function invalidFeedback(targetId: string, message: string): DragFeedback {
  return {
    targetId,
    state: "invalid",
    dropEffect: "none",
    message,
    previewClassName: "alice-drop-invalid",
  };
}

export class StatementListDropReceptor implements DropReceptor {
  constructor(
    private readonly editor: CodeEditor,
    public readonly target: StatementListLocation,
    public readonly id = `${target.list.role}@${target.index}`,
  ) {}

  canAccept(model: AnyDragModel): boolean {
    return model instanceof StatementDragModel && !this.wouldCreateInvalidDrop(model);
  }

  getFeedback(model: AnyDragModel): DragFeedback {
    if (!(model instanceof StatementDragModel)) {
      return invalidFeedback(this.id, "Only statements can be dropped into a statement list");
    }
    if (this.wouldCreateInvalidDrop(model)) {
      return invalidFeedback(this.id, "Statements cannot be dropped into one of their descendant bodies");
    }
    return validFeedback(this.id, `Insert ${model.label} at ${this.id}`, model.effect);
  }

  drop(model: AnyDragModel): boolean {
    if (!(model instanceof StatementDragModel) || this.wouldCreateInvalidDrop(model)) {
      return false;
    }
    if (model.source && model.effect === "move") {
      this.editor.moveStatement(model.source, this.target);
    } else {
      this.editor.insertStatement(this.target, model.cloneNode());
    }
    return true;
  }

  private wouldCreateInvalidDrop(model: StatementDragModel): boolean {
    try {
      const statement = model.source ? model.source.list.at(model.source.index) : model.node;
      return wouldCreateDescendantDrop(statement, this.target.list);
    } catch {
      return true;
    }
  }
}

export class ExpressionPropertyDropReceptor implements DropReceptor {
  constructor(
    private readonly property: ExpressionProperty,
    public readonly id = "expression-property",
  ) {}

  canAccept(model: AnyDragModel): boolean {
    return model instanceof ExpressionDragModel
      && typeRefsAssignable(this.property.getExpressionType(), model.getExpressionType());
  }

  getFeedback(model: AnyDragModel): DragFeedback {
    if (!(model instanceof ExpressionDragModel)) {
      return invalidFeedback(this.id, "Only expressions can be dropped into an expression slot");
    }
    if (!this.canAccept(model)) {
      return invalidFeedback(
        this.id,
        `Expected ${typeLabel(this.property.getExpressionType())} but received ${typeLabel(model.getExpressionType())}`,
      );
    }
    return validFeedback(this.id, `Set expression slot to ${model.label}`, model.effect);
  }

  drop(model: AnyDragModel): boolean {
    if (!(model instanceof ExpressionDragModel) || !this.canAccept(model)) {
      return false;
    }
    this.property.setValue(model.cloneNode());
    return true;
  }
}

export class DragFeedbackModel {
  private feedback: DragFeedback = idleFeedback();

  setFeedback(feedback: DragFeedback): DragFeedback {
    this.feedback = { ...feedback };
    return this.currentFeedback;
  }

  clear(): void {
    this.feedback = idleFeedback();
  }

  get currentFeedback(): DragFeedback {
    return { ...this.feedback };
  }
}

export class CodeDragController {
  private active: AnyDragModel | null = null;

  constructor(private readonly feedbackModel = new DragFeedbackModel()) {}

  beginDrag<TModel extends AnyDragModel>(model: TModel): TModel {
    this.active = model;
    this.feedbackModel.clear();
    return model;
  }

  hover(receptor: DropReceptor): DragFeedback {
    if (!this.active) {
      return this.feedbackModel.setFeedback(invalidFeedback(receptor.id, "No active drag"));
    }
    return this.feedbackModel.setFeedback(receptor.getFeedback(this.active));
  }

  drop(receptor: DropReceptor): boolean {
    if (!this.active) {
      return false;
    }
    const model = this.active;
    const feedback = receptor.getFeedback(model);
    this.feedbackModel.setFeedback(feedback);
    if (feedback.state !== "valid" || !receptor.drop(model)) {
      return false;
    }
    this.active = null;
    this.feedbackModel.clear();
    return true;
  }

  cancel(): void {
    this.active = null;
    this.feedbackModel.clear();
  }

  get activeModel(): AnyDragModel | null {
    return this.active;
  }

  get currentFeedback(): DragFeedback {
    return this.feedbackModel.currentFeedback;
  }
}
