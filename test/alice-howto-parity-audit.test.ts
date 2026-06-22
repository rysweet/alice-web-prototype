import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = resolve(__dirname, "..");
const tempDirs: string[] = [];

type InventoryEntry = {
  id: string;
  title: string;
  sourceLabel: string;
  coverageArea: string;
};

type CoverageRecord = {
  path: string;
  evidenceToken: string;
};

type WordingRules = {
  allowedBaseline: string;
  forbiddenTerms: string[];
  forbiddenJargon: string[];
};

type AuditResult = {
  schemaVersion: string;
  command: string;
  product: string;
  runtime: string;
  baseline: string;
  source: {
    inventory: string;
    inventoryCount: number;
  };
  scope: {
    name: string;
    included: string[];
    excluded: string[];
  };
  checks: Array<{ id: string; status: "passed" | "failed"; summary: string }>;
  summary: {
    status: "passed" | "failed";
    passed: number;
    failed: number;
  };
};

async function loadInventoryModule() {
  const modulePath = "../src/server/alice-howto-parity-inventory";
  return import(/* @vite-ignore */ modulePath) as Promise<{
    ALICE_ORG_HOWTO_INVENTORY: InventoryEntry[];
    ALICE_HOWTO_COVERAGE_MAP: Record<string, CoverageRecord[]>;
    ALICE_HOWTO_WORDING_RULES: WordingRules;
  }>;
}

async function loadAuditModule() {
  const modulePath = "../src/server/alice-howto-parity-audit";
  return import(/* @vite-ignore */ modulePath) as Promise<{
    runAliceHowToParityAudit(options: { outputPath: string; pretty?: boolean }): Promise<AuditResult>;
  }>;
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "alice-howto-parity-audit-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("Alice HowTo parity audit inventory contract", () => {
  it("defines the saved 54-entry Alice.org HowTo inventory", async () => {
    const { ALICE_ORG_HOWTO_INVENTORY } = await loadInventoryModule();

    expect(ALICE_ORG_HOWTO_INVENTORY).toHaveLength(54);
    expect(new Set(ALICE_ORG_HOWTO_INVENTORY.map((entry) => entry.id)).size).toBe(54);

    for (const entry of ALICE_ORG_HOWTO_INVENTORY) {
      expect(entry.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(entry.title.trim()).not.toBe("");
      expect(entry.sourceLabel).toBe("Alice.org HowTo");
      expect(entry.coverageArea).toContain("Alice.org HowTo");
    }
  });

  it("maps every inventory entry to existing repository evidence", async () => {
    const { ALICE_ORG_HOWTO_INVENTORY, ALICE_HOWTO_COVERAGE_MAP } = await loadInventoryModule();

    expect(Object.keys(ALICE_HOWTO_COVERAGE_MAP).sort()).toEqual(
      ALICE_ORG_HOWTO_INVENTORY.map((entry) => entry.id).sort(),
    );

    for (const entry of ALICE_ORG_HOWTO_INVENTORY) {
      const coverage = ALICE_HOWTO_COVERAGE_MAP[entry.id];
      expect(coverage, `${entry.id} should have coverage`).toEqual(expect.any(Array));
      expect(coverage.length, `${entry.id} should have at least one coverage record`).toBeGreaterThan(0);

      for (const record of coverage) {
        const evidencePath = resolve(repoRoot, record.path);
        const evidenceText = readFileSync(evidencePath, "utf8");
        expect(record.path, `${entry.id} evidence path should be relative`).not.toMatch(/^\/|(^|\/)\.\.(\/|$)/);
        expect(record.evidenceToken.trim(), `${entry.id} evidence token should be non-empty`).not.toBe("");
        expect(evidenceText, `${record.path} should contain ${record.evidenceToken}`).toContain(
          record.evidenceToken,
        );
      }
    }
  });

  it("keeps RabbitHole baseline-only wording and forbidden terms explicit", async () => {
    const { ALICE_HOWTO_WORDING_RULES } = await loadInventoryModule();

    expect(ALICE_HOWTO_WORDING_RULES.allowedBaseline).toBe("rysweet/RabbitHole origin/develop");
    expect(ALICE_HOWTO_WORDING_RULES.forbiddenTerms).toEqual(
      expect.arrayContaining([
        "LookingGlass",
        "alice-web-prototype",
        "launch-only",
        "launch only",
        "server parity",
        "browser parity",
        "full Alice parity",
      ]),
    );
    expect(ALICE_HOWTO_WORDING_RULES.forbiddenJargon).toEqual(
      expect.arrayContaining(["retcon", "merge-ready", "quality-audit", "agentic", "L3", "harness", "fixture"]),
    );
  });
});

describe("Alice HowTo parity audit result contract", () => {
  it("writes successful audit evidence to the requested temporary path", async () => {
    const { runAliceHowToParityAudit } = await loadAuditModule();
    const outputPath = join(makeTempDir(), "alice-howto-parity-audit.json");

    const result = await runAliceHowToParityAudit({ outputPath, pretty: true });
    const written = JSON.parse(readFileSync(outputPath, "utf8")) as AuditResult;

    expect(written).toEqual(result);
    expect(result).toMatchObject({
      schemaVersion: "alice-web.howto-parity-audit/v1",
      command: "alice-howto-parity-audit",
      product: "Alice",
      runtime: "alice-web",
      baseline: "rysweet/RabbitHole origin/develop",
      source: {
        inventory: "src/server/alice-howto-parity-inventory.ts",
        inventoryCount: 54,
      },
      scope: {
        name: "Alice.org HowTo coverage",
      },
      summary: {
        status: "passed",
        failed: 0,
      },
    });
    expect(result.scope.included.length).toBeGreaterThan(0);
    expect(result.scope.excluded).toEqual(expect.any(Array));

    for (const id of ["alice-identity", "baseline-only", "howto-inventory", "coverage-evidence", "wording"]) {
      expect(result.checks.find((check) => check.id === id)?.status, `${id} should pass`).toBe("passed");
    }
  });

  it("keeps generated audit evidence inside the Alice identity and wording boundary", async () => {
    const { runAliceHowToParityAudit } = await loadAuditModule();
    const outputPath = join(makeTempDir(), "alice-howto-parity-audit.json");

    const result = await runAliceHowToParityAudit({ outputPath });
    const text = JSON.stringify(result);

    expect((text.match(/RabbitHole/g) ?? []).length).toBe(1);
    expect(result.baseline).toBe("rysweet/RabbitHole origin/develop");

    for (const forbidden of [
      "LookingGlass",
      "alice-web-prototype",
      "launch-only",
      "launch only",
      "server parity",
      "browser parity",
      "full Alice parity",
      "retcon",
      "merge-ready",
      "quality-audit",
      "agentic",
      "L3",
      "harness",
      "fixture",
    ]) {
      expect(text, `audit evidence must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });
});
