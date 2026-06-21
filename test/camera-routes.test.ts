import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { createServer } from "../src/server.js";
import { LOCAL_API_TOKEN_HEADER } from "../src/server/security.js";

const TEST_LOCAL_API_TOKEN = "test-local-api-token";
const LOOKINGGLASS_LOCAL_API_HEADER = "X-LookingGlass-Local-Api-Token";
const CAMERA_SCHEMA_VERSION = "eatme.alice-camera-workflow-state/v1";

type CameraVector3 = {
  x: number;
  y: number;
  z: number;
};

type CameraStateResponse = {
  schema_version: string;
  status: "ok";
  operation: string;
  camera: {
    mode: "orbit" | "first-person";
    position: CameraVector3;
    target: CameraVector3;
    up: CameraVector3;
    yawDegrees: number;
    pitchDegrees: number;
    rollDegrees: number;
    fieldOfViewDegrees: number;
    activePreset: string | null;
  };
  markers: Array<{
    id: string;
    name: string;
    camera: CameraStateResponse["camera"];
    createdAt: string;
  }>;
  marker?: CameraStateResponse["markers"][number];
  activeMarkerId: string | null;
};

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alice-camera-routes-"));
  tempDirs.push(dir);
  return dir;
}

function createTestServer() {
  return createServer({
    port: 0,
    evidenceDir: makeTempDir(),
    localApiToken: TEST_LOCAL_API_TOKEN,
  });
}

function localGet(app: ReturnType<typeof createServer>, route: string) {
  return request(app)
    .get(route)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function localPost(app: ReturnType<typeof createServer>, route: string) {
  return request(app)
    .post(route)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function localDelete(app: ReturnType<typeof createServer>, route: string) {
  return request(app)
    .delete(route)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN)
    .send({});
}

function distance(left: CameraVector3, right: CameraVector3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function expectCameraEnvelope(body: CameraStateResponse, operation: string): void {
  expect(body.schema_version).toBe(CAMERA_SCHEMA_VERSION);
  expect(body.status).toBe("ok");
  expect(body.operation).toBe(operation);
  expect(body.camera).toEqual({
    mode: expect.stringMatching(/^(orbit|first-person)$/),
    position: {
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
    },
    target: {
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
    },
    up: {
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number),
    },
    yawDegrees: expect.any(Number),
    pitchDegrees: expect.any(Number),
    rollDegrees: expect.any(Number),
    fieldOfViewDegrees: expect.any(Number),
    activePreset: body.camera.activePreset,
  });
  expect(Array.isArray(body.markers)).toBe(true);
  expect(body).toHaveProperty("activeMarkerId");
  expect(JSON.stringify(body)).not.toContain(TEST_LOCAL_API_TOKEN);
  expect(JSON.stringify(body)).not.toContain("LookingGlass");
  expect(JSON.stringify(body)).not.toContain("lookingglass");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("camera REST routes", () => {
  it("requires the Alice local API token for camera read and write routes", async () => {
    const app = createTestServer();

    await request(app).get("/api/camera/state").expect(401);
    await request(app)
      .get("/api/camera/state")
      .set(LOCAL_API_TOKEN_HEADER, "wrong-token")
      .expect(401);
    await request(app).get("/api/camera/markers").expect(401);
    await request(app)
      .post("/api/camera/move")
      .set(LOOKINGGLASS_LOCAL_API_HEADER, TEST_LOCAL_API_TOKEN)
      .send({ forward: 1 })
      .expect(401);
  });

  it("returns the default Alice home camera state after launch", async () => {
    const app = createTestServer();

    await localPost(app, "/api/launch").send({}).expect(200);
    const response = await localGet(app, "/api/camera/state").expect(200);

    expectCameraEnvelope(response.body, "state");
    expect(response.body.camera).toMatchObject({
      mode: "orbit",
      position: { x: 0, y: 5, z: 20 },
      target: { x: 0, y: 1, z: 0 },
      up: { x: 0, y: 1, z: 0 },
      rollDegrees: 0,
      fieldOfViewDegrees: 60,
      activePreset: "home",
    });
    expect(response.body.markers).toEqual([]);
    expect(response.body.activeMarkerId).toBeNull();
  });

  it("moves, pans, zooms, focuses, and orbits through the shared workflow state", async () => {
    const app = createTestServer();
    await localPost(app, "/api/launch").send({}).expect(200);
    const initial = (await localGet(app, "/api/camera/state").expect(200)).body as CameraStateResponse;

    const moved = (await localPost(app, "/api/camera/move")
      .send({ forward: 2, right: 1, up: 0.5 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(moved, "move");
    expect(moved.camera.activePreset).toBeNull();
    expect(distance(moved.camera.position, moved.camera.target)).toBeCloseTo(
      distance(initial.camera.position, initial.camera.target),
      5,
    );

    const panned = (await localPost(app, "/api/camera/pan")
      .send({ right: -1, up: 0.25 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(panned, "pan");
    expect(panned.camera.position).not.toEqual(moved.camera.position);
    expect(distance(panned.camera.position, panned.camera.target)).toBeCloseTo(
      distance(moved.camera.position, moved.camera.target),
      5,
    );

    const zoomed = (await localPost(app, "/api/camera/zoom")
      .send({ delta: -2 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(zoomed, "zoom");
    expect(distance(zoomed.camera.position, zoomed.camera.target)).toBeLessThan(
      distance(panned.camera.position, panned.camera.target),
    );

    const focused = (await localPost(app, "/api/camera/focus")
      .send({ target: { x: 4, y: 2, z: -3 }, distance: 12 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(focused, "focus");
    expect(focused.camera.target).toEqual({ x: 4, y: 2, z: -3 });
    expect(distance(focused.camera.position, focused.camera.target)).toBeCloseTo(12, 5);

    const orbited = (await localPost(app, "/api/camera/orbit")
      .send({ yawDegrees: 30, pitchDegrees: -15 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(orbited, "orbit");
    expect(orbited.camera.yawDegrees).toBeCloseTo(focused.camera.yawDegrees + 30, 5);
    expect(orbited.camera.position).not.toEqual(focused.camera.position);
  });

  it("applies presets, saves markers, restores marker snapshots, and deletes markers", async () => {
    const app = createTestServer();
    await localPost(app, "/api/launch").send({}).expect(200);

    const front = (await localPost(app, "/api/camera/preset")
      .send({ preset: "front" })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(front, "preset");
    expect(front.camera.activePreset).toBe("front");

    const saved = (await localPost(app, "/api/camera/markers")
      .send({ name: "  Intro view  " })
      .expect(200)).body as CameraStateResponse;
    const markerId = saved.marker?.id ?? "";
    expectCameraEnvelope(saved, "save-marker");
    expect(saved.marker).toMatchObject({
      id: expect.stringMatching(/^camera-marker-/),
      name: "Intro view",
      camera: front.camera,
      createdAt: expect.any(String),
    });
    expect(saved.activeMarkerId).toBe(markerId);
    expect(saved.markers).toHaveLength(1);

    await localPost(app, "/api/camera/preset").send({ preset: "top" }).expect(200);
    const restored = (await localPost(app, `/api/camera/markers/${markerId}/restore`)
      .send({})
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(restored, "restore-marker");
    expect(restored.camera).toEqual(front.camera);
    expect(restored.activeMarkerId).toBe(markerId);

    const listed = (await localGet(app, "/api/camera/markers").expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(listed, "markers");
    expect(listed.markers).toHaveLength(1);
    expect(listed.markers[0]?.id).toBe(markerId);

    const deleted = (await localDelete(app, `/api/camera/markers/${markerId}`).expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(deleted, "delete-marker");
    expect(deleted.markers).toEqual([]);
    expect(deleted.activeMarkerId).toBeNull();
  });

  it("supports first-person mode without pointer lock and zooms field of view there", async () => {
    const app = createTestServer();
    await localPost(app, "/api/launch").send({}).expect(200);

    const firstPerson = (await localPost(app, "/api/camera/mode")
      .send({ mode: "first-person" })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(firstPerson, "mode");
    expect(firstPerson.camera.mode).toBe("first-person");
    expect(firstPerson.camera.activePreset).toBeNull();

    const moved = (await localPost(app, "/api/camera/move")
      .send({ forward: 2, right: 1 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(moved, "move");
    expect(moved.camera.mode).toBe("first-person");
    expect(moved.camera.position).not.toEqual(firstPerson.camera.position);
    expect(moved.camera.target).not.toEqual(firstPerson.camera.target);

    const zoomed = (await localPost(app, "/api/camera/zoom")
      .send({ delta: -10 })
      .expect(200)).body as CameraStateResponse;
    expectCameraEnvelope(zoomed, "zoom");
    expect(zoomed.camera.mode).toBe("first-person");
    expect(zoomed.camera.fieldOfViewDegrees).toBeLessThan(moved.camera.fieldOfViewDegrees);
    expect(zoomed.camera.position).toEqual(moved.camera.position);
  });

  it("rejects invalid requests with structured errors and leaves state unchanged", async () => {
    const app = createTestServer();
    await localPost(app, "/api/launch").send({}).expect(200);
    const before = (await localGet(app, "/api/camera/state").expect(200)).body as CameraStateResponse;

    const invalidMove = await localPost(app, "/api/camera/move")
      .send({ forward: "1" })
      .expect(400);
    expect(Object.keys(invalidMove.body)).toEqual(["error"]);
    expect(invalidMove.body.error).toMatch(/finite numeric/i);

    await localPost(app, "/api/camera/preset")
      .send({ preset: "over-the-shoulder" })
      .expect(400);
    await localPost(app, "/api/camera/mode")
      .send({ mode: "cinematic" })
      .expect(400);
    await localPost(app, "/api/camera/markers")
      .send({ name: "x".repeat(81) })
      .expect(400);

    const after = (await localGet(app, "/api/camera/state").expect(200)).body as CameraStateResponse;
    expect(after.camera).toEqual(before.camera);
    expect(after.markers).toEqual(before.markers);
    expect(after.activeMarkerId).toEqual(before.activeMarkerId);
  });

  it("returns 404 for missing camera markers without stack traces", async () => {
    const app = createTestServer();
    await localPost(app, "/api/launch").send({}).expect(200);

    const restore = await localPost(app, "/api/camera/markers/missing-marker/restore")
      .send({})
      .expect(404);
    expect(restore.body).toEqual({ error: "Camera marker not found" });
    expect(JSON.stringify(restore.body)).not.toContain("stack");

    const deleted = await localDelete(app, "/api/camera/markers/missing-marker").expect(404);
    expect(deleted.body).toEqual({ error: "Camera marker not found" });
    expect(JSON.stringify(deleted.body)).not.toContain("stack");
  });
});
