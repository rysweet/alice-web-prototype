import { Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import request from "supertest";
import { createServer } from "../src/server.js";
import { formatConfig } from "../src/cli.js";
import {
  writeEditProcedureProof,
  writeSaveProof,
} from "../src/evidence-writer.js";
import { exportModelToGlb } from "../src/open-asset-pipeline/gltf-export.js";
import { PROCEDURAL_LICENSE } from "../src/open-asset-pipeline/types.js";
import type { ModelGeometryData } from "../src/model-resources/definitions.js";
import type { MaterialDefinition } from "../src/materials.js";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOOKINGGLASS_RUNTIME = "lookingglass-typescript-web";

function readText(relativePath: string): string {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf-8");
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readText(relativePath)) as Record<string, unknown>;
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "lookingglass-identity-"));
}

function readArtifact(filePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
}

function makeTriangleGeometry(): ModelGeometryData {
  return {
    vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0],
    indices: [0, 1, 2],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 0, 1, 0, 0, 1],
  };
}

const MATERIAL: MaterialDefinition = {
  name: "identity-material",
  diffuseColor: 0x99AAFF,
  specularColor: 0x000000,
  emissiveColor: 0x000000,
  opacity: 1,
  shininess: 0,
  visible: true,
  wireframe: false,
  flatShading: false,
  ethereal: false,
  alphaBlended: false,
  clamped: false,
};

async function readGltfJson(glb: Uint8Array): Promise<Record<string, unknown>> {
  const io = new NodeIO();
  const document = await io.readBinary(glb);
  return JSON.parse(JSON.stringify(document.getRoot().getAsset())) as Record<string, unknown>;
}

describe("LookingGlass identity contract", () => {
  it("uses LookingGlass npm package and bin identity", () => {
    const packageJson = readJson("package.json");
    const packageLock = readJson("package-lock.json");
    const lockPackages = packageLock.packages as Record<string, Record<string, unknown>>;

    expect(packageJson.name).toBe("lookingglass");
    expect(packageJson.bin).toEqual({ lookingglass: "./dist-server/cli.js" });
    expect(packageJson.bin).not.toHaveProperty("alice-web");
    expect(packageLock.name).toBe("lookingglass");
    expect(lockPackages[""].name).toBe("lookingglass");
    expect(lockPackages[""].bin).toEqual({ lookingglass: "dist-server/cli.js" });
  });

  it("uses LookingGlass Python package and runtime CLI identity", () => {
    const pyproject = readText("pyproject.toml");
    const amplihackCli = readText("amplihack_cli.py");

    expect(pyproject).toContain('name = "lookingglass-amplihack"');
    expect(pyproject).toContain("LookingGlass");
    expect(amplihackCli).toContain('DIST_NAME = "lookingglass-amplihack"');
    expect(amplihackCli).toContain('LOOKINGGLASS_SOURCE_ENV = "LOOKINGGLASS_SOURCE"');
    expect(amplihackCli).toContain('LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT_ENV = "LOOKINGGLASS_ALLOW_MUTABLE_CHECKOUT"');
    expect(amplihackCli).toContain("ALICE_WEB_SOURCE");
    expect(amplihackCli).toContain("ALICE_WEB_ALLOW_MUTABLE_CHECKOUT");
  });

  it("reports LookingGlass runtime identity from CLI config and health", async () => {
    const config = JSON.parse(formatConfig({
      command: "print-config",
      port: 4187,
      evidenceDir: "evidence/custom",
      project: "stories/demo.a3p",
    })) as Record<string, unknown>;

    expect(config.runtime).toBe(LOOKINGGLASS_RUNTIME);

    const app = createServer({ port: 0, evidenceDir: makeTempDir() });
    const health = await request(app).get("/api/health").expect(200);
    expect(health.body.runtime).toBe(LOOKINGGLASS_RUNTIME);
  });

  it("writes LookingGlass identity into generated evidence metadata without changing eatme schemas", () => {
    const evidenceDir = makeTempDir();
    try {
      const editProof = writeEditProcedureProof(evidenceDir, {
        procedureSelector: "scene.myFirstMethod",
        editSpec: "append-comment:identity",
        inputProjectArtifact: "starter.a3p",
        sceneType: "Scene",
        methodName: "myFirstMethod",
        marker: "identity",
        beforeStatementCount: 0,
        afterStatementCount: 1,
        beforeMethods: ["myFirstMethod"],
        afterMethods: ["myFirstMethod"],
        editedProject: "edited-project.a3p",
      });
      const saveProof = writeSaveProof(evidenceDir, {
        savedFilePath: path.join(evidenceDir, "saved-project.a3p"),
        fileSizeBytes: 42,
      });

      expect(readArtifact(editProof)).toMatchObject({
        schema_version: "eatme.alice-first-lesson-code-editor-action-proof/v1",
        code_editor_backing: LOOKINGGLASS_RUNTIME,
      });
      expect(readArtifact(saveProof)).toMatchObject({
        schema_version: "eatme.alice-desktop-save-operation-result/v1",
        source: LOOKINGGLASS_RUNTIME,
      });
    } finally {
      fs.rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("uses LookingGlass identity for browser storage keys and generated asset metadata", async () => {
    expect(readText("src/preferences.ts")).toContain('"lookingglass.preferences"');
    expect(readText("src/theme-system.ts")).toContain('"lookingglass.theme"');
    expect(readText("src/notification-system.ts")).toContain('"lookingglass.notifications.history"');
    expect(readText("src/plugin-system.ts")).toContain('"lookingglass.plugins.settings"');
    expect(PROCEDURAL_LICENSE.author).toBe("LookingGlass");

    const glb = await exportModelToGlb(
      makeTriangleGeometry(),
      [],
      [MATERIAL],
      {
        modelId: "BUNNY",
        category: "BIPED",
        generatedAt: "2026-06-20T00:00:00Z",
      },
    );
    const asset = await readGltfJson(glb);
    const extras = asset.extras as Record<string, unknown>;

    expect(readText("src/open-asset-pipeline/gltf-export.ts")).toContain('generator = "LookingGlass"');
    expect(extras.lookingglass).toEqual({
      modelId: "BUNNY",
      category: "BIPED",
      generatedAt: "2026-06-20T00:00:00Z",
    });
    expect(extras).not.toHaveProperty("alice");
  });

  it("keeps docs and identity surfaces free of old product branding tokens", () => {
    const forbiddenSurfaces = [
      "package.json",
      "package-lock.json",
      "pyproject.toml",
      "src/cli.ts",
      "src/server/routes/health-routes.ts",
      "src/evidence-writer.ts",
      "src/export-html/template.ts",
      "src/open-asset-pipeline/types.ts",
      "src/open-asset-pipeline/gltf-export.ts",
      "README.md",
      "mkdocs.yml",
      "docs/index.md",
      "docs/server-api.md",
      "docs/api-reference.md",
      "docs/getting-started.md",
      "docs/testing.md",
      "docs/tutorial-lookingglass-server-workflow.md",
      "docs/lookingglass-identity.md",
    ];
    const forbiddenTokens = [
      "Alice Web Prototype",
      "typescript-web-prototype",
      "alice-web serve",
      "alice-web print-config",
      "alice-web-prototype export-html",
    ];

    for (const surface of forbiddenSurfaces) {
      const content = readText(surface);
      for (const token of forbiddenTokens) {
        expect(content, `${surface} should not contain ${token}`).not.toContain(token);
      }
    }

    expect(readText("README.md")).toContain("LookingGlass");
    expect(readText("docs/lookingglass-identity.md")).toContain(LOOKINGGLASS_RUNTIME);
    expect(readText("mkdocs.yml")).toContain("site_name: LookingGlass");
  });
});
