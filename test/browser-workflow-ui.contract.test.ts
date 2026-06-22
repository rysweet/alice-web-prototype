import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = path.resolve(__dirname, "..");

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8");
}

function expectElement(html: string, id: string): void {
  expect(html, `src/index.html must define #${id}`).toContain(`id="${id}"`);
}

describe("Alice browser workflow UI contract", () => {
  it("exposes controls for project, model, texture, camera, joint, export, and share steps", () => {
    const html = readText("src/index.html");

    expect(html).toContain("Alice 3 Web Viewer");
    expect(html).not.toContain(["Looking", "Glass"].join(""));
    expectElement(html, "file-input");
    expectElement(html, "model-file-input");
    expectElement(html, "texture-file-input");
    expectElement(html, "assign-texture-button");
    expectElement(html, "camera-panel");
    expectElement(html, "joint-panel");
    expectElement(html, "joint-object-select");
    expectElement(html, "joint-pose-name");
    expectElement(html, "joint-apply-pose");
    expectElement(html, "export-a3p-button");
    expectElement(html, "export-web-package-button");
    expectElement(html, "share-web-package-button");
    expect(html).toContain('accept=".a3p"');
    expect(html).toContain(".glb");
    expect(html).toContain(".gltf");
    expect(html).toContain(".png");
    expect(html).toContain(".jpg");
    expect(html).toContain(".jpeg");
    expect(html).toContain(".webp");
  });

  it("exposes Alice workflow authoring and structured run inspection controls", () => {
    const html = readText("src/index.html");
    const main = readText("src/main.ts");

    expectElement(html, "workflow-source");
    expectElement(html, "run-workflow-button");
    expect(html).toContain('data-testid="alice-workflow-source"');
    expect(html).toContain('data-testid="alice-run-workflow-button"');
    expect(main).toContain('requireElement("workflow-source"');
    expect(main).toContain('requireElement("run-workflow-button"');
    expect(main).toContain("window.aliceWeb");
    expect(main).toContain("latestRunResult");
  });

  it("wires UI controls through the shared TypeScript workflow modules", () => {
    const main = readText("src/main.ts");

    for (const id of [
      "model-file-input",
      "texture-file-input",
      "assign-texture-button",
      "joint-object-select",
      "joint-pose-name",
      "joint-apply-pose",
      "export-a3p-button",
      "export-web-package-button",
      "share-web-package-button",
    ]) {
      expect(main, `src/main.ts must bind #${id}`).toContain(`requireElement("${id}"`);
    }

    expect(main).toContain("ModelTextureCameraJointExportWorkflow");
    expect(main).toContain("ProjectIo");
    expect(main).toContain("ProjectExport");
    expect(main).toContain("JointSystem");
    expect(main).toContain("importModelAsset");
    expect(main).toContain("importTextureAsset");
    expect(main).toContain("assignTextureToModel");
    expect(main).toContain("exportWebPackage");
    expect(main).toContain("generateShareArtifacts");
  });
});
