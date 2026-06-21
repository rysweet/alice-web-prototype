import { afterEach, describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { createServer } from "../src/server";
import { LOCAL_API_TOKEN_HEADER } from "../src/server/security";
import { readProject } from "../src/project-io";
import type { AliceObject, AliceProject } from "../src/a3p-parser";

const TEST_LOCAL_API_TOKEN = "test-local-api-token";
const GLB_BYTES = Buffer.from([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00]);
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface MaterialBinding {
  target: "surface";
  textureResourceId: string;
}

type ImportedAliceObject = AliceObject & {
  materialBindings?: MaterialBinding[];
};

type ImportedAliceProject = AliceProject & {
  importedAssets?: Array<Record<string, unknown>>;
  sceneObjects: ImportedAliceObject[];
};

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function createTestServer(evidenceDir: string) {
  return createServer({
    port: 0,
    evidenceDir,
    localApiToken: TEST_LOCAL_API_TOKEN,
  });
}

function localPost(app: ReturnType<typeof createServer>, apiPath: string) {
  return request(app)
    .post(apiPath)
    .set(LOCAL_API_TOKEN_HEADER, TEST_LOCAL_API_TOKEN);
}

function expectOnlyKeys(value: Record<string, unknown>, keys: string[]): void {
  expect(Object.keys(value).sort()).toEqual([...keys].sort());
}

function asImportedProject(project: AliceProject): ImportedAliceProject {
  return project as ImportedAliceProject;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("server imported model and texture workflow", () => {
  it("imports a GLB model, imports a PNG texture, applies it to a shape, and saves the resources", async () => {
    const evidenceDir = makeTempDir("alice-imported-asset-server-");
    const app = createTestServer(evidenceDir);

    await localPost(app, "/api/launch").send({}).expect(200);

    const model = await localPost(app, "/api/assets/import-model")
      .send({
        fileName: "Moon Rover.GLB",
        displayName: "Moon Rover",
        contentBase64: GLB_BYTES.toString("base64"),
      })
      .expect(200);
    expectOnlyKeys(model.body, ["status", "asset"]);
    expect(model.body).toEqual({
      status: "imported",
      asset: {
        id: "project/models/moon-rover.glb",
        kind: "model",
        name: "Moon Rover",
        fileName: "moon-rover.glb",
        resourcePath: "resources/models/moon-rover.glb",
        contentType: "model/gltf-binary",
        byteLength: GLB_BYTES.byteLength,
      },
    });

    const texture = await localPost(app, "/api/assets/import-texture")
      .send({
        fileName: "Checker.PNG",
        displayName: "Checker",
        contentBase64: PNG_BYTES.toString("base64"),
      })
      .expect(200);
    expect(texture.body).toEqual({
      status: "imported",
      asset: {
        id: "project/textures/checker.png",
        kind: "texture",
        name: "Checker",
        fileName: "checker.png",
        resourcePath: "resources/textures/checker.png",
        contentType: "image/png",
        byteLength: PNG_BYTES.byteLength,
      },
    });

    await localPost(app, "/api/scene/add-object")
      .send({ className: "org.lgna.story.SBox", name: "box" })
      .expect(200);

    const applied = await localPost(app, "/api/scene/apply-texture")
      .send({
        objectName: "box",
        textureResourceId: "project/textures/checker.png",
        target: "surface",
      })
      .expect(200);
    expect(applied.body).toEqual({
      status: "applied",
      objectName: "box",
      materialBindings: [
        {
          target: "surface",
          textureResourceId: "project/textures/checker.png",
        },
      ],
    });

    await localPost(app, "/api/project/save")
      .send({ saveSelector: "asset-workflow" })
      .expect(200);

    const savedProjectPath = path.join(evidenceDir, "project-save", "saved-project.a3p");
    const archive = await readProject(fs.readFileSync(savedProjectPath));
    const project = asImportedProject(archive.project);

    expect(project.importedAssets?.map((asset) => asset.id)).toEqual([
      "project/models/moon-rover.glb",
      "project/textures/checker.png",
    ]);
    expect(Array.from(archive.resources.get("resources/models/moon-rover.glb") ?? []))
      .toEqual(Array.from(GLB_BYTES));
    expect(Array.from(archive.resources.get("resources/textures/checker.png") ?? []))
      .toEqual(Array.from(PNG_BYTES));
    expect(project.sceneObjects.find((object) => object.name === "box")?.materialBindings)
      .toEqual([
        {
          target: "surface",
          textureResourceId: "project/textures/checker.png",
        },
      ]);
  });

  it("uses the Alice local API auth boundary and accepts asset JSON uploads larger than the general API limit", async () => {
    const evidenceDir = makeTempDir("alice-imported-asset-limit-");
    const app = createTestServer(evidenceDir);
    const largeGlb = Buffer.concat([
      GLB_BYTES,
      Buffer.alloc(1_200_000, 0x20),
    ]);

    const unauthenticated = await request(app)
      .post("/api/assets/import-model")
      .send({
        fileName: "large-scene.glb",
        contentBase64: largeGlb.toString("base64"),
      })
      .expect(401);
    expect(unauthenticated.body.error).toBe("Missing or invalid local API token");

    const imported = await localPost(app, "/api/assets/import-model")
      .send({
        fileName: "large-scene.glb",
        displayName: "Large Scene",
        contentBase64: largeGlb.toString("base64"),
      })
      .expect(200);
    expect(imported.body.asset).toMatchObject({
      id: "project/models/large-scene.glb",
      byteLength: largeGlb.byteLength,
    });
  });

  it("rejects unsafe names, wrong formats, missing assets, and unsupported material targets", async () => {
    const evidenceDir = makeTempDir("alice-imported-asset-validation-");
    const app = createTestServer(evidenceDir);

    await localPost(app, "/api/launch").send({}).expect(200);

    await localPost(app, "/api/assets/import-model")
      .send({
        fileName: "../moon-rover.glb",
        contentBase64: GLB_BYTES.toString("base64"),
      })
      .expect(400);
    await localPost(app, "/api/assets/import-texture")
      .send({
        fileName: "checker.gif",
        contentBase64: PNG_BYTES.toString("base64"),
      })
      .expect(400);
    await localPost(app, "/api/assets/import-model")
      .send({
        fileName: "moon-rover.obj",
        contentBase64: GLB_BYTES.toString("base64"),
      })
      .expect(400);

    await localPost(app, "/api/scene/add-object")
      .send({ className: "org.lgna.story.SBox", name: "box" })
      .expect(200);

    await localPost(app, "/api/scene/apply-texture")
      .send({
        objectName: "box",
        textureResourceId: "project/textures/missing.png",
        target: "surface",
      })
      .expect(400);
    await localPost(app, "/api/scene/apply-texture")
      .send({
        objectName: "box",
        textureResourceId: "project/textures/missing.png",
        target: "emissive",
      })
      .expect(400);
    await localPost(app, "/api/scene/apply-texture")
      .send({
        objectName: "missing-box",
        textureResourceId: "project/textures/missing.png",
        target: "surface",
      })
      .expect(404);
  });
});
