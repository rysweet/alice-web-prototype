import { expect, test } from "@playwright/test";
import path from "node:path";

test("loads an Alice project and renders browser status", async ({ page }) => {
  await page.goto("/");

  const status = page.locator("#status");
  await expect(status).toHaveText("Choose an .a3p file to begin.");

  await page
    .locator("#file-input")
    .setInputFiles(path.resolve(process.cwd(), ".test-roundtrip/modified.a3p"));

  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(status).toHaveText(/^Loaded "[^"]+" \(v[^)]+\) – \d+ objects\.$/);

  const objects = page.locator("#object-list li");
  expect(await objects.count()).toBeGreaterThan(0);
  await expect(objects.first()).not.toBeEmpty();
  await expect(page.locator("#viewport")).toBeVisible();
});

test("drives the Alice camera workflow through browser controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("camera-panel")).toBeVisible();
  await expect(page.getByTestId("camera-status")).toContainText(/camera ready/i);
  await expect(page.getByTestId("camera-mode")).toContainText(/orbit/i);

  await page
    .locator("#file-input")
    .setInputFiles(path.resolve(process.cwd(), ".test-roundtrip/modified.a3p"));
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });

  const initialPosition = await page.getByTestId("camera-position").innerText();
  await page.getByTestId("camera-move-forward").click();
  await expect(page.getByTestId("camera-status")).toContainText(/camera moved forward/i);
  await expect(page.getByTestId("camera-position")).not.toHaveText(initialPosition);

  await page.getByTestId("camera-preset").selectOption("front");
  await expect(page.getByTestId("camera-status")).toContainText(/camera view set to front/i);
  await expect(page.getByTestId("camera-preset")).toHaveValue("front");
  const frontPosition = await page.getByTestId("camera-position").innerText();

  await page.getByTestId("camera-marker-name").fill("Intro view");
  await page.getByTestId("camera-save-marker").click();
  await expect(page.getByTestId("camera-status")).toContainText(/camera marker "intro view" saved/i);
  await expect(page.getByTestId("camera-marker-list")).toContainText("Intro view");

  await page.getByTestId("camera-preset").selectOption("top");
  await expect(page.getByTestId("camera-position")).not.toHaveText(frontPosition);

  const introMarker = page.getByTestId("camera-marker-list")
    .getByRole("listitem")
    .filter({ hasText: "Intro view" });
  await introMarker.getByRole("button", { name: /restore/i }).click();
  await expect(page.getByTestId("camera-status")).toContainText(/camera marker "intro view" restored/i);
  await expect(page.getByTestId("camera-position")).toHaveText(frontPosition);

  await introMarker.getByRole("button", { name: /delete/i }).click();
  await expect(page.getByTestId("camera-status")).toContainText(/camera marker "intro view" deleted/i);
  await expect(page.getByTestId("camera-marker-list")).not.toContainText("Intro view");

  await page.getByTestId("camera-first-person-toggle").click();
  await expect(page.getByTestId("camera-status")).toContainText(/first-person camera mode/i);
  await expect(page.getByTestId("camera-mode")).toContainText(/first-person/i);
});
