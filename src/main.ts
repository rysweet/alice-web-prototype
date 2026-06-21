import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { type AliceObject, type AliceProject } from "./a3p-parser";
import {
  applyCameraPreset,
  createDefaultCameraWorkflowState,
  deleteCameraMarker,
  moveCamera,
  restoreCameraMarker,
  saveCameraMarker,
  setCameraMode,
  type CameraMarker,
  type CameraPreset,
  type CameraWorkflowState,
} from "./camera-workflow";
import {
  applySurfaceTextureBinding,
  createImportedProjectAsset,
  type ImportedProjectAsset,
} from "./imported-project-assets";
import * as JointSystem from "./joint-system";
import * as ProjectIo from "./project-io";
import type * as ModelTextureCameraJointExportWorkflow from "./model-texture-camera-joint-export-workflow";
import type * as ProjectExport from "./project-export";
import type { AliceProjectArchive } from "./project-io";
import { buildScene } from "./scene-builder";
import { disposeSceneResources } from "./scene-disposal";
import { detectWebXRCapabilities, type WebXREvidence } from "./webxr-capabilities";
import { type WebXRInputSourceState, type WebXRInputState } from "./webxr-input";
import {
  createWebXRLocomotion,
  resolveWebXRInteraction,
  type WebXRLocomotion,
  type WebXRLocomotionMode,
  type WebXRMovementHit,
  type WebXRObjectHit,
} from "./webxr-locomotion";
import {
  createWebXRSessionController,
  type WebXRSessionController,
  type WebXRSessionState,
} from "./webxr-session";
import { renderWebXRStatus, type WebXRButtonState } from "./webxr-ui";

function requireElement<T extends HTMLElement>(id: string, ctor: abstract new (...args: never[]) => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

const fileInput = requireElement("file-input", HTMLInputElement);
const modelInput = requireElement("model-file-input", HTMLInputElement);
const textureInput = requireElement("texture-file-input", HTMLInputElement);
const createShapeButton = requireElement("create-shape-button", HTMLButtonElement);
const applyTextureButton = requireElement("assign-texture-button", HTMLButtonElement);
const saveProjectButton = requireElement("export-a3p-button", HTMLButtonElement);
const exportWebPackageButton = requireElement("export-web-package-button", HTMLButtonElement);
const shareWebPackageButton = requireElement("share-web-package-button", HTMLButtonElement);
const objectList = requireElement("object-list", HTMLUListElement);
const assetList = requireElement("asset-list", HTMLUListElement);
const jointObjectSelect = requireElement("joint-object-select", HTMLSelectElement);
const jointPoseName = requireElement("joint-pose-name", HTMLInputElement);
const jointApplyPose = requireElement("joint-apply-pose", HTMLButtonElement);
const status = requireElement("status", HTMLElement);
const webXRStatus = requireElement("webxr-status", HTMLElement);
const canvas = requireElement("viewport", HTMLCanvasElement);
const cameraStatus = requireElement("camera-status", HTMLElement);
const cameraMode = requireElement("camera-mode", HTMLElement);
const cameraPosition = requireElement("camera-position", HTMLElement);
const cameraPreset = requireElement("camera-preset", HTMLSelectElement);
const cameraMoveForward = requireElement("camera-move-forward", HTMLButtonElement);
const cameraFirstPersonToggle = requireElement("camera-first-person-toggle", HTMLButtonElement);
const cameraMarkerName = requireElement("camera-marker-name", HTMLInputElement);
const cameraSaveMarker = requireElement("camera-save-marker", HTMLButtonElement);
const cameraMarkerList = requireElement("camera-marker-list", HTMLUListElement);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

const raycaster = new THREE.Raycaster();
const locomotion: WebXRLocomotion = createWebXRLocomotion({ mode: "combined" });
const webXRAffordances = new Map<string, THREE.Group>();

let currentScene: THREE.Scene | null = null;
let currentCamera: THREE.PerspectiveCamera | null = null;
let currentUserRig: THREE.Group | null = null;
let controls: OrbitControls | null = null;
let lastProject: AliceProject | null = null;
let webXRController: WebXRSessionController | null = null;
let webXREvidence: readonly WebXREvidence[] = [];
let webXRInvalidTargetMessage: string | undefined;
let lastAnimationTime = 0;
let cameraWorkflow: CameraWorkflowState = createDefaultCameraWorkflowState();
let lastArchive: AliceProjectArchive | null = null;
let selectedObjectName: string | null = null;
let selectedTextureResourceId: string | null = null;
let lastWebPackageBase64: string | null = null;
const jointState = new JointSystem.JointStateStore();

function createEmptyArchive(): AliceProjectArchive {
  const project: AliceProject = {
    version: "3.10.0.0",
    projectName: "Program",
    sceneObjects: [],
    methods: [],
    types: [],
    importedAssets: [],
  };
  return {
    project,
    manifest: null,
    resources: new Map(),
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

function ensureArchive(): AliceProjectArchive {
  if (!lastArchive) {
    lastArchive = createEmptyArchive();
    lastProject = lastArchive.project;
  }
  return lastArchive;
}

function describeObject(obj: AliceObject): string {
  const shortType = obj.typeName.split(".").pop() ?? obj.typeName;
  const resource = obj.resourceType ? ` [${obj.resourceType.split(".").pop()}]` : "";
  const model = obj.modelResourceId ? " model: imported" : "";
  const surfaceTexture = obj.materialBindings
    ?.find((binding) => binding.target === "surface")?.textureResourceId;
  const texture = surfaceTexture ? ` surface: ${surfaceTexture}` : "";
  return `${obj.name} (${shortType})${resource}${model}${texture}`;
}

function describeProject(project: AliceProject): string {
  return `Loaded "${project.projectName}" (v${project.version}) – ${project.sceneObjects.length} objects.`;
}

function setStatusMessage(message: string): void {
  status.textContent = message;
  status.dataset.state = "ready";
}

function setErrorMessage(error: unknown): void {
  status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  status.dataset.state = "error";
}

function setCameraStatusMessage(message: string): void {
  cameraStatus.textContent = message;
}

function clearObjectList(): void {
  objectList.innerHTML = "";
}

function renderObjectList(project: AliceProject): void {
  clearObjectList();
  for (const object of project.sceneObjects) {
    const item = document.createElement("li");
    item.textContent = describeObject(object);
    item.dataset.objectName = object.name;
    item.dataset.selected = object.name === selectedObjectName ? "true" : "false";
    item.addEventListener("click", () => {
      selectedObjectName = object.name;
      renderObjectList(project);
      setStatusMessage(`Selected ${object.name}`);
    });
    objectList.appendChild(item);
  }
}

function renderAssetList(project: AliceProject): void {
  assetList.innerHTML = "";
  for (const asset of project.importedAssets ?? []) {
    const item = document.createElement("li");
    item.textContent = `${asset.name} (${asset.kind}) ${asset.id}`;
    assetList.appendChild(item);
  }
}

function resizeRenderer(): void {
  const width = Math.max(canvas.clientWidth, 1);
  const height = Math.max(canvas.clientHeight, 1);
  renderer.setSize(width, height, false);
  if (currentCamera) {
    currentCamera.aspect = width / height;
    currentCamera.updateProjectionMatrix();
  }
}

function disposeControls(): void {
  controls?.dispose();
  controls = null;
}

function removeAffordances(): void {
  for (const affordance of webXRAffordances.values()) {
    affordance.removeFromParent();
  }
  webXRAffordances.clear();
}

function resetWebXRController(): void {
  if (webXRController?.state === "active") {
    void webXRController.end().catch((error: unknown) => {
      console.error("Alice WebXR session cleanup failed", error);
    });
  }
  webXRController = null;
  removeAffordances();
}

function applyScene(project: AliceProject): void {
  resetWebXRController();
  const { scene, camera, cameraConfig } = buildScene(project, {
    resources: lastArchive?.resources,
  });
  disposeSceneResources(currentScene);
  currentScene = scene;
  currentCamera = camera;

  currentUserRig = new THREE.Group();
  currentUserRig.name = "Alice WebXR user rig";
  currentUserRig.position.set(0, 0, 0);
  currentUserRig.add(camera);
  scene.add(currentUserRig);

  resizeRenderer();

  disposeControls();
  controls = new OrbitControls(camera, canvas);
  controls.target.set(cameraConfig.target.x, cameraConfig.target.y, cameraConfig.target.z);
  controls.minDistance = cameraConfig.minDistance;
  controls.maxDistance = cameraConfig.maxDistance;
  controls.maxPolarAngle = cameraConfig.maxPolarAngle;
  controls.enableDamping = cameraConfig.enableDamping;

  webXRController = createWebXRSessionController({
    renderer,
    scene,
    camera,
    userRig: currentUserRig,
    orbitControls: controls,
    navigator: navigator as unknown as Parameters<typeof createWebXRSessionController>[0]["navigator"],
    logger: console,
    onSelect: (event) => resolveSelectInteraction(event.inputSource),
  });
  webXRController.onStateChange((state) => renderWebXRPanel(state));
  void refreshCapabilityStatus();
  applyCameraWorkflowToViewport();
}

function formatCameraVector(vector: { x: number; y: number; z: number }): string {
  return `${vector.x.toFixed(2)}, ${vector.y.toFixed(2)}, ${vector.z.toFixed(2)}`;
}

function applyCameraWorkflowToViewport(): void {
  if (!currentCamera) {
    return;
  }

  const camera = cameraWorkflow.camera;
  currentCamera.position.set(camera.position.x, camera.position.y, camera.position.z);
  currentCamera.up.set(camera.up.x, camera.up.y, camera.up.z);
  currentCamera.fov = camera.fieldOfViewDegrees;
  currentCamera.lookAt(camera.target.x, camera.target.y, camera.target.z);
  currentCamera.updateProjectionMatrix();

  if (controls) {
    controls.target.set(camera.target.x, camera.target.y, camera.target.z);
    controls.enabled = camera.mode === "orbit";
    controls.update();
  }
}

function renderCameraMarkers(): void {
  cameraMarkerList.replaceChildren();
  for (const marker of cameraWorkflow.markers) {
    cameraMarkerList.appendChild(createCameraMarkerListItem(marker));
  }
}

function createCameraMarkerListItem(marker: CameraMarker): HTMLLIElement {
  const item = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = marker.name;

  const restoreButton = document.createElement("button");
  restoreButton.type = "button";
  restoreButton.className = "secondary";
  restoreButton.textContent = "Restore";
  restoreButton.addEventListener("click", () => {
    updateCameraWorkflow(
      () => restoreCameraMarker(cameraWorkflow, marker.id),
      `Camera marker "${marker.name}" restored.`,
    );
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "secondary";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", () => {
    updateCameraWorkflow(
      () => deleteCameraMarker(cameraWorkflow, marker.id),
      `Camera marker "${marker.name}" deleted.`,
    );
  });

  item.append(label, restoreButton, deleteButton);
  return item;
}

function renderCameraWorkflow(): void {
  const camera = cameraWorkflow.camera;
  cameraMode.textContent = camera.mode;
  cameraPosition.textContent = formatCameraVector(camera.position);
  cameraPreset.value = camera.activePreset ?? "";
  cameraFirstPersonToggle.textContent = camera.mode === "first-person"
    ? "Return to orbit"
    : "Toggle first-person";
  renderCameraMarkers();
  applyCameraWorkflowToViewport();
}

function updateCameraWorkflow(
  updater: () => CameraWorkflowState,
  successMessage: string,
): void {
  try {
    cameraWorkflow = updater();
    renderCameraWorkflow();
    setCameraStatusMessage(successMessage);
  } catch (error) {
    console.error(error);
    setCameraStatusMessage(`Camera error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function renderFrame(time: number, frame?: unknown): void {
  const deltaSeconds = lastAnimationTime === 0 ? 0 : Math.min(0.1, Math.max(0, (time - lastAnimationTime) / 1000));
  lastAnimationTime = time;

  controls?.update();
  if (webXRController?.state === "active" && currentUserRig) {
    const input = webXRController.updateInput(frame);
    syncWebXRAffordances(input);
    const movement = locomotion.update(input, deltaSeconds);
    if (movement.type === "movement") {
      currentUserRig.position.x += movement.deltaMeters.x;
      currentUserRig.position.y += movement.deltaMeters.y;
      currentUserRig.position.z += movement.deltaMeters.z;
    }
    webXREvidence = [...webXREvidence.filter((item) => item.code !== "non-finite-pose"), ...input.evidence, ...movement.evidence];
  }

  if (currentScene && currentCamera) {
    renderer.render(currentScene, currentCamera);
  }
}

async function readSelectedFile(input: HTMLInputElement): Promise<File | null> {
  return input.files?.[0] ?? null;
}

async function loadProjectFromFile(file: File): Promise<AliceProjectArchive> {
  const buffer = await file.arrayBuffer();
  return ProjectIo.readProject(buffer);
}

async function handleFileSelection(): Promise<void> {
  const file = await readSelectedFile(fileInput);
  if (!file) {
    return;
  }

  status.textContent = `Loading ${file.name}...`;
  clearObjectList();

  try {
    const archive = await loadProjectFromFile(file);
    lastArchive = archive;
    lastProject = archive.project;
    selectedTextureResourceId = latestTextureResourceId(archive.project);
    renderProject(archive.project);
    setStatusMessage(describeProject(archive.project));
  } catch (error) {
    console.error(error);
    setErrorMessage(error);
  }
}

async function handleModelImport(): Promise<void> {
    const file = await readSelectedFile(modelInput);
    if (!file) return;

    try {
      const archive = ensureArchive();
      const creation = createImportedProjectAsset({
        kind: "model",
        fileName: file.name,
        displayName: fileDisplayName(file.name),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }, archive.project.importedAssets ?? []);
      archive.project.importedAssets = [...(archive.project.importedAssets ?? []), creation.asset];
      archive.resources.set(creation.archivePath, creation.resourceBytes);
      addImportedModelObject(archive.project, creation.asset);
      renderProject(archive.project);
      setStatusMessage("Imported model");
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    } finally {
      modelInput.value = "";
    }
}

async function handleTextureImport(): Promise<void> {
    const file = await readSelectedFile(textureInput);
    if (!file) return;

    try {
      const archive = ensureArchive();
      const creation = createImportedProjectAsset({
        kind: "texture",
        fileName: file.name,
        displayName: fileDisplayName(file.name),
        bytes: new Uint8Array(await file.arrayBuffer()),
      }, archive.project.importedAssets ?? []);
      archive.project.importedAssets = [...(archive.project.importedAssets ?? []), creation.asset];
      archive.resources.set(creation.archivePath, creation.resourceBytes);
      selectedTextureResourceId = creation.asset.id;
      renderProject(archive.project);
      setStatusMessage("Imported texture");
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    } finally {
      textureInput.value = "";
    }
}

function handleCreateShape(): void {
    const archive = ensureArchive();
    const name = uniqueSceneObjectName(archive.project, "box");
    archive.project.sceneObjects.push({
      name,
      typeName: "org.lgna.story.SBox",
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
    });
    selectedObjectName = name;
    renderProject(archive.project);
    setStatusMessage(`Created ${name}`);
}

function handleApplyTexture(): void {
    const archive = ensureArchive();
    const project = archive.project;
    const object = selectedObjectName
      ? project.sceneObjects.find((candidate) => candidate.name === selectedObjectName)
      : null;

    if (!object) {
      setErrorMessage("Select or create a shape before applying a texture.");
      return;
    }

    const textureResourceId = selectedTextureResourceId ?? latestTextureResourceId(project);
    if (!textureResourceId) {
      setErrorMessage("Import a texture before applying it to a shape.");
      return;
    }

    Object.assign(object, applySurfaceTextureBinding(object, textureResourceId));
    renderProject(project);
    setStatusMessage(`Applied texture to ${object.name}`);
}

async function handleSaveProject(): Promise<void> {
    try {
      const archive = ensureArchive();
      const bytes = await ProjectIo.writeProject(archive, { generateThumbnailFromScene: false });
      const blobBytes = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(blobBytes).set(bytes);
      const blob = new Blob([blobBytes], { type: "application/vnd.alice.project" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${archive.project.projectName || "alice-project"}.a3p`;
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Saved ${archive.project.projectName || "project"}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    }

    async function exportWebPackage(): Promise<void> {
      try {
        const project = ensureArchive().project;
        const response = await fetch("/api/project/export/web-package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: project.projectName || "Alice Project" }),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const exported = await response.json() as ProjectExport.ExportedWebPackage;
        lastWebPackageBase64 = exported.package.base64;
        setStatusMessage(`Exported web package ${exported.package.filename}`);
      } catch (error) {
        console.error(error);
        setErrorMessage(error);
      }
    }

    async function generateShareArtifacts(): Promise<void> {
      try {
        const project = ensureArchive().project;
        if (!lastWebPackageBase64) {
          await exportWebPackage();
        }
        if (!lastWebPackageBase64) {
          throw new Error("Export a web package before sharing.");
        }
        const response = await fetch("/api/project/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            packageBase64: lastWebPackageBase64,
            title: project.projectName || "Alice Project",
          }),
        });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        const shared = await response.json() as ProjectExport.ShareArtifacts;
        setStatusMessage(`Prepared share package ${shared.artifacts.package}`);
      } catch (error) {
        console.error(error);
        setErrorMessage(error);
      }
    }
}

function renderProject(project: AliceProject): void {
    renderObjectList(project);
    renderAssetList(project);
    renderJointObjectOptions(project);
    applyScene(project);
}

function renderJointObjectOptions(project: AliceProject): void {
    jointObjectSelect.replaceChildren();
    for (const object of project.sceneObjects) {
      const option = document.createElement("option");
      option.value = object.name;
      option.textContent = object.name;
      jointObjectSelect.appendChild(option);
    }
}

function handleJointPoseApply(): void {
    const archive = ensureArchive();
    const objectName = jointObjectSelect.value || selectedObjectName;
    const object = objectName
      ? archive.project.sceneObjects.find((candidate) => candidate.name === objectName)
      : null;
    if (!object) {
      setErrorMessage("Select an object before applying a joint pose.");
      return;
    }

    try {
      if (!jointState.hasObject(object.name)) {
        const hierarchy = JointSystem.defaultJointHierarchyForClassName(object.typeName);
        if (!hierarchy) {
          throw new Error(`No default joint hierarchy is available for ${object.typeName}`);
        }
        jointState.registerObject({
          objectName: object.name,
          className: object.typeName,
          hierarchy,
        });
      }
      const firstJoint = Object.keys(jointState.getObjectSnapshot(object.name)?.joints ?? {})[0];
      if (!firstJoint) {
        throw new Error(`No joints are registered for ${object.name}`);
      }
      jointState.applyPose({
        objectName: object.name,
        poseName: jointPoseName.value.trim() || "pose",
        joints: {
          [firstJoint]: {
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
        },
      });
      setStatusMessage(`Applied joint pose to ${object.name}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    }
}

const ModelTextureCameraJointExportWorkflowBrowser = {
    importModelAsset: handleModelImport,
    importTextureAsset: handleTextureImport,
    assignTextureToModel: handleApplyTexture,
    exportWebPackage,
    generateShareArtifacts,
};

function latestTextureResourceId(project: AliceProject): string | null {
    const textures = (project.importedAssets ?? []).filter((asset) => asset.kind === "texture");
    return textures.at(-1)?.id ?? null;
}

function fileDisplayName(fileName: string): string {
    const extensionStart = fileName.lastIndexOf(".");
    const base = extensionStart > 0 ? fileName.slice(0, extensionStart) : fileName;
    return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function addImportedModelObject(project: AliceProject, asset: ImportedProjectAsset): void {
    const name = uniqueSceneObjectName(project, camelCaseName(asset.name));
    project.sceneObjects.push({
      name,
      typeName: "SModel",
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
      modelResourceId: asset.id,
    });
    selectedObjectName = name;
}

function uniqueSceneObjectName(project: AliceProject, baseName: string): string {
    const existing = new Set(project.sceneObjects.map((object) => object.name));
    let candidate = baseName || "object";
    let suffix = 2;
    while (existing.has(candidate)) {
      candidate = `${baseName}${suffix}`;
      suffix += 1;
    }
    return candidate;
}

function camelCaseName(value: string): string {
    const words = value.match(/[A-Za-z0-9]+/g) ?? [];
    if (words.length === 0) return "model";
    return words.map((word, index) => {
      const lower = word.toLowerCase();
      return index === 0 ? lower : `${lower[0]?.toUpperCase() ?? ""}${lower.slice(1)}`;
    }).join("");
}

function describeLastProject(): string {
  if (!lastProject) {
    return "No project loaded";
  }
  return `${lastProject.projectName}: ${lastProject.sceneObjects.length} objects`;
}

function installWindowHandlers(): void {
  window.addEventListener("resize", resizeRenderer);
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "r" && lastProject) {
      event.preventDefault();
      renderObjectList(lastProject);
      applyScene(lastProject);
      setStatusMessage(`Reloaded ${describeLastProject()}`);
    }
  });
}

function installInputHandlers(): void {
  fileInput.addEventListener("change", () => {
    void handleFileSelection();
  });

  cameraMoveForward.addEventListener("click", () => {
    updateCameraWorkflow(
      () => moveCamera(cameraWorkflow, { forward: 1 }),
      "Camera moved forward.",
    );
  });

  cameraPreset.addEventListener("change", () => {
    const preset = cameraPreset.value as CameraPreset;
    updateCameraWorkflow(
      () => applyCameraPreset(cameraWorkflow, preset),
      `Camera view set to ${preset}.`,
    );
  });

  cameraFirstPersonToggle.addEventListener("click", () => {
    const nextMode = cameraWorkflow.camera.mode === "first-person" ? "orbit" : "first-person";
    updateCameraWorkflow(
      () => setCameraMode(cameraWorkflow, nextMode),
      nextMode === "first-person"
        ? "First-person camera mode enabled."
        : "Orbit camera mode enabled.",
    );
  });

  cameraSaveMarker.addEventListener("click", () => {
    const requestedName = cameraMarkerName.value;
    updateCameraWorkflow(
      () => saveCameraMarker(cameraWorkflow, { name: requestedName }),
      `Camera marker "${requestedName.trim()}" saved.`,
    );
    cameraMarkerName.value = "";
  });

  modelInput.addEventListener("change", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.importModelAsset();
  });
  textureInput.addEventListener("change", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.importTextureAsset();
  });
  createShapeButton.addEventListener("click", handleCreateShape);
  applyTextureButton.addEventListener("click", ModelTextureCameraJointExportWorkflowBrowser.assignTextureToModel);
  saveProjectButton.addEventListener("click", () => {
    void handleSaveProject();
  });
  exportWebPackageButton.addEventListener("click", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.exportWebPackage();
  });
  shareWebPackageButton.addEventListener("click", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.generateShareArtifacts();
  });
  jointApplyPose.addEventListener("click", handleJointPoseApply);
}

function renderWebXRPanel(state: WebXRSessionState = webXRController?.state ?? "idle"): void {
  const buttonState: WebXRButtonState = state === "active"
    ? "exit"
    : !currentScene || webXREvidence.some((item) => item.severity === "unsupported")
      ? "disabled"
      : "enter";
  const message = currentScene
    ? state === "active"
      ? "Alice VR is active."
      : "Alice VR is available when browser capabilities allow it."
    : "Load an Alice scene to check VR support.";
  const elements = renderWebXRStatus(webXRStatus, {
    status: state,
    buttonState,
    message,
    locomotionMode: locomotion.mode,
    invalidTargetMessage: webXRInvalidTargetMessage,
    evidence: webXREvidence,
  });
  elements.button.addEventListener("click", () => {
    void handleVRButtonClick();
  });
}

async function refreshCapabilityStatus(): Promise<void> {
  const report = await detectWebXRCapabilities({
    isSecureContext,
    navigator: navigator as unknown as NonNullable<Parameters<typeof detectWebXRCapabilities>[0]>["navigator"],
  });
  webXREvidence = report.evidence;
  renderWebXRPanel(report.status === "unsupported" ? "unsupported" : webXRController?.state ?? "idle");
}

async function handleVRButtonClick(): Promise<void> {
  if (!webXRController) {
    webXREvidence = [{
      code: "webxr-unavailable",
      severity: "unsupported",
      message: "Load an Alice scene before entering VR.",
    }];
    renderWebXRPanel("unsupported");
    return;
  }

  if (webXRController.state === "active") {
    await webXRController.end();
    renderWebXRPanel("ended");
    return;
  }

  const result = await webXRController.start();
  webXREvidence = result.evidence;
  renderWebXRPanel(result.status === "active" ? "active" : result.status);
}

function sourceAffordance(source: WebXRInputSourceState): THREE.Group {
  const existing = webXRAffordances.get(source.id);
  if (existing) {
    return existing;
  }

  const group = new THREE.Group();
  group.name = `Alice WebXR input ${source.id}`;
  group.userData.aliceWebXRAffordance = true;

  const rayGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -3),
  ]);
  const ray = new THREE.Line(rayGeometry, new THREE.LineBasicMaterial({ color: 0x66ccff }));
  ray.name = "target-ray";
  group.add(ray);

  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  grip.name = "grip";
  group.add(grip);

  currentScene?.add(group);
  webXRAffordances.set(source.id, group);
  return group;
}

function applyPose(object: THREE.Object3D, matrix: readonly number[] | undefined): void {
  if (!matrix || matrix.length !== 16 || !matrix.every(Number.isFinite)) {
    object.visible = false;
    return;
  }
  object.visible = true;
  object.matrix.fromArray([...matrix]);
  object.matrix.decompose(object.position, object.quaternion, object.scale);
}

function syncWebXRAffordances(input: WebXRInputState): void {
  const activeIds = new Set(input.sources.map((source) => source.id));
  for (const [id, affordance] of webXRAffordances.entries()) {
    if (!activeIds.has(id)) {
      affordance.removeFromParent();
      webXRAffordances.delete(id);
    }
  }

  for (const source of input.sources) {
    const affordance = sourceAffordance(source);
    const ray = affordance.getObjectByName("target-ray");
    const grip = affordance.getObjectByName("grip");
    if (ray) {
      applyPose(ray, source.targetRay?.matrix);
    }
    if (grip) {
      applyPose(grip, source.grip?.matrix);
    }
  }
}

function findAliceUserData(object: THREE.Object3D, predicate: (userData: Record<string, unknown>) => boolean): Record<string, unknown> | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (predicate(current.userData)) {
      return current.userData;
    }
    current = current.parent;
  }
  return null;
}

function rayFromPose(source: WebXRInputSourceState): THREE.Ray | null {
  const matrix = source.targetRay?.matrix;
  if (!matrix || matrix.length !== 16 || !matrix.every(Number.isFinite)) {
    return null;
  }
  const origin = new THREE.Vector3(matrix[12], matrix[13], matrix[14]);
  const direction = new THREE.Vector3(-matrix[8], -matrix[9], -matrix[10]).normalize();
  if (direction.lengthSq() === 0) {
    return null;
  }
  return new THREE.Ray(origin, direction);
}

function collectInteractionHits(source: WebXRInputSourceState): { objectHits: WebXRObjectHit[]; movementHits: WebXRMovementHit[] } {
  if (!currentScene) {
    return { objectHits: [], movementHits: [] };
  }
  const ray = rayFromPose(source);
  if (!ray) {
    return { objectHits: [], movementHits: [] };
  }

  raycaster.ray.copy(ray);
  const intersections = raycaster.intersectObjects(currentScene.children, true);
  const objectHits: WebXRObjectHit[] = [];
  const movementHits: WebXRMovementHit[] = [];

  for (const hit of intersections) {
    if (findAliceUserData(hit.object, (userData) => Boolean(userData.aliceWebXRAffordance))) {
      continue;
    }
    const pickable = findAliceUserData(hit.object, (userData) => Boolean(userData.aliceWebXRPickable));
    if (pickable) {
      objectHits.push({
        objectName: String(pickable.aliceObjectName ?? (hit.object.name || "Alice object")),
        distanceMeters: hit.distance,
        point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
        pickable: true,
      });
    }
    const movementSurface = findAliceUserData(hit.object, (userData) => Boolean(userData.aliceWebXRMovementSurface));
    if (movementSurface) {
      movementHits.push({
        surfaceName: String(movementSurface.aliceWebXRSurfaceName ?? (hit.object.name || "ground")),
        distanceMeters: hit.distance,
        position: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      });
    }
  }

  return { objectHits, movementHits };
}

function resolveSelectInteraction(inputSource: unknown): void {
  const input = webXRController?.input;
  if (!input || !currentUserRig) {
    return;
  }
  const source = input.sources.find((candidate) => candidate.id === sourceId(inputSource)) ?? input.sources[0];
  if (!source) {
    return;
  }

  const hits = collectInteractionHits(source);
  const result = resolveWebXRInteraction({
    mode: locomotion.mode,
    objectHits: hits.objectHits,
    movementHits: hits.movementHits,
    movementSurfaceNames: locomotion.config.movementSurfaceNames,
    clickMoveMaxDistanceMeters: locomotion.config.clickMoveMaxDistanceMeters,
    clickMoveStepMeters: locomotion.config.clickMoveStepMeters,
    verticalMovement: locomotion.config.verticalMovement,
    currentRigPosition: currentUserRig.position,
  });

  webXREvidence = result.evidence.length > 0 ? [...webXREvidence, ...result.evidence] : webXREvidence;
  webXRInvalidTargetMessage = result.type === "invalid-target" ? "That selection is not a valid movement target." : undefined;
  if (result.type === "movement") {
    currentUserRig.position.set(result.target.position.x, result.target.position.y, result.target.position.z);
  }
  if (result.type === "object-interaction") {
    window.dispatchEvent(new CustomEvent("alice-webxr-object-interaction", {
      detail: { objectName: result.objectName, point: result.point },
    }));
  }
  renderWebXRPanel(webXRController?.state ?? "idle");
}

function sourceId(inputSource: unknown): string {
  const source = inputSource as { handedness?: string; targetRayMode?: string; profiles?: readonly string[] } | undefined;
  return `${source?.handedness || "none"}:${source?.targetRayMode || "unknown"}:${source?.profiles?.[0] || "generic"}`;
}

function initializeApplication(): void {
  resizeRenderer();
  installWindowHandlers();
  installInputHandlers();
  renderCameraWorkflow();
  ensureArchive();
  renderer.setAnimationLoop(renderFrame);
  renderWebXRPanel();
  setStatusMessage("Choose an .a3p file to begin.");
  setCameraStatusMessage("Camera ready.");
  void refreshCapabilityStatus();
}

initializeApplication();
