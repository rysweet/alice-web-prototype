import { expect, test } from "@playwright/test";
import path from "node:path";

test("saves modified Alice class behavior from one project and imports it into another", async ({ page }, testInfo) => {
  const sourceProjectPath = path.resolve(process.cwd(), "test/fixtures/a3p/sanitized-scene.a3p");
  const targetProjectPath = path.resolve(process.cwd(), ".test-roundtrip/modified.a3p");

  await page.goto("/");

  const openProject = page.getByTestId("alice-open-project-input");
  const classBehaviorSelect = page.getByTestId("alice-class-behavior-select");
  const exportClassBehavior = page.getByTestId("alice-export-class-behavior-button");
  const importClassBehavior = page.getByTestId("alice-import-class-behavior-input");
  const classBehaviorList = page.getByTestId("alice-class-behavior-list");
  const saveProject = page.getByTestId("alice-save-project-button");
  const status = page.locator("#status");

  await openProject.setInputFiles(sourceProjectPath);
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(classBehaviorSelect).toContainText("SanitizedBunny");
  await classBehaviorSelect.selectOption("SanitizedBunny");

  const packageDownload = page.waitForEvent("download");
  await exportClassBehavior.click();
  const downloadedPackage = await packageDownload;
  expect(downloadedPackage.suggestedFilename()).toBe("SanitizedBunny.alice-class-behavior.json");
  const packagePath = testInfo.outputPath("SanitizedBunny.alice-class-behavior.json");
  await downloadedPackage.saveAs(packagePath);

  await page.reload();
  await openProject.setInputFiles(targetProjectPath);
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(classBehaviorList).not.toContainText("SanitizedBunny");

  await importClassBehavior.setInputFiles(packagePath);
  await expect(status).toContainText("Imported SanitizedBunny and created sanitizedBunnyInstance");
  await expect(classBehaviorList).toContainText("SanitizedBunny");
  await expect(classBehaviorList).toContainText("hop");
  await expect(classBehaviorList).toContainText("nickname");
  await expect(classBehaviorList).toContainText("org.lgna.story.SBiped");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("sanitizedBunnyInstance");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("SanitizedBunny");

  const savedProjectDownload = page.waitForEvent("download");
  await saveProject.click();
  const savedProject = await savedProjectDownload;
  const savedProjectPath = testInfo.outputPath("target-with-spinner.a3p");
  await savedProject.saveAs(savedProjectPath);

  await page.reload();
  await openProject.setInputFiles(savedProjectPath);
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(classBehaviorList).toContainText("SanitizedBunny");
  await expect(classBehaviorList).toContainText("hop");
  await expect(classBehaviorList).toContainText("nickname");
  await expect(classBehaviorList).toContainText("org.lgna.story.SBiped");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("sanitizedBunnyInstance");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("SanitizedBunny");
});

test("shows imported executable class behavior and persists a created instance", async ({ page }, testInfo) => {
  const targetProjectPath = path.resolve(process.cwd(), ".test-roundtrip/modified.a3p");
  const behaviorPackagePath = testInfo.outputPath("ReusableDoor.alice-class-behavior.json");

  await page.goto("/");
  await page.getByTestId("alice-open-project-input").setInputFiles(targetProjectPath);
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });

  await import("node:fs/promises").then(({ writeFile }) => writeFile(behaviorPackagePath, JSON.stringify({
    kind: "alice-web.reusable-class-behavior",
    version: 1,
    exportedBy: "alice-web",
    type: {
      name: "ReusableDoor",
      superTypeName: "org.lgna.story.SProp",
      fields: [{ name: "openCount", typeName: "Number", initializer: "0" }],
      constructors: [],
      methods: [
        {
          name: "openDoor",
          isFunction: false,
          returnType: "void",
          parameters: [{ name: "degrees", type: "Number" }],
          statements: [
            { kind: "call", object: "this", method: "turn", arguments: ["LEFT", "degrees"] },
            { kind: "expression", expression: "this.openCount = this.openCount + 1" },
          ],
        },
        {
          name: "isOpen",
          isFunction: true,
          returnType: "Boolean",
          parameters: [],
          statements: [{ kind: "return", expression: "this.openCount > 0" }],
        },
      ],
    },
    evidence: ["class-behavior-methods-preserved"],
  }, null, 2)));

  await page.getByTestId("alice-import-class-behavior-input").setInputFiles(behaviorPackagePath);
  await expect(page.locator("#status")).toContainText("Imported ReusableDoor, created reusableDoorInstance");
  await expect(page.locator("#status")).toContainText("displayed openDoor behavior trace");
  await expect(page.locator("#status")).toContainText("reusableDoorInstance.turn(LEFT, degrees)");
  await expect(page.locator("#status")).toContainText("reusableDoorInstance.openCount = reusableDoorInstance.openCount + 1");
  await expect(page.getByTestId("alice-class-behavior-list")).toContainText("this.turn(LEFT, degrees)");
  await expect(page.getByTestId("alice-class-behavior-list")).toContainText("this.openCount = this.openCount + 1");
  await expect(page.getByTestId("alice-class-behavior-list")).toContainText("returns this.openCount > 0");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("reusableDoorInstance");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("ReusableDoor");

  const savedProjectDownload = page.waitForEvent("download");
  await page.getByTestId("alice-save-project-button").click();
  const savedProject = await savedProjectDownload;
  const savedProjectPath = testInfo.outputPath("target-with-reusable-door.a3p");
  await savedProject.saveAs(savedProjectPath);

  await page.reload();
  await page.getByTestId("alice-open-project-input").setInputFiles(savedProjectPath);
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("alice-class-behavior-list")).toContainText("this.turn(LEFT, degrees)");
  await expect(page.getByTestId("alice-class-behavior-list")).toContainText("returns this.openCount > 0");
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("reusableDoorInstance");
});

test("reports invalid class behavior packages as text without changing the Alice project", async ({ page }) => {
  const targetProjectPath = path.resolve(process.cwd(), "test/fixtures/a3p/sanitized-scene.a3p");

  await page.goto("/");

  const openProject = page.getByTestId("alice-open-project-input");
  const importClassBehavior = page.getByTestId("alice-import-class-behavior-input");
  const classBehaviorList = page.getByTestId("alice-class-behavior-list");
  const status = page.locator("#status");

  await openProject.setInputFiles(targetProjectPath);
  await expect(status).toHaveAttribute("data-state", "ready", { timeout: 30_000 });

  await importClassBehavior.setInputFiles({
    name: "bad-class-behavior.alice-class-behavior.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      kind: "alice-web.reusable-class-behavior",
      version: 1,
      exportedBy: "alice-web",
      type: {
        name: "Bad Name!",
        fields: [],
        constructors: [],
        methods: [],
      },
    })),
  });

  await expect(status).toHaveAttribute("data-state", "error");
  await expect(status).toContainText("class behavior");
  await expect(classBehaviorList).not.toContainText("Bad Name!");
  await expect(page.locator("script[data-alice-class-behavior-test]")).toHaveCount(0);
});
