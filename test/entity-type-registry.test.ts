import { describe, expect, it } from "vitest";
import { SBillboard, SBiped, SCamera } from "../src/story-api/index.js";
import {
  BipedType,
  EntityTypeRegistry,
  ResourceEnumeration,
  TypeInheritanceTree,
  entityTypeRegistry,
} from "../src/entity-type-registry.js";

describe("entity-type-registry", () => {
  it("exposes a singleton registry of known entity types", () => {
    const registry = EntityTypeRegistry.getInstance();

    expect(registry).toBe(entityTypeRegistry);
    expect(registry).toBe(EntityTypeRegistry.getInstance());
    expect(registry.get("SBiped")).toBeInstanceOf(BipedType);
    expect(registry.listTypes().map((type) => type.name)).toEqual(expect.arrayContaining([
      "SBiped",
      "SQuadruped",
      "SFlyer",
      "SSwimmer",
      "SSlitherer",
      "SMarineMammal",
      "SProp",
      "SDisc",
      "SBox",
      "SSphere",
      "SCylinder",
      "SCone",
      "STorus",
      "SGround",
      "SCamera",
      "SMarker",
      "SBillboard",
      "STextModel",
    ]));
  });

  it("creates named entities and resolves their most specific runtime type", () => {
    const registry = EntityTypeRegistry.getInstance();
    const hero = registry.create<SBiped>("SBiped", "Hero");
    const billboard = new SBillboard();
    const camera = new SCamera();

    expect(hero).toBeInstanceOf(SBiped);
    expect(hero.name).toBe("Hero");
    expect(registry.getMostSpecificTypeForInstance(hero)?.name).toBe("SBiped");
    expect(registry.getMostSpecificTypeForInstance(billboard)?.name).toBe("SBillboard");
    expect(registry.getMostSpecificTypeForInstance(camera)?.name).toBe("SCamera");
  });

  it("builds an inheritance tree from SThing through jointed model descendants", () => {
    const registry = EntityTypeRegistry.getInstance();
    const tree = registry.getInheritanceTree();

    expect(tree).toBeInstanceOf(TypeInheritanceTree);
    expect(tree.pathTo("SBiped")).toEqual([
      "SThing",
      "STurnable",
      "SMovableTurnable",
      "SModel",
      "SJointedModel",
      "SBiped",
    ]);
    expect(tree.isA("SMarineMammal", "SSwimmer")).toBe(true);
    expect(tree.descendantsOf("SModel").map((type) => type.name)).toEqual(expect.arrayContaining([
      "SJointedModel",
      "SBillboard",
      "STextModel",
      "SShape",
    ]));
  });

  it("enumerates resource-backed types for concrete and abstract branches", () => {
    const enumeration = new ResourceEnumeration();

    const biped = enumeration.listForType("SBiped");
    const jointedModels = enumeration.listForType("SJointedModel");
    const cameras = enumeration.listForType("SCamera");

    expect(biped).toEqual([
      expect.objectContaining({
        typeName: "SBiped",
        modelClass: "BIPED",
        resourceClassName: "BipedResource",
        category: "people",
      }),
    ]);
    expect(jointedModels.map((entry) => entry.typeName)).toEqual(expect.arrayContaining([
      "SBiped",
      "SFlyer",
      "SMarineMammal",
      "SProp",
      "SQuadruped",
      "SSlitherer",
      "SSwimmer",
    ]));
    expect(cameras).toEqual([]);
  });

  it("surfaces resource metadata from the underlying story resource definitions", () => {
    const registry = EntityTypeRegistry.getInstance();
    const marineMammalType = registry.require("SMarineMammal");
    const propType = registry.require("SProp");

    expect(marineMammalType.resourceType).toMatchObject({
      resourceClassName: "MarineMammalResource",
      textureNames: ["DEFAULT"],
    });
    expect(propType.modelClassData).toMatchObject({
      abstractionClassName: "SJointedModel",
      implementationClassName: "BasicJointedModelImp",
      packageName: "org.lgna.story.resources.prop",
    });
  });
});
