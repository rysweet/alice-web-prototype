import { describe, expect, it } from "vitest";
import { APIDocGenerator, DocSearch, DocViewer } from "../src/api-documentation.js";
import { TweedleCompiler } from "../src/tweedle-compiler.js";

function compileDocsSource() {
  const unit = new TweedleCompiler().compile(`class Hero extends Character {
  String name <- "Hero";

  void greet(String target) {
    this.say("Hello");
  }

  WholeNumber score() {
    return 1;
  }
}`);
  expect(unit.errors).toEqual([]);
  return unit;
}

describe("api-documentation", () => {
  it("generates class and method documentation from compilation units", () => {
    const docs = new APIDocGenerator().generate([compileDocsSource()]);

    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("Hero");
    expect(docs[0].inheritance).toEqual(["Hero", "Character"]);
    expect(docs[0].properties[0]).toMatchObject({ name: "name", type: "String" });
    expect(docs[0].methods.map((method) => method.name)).toEqual(expect.arrayContaining(["greet", "score"]));
    expect(docs[0].methods.find((method) => method.name === "score")?.returnType).toBe("WholeNumber");
  });

  it("searches generated documentation by keyword", () => {
    const docs = new APIDocGenerator().generate([compileDocsSource()]);
    const search = new DocSearch(docs);

    const hits = search.search("score");

    expect(hits).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "method", className: "Hero", name: "score" }),
    ]));
  });

  it("renders documentation as HTML", () => {
    const docs = new APIDocGenerator().generate([compileDocsSource()]);
    const html = new DocViewer().render(docs);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<section class=\"class-doc\">");
    expect(html).toContain("Hero");
    expect(html).toContain("Inheritance:");
  });

  it("escapes HTML-sensitive content in the viewer", () => {
    const html = new DocViewer().render([{
      name: "<Hero>",
      description: "<unsafe>",
      methods: [],
      properties: [],
      inheritance: ["<Hero>"],
    }]);

    expect(html).toContain("&lt;Hero&gt;");
    expect(html).toContain("&lt;unsafe&gt;");
  });
});
