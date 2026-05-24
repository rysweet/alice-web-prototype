import { describe, expect, it } from "vitest";
import { createMaterialDefinition } from "../src/materials";
import {
  enumToCamelCase,
  getArrayEntries,
  getThumbnailResourceFileName,
  getTextureResourceFileName,
  getVisualResourceFileNameFromModelName,
  makeCodeReadyJointDefinitions,
  makeEnumName,
  ModelResourceCatalog,
} from "../src/model-resources";

describe("model resources", () => {
  it("builds resource filenames using Alice naming rules", () => {
    expect(enumToCamelCase("HELLO_WORLD")).toBe("HelloWorld");
    expect(makeEnumName("HelloWorld")).toBe("HELLO_WORLD");
    expect(getThumbnailResourceFileName("MyModel", "RED")).toBe("mymodel_RED.png");
    expect(getThumbnailResourceFileName("MyModel", "DEFAULT")).toBe("mymodel.png");
    expect(getThumbnailResourceFileName("MyModel", null)).toBe("mymodel_cls.png");
    expect(getTextureResourceFileName("MyModel", "RED")).toBe("mymodel_RED.a3t");
    expect(getVisualResourceFileNameFromModelName("MyModel")).toBe("mymodel.a3r");
  });

  it("orders joint trees and groups joint arrays", () => {
    const ordered = makeCodeReadyJointDefinitions([
      { name: "ROOT", parentName: null },
      { name: "SPINE", parentName: "ROOT" },
      { name: "WING_02", parentName: "SPINE" },
      { name: "WING_01", parentName: "SPINE" },
    ], true);
    const arrays = getArrayEntries(ordered.map((joint) => joint.name));

    expect(ordered[0]).toEqual({ name: "SPINE", parentName: null });
    expect(ordered.slice(1).map((joint) => joint.name).sort()).toEqual(["WING_01", "WING_02"]);
    expect(arrays).toEqual({ WING: ["WING_01", "WING_02"] });
  });

  it("discovers resources by category, builds a browser tree, and caches loads", async () => {
    let loads = 0;
    const catalog = new ModelResourceCatalog([
      {
        id: "animals/eagle",
        name: "Eagle",
        modelName: "Eagle",
        category: "animals",
        modelClass: "FLYER",
        tags: ["bird", "flying"],
        treePath: ["Animals", "Birds"],
        classInfo: {
          joints: [
            { name: "ROOT", parentName: null },
            { name: "SPINE", parentName: "ROOT" },
            { name: "WING_01", parentName: "SPINE" },
            { name: "WING_02", parentName: "SPINE" },
          ],
          removeRootJoints: true,
        },
        loader: async () => {
          loads += 1;
          return {
            geometry: {
              vertices: [-1, 0, -1, 1, 0, -1, 0, 2, 1],
              indices: [0, 1, 2],
            },
            materials: [createMaterialDefinition({ diffuseColor: 0xffcc00 })],
            textures: { feather: new Uint8Array([1, 2, 3, 4]) },
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
          vertices: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 3, 0.5],
          indices: [0, 1, 2],
        },
      },
    ]);

    expect(catalog.byCategory("animals").map((resource) => resource.name)).toEqual(["Eagle"]);
    expect(catalog.discover({ tags: ["bird"], query: "eag" }).map((resource) => resource.id)).toEqual([
      "animals/eagle",
    ]);

    const tree = catalog.buildTree();
    expect(tree.children.map((child) => child.name)).toEqual(["Animals", "props"]);
    expect(tree.children[0].children[0].children[0].resourceId).toBe("animals/eagle");

    const firstLoad = await catalog.load("animals/eagle");
    const secondLoad = await catalog.load("animals/eagle");

    expect(loads).toBe(1);
    expect(firstLoad.geometry.bounds).toEqual({
      min: { x: -1, y: 0, z: -1 },
      max: { x: 1, y: 2, z: 1 },
    });
    expect(firstLoad.classInfo.jointArrays).toEqual({ WING: ["WING_01", "WING_02"] });
    expect(firstLoad.classInfo.hierarchy[0].children.map((child) => child.name)).toEqual(["WING_01", "WING_02"]);
    expect(secondLoad.materials).toEqual(firstLoad.materials);
    expect(catalog.getIfLoaded("animals/eagle")).not.toBeNull();
  });
});
