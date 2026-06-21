import { expect, test } from "@playwright/test";

const GLB_BYTES = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("imports a model, applies a custom texture to a shape, and persists after reopen", async ({ page }, testInfo) => {
  await page.goto("/");

  const modelInput = page.getByTestId("alice-import-model-input");
  const textureInput = page.getByTestId("alice-import-texture-input");
  const createShape = page.getByTestId("alice-create-shape-button");
  const sceneObjects = page.getByTestId("alice-scene-object-list");
  const importedAssets = page.getByTestId("alice-imported-asset-list");
  const applyTexture = page.getByTestId("alice-apply-texture-button");
  const saveProject = page.getByTestId("alice-save-project-button");
  const openProject = page.getByTestId("alice-open-project-input");

  await expect(modelInput).toHaveAttribute("accept", /\.gltf.*\.glb|\.glb.*\.gltf/);
  await expect(textureInput).toHaveAttribute("accept", /\.png/);
  await expect(textureInput).toHaveAttribute("accept", /\.jpe?g/);
  await expect(textureInput).toHaveAttribute("accept", /\.webp/);

  await modelInput.setInputFiles({
    name: "Moon Rover.GLB",
    mimeType: "model/gltf-binary",
    buffer: GLB_BYTES,
  });
  await expect(importedAssets).toContainText("Moon Rover");
  await expect(importedAssets).toContainText("project/models/moon-rover.glb");

  await createShape.click();
  await expect(sceneObjects).toContainText(/box/i);
  await sceneObjects.getByText(/box/i).click();

  await textureInput.setInputFiles({
    name: "Checker.PNG",
    mimeType: "image/png",
    buffer: PNG_BYTES,
  });
  await expect(importedAssets).toContainText("Checker");
  await applyTexture.click();
  await expect(sceneObjects).toContainText("project/textures/checker.png");
  await expect(sceneObjects).toContainText(/surface/i);

  const download = page.waitForEvent("download");
  await saveProject.click();
  const savedProject = await download;
  const savedPath = testInfo.outputPath("asset-workflow.a3p");
  await savedProject.saveAs(savedPath);

  await page.reload();
  await openProject.setInputFiles(savedPath);

  await expect(importedAssets).toContainText("Moon Rover");
  await expect(importedAssets).toContainText("Checker");
  await expect(sceneObjects).toContainText("project/textures/checker.png");
  await expect(sceneObjects).toContainText(/surface/i);
});
