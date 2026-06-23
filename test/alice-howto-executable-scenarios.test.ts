import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALICE_HOWTO_COVERAGE_MAP,
  ALICE_HOWTO_SCENARIO_MAP,
  ALICE_ORG_HOWTO_INVENTORY,
} from "../src/server/alice-howto-parity-inventory";

const repoRoot = resolve(__dirname, "..");

describe("Alice.org HowTo executable scenarios", () => {
  for (const entry of ALICE_ORG_HOWTO_INVENTORY) {
    const scenario = ALICE_HOWTO_SCENARIO_MAP[entry.id];

    it(scenario.scenarioId, () => {
      expect(scenario.scenarioId).toBe(`alice-howto:${entry.id}`);
      expect(scenario.command).toContain(scenario.scenarioId);
      expect(scenario.userSteps).toEqual([
        expect.stringContaining(entry.title),
        expect.stringContaining(entry.category),
        expect.stringContaining(scenario.scenarioId),
      ]);
      expect(scenario.expectedOutput).toContain(entry.title);
      expect(scenario.evidence).toEqual(ALICE_HOWTO_COVERAGE_MAP[entry.id]);

      for (const record of scenario.evidence) {
        const text = readFileSync(resolve(repoRoot, record.path), "utf8");
        expect(text, `${scenario.scenarioId} evidence should include ${record.evidenceToken}`).toContain(
          record.evidenceToken,
        );
      }
    });
  }
});
