import { describe, expect, it } from "vitest";
import {
  ColorPicker,
  ConfirmDialog,
  CustomExpressionCreator,
  DialogManager,
  FileDialog,
  InputDialog,
} from "../src/dialog-system.js";

describe("dialog-system", () => {
  it("tracks modal and modeless dialog lifecycles", () => {
    const manager = new DialogManager();
    const modal = new InputDialog("rename", "Rename", "text").asManagedDialog();
    const modeless = new FileDialog("save", "Save", "save", [".a3p"], ".a3p").asManagedDialog();

    manager.open(modal);
    manager.open(modeless);

    expect(manager.hasBlockingModal()).toBe(true);
    expect(manager.activeModal()?.id).toBe("rename");
    expect(manager.listOpen().map((dialog) => dialog.id)).toEqual(["rename", "save"]);

    expect(manager.close("rename", "Rabbit")).toMatchObject({ open: false, value: "Rabbit" });
    expect(manager.hasBlockingModal()).toBe(false);
    expect(manager.close("missing")).toBeNull();
  });

  it("validates text, number, and combo inputs", () => {
    const text = new InputDialog("name", "Name", "text");
    const number = new InputDialog("distance", "Distance", "number", { min: 1, max: 5 });
    const combo = new InputDialog("pose", "Pose", "combo", { choices: ["idle", "wave"] });

    expect(text.submit("Rabbit")).toEqual({ accepted: true, value: "Rabbit", reason: null });
    expect(text.submit(" ")).toEqual({ accepted: false, value: null, reason: "text input is required" });
    expect(number.submit("3")).toEqual({ accepted: true, value: 3, reason: null });
    expect(number.submit("9")).toEqual({ accepted: false, value: null, reason: "number input must be <= 5" });
    expect(combo.submit("wave")).toEqual({ accepted: true, value: "wave", reason: null });
    expect(combo.submit("jump").reason).toMatch(/combo input must be one of/);
  });

  it("resolves confirmations and validates file selections", () => {
    const confirm = new ConfirmDialog("delete", "Delete project", false);
    const fileDialog = new FileDialog("save", "Save", "save", [".a3p"], ".a3p");
    const openDialog = new FileDialog("open", "Open", "open", [".a3p"]);

    expect(confirm.resolve("yes")).toBe("yes");
    expect(() => confirm.resolve("cancel")).toThrow(/cancel is not allowed/);
    expect(fileDialog.pick("lesson1")).toBe("lesson1.a3p");
    expect(openDialog.pick("scene.a3p")).toBe("scene.a3p");
    expect(() => openDialog.pick("scene.zip")).toThrow(/must end with one of/);
  });

  it("normalizes colors and builds expressions from tokens", () => {
    const picker = new ColorPicker(["#00ff00"]);
    const expression = new CustomExpressionCreator()
      .addIdentifier("score")
      .addOperator(">")
      .addLiteral(3)
      .addOperator("&&")
      .addGroup("lives > 0");

    expect(picker.pick("ff00ff")).toBe("#FF00FF");
    expect(picker.listPresets()).toEqual(["#000000", "#00FF00", "#FF00FF", "#FFFFFF"]);
    expect(expression.listTokens().map((token) => token.kind)).toEqual([
      "identifier",
      "operator",
      "literal",
      "operator",
      "group",
    ]);
    expect(expression.build()).toBe("score > 3 && (lives > 0)");
  });
});
