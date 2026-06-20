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
  await expect(status).toHaveText(/Loaded ".+" \(v.+\) – \d+ objects/);

  const objects = page.locator("#object-list li");
  expect(await objects.count()).toBeGreaterThan(0);
  await expect(objects.first()).not.toBeEmpty();
  await expect(page.locator("#viewport")).toBeVisible();
});
