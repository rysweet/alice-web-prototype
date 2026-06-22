import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface TransformState {
  position: { x: number; y: number; z: number } | null;
  orientation: { x: number; y: number; z: number; w: number } | null;
  size: { width: number; height: number; depth: number } | null;
}

test("creates, transforms, saves, reopens, and preserves selected object scene state", async ({ page }) => {
  await page.goto("/");

  await page.getByTestId("alice-create-shape-button").click();
  await expect(page.locator("#status")).toHaveText(/Created box/);

  await expect(page.getByTestId("alice-scene-object-list")).toContainText("box");

  await page.getByTestId("alice-move-selected-object-button").click();
  await expect(page.locator("#status")).toHaveText(/Moved box/);

  await page.getByTestId("alice-turn-selected-object-button").click();
  await expect(page.locator("#status")).toHaveText(/Turned box/);

  await page.getByTestId("alice-resize-selected-object-button").click();
  await expect(page.locator("#status")).toHaveText(/Resized box/);

  await expectSceneObjectTransform(page, "box");

  const expectedTransform: TransformState = {
    position: { x: 1, y: 0, z: 0 },
    orientation: { x: 0, y: 0.13052619222005157, z: 0, w: 0.9914448613738104 },
    size: { width: 1.2, height: 1.2, depth: 1.2 },
  };

  const savedPath = await saveProject(page);
  await expect.poll(async () => savedTransformEvidence(savedPath, "box", expectedTransform)).toBe(true);

  await page.reload();
  await page.getByTestId("alice-open-project-input").setInputFiles(savedPath);
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("box");
  await expectSceneObjectTransform(page, "box");

  const reopenedPath = await saveProject(page);
  await expect.poll(async () => savedTransformEvidence(reopenedPath, "box", expectedTransform)).toBe(true);
});

async function expectSceneObjectTransform(page: Page, objectName: string): Promise<void> {
  const objectItem = page.getByTestId("alice-scene-object-list")
    .getByRole("listitem")
    .filter({ hasText: objectName });
  await expect(objectItem).toContainText("position: 1, 0, 0");
  await expect(objectItem).toContainText("orientation: 0, 0.13052619222, 0, 0.991444861374");
  await expect(objectItem).toContainText("size: 1.2, 1.2, 1.2");
}

async function saveProject(page: Page): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("alice-save-project-button").click();
  const download = await downloadPromise;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "alice-web-transform-"));
  const savedPath = path.join(tempDir, "saved.a3p");
  await download.saveAs(savedPath);
  return savedPath;
}

async function savedTransformEvidence(
  filePath: string,
  objectName: string,
  expected: TransformState,
): Promise<boolean> {
  const xml = await readProjectXml(filePath);
  return [
    objectName,
    "setPositionRelativeToVehicle",
    "setOrientationRelativeToVehicle",
    "setSize",
    expected.position?.x,
    expected.position?.y,
    expected.position?.z,
    expected.orientation?.x,
    expected.orientation?.y,
    expected.orientation?.z,
    expected.orientation?.w,
    expected.size?.width,
    expected.size?.height,
    expected.size?.depth,
  ].every((value) => value !== undefined && xml.includes(transformEvidenceText(value)));
}

function transformEvidenceText(value: string | number | null): string {
  return typeof value === "number" ? Number(value.toFixed(11)).toString() : String(value);
}

async function readProjectXml(filePath: string): Promise<string> {
  const { stdout: entriesOutput } = await execFileAsync("unzip", ["-Z1", filePath], { encoding: "utf-8" });
  const entries = String(entriesOutput);
  const entry = entries.split(/\r?\n/u).find((name) => name === "programType.xml" || name === "program.xml");
  if (!entry) {
    throw new Error(`Saved Alice project does not contain program XML: ${filePath}`);
  }
  const { stdout } = await execFileAsync("unzip", ["-p", filePath, entry], { encoding: "utf-8" });
  return String(stdout);
}
