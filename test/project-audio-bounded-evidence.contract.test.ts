import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { writeAudioWorkflowEvidence } from "../src/evidence-writer.js";

describe("project audio bounded evidence", () => {
  it("records audio support as bounded metadata and playback-bridge evidence, not native playback", () => {
    const evidenceDir = path.join(
      process.cwd(),
      "target",
      "test-work",
      "alice-audio-bounded-evidence",
    );
    fs.rmSync(evidenceDir, { recursive: true, force: true });
    fs.mkdirSync(evidenceDir, { recursive: true });

    try {
      const artifact = writeAudioWorkflowEvidence(evidenceDir, {
        supportedFormats: [".mp3", ".wav"],
        assetCount: 1,
        assetNames: ["theme.wav"],
        backgroundMusicConfigured: true,
        cueCount: 1,
        cueIds: ["intro-cue"],
        savedProjectArtifact: "saved-project.a3p",
        reloaded: true,
        playback: {
          backgroundMusicStarted: true,
          triggeredCueIds: ["intro-cue"],
          synchronizedAnimationIds: ["scene.intro"],
        },
      });
      const written = JSON.parse(fs.readFileSync(artifact, "utf-8"));

      expect(written).toMatchObject({
        schema_version: "alice.audio-workflow/v1",
        source: "alice-web",
        status: "proved",
        support_level: "metadata-and-playback-bridge",
        playback: {
          mode: "simulated-output-bridge",
          native_audio_playback: false,
          background_music_started: true,
          triggered_cue_ids: ["intro-cue"],
          synchronized_animation_ids: ["scene.intro"],
        },
      });
      expect(written.doesNotClaim).toEqual(expect.arrayContaining([
        "native audio playback",
        "real speaker output in the browser or operating system",
        "full audio authoring pipeline",
      ]));
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });
});
