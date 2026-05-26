import { describe, expect, it } from "vitest";
import {
  getArrayIndexForJoint,
  getArrayNameForJoint,
  hasArray,
  makeCodeReadyJointDefinitions,
  ModelResourceCatalog,
} from "../src/model-resources";

describe("model resources depth", () => {
  it("covers joint array helpers and missing-parent validation", () => {
    expect(getArrayIndexForJoint("WING_000")).toBe(0);
    expect(getArrayIndexForJoint("WING")).toBe(-1);
    expect(getArrayNameForJoint("TAIL_01", { TAIL: "TAIL_FEATHER" })).toBe("TAIL_FEATHER");
    expect(getArrayNameForJoint("TAIL_01", { TAIL: "TAIL_FEATHER" }, ["tail_feather"])).toBeNull();
    expect(
      hasArray(
        "TAIL_FEATHER",
        [{ name: "TAIL_01", parentName: null }],
        { TAIL: "TAIL_FEATHER" },
      ),
    ).toBe(true);
    expect(() => makeCodeReadyJointDefinitions([{ name: "WING_01", parentName: "SPINE" }])).toThrow(
      /missing or cyclic/i,
    );
  });

  it("deduplicates concurrent loads and returns deep clones", async () => {
    let loads = 0;
    const catalog = new ModelResourceCatalog([
      {
        id: " vehicles/rocket ",
        name: "Rocket",
        modelName: "Rocket",
        category: "vehicles",
        modelClass: "VEHICLE",
        tags: ["space"],
        treePath: ["  Vehicles  ", " Space  "],
        geometry: {
          vertices: [-1, 0, -1, 1, 0, -1, 0, 4, 1],
          indices: [0, 1, 2],
        },
        textures: { hull: new Uint8Array([1, 2, 3]) },
        classInfo: {
          joints: [
            { name: "ROOT", parentName: null },
            { name: "FIN_01", parentName: "ROOT" },
            { name: "FIN_02", parentName: "ROOT" },
          ],
          removeRootJoints: true,
        },
        loader: async () => {
          loads += 1;
          return {
            textures: { hull: new Uint8Array([4, 5, 6]) },
          };
        },
      },
      {
        id: "props/tree",
        name: "Tree",
        modelName: "Tree",
        category: "props",
        modelClass: "PROP",
        geometry: {
          vertices: [0, 0, 0, 0, 2, 0, 1, 0, 1],
          indices: [0, 1, 2],
        },
      },
    ]);

    const summary = catalog.get("vehicles/rocket");
    expect(summary).not.toBeNull();
    (summary!.tags as string[]).push("mutated");

    const [first, second] = await Promise.all([
      catalog.load("vehicles/rocket"),
      catalog.load("vehicles/rocket"),
    ]);

    expect(loads).toBe(1);
    expect(first).not.toBe(second);
    expect(catalog.get("vehicles/rocket")?.tags).toEqual(["space"]);
    expect(catalog.discover({ query: "transportresource" }).map((resource) => resource.id)).toEqual([
      "vehicles/rocket",
    ]);
    expect(catalog.categories()).toEqual(["props", "vehicles"]);
    expect(catalog.buildTree("Catalog").children.map((child) => child.name)).toEqual(["props", "Vehicles"]);

    (first.geometry.vertices as number[])[0] = 99;
    first.textures.hull[0] = 9;
    (first.classInfo.jointArrays.FIN as string[]).push("FIN_99");
    (first.tags as string[]).push("changed");

    const cached = catalog.getIfLoaded("vehicles/rocket");
    expect(cached).not.toBeNull();
    expect(cached?.geometry.vertices[0]).toBe(-1);
    expect([...cached!.textures.hull]).toEqual([4, 5, 6]);
    expect(cached?.classInfo.jointArrays.FIN).toEqual(["FIN_01", "FIN_02"]);
    expect(cached?.classInfo.hierarchy[0]?.name).toBe("FIN_01");
    expect(cached?.tags).toEqual(["space"]);
  });
});
