import { describe, expect, it } from "vitest";
import type { AliceProject } from "../src/a3p-parser";
import {
  analyzeMethodFrequency,
  analyzeStatementTypeDistribution,
  calculateCodeComplexity,
  collectProjectStatistics,
  summarizeResourceUsage,
} from "../src/project-statistics";

const sampleProject: AliceProject = {
  version: "3.6",
  projectName: "Statistics Demo",
  sceneObjects: [
    {
      name: "bunny",
      typeName: "org.lgna.story.SBiped",
      resourceType: "org.lgna.story.resources.biped.BunnyResource",
      position: { x: 0, y: 0, z: 0 },
      orientation: null,
      size: null,
      constructorArgs: ["DEFAULT"],
    },
    {
      name: "tree",
      typeName: "org.lgna.story.SProp",
      resourceType: "org.lgna.story.resources.prop.TreeResource",
      position: { x: 1, y: 0, z: -2 },
      orientation: null,
      size: null,
    },
    {
      name: "secondTree",
      typeName: "org.lgna.story.SProp",
      resourceType: "org.lgna.story.resources.prop.TreeResource",
      position: { x: -1, y: 0, z: -3 },
      orientation: null,
      size: null,
      constructorArgs: ["pine", "tall"],
    },
  ],
  methods: [
    {
      name: "myFirstMethod",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [
        { kind: "MethodCall", object: "bunny", method: "hop", arguments: ["1"] },
        {
          kind: "CountLoop",
          count: 2,
          body: [
            { kind: "MethodCall", object: "bunny", method: "hop", arguments: ["1"] },
            {
              kind: "IfElse",
              condition: "score > 0",
              ifBody: [{ kind: "MethodCall", object: "tree", method: "turn", arguments: ["LEFT"] }],
              elseBody: [{ kind: "Comment", value: "no turn" }],
            },
          ],
        },
        {
          kind: "EventListener",
          event: "mouseClicked",
          body: [
            { kind: "MethodCall", object: "bunny", method: "say", arguments: ["Hello"] },
          ],
        },
      ],
    },
    {
      name: "scoreMessage",
      isFunction: true,
      returnType: "TextString",
      parameters: [],
      statements: [
        {
          kind: "Switch",
          expression: "scoreTier",
          cases: [
            { value: "gold", body: [{ kind: "ReturnStatement", expression: '"Great"' }] },
            { value: "silver", body: [{ kind: "ReturnStatement", expression: '"Good"' }] },
          ],
          defaultCase: [{ kind: "ReturnStatement", expression: '"Try again"' }],
        },
      ],
    },
  ],
  textureRefs: ["textures/grass.png", "textures/sky.png"],
};

describe("project statistics", () => {
  it("analyzes method frequency across nested statements", () => {
    expect(analyzeMethodFrequency(sampleProject)).toEqual([
      { name: "bunny.hop", count: 2 },
      { name: "bunny.say", count: 1 },
      { name: "tree.turn", count: 1 },
    ]);
  });

  it("summarizes statement distribution and resource usage", () => {
    expect(analyzeStatementTypeDistribution(sampleProject)).toMatchObject({
      MethodCall: 4,
      CountLoop: 1,
      IfElse: 1,
      Comment: 1,
      EventListener: 1,
      Switch: 1,
      ReturnStatement: 3,
    });

    expect(summarizeResourceUsage(sampleProject)).toEqual({
      totalSceneObjects: 3,
      totalResourceBackedObjects: 3,
      textureReferenceCount: 2,
      constructorArgumentCount: 3,
      byObjectType: {
        "org.lgna.story.SBiped": 1,
        "org.lgna.story.SProp": 2,
      },
      byResourceType: {
        "org.lgna.story.resources.biped.BunnyResource": 1,
        "org.lgna.story.resources.prop.TreeResource": 2,
      },
    });
  });

  it("calculates complexity metrics and assembles a project statistics snapshot", () => {
    expect(calculateCodeComplexity(sampleProject)).toEqual({
      totalMethods: 2,
      procedureCount: 1,
      functionCount: 1,
      totalStatements: 12,
      maxStatementsInMethod: 8,
      averageStatementsPerMethod: 6,
      maxNestingDepth: 3,
      branchCount: 5,
      loopCount: 1,
      eventHandlerCount: 1,
      cyclomaticEstimate: 9,
    });

    const statistics = collectProjectStatistics(sampleProject);
    expect(statistics.methodFrequency[0]).toEqual({ name: "bunny.hop", count: 2 });
    expect(statistics.complexity.maxNestingDepth).toBe(3);
    expect(statistics.resourceUsage.byResourceType["org.lgna.story.resources.prop.TreeResource"]).toBe(2);
  });
});
