// test/project-audio-project-io-contract.test.ts
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { writeA3P } from "../src/a3p-writer/archive.js";
import { createEmptyWorldProject } from "../src/project-template.js";
import { readProject, writeProject } from "../src/project-io.js";

const AUDIO_MANIFEST_VERSION = "alice-web.audio-manifest/v1";
const AUDIO_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const AUDIO_PATH = "resources/audio/theme.wav";

const ALICE_AUDIO = {
  manifestVersion: AUDIO_MANIFEST_VERSION as typeof AUDIO_MANIFEST_VERSION,
  resources: [
    {
      id: "theme",
      name: "theme.wav",
      path: AUDIO_PATH,
      format: "wav" as const,
      sizeBytes: AUDIO_BYTES.length,
      duration: 0,
      decodeStatus: "decode-unavailable" as const,
    },
  ],
  background: {
    resourceId: "theme",
    enabled: true,
    loop: true,
    volume: 0.35,
    pan: 0,
  },
  cues: [
    {
      id: "intro-chime",
      name: "Intro chime",
      resourceId: "theme",
      trigger: "manual" as const,
      loop: false,
      volume: 1,
      pan: 0,
    },
  ],
  activeCueIds: [],
};

const MANIFEST_ALICE_AUDIO = {
  schemaVersion: AUDIO_MANIFEST_VERSION as typeof AUDIO_MANIFEST_VERSION,
  resources: ALICE_AUDIO.resources.map(({ decodeStatus: _decodeStatus, ...resource }) => resource),
  background: ALICE_AUDIO.background,
  cues: ALICE_AUDIO.cues,
};

type ProjectArchive = Awaited<ReturnType<typeof readProject>>;
type AudioProjectArchive = ProjectArchive & {
  aliceAudio: typeof ALICE_AUDIO;
};

async function createArchiveWithManifestAudio(): Promise<Uint8Array> {
  return writeA3P(createEmptyWorldProject({ projectName: "AudioProject" }), {
    manifest: {
      aliceVersion: "3.10.0.0",
      aliceAudio: MANIFEST_ALICE_AUDIO,
    },
    resources: new Map([[AUDIO_PATH, AUDIO_BYTES]]),
  });
}

describe("Project IO audio persistence", () => {
  it("hydrates manifest aliceAudio into a validated project audio state", async () => {
    const archive = await readProject(await createArchiveWithManifestAudio()) as AudioProjectArchive;

    expect(archive.aliceAudio).toEqual(ALICE_AUDIO);
    expect(archive.resources.get(AUDIO_PATH)).toEqual(AUDIO_BYTES);
    expect(archive.resourceEntries).toEqual(
      expect.arrayContaining([
        { path: AUDIO_PATH, kind: "audio", size: AUDIO_BYTES.length },
      ]),
    );
  });

  it("writes aliceAudio state into manifest.json and keeps bytes under resources/audio", async () => {
    const baseArchive = await readProject(
      await writeA3P(createEmptyWorldProject({ projectName: "AudioProject" }), {
        manifest: { aliceVersion: "3.10.0.0" },
      }),
    );
    const archive: AudioProjectArchive = {
      ...baseArchive,
      manifest: { aliceVersion: "3.10.0.0" },
      resources: new Map([[AUDIO_PATH, AUDIO_BYTES]]),
      aliceAudio: ALICE_AUDIO,
    };

    const bytes = await writeProject(archive);
    const zip = await JSZip.loadAsync(bytes);
    const manifestText = await zip.file("manifest.json")?.async("string");
    const writtenAudio = await zip.file(AUDIO_PATH)?.async("uint8array");

    expect(manifestText).toBeDefined();
    expect(JSON.parse(manifestText ?? "{}").aliceAudio).toEqual(MANIFEST_ALICE_AUDIO);
    expect(writtenAudio).toEqual(AUDIO_BYTES);

    const roundTrip = await readProject(bytes) as AudioProjectArchive;
    expect(roundTrip.aliceAudio).toEqual(ALICE_AUDIO);
  });

  it("rejects audio manifest entries that point outside project resources", async () => {
    const bytes = await writeA3P(createEmptyWorldProject({ projectName: "AudioProject" }), {
      manifest: {
        aliceVersion: "3.10.0.0",
        aliceAudio: MANIFEST_ALICE_AUDIO,
      },
      resources: new Map(),
    });

    await expect(readProject(bytes)).rejects.toMatchObject({
      code: "missing-audio-resource",
    });
  });
});
