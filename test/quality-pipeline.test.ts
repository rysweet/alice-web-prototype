/**
 * TDD tests for quality pipeline — src/open-asset-pipeline/quality-pipeline.ts
 *
 * Tests define the contract for the orchestration loop that generates 3D models,
 * scores them, iterates to improve quality, and produces a QualityReport.
 *
 * Uses injectable generator/scorer to enable deterministic testing without
 * coupling to procedural generator internals.
 */

import { describe, expect, it, vi } from "vitest";
import {
  runQualityPipeline,
  type QualityReport,
  type ModelQualityResult,
  type QualityPipelineOptions,
} from "../src/open-asset-pipeline/quality-pipeline.js";
import { generateProceduralModel } from "../src/open-asset-pipeline/procedural-generators.js";
import type { ProceduralModelConfig, ProceduralModelResult } from "../src/open-asset-pipeline/types.js";

// ── Helpers ────────────────────────────────────────────────────────

function makeBipedConfig(id = "TEST_BIPED"): ProceduralModelConfig {
  return { category: "BIPED", id, name: `Test ${id}`, modelName: `Test${id}` };
}

function makeQuadrupedConfig(id = "TEST_QUAD"): ProceduralModelConfig {
  return { category: "QUADRUPED", id, name: `Test ${id}`, modelName: `Test${id}` };
}

function makeFlyerConfig(id = "TEST_FLYER"): ProceduralModelConfig {
  return { category: "FLYER", id, name: `Test ${id}`, modelName: `Test${id}` };
}

function makeSwimmerConfig(id = "TEST_SWIMMER"): ProceduralModelConfig {
  return { category: "SWIMMER", id, name: `Test ${id}`, modelName: `Test${id}` };
}

function makeSlithererConfig(id = "TEST_SLITHERER"): ProceduralModelConfig {
  return { category: "SLITHERER", id, name: `Test ${id}`, modelName: `Test${id}` };
}

function makePropConfig(id = "TEST_PROP"): ProceduralModelConfig {
  return { category: "PROP", id, name: `Test ${id}`, modelName: `Test${id}` };
}

function makeVehicleConfig(id = "TEST_VEHICLE"): ProceduralModelConfig {
  return { category: "VEHICLE", id, name: `Test ${id}`, modelName: `Test${id}` };
}

// ── Report Structure ───────────────────────────────────────────────

describe("runQualityPipeline — report structure", () => {
  it("returns a QualityReport with results for each config", async () => {
    const configs = [makeBipedConfig(), makeQuadrupedConfig()];
    const report = await runQualityPipeline(configs);

    expect(report).toHaveProperty("results");
    expect(report.results).toHaveLength(2);
  });

  it("each result has modelId, scores, and iterationCount", async () => {
    const configs = [makeBipedConfig("ALIEN")];
    const report = await runQualityPipeline(configs);

    const result = report.results[0];
    expect(result).toHaveProperty("modelId", "ALIEN");
    expect(result).toHaveProperty("scores");
    expect(result.scores).toHaveProperty("overall");
    expect(result.scores).toHaveProperty("silhouette");
    expect(result.scores).toHaveProperty("jointPlacement");
    expect(result.scores).toHaveProperty("proportions");
    expect(result).toHaveProperty("iterationCount");
    expect(result.iterationCount).toBeGreaterThanOrEqual(1);
  });

  it("report has aggregate statistics", async () => {
    const configs = [makeBipedConfig(), makeQuadrupedConfig()];
    const report = await runQualityPipeline(configs);

    expect(report).toHaveProperty("totalModels", 2);
    expect(report).toHaveProperty("passingModels");
    expect(report).toHaveProperty("averageScore");
    expect(typeof report.passingModels).toBe("number");
    expect(typeof report.averageScore).toBe("number");
    expect(report.averageScore).toBeGreaterThanOrEqual(0);
    expect(report.averageScore).toBeLessThanOrEqual(100);
  });

  it("report has timestamp", async () => {
    const report = await runQualityPipeline([makePropConfig()]);

    expect(report).toHaveProperty("generatedAt");
    expect(typeof report.generatedAt).toBe("string");
    // Should be ISO 8601
    expect(() => new Date(report.generatedAt)).not.toThrow();
  });
});

// ── Iteration Behavior ─────────────────────────────────────────────

describe("runQualityPipeline — iteration behavior", () => {
  it("defaults to maxIterations = 3", async () => {
    // Use a scorer that always returns below-threshold to force max iterations
    const alwaysFailScorer = () => ({
      overall: 10,
      silhouette: 10,
      jointPlacement: 10,
      proportions: 10,
    });

    const report = await runQualityPipeline([makeBipedConfig()], {
      scorer: alwaysFailScorer,
    });

    expect(report.results[0].iterationCount).toBe(3);
  });

  it("respects custom maxIterations", async () => {
    const alwaysFailScorer = () => ({
      overall: 10,
      silhouette: 10,
      jointPlacement: 10,
      proportions: 10,
    });

    const report = await runQualityPipeline([makeBipedConfig()], {
      maxIterations: 5,
      scorer: alwaysFailScorer,
    });

    expect(report.results[0].iterationCount).toBe(5);
  });

  it("stops iterating when model passes threshold (default 50)", async () => {
    let callCount = 0;
    const passOnFirstScorer = () => {
      callCount++;
      return { overall: 80, silhouette: 80, jointPlacement: 80, proportions: 80 };
    };

    const report = await runQualityPipeline([makeBipedConfig()], {
      scorer: passOnFirstScorer,
    });

    expect(report.results[0].iterationCount).toBe(1);
    expect(report.results[0].scores.overall).toBe(80);
  });

  it("respects custom threshold", async () => {
    // Score of 60 passes default (50) but fails custom threshold (70)
    const scorer = () => ({
      overall: 60,
      silhouette: 60,
      jointPlacement: 60,
      proportions: 60,
    });

    const report = await runQualityPipeline([makeBipedConfig()], {
      threshold: 70,
      scorer,
    });

    // Should iterate max times because 60 < 70
    expect(report.results[0].iterationCount).toBe(3);
  });

  it("does not re-generate or re-score passing models in subsequent iterations", async () => {
    const generatorCalls: string[] = [];
    const customGenerator = (config: ProceduralModelConfig): ProceduralModelResult => {
      generatorCalls.push(config.id);
      return generateProceduralModel(config);
    };

    // Category-based scorer: BIPED always passes, QUADRUPED always fails
    const scorerCalls: string[] = [];
    const mixedScorer = (_geom: ProceduralModelResult["geometry"], _joints: readonly ProceduralModelResult["joints"][number][], category: string) => {
      scorerCalls.push(category);
      const score = category === "BIPED" ? 80 : 10;
      return { overall: score, silhouette: score, jointPlacement: score, proportions: score };
    };

    await runQualityPipeline(
      [makeBipedConfig("PASS_MODEL"), makeQuadrupedConfig("FAIL_MODEL")],
      { generator: customGenerator, scorer: mixedScorer },
    );

    // PASS_MODEL should be generated only once (iteration 1)
    const passModelCalls = generatorCalls.filter((id) => id === "PASS_MODEL");
    expect(passModelCalls).toHaveLength(1);

    // FAIL_MODEL should be generated 3 times (once per iteration)
    const failModelCalls = generatorCalls.filter((id) => id === "FAIL_MODEL");
    expect(failModelCalls).toHaveLength(3);

    // Passing model scored once; failing model scored 3 times
    expect(scorerCalls.filter(c => c === "BIPED")).toHaveLength(1);
    expect(scorerCalls.filter(c => c === "QUADRUPED")).toHaveLength(3);
  });
});

// ── Category Coverage ──────────────────────────────────────────────

describe("runQualityPipeline — category coverage", () => {
  it("processes all 7 entity categories", async () => {
    const configs = [
      makeBipedConfig(),
      makeQuadrupedConfig(),
      makeFlyerConfig(),
      makeSwimmerConfig(),
      makeSlithererConfig(),
      makePropConfig(),
      makeVehicleConfig(),
    ];

    const report = await runQualityPipeline(configs);

    expect(report.results).toHaveLength(7);
    for (const result of report.results) {
      expect(result.scores.overall).toBeGreaterThanOrEqual(0);
      expect(result.scores.overall).toBeLessThanOrEqual(100);
    }
  });

  it("reports category in each result", async () => {
    const configs = [makeBipedConfig(), makeVehicleConfig()];
    const report = await runQualityPipeline(configs);

    expect(report.results[0]).toHaveProperty("category", "BIPED");
    expect(report.results[1]).toHaveProperty("category", "VEHICLE");
  });
});

// ── Single Model ───────────────────────────────────────────────────

describe("runQualityPipeline — single model", () => {
  it("works with a single model config", async () => {
    const report = await runQualityPipeline([makePropConfig()]);

    expect(report.results).toHaveLength(1);
    expect(report.totalModels).toBe(1);
    expect(report.results[0].modelId).toBe("TEST_PROP");
  });
});

// ── Edge Cases ─────────────────────────────────────────────────────

describe("runQualityPipeline — edge cases", () => {
  it("returns empty report for empty configs", async () => {
    const report = await runQualityPipeline([]);

    expect(report.results).toHaveLength(0);
    expect(report.totalModels).toBe(0);
    expect(report.passingModels).toBe(0);
  });

  it("passing models count matches models scoring >= threshold", async () => {
    // Two models: one passes, one fails
    let callIdx = 0;
    const scorer = () => {
      callIdx++;
      const score = callIdx <= 1 ? 80 : 30;
      return { overall: score, silhouette: score, jointPlacement: score, proportions: score };
    };

    const report = await runQualityPipeline(
      [makeBipedConfig(), makeQuadrupedConfig()],
      { scorer, maxIterations: 1 },
    );

    const actualPassing = report.results.filter((r) => r.scores.overall >= 50).length;
    expect(report.passingModels).toBe(actualPassing);
  });

  it("averageScore is the mean of all final model overall scores", async () => {
    const report = await runQualityPipeline([
      makeBipedConfig(),
      makeQuadrupedConfig(),
      makePropConfig(),
    ]);

    const totalScore = report.results.reduce((sum, r) => sum + r.scores.overall, 0);
    const expectedAvg = Math.round(totalScore / report.results.length);
    expect(report.averageScore).toBe(expectedAvg);
  });
});
