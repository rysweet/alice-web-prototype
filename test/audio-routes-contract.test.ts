// test/audio-routes-contract.test.ts
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import type { Express } from "express";
import request from "supertest";
import { createServer } from "../src/server.js";
import { LOCAL_API_TOKEN_HEADER } from "../src/server/security.js";

const TEST_LOCAL_API_TOKEN = "test-local-api-token";
const OLD_LOCAL_API_HEADER = "X-LookingGlass-Local-Api-Token";
const AUDIO_SCHEMA_VERSION = "eatme.alice-audio-workflow-state/v1";
const AUDIO_MANIFEST_VERSION = "alice-web.audio-manifest/v1";

interface AudioEnvelope {
  schema_version: typeof AUDIO_SCHEMA_VERSION;
  status: "ok";
  operation: string;
  audio: {
    manifestVersion: typeof AUDIO_MANIFEST_VERSION;
    resources: Array<{
      id: string;
      name: string;
      path: string;
      format: string;
      sizeBytes: number;
      duration: number;
      decodeStatus: "decoded" | "decode-unavailable" | "decode-failed";
    }>;
    background: {
      resourceId: string | null;
      enabled: boolean;
      loop: boolean;
      volume: number;
      pan: number;
    };
    cues: Array<{
      id: string;
      name: string;
      resourceId: string;
      trigger: "sceneActivated" | "manual" | "worldRun";
      loop: boolean;
      volume: number;
      pan: number;
    }>;
    activeCueIds: string[];
  };
  evidenceArtifact?: string;
}

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-audio-routes-"));
  tempDirs.push(dir);
  return dir;
}

function createTestServer(evidenceDir = makeTempDir()): Express {
  return createServer({
    port: 0,
    evidenceDir,
    localApiToken: TEST_LOCAL_API_TOKEN,
  });
}

function localGet(app: Express, route: string) {
  return request(app)
    .get(route)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function localPost(app: Express, route: string) {
  return request(app)
    .post(route)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function localDelete(app: Express, route: string) {
  return request(app)
    .delete(route)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN)
    .send({});
}

function expectAudioEnvelope(body: AudioEnvelope, operation: string): void {
  expect(body.schema_version).toBe(AUDIO_SCHEMA_VERSION);
  expect(body.status).toBe("ok");
  expect(body.operation).toBe(operation);
  expect(body.audio.manifestVersion).toBe(AUDIO_MANIFEST_VERSION);
  expect(Array.isArray(body.audio.resources)).toBe(true);
  expect(Array.isArray(body.audio.cues)).toBe(true);
  expect(Array.isArray(body.audio.activeCueIds)).toBe(true);
  expect(JSON.stringify(body)).not.toContain(TEST_LOCAL_API_TOKEN);
  expect(JSON.stringify(body)).not.toMatch(/lookingglass/i);
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("audio REST routes", () => {
  it("requires the Alice local API token for audio read and write routes", async () => {
    const app = createTestServer();

    await request(app).get("/api/audio/state").expect(401);
    await request(app)
      .get("/api/audio/state")
      .set(LOCAL_API_TOKEN_HEADER, "wrong-token")
      .expect(401);
    await request(app)
      .post("/api/audio/resources")
      .set(OLD_LOCAL_API_HEADER, TEST_LOCAL_API_TOKEN)
      .send({
        id: "theme",
        name: "theme.wav",
        path: "resources/audio/theme.wav",
        format: "wav",
        bytesBase64: Buffer.from("RIFF").toString("base64"),
      })
      .expect(401);
  });

  it("returns an empty Alice audio state after launch", async () => {
    const app = createTestServer();

    await localPost(app, "/api/launch").send({}).expect(200);
    const response = await localGet(app, "/api/audio/state").expect(200);

    expectAudioEnvelope(response.body, "state");
    expect(response.body.audio).toEqual({
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

  it("adds resources, background audio, cue bindings, and cue play state through one shared server state", async () => {
    const evidenceDir = makeTempDir();
    const app = createTestServer(evidenceDir);
    await localPost(app, "/api/launch").send({}).expect(200);

    const resource = (await localPost(app, "/api/audio/resources")
      .send({
        id: "theme",
        name: "theme.wav",
        path: "resources/audio/theme.wav",
        format: "wav",
        bytesBase64: Buffer.from("RIFF").toString("base64"),
        duration: 0,
      })
      .expect(200)).body as AudioEnvelope;
    expectAudioEnvelope(resource, "add-resource");
    expect(resource.audio.resources).toEqual([
      {
        id: "theme",
        name: "theme.wav",
        path: "resources/audio/theme.wav",
        format: "wav",
        sizeBytes: 4,
        duration: 0,
        decodeStatus: "decode-unavailable",
      },
    ]);

    const background = (await localPost(app, "/api/audio/background")
      .send({
        resourceId: "theme",
        enabled: true,
        loop: true,
        volume: 0.35,
        pan: 0,
      })
      .expect(200)).body as AudioEnvelope;
    expectAudioEnvelope(background, "set-background");
    expect(background.audio.background).toEqual({
      resourceId: "theme",
      enabled: true,
      loop: true,
      volume: 0.35,
      pan: 0,
    });

    const cue = (await localPost(app, "/api/audio/cues")
      .send({
        id: "intro-chime",
        name: "Intro chime",
        resourceId: "theme",
        trigger: "manual",
        loop: false,
        volume: 1,
        pan: 0,
      })
      .expect(200)).body as AudioEnvelope;
    expectAudioEnvelope(cue, "upsert-cue");
    expect(cue.audio.cues).toEqual([
      {
        id: "intro-chime",
        name: "Intro chime",
        resourceId: "theme",
        trigger: "manual",
        loop: false,
        volume: 1,
        pan: 0,
      },
    ]);

    const playing = (await localPost(app, "/api/audio/cues/intro-chime/play")
      .send({})
      .expect(200)).body as AudioEnvelope;
    expectAudioEnvelope(playing, "start-cue");
    expect(playing.audio.activeCueIds).toEqual(["intro-chime"]);

    const stopped = (await localPost(app, "/api/audio/cues/intro-chime/stop")
      .send({})
      .expect(200)).body as AudioEnvelope;
    expectAudioEnvelope(stopped, "stop-cue");
    expect(stopped.audio.activeCueIds).toEqual([]);

    const deleted = (await localDelete(app, "/api/audio/cues/intro-chime").expect(200)).body as AudioEnvelope;
    expectAudioEnvelope(deleted, "remove-cue");
    expect(deleted.audio.cues).toEqual([]);

    const evidencePath = path.join(evidenceDir, "alice-web", "audio-state.json");
    expect(fs.existsSync(evidencePath)).toBe(true);
    const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf-8"));
    expect(evidence).toMatchObject({
      schema_version: AUDIO_SCHEMA_VERSION,
      audio: deleted.audio,
    });
    expect(JSON.stringify(evidence)).not.toContain("bytesBase64");
    expect(JSON.stringify(evidence)).not.toContain(TEST_LOCAL_API_TOKEN);
  });

  it("returns client errors for unsafe paths and missing audio resources", async () => {
    const app = createTestServer();
    await localPost(app, "/api/launch").send({}).expect(200);

    const unsafePath = await localPost(app, "/api/audio/resources")
      .send({
        id: "theme",
        name: "theme.wav",
        path: "../theme.wav",
        format: "wav",
        bytesBase64: Buffer.from("RIFF").toString("base64"),
      })
      .expect(400);
    expect(unsafePath.body.error).toMatch(/path/i);

    const missingBackground = await localPost(app, "/api/audio/background")
      .send({
        resourceId: "missing",
        enabled: true,
      })
      .expect(400);
    expect(missingBackground.body.error).toMatch(/resource/i);

    const missingCue = await localPost(app, "/api/audio/cues/missing/play")
      .send({})
      .expect(404);
    expect(missingCue.body.error).toMatch(/cue/i);
  });
});
