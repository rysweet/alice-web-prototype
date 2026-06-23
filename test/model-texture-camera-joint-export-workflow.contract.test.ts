import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import * as CameraWorkflow from "../src/camera-workflow.js";
import * as PublicApi from "../src/index.js";
import type { AliceProject } from "../src/a3p-parser.js";
import type { JointNode } from "../src/story-api";
import { createMinimalProject } from "./test-utils.js";

type WorkflowResourceKind = "model" | "texture";

interface WorkflowResource {
  readonly kind: WorkflowResourceKind;
  readonly path: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
}

interface TextureAssignment {
  readonly objectName: string;
  readonly texturePath: string;
  readonly materialName?: string;
}

interface WorkflowState {
  readonly project: AliceProject;
  readonly resources: readonly WorkflowResource[];
  readonly textureAssignments: readonly TextureAssignment[];
  readonly cameraWorkflow: CameraWorkflow.CameraWorkflowState;
  readonly jointState?: {
    readonly schema_version: "alice.joint-state/v1";
    readonly runtime: "alice-web";
    readonly objects: Record<string, unknown>;
  };
}

interface WorkflowApi {
  readonly SUPPORTED_MODEL_EXTENSIONS: readonly string[];
  readonly SUPPORTED_TEXTURE_EXTENSIONS: readonly string[];
  createWorkflowState(input: { readonly project: AliceProject }): WorkflowState;
  importModelAsset(
    state: WorkflowState,
    input: { readonly fileName: string; readonly bytes: Uint8Array; readonly objectName?: string },
  ): Promise<WorkflowState>;
  importTextureAsset(
    state: WorkflowState,
    input: { readonly fileName: string; readonly bytes: Uint8Array },
  ): Promise<WorkflowState>;
  assignTextureToModel(
    state: WorkflowState,
    input: { readonly objectName: string; readonly texturePath: string; readonly materialName?: string },
  ): WorkflowState;
  setCameraWorkflowState(state: WorkflowState, cameraWorkflow: CameraWorkflow.CameraWorkflowState): WorkflowState;
  registerJointObject(
    state: WorkflowState,
    input: { readonly objectName: string; readonly className: string; readonly hierarchy: readonly JointNode[] },
  ): WorkflowState;
  applyJointPose(
    state: WorkflowState,
    input: {
      readonly objectName: string;
      readonly poseName: string;
      readonly joints: Record<string, {
        readonly orientation?: { readonly x: number; readonly y: number; readonly z: number; readonly w: number };
        readonly position?: { readonly x: number; readonly y: number; readonly z: number };
      }>;
    },
  ): WorkflowState;
  exportA3pArchive(state: WorkflowState): Promise<Uint8Array>;
  exportWebPackage(
    state: WorkflowState,
    options?: { readonly title?: string; readonly description?: string; readonly canonicalUrl?: string },
  ): Promise<{
    readonly schema_version: "alice-web.export-web-package-result/v1";
    readonly runtime: "alice-web";
    readonly package: { readonly base64: string; readonly filename: string; readonly sha256: string };
  }>;
  generateShareArtifacts(
    input: { readonly packageBase64: string; readonly title?: string; readonly description?: string },
  ): Promise<{
    readonly schema_version: "alice-web.share-artifacts-result/v1";
    readonly runtime: "alice-web";
    readonly share: { readonly runtimeIdentity: "alice-web-player"; readonly links: Record<string, string> };
    readonly validation: { readonly valid: true };
  }>;
}

const REQUIRED_FUNCTIONS = [
  "createWorkflowState",
  "importModelAsset",
  "importTextureAsset",
  "assignTextureToModel",
  "setCameraWorkflowState",
  "registerJointObject",
  "applyJointPose",
  "exportA3pArchive",
  "exportWebPackage",
  "generateShareArtifacts",
] as const;

function getWorkflowApi(): WorkflowApi {
  const api = (PublicApi as Record<string, unknown>).ModelTextureCameraJointExportWorkflow;
  expect(api, "src/index.ts must export ModelTextureCameraJointExportWorkflow").toBeTypeOf("object");

  const record = api as Record<string, unknown>;
  for (const functionName of REQUIRED_FUNCTIONS) {
    expect(record[functionName], `${functionName} must be part of the public workflow API`).toBeTypeOf("function");
  }
  expect(record.SUPPORTED_MODEL_EXTENSIONS).toEqual(expect.arrayContaining([".glb", ".gltf"]));
  expect(record.SUPPORTED_TEXTURE_EXTENSIONS).toEqual(expect.arrayContaining([".png", ".jpg", ".jpeg", ".webp"]));

  return api as WorkflowApi;
}

function createRobotProject(): AliceProject {
  const project = createMinimalProject();
  project.projectName = "Robot texture scene";
  project.sceneObjects.push({
    name: "robot",
    typeName: "org.lgna.story.SProp",
    resourceType: "resources/models/robot.gltf",
    position: { x: 0, y: 0, z: 0 },
    orientation: null,
    size: { width: 1, height: 1, depth: 1 },
  });
  return project;
}

function robotHierarchy(): JointNode[] {
  return [
    {
      name: "ROOT",
      parentName: null,
      localTransform: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      children: [
        {
          name: "ARM",
          parentName: "ROOT",
          localTransform: {
            position: { x: 0, y: 1, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
          children: [],
        },
      ],
    },
  ];
}

function createTriangleGltfBytes(): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const bytes = Buffer.from(positions.buffer);
  return new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0", generator: "alice-web contract test" },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bytes.byteLength }],
    accessors: [{
      bufferView: 0,
      componentType: 5126,
      count: 3,
      type: "VEC3",
      min: [0, 0, 0],
      max: [1, 1, 0],
    }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    nodes: [{ mesh: 0, name: "robot" }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  }));
}

function createPngBytes(): Uint8Array {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axp3WQAAAAASUVORK5CYII=",
    "base64",
  );
}

describe("model, texture, camera, joint, and export workflow contract", () => {
  it("publishes the planned workflow API from the alice-web public entry point", () => {
    const api = getWorkflowApi();

    const initial = api.createWorkflowState({ project: createRobotProject() });

    expect(initial.project.projectName).toBe("Robot texture scene");
    expect(initial.resources).toEqual([]);
    expect(initial.textureAssignments).toEqual([]);
    expect(initial.cameraWorkflow).toEqual(CameraWorkflow.createDefaultCameraWorkflowState());
  });

  it("initializes workflow camera state from saved projects", () => {
    const api = getWorkflowApi();
    const project = createRobotProject();
    const savedCamera = CameraWorkflow.applyCameraPreset(
      CameraWorkflow.createDefaultCameraWorkflowState(),
      "isometric",
    );
    project.cameraWorkflow = CameraWorkflow.saveCameraMarker(savedCamera, { name: "Saved authoring view" });

    const initial = api.createWorkflowState({ project });

    expect(initial.cameraWorkflow.camera.activePreset).toBe("isometric");
    expect(initial.cameraWorkflow.markers).toEqual([
      expect.objectContaining({ name: "Saved authoring view" }),
    ]);
  });

  it("initializes workflow texture assignments from saved projects", () => {
    const api = getWorkflowApi();
    const project = createRobotProject();
    project.textureAssignments = [
      {
        objectName: "robot",
        texturePath: "resources/textures/saved-robot.png",
        materialName: "body",
      },
    ];

    const initial = api.createWorkflowState({ project });

    expect(initial.textureAssignments).toEqual([
      {
        objectName: "robot",
        texturePath: "resources/textures/saved-robot.png",
        materialName: "body",
      },
    ]);
  });

  it("imports model and texture assets immutably under safe archive paths", async () => {
    const api = getWorkflowApi();
    const initial = api.createWorkflowState({ project: createRobotProject() });

    const withModel = await api.importModelAsset(initial, {
      fileName: "robot.gltf",
      bytes: createTriangleGltfBytes(),
      objectName: "robot",
    });
    const withTexture = await api.importTextureAsset(withModel, {
      fileName: "robot.png",
      bytes: createPngBytes(),
    });
    const assigned = api.assignTextureToModel(withTexture, {
      objectName: "robot",
      texturePath: "resources/textures/robot.png",
      materialName: "body",
    });

    expect(initial.resources).toEqual([]);
    expect(withModel.resources).toEqual([
      expect.objectContaining({
        kind: "model",
        path: "resources/models/robot.gltf",
        fileName: "robot.gltf",
        mimeType: "model/gltf+json",
      }),
    ]);
    expect(withTexture.resources.map((resource) => resource.path)).toEqual([
      "resources/models/robot.gltf",
      "resources/textures/robot.png",
    ]);
    expect(assigned.textureAssignments).toEqual([
      {
        objectName: "robot",
        texturePath: "resources/textures/robot.png",
        materialName: "body",
      },
    ]);
  });

  it("keeps the active project unchanged when import validation fails", async () => {
    const api = getWorkflowApi();
    const initial = api.createWorkflowState({ project: createRobotProject() });

    await expect(api.importModelAsset(initial, {
      fileName: "robot.obj",
      bytes: new TextEncoder().encode("v 0 0 0"),
      objectName: "robot",
    })).rejects.toThrow(/unsupported|model/i);

    await expect(api.importTextureAsset(initial, {
      fileName: "robot.exe",
      bytes: new Uint8Array([1, 2, 3]),
    })).rejects.toThrow(/unsupported|texture/i);

    expect(initial.resources).toEqual([]);
    expect(initial.textureAssignments).toEqual([]);
  });

  it("persists camera markers and joint poses in exported archives and web packages", async () => {
    const api = getWorkflowApi();
    const withModel = await api.importModelAsset(api.createWorkflowState({ project: createRobotProject() }), {
      fileName: "robot.gltf",
      bytes: createTriangleGltfBytes(),
      objectName: "robot",
    });
    const withTexture = await api.importTextureAsset(withModel, {
      fileName: "robot.png",
      bytes: createPngBytes(),
    });
    const assigned = api.assignTextureToModel(withTexture, {
      objectName: "robot",
      texturePath: "resources/textures/robot.png",
      materialName: "body",
    });
    const camera = CameraWorkflow.saveCameraMarker(
      CameraWorkflow.applyCameraPreset(CameraWorkflow.createDefaultCameraWorkflowState(), "isometric"),
      { name: "Export view" },
    );
    const withCamera = api.setCameraWorkflowState(assigned, camera);
    const withJointObject = api.registerJointObject(withCamera, {
      objectName: "robot",
      className: "org.lgna.story.SProp",
      hierarchy: robotHierarchy(),
    });
    const readyToExport = api.applyJointPose(withJointObject, {
      objectName: "robot",
      poseName: "wave",
      joints: {
        ARM: { orientation: { x: 0, y: 0, z: 0.707, w: 0.707 } },
      },
    });

    const a3pArchive = await api.exportA3pArchive(readyToExport);
    const webPackage = await api.exportWebPackage(readyToExport, {
      title: "Robot texture scene",
      description: "Robot scene with a saved camera view.",
    });
    const share = await api.generateShareArtifacts({
      packageBase64: webPackage.package.base64,
      title: "Robot texture scene",
    });

    expect(a3pArchive.byteLength).toBeGreaterThan(0);
    expect(webPackage).toMatchObject({
      schema_version: "alice-web.export-web-package-result/v1",
      runtime: "alice-web",
      package: {
        filename: expect.stringMatching(/\.alice-web\.zip$/),
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(share).toMatchObject({
      schema_version: "alice-web.share-artifacts-result/v1",
      runtime: "alice-web",
      share: { runtimeIdentity: "alice-web-player" },
      validation: { valid: true },
    });

    const zip = await JSZip.loadAsync(Buffer.from(webPackage.package.base64, "base64"));
    expect(Object.keys(zip.files).sort()).toEqual(expect.arrayContaining([
      "index.html",
      "manifest.json",
      "project/project.json",
      "resources/models/robot.gltf",
      "resources/textures/robot.png",
      "share.json",
      "validation.json",
    ]));
    const html = await zip.file("index.html")!.async("string");
    expect(html).toContain("alice-export-resources");
    expect(html).toContain("resources/models/robot.gltf");
    expect(html).toContain("resources/textures/robot.png");

    const projectPayload = JSON.parse(await zip.file("project/project.json")!.async("string")) as Record<string, unknown>;
    expect(projectPayload).toMatchObject({
      cameraWorkflow: {
        camera: { activePreset: "isometric" },
        markers: [expect.objectContaining({ name: "Export view" })],
      },
      textureAssignments: [
        {
          objectName: "robot",
          texturePath: "resources/textures/robot.png",
          materialName: "body",
        },
      ],
      jointState: {
        schema_version: "alice.joint-state/v1",
        runtime: "alice-web",
        objects: {
          robot: expect.objectContaining({
            poses: {
              wave: {
                ARM: { orientation: { x: 0, y: 0, z: 0.707, w: 0.707 } },
              },
            },
          }),
        },
      },
    });
  });

  it("rejects invalid camera and joint mutations without partially changing workflow state", () => {
    const api = getWorkflowApi();
    const initial = api.createWorkflowState({ project: createRobotProject() });
    const invalidCamera = CameraWorkflow.createDefaultCameraWorkflowState();
    invalidCamera.camera.position.x = Number.NaN;
    const registered = api.registerJointObject(initial, {
      objectName: "robot",
      className: "org.lgna.story.SProp",
      hierarchy: robotHierarchy(),
    });

    expect(() => api.setCameraWorkflowState(initial, invalidCamera)).toThrow(/camera|finite/i);
    expect(() => api.applyJointPose(registered, {
      objectName: "robot",
      poseName: "bad-pose",
      joints: {
        LEFT_TENTACLE: { orientation: { x: 0, y: 0, z: 0, w: 1 } },
      },
    })).toThrow(/LEFT_TENTACLE|unknown joint/i);

    expect(initial).toEqual(api.createWorkflowState({ project: createRobotProject() }));
  });
});
