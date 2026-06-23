import { describe, expect, it } from "vitest";
import type { AliceProject } from "../a3p-parser.js";
import { buildProjectXml } from "./document.js";
import { ensureXmlTools, MINIMAL_PROJECT_XML_TEMPLATE } from "./xml-tools.js";

function createProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Alice Writer Contract",
    sceneObjects: [],
    methods: [],
    types: [
      {
        name: "Scene",
        superTypeName: "org.lgna.story.SScene",
        fields: [],
        methods: [],
        constructors: [],
      },
      {
        name: "SanitizedBunny",
        superTypeName: "org.lgna.story.SBiped",
        fields: [
          { name: "nickname", typeName: "java.lang.String", initializer: null },
        ],
        constructors: [],
        methods: [
          {
            name: "hop",
            isFunction: false,
            returnType: "void",
            parameters: [],
            statements: [{ kind: "comment", expression: "custom type method survives" }],
          },
        ],
      },
    ],
  };
}

describe("a3p-writer/document class behavior XML", () => {
  it("writes imported class behavior types into existing Alice project XML", async () => {
    await ensureXmlTools();

    const xml = buildProjectXml(createProject(), MINIMAL_PROJECT_XML_TEMPLATE);

    expect(xml).not.toBe(MINIMAL_PROJECT_XML_TEMPLATE);
    expect(xml).toContain("SanitizedBunny");
    expect(xml).toContain("org.lgna.story.SBiped");
    expect(xml).toContain("nickname");
    expect(xml).toContain("java.lang.String");
    expect(xml).toContain("hop");
    expect(xml).toContain("custom type method survives");
  });

  it("keeps scene and imported class methods separate when names collide", async () => {
    await ensureXmlTools();

    const project = createProject();
    project.methods = [
      {
        name: "hop",
        isFunction: false,
        returnType: "void",
        parameters: [],
        statements: [{ kind: "MethodCall", object: "this", method: "scene edit survives", arguments: [] }],
      },
    ];

    const xml = buildProjectXml(project, MINIMAL_PROJECT_XML_TEMPLATE);

    expect(xml).toContain("scene edit survives");
    expect(xml).toContain("custom type method survives");
  });
});
