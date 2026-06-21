import * as fs from "fs";
import * as path from "path";
import {
  writeSceneObjectAdded,
  writeEditProcedureProof,
  writeSaveProof,
  writeEventRegister,
  writeEventFire,
  writeAudioWorkflowEvidence,
} from "../evidence-writer.js";
import type { AudioWorkflowPlaybackEvidence } from "../evidence-writer.js";
import {
  createProjectAudioPlaybackBridge,
  type ProjectAudioState,
} from "../project-audio.js";

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
  recordAudioWorkflow(
    evidenceDir: string,
    input: {
      supportedFormats: readonly string[];
      state: ProjectAudioState;
      savedProjectArtifact?: string;
      reloaded?: boolean;
      playback?: AudioWorkflowPlaybackEvidence;
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

  recordAudioWorkflow(evidenceDir, input) {
    return writeAudioWorkflowEvidence(evidenceDir, {
      supportedFormats: input.supportedFormats,
      assetCount: input.state.assets.length,
      assetNames: input.state.assets.map((asset) => asset.name),
      backgroundMusicConfigured: input.state.backgroundMusic !== null,
      cueCount: input.state.cues.length,
      cueIds: input.state.cues.map((cue) => cue.id),
      savedProjectArtifact: input.savedProjectArtifact,
      reloaded: input.reloaded ?? false,
      playback: input.playback ?? createPlaybackEvidence(input.state),
    });
  },
};

function createPlaybackEvidence(state: ProjectAudioState): AudioWorkflowPlaybackEvidence {
  let backgroundMusicStarted = false;
  const synchronizedAnimationIds = new Set<string>();
  const bridge = createProjectAudioPlaybackBridge(state, {
    createOutput: (_asset, role) => ({
      play(options): void {
        if (role === "background") {
          backgroundMusicStarted = true;
        }
        if (role === "cue" && options.animationId) {
          synchronizedAnimationIds.add(options.animationId);
        }
      },
      stop(): void {},
    }),
  });

  bridge.startBackgroundMusic();
  for (const [animationId, timeSeconds] of getCueEndTimesByAnimation(state)) {
    bridge.updateAnimationPlayback(animationId, timeSeconds);
  }

  return {
    backgroundMusicStarted,
    triggeredCueIds: bridge.getTriggeredCueIds(),
    synchronizedAnimationIds: [...synchronizedAnimationIds],
  };
}

function getCueEndTimesByAnimation(state: ProjectAudioState): Map<string, number> {
  const endTimes = new Map<string, number>();
  for (const cue of state.cues) {
    endTimes.set(
      cue.animationId,
      Math.max(endTimes.get(cue.animationId) ?? 0, cue.timelineTimeSeconds),
    );
  }
  return endTimes;
}
