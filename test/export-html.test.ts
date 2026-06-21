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

function createPlayerDocument(project = createProjectFixture()) {
  return createHtmlExportDocument(project, {
    title: "Winter Story",
    runtimeIdentity: "alice-web-player",
    packageName: "alice-web",
    metadata: {
      description: "A snow scene with a bunny.",
      canonicalUrl: "https://example.edu/alice/winter-story",
      preview: "preview.png",
    },
  } as Parameters<typeof createHtmlExportDocument>[1]) as ReturnType<typeof createHtmlExportDocument> & {
    schemaVersion?: string;
    packageName?: string;
    runtimeIdentity?: string;
    entrypoint?: string;
  };
}

describe("export-html", () => {
  it("creates a self-contained standalone HTML export with embedded project payloads", () => {
    const project = createProjectFixture();

    const html = exportProjectToHtml(project);
    const dom = new JSDOM(html);
    const { document } = dom.window;

    expect(document.title).toBe("Preview Demo — Alice HTML Export");
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

  it("declares the alice-web player runtime contract with controls and window.AlicePlayer", () => {
    const document = createPlayerDocument();
    const dom = new JSDOM(document.html);
    const { window } = dom;
    const { document: html } = window;

    expect(document).toMatchObject({
      schemaVersion: "alice-web.player-document/v1",
      packageName: "alice-web",
      runtimeIdentity: "alice-web-player",
      entrypoint: "index.html",
    });
    expect(html.querySelector("meta[name='alice-product']")?.getAttribute("content")).toBe("Alice");
    expect(html.querySelector("meta[name='alice-package']")?.getAttribute("content")).toBe("alice-web");
    expect(html.querySelector("meta[name='alice-runtime']")?.getAttribute("content")).toBe("alice-web-player");
    expect(html.querySelector("[data-alice-player]")).not.toBeNull();
    expect(html.querySelector("[data-alice-player-status]")).not.toBeNull();
    expect(html.querySelector("[data-alice-player-action='play']")).not.toBeNull();
    expect(html.querySelector("[data-alice-player-action='pause']")).not.toBeNull();
    expect(html.querySelector("[data-alice-player-action='reset']")).not.toBeNull();
    expect(document.html).toContain("window.AlicePlayer");
    expect(document.html).toContain("alice-web-player");
    expect(document.html).not.toMatch(/LookingGlass|lookingglass|alice-standalone-player/);
  });

  it("embeds project, runtime, share, and preview metadata safely for local playback", () => {
    const project = createProjectFixture();
    project.projectName = "Safe </script><img src=x onerror=alert(1)>";

    const document = createPlayerDocument(project);
    const dom = new JSDOM(document.html);
    const html = dom.window.document;
    const projectScript = html.getElementById("alice-project-data");
    const runtimeScript = html.getElementById("alice-player-runtime");
    const shareScript = html.getElementById("alice-share-metadata");

    expect(projectScript?.getAttribute("type")).toBe("application/json");
    expect(runtimeScript?.getAttribute("type")).toBe("application/json");
    expect(shareScript?.getAttribute("type")).toBe("application/json");
    expect(projectScript?.textContent).toContain("Safe");
    expect(projectScript?.textContent).toContain("\\u003c/script");
    expect(document.html).not.toContain("</script><img src=x onerror=alert(1)>");

    const runtime = JSON.parse(runtimeScript?.textContent ?? "{}") as Record<string, unknown>;
    expect(runtime).toMatchObject({
      schemaVersion: "alice-web.player-runtime/v1",
      product: "Alice",
      packageName: "alice-web",
      runtimeIdentity: "alice-web-player",
      entrypoint: "index.html",
    });

    const share = JSON.parse(shareScript?.textContent ?? "{}") as Record<string, unknown>;
    expect(share).toMatchObject({
      schemaVersion: "alice-web.share/v1",
      product: "Alice",
      runtimeIdentity: "alice-web-player",
      title: "Winter Story",
      description: "A snow scene with a bunny.",
      canonicalUrl: "https://example.edu/alice/winter-story",
      preview: "preview.png",
    });
  });
});
