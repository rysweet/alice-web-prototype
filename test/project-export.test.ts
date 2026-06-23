import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createMinimalProject } from "./test-utils.js";
import {
  A3PExporter,
  HTMLExporter,
  ProjectPackager,
  ScreenshotCapture,
  TypeScriptExporter,
  VideoExporter,
} from "../src/project-export.js";
import * as ProjectExportApi from "../src/project-export.js";
import { ProjectIoError } from "../src/project-io.js";

type WebPackageRequest = {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  teacher?: {
    audience?: string;
    lessonFocus?: string;
    remix?: "allowed" | "with-attribution" | "not-allowed";
    attribution?: string;
    tags?: string[];
    standards?: string[];
  };
};

type PackageReference = {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
};

type ExportedWebPackage = {
  schema_version: string;
  status: string;
  runtime: string;
  package: PackageReference & { base64: string };
  manifest: Record<string, unknown>;
  artifacts: Record<string, string>;
  validation: {
    schemaVersion: string;
    valid: boolean;
    errors: unknown[];
    evidence: string[];
  };
};

type WebPackageValidation = {
  schema_version: string;
  status: string;
  valid: boolean;
  runtime?: string;
  package?: PackageReference;
  manifest?: Record<string, unknown>;
  evidence: string[];
  errors: Array<{ code: string; message: string; path?: string }>;
};

type ShareArtifacts = {
  schema_version: string;
  status: string;
  runtime: string;
  share: {
    schemaVersion: string;
    product: string;
    runtimeIdentity: string;
    title: string;
    description?: string;
    canonicalUrl?: string;
    package: PackageReference;
    links: Record<string, string>;
    teacher?: Record<string, unknown>;
  };
  artifacts: Record<string, string>;
  validation: { valid: boolean; errors: unknown[] };
};

const projectExportApi = ProjectExportApi as typeof ProjectExportApi & {
  exportWebPackage?: (project: ReturnType<typeof createProjectFixture>, options?: WebPackageRequest) => Promise<ExportedWebPackage>;
  validateWebPackage?: (input: { packageBase64: string }) => Promise<WebPackageValidation>;
  generateShareArtifacts?: (input: WebPackageRequest & { packageBase64: string }) => Promise<ShareArtifacts>;
};

function createProjectFixture() {
  const project = createMinimalProject();
  project.projectName = "Round 84 Demo";
  project.sceneObjects.push({
    name: "bunny",
    typeName: "org.lgna.story.SBiped",
    resourceType: null,
    position: { x: 0, y: 0, z: 0 },
    orientation: null,
    size: { width: 1, height: 2, depth: 1 },
    modelResourceId: "project/models/bunny.glb",
    materialBindings: [{ target: "surface", textureResourceId: "project/textures/bunny.png" }],
  });
  project.methods.push({
    name: "myFirstMethod",
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: [{ kind: "MethodCall", object: "bunny", method: "jump", arguments: ["1"] }],
  });
  return project;
}

function decodePackage(base64: string): Buffer {
  return Buffer.from(base64, "base64");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readZipJson(zip: JSZip, path: string): Promise<Record<string, unknown>> {
  const file = zip.file(path);
  expect(file, `${path} should exist in package`).toBeTruthy();
  return JSON.parse(await file!.async("string")) as Record<string, unknown>;
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  expect(file, `${path} should exist in package`).toBeTruthy();
  return file!.async("string");
}

async function makeZip(entries: Record<string, string | Uint8Array>): Promise<string> {
  const zip = new JSZip();
  for (const [path, value] of Object.entries(entries)) {
    zip.file(path, value);
  }
  const bytes = await zip.generateAsync({ type: "uint8array" });
  return Buffer.from(bytes).toString("base64");
}

describe("project-export", () => {
  it("A3PExporter writes a valid .a3p archive", async () => {
    const project = createProjectFixture();
    const bytes = await new A3PExporter().export(project);
    const zip = await JSZip.loadAsync(bytes);

    expect(await zip.file("version.txt")?.async("string")).toBe(project.version);
    expect(await zip.file("programType.xml")?.async("string")).toContain("Round 84 Demo");
  });

  it("HTMLExporter injects resource payloads as embedded data URLs", async () => {
    const project = createProjectFixture();
    const html = await new HTMLExporter().export(project, {
      resources: [{ path: "assets/info.txt", bytes: "embedded", mimeType: "text/plain" }],
    });

    expect(html.title).toContain("Round 84 Demo");
    expect(html.embeddedResources["assets/info.txt"]).toContain("data:text/plain");
    expect(html.html).toContain("alice-export-resources");
    expect(html.html).toContain("embedded");
  });

  it("ScreenshotCapture produces PNG output using the requested dimensions", async () => {
    const capture = await new ScreenshotCapture().capture({ width: 320, height: 180, label: "Frame 1" });

    expect(capture.mimeType).toBe("image/png");
    expect(capture.width).toBe(320);
    expect(capture.height).toBe(180);
    expect(Array.from(capture.bytes.slice(0, 4))).toEqual([137, 80, 78, 71]);
  });

  it("VideoExporter records timestamped frame captures", async () => {
    const video = await new VideoExporter().record(createProjectFixture(), {
      frameCount: 3,
      fps: 2,
      width: 64,
      height: 64,
    });

    expect(video.fps).toBe(2);
    expect(video.frames).toHaveLength(3);
    expect(video.frames.map((frame) => frame.timestampMs)).toEqual([0, 500, 1000]);
    expect(video.frames.every((frame) => frame.bytes.length > 0)).toBe(true);
  });

  it("ProjectPackager bundles project archives, HTML, thumbnail, resources, and manifest", async () => {
    const packaged = await new ProjectPackager().packageProject(createProjectFixture(), {
      resources: [{ path: "assets/readme.txt", bytes: "hello", mimeType: "text/plain" }],
      dependencies: ["three", "jszip", "three"],
      thumbnail: { width: 48, height: 48, label: "thumb" },
    });
    const zip = await JSZip.loadAsync(packaged.archive);

    expect(packaged.manifest.dependencies).toEqual(["jszip", "three"]);
    expect(packaged.entryNames).toContain("manifest.json");
    expect(packaged.entryNames).toContain("thumbnail.png");
    expect(await zip.file("round-84-demo.a3p")?.async("uint8array")).toBeTruthy();
    expect(await zip.file("round-84-demo.html")?.async("string")).toContain("Round 84 Demo");
    expect(await zip.file("assets/readme.txt")?.async("string")).toBe("hello");
  });

  it.each([
    "../evil.txt",
    "/absolute/evil.txt",
    "C:\\Users\\Alice\\evil.txt",
  ])("ProjectPackager rejects unsafe resource ZIP path %s", async (path) => {
    const packaging = new ProjectPackager().packageProject(createProjectFixture(), {
      resources: [{ path, bytes: "evil", mimeType: "text/plain" }],
    });

    await expect(packaging).rejects.toBeInstanceOf(ProjectIoError);
    await expect(packaging).rejects.toMatchObject({ code: "unsafe-path" });
  });

  it("exportWebPackage produces a runnable alice-web package with manifest, share, preview, project payload, validation, and hash linkage", async () => {
    expect(projectExportApi.exportWebPackage).toBeTypeOf("function");

    const exported = await projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Winter Story",
      description: "A snow scene with a bunny.",
      canonicalUrl: "https://example.edu/alice/winter-story",
      resources: [
        { path: "resources/models/bunny.glb", bytes: new Uint8Array([1, 2, 3]) },
        { path: "resources/textures/bunny.png", bytes: new Uint8Array([137, 80, 78, 71]) },
      ],
    });
    const packageBytes = decodePackage(exported.package.base64);
    const zip = await JSZip.loadAsync(packageBytes);
    const entries = Object.keys(zip.files).sort();

    expect(exported).toMatchObject({
      schema_version: "alice-web.export-web-package-result/v1",
      status: "exported",
      runtime: "alice-web",
      package: {
        mimeType: "application/zip",
        sizeBytes: packageBytes.byteLength,
        sha256: sha256(packageBytes),
      },
      artifacts: {
        entrypoint: "index.html",
        manifest: "manifest.json",
        share: "share.json",
        preview: "preview.png",
        project: "project/project.json",
        validation: "validation.json",
      },
    });
    expect(exported.package.filename).toMatch(/\.alice-web\.zip$/);
    expect(exported.package.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(entries).toEqual(expect.arrayContaining([
      "index.html",
      "manifest.json",
      "share.json",
      "preview.png",
      "project/project.json",
      "resources/models/bunny.glb",
      "resources/textures/bunny.png",
      "validation.json",
    ]));
    expect(await zip.file("resources/models/bunny.glb")?.async("uint8array")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await zip.file("resources/textures/bunny.png")?.async("uint8array")).toEqual(new Uint8Array([137, 80, 78, 71]));

    const manifest = await readZipJson(zip, "manifest.json");
    expect(manifest).toMatchObject({
      schemaVersion: "alice-web.package/v1",
      product: "Alice",
      packageName: "alice-web",
      runtimeIdentity: "alice-web-player",
      entrypoint: "index.html",
      preview: "preview.png",
      share: "share.json",
      validation: "validation.json",
    });
    expect(manifest).not.toHaveProperty("schema_version");
    expect(exported.manifest).toMatchObject(manifest);

    const share = await readZipJson(zip, "share.json");
    expect(share).toMatchObject({
      schemaVersion: "alice-web.share/v1",
      product: "Alice",
      runtimeIdentity: "alice-web-player",
      title: "Winter Story",
      description: "A snow scene with a bunny.",
      canonicalUrl: "https://example.edu/alice/winter-story",
      package: {
        filename: exported.package.filename,
        mimeType: "application/zip",
      },
      links: {
        html: "index.html",
        package: exported.package.filename,
        preview: "preview.png",
      },
    });
    expect(share.package).not.toHaveProperty("sha256");
    expect(share.package).not.toHaveProperty("sizeBytes");
    expect(share).not.toHaveProperty("teacher");

    const validation = await readZipJson(zip, "validation.json");
    expect(validation).toMatchObject({
      schemaVersion: "alice-web.validation/v1",
      valid: true,
      errors: [],
    });
    expect(validation.evidence).toEqual(expect.arrayContaining([
      "required-files-present",
      "entrypoint-playable",
      "alice-web-identity",
    ]));
    expect(exported.validation).toMatchObject(validation);

    const indexHtml = await readZipText(zip, "index.html");
    expect(indexHtml).toContain("alice-export-resources");
    expect(indexHtml).toContain('JSON.parse(readText("alice-export-resources") || "{}")');
    expect(indexHtml).toContain("new THREE.TextureLoader().load");
    expect(indexHtml).toContain("mesh.userData.aliceResources");
    expect(indexHtml).toContain("modelResourceAvailable");
    expect(indexHtml).toContain("textureResourceAvailable");
  });

  it("exportWebPackage rejects resources that would replace required package artifacts", async () => {
    await expect(projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Collision",
      resources: [{ path: "index.html", bytes: "owned" }],
    })).rejects.toThrow(/resource path conflicts with web package artifact/);

    await expect(projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Directory Collision",
      resources: [{ path: "project", bytes: "owned" }],
    })).rejects.toThrow(/resource path conflicts with web package artifact/);

    await expect(projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Directory Collision",
      resources: [{ path: "index.html/foo.txt", bytes: "owned" }],
    })).rejects.toThrow(/resource path conflicts with web package artifact/);
  });

  it.each([
    "index%2ehtml",
    "manifest%2ejson",
    "project%2fproject.json",
  ])("exportWebPackage rejects encoded resource path controls %s", async (path) => {
    await expect(projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Encoded Collision",
      resources: [{ path, bytes: "owned" }],
    })).rejects.toThrow(/encoded path controls/);
  });

  it("validateWebPackage accepts exported packages and returns explicit validation evidence", async () => {
    expect(projectExportApi.exportWebPackage).toBeTypeOf("function");
    expect(projectExportApi.validateWebPackage).toBeTypeOf("function");

    const exported = await projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Validation Story",
    });
    const validation = await projectExportApi.validateWebPackage!({
      packageBase64: exported.package.base64,
    });

    expect(validation).toMatchObject({
      schema_version: "alice-web.validate-web-package-result/v1",
      status: "valid",
      valid: true,
      runtime: "alice-web",
      package: {
        filename: exported.package.filename,
        mimeType: "application/zip",
        sizeBytes: exported.package.sizeBytes,
        sha256: exported.package.sha256,
      },
      manifest: {
        schemaVersion: "alice-web.package/v1",
        runtimeIdentity: "alice-web-player",
        entrypoint: "index.html",
      },
      errors: [],
    });
    expect(validation.evidence).toEqual(expect.arrayContaining([
      "base64-decodes",
      "zip-readable",
      "required-files-present",
      "safe-zip-paths",
      "no-duplicate-required-files",
      "alice-web-identity",
      "entrypoint-playable",
    ]));
  });

  it("validateWebPackage rejects invalid base64, missing required files, unsafe paths, and identity drift with error codes", async () => {
    expect(projectExportApi.validateWebPackage).toBeTypeOf("function");

    const invalidBase64 = await projectExportApi.validateWebPackage!({
      packageBase64: "not base64!!",
    });
    expect(invalidBase64).toMatchObject({
      schema_version: "alice-web.validate-web-package-result/v1",
      status: "invalid",
      valid: false,
      errors: [expect.objectContaining({ code: "invalid-base64" })],
    });

    const missingEntrypoint = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
        }),
      }),
    });
    expect(missingEntrypoint.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "missing-required-file", path: "index.html" }),
    ]));

    const unsafePath = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "../evil.txt": "owned",
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
        }),
        "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1" }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(unsafePath.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "unsafe-zip-path" }),
    ]));

    for (const encodedPath of ["index%2ehtml", "manifest%2ejson", "project%2fproject.json"]) {
      const encodedAlias = await projectExportApi.validateWebPackage!({
        packageBase64: await makeZip({
          [encodedPath]: "owned",
          "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
          "manifest.json": JSON.stringify({
            schemaVersion: "alice-web.package/v1",
            product: "Alice",
            packageName: "alice-web",
            runtimeIdentity: "alice-web-player",
            entrypoint: "index.html",
            package: { filename: "safe.alice-web.zip", mimeType: "application/zip" },
          }),
          "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
          "preview.png": new Uint8Array([137, 80, 78, 71]),
          "project/project.json": "{}",
          "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
        }),
      });
      expect(encodedAlias.errors, encodedPath).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "unsafe-zip-path" }),
      ]));
    }

    for (const reservedDescendant of ["index.html/foo.txt", "manifest.json/foo.txt", "project/project.json/foo.txt", "project"]) {
      const directoryCollision = await projectExportApi.validateWebPackage!({
        packageBase64: await makeZip({
          [reservedDescendant]: "owned",
          "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
          "manifest.json": JSON.stringify({
            schemaVersion: "alice-web.package/v1",
            product: "Alice",
            packageName: "alice-web",
            runtimeIdentity: "alice-web-player",
            entrypoint: "index.html",
            package: { filename: "safe.alice-web.zip", mimeType: "application/zip" },
          }),
          "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
          "preview.png": new Uint8Array([137, 80, 78, 71]),
          "project/project.json": "{}",
          "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
        }),
      });
      expect(directoryCollision.errors, reservedDescendant).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "unsafe-zip-path" }),
      ]));
    }

    const identityDrift = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-standalone-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "LookingGlass",
          packageName: "alice-web",
          runtimeIdentity: "alice-standalone-player",
          entrypoint: "index.html",
        }),
        "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "LookingGlass" }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(identityDrift.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-identity" }),
      expect.objectContaining({ code: "forbidden-repository-identity" }),
    ]));

    const unsafeManifestFilename = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
          package: { filename: "../evil.zip", mimeType: "application/zip" },
        }),
        "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(unsafeManifestFilename.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-package-filename" }),
    ]));

    const encodedTraversalFilename = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
          package: { filename: "%2e%2e%2fevil.zip", mimeType: "application/zip" },
        }),
        "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(encodedTraversalFilename.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-package-filename" }),
    ]));

    for (const filename of ["index.html", "share.json", "story.html"]) {
      const invalidManifestFilename = await projectExportApi.validateWebPackage!({
        packageBase64: await makeZip({
          "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
          "manifest.json": JSON.stringify({
            schemaVersion: "alice-web.package/v1",
            product: "Alice",
            packageName: "alice-web",
            runtimeIdentity: "alice-web-player",
            entrypoint: "index.html",
            package: { filename, mimeType: "application/zip" },
          }),
          "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
          "preview.png": new Uint8Array([137, 80, 78, 71]),
          "project/project.json": "{}",
          "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
        }),
      });
      expect(invalidManifestFilename.errors, filename).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "invalid-package-filename" }),
      ]));
    }

    for (const filename of ["safe\nname.zip", "safe\"name.zip", "safe:name.zip", "safe%0aname.zip"]) {
      const invalidManifestFilename = await projectExportApi.validateWebPackage!({
        packageBase64: await makeZip({
          "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
          "manifest.json": JSON.stringify({
            schemaVersion: "alice-web.package/v1",
            product: "Alice",
            packageName: "alice-web",
            runtimeIdentity: "alice-web-player",
            entrypoint: "index.html",
            package: { filename, mimeType: "application/zip" },
          }),
          "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
          "preview.png": new Uint8Array([137, 80, 78, 71]),
          "project/project.json": "{}",
          "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
        }),
      });
      expect(invalidManifestFilename.errors, filename).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "invalid-package-filename" }),
      ]));
    }

    const missingManifestFilename = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
          package: { mimeType: "application/zip" },
        }),
        "share.json": JSON.stringify({ schemaVersion: "alice-web.share/v1", product: "Alice", runtimeIdentity: "alice-web-player" }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(missingManifestFilename.valid).toBe(false);
    expect(missingManifestFilename.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-package-filename" }),
    ]));

    const unsafeCanonicalUrl = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
          package: { filename: "safe.alice-web.zip", mimeType: "application/zip" },
        }),
        "share.json": JSON.stringify({
          schemaVersion: "alice-web.share/v1",
          product: "Alice",
          runtimeIdentity: "alice-web-player",
          canonicalUrl: "javascript:alert(1)",
        }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(unsafeCanonicalUrl.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-canonical-url" }),
    ]));

    const controlWhitespaceCanonicalUrl = await projectExportApi.validateWebPackage!({
      packageBase64: await makeZip({
        "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
        "manifest.json": JSON.stringify({
          schemaVersion: "alice-web.package/v1",
          product: "Alice",
          packageName: "alice-web",
          runtimeIdentity: "alice-web-player",
          entrypoint: "index.html",
          package: { filename: "safe.alice-web.zip", mimeType: "application/zip" },
        }),
        "share.json": JSON.stringify({
          schemaVersion: "alice-web.share/v1",
          product: "Alice",
          runtimeIdentity: "alice-web-player",
          canonicalUrl: "https://example.edu\n.evil/path",
        }),
        "preview.png": new Uint8Array([137, 80, 78, 71]),
        "project/project.json": "{}",
        "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
      }),
    });
    expect(controlWhitespaceCanonicalUrl.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-canonical-url" }),
    ]));
  });

  it("generateShareArtifacts validates packageBase64 and links share metadata to the decoded package", async () => {
    expect(projectExportApi.exportWebPackage).toBeTypeOf("function");
    expect(projectExportApi.generateShareArtifacts).toBeTypeOf("function");

    const exported = await projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Package Title",
      description: "Package description",
    });
    const share = await projectExportApi.generateShareArtifacts!({
      packageBase64: exported.package.base64,
      title: "Shared Title",
      description: "Shared description",
      canonicalUrl: "https://example.edu/alice/shared-title",
    });

    expect(share).toMatchObject({
      schema_version: "alice-web.share-artifacts-result/v1",
      status: "shared",
      runtime: "alice-web",
      share: {
        schemaVersion: "alice-web.share/v1",
        product: "Alice",
        runtimeIdentity: "alice-web-player",
        title: "Shared Title",
        description: "Shared description",
        canonicalUrl: "https://example.edu/alice/shared-title",
        package: {
          filename: exported.package.filename,
          mimeType: "application/zip",
          sizeBytes: exported.package.sizeBytes,
          sha256: exported.package.sha256,
        },
        links: {
          html: "index.html",
          package: exported.package.filename,
          preview: "preview.png",
        },
      },
      artifacts: {
        share: "share.json",
        preview: "preview.png",
        entrypoint: "index.html",
        package: exported.package.filename,
      },
      validation: {
        valid: true,
        errors: [],
      },
    });
  });

  it("rejects packages missing manifest package metadata before share generation", async () => {
    expect(projectExportApi.validateWebPackage).toBeTypeOf("function");
    expect(projectExportApi.generateShareArtifacts).toBeTypeOf("function");

    const packageBase64 = await makeZip({
      "index.html": "<!doctype html><script>window.AlicePlayer={runtimeIdentity:'alice-web-player'}</script>",
      "manifest.json": JSON.stringify({
        schemaVersion: "alice-web.package/v1",
        product: "Alice",
        packageName: "alice-web",
        runtimeIdentity: "alice-web-player",
        entrypoint: "index.html",
        preview: "preview.png",
        share: "share.json",
        validation: "validation.json",
        project: "project/project.json",
      }),
      "share.json": JSON.stringify({
        schemaVersion: "alice-web.share/v1",
        product: "Alice",
        runtimeIdentity: "alice-web-player",
      }),
      "preview.png": new Uint8Array([137, 80, 78, 71]),
      "project/project.json": "{}",
      "validation.json": JSON.stringify({ schemaVersion: "alice-web.validation/v1" }),
    });
    const validation = await projectExportApi.validateWebPackage!({ packageBase64 });

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid-package-reference" }),
    ]));
    await expect(projectExportApi.generateShareArtifacts!({ packageBase64 }))
      .rejects.toMatchObject({
        name: "InvalidWebPackageError",
        validation: expect.objectContaining({ valid: false }),
      });
  });

  it("carries teacher community-sharing metadata through package export, validation, and share artifacts", async () => {
    expect(projectExportApi.exportWebPackage).toBeTypeOf("function");
    expect(projectExportApi.validateWebPackage).toBeTypeOf("function");
    expect(projectExportApi.generateShareArtifacts).toBeTypeOf("function");

    const teacher = {
      audience: "Middle school creative coding",
      lessonFocus: "Remix a reusable character behavior",
      remix: "with-attribution" as const,
      attribution: "Alice Example Teacher",
      tags: ["classroom", "remix", "classroom"],
      standards: ["CSTA 2-AP-10"],
    };
    const exported = await projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Teacher Share Pack",
      description: "Reusable classroom handoff.",
      teacher,
    });
    const zip = await JSZip.loadAsync(decodePackage(exported.package.base64));
    const shareJson = await readZipJson(zip, "share.json");
    const validationJson = await readZipJson(zip, "validation.json");
    const validation = await projectExportApi.validateWebPackage!({
      packageBase64: exported.package.base64,
    });
    const share = await projectExportApi.generateShareArtifacts!({
      packageBase64: exported.package.base64,
      title: "Community Remix Pack",
      teacher: {
        ...teacher,
        tags: ["gallery", "remix"],
      },
    });

    expect(shareJson.teacher).toEqual({
      schemaVersion: "alice-web.teacher-share/v1",
      audience: "Middle school creative coding",
      lessonFocus: "Remix a reusable character behavior",
      remix: "with-attribution",
      attribution: "Alice Example Teacher",
      tags: ["classroom", "remix"],
      standards: ["CSTA 2-AP-10"],
    });
    expect(validationJson.evidence).toEqual(expect.arrayContaining(["teacher-share-metadata"]));
    expect(validation.evidence).toEqual(expect.arrayContaining(["teacher-share-metadata"]));
    expect(share.share.teacher).toMatchObject({
      schemaVersion: "alice-web.teacher-share/v1",
      tags: ["gallery", "remix"],
      remix: "with-attribution",
    });
    expect(share.share.teacher).not.toHaveProperty("title");
  });

  it("rejects malformed teacher metadata instead of awarding teacher-share evidence", async () => {
    const exported = await projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Malformed Teacher Share Pack",
      teacher: {
        remix: "allowed",
        tags: ["classroom"],
        standards: ["CSTA"],
      },
    });
    const zip = await JSZip.loadAsync(decodePackage(exported.package.base64));
    const share = JSON.parse(await zip.file("share.json")!.async("string"));
    share.teacher.audience = 42;
    share.teacher.lessonFocus = { text: "not a string" };
    zip.file("share.json", JSON.stringify(share));
    const packageBytes = await zip.generateAsync({ type: "uint8array" });

    const validation = await projectExportApi.validateWebPackage!({
      packageBase64: Buffer.from(packageBytes).toString("base64"),
    });

    expect(validation.valid).toBe(false);
    expect(validation.evidence).not.toContain("teacher-share-metadata");
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "invalid-teacher-share-metadata",
        message: "teacher audience must be a string",
      }),
      expect.objectContaining({
        code: "invalid-teacher-share-metadata",
        message: "teacher lessonFocus must be a string",
      }),
    ]));
  });

  it("rejects teacher metadata with null values or non-array list fields", async () => {
    await expect(projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Bad Teacher Pack",
      teacher: "not-an-object" as unknown as Record<string, never>,
    })).rejects.toThrow(/teacher must be a JSON object/);

    await expect(projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Bad Teacher Pack",
      teacher: {
        remix: "allowed",
        tags: "" as unknown as string[],
        standards: ["CSTA"],
      },
    })).rejects.toThrow(/teacher\.tags must be an array of strings/);

    const exported = await projectExportApi.exportWebPackage!(createProjectFixture(), {
      title: "Teacher Share Pack",
      teacher: {
        remix: "allowed",
        tags: ["classroom"],
        standards: ["CSTA"],
      },
    });
    const zip = await JSZip.loadAsync(decodePackage(exported.package.base64));
    const share = JSON.parse(await zip.file("share.json")!.async("string"));
    share.teacher = null;
    zip.file("share.json", JSON.stringify(share));

    const validation = await projectExportApi.validateWebPackage!({
      packageBase64: Buffer.from(await zip.generateAsync({ type: "uint8array" })).toString("base64"),
    });

    expect(validation.valid).toBe(false);
    expect(validation.evidence).not.toContain("teacher-share-metadata");
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "invalid-teacher-share-metadata",
        message: "teacher metadata must be an object",
      }),
    ]));
  });

  it("TypeScriptExporter creates a deterministic Alice web source handoff archive", async () => {
    const first = await new TypeScriptExporter().export(createProjectFixture());
    const second = await new TypeScriptExporter().export(createProjectFixture());
    const zip = await JSZip.loadAsync(first.archive);

    expect(first.manifest).toMatchObject({
      schemaVersion: "alice-web.typescript-source-manifest/v1",
      product: "alice-web",
      runtime: "Alice",
      projectName: "Round 84 Demo",
      entryPoint: "src/project.ts",
    });
    expect(first.entryNames).toEqual(second.entryNames);
    expect(first.entryNames).toEqual([...first.entryNames].sort());
    expect(first.entryNames.every((name) => name.startsWith("alice-web-typescript-source/"))).toBe(true);
    expect(first.entryNames).toContain("alice-web-typescript-source/manifest.json");
    expect(first.entryNames).toContain("alice-web-typescript-source/package.json");
    expect(first.entryNames).toContain("alice-web-typescript-source/tsconfig.json");
    expect(first.entryNames).toContain("alice-web-typescript-source/README.md");
    expect(first.entryNames).toContain("alice-web-typescript-source/src/project.ts");
    expect(first.entryNames).toContain("alice-web-typescript-source/src/scene.ts");

    const manifest = JSON.parse(
      await zip.file("alice-web-typescript-source/manifest.json")!.async("string"),
    );
    const packageJson = JSON.parse(
      await zip.file("alice-web-typescript-source/package.json")!.async("string"),
    );
    const tsconfig = JSON.parse(
      await zip.file("alice-web-typescript-source/tsconfig.json")!.async("string"),
    );
    const readme = await zip.file("alice-web-typescript-source/README.md")!.async("string");
    const source = await zip.file("alice-web-typescript-source/src/project.ts")!.async("string");

    expect(manifest.files).toEqual(expect.arrayContaining(["src/project.ts", "src/scene.ts"]));
    expect(packageJson).toMatchObject({
      name: "alice-web-typescript-source",
      private: true,
      type: "module",
    });
    expect(packageJson.scripts).toEqual({ typecheck: "tsc --noEmit" });
    expect(tsconfig.compilerOptions.noEmit).toBe(true);
    expect(readme).toContain("Alice web TypeScript source export");
    expect(source).toContain("Round 84 Demo");
    expect(`${JSON.stringify(manifest)}\n${JSON.stringify(packageJson)}\n${readme}\n${source}`).not.toMatch(/lookingglass/i);
  });

  it("TypeScriptExporter rejects empty generated source entries", async () => {
    const exporter = new TypeScriptExporter(() => ({
      manifest: {
        schemaVersion: "alice-web.typescript-source-manifest/v1",
        product: "alice-web",
        runtime: "Alice",
        projectName: "Empty",
        entryPoint: "src/project.ts",
        files: [],
        sourceFileCount: 0,
        sceneObjectCount: 0,
        procedureCount: 0,
        unsupportedBehaviorCount: 0,
      },
      entries: [],
    }));

    await expect(exporter.export(createProjectFixture())).rejects.toThrow(/empty/i);
  });

  it.each([
    "../escape.ts",
    "/absolute.ts",
    "src\\backslash.ts",
    "src/../escape.ts",
  ])("TypeScriptExporter rejects unsafe generated entry path %s", async (path) => {
    const exporter = new TypeScriptExporter(() => ({
      manifest: {
        schemaVersion: "alice-web.typescript-source-manifest/v1",
        product: "alice-web",
        runtime: "Alice",
        projectName: "Unsafe",
        entryPoint: "src/project.ts",
        files: [path],
        sourceFileCount: 1,
        sceneObjectCount: 0,
        procedureCount: 0,
        unsupportedBehaviorCount: 0,
      },
      entries: [{ path, content: "export {};\n" }],
    }));
    await expect(exporter.export(createProjectFixture())).rejects.toBeInstanceOf(ProjectIoError);
    await expect(exporter.export(createProjectFixture())).rejects.toMatchObject({ code: "unsafe-path" });
  });
});
