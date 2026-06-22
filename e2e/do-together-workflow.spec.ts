import { expect, test, type Page } from "@playwright/test";

interface DoTogetherActionEvidence {
  actionId: string;
  branchIndex: number;
  statementKind: string;
  groupId: string;
  windowId: string;
  startedAtStep: number;
  completedAtStep: number;
}

interface DoTogetherEvidence {
  kind: "DoTogether";
  groupId: string;
  windowId: string;
  actionCount: number;
  activeWindow: {
    startedAtStep: number;
    completedAtStep: number;
  };
  actions: DoTogetherActionEvidence[];
}

interface AliceRunWorldResult {
  status: string;
  execution_log: Array<{
    kind: string;
    doTogetherEvidence?: DoTogetherEvidence;
  }>;
}

const AUTHORED_DO_TOGETHER_SOURCE = `class Main {
  void main() {
    doTogether {
      this.firstAction();
      this.secondAction();
    }
  }

  void firstAction() {
    this.say("first Alice action");
  }

  void secondAction() {
    this.say("second Alice action");
  }
}`;

function expectSharedActiveWindowEvidence(evidence: DoTogetherEvidence): void {
  expect(evidence.kind).toBe("DoTogether");
  expect(evidence.groupId).toMatch(/^do-together-\d+$/);
  expect(evidence.windowId).toBe(`${evidence.groupId}-window`);
  expect(evidence.actionCount).toBe(2);
  expect(evidence.actions).toHaveLength(2);
  expect(evidence.actions.map((action) => action.branchIndex)).toEqual([0, 1]);

  for (const action of evidence.actions) {
    expect(action.actionId).toBe(`${evidence.groupId}-action-${action.branchIndex}`);
    expect(action.statementKind).toBe("MethodCall");
    expect(action.groupId).toBe(evidence.groupId);
    expect(action.windowId).toBe(evidence.windowId);
    expect(action.startedAtStep).toBeGreaterThanOrEqual(evidence.activeWindow.startedAtStep);
    expect(action.completedAtStep).toBeGreaterThanOrEqual(action.startedAtStep);
    expect(action.completedAtStep).toBeLessThanOrEqual(evidence.activeWindow.completedAtStep);
  }

  const latestStart = Math.max(...evidence.actions.map((action) => action.startedAtStep));
  const earliestCompletion = Math.min(...evidence.actions.map((action) => action.completedAtStep));
  expect(latestStart).toBeLessThanOrEqual(earliestCompletion);
}

async function latestAliceRunResult(page: Page): Promise<AliceRunWorldResult | null> {
  return page.evaluate(() => {
    const aliceWindow = window as Window & {
      aliceWeb?: { latestRunResult: AliceRunWorldResult | null };
    };
    return aliceWindow.aliceWeb?.latestRunResult ?? null;
  });
}

test("authors and runs a two-action do-together workflow through Alice web", async ({ page }) => {
  await page.goto("/");

  const sourceEditor = page.getByTestId("alice-workflow-source");
  await expect(sourceEditor).toBeVisible();
  await sourceEditor.fill(AUTHORED_DO_TOGETHER_SOURCE);

  await page.getByTestId("alice-run-workflow-button").click();

  await expect.poll(async () => {
    const result = await latestAliceRunResult(page);
    return result?.status ?? null;
  }).toBe("completed");

  const result = await latestAliceRunResult(page);
  expect(result).not.toBeNull();
  const doTogetherEntry = result?.execution_log.find((entry) => entry.kind === "DoTogether");
  expect(doTogetherEntry).toBeDefined();
  expect(doTogetherEntry?.doTogetherEvidence).toBeDefined();

  if (!doTogetherEntry?.doTogetherEvidence) {
    throw new Error("Alice web did not expose doTogetherEvidence for the authored workflow");
  }

  expectSharedActiveWindowEvidence(doTogetherEntry.doTogetherEvidence);
});
