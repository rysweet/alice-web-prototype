import * as fs from "fs";
import * as path from "path";
import {
  writeSceneObjectAdded,
  writeEditProcedureProof,
  writeSaveProof,
  writeEventRegister,
  writeEventFire,
} from "../evidence-writer.js";

export interface EvidenceService {
  writeEditedProjectArtifact(
    sourceProjectPath: string | null,
    evidenceDir: string,
    currentProjectBytes: Uint8Array | null,
  ): Promise<string>;
  recordSceneObjectAdded(evidenceDir: string, objectClassName: string, sceneFieldCountAfter: number): string;
  recordEditProcedureProof(
    evidenceDir: string,
    input: {
      procedureSelector: string;
      editSpec: string;
      inputProjectArtifact: string;
      methodName: string;
      marker: string;
      beforeStatementCount: number;
      afterStatementCount: number;
      methodNames: string[];
    },
  ): string;
  recordSaveProof(evidenceDir: string, savedFilePath: string, fileSizeBytes: number): string;
  writeRunWorldResult(evidenceDir: string, runResult: unknown): Promise<string>;
  recordEventRegister(
    evidenceDir: string,
    input: {
      registrationId: string;
      eventType: string;
      handlerName: string;
      totalRegistrations: number;
    },
  ): string;
  recordEventFire(
    evidenceDir: string,
    input: {
      eventType: string;
      registrationsEvaluated: number;
      triggeredCount: number;
      triggered: string[];
    },
  ): string;
}

export const evidenceService: EvidenceService = {
  async writeEditedProjectArtifact(sourceProjectPath, evidenceDir, currentProjectBytes) {
    const editedProjectPath = path.join(evidenceDir, "edited-project.a3p");
    if (sourceProjectPath) {
      try {
        await fs.promises.copyFile(sourceProjectPath, editedProjectPath);
      } catch (error) {
        throw new Error(`Failed to copy edited project artifact from ${sourceProjectPath}`, {
          cause: error instanceof Error ? error : undefined,
        });
      }
      return editedProjectPath;
    }

    if (!currentProjectBytes || currentProjectBytes.byteLength === 0) {
      throw new Error("Cannot write edited project artifact without source or generated project bytes");
    }
    await fs.promises.writeFile(editedProjectPath, currentProjectBytes);
    return editedProjectPath;
  },

  recordSceneObjectAdded(evidenceDir, objectClassName, sceneFieldCountAfter) {
    return writeSceneObjectAdded(evidenceDir, {
      objectClassName,
      sceneFieldCountAfter,
    });
  },

  recordEditProcedureProof(evidenceDir, input) {
    return writeEditProcedureProof(evidenceDir, {
      procedureSelector: input.procedureSelector,
      editSpec: input.editSpec,
      inputProjectArtifact: input.inputProjectArtifact,
      sceneType: "Scene",
      methodName: input.methodName,
      marker: input.marker,
      beforeStatementCount: input.beforeStatementCount,
      afterStatementCount: input.afterStatementCount,
      beforeMethods: input.methodNames,
      afterMethods: input.methodNames,
      editedProject: "edited-project.a3p",
    });
  },

  recordSaveProof(evidenceDir, savedFilePath, fileSizeBytes) {
    return writeSaveProof(evidenceDir, {
      savedFilePath,
      fileSizeBytes,
    });
  },

  async writeRunWorldResult(evidenceDir, runResult) {
    const runEvidencePath = path.join(evidenceDir, "run-world-result.json");
    await fs.promises.writeFile(runEvidencePath, JSON.stringify(runResult, null, 2) + "\n");
    return runEvidencePath;
  },

  recordEventRegister(evidenceDir, input) {
    return writeEventRegister(evidenceDir, input);
  },

  recordEventFire(evidenceDir, input) {
    return writeEventFire(evidenceDir, input);
  },
};
