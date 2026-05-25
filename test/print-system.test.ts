import { describe, expect, it } from "vitest";
import {
  createPrintableDocument,
  exportAsStandalonePage,
  formatPrintableTweedleSource,
  printToHtml,
  printToText,
} from "../src/print-system.js";
import { parseTweedle } from "../src/tweedle-parser.js";

const SOURCE = `class Story {
  void narrate() {
    doInOrder {
      bunny.say("Hello <Alice>");
      // keep the scene readable
      bunny.think("Done");
    }
  }
}
`;

describe("print-system", () => {
  it("prints canonical Tweedle text from source", () => {
    const printed = printToText(SOURCE);

    expect(printed).toContain("class Story {");
    expect(printed).toContain("doInOrder {");
    expect(printed.endsWith("\n")).toBe(true);
  });

  it("formats AST input consistently", () => {
    const ast = parseTweedle(SOURCE);

    expect(formatPrintableTweedleSource(ast)).toBe(formatPrintableTweedleSource(SOURCE));
  });

  it("renders styled HTML with escaped Tweedle source", () => {
    const html = printToHtml(SOURCE, { title: "Printable Story", theme: "dark" });

    expect(html).toContain("alice-print--dark");
    expect(html).toContain("Printable Story");
    expect(html).toContain("alice-print__line-number\">1<");
    expect(html).toContain("&lt;Alice&gt;");
    expect(html).toContain("alice-print__keyword");
    expect(html).toContain("alice-print__comment");
  });

  it("exports a standalone printable page", () => {
    const page = exportAsStandalonePage(SOURCE, { includeLineNumbers: false });

    expect(page).toContain("<!DOCTYPE html>");
    expect(page).toContain("<style>");
    expect(page).toContain("Tweedle source");
    expect(page).toContain("alice-print-block");
  });

  it("creates bundled printable artifacts", () => {
    const document = createPrintableDocument(SOURCE);

    expect(document.title).toBe("Story — Printable Tweedle");
    expect(document.text).toContain("bunny.say");
    expect(document.html).toContain("alice-print");
    expect(document.standalonePage).toContain("<!DOCTYPE html>");
  });
});
