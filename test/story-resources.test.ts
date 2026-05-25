import { describe, expect, it } from "vitest";
import { ModelResourceCatalog } from "../src/model-resources";
import {
  BipedResource,
  FlyerResource,
  PropResource,
  QuadrupedResource,
  buildModelResourceDefinitionFromType,
  createResourceAssetPaths,
  getResourceTypeByClassName,
  listResourceTypes,
  loadResourceAssets,
} from "../src/story-resources";

describe("story resources", () => {
  it("ports family resource definitions with shared joint metadata", () => {
    expect(BipedResource.resourceClassName).toBe("BipedResource");
    expect(BipedResource.joints.map((joint) => joint.name)).toContain("LEFT_HAND");
    expect(QuadrupedResource.joints.map((joint) => joint.name)).toContain("TAIL_3");
    expect(FlyerResource.hiddenJoints).toContain("TAIL_2");
    expect(getResourceTypeByClassName("PropResource")).toBe(PropResource);
    expect(listResourceTypes().map((resourceType) => resourceType.resourceClassName)).toContain("TrainResource");
  });

  it("builds model definitions from a resource family and preserves family joint arrays", async () => {
    const catalog = new ModelResourceCatalog();
    catalog.register(buildModelResourceDefinitionFromType({
      id: "animals/eagle",
      name: "Eagle",
      modelName: "Eagle",
      type: FlyerResource,
      geometry: {
        vertices: [-1, 0, -1, 1, 0, -1, 0, 2, 1],
        indices: [0, 1, 2],
      },
    }));

    const loaded = await catalog.load("animals/eagle");

    expect(loaded.modelClass.resourceClassName).toBe("FlyerResource");
    expect(loaded.classInfo.jointArrays).toEqual({
      NECK: ["NECK_0", "NECK_1"],
      TAIL: ["TAIL_0", "TAIL_1", "TAIL_2"],
    });
    expect(loaded.classInfo.boundingBox).toEqual(FlyerResource.boundingBox);
  });

  it("derives Alice asset names and loads binary blobs through the resource loading API", async () => {
    const requestedPaths: string[] = [];
    const assets = await loadResourceAssets("Penguin", "DEFAULT", async (assetPath) => {
      requestedPaths.push(assetPath);
      return new Uint8Array([assetPath.length]);
    });

    expect(createResourceAssetPaths("Penguin", null)).toEqual({
      visual: "penguin.a3r",
      texture: "penguin_cls.a3t",
      thumbnail: "penguin_cls.png",
    });
    expect(assets.paths).toEqual({
      visual: "penguin.a3r",
      texture: "penguin.a3t",
      thumbnail: "penguin.png",
    });
    expect(requestedPaths).toEqual(["penguin.a3r", "penguin.a3t", "penguin.png"]);
    expect(Array.from(assets.texture ?? [])).toEqual(["penguin.a3t".length]);
  });
});
