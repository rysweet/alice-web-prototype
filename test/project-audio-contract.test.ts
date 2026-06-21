// test/project-audio-contract.test.ts
import { describe, expect, it } from "vitest";

const AUDIO_MANIFEST_VERSION = "alice-web.audio-manifest/v1";

interface ProjectAudioResource {
  id: string;
  name: string;
  path: string;
  format: string;
  sizeBytes: number;
  duration: number;
  decodeStatus: "decoded" | "decode-unavailable" | "decode-failed";
}

interface BackgroundAudioState {
  resourceId: string | null;
  enabled: boolean;
  loop: boolean;
  volume: number;
  pan: number;
}

interface AudioCue {
  id: string;
  name: string;
  resourceId: string;
  trigger: "sceneActivated" | "manual" | "worldRun";
  loop: boolean;
  volume: number;
  pan: number;
}

interface ProjectAudioState {
  manifestVersion: typeof AUDIO_MANIFEST_VERSION;
  resources: ProjectAudioResource[];
  background: BackgroundAudioState;
  cues: AudioCue[];
  activeCueIds: string[];
}

interface ProjectAudioApi {
  createDefaultProjectAudioState: () => ProjectAudioState;
  addProjectAudioResource: (
    state: ProjectAudioState,
    resource: ProjectAudioResource,
  ) => ProjectAudioState;
  setBackgroundAudio: (
    state: ProjectAudioState,
    background: Partial<BackgroundAudioState> & { resourceId: string | null },
  ) => ProjectAudioState;
  upsertAudioCue: (state: ProjectAudioState, cue: AudioCue) => ProjectAudioState;
  removeAudioCue: (state: ProjectAudioState, cueId: string) => ProjectAudioState;
  startAudioCue: (state: ProjectAudioState, cueId: string) => ProjectAudioState;
  stopAudioCue: (state: ProjectAudioState, cueId: string) => ProjectAudioState;
  validateProjectAudioState: (state: ProjectAudioState) => ProjectAudioState;
}

function expectFunction(module: Record<string, unknown>, key: keyof ProjectAudioApi) {
  const value = module[key];
  expect(value, `${String(key)} should be exported`).toBeTypeOf("function");
  return value as (...args: unknown[]) => unknown;
}

async function loadProjectAudioApi(): Promise<ProjectAudioApi> {
  const module = await import("../src/project-audio.js") as Record<string, unknown>;
  return {
    createDefaultProjectAudioState: expectFunction(module, "createDefaultProjectAudioState") as ProjectAudioApi["createDefaultProjectAudioState"],
    addProjectAudioResource: expectFunction(module, "addProjectAudioResource") as ProjectAudioApi["addProjectAudioResource"],
    setBackgroundAudio: expectFunction(module, "setBackgroundAudio") as ProjectAudioApi["setBackgroundAudio"],
    upsertAudioCue: expectFunction(module, "upsertAudioCue") as ProjectAudioApi["upsertAudioCue"],
    removeAudioCue: expectFunction(module, "removeAudioCue") as ProjectAudioApi["removeAudioCue"],
    startAudioCue: expectFunction(module, "startAudioCue") as ProjectAudioApi["startAudioCue"],
    stopAudioCue: expectFunction(module, "stopAudioCue") as ProjectAudioApi["stopAudioCue"],
    validateProjectAudioState: expectFunction(module, "validateProjectAudioState") as ProjectAudioApi["validateProjectAudioState"],
  };
}

function themeResource(overrides: Partial<ProjectAudioResource> = {}): ProjectAudioResource {
  return {
    id: "theme",
    name: "theme.wav",
    path: "resources/audio/theme.wav",
    format: "wav",
    sizeBytes: 44,
    duration: 0,
    decodeStatus: "decode-unavailable",
    ...overrides,
  };
}

function introCue(overrides: Partial<AudioCue> = {}): AudioCue {
  return {
    id: "intro-chime",
    name: "Intro chime",
    resourceId: "theme",
    trigger: "manual",
    loop: false,
    volume: 1,
    pan: 0,
    ...overrides,
  };
}

describe("ProjectAudio state helpers", () => {
  it("exports the project audio state helper surface", async () => {
    const api = await loadProjectAudioApi();

    expect(api.createDefaultProjectAudioState).toBeTypeOf("function");
    expect(api.addProjectAudioResource).toBeTypeOf("function");
    expect(api.setBackgroundAudio).toBeTypeOf("function");
    expect(api.upsertAudioCue).toBeTypeOf("function");
    expect(api.removeAudioCue).toBeTypeOf("function");
    expect(api.startAudioCue).toBeTypeOf("function");
    expect(api.stopAudioCue).toBeTypeOf("function");
    expect(api.validateProjectAudioState).toBeTypeOf("function");
  });

  it("creates an empty Alice audio state with stable defaults", async () => {
    const api = await loadProjectAudioApi();

    expect(api.createDefaultProjectAudioState()).toEqual({
      manifestVersion: AUDIO_MANIFEST_VERSION,
      resources: [],
      background: {
        resourceId: null,
        enabled: false,
        loop: false,
        volume: 1,
        pan: 0,
      },
      cues: [],
      activeCueIds: [],
    });
  });

  it("adds resources, background audio, and cue bindings without mutating input state", async () => {
    const api = await loadProjectAudioApi();
    const empty = api.createDefaultProjectAudioState();

    const withResource = api.addProjectAudioResource(empty, themeResource());
    const withBackground = api.setBackgroundAudio(withResource, {
      resourceId: "theme",
      enabled: true,
      loop: true,
      volume: 0.35,
      pan: 0,
    });
    const withCue = api.upsertAudioCue(withBackground, introCue());

    expect(empty.resources).toEqual([]);
    expect(empty.background.resourceId).toBeNull();
    expect(withResource.resources).toEqual([themeResource()]);
    expect(withBackground.background).toEqual({
      resourceId: "theme",
      enabled: true,
      loop: true,
      volume: 0.35,
      pan: 0,
    });
    expect(withCue.cues).toEqual([introCue()]);
    expect(withCue.activeCueIds).toEqual([]);
  });

  it("tracks active cue IDs and removes stopped or deleted cues", async () => {
    const api = await loadProjectAudioApi();
    const ready = api.upsertAudioCue(
      api.addProjectAudioResource(api.createDefaultProjectAudioState(), themeResource()),
      introCue(),
    );

    const playing = api.startAudioCue(ready, "intro-chime");
    const stopped = api.stopAudioCue(playing, "intro-chime");
    const removed = api.removeAudioCue(playing, "intro-chime");

    expect(playing.activeCueIds).toEqual(["intro-chime"]);
    expect(stopped.activeCueIds).toEqual([]);
    expect(removed.cues).toEqual([]);
    expect(removed.activeCueIds).toEqual([]);
  });

  it("rejects unsafe paths, missing resource references, and invalid mix values", async () => {
    const api = await loadProjectAudioApi();
    const empty = api.createDefaultProjectAudioState();
    const withResource = api.addProjectAudioResource(empty, themeResource());

    expect(() =>
      api.addProjectAudioResource(empty, themeResource({ path: "../theme.wav" })),
    ).toThrow(/path/i);
    expect(() =>
      api.setBackgroundAudio(empty, { resourceId: "missing", enabled: true }),
    ).toThrow(/resource/i);
    expect(() =>
      api.upsertAudioCue(withResource, introCue({ volume: 2 })),
    ).toThrow(/volume/i);
    expect(() =>
      api.startAudioCue(withResource, "missing-cue"),
    ).toThrow(/cue/i);
  });

  it("validates and copies hydrated audio state before server or archive use", async () => {
    const api = await loadProjectAudioApi();
    const state: ProjectAudioState = {
      manifestVersion: AUDIO_MANIFEST_VERSION,
      resources: [themeResource()],
      background: {
        resourceId: "theme",
        enabled: true,
        loop: true,
        volume: 0.35,
        pan: 0,
      },
      cues: [introCue()],
      activeCueIds: ["intro-chime"],
    };

    const validated = api.validateProjectAudioState(state);

    expect(validated).toEqual(state);
    expect(validated).not.toBe(state);
    expect(validated.resources).not.toBe(state.resources);
    expect(validated.cues).not.toBe(state.cues);
  });
});
