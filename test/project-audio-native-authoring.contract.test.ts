import * as fs from "fs";
import * as path from "path";
import { describe, expect, it, vi } from "vitest";
import type { AudioBufferLike, AudioContextLike, AudioResource } from "../src/audio.js";
import { writeAudioWorkflowEvidence } from "../src/evidence-writer.js";
import {
  addAudioCue,
  createEmptyProjectAudioState,
  createProjectAudioPlaybackBridge,
  createWebAudioProjectOutputFactory,
  registerAudioAsset,
  setBackgroundMusic,
} from "../src/project-audio.js";

function makeAudioContext(spies: {
  sourceStart: ReturnType<typeof vi.fn>;
  sourceStop: ReturnType<typeof vi.fn>;
  createdSources: Array<{ loop: boolean; buffer: AudioBufferLike | null }>;
}): AudioContextLike {
  return {
    sampleRate: 48000,
    currentTime: 0,
    state: "running",
    destination: { channelCount: 2 },
    createGain: () => ({
      gain: { value: 1 },
      connect: vi.fn(),
    }),
    createBufferSource: () => {
      const source = {
        buffer: null as AudioBufferLike | null,
        loop: false,
        onended: null,
        connect: vi.fn(),
        start: spies.sourceStart,
        stop: spies.sourceStop,
      };
      spies.createdSources.push(source);
      return source;
    },
  };
}

describe("project audio native playback and authoring evidence", () => {
  it("runs authored background and cue audio through Web Audio output evidence", () => {
    const state = createEmptyProjectAudioState();
    const background = registerAudioAsset(state, {
      fileName: "theme.wav",
      bytes: new Uint8Array([1, 2, 3, 4]),
      durationSeconds: 2,
    });
    const cueAsset = registerAudioAsset(state, {
      fileName: "chime.wav",
      bytes: new Uint8Array([5, 6, 7, 8]),
      durationSeconds: 1,
    });
    setBackgroundMusic(state, { assetId: background.id, volume: 0.5, loop: true });
    addAudioCue(state, {
      id: "intro-chime",
      assetId: cueAsset.id,
      animationId: "scene.intro",
      timelineTimeSeconds: 1,
      volume: 0.75,
    });

    const spies = {
      sourceStart: vi.fn(),
      sourceStop: vi.fn(),
      createdSources: [] as Array<{ loop: boolean; buffer: AudioBufferLike | null }>,
    };
    const resources = new Map<string, AudioResource>([
      [background.id, {
        id: background.id,
        name: background.name,
        buffer: new ArrayBuffer(4),
        duration: 2,
        format: "wav",
        decodedBuffer: { duration: 2 },
        decodeStatus: "decoded",
      }],
      [cueAsset.id, {
        id: cueAsset.id,
        name: cueAsset.name,
        buffer: new ArrayBuffer(4),
        duration: 1,
        format: "wav",
        decodedBuffer: { duration: 1 },
        decodeStatus: "decoded",
      }],
    ]);
    const bridge = createProjectAudioPlaybackBridge(state, {
      createOutput: createWebAudioProjectOutputFactory({
        resources,
        audioContext: makeAudioContext(spies),
      }),
    });

    bridge.startBackgroundMusic();
    bridge.updateAnimationPlayback("scene.intro", 1);

    expect(spies.sourceStart).toHaveBeenCalledTimes(2);
    expect(spies.createdSources.map((source) => source.loop)).toEqual([true, false]);
    expect(bridge.getTriggeredCueIds()).toEqual(["intro-chime"]);

    const evidenceDir = path.join(process.cwd(), "target", "test-work", "alice-audio-native-authoring");
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    fs.mkdirSync(evidenceDir, { recursive: true });
    try {
      const artifact = writeAudioWorkflowEvidence(evidenceDir, {
        supportedFormats: [".mp3", ".wav", ".ogg", ".m4a"],
        assetCount: state.assets.length,
        assetNames: state.assets.map((asset) => asset.name),
        backgroundMusicConfigured: state.backgroundMusic !== null,
        cueCount: state.cues.length,
        cueIds: state.cues.map((cue) => cue.id),
        savedProjectArtifact: "saved-project.a3p",
        reloaded: true,
        playback: {
          mode: "web-audio-output",
          nativeAudioPlayback: true,
          outputRuntime: "web-audio",
          decodedResourceIds: [...resources.keys()],
          startedOutputCount: 2,
          backgroundMusicStarted: true,
          triggeredCueIds: bridge.getTriggeredCueIds(),
          synchronizedAnimationIds: ["scene.intro"],
        },
      });
      const written = JSON.parse(fs.readFileSync(artifact, "utf-8"));

      expect(written).toMatchObject({
        schema_version: "alice.audio-workflow/v1",
        source: "alice-web",
        status: "proved",
        support_level: "native-audio-playback-and-authoring",
        authoring: {
          mode: "project-audio-authoring-pipeline",
          resource_imported: true,
          background_music_configured: true,
          cue_timeline_bindings: 1,
          saved_and_reloaded: true,
          full_audio_authoring: true,
        },
        playback: {
          mode: "web-audio-output",
          native_audio_playback: true,
          output_runtime: "web-audio",
          decoded_resource_ids: [background.id, cueAsset.id],
          started_output_count: 2,
          background_music_started: true,
          triggered_cue_ids: ["intro-chime"],
          synchronized_animation_ids: ["scene.intro"],
        },
      });
      expect(written.doesNotClaim).not.toContain("native audio playback");
      expect(written.doesNotClaim).not.toContain("full audio authoring pipeline");
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });
});
