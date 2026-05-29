import type { AliceObject, AliceProject } from "./a3p-parser.js";
import type { AliceProjectArchive } from "./project-io.js";
import type { ProjectVersionInfo } from "./project-migration.js";
import { getCurrentAliceVersion } from "./project-migration.js";
import { createEmptyWorldProject } from "./project-template.js";

export interface TemplateInstantiationOptions {
  readonly projectName?: string;
}

export interface TemplateDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

function cloneProject(project: AliceProject): AliceProject {
  return structuredClone(project);
}

function createVersionInfo(version = getCurrentAliceVersion()): ProjectVersionInfo {
  return {
    originalAliceVersion: version,
    detectedAliceVersion: version,
    manifestVersion: null,
    xmlVersion: null,
    versionSource: "default",
    migrated: false,
    migrationSteps: [],
  };
}

function createTemplateThumbnail(accentColor: string, title: string, subtitle: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="96" viewBox="0 0 160 96" role="img" aria-label="${title}">
      <rect width="160" height="96" rx="12" fill="#10141f" />
      <rect x="8" y="8" width="144" height="80" rx="10" fill="${accentColor}" opacity="0.18" />
      <circle cx="36" cy="36" r="18" fill="${accentColor}" opacity="0.9" />
      <path d="M18 72h124" stroke="${accentColor}" stroke-width="4" stroke-linecap="round" opacity="0.8" />
      <text x="60" y="38" fill="#f8fafc" font-family="Arial, sans-serif" font-size="18" font-weight="700">${title}</text>
      <text x="60" y="60" fill="#cbd5e1" font-family="Arial, sans-serif" font-size="12">${subtitle}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

function createSceneObject(
  name: string,
  typeName: string,
  position: { x: number; y: number; z: number } | null,
  size: { width: number; height: number; depth: number } | null,
  resourceType: string | null = null,
): AliceObject {
  return {
    name,
    typeName,
    resourceType,
    position,
    orientation: { x: 0, y: 0, z: 0, w: 1 },
    size,
  };
}

function createTemplateProject(projectName: string, sceneObjects: readonly AliceObject[]): AliceProject {
  const project = createEmptyWorldProject({ projectName });
  project.sceneObjects.push(...sceneObjects.map((sceneObject) => ({ ...sceneObject })));
  return project;
}

export class TemplatePreview {
  constructor(
    readonly templateId: string,
    readonly name: string,
    readonly description: string,
    readonly thumbnail: string,
  ) {}
}

export abstract class BaseProjectTemplate implements TemplateDescriptor {
  private cachedPreview: TemplatePreview | null = null;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly description: string,
    private readonly accentColor: string,
    private readonly subtitle: string,
  ) {}

  createPreview(): TemplatePreview {
    if (!this.cachedPreview) {
      this.cachedPreview = new TemplatePreview(
        this.id,
        this.name,
        this.description,
        createTemplateThumbnail(this.accentColor, this.name, this.subtitle),
      );
    }
    return this.cachedPreview;
  }

  createProject(options: TemplateInstantiationOptions = {}): AliceProject {
    const project = createTemplateProject(
      options.projectName ?? `${this.name} Project`,
      this.createSceneObjects(),
    );
    this.configureProject(project);
    return project;
  }

  protected abstract createSceneObjects(): readonly AliceObject[];

  protected configureProject(_project: AliceProject): void {
  }
}

export class BlankTemplate extends BaseProjectTemplate {
  constructor() {
    super(
      "blank",
      "Blank",
      "Minimal starter scene with a camera and ground.",
      "#60a5fa",
      "Start from scratch",
    );
  }

  protected createSceneObjects(): readonly AliceObject[] {
    return [
      createSceneObject("ground", "org.lgna.story.SGround", { x: 0, y: 0, z: 0 }, { width: 10, height: 1, depth: 10 }),
      createSceneObject("camera", "org.lgna.story.SCamera", { x: 0, y: 3, z: 12 }, null),
    ];
  }
}

export class SnowTemplate extends BaseProjectTemplate {
  constructor() {
    super(
      "snow",
      "Snow",
      "Snowy starter world with a camera, snowperson, and pine tree.",
      "#e2e8f0",
      "Winter scene",
    );
  }

  protected createSceneObjects(): readonly AliceObject[] {
    return [
      createSceneObject("ground", "org.lgna.story.SGround", { x: 0, y: 0, z: 0 }, { width: 16, height: 1, depth: 16 }),
      createSceneObject("camera", "org.lgna.story.SCamera", { x: 1, y: 4, z: 14 }, null),
      createSceneObject("snowPerson", "org.lgna.story.SBiped", { x: 0, y: 0, z: 0 }, { width: 1.2, height: 1.8, depth: 1.2 }, "org.lgna.story.resources.people.AdultResource"),
      createSceneObject("pineTree", "org.lgna.story.STree", { x: -3, y: 0, z: -2 }, { width: 2.5, height: 4.5, depth: 2.5 }),
    ];
  }
}

export class SeaFloorTemplate extends BaseProjectTemplate {
  constructor() {
    super(
      "sea-floor",
      "Sea Floor",
      "Underwater starter scene with fish, coral, and treasure.",
      "#38bdf8",
      "Underwater scene",
    );
  }

  protected createSceneObjects(): readonly AliceObject[] {
    return [
      createSceneObject("seaFloor", "org.lgna.story.SGround", { x: 0, y: -2, z: 0 }, { width: 18, height: 1, depth: 18 }),
      createSceneObject("camera", "org.lgna.story.SCamera", { x: 0, y: 2, z: 16 }, null),
      createSceneObject("fish", "org.lgna.story.SFish", { x: 2, y: 1, z: -2 }, { width: 1.4, height: 0.8, depth: 2.2 }),
      createSceneObject("coral", "org.lgna.story.SProp", { x: -2, y: -1, z: -1 }, { width: 1.6, height: 2.0, depth: 1.6 }),
      createSceneObject("treasure", "org.lgna.story.SProp", { x: 1, y: -1, z: 1 }, { width: 1.2, height: 1.0, depth: 1.0 }),
    ];
  }
}

export class MoonTemplate extends BaseProjectTemplate {
  constructor() {
    super(
      "moon",
      "Moon",
      "Low-gravity moon scene with a rover and astronaut.",
      "#fbbf24",
      "Lunar scene",
    );
  }

  protected createSceneObjects(): readonly AliceObject[] {
    return [
      createSceneObject("moonSurface", "org.lgna.story.SGround", { x: 0, y: 0, z: 0 }, { width: 20, height: 1, depth: 20 }),
      createSceneObject("camera", "org.lgna.story.SCamera", { x: 2, y: 5, z: 18 }, null),
      createSceneObject("astronaut", "org.lgna.story.SBiped", { x: -1, y: 0, z: 0 }, { width: 1.1, height: 1.9, depth: 1.1 }, "org.lgna.story.resources.people.AdultResource"),
      createSceneObject("rover", "org.lgna.story.SVehicle", { x: 2, y: 0, z: -1 }, { width: 2.4, height: 1.4, depth: 3.2 }),
    ];
  }
}

export class CustomTemplate extends BaseProjectTemplate {
  private readonly snapshot: AliceProject;
  private readonly preview: TemplatePreview;

  constructor(
    id: string,
    name: string,
    description: string,
    project: AliceProject,
    thumbnail: string = createTemplateThumbnail("#a855f7", name, "Custom template"),
  ) {
    super(id, name, description, "#a855f7", "Custom template");
    this.snapshot = cloneProject(project);
    this.preview = new TemplatePreview(id, name, description, thumbnail);
  }

  override createPreview(): TemplatePreview {
    return this.preview;
  }

  override createProject(options: TemplateInstantiationOptions = {}): AliceProject {
    const project = cloneProject(this.snapshot);
    project.projectName = options.projectName ?? project.projectName;
    return project;
  }

  protected createSceneObjects(): readonly AliceObject[] {
    return this.snapshot.sceneObjects;
  }

  static fromProject(project: AliceProject, options: {
    id?: string;
    name?: string;
    description?: string;
  } = {}): CustomTemplate {
    const name = options.name?.trim() || `${project.projectName} Template`;
    return new CustomTemplate(
      options.id?.trim() || `custom-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      name,
      options.description ?? `Reusable template captured from ${project.projectName}.`,
      project,
    );
  }
}

export class TemplateLibrary {
  private readonly templates = new Map<string, BaseProjectTemplate>();

  constructor(templates: readonly BaseProjectTemplate[] = [
    new BlankTemplate(),
    new SnowTemplate(),
    new SeaFloorTemplate(),
    new MoonTemplate(),
  ]) {
    for (const template of templates) {
      this.register(template);
    }
  }

  listTemplates(): TemplateDescriptor[] {
    return [...this.templates.values()].map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
    }));
  }

  listPreviews(): TemplatePreview[] {
    return [...this.templates.values()].map((template) => template.createPreview());
  }

  getTemplate(id: string): BaseProjectTemplate | null {
    return this.templates.get(id) ?? null;
  }

  register(template: BaseProjectTemplate): this {
    this.templates.set(template.id, template);
    return this;
  }
}

export class TemplateInstantiator {
  constructor(readonly library: TemplateLibrary = new TemplateLibrary()) {}

  createProject(templateId: string, options: TemplateInstantiationOptions = {}): AliceProject {
    const template = this.requireTemplate(templateId);
    return template.createProject(options);
  }

  createArchive(templateId: string, options: TemplateInstantiationOptions = {}): AliceProjectArchive {
    const project = this.createProject(templateId, options);
    return {
      project,
      manifest: null,
      resources: new Map(),
      resourceEntries: [],
      thumbnail: null,
      versionInfo: createVersionInfo(project.version),
    };
  }

  createPreview(templateId: string): TemplatePreview {
    return this.requireTemplate(templateId).createPreview();
  }

  saveCurrentProjectAsTemplate(project: AliceProject, options: {
    id?: string;
    name?: string;
    description?: string;
  } = {}): CustomTemplate {
    const template = CustomTemplate.fromProject(project, options);
    this.library.register(template);
    return template;
  }

  private requireTemplate(templateId: string): BaseProjectTemplate {
    const template = this.library.getTemplate(templateId);
    if (!template) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    return template;
  }
}
