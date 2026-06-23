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

function expectFunctionContains(source: string, functionName: string, expected: string): void {
  const start = source.indexOf(`function ${functionName}`);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  const body = source.slice(start, nextFunction === -1 ? undefined : nextFunction);
  expect(body, `${functionName} should contain ${expected}`).toContain(expected);
}

describe("Alice browser workflow UI contract", () => {
  it("exposes controls for project, model, texture, camera, joint, evidence, export, and share steps", () => {
    const html = readText("src/index.html");
    expect(html).toContain("Alice 3 Web Viewer");
    expect(html).not.toContain(["Looking", "Glass"].join(""));
    expectElement(html, "file-input");
    expectElement(html, "model-file-input");
    expectElement(html, "texture-file-input");
    expectElement(html, "assign-texture-button");
    expectElement(html, "move-selected-object-button");
    expectElement(html, "turn-selected-object-button");
    expectElement(html, "resize-selected-object-button");
    expectElement(html, "camera-panel");
    expectElement(html, "joint-panel");
    expectElement(html, "joint-object-select");
    expectElement(html, "joint-pose-name");
    expectElement(html, "joint-apply-pose");
    expectElement(html, "evidence-panel");
    expectElement(html, "capture-evidence-button");
    expectElement(html, "export-evidence-button");
    expectElement(html, "share-evidence-button");
    expectElement(html, "evidence-status");
    expectElement(html, "evidence-summary");
    expectElement(html, "evidence-capture-list");
    expectElement(html, "export-a3p-button");
    expectElement(html, "export-web-package-button");
    expectElement(html, "share-web-package-button");
    expect(html).toContain("Alice evidence");
    expect(html).toContain("Capture visible behavior");
    expect(html).toContain("Export evidence");
    expect(html).toContain("Share evidence");
    expect(html).toContain('data-testid="alice-evidence-capture-button"');
    expect(html).toContain('data-testid="alice-evidence-export-button"');
    expect(html).toContain('data-testid="alice-evidence-share-button"');
    expect(html).toContain('data-testid="alice-evidence-status"');
    expect(html).toContain('data-testid="alice-evidence-summary"');
    expect(html).toContain('data-alice-evidence-status="empty"');
    expect(html).toContain('data-testid="alice-evidence-capture-list"');
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
      "move-selected-object-button",
      "turn-selected-object-button",
      "resize-selected-object-button",
      "joint-object-select",
      "joint-pose-name",
      "joint-apply-pose",
      "capture-evidence-button",
      "export-evidence-button",
      "share-evidence-button",
      "evidence-status",
      "evidence-summary",
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
    expect(main).toContain("alice-evidence-artifact");
    expect(main).toContain("createAliceEvidenceArtifact");
    expect(main).toContain("serializeAliceEvidenceArtifact");
    expect(main).toContain("validateAliceEvidenceArtifact");
    expect(main).toContain("navigator.share");
  });

  it("exposes Alice selected object transform controls", () => {
    const html = readText("src/index.html");

    expectElement(html, "move-selected-object-button");
    expectElement(html, "turn-selected-object-button");
    expectElement(html, "resize-selected-object-button");
    expect(html).toContain('data-testid="alice-move-selected-object-button"');
    expect(html).toContain('data-testid="alice-turn-selected-object-button"');
    expect(html).toContain('data-testid="alice-resize-selected-object-button"');
    expect(html).toContain("Move selected object");
    expect(html).toContain("Turn selected object");
    expect(html).toContain("Resize selected object");
  });

  it("wires transform controls to scene-model actions", () => {
    const main = readText("src/main.ts");

    for (const id of [
      "move-selected-object-button",
      "turn-selected-object-button",
      "resize-selected-object-button",
    ]) {
      expect(main, `src/main.ts must bind #${id}`).toContain(`requireElement("${id}"`);
    }

    expect(main).toContain("handleMoveSelectedObject");
    expect(main).toContain("handleTurnSelectedObject");
    expect(main).toContain("handleResizeSelectedObject");
    expect(main).toContain("renderProject(project)");
  });

  it("invalidates cached web packages after project mutations before share", () => {
    const main = readText("src/main.ts");

    expectFunctionContains(main, "updateCameraWorkflow", "markProjectChanged();");
    expectFunctionContains(main, "updateAliceWorkflow", "markProjectChanged();");
    expectFunctionContains(main, "handleClassBehaviorImport", "markProjectChanged();");
    expectFunctionContains(main, "handleRunWorld", "markProjectChanged();");
    expectFunctionContains(main, "exportWebPackage", "lastWebPackageBase64 = exported.package.base64");
    expectFunctionContains(main, "generateShareArtifacts", "if (!lastWebPackageBase64)");
  });

  it("exports browser-only camera and joint state with the current archive", () => {
    const main = readText("src/main.ts");

    expectFunctionContains(main, "currentExportProject", "cameraWorkflow,");
    expectFunctionContains(main, "currentExportProject", "jointState.toJSON()");
    expectFunctionContains(main, "currentExportArchive", "project: currentExportProject(archive)");
    expectFunctionContains(main, "exportWebPackage", "currentExportArchive()");
  });

  it("hydrates project load state before later export/share operations", () => {
    const main = readText("src/main.ts");

    expectFunctionContains(main, "handleFileSelection", "cameraWorkflow = archive.project.cameraWorkflow ?? createDefaultCameraWorkflowState();");
    expectFunctionContains(main, "handleFileSelection", "jointState = new JointSystem.JointStateStore();");
    expectFunctionContains(main, "currentExportProject", "archive.project.jointState?.objects ?? {}");
  });
});
