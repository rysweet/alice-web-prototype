import { describe, expect, it } from "vitest";
import {
  CompletionFilter,
  CompletionItem,
  CompletionProvider,
  CompletionRanker,
  ParameterHint,
  QuickFix,
} from "../src/code-completion.js";

describe("code-completion", () => {
  const items = [
    new CompletionItem("move", "move", "method", "Void", "member"),
    new CompletionItem("moveAndOrient", "moveAndOrient", "method", "Void", "member"),
    new CompletionItem("mouse", "mouse", "field", "Mouse", "global"),
    new CompletionItem("score", "score", "variable", "WholeNumber", "local"),
    new CompletionItem("secretPose", "secretPose", "field", "Pose", "member", "private"),
  ];

  it("filters completions by type, scope, and visibility", () => {
    const filter = new CompletionFilter();

    expect(filter.apply(items, { scope: "member" }).map((item) => item.label)).toEqual([
      "move",
      "moveAndOrient",
      "mouse",
    ]);
    expect(filter.apply(items, { expectedType: "WholeNumber", allowPrivate: true }).map((item) => item.label)).toEqual([
      "score",
    ]);
  });

  it("ranks exact and prefix matches ahead of weaker candidates", () => {
    const ranker = new CompletionRanker();
    const ranked = ranker.rank(items, "mo", ["method"]);

    expect(ranked.slice(0, 3).map((item) => item.label)).toEqual([
      "move",
      "moveAndOrient",
      "mouse",
    ]);
  });

  it("provides ranked suggestions from the current context", () => {
    const provider = new CompletionProvider(items);
    provider.register(new CompletionItem("model", "model", "variable", "Model", "local"));

    expect(provider.suggest({ prefix: "mo", scope: "member", preferredKinds: ["method"] }).map((item) => item.label)).toEqual([
      "move",
      "moveAndOrient",
      "mouse",
    ]);
    expect(provider.suggest({ prefix: "sc", expectedType: "WholeNumber", scope: "local" }).map((item) => item.label)).toEqual([
      "score",
    ]);
  });

  it("formats parameter hints and suggests quick fixes", () => {
    const hint = new ParameterHint("move", [
      { name: "direction", type: "Direction" },
      { name: "distance", type: "Number" },
    ]);

    expect(hint.format(1)).toBe("move(direction: Direction, [distance: Number])");
    expect(QuickFix.suggest("Cannot find name hero")).toEqual([
      { title: "Declare variable", replacement: "let missingName = value;" },
    ]);
    expect(QuickFix.suggest("Missing semicolon after statement")).toEqual([
      { title: "Insert semicolon", replacement: ";" },
    ]);
    expect(QuickFix.suggest("Type mismatch between text and number")).toEqual([
      { title: "Convert value", replacement: "String(value)" },
    ]);
  });
});
