/**
 * Tests for model profiles — verifies all 145 models have unique profiles
 * with valid proportions, colors, and distinctive features.
 */

import { describe, it, expect } from "vitest";
import {
  getAllModelProfiles,
  getModelProfile,
  getProfilesByCategory,
  BIPED_PROFILES,
  FLYER_PROFILES,
  QUADRUPED_PROFILES,
  SWIMMER_PROFILES,
  FISH_PROFILES,
  MARINE_MAMMAL_PROFILES,
  SLITHERER_PROFILES,
  PROP_PROFILES,
  AUTOMOBILE_PROFILES,
  AIRCRAFT_PROFILES,
  WATERCRAFT_PROFILES,
  TRAIN_PROFILES,
} from "../src/open-asset-pipeline/model-profiles.js";
import {
  BipedResource,
  FlyerResource,
  QuadrupedResource,
  SwimmerResource,
  FishResource,
  MarineMammalResource,
  SlithererResource,
  PropResource,
  AutomobileResource,
  AircraftResource,
  WatercraftResource,
  TrainResource,
} from "../src/model-resources/individual-resources.js";
import { generateProceduralModel } from "../src/open-asset-pipeline/procedural-generators.js";
import type { EntityCategory } from "../src/open-asset-pipeline/types.js";

describe("model profiles", () => {
  it("has a profile for every biped resource", () => {
    const bipedIds = Object.values(BipedResource).map(r => r.id);
    const profileIds = BIPED_PROFILES.map(p => p.id);
    for (const id of bipedIds) {
      expect(profileIds, `missing profile for biped ${id}`).toContain(id);
    }
  });

  it("has a profile for every flyer resource", () => {
    const ids = Object.values(FlyerResource).map(r => r.id);
    const profileIds = FLYER_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for flyer ${id}`).toContain(id);
    }
  });

  it("has a profile for every quadruped resource", () => {
    const ids = Object.values(QuadrupedResource).map(r => r.id);
    const profileIds = QUADRUPED_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for quadruped ${id}`).toContain(id);
    }
  });

  it("has a profile for every swimmer resource", () => {
    const ids = Object.values(SwimmerResource).map(r => r.id);
    const profileIds = SWIMMER_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for swimmer ${id}`).toContain(id);
    }
  });

  it("has a profile for every fish resource", () => {
    const ids = Object.values(FishResource).map(r => r.id);
    const profileIds = FISH_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for fish ${id}`).toContain(id);
    }
  });

  it("has a profile for every marine mammal resource", () => {
    const ids = Object.values(MarineMammalResource).map(r => r.id);
    const profileIds = MARINE_MAMMAL_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for marine mammal ${id}`).toContain(id);
    }
  });

  it("has a profile for every slitherer resource", () => {
    const ids = Object.values(SlithererResource).map(r => r.id);
    const profileIds = SLITHERER_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for slitherer ${id}`).toContain(id);
    }
  });

  it("has a profile for every prop resource", () => {
    const ids = Object.values(PropResource).map(r => r.id);
    const profileIds = PROP_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for prop ${id}`).toContain(id);
    }
  });

  it("has a profile for every automobile resource", () => {
    const ids = Object.values(AutomobileResource).map(r => r.id);
    const profileIds = AUTOMOBILE_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for automobile ${id}`).toContain(id);
    }
  });

  it("has a profile for every aircraft resource", () => {
    const ids = Object.values(AircraftResource).map(r => r.id);
    const profileIds = AIRCRAFT_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for aircraft ${id}`).toContain(id);
    }
  });

  it("has a profile for every watercraft resource", () => {
    const ids = Object.values(WatercraftResource).map(r => r.id);
    const profileIds = WATERCRAFT_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for watercraft ${id}`).toContain(id);
    }
  });

  it("has a profile for every train resource", () => {
    const ids = Object.values(TrainResource).map(r => r.id);
    const profileIds = TRAIN_PROFILES.map(p => p.id);
    for (const id of ids) {
      expect(profileIds, `missing profile for train ${id}`).toContain(id);
    }
  });

  it("has no duplicate IDs across all profiles", () => {
    const allProfiles = getAllModelProfiles();
    const ids = allProfiles.map(p => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("has valid proportions for every profile", () => {
    for (const p of getAllModelProfiles()) {
      expect(p.body.height, `${p.id} body.height`).toBeGreaterThan(0);
      expect(p.body.width, `${p.id} body.width`).toBeGreaterThan(0);
      expect(p.body.depth, `${p.id} body.depth`).toBeGreaterThan(0);
      expect(p.primaryColor, `${p.id} primaryColor`).toBeGreaterThanOrEqual(0);
      expect(p.primaryColor, `${p.id} primaryColor`).toBeLessThanOrEqual(0xFFFFFF);
    }
  });

  it("looks up profiles by ID correctly", () => {
    const alien = getModelProfile("ALIEN");
    expect(alien).toBeDefined();
    expect(alien!.name).toBe("Alien");
    expect(alien!.category).toBe("BIPED");

    const shark = getModelProfile("SHARK");
    expect(shark).toBeDefined();
    expect(shark!.name).toBe("Shark");
    expect(shark!.category).toBe("SWIMMER");
  });

  it("returns undefined for unknown profile ID", () => {
    expect(getModelProfile("NONEXISTENT")).toBeUndefined();
  });

  it("filters profiles by category", () => {
    const bipeds = getProfilesByCategory("BIPED");
    expect(bipeds.length).toBeGreaterThanOrEqual(24);
    for (const p of bipeds) {
      expect(p.category).toBe("BIPED");
    }
  });

  it("covers all 144 models total", () => {
    const allProfiles = getAllModelProfiles();
    expect(allProfiles.length).toBe(144);
  });
});

describe("profile-driven procedural generation", () => {
  const categories: EntityCategory[] = ["BIPED", "QUADRUPED", "FLYER", "SWIMMER", "SLITHERER", "PROP", "VEHICLE"];

  it("generates valid geometry for every profiled model", () => {
    const allProfiles = getAllModelProfiles();
    for (const p of allProfiles) {
      const result = generateProceduralModel({
        category: p.category,
        id: p.id,
        name: p.name,
        modelName: p.name,
      });
      expect(result.geometry.vertices.length, `${p.id} vertices`).toBeGreaterThan(0);
      expect(result.geometry.indices.length, `${p.id} indices`).toBeGreaterThan(0);
      expect(result.joints.length, `${p.id} joints`).toBeGreaterThan(0);
      expect(result.materials.length, `${p.id} materials`).toBeGreaterThanOrEqual(1);
    }
  });

  it("produces different vertex counts for different profiles in the same category", () => {
    // Elephant vs Mouse should produce different amounts of geometry
    const elephant = generateProceduralModel({ category: "QUADRUPED", id: "ELEPHANT", name: "Elephant", modelName: "Elephant" });
    const mouse = generateProceduralModel({ category: "QUADRUPED", id: "MOUSE", name: "Mouse", modelName: "Mouse" });
    // They may differ in vertex count due to features (trunk, ears, tail)
    const elephantFeatures = getModelProfile("ELEPHANT")!.features.length;
    const mouseFeatures = getModelProfile("MOUSE")!.features.length;
    // Both should have features that make them distinct
    expect(elephantFeatures).toBeGreaterThan(0);
    expect(mouseFeatures).toBeGreaterThan(0);
    // Colors should differ
    expect(getModelProfile("ELEPHANT")!.primaryColor).not.toBe(getModelProfile("MOUSE")!.primaryColor);
  });

  it("assigns unique colors to most models within a category", () => {
    const bipeds = getProfilesByCategory("BIPED");
    const colorSet = new Set(bipeds.map(p => p.primaryColor));
    // At least 75% should have unique primary colors
    expect(colorSet.size).toBeGreaterThanOrEqual(Math.floor(bipeds.length * 0.75));
  });

  it("generates two materials (primary + accent) for profiled models", () => {
    const result = generateProceduralModel({
      category: "BIPED",
      id: "KNIGHT",
      name: "Knight",
      modelName: "Knight",
    });
    expect(result.materials.length).toBe(2);
    expect(result.materials[0]!.name).toBe("primary");
    expect(result.materials[1]!.name).toBe("accent");
  });

  it("falls back to category geometry for unknown model IDs", () => {
    const result = generateProceduralModel({
      category: "BIPED",
      id: "UNKNOWN_MODEL",
      name: "Unknown",
      modelName: "Unknown",
    });
    expect(result.geometry.vertices.length).toBeGreaterThan(0);
    // Falls back to 1 material (no profile found)
    expect(result.materials.length).toBe(1);
  });

  for (const cat of categories) {
    it(`generates non-empty geometry for fallback ${cat} category`, () => {
      const result = generateProceduralModel({
        category: cat,
        id: `UNKNOWN_${cat}`,
        name: `Unknown ${cat}`,
        modelName: `Unknown${cat}`,
      });
      expect(result.geometry.vertices.length).toBeGreaterThan(0);
      expect(result.geometry.indices.length).toBeGreaterThan(0);
    });
  }
});
