import { describe, expect, it } from "vitest";
import {
  BooleanLiteral,
  CommentStatement,
  ConditionalStatement,
  ExpressionProperty,
  ExpressionStatement,
  IntegerLiteral,
  MethodDeclaration,
  ReturnStatement,
  StringLiteral,
  simpleTypeRef,
} from "../src/ast-nodes.js";
import {
  CodeDragController,
  DragModel,
  ExpressionDragModel,
  ExpressionPropertyDropReceptor,
  StatementDragModel,
  StatementListDropReceptor,
  deserializeDragModel,
  getRegisteredDragMimeTypes,
} from "../src/ast-draganddrop.js";
import { CodeEditor } from "../src/code-editor.js";

function createMethod(): MethodDeclaration {
  return new MethodDeclaration(
    "demo",
    { type: "VoidTypeRef" },
    [],
    [
      new CommentStatement("top"),
      new ConditionalStatement(
        new BooleanLiteral(true),
        [new ExpressionStatement(new StringLiteral("hello"))],
        [new ReturnStatement(null)],
      ),
    ],
    false,
  );
}

describe("ast-draganddrop", () => {
  it("registers MIME types and round-trips serialized drag payloads", () => {
    expect(DragModel.isMimeTypeRegistered(StatementDragModel.MIME_TYPE)).toBe(true);
    expect(DragModel.isMimeTypeRegistered(ExpressionDragModel.MIME_TYPE)).toBe(true);
    expect(getRegisteredDragMimeTypes()).toEqual(
      expect.arrayContaining([StatementDragModel.MIME_TYPE, ExpressionDragModel.MIME_TYPE]),
    );

    const restored = deserializeDragModel(new StatementDragModel(new CommentStatement("wave")).createTransferData());
    expect(restored).toBeInstanceOf(StatementDragModel);
    expect((restored as StatementDragModel).label).toBe("// wave");
    expect(((restored as StatementDragModel).node as CommentStatement).text).toBe("wave");
  });

  it("moves statement drag models into compatible drop receptors and clears feedback after drop", () => {
    const editor = new CodeEditor(createMethod());
    const conditional = editor.rootList.at(1) as ConditionalStatement;
    const ifList = editor.getStatementLists().find((list) => list.parentStatement === conditional && list.role === "if")!;
    const controller = new CodeDragController();
    const receptor = new StatementListDropReceptor(editor, { list: ifList, index: 1 }, "if@1");

    controller.beginDrag(new StatementDragModel(editor.rootList.at(0), {
      source: { list: editor.rootList, index: 0 },
    }));

    expect(controller.hover(receptor)).toMatchObject({
      targetId: "if@1",
      state: "valid",
      dropEffect: "move",
      previewClassName: "alice-drop-valid",
    });
    expect(controller.drop(receptor)).toBe(true);
    expect(editor.rootList.length).toBe(1);
    expect(ifList.list().map((statement) => statement.type)).toEqual([
      "ExpressionStatement",
      "Comment",
    ]);
    expect(controller.currentFeedback).toMatchObject({
      state: "idle",
      previewClassName: "alice-drop-idle",
    });
  });

  it("rejects statement drops into descendant bodies with invalid feedback", () => {
    const editor = new CodeEditor(createMethod());
    const conditional = editor.rootList.at(1) as ConditionalStatement;
    const ifList = editor.getStatementLists().find((list) => list.parentStatement === conditional && list.role === "if")!;
    const controller = new CodeDragController();
    const receptor = new StatementListDropReceptor(editor, { list: ifList, index: 0 }, "if@0");

    controller.beginDrag(new StatementDragModel(conditional, {
      source: { list: editor.rootList, index: 1 },
    }));

    expect(controller.hover(receptor)).toMatchObject({
      targetId: "if@0",
      state: "invalid",
      previewClassName: "alice-drop-invalid",
    });
    expect(controller.currentFeedback.message).toMatch(/descendant bodies/);
    expect(controller.drop(receptor)).toBe(false);
  });

  it("type-checks expression drop receptors and attaches dropped expressions to the owner", () => {
    const owner = new ExpressionStatement(new StringLiteral("placeholder"));
    const property = new ExpressionProperty(owner, () => simpleTypeRef("String"), null);
    const receptor = new ExpressionPropertyDropReceptor(property, "expression-slot");
    const controller = new CodeDragController();

    controller.beginDrag(new ExpressionDragModel(new IntegerLiteral(1)));
    expect(controller.hover(receptor)).toMatchObject({
      targetId: "expression-slot",
      state: "invalid",
      previewClassName: "alice-drop-invalid",
    });
    expect(controller.currentFeedback.message).toMatch(/Expected String but received WholeNumber/);
    expect(controller.drop(receptor)).toBe(false);

    controller.beginDrag(new ExpressionDragModel(new StringLiteral("updated")));
    expect(controller.hover(receptor)).toMatchObject({
      targetId: "expression-slot",
      state: "valid",
      previewClassName: "alice-drop-valid",
    });
    expect(controller.drop(receptor)).toBe(true);
    expect(property.getValue()).toBeInstanceOf(StringLiteral);
    expect((property.getValue() as StringLiteral).value).toBe("updated");
    expect(property.getValue()?.parent).toBe(owner);
  });
});
