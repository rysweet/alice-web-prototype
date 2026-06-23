import * as fs from "fs";
import * as path from "path";
import { writeA3P } from "../a3p-writer/archive.js";
import { createDefaultCameraWorkflowState } from "../camera-workflow.js";
import {
  createDefaultProjectAudioState,
  createEmptyProjectAudioState,
} from "../project-audio.js";
import type { TemplateDescriptor } from "../project-templates.js";
import { DEFAULT_POSITION, type ServerState } from "./state.js";
import { sanitizeFilename } from "./validation.js";

export interface TemplateService {
  listTemplates(state: ServerState): TemplateDescriptor[];
  createProject(
    state: ServerState,
    evidenceDir: string,
    input: { templateId?: string; projectName?: string },
  ): Promise<
    | { ok: true; response: Record<string, unknown> }
    | { ok: false; error: string; availableTemplates: string[] }
  >;
}

export const templateService: TemplateService = {
  listTemplates(state) {
    return state.templateLibrary.listTemplates();
  },

  async createProject(state, evidenceDir, input) {
    const { templateId = "blank", projectName } = input;

    const template = state.templateLibrary.getTemplate(templateId);
    if (!template) {
      return {
        ok: false,
        error: `Unknown template: ${templateId}`,
        availableTemplates: state.templateLibrary.listTemplateIds(),
      };
    }

    const project = template.createProject({ projectName });
    const newDir = path.join(evidenceDir, "project-new");
    await fs.promises.mkdir(newDir, { recursive: true });
    const newProjectPath = path.join(newDir, `${sanitizeFilename(project.projectName)}.a3p`);
    const a3pBytes = await writeA3P(project);
    await fs.promises.writeFile(newProjectPath, a3pBytes);

    state.parsedProject = project;
    state.projectArchive = null;
    state.resources = new Map();
    state.projectAudio = createEmptyProjectAudioState();
    state.aliceAudio = createDefaultProjectAudioState();
    state.projectName = project.projectName;
    state.projectPath = newProjectPath;
    state.cameraWorkflow = createDefaultCameraWorkflowState();
    state.sceneObjects.clear();
    for (const obj of project.sceneObjects) {
      state.sceneObjects.set(obj.name, {
        name: obj.name,
        className: obj.typeName,
        position: obj.position
          ? { x: obj.position.x, y: obj.position.y, z: obj.position.z }
          : { ...DEFAULT_POSITION },
      });
    }
    state.procedures.clear();
    state.procedures.set("myFirstMethod", []);
    for (const method of project.methods) {
      state.procedures.set(method.name, method.statements?.map((s) => s.kind) ?? []);
    }
    state.launched = true;
    state.eventSystem.reset();

    return {
      ok: true,
      response: {
        schema_version: "eatme.alice-project-new-result/v1",
        status: "created",
        templateId,
        projectName: project.projectName,
        projectPath: newProjectPath,
        sceneObjectCount: state.sceneObjects.size,
        a3pSizeBytes: a3pBytes.length,
      },
    };
  },
};
