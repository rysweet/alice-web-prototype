import { expect, test, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type AliceRunWorldResult = {
  status: string;
  success: boolean;
  completionReason: string;
  execution_log: Array<{ kind: string }>;
  error: string | null;
};

type CompletedUiAction = {
  id: string;
  trigger: string;
  observable: string;
};

type JsonRecord = Record<string, unknown>;
const FIRST_LESSON_WORKFLOW_SOURCE = `class Main {
  void main() {
    doTogether {
      this.say("First lesson action recorded");
      this.think("Object, code, run, and save proof captured");
    }
  }
}`;

test("completes first-lesson object, code, run, evidence, save, and reopen actions through browser UI", async ({
  page,
}, testInfo) => {
  const completedActions: CompletedUiAction[] = [];

  await page.goto("/");

  await page.getByTestId("alice-create-shape-button").click();
  await expect(page.locator("#status")).toHaveText(/Created box/);
  const placedStatusText = await page.locator("#status").innerText();
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("box");
  const placedObjectListText = await page.getByTestId("alice-scene-object-list").innerText();
  completedActions.push({
    id: "place-object",
    trigger: "click alice-create-shape-button",
    observable: `${placedStatusText}; ${placedObjectListText}`,
  });

  await page.getByTestId("alice-move-selected-object-button").click();
  await expect(page.locator("#status")).toHaveText(/Moved box/);
  const movedStatusText = await page.locator("#status").innerText();
  await page.getByTestId("alice-turn-selected-object-button").click();
  await expect(page.locator("#status")).toHaveText(/Turned box/);
  const turnedStatusText = await page.locator("#status").innerText();
  await page.getByTestId("alice-resize-selected-object-button").click();
  await expect(page.locator("#status")).toHaveText(/Resized box/);
  const resizedStatusText = await page.locator("#status").innerText();
  await expectSceneObjectTransform(page);
  const adjustedObjectListText = await page.getByTestId("alice-scene-object-list").innerText();
  completedActions.push({
    id: "adjust-object",
    trigger: "click move, turn, and resize selected object buttons",
    observable: `${movedStatusText}; ${turnedStatusText}; ${resizedStatusText}; ${adjustedObjectListText}`,
  });

  const sourceEditor = page.getByTestId("alice-workflow-source");
  await sourceEditor.fill(FIRST_LESSON_WORKFLOW_SOURCE);
  await expect(sourceEditor).toHaveValue(FIRST_LESSON_WORKFLOW_SOURCE);
  completedActions.push({
    id: "edit-code",
    trigger: "fill alice-workflow-source",
    observable: await sourceEditor.inputValue(),
  });

  await page.getByTestId("alice-run-workflow-button").click();
  await expect(page.locator("#status")).toHaveText(/Alice workflow completed/);
  await expect.poll(async () => (await latestAliceRunResult(page))?.status ?? null).toBe("completed");
  const runStatusText = await page.locator("#status").innerText();
  const runResult = await latestAliceRunResult(page);
  expect(runResult).toMatchObject({
    status: "completed",
    success: true,
    completionReason: "completed",
    error: null,
  });
  expect(runResult?.execution_log.length).toBeGreaterThan(0);
  completedActions.push({
    id: "run-world",
    trigger: "click alice-run-workflow-button",
    observable: `${runStatusText}; execution_log=${runResult?.execution_log.length ?? 0}`,
  });

  await page.getByTestId("alice-evidence-capture-button").click();
  await expect(page.getByTestId("alice-evidence-status")).toContainText(/visible behavior captured/i);
  await expect(page.getByTestId("alice-evidence-summary")).toContainText(/1 object/i);
  const evidenceArtifactPath = await exportEvidenceArtifact(page, testInfo.outputPath("first-lesson-visible-evidence.json"));
  const evidenceSummary = await page.getByTestId("alice-evidence-summary").innerText();
  await expectVisibleEvidenceArtifact(evidenceArtifactPath);
  const evidenceDownloadFilename = evidenceArtifactPath.split(/[\\/]/u).pop() ?? evidenceArtifactPath;
  completedActions.push({
    id: "capture-evidence",
    trigger: "click alice-evidence-capture-button and alice-evidence-export-button",
    observable: `${evidenceSummary}; downloaded=${evidenceDownloadFilename}`,
  });

  const savedProjectPath = await saveProject(page, testInfo.outputPath("first-lesson-ui-actions.a3p"));
  const savedProjectDownloadName = savedProjectPath.split(/[\\/]/u).pop() ?? savedProjectPath;
  await expectSavedProjectEvidence(savedProjectPath);
  completedActions.push({
    id: "save-project",
    trigger: "click alice-save-project-button",
    observable: `downloaded=${savedProjectDownloadName}; status=${await page.locator("#status").innerText()}`,
  });

  await page.reload();
  await page.getByTestId("alice-open-project-input").setInputFiles(savedProjectPath);
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready", { timeout: 30_000 });
  await expect(page.getByTestId("alice-scene-object-list")).toContainText("box");
  await expectSceneObjectTransform(page);
  const reopenedObjectListText = await page.getByTestId("alice-scene-object-list").innerText();
  completedActions.push({
    id: "reopen-project",
    trigger: "set alice-open-project-input to saved .a3p",
    observable: reopenedObjectListText,
  });

  expect(completedActions.map((action) => action.id)).toEqual([
    "place-object",
    "adjust-object",
    "edit-code",
    "run-world",
    "capture-evidence",
    "save-project",
    "reopen-project",
  ]);

  await writeFile(
    testInfo.outputPath("first-lessons-real-ui-actions-evidence.json"),
    JSON.stringify(
      {
        scenarioId: "first-lessons-real-ui-actions",
        runtime: "alice-web",
        evidenceMode: "browser-ui",
        desktopAliceUiActionsClaimed: false,
        completedActions,
      },
      null,
      2,
    ),
  );
});

async function latestAliceRunResult(page: Page): Promise<AliceRunWorldResult | null> {
  return page.evaluate(() => {
    const aliceWindow = window as Window & {
      aliceWeb?: { latestRunResult: AliceRunWorldResult | null };
    };
    return aliceWindow.aliceWeb?.latestRunResult ?? null;
  });
}

async function expectSceneObjectTransform(page: Page): Promise<void> {
  const objectItem = page.getByTestId("alice-scene-object-list").getByRole("listitem").filter({ hasText: "box" });
  await expect(objectItem).toContainText("position: 1, 0, 0");
  await expect(objectItem).toContainText("orientation: 0, 0.13052619222, 0, 0.991444861374");
  await expect(objectItem).toContainText("size: 1.2, 1.2, 1.2");
}

async function exportEvidenceArtifact(page: Page, artifactPath: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("alice-evidence-export-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/alice.*evidence.*\.json$/i);
  await download.saveAs(artifactPath);
  return artifactPath;
}

async function saveProject(page: Page, savedPath: string): Promise<string> {
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("alice-save-project-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.a3p$/i);
  await download.saveAs(savedPath);
  return savedPath;
}

async function expectVisibleEvidenceArtifact(artifactPath: string): Promise<void> {
  const artifact = JSON.parse(await readFile(artifactPath, "utf-8")) as JsonRecord;
  expect(artifact.format).toBe("alice-visible-behavior-evidence");
  expect(artifact.application).toMatchObject({ name: "Alice", runtime: "alice-web" });
  const visibleBehavior = expectRecord(artifact.visibleBehavior, "visibleBehavior");
  const objects = visibleBehavior.objects;
  expect(Array.isArray(objects), "visibleBehavior.objects must be an array").toBe(true);
  expect(objects as unknown[]).toHaveLength(1);
  expect((objects as JsonRecord[])[0]).toMatchObject({
    name: "box",
    typeName: "org.lgna.story.SBox",
    visible: true,
  });
}

async function expectSavedProjectEvidence(projectPath: string): Promise<void> {
  const { stdout: entriesOutput } = await execFileAsync("unzip", ["-Z1", projectPath], { encoding: "utf-8" });
  const programEntry = String(entriesOutput)
    .split(/\r?\n/u)
    .find((entry) => entry === "programType.xml" || entry === "program.xml");
  expect(programEntry, "saved Alice project should include program XML").toBeDefined();
  const { stdout } = await execFileAsync("unzip", ["-p", projectPath, programEntry!], { encoding: "utf-8" });
  const programXml = String(stdout);
  for (const expected of [
    "box",
    "org.lgna.story.SBox",
    "setPositionRelativeToVehicle",
    "setOrientationRelativeToVehicle",
    "setSize",
    "1.2",
  ]) {
    expect(programXml).toContain(expected);
  }
}

function expectRecord(value: unknown, label: string): JsonRecord {
  expect(value, `${label} must be an object`).toBeTruthy();
  expect(typeof value, `${label} must be an object`).toBe("object");
  expect(Array.isArray(value), `${label} must not be an array`).toBe(false);
  return value as JsonRecord;
}
