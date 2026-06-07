import { describe, expect, it } from "vitest";
import {
  BlankTemplate,
  CustomTemplate,
  MoonTemplate,
  SeaFloorTemplate,
  SnowTemplate,
  TemplateInstantiator,
  TemplateLibrary,
} from "../src/project-templates.js";

describe("project-templates", () => {
  it("lists the built-in templates with previews", () => {
    const library = new TemplateLibrary();

    expect(library.listTemplates()).toEqual([
      {
        id: "blank",
        name: "Blank",
        description: "Minimal starter scene with a camera and ground.",
      },
      {
        id: "snow",
        name: "Snow",
        description: "Snowy starter world with a camera, snowperson, and pine tree.",
      },
      {
        id: "sea-floor",
        name: "Sea Floor",
        description: "Underwater starter scene with fish, coral, and treasure.",
      },
      {
        id: "moon",
        name: "Moon",
        description: "Low-gravity moon scene with a rover and astronaut.",
      },
    ]);
    expect(library.listPreviews().map((preview) => preview.templateId)).toEqual([
      "blank",
      "snow",
      "sea-floor",
      "moon",
    ]);
    expect(library.listTemplateIds()).toEqual([
      "blank",
      "snow",
      "sea-floor",
      "moon",
    ]);
    expect(library.listPreviews()[0]?.thumbnail.startsWith("data:image/svg+xml;utf8,")).toBe(true);
  });

  it("builds themed projects with seeded scene objects", () => {
    expect(new BlankTemplate().createProject({ projectName: "Blanky" }).sceneObjects.map((sceneObject) => sceneObject.name)).toEqual([
      "ground",
      "camera",
    ]);
    expect(new SnowTemplate().createProject().sceneObjects.map((sceneObject) => sceneObject.name)).toContain("snowPerson");
    expect(new SeaFloorTemplate().createProject().sceneObjects.map((sceneObject) => sceneObject.name)).toContain("fish");
    expect(new MoonTemplate().createProject().sceneObjects.map((sceneObject) => sceneObject.name)).toContain("rover");
  });

  it("instantiates projects and archives from the library", () => {
    const instantiator = new TemplateInstantiator();
    const project = instantiator.createProject("snow", { projectName: "WinterWorld" });
    const archive = instantiator.createArchive("moon", { projectName: "Moonshot" });

    expect(project.projectName).toBe("WinterWorld");
    expect(project.sceneObjects.map((sceneObject) => sceneObject.name)).toContain("snowPerson");
    expect(archive.project.projectName).toBe("Moonshot");
    expect(archive.project.sceneObjects.map((sceneObject) => sceneObject.name)).toContain("astronaut");
    expect(archive.versionInfo.versionSource).toBe("default");
    expect(() => instantiator.createProject("missing-template")).toThrow("Unknown template");
  });

  it("saves current projects as reusable custom templates", () => {
    const instantiator = new TemplateInstantiator();
    const sourceProject = new SnowTemplate().createProject({ projectName: "OriginalSnow" });
    sourceProject.sceneObjects.push({
      name: "penguin",
      typeName: "org.lgna.story.SBiped",
      resourceType: null,
      position: { x: 1, y: 0, z: 2 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
      size: { width: 1, height: 1, depth: 1 },
    });

    const template = instantiator.saveCurrentProjectAsTemplate(sourceProject, {
      name: "Penguin Snow",
      description: "Reusable penguin snow scene.",
    });
    const project = instantiator.createProject(template.id, { projectName: "RestoredSnow" });

    expect(template).toBeInstanceOf(CustomTemplate);
    expect(project.projectName).toBe("RestoredSnow");
    expect(project.sceneObjects.map((sceneObject) => sceneObject.name)).toContain("penguin");
    expect(instantiator.library.getTemplate(template.id)?.name).toBe("Penguin Snow");
  });
});
