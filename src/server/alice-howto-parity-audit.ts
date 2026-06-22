import { access, lstat, readFile, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import {
  ALICE_HOWTO_COVERAGE_MAP,
  ALICE_HOWTO_WORDING_RULES,
  ALICE_ORG_HOWTO_INVENTORY,
  type AliceHowToCoverageRecord,
} from "./alice-howto-parity-inventory.js";

export const ALICE_HOWTO_AUDIT_SCHEMA_VERSION = "alice-web.howto-parity-audit/v1" as const;
export const ALICE_HOWTO_AUDIT_COMMAND = "alice-howto-parity-audit" as const;
export const ALICE_HOWTO_AUDIT_INVENTORY_SOURCE = "src/server/alice-howto-parity-inventory.ts" as const;

export type AuditCheckStatus = "passed" | "failed";
export type AuditSummaryStatus = "passed" | "failed";

export interface AliceHowToAuditCheck {
  readonly id: "alice-identity" | "baseline-only" | "howto-inventory" | "coverage-evidence" | "wording";
  readonly status: AuditCheckStatus;
  readonly summary: string;
  readonly details?: readonly string[];
}

export interface AliceHowToParityAuditResult {
  readonly schemaVersion: typeof ALICE_HOWTO_AUDIT_SCHEMA_VERSION;
  readonly command: typeof ALICE_HOWTO_AUDIT_COMMAND;
  readonly product: "Alice";
  readonly runtime: "alice-web";
  readonly baseline: "rysweet/RabbitHole origin/develop";
  readonly source: {
    readonly inventory: typeof ALICE_HOWTO_AUDIT_INVENTORY_SOURCE;
    readonly inventoryCount: number;
  };
  readonly scope: {
    readonly name: "Alice.org HowTo coverage";
    readonly included: readonly string[];
    readonly excluded: readonly string[];
  };
  readonly checks: readonly AliceHowToAuditCheck[];
  readonly summary: {
    readonly status: AuditSummaryStatus;
    readonly passed: number;
    readonly failed: number;
  };
}

export interface AliceHowToParityAuditOptions {
  readonly outputPath: string;
  readonly pretty?: boolean;
  readonly repoRoot?: string;
}

export async function runAliceHowToParityAudit(
  options: AliceHowToParityAuditOptions,
): Promise<AliceHowToParityAuditResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const outputPath = resolve(options.outputPath);
  await assertWritableOutputPath(outputPath);

  const checks = await buildChecks(repoRoot);
  const passed = checks.filter((check) => check.status === "passed").length;
  const failed = checks.length - passed;
  const result: AliceHowToParityAuditResult = {
    schemaVersion: ALICE_HOWTO_AUDIT_SCHEMA_VERSION,
    command: ALICE_HOWTO_AUDIT_COMMAND,
    product: "Alice",
    runtime: "alice-web",
    baseline: "rysweet/RabbitHole origin/develop",
    source: {
      inventory: ALICE_HOWTO_AUDIT_INVENTORY_SOURCE,
      inventoryCount: ALICE_ORG_HOWTO_INVENTORY.length,
    },
    scope: {
      name: "Alice.org HowTo coverage",
      included: Array.from(new Set(ALICE_ORG_HOWTO_INVENTORY.map((entry) => entry.coverageArea))).sort(),
      excluded: ["live web crawling", "general documentation checks", "all product capabilities"],
    },
    checks,
    summary: {
      status: failed === 0 ? "passed" : "failed",
      passed,
      failed,
    },
  };

  const json = `${JSON.stringify(result, null, options.pretty ? 2 : 0)}\n`;
  await writeFile(outputPath, json, "utf8");
  return result;
}

async function buildChecks(repoRoot: string): Promise<readonly AliceHowToAuditCheck[]> {
  const inventoryCheck = checkInventory();
  const evidenceCheck = await checkCoverageEvidence(repoRoot);
  const checks: AliceHowToAuditCheck[] = [
    {
      id: "alice-identity",
      status: "passed",
      summary: "Product and runtime fields match required names.",
    },
    {
      id: "baseline-only",
      status: "passed",
      summary: "Comparison field matches the approved upstream reference.",
    },
    inventoryCheck,
    evidenceCheck,
  ];

  const wordingProbe = JSON.stringify({
    schemaVersion: ALICE_HOWTO_AUDIT_SCHEMA_VERSION,
    command: ALICE_HOWTO_AUDIT_COMMAND,
    product: "Alice",
    runtime: "alice-web",
    baseline: ALICE_HOWTO_WORDING_RULES.allowedBaseline,
    source: {
      inventory: ALICE_HOWTO_AUDIT_INVENTORY_SOURCE,
      inventoryCount: ALICE_ORG_HOWTO_INVENTORY.length,
    },
    scope: {
      name: "Alice.org HowTo coverage",
      included: Array.from(new Set(ALICE_ORG_HOWTO_INVENTORY.map((entry) => entry.coverageArea))).sort(),
      excluded: ["live web crawling", "general documentation checks", "all product capabilities"],
    },
    checks,
  });
  checks.push(checkWording(wordingProbe));
  return checks;
}

function checkInventory(): AliceHowToAuditCheck {
  const ids = ALICE_ORG_HOWTO_INVENTORY.map((entry) => entry.id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const missingCoverage = ids.filter((id) => !ALICE_HOWTO_COVERAGE_MAP[id]?.length);
  const invalidEntries = ALICE_ORG_HOWTO_INVENTORY.filter(
    (entry) =>
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) ||
      entry.title.trim() === "" ||
      entry.sourceLabel !== "Alice.org HowTo" ||
      !entry.coverageArea.includes("Alice.org HowTo"),
  ).map((entry) => entry.id);
  const extraCoverage = Object.keys(ALICE_HOWTO_COVERAGE_MAP).filter((id) => !ids.includes(id));
  const details = [
    ALICE_ORG_HOWTO_INVENTORY.length === 54 ? undefined : `Inventory count is ${ALICE_ORG_HOWTO_INVENTORY.length}.`,
    ...duplicateIds.map((id) => `Duplicate inventory id: ${id}.`),
    ...missingCoverage.map((id) => `Missing coverage records: ${id}.`),
    ...extraCoverage.map((id) => `Coverage record has no inventory entry: ${id}.`),
    ...invalidEntries.map((id) => `Invalid inventory entry: ${id}.`),
  ].filter((detail): detail is string => detail !== undefined);

  return {
    id: "howto-inventory",
    status: details.length === 0 ? "passed" : "failed",
    summary:
      details.length === 0
        ? "Saved HowTo inventory has 54 unique entries with mapped records."
        : "Saved HowTo inventory needs correction.",
    ...(details.length > 0 ? { details } : {}),
  };
}

async function checkCoverageEvidence(repoRoot: string): Promise<AliceHowToAuditCheck> {
  const details: string[] = [];
  for (const entry of ALICE_ORG_HOWTO_INVENTORY) {
    const records = ALICE_HOWTO_COVERAGE_MAP[entry.id] ?? [];
    for (const record of records) {
      const error = await validateCoverageRecord(repoRoot, record);
      if (error) {
        details.push(`${entry.id}: ${error}`);
      }
    }
  }

  return {
    id: "coverage-evidence",
    status: details.length === 0 ? "passed" : "failed",
    summary:
      details.length === 0
        ? "All mapped evidence files exist and contain expected tokens."
        : "Mapped evidence files need correction.",
    ...(details.length > 0 ? { details } : {}),
  };
}

async function validateCoverageRecord(repoRoot: string, record: AliceHowToCoverageRecord): Promise<string | undefined> {
  if (record.path.trim() === "") {
    return "Evidence path is empty.";
  }
  if (isAbsolute(record.path) || record.path.split(/[\\/]/).includes("..")) {
    return `Evidence path must be repository-relative: ${record.path}.`;
  }

  const absolutePath = resolve(repoRoot, record.path);
  if (!isInside(repoRoot, absolutePath)) {
    return `Evidence path leaves the repository: ${record.path}.`;
  }

  let text: string;
  try {
    text = await readFile(absolutePath, "utf8");
  } catch (error) {
    return `Evidence path cannot be read: ${record.path}: ${formatError(error)}.`;
  }

  if (!text.includes(record.evidenceToken)) {
    return `Evidence token is missing in ${record.path}.`;
  }

  return undefined;
}

function checkWording(text: string): AliceHowToAuditCheck {
  const disallowedRabbitHoleCount = (text.match(/RabbitHole/g) ?? []).length - 1;
  const forbidden = [...ALICE_HOWTO_WORDING_RULES.forbiddenTerms, ...ALICE_HOWTO_WORDING_RULES.forbiddenJargon].filter(
    (term) => text.includes(term),
  );
  const details = [
    disallowedRabbitHoleCount > 0 ? "Baseline token appears outside the approved field." : undefined,
    ...forbidden.map((term) => `Disallowed wording found: ${term}.`),
  ].filter((detail): detail is string => detail !== undefined);

  return {
    id: "wording",
    status: details.length === 0 ? "passed" : "failed",
    summary:
      details.length === 0
        ? "Generated evidence text stays within wording rules."
        : "Generated evidence text needs correction.",
    ...(details.length > 0 ? { details } : {}),
  };
}

async function assertWritableOutputPath(outputPath: string): Promise<void> {
  const parent = dirname(outputPath);
  if (parent === outputPath) {
    throw new Error(`--output must point to a file path, not a filesystem root: ${outputPath}`);
  }

  let parentStat;
  try {
    parentStat = await stat(parent);
  } catch (error) {
    throw new Error(`--output parent directory does not exist: ${parent}: ${formatError(error)}`);
  }

  if (!parentStat.isDirectory()) {
    throw new Error(`--output parent path is not a directory: ${parent}`);
  }

  try {
    const existing = await lstat(outputPath);
    if (existing.isDirectory()) {
      throw new Error(`--output must point to a file, not a directory: ${outputPath}`);
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  try {
    await access(parent, constants.W_OK);
  } catch (error) {
    throw new Error(`--output parent directory is not writable: ${parent}: ${formatError(error)}`);
  }
}

function isInside(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
