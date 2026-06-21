import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  readProject,
  writeProject,
  type AliceProjectArchive,
} from "../src/project-io.js";
import type { AliceProject } from "../src/a3p-parser.js";
import * as ProjectAudio from "../src/project-audio.js";
import * as EvidenceWriter from "../src/evidence-writer.js";
import type { AudioWorkflowEvidence } from "../src/evidence-writer.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

beforeAll(async () => {
  if (typeof globalThis.DOMParser === "undefined") {
    const { JSDOM } = await import("jsdom");
    globalThis.DOMParser = new JSDOM().window.DOMParser;
  }
});

interface PlaybackOutput {
  play(options: {
    volume: number;
    loop: boolean;
    cueId?: string;
    animationId?: string;
    timelineTimeSeconds?: number;
  }): void;
  stop(): void;
}

interface ProjectAudioPlaybackBridge {
  startBackgroundMusic(): void;
  updateAnimationPlayback(animationId: string, timeSeconds: number): void;
  resetAnimationPlayback(animationId: string): void;
  stopAll(): void;
  getTriggeredCueIds(): string[];
}

type ProjectAudioPlaybackBridgeFactory = (
  state: ProjectAudio.ProjectAudioState,
  options: {
    createOutput: (
      asset: ProjectAudio.ProjectAudioAsset,
      role: "background" | "cue",
    ) => PlaybackOutput;
  },
) => ProjectAudioPlaybackBridge;

const projectAudioModule = ProjectAudio as typeof ProjectAudio & {
  createProjectAudioPlaybackBridge?: ProjectAudioPlaybackBridgeFactory;
};

function requirePlaybackBridgeFactory(): ProjectAudioPlaybackBridgeFactory {
  expect(typeof projectAudioModule.createProjectAudioPlaybackBridge).toBe("function");
  return projectAudioModule.createProjectAudioPlaybackBridge!;
}

function createProject(): AliceProject {
  return {
    version: "3.10.0.0",
    projectName: "Audio Workflow Contract",
    sceneObjects: [],
    methods: [],
    types: [],
  };
}

function createArchive(
  manifest: Record<string, unknown> | null,
  resources: Map<string, Uint8Array>,
): AliceProjectArchive {
  const project = createProject();
  return {
    project,
    manifest,
    resources,
    resourceEntries: [],
    thumbnail: null,
    versionInfo: {
      originalAliceVersion: project.version,
      detectedAliceVersion: project.version,
      manifestVersion: null,
      xmlVersion: null,
      versionSource: "default",
      migrated: false,
      migrationSteps: [],
    },
  };
}

function createConfiguredAudioState(): ProjectAudio.ProjectAudioState {
  const state = ProjectAudio.createEmptyProjectAudioState();
  const theme = ProjectAudio.registerAudioAsset(state, {
    fileName: "theme.mp3",
    bytes: new Uint8Array([1, 2, 3, 4]),
    durationSeconds: 10,
  });
  const chime = ProjectAudio.registerAudioAsset(state, {
    fileName: "chime.wav",
    bytes: new Uint8Array([5, 6, 7, 8]),
    durationSeconds: 1.25,
  });
  ProjectAudio.setBackgroundMusic(state, {
    assetId: theme.id,
    volume: 0.75,
    loop: true,
  });
  ProjectAudio.addAudioCue(state, {
    id: "spin-start",
    assetId: chime.id,
    animationId: "scene.spin",
    timelineTimeSeconds: 0.75,
    volume: 0.5,
  });
  ProjectAudio.addAudioCue(state, {
    id: "spin-finish",
    assetId: chime.id,
    animationId: "scene.spin",
    timelineTimeSeconds: 1.5,
    volume: 0.8,
  });
  ProjectAudio.addAudioCue(state, {
    id: "jump-cue",
    assetId: chime.id,
    animationId: "scene.jump",
    timelineTimeSeconds: 0.25,
    volume: 0.4,
  });
  return state;
}

describe("Alice audio workflow playback bridge", () => {
  it("exports a project audio playback bridge factory", () => {
    expect(typeof projectAudioModule.createProjectAudioPlaybackBridge).toBe("function");
  });

  it("starts configured background music with persisted volume and looping", () => {
    const createProjectAudioPlaybackBridge = requirePlaybackBridgeFactory();
    const state = createConfiguredAudioState();
    const play = vi.fn();
    const stop = vi.fn();

    const bridge = createProjectAudioPlaybackBridge(state, {
      createOutput: (asset, role) => ({
        play: (options) => play({ assetId: asset.id, role, ...options }),
        stop,
      }),
    });

    bridge.startBackgroundMusic();

    expect(play).toHaveBeenCalledOnce();
    expect(play).toHaveBeenCalledWith({
      assetId: "audio-1",
      role: "background",
      volume: 0.75,
      loop: true,
    });
  });

  it("triggers animation cues when playback crosses cue times, once per playthrough", () => {
    const createProjectAudioPlaybackBridge = requirePlaybackBridgeFactory();
    const state = createConfiguredAudioState();
    const play = vi.fn();

    const bridge = createProjectAudioPlaybackBridge(state, {
      createOutput: (asset, role) => ({
        play: (options) => play({ assetId: asset.id, role, ...options }),
        stop: vi.fn(),
      }),
    });

    bridge.updateAnimationPlayback("scene.spin", 0.5);
    expect(play).not.toHaveBeenCalled();

    bridge.updateAnimationPlayback("scene.spin", 0.75);
    bridge.updateAnimationPlayback("scene.spin", 2);
    bridge.updateAnimationPlayback("scene.spin", 2);
    bridge.updateAnimationPlayback("scene.jump", 0.25);

    expect(play.mock.calls.map(([call]) => call)).toEqual([
      {
        assetId: "audio-2",
        role: "cue",
        volume: 0.5,
        loop: false,
        cueId: "spin-start",
        animationId: "scene.spin",
        timelineTimeSeconds: 0.75,
      },
      {
        assetId: "audio-2",
        role: "cue",
        volume: 0.8,
        loop: false,
        cueId: "spin-finish",
        animationId: "scene.spin",
        timelineTimeSeconds: 1.5,
      },
      {
        assetId: "audio-2",
        role: "cue",
        volume: 0.4,
        loop: false,
        cueId: "jump-cue",
        animationId: "scene.jump",
        timelineTimeSeconds: 0.25,
      },
    ]);
    expect(bridge.getTriggeredCueIds()).toEqual([
      "spin-start",
      "spin-finish",
      "jump-cue",
    ]);

    bridge.resetAnimationPlayback("scene.spin");
    bridge.updateAnimationPlayback("scene.spin", 2);

    expect(play.mock.calls.slice(3).map(([call]) => call)).toEqual([
      {
        assetId: "audio-2",
        role: "cue",
        volume: 0.5,
        loop: false,
        cueId: "spin-start",
        animationId: "scene.spin",
        timelineTimeSeconds: 0.75,
      },
      {
        assetId: "audio-2",
        role: "cue",
        volume: 0.8,
        loop: false,
        cueId: "spin-finish",
        animationId: "scene.spin",
        timelineTimeSeconds: 1.5,
      },
    ]);
  });
});

describe("Alice audio workflow project persistence", () => {
  it("round-trips supported audio assets, background music, cues, and resource bytes", async () => {
    const state = createConfiguredAudioState();
    const themeBytes = new Uint8Array([1, 2, 3, 4]);
    const chimeBytes = new Uint8Array([5, 6, 7, 8]);
    const manifest = ProjectAudio.mergeAudioManifest(null, state);
    const resources = new Map<string, Uint8Array>([
      ["resources/audio/audio-1.mp3", themeBytes],
      ["resources/audio/audio-2.wav", chimeBytes],
    ]);

    const bytes = await writeProject(createArchive(manifest, resources));
    const reloaded = await readProject(bytes);

    expect(ProjectAudio.applyAudioManifest(reloaded.manifest)).toEqual(state);
    expect(reloaded.resources.get("resources/audio/audio-1.mp3")).toEqual(themeBytes);
    expect(reloaded.resources.get("resources/audio/audio-2.wav")).toEqual(chimeBytes);
  });

  it("rejects persisted audio assets whose resource path is not a supported audio file", () => {
    expect(() => ProjectAudio.applyAudioManifest({
      [ProjectAudio.AUDIO_MANIFEST_KEY]: {
        version: 1,
        assets: [{
          id: "audio-1",
          name: "theme.mp3",
          format: "mp3",
          resourcePath: "resources/audio/theme.flac",
          sizeBytes: 4,
          durationSeconds: 10,
        }],
        backgroundMusic: null,
        cues: [],
      },
    })).toThrow(/resourcePath.*supported audio/i);
  });
});

describe("Alice audio workflow end-to-end evidence contract", () => {
  it("records playback synchronization proof alongside storage and reload proof", () => {
    const evidenceDir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-audio-evidence-"));
    const evidence: AudioWorkflowEvidence & {
      playback: {
        backgroundMusicStarted: boolean;
        triggeredCueIds: readonly string[];
        synchronizedAnimationIds: readonly string[];
      };
    } = {
      supportedFormats: [".mp3", ".wav", ".ogg", ".m4a"],
      assetCount: 2,
      assetNames: ["theme.mp3", "chime.wav"],
      backgroundMusicConfigured: true,
      cueCount: 2,
      cueIds: ["spin-start", "spin-finish"],
      savedProjectArtifact: "saved-project.a3p",
      reloaded: true,
      playback: {
        backgroundMusicStarted: true,
        triggeredCueIds: ["spin-start", "spin-finish"],
        synchronizedAnimationIds: ["scene.spin"],
      },
    };

    try {
      const artifact = EvidenceWriter.writeAudioWorkflowEvidence(evidenceDir, evidence);
      const written = JSON.parse(fs.readFileSync(artifact, "utf-8"));

      expect(written).toMatchObject({
        schema_version: "alice.audio-workflow/v1",
        source: "alice-web",
        status: "proved",
        supported_formats: [".mp3", ".wav", ".ogg", ".m4a"],
        asset_count: 2,
        background_music_configured: true,
        cue_count: 2,
        saved_project_artifact: "saved-project.a3p",
        reloaded: true,
        playback: {
          background_music_started: true,
          triggered_cue_ids: ["spin-start", "spin-finish"],
          synchronized_animation_ids: ["scene.spin"],
        },
      });
      expect(typeof written.timestamp).toBe("number");
      expect(JSON.stringify(written)).not.toContain("LookingGlass");
      expect(JSON.stringify(written)).not.toContain("lookingglass");
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });
});
