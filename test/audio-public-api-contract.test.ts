// test/audio-public-api-contract.test.ts
import { describe, expect, it } from "vitest";
import * as PublicApi from "../src/index.js";

const PROJECT_AUDIO_EXPORTS = [
  "createDefaultProjectAudioState",
  "addProjectAudioResource",
  "setBackgroundAudio",
  "upsertAudioCue",
  "removeAudioCue",
  "startAudioCue",
  "stopAudioCue",
  "validateProjectAudioState",
] as const;

describe("audio public API surface", () => {
  it("re-exports ProjectAudio beside the existing Alice namespaces", async () => {
    const directProjectAudio = await import("../src/project-audio.js");
    const publicApi = PublicApi as Record<string, unknown>;

    expect(publicApi.ProjectAudio).toBe(directProjectAudio);
    expect(publicApi.Audio).toBeDefined();
    expect(publicApi.ProjectIo).toBeDefined();
    expect(publicApi.ProjectExport).toBeDefined();
    expect(publicApi.JointSystem).toBeDefined();
    expect(publicApi.CameraWorkflow).toBeDefined();
  });

  it("keeps project audio helpers reachable from the package root", () => {
    const publicApi = PublicApi as Record<string, unknown>;
    const projectAudio = publicApi.ProjectAudio as Record<string, unknown> | undefined;

    expect(projectAudio).toBeDefined();
    for (const exportName of PROJECT_AUDIO_EXPORTS) {
      expect(projectAudio?.[exportName], exportName).toBeTypeOf("function");
    }
  });

  it("exposes the audio route registration module for the server build", async () => {
    const audioRoutes = await import("../src/server/routes/audio-routes.js") as Record<string, unknown>;

    expect(audioRoutes.registerAudioRoutes).toBeTypeOf("function");
  });
});
