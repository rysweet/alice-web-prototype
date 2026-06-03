/**
 * TDD tests for quality scoring — src/open-asset-pipeline/quality-scoring.ts
 *
 * Tests define the contract for three heuristic quality metrics that score
 * procedural 3D geometry on a 0–100 scale: silhouette coverage, joint placement,
 * and category-appropriate proportions.
 */

import { describe, expect, it } from "vitest";
import {
  scoreSilhouette,
  scoreJointPlacement,
  scoreProportions,
  computeQualityScore,
} from "../src/open-asset-pipeline/quality-scoring.js";
import { generateProceduralModel, getCanonicalJoints } from "../src/open-asset-pipeline/procedural-generators.js";
import { meshDataToModelGeometry } from "../src/open-asset-pipeline/mesh-conversion.js";
import { createBoxMesh, createCylinderMesh } from "../src/render-mesh.js";
import type { ModelGeometryData, ModelJointDefinition } from "../src/model-resources/definitions.js";
import type { EntityCategory } from "../src/open-asset-pipeline/types.js";

// ── Fixtures ───────────────────────────────────────────────────────

/** Tall, narrow geometry — humanoid silhouette. */
function makeBipedLikeGeometry(): ModelGeometryData {
  return meshDataToModelGeometry(
    createCylinderMesh({
      radiusTop: 0.15,
      radiusBottom: 0.18,
      height: 1.8,
      radialSegments: 8,
      center: { x: 0, y: 0.9, z: 0 },
    }),
  );
}

/** Long, low geometry — vehicle-like silhouette. */
function makeVehicleLikeGeometry(): ModelGeometryData {
  return meshDataToModelGeometry(
    createBoxMesh({
      width: 2.0,
      height: 0.4,
      depth: 0.8,
      center: { x: 0, y: 0.2, z: 0 },
    }),
  );
}

/** Degenerate geometry with no vertices. */
const EMPTY_GEOMETRY: ModelGeometryData = {
  vertices: [],
  indices: [],
};

/** Minimal geometry with a single point (degenerate). */
const DEGENERATE_GEOMETRY: ModelGeometryData = {
  vertices: [0, 0, 0],
  indices: [],
};

const BIPED_JOINTS = getCanonicalJoints("BIPED");
const VEHICLE_JOINTS = getCanonicalJoints("VEHICLE");

// ── scoreSilhouette ────────────────────────────────────────────────

describe("scoreSilhouette", () => {
  it("returns a number between 0 and 100 for valid geometry", () => {
    const geometry = makeBipedLikeGeometry();
    const score = scoreSilhouette(geometry);

    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 for geometry with no vertices", () => {
    const score = scoreSilhouette(EMPTY_GEOMETRY);
    expect(score).toBe(0);
  });

  it("returns 0 for degenerate single-point geometry", () => {
    const score = scoreSilhouette(DEGENERATE_GEOMETRY);
    expect(score).toBe(0);
  });

  it("scores procedurally generated BIPED geometry above 0", () => {
    const model = generateProceduralModel({
      category: "BIPED",
      id: "TEST_BIPED",
      name: "TestBiped",
      modelName: "TestBiped",
    });
    const score = scoreSilhouette(model.geometry);
    expect(score).toBeGreaterThan(0);
  });

  it("is deterministic for the same geometry", () => {
    const geometry = makeBipedLikeGeometry();
    const a = scoreSilhouette(geometry);
    const b = scoreSilhouette(geometry);
    expect(a).toBe(b);
  });
});

// ── scoreJointPlacement ────────────────────────────────────────────

describe("scoreJointPlacement", () => {
  it("returns a number between 0 and 100 for valid geometry and joints", () => {
    const geometry = makeBipedLikeGeometry();
    const score = scoreJointPlacement(geometry, [...BIPED_JOINTS]);

    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty geometry", () => {
    const score = scoreJointPlacement(EMPTY_GEOMETRY, [...BIPED_JOINTS]);
    expect(score).toBe(0);
  });

  it("returns 0 for empty joints", () => {
    const geometry = makeBipedLikeGeometry();
    const score = scoreJointPlacement(geometry, []);
    expect(score).toBe(0);
  });

  it("skips joints without localTransform.position data (does not throw)", () => {
    const geometry = makeBipedLikeGeometry();
    // Canonical joints have no localTransform.position — should not crash
    const jointsWithoutPositions: ModelJointDefinition[] = [
      { name: "ROOT", parentName: null },
      { name: "HEAD", parentName: "ROOT" },
    ];
    const score = scoreJointPlacement(geometry, jointsWithoutPositions);
    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("scores joints with position data that are within bounds", () => {
    const geometry = makeBipedLikeGeometry();
    // Joints with positions inside the bounding box should score well
    const jointsWithPositions: ModelJointDefinition[] = [
      {
        name: "ROOT",
        parentName: null,
        localTransform: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      },
      {
        name: "HEAD",
        parentName: "ROOT",
        localTransform: { position: { x: 0, y: 1.6, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
      },
    ];
    const score = scoreJointPlacement(geometry, jointsWithPositions);
    expect(score).toBeGreaterThan(0);
  });
});

// ── scoreProportions ───────────────────────────────────────────────

describe("scoreProportions", () => {
  it("returns a number between 0 and 100 for valid geometry and category", () => {
    const geometry = makeBipedLikeGeometry();
    const score = scoreProportions(geometry, "BIPED");

    expect(typeof score).toBe("number");
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("returns 0 for empty geometry", () => {
    const score = scoreProportions(EMPTY_GEOMETRY, "BIPED");
    expect(score).toBe(0);
  });

  it("scores tall geometry higher as BIPED than as VEHICLE", () => {
    // Tall narrow cylinder is more biped-like than vehicle-like
    const tallGeometry = makeBipedLikeGeometry();
    const bipedScore = scoreProportions(tallGeometry, "BIPED");
    const vehicleScore = scoreProportions(tallGeometry, "VEHICLE");
    expect(bipedScore).toBeGreaterThan(vehicleScore);
  });

  it("scores wide-low geometry higher as VEHICLE than as BIPED", () => {
    // Long flat box is more vehicle-like than biped-like
    const wideGeometry = makeVehicleLikeGeometry();
    const vehicleScore = scoreProportions(wideGeometry, "VEHICLE");
    const bipedScore = scoreProportions(wideGeometry, "BIPED");
    expect(vehicleScore).toBeGreaterThan(bipedScore);
  });

  it("handles all entity categories without throwing", () => {
    const categories: EntityCategory[] = [
      "BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE",
    ];
    const geometry = makeBipedLikeGeometry();
    for (const category of categories) {
      const score = scoreProportions(geometry, category);
      expect(typeof score).toBe("number");
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

// ── computeQualityScore ────────────────────────────────────────────

describe("computeQualityScore", () => {
  it("returns a result with overall score and three sub-scores", () => {
    const model = generateProceduralModel({
      category: "BIPED",
      id: "TEST_BIPED",
      name: "TestBiped",
      modelName: "TestBiped",
    });
    const result = computeQualityScore(model.geometry, [...model.joints], "BIPED");

    expect(result).toHaveProperty("overall");
    expect(result).toHaveProperty("silhouette");
    expect(result).toHaveProperty("jointPlacement");
    expect(result).toHaveProperty("proportions");

    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(result.silhouette).toBeGreaterThanOrEqual(0);
    expect(result.silhouette).toBeLessThanOrEqual(100);
    expect(result.jointPlacement).toBeGreaterThanOrEqual(0);
    expect(result.jointPlacement).toBeLessThanOrEqual(100);
    expect(result.proportions).toBeGreaterThanOrEqual(0);
    expect(result.proportions).toBeLessThanOrEqual(100);
  });

  it("overall score is the average of three sub-scores", () => {
    const geometry = makeBipedLikeGeometry();
    const result = computeQualityScore(geometry, [...BIPED_JOINTS], "BIPED");

    const expectedAvg = Math.round(
      (result.silhouette + result.jointPlacement + result.proportions) / 3,
    );
    expect(result.overall).toBe(expectedAvg);
  });

  it("returns all zeros for empty geometry", () => {
    const result = computeQualityScore(EMPTY_GEOMETRY, [], "BIPED");

    expect(result.overall).toBe(0);
    expect(result.silhouette).toBe(0);
    expect(result.jointPlacement).toBe(0);
    expect(result.proportions).toBe(0);
  });

  it("is deterministic for the same inputs", () => {
    const geometry = makeBipedLikeGeometry();
    const a = computeQualityScore(geometry, [...BIPED_JOINTS], "BIPED");
    const b = computeQualityScore(geometry, [...BIPED_JOINTS], "BIPED");

    expect(a.overall).toBe(b.overall);
    expect(a.silhouette).toBe(b.silhouette);
    expect(a.jointPlacement).toBe(b.jointPlacement);
    expect(a.proportions).toBe(b.proportions);
  });

  it("handles geometry with NaN vertices gracefully", () => {
    const badGeometry: ModelGeometryData = {
      vertices: [NaN, NaN, NaN, 0, 1, 0, 1, 0, 0],
      indices: [0, 1, 2],
    };
    const result = computeQualityScore(badGeometry, [], "PROP");

    // Should not throw; scores should be bounded 0–100
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it("scores each entity category for procedurally generated models", () => {
    const categories: EntityCategory[] = [
      "BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE",
    ];

    for (const category of categories) {
      const model = generateProceduralModel({
        category,
        id: `TEST_${category}`,
        name: `Test${category}`,
        modelName: `Test${category}`,
      });
      const result = computeQualityScore(model.geometry, [...model.joints], category);

      expect(result.overall).toBeGreaterThanOrEqual(0);
      expect(result.overall).toBeLessThanOrEqual(100);
    }
  });
});
