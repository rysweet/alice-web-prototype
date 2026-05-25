import { describe, expect, it } from "vitest";
import { deserialize, serialize } from "../src/serialization.js";
import { MoveDirection, SBox } from "../src/story-api";
import { parseTweedle } from "../src/tweedle-parser.js";
import {
  assertAstEquals,
  createMinimalProject,
  createProcedureWithStatements,
  createSceneWithEntities,
  createTweedleSource,
  parseAndExecute,
} from "./test-utils.js";

describe("test utilities", () => {
  it("creates a minimal project that round-trips through XML serialization", () => {
    const project = createMinimalProject();
    project.sceneObjects.push({
      name: "box",
      typeName: "org.lgna.story.SBox",
      resourceType: null,
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    });
    project.methods.push(createProcedureWithStatements([
      { kind: "MethodCall", object: "box", method: "move", arguments: ["FORWARD", "1.0"] },
    ]));

    const xml = serialize(project, { format: "xml" });
    const roundTripped = deserialize(xml, "xml");

    expect(project.types?.map((type) => type.name)).toEqual(expect.arrayContaining(["Program", "Scene"]));
    expect(roundTripped.projectName).toBe("Program");
    expect(roundTripped.sceneObjects).toEqual(project.sceneObjects);
    expect(roundTripped.methods).toEqual(project.methods);
  });

  it("creates Tweedle source that parses, executes, and compares by AST", () => {
    const source = createTweedleSource("Runner", [
      {
        name: "myFirstMethod",
        returnType: "WholeNumber",
        body: [
          "WholeNumber answer <- 40 + 2;",
          "return answer;",
        ],
      },
    ]);

    const { ast, result } = parseAndExecute(source);
    const reparsed = parseTweedle(`class Runner {
  WholeNumber myFirstMethod() {
    WholeNumber answer <- 40 + 2;
    return answer;
  }
}`);

    assertAstEquals(ast, reparsed);
    expect(Number(result.returnValues.get("myFirstMethod"))).toBe(42);
  });

  it("creates a scene with named entities that can move", () => {
    const scene = createSceneWithEntities(["alpha", "beta"]);
    const alpha = scene.getEntity("alpha");
    const beta = scene.getEntity("beta");

    expect(scene.entities.size).toBe(2);
    expect(alpha).toBeInstanceOf(SBox);
    expect(beta).toBeInstanceOf(SBox);

    const alphaBox = alpha as SBox;
    const betaBox = beta as SBox;
    const alphaBefore = { ...alphaBox.position };
    const betaBefore = { ...betaBox.position };

    alphaBox.move(MoveDirection.FORWARD, 2);
    betaBox.move(MoveDirection.RIGHT, 1.5);

    expect(alphaBox.position.z).toBeLessThan(alphaBefore.z);
    expect(betaBox.position.x).toBeGreaterThan(betaBefore.x);
  });
});
