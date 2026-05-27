import { describe, expect, it } from "vitest";
import * as PublicApi from "../src/index.js";
import * as A3pParser from "../src/a3p-parser.js";
import * as ProjectIo from "../src/project-io.js";
import * as SceneBuilder from "../src/scene-builder.js";
import * as StoryApi from "../src/story-api/index.js";
import * as TweedleParser from "../src/tweedle-parser.js";
import * as TweedleVm from "../src/tweedle-vm.js";
import * as Server from "../src/server.js";
import * as TypeDeclarations from "../src/type-declarations.js";
import * as ResourceSystem from "../src/resource-system.js";

const EXPECTED_NAMESPACES = [
  "A3pParser",
  "AliceIdeState",
  "CroquetOperations",
  "ProjectIo",
  "SceneBuilder",
  "StoryApi",
  "TweedleParser",
  "TweedleVm",
  "Server",
  "TypeDeclarations",
  "ResourceSystem",
] as const;

describe("public API index", () => {
  it("re-exports the primary subsystems under stable namespace names", () => {
    expect(PublicApi.A3pParser).toBe(A3pParser);
    expect(PublicApi.ProjectIo).toBe(ProjectIo);
    expect(PublicApi.SceneBuilder).toBe(SceneBuilder);
    expect(PublicApi.StoryApi).toBe(StoryApi);
    expect(PublicApi.TweedleParser).toBe(TweedleParser);
    expect(PublicApi.TweedleVm).toBe(TweedleVm);
    expect(PublicApi.Server).toBe(Server);
    expect(PublicApi.TypeDeclarations).toBe(TypeDeclarations);
    expect(PublicApi.ResourceSystem).toBe(ResourceSystem);

    for (const namespace of EXPECTED_NAMESPACES) {
      expect(PublicApi).toHaveProperty(namespace);
    }
  });

  it("exposes a broad library surface without namespace collisions", () => {
    const names = Object.keys(PublicApi);

    expect(names.length).toBeGreaterThanOrEqual(80);
    expect(new Set(names).size).toBe(names.length);
    expect(typeof PublicApi.A3pParser.parseA3P).toBe("function");
    expect(typeof PublicApi.AliceIdeState.IdeState).toBe("function");
    expect(typeof PublicApi.CroquetOperations.OperationHistory).toBe("function");
    expect(typeof PublicApi.StoryApi.buildStoryWorld).toBe("function");
    expect(typeof PublicApi.ProjectIo.readProject).toBe("function");
    expect(typeof PublicApi.TweedleVm.TweedleVM).toBe("function");
    expect(typeof PublicApi.Server.createServer).toBe("function");
  });
});
