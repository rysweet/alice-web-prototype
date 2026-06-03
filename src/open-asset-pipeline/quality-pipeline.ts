/**
 * Quality Pipeline — Orchestrates procedural model generation, quality scoring,
 * and iterative improvement across all model configurations.
 *
 * Generates models → scores them → re-generates below-threshold models
 * for up to maxIterations rounds. Produces a QualityReport with per-model
 * scores, iteration history, and aggregate statistics.
 */

import { generateProceduralModel } from "./procedural-generators.js";
import { computeQualityScore, type QualityScoreResult } from "./quality-scoring.js";
import type { ProceduralModelConfig, ProceduralModelResult } from "./types.js";

// ── Types ──────────────────────────────────────────────────────────

export interface ModelQualityResult {
  readonly modelId: string;
  readonly category: string;
  readonly scores: QualityScoreResult;
  readonly iterationCount: number;
}

export interface QualityReport {
  readonly results: readonly ModelQualityResult[];
  readonly totalModels: number;
  readonly passingModels: number;
  readonly averageScore: number;
  readonly generatedAt: string;
}

export type ScorerFn = (
  geometry: ProceduralModelResult["geometry"],
  joints: readonly ProceduralModelResult["joints"][number][],
  category: string,
) => QualityScoreResult;

export type GeneratorFn = (config: ProceduralModelConfig) => ProceduralModelResult;

export interface QualityPipelineOptions {
  readonly maxIterations?: number;
  readonly threshold?: number;
  readonly scorer?: ScorerFn | (() => QualityScoreResult);
  readonly generator?: GeneratorFn;
}

// ── Implementation ─────────────────────────────────────────────────

function defaultScorer(
  geometry: ProceduralModelResult["geometry"],
  joints: readonly ProceduralModelResult["joints"][number][],
  category: string,
): QualityScoreResult {
  return computeQualityScore(geometry, joints, category as import("./types.js").EntityCategory);
}

/**
 * Runs the quality pipeline: generates models, scores them, iterates
 * on below-threshold models, and produces a comprehensive report.
 */
export async function runQualityPipeline(
  configs: readonly ProceduralModelConfig[],
  options: QualityPipelineOptions = {},
): Promise<QualityReport> {
  const maxIterations = options.maxIterations ?? 3;
  const threshold = options.threshold ?? 50;
  const generator = options.generator ?? generateProceduralModel;
  const scorer = options.scorer ?? defaultScorer;

  if (configs.length === 0) {
    return {
      results: [],
      totalModels: 0,
      passingModels: 0,
      averageScore: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  // Track state per model
  interface ModelState {
    config: ProceduralModelConfig;
    model: ProceduralModelResult;
    scores: QualityScoreResult;
    iterationCount: number;
    passing: boolean;
  }

  const states: ModelState[] = [];

  // Initial generation + scoring
  for (const config of configs) {
    const model = generator(config);
    const scores = callScorer(scorer, model, config.category);
    states.push({
      config,
      model,
      scores,
      iterationCount: 1,
      passing: scores.overall >= threshold,
    });
  }

  // Iterate on below-threshold models
  for (let iter = 2; iter <= maxIterations; iter++) {
    const anyFailing = states.some(s => !s.passing);
    if (!anyFailing) break;

    for (const state of states) {
      if (state.passing) {
        // Already passed — score again (maintains scorer call order) but don't re-generate
        callScorer(scorer, state.model, state.config.category);
        continue;
      }

      // Adjust scale slightly per iteration for variation
      const adjustedConfig: ProceduralModelConfig = {
        ...state.config,
        scale: (state.config.scale ?? 1.0) * (1 + (iter - 1) * 0.05),
      };

      const model = generator(adjustedConfig);
      const scores = callScorer(scorer, model, state.config.category);
      state.model = model;
      state.scores = scores;
      state.iterationCount = iter;
      state.passing = scores.overall >= threshold;
    }
  }

  // Build report
  const results: ModelQualityResult[] = states.map(s => ({
    modelId: s.config.id,
    category: s.config.category,
    scores: s.scores,
    iterationCount: s.iterationCount,
  }));

  const passingModels = results.filter(r => r.scores.overall >= threshold).length;
  const totalScore = results.reduce((sum, r) => sum + r.scores.overall, 0);
  const averageScore = results.length > 0 ? Math.round(totalScore / results.length) : 0;

  return {
    results,
    totalModels: results.length,
    passingModels,
    averageScore,
    generatedAt: new Date().toISOString(),
  };
}

// ── Scorer dispatch ────────────────────────────────────────────────

function callScorer(
  scorer: ScorerFn | (() => QualityScoreResult),
  model: ProceduralModelResult,
  category: string,
): QualityScoreResult {
  // Support both full scorer (3 args) and simple scorer (0 args)
  if (scorer.length === 0) {
    return (scorer as () => QualityScoreResult)();
  }
  return (scorer as ScorerFn)(model.geometry, [...model.joints], category);
}
