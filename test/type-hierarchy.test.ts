import { describe, expect, it } from "vitest";
import {
  TypeComparison,
  TypeHierarchyBuilder,
  TypeInspector,
  TypeNode,
  TypeRelationship,
  TypeSearch,
  type TypeDefinition,
} from "../src/type-hierarchy.js";

const TYPES: TypeDefinition[] = [
  {
    name: "SThing",
    superTypeName: null,
    interfaces: [],
    category: "story",
    methods: [],
    properties: [],
    constructors: [],
  },
  {
    name: "Actor",
    superTypeName: "SThing",
    interfaces: ["Runnable"],
    category: "story",
    methods: [{ name: "move", returnTypeName: "void", parameters: [{ name: "distance", typeName: "WholeNumber" }] }],
    properties: [{ name: "name", typeName: "String" }],
    constructors: [{ name: "Actor", returnTypeName: null, parameters: [] }],
  },
  {
    name: "Hero",
    superTypeName: "Actor",
    interfaces: ["Runnable", "Renderable"],
    category: "story",
    methods: [
      { name: "move", returnTypeName: "void", parameters: [{ name: "distance", typeName: "WholeNumber" }] },
      { name: "jump", returnTypeName: "void", parameters: [] },
    ],
    properties: [
      { name: "name", typeName: "String" },
      { name: "sidekick", typeName: "Actor" },
    ],
    constructors: [{ name: "Hero", returnTypeName: null, parameters: [] }],
  },
];

describe("type-hierarchy", () => {
  it("builds a rooted type tree with typed nodes", () => {
    const roots = new TypeHierarchyBuilder().build(TYPES);

    expect(roots[0]).toBeInstanceOf(TypeNode);
    expect(roots[0]?.type.name).toBe("SThing");
    expect(roots[0]?.children[0]?.type.name).toBe("Actor");
    expect(roots[0]?.children[0]?.children[0]?.type.name).toBe("Hero");
  });

  it("searches and inspects types by name category and interface", () => {
    const search = new TypeSearch(TYPES);
    const inspector = new TypeInspector(TYPES);

    expect(search.find({ name: "he" }).map((type) => type.name)).toEqual(["Hero"]);
    expect(search.find({ category: "story", interfaceName: "Runnable" }).map((type) => type.name)).toEqual(["Actor", "Hero"]);
    expect(inspector.listMethods("Hero").map((method) => method.name)).toEqual(["move", "jump"]);
    expect(inspector.listProperties("Hero").map((property) => property.name)).toEqual(["name", "sidekick"]);
    expect(inspector.listConstructors("Hero")).toHaveLength(1);
  });

  it("evaluates is-a has-a implements and compatibility relationships", () => {
    expect(TypeRelationship.isA("Hero", "SThing", TYPES)).toBe(true);
    expect(TypeRelationship.hasA("Hero", "Actor", TYPES)).toBe(true);
    expect(TypeRelationship.implements("Hero", "Renderable", TYPES)).toBe(true);
    expect(TypeComparison.nominallyCompatible("Hero", "Actor", TYPES)).toBe(true);
    expect(TypeComparison.structurallyCompatible(TYPES[2]!, TYPES[1]!)).toBe(true);
  });
});
