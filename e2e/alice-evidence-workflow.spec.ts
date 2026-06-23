import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

function expectRecord(value: unknown, label: string): JsonRecord {
  expect(value, `${label} must be an object`).toBeTruthy();
  expect(typeof value, `${label} must be an object`).toBe("object");
  expect(Array.isArray(value), `${label} must not be an array`).toBe(false);
  return value as JsonRecord;
}

function expectString(value: unknown, label: string): string {
  expect(typeof value, `${label} must be a string`).toBe("string");
  return value as string;
}

function expectNumber(value: unknown, label: string): number {
  expect(typeof value, `${label} must be a number`).toBe("number");
  return value as number;
}

test("runs an Alice world, exports visible-behavior evidence, and verifies metadata", async ({ page }, testInfo) => {
  await page.goto("/");

  await page
    .getByTestId("alice-open-project-input")
    .setInputFiles(path.resolve(process.cwd(), ".test-roundtrip/modified.a3p"));

  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("alice-scene-object-list").getByRole("listitem").first()).not.toBeEmpty();

  await page.getByTestId("camera-move-forward").click();
  await expect(page.getByTestId("camera-status")).toContainText(/camera moved forward/i);
  await expect(page.getByTestId("alice-camera-vr-comfort-panel")).toBeVisible();
  await expect(page.getByTestId("alice-camera-keyboard-movement")).toContainText(/keyboard camera movement/i);
  await expect(page.getByTestId("alice-true-vr-unsupported")).toContainText(/true headset\/native VR remains unsupported/i);

  await page.getByTestId("alice-evidence-capture-button").click();
  await expect(page.getByTestId("alice-evidence-status")).toContainText(/visible behavior captured/i);
  await expect(page.getByTestId("alice-evidence-summary")).toContainText(/objects/i);

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("alice-evidence-export-button").click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/alice.*evidence.*\.json$/i);
  const artifactPath = testInfo.outputPath("alice-visible-behavior-evidence.json");
  await download.saveAs(artifactPath);

  const artifact = expectRecord(JSON.parse(await readFile(artifactPath, "utf-8")), "artifact");
  expect(artifact.format).toBe("alice-visible-behavior-evidence");
  expect(artifact.version).toBe(1);

  const application = expectRecord(artifact.application, "application");
  expect(application.name).toBe("Alice");
  expect(application.runtime).toBe("alice-web");

  const world = expectRecord(artifact.world, "world");
  expect(expectString(world.name, "world.name")).not.toHaveLength(0);
  expect(expectString(world.aliceVersion, "world.aliceVersion")).not.toHaveLength(0);
  expect(expectNumber(world.objectCount, "world.objectCount")).toBeGreaterThan(0);

  const run = expectRecord(artifact.run, "run");
  expect(expectString(run.id, "run.id")).not.toHaveLength(0);
  expect(Number.isNaN(Date.parse(expectString(run.capturedAt, "run.capturedAt")))).toBe(false);

  const exported = expectRecord(artifact.export, "export");
  expect(exported.method).toBe("download");
  expect(exported.mimeType).toBe("application/json");
  expect(exported.filename).toBe(download.suggestedFilename());
  expect(Number.isNaN(Date.parse(expectString(exported.requestedAt, "export.requestedAt")))).toBe(false);

  const visibleBehavior = expectRecord(artifact.visibleBehavior, "visibleBehavior");
  expect(expectString(visibleBehavior.statusText, "visibleBehavior.statusText")).toContain("Loaded");

  const viewport = expectRecord(visibleBehavior.viewport, "visibleBehavior.viewport");
  expect(expectNumber(viewport.width, "visibleBehavior.viewport.width")).toBeGreaterThan(0);
  expect(expectNumber(viewport.height, "visibleBehavior.viewport.height")).toBeGreaterThan(0);
  const canvasSnapshot = expectRecord(viewport.canvasSnapshot, "visibleBehavior.viewport.canvasSnapshot");
  expect(typeof canvasSnapshot.available).toBe("boolean");
  expect(canvasSnapshot).not.toHaveProperty("dataUrl");

  expect(Array.isArray(visibleBehavior.objects), "visibleBehavior.objects must be an array").toBe(true);
  const objects = visibleBehavior.objects as unknown[];
  expect(objects.length).toBeGreaterThan(0);
  const firstObject = expectRecord(objects[0], "visibleBehavior.objects[0]");
  expect(expectString(firstObject.name, "visibleBehavior.objects[0].name")).not.toHaveLength(0);
  expect(expectString(firstObject.typeName, "visibleBehavior.objects[0].typeName")).not.toHaveLength(0);
  expect(typeof firstObject.visible, "visibleBehavior.objects[0].visible must be boolean").toBe("boolean");

  const runtimeReview = expectRecord(artifact.runtimeReview, "runtimeReview");
  const cameraVrComfort = expectRecord(runtimeReview.cameraVrComfort, "runtimeReview.cameraVrComfort");
  expect(cameraVrComfort.trueHeadsetVrSupported).toBe(false);
  expect(cameraVrComfort.nativeVrSupported).toBe(false);
  expect(cameraVrComfort.desktopCameraAvailable).toBe(true);
  const accessibilityCaptions = expectRecord(runtimeReview.accessibilityRescueCaptions, "runtimeReview.accessibilityRescueCaptions");
  expect(expectString(accessibilityCaptions.cameraCaption, "runtimeReview.accessibilityRescueCaptions.cameraCaption")).toContain("Camera");
  const galleryReview = expectRecord(runtimeReview.galleryWalkRubric, "runtimeReview.galleryWalkRubric");
  expect(galleryReview.reviewWorkflowSupported).toBe(false);
  expect(Number(galleryReview.galleryItemCount)).toBeGreaterThan(0);
  expect(galleryReview.liveStudioSupported).toBe(false);

  const serialized = JSON.stringify(artifact);
  expect(serialized).toContain("Alice");
  expect(serialized).toContain("alice-web");
  expect(serialized).not.toContain(process.cwd());
  expect(serialized).not.toMatch(/data:image\//);
});

test("keeps export available when native evidence sharing is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(Navigator.prototype, "share", {
      configurable: true,
      value: undefined,
    });
  });

  await page.goto("/");
  await page.getByTestId("alice-create-shape-button").click();
  await page.getByTestId("alice-evidence-capture-button").click();

  await expect(page.getByTestId("alice-evidence-status")).toHaveAttribute(
    "data-alice-evidence-status",
    "share-unavailable",
  );
  await expect(page.getByTestId("alice-evidence-summary")).toContainText("Alice alice-web evidence");
  await expect(page.getByTestId("alice-evidence-capture-list")).toContainText(/visible behavior/i);
  await expect(page.getByTestId("alice-evidence-export-button")).toBeEnabled();
  await expect(page.getByTestId("alice-evidence-share-button")).toBeDisabled();
});
