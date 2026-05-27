import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createMinimalProject } from "./test-utils.js";
import {
  A3PExporter,
  HTMLExporter,
  ProjectPackager,
  ScreenshotCapture,
  VideoExporter,
} from "../src/project-export.js";

function createProjectFixture() {
  const project = createMinimalProject();
  project.projectName = "Round 84 Demo";
  project.sceneObjects.push({
    name: "bunny",
    typeName: "org.lgna.story.SBiped",
    resourceType: null,
    position: { x: 0, y: 0, z: 0 },
    orientation: null,
    size: { width: 1, height: 2, depth: 1 },
  });
  project.methods.push({
    name: "myFirstMethod",
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: [{ kind: "MethodCall", object: "bunny", method: "jump", arguments: ["1"] }],
  });
  return project;
}

describe("project-export", () => {
  it("A3PExporter writes a valid .a3p archive", async () => {
    const project = createProjectFixture();
    const bytes = await new A3PExporter().export(project);
    const zip = await JSZip.loadAsync(bytes);

    expect(await zip.file("version.txt")?.async("string")).toBe(project.version);
    expect(await zip.file("programType.xml")?.async("string")).toContain("Round 84 Demo");
  });

  it("HTMLExporter injects resource payloads as embedded data URLs", async () => {
    const project = createProjectFixture();
    const html = await new HTMLExporter().export(project, {
      resources: [{ path: "assets/info.txt", bytes: "embedded", mimeType: "text/plain" }],
    });

    expect(html.title).toContain("Round 84 Demo");
    expect(html.embeddedResources["assets/info.txt"]).toContain("data:text/plain");
    expect(html.html).toContain("alice-export-resources");
    expect(html.html).toContain("embedded");
  });

  it("ScreenshotCapture produces PNG output using the requested dimensions", async () => {
    const capture = await new ScreenshotCapture().capture({ width: 320, height: 180, label: "Frame 1" });

    expect(capture.mimeType).toBe("image/png");
    expect(capture.width).toBe(320);
    expect(capture.height).toBe(180);
    expect(Array.from(capture.bytes.slice(0, 4))).toEqual([137, 80, 78, 71]);
  });

  it("VideoExporter records timestamped frame captures", async () => {
    const video = await new VideoExporter().record(createProjectFixture(), {
      frameCount: 3,
      fps: 2,
      width: 64,
      height: 64,
    });

    expect(video.fps).toBe(2);
    expect(video.frames).toHaveLength(3);
    expect(video.frames.map((frame) => frame.timestampMs)).toEqual([0, 500, 1000]);
    expect(video.frames.every((frame) => frame.bytes.length > 0)).toBe(true);
  });

  it("ProjectPackager bundles project archives, HTML, thumbnail, resources, and manifest", async () => {
    const packaged = await new ProjectPackager().packageProject(createProjectFixture(), {
      resources: [{ path: "assets/readme.txt", bytes: "hello", mimeType: "text/plain" }],
      dependencies: ["three", "jszip", "three"],
      thumbnail: { width: 48, height: 48, label: "thumb" },
    });
    const zip = await JSZip.loadAsync(packaged.archive);

    expect(packaged.manifest.dependencies).toEqual(["jszip", "three"]);
    expect(packaged.entryNames).toContain("manifest.json");
    expect(packaged.entryNames).toContain("thumbnail.png");
    expect(await zip.file("round-84-demo.a3p")?.async("uint8array")).toBeTruthy();
    expect(await zip.file("round-84-demo.html")?.async("string")).toContain("Round 84 Demo");
    expect(await zip.file("assets/readme.txt")?.async("string")).toBe("hello");
  });
});
