import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  buildEmbeddedTweedleSource,
  createHtmlExportDocument,
  exportProjectToHtml,
} from "../src/export-html.js";
import { createMinimalProject } from "./test-utils.js";

function createProjectFixture() {
  const project = createMinimalProject();
  project.projectName = "Preview Demo";
  project.sceneObjects.push(
    {
      name: "bunny",
      typeName: "org.lgna.story.SBiped",
      resourceType: null,
      position: { x: 1, y: 0, z: -2 },
      orientation: null,
      size: { width: 1.2, height: 2, depth: 1.1 },
    },
    {
      name: "tree",
      typeName: "org.lgna.story.SProp",
      resourceType: "org.lgna.story.resources.prop.TreeResource",
      position: { x: -2, y: 0, z: 1 },
      orientation: null,
      size: { width: 1.5, height: 3.2, depth: 1.5 },
    },
  );
  project.methods.push({
    name: "myFirstMethod",
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: [
      {
        kind: "MethodCall",
        object: "bunny",
        method: "jump",
        arguments: ["2"],
      },
    ],
  });
  return project;
}

describe("export-html", () => {
  it("creates a self-contained standalone HTML export with embedded project payloads", () => {
    const project = createProjectFixture();

    const html = exportProjectToHtml(project);
    const dom = new JSDOM(html);
    const { document } = dom.window;

    expect(document.title).toBe("Preview Demo — LookingGlass HTML Export");
    expect(document.body.dataset.previewMode).toBe("false");
    expect(document.querySelector("[data-alice-scene]")).not.toBeNull();
    expect(document.querySelectorAll("script[src], link[rel='stylesheet']")).toHaveLength(0);
    expect(document.getElementById("alice-project-data")?.textContent).toContain("\"sceneObjects\"");
    expect(document.getElementById("alice-tweedle-source")?.textContent).toContain("myFirstMethod");
    expect(document.getElementById("alice-embedded-three-source")?.textContent?.length ?? 0).toBeGreaterThan(50_000);
    expect(html).toContain("new THREE.WebGLRenderer");
  });

  it("supports preview mode, explicit viewport sizing, and caller-provided Tweedle source", () => {
    const project = createProjectFixture();

    const document = createHtmlExportDocument(project, {
      previewMode: true,
      viewport: { width: 800, height: 450 },
      tweedleSource: "class CustomPreview {\n}",
    });
    const dom = new JSDOM(document.html);
    const { body } = dom.window.document;

    expect(document.previewMode).toBe(true);
    expect(document.tweedleSource).toBe("class CustomPreview {\n}");
    expect(body.dataset.previewMode).toBe("true");
    expect(body.getAttribute("style")).toContain("--alice-export-width:800px");
    expect(body.getAttribute("style")).toContain("--alice-export-height:450px");
    expect(dom.window.document.getElementById("alice-tweedle-source")?.textContent).toContain("CustomPreview");
  });

  it("builds fallback Tweedle source from scene metadata when no methods are available", () => {
    const project = createMinimalProject();
    project.projectName = "Scene Only";
    project.methods = [];
    project.sceneObjects.push({
      name: "bunny",
      typeName: "org.lgna.story.SBiped",
      resourceType: null,
      position: { x: 0, y: 0, z: 0 },
      orientation: null,
      size: { width: 1, height: 2, depth: 1 },
    });

    const tweedleSource = buildEmbeddedTweedleSource(project);

    expect(tweedleSource).toContain("class Scene_Only");
    expect(tweedleSource).toContain("void initializeScene()");
    expect(tweedleSource).toContain("// scene includes bunny : org.lgna.story.SBiped");
  });
});
