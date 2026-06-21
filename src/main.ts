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
import { readProject, writeProject, type AliceProjectArchive } from "./project-io";
import { buildScene } from "./scene-builder";
import { disposeSceneResources } from "./scene-disposal";

function requireElement<T extends HTMLElement>(id: string, ctor: abstract new (...args: never[]) => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof ctor)) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}

const fileInput = requireElement("file-input", HTMLInputElement);
const modelInput = requireElement("import-model-input", HTMLInputElement);
const textureInput = requireElement("import-texture-input", HTMLInputElement);
const createShapeButton = requireElement("create-shape-button", HTMLButtonElement);
const applyTextureButton = requireElement("apply-texture-button", HTMLButtonElement);
const saveProjectButton = requireElement("save-project-button", HTMLButtonElement);
const objectList = requireElement("object-list", HTMLUListElement);
const assetList = requireElement("asset-list", HTMLUListElement);
const status = requireElement("status", HTMLElement);
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

let currentScene: THREE.Scene | null = null;
let currentCamera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let lastProject: AliceProject | null = null;
let cameraWorkflow: CameraWorkflowState = createDefaultCameraWorkflowState();
let lastArchive: AliceProjectArchive | null = null;
let selectedObjectName: string | null = null;
let selectedTextureResourceId: string | null = null;

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
  return `Loaded "${project.projectName}" (v${project.version}) – ${project.sceneObjects.length} objects`;
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

function applyScene(project: AliceProject): void {
  const { scene, camera, cameraConfig } = buildScene(project, {
    resources: lastArchive?.resources,
  });
  disposeSceneResources(currentScene);
  currentScene = scene;
  currentCamera = camera;
  resizeRenderer();

  disposeControls();
  controls = new OrbitControls(camera, canvas);
  controls.target.set(cameraConfig.target.x, cameraConfig.target.y, cameraConfig.target.z);
  controls.minDistance = cameraConfig.minDistance;
  controls.maxDistance = cameraConfig.maxDistance;
  controls.maxPolarAngle = cameraConfig.maxPolarAngle;
  controls.enableDamping = cameraConfig.enableDamping;
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

function animate(): void {
  requestAnimationFrame(animate);
  controls?.update();
  if (currentScene && currentCamera) {
    renderer.render(currentScene, currentCamera);
  }
}

async function readSelectedFile(input: HTMLInputElement): Promise<File | null> {
  const file = input.files?.[0] ?? null;
  return file;
}

async function loadProjectFromFile(file: File): Promise<AliceProjectArchive> {
  const buffer = await file.arrayBuffer();
  return readProject(buffer);
}

async function handleFileSelection(): Promise<void> {
  const file = await readSelectedFile(fileInput);
  if (!file) {
    return;
  }

  status.textContent = `Loading ${file.name}…`;
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
      const bytes = await writeProject(archive, { generateThumbnailFromScene: false });
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
}

function renderProject(project: AliceProject): void {
    renderObjectList(project);
    renderAssetList(project);
    applyScene(project);
}

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
    void handleModelImport();
  });
  textureInput.addEventListener("change", () => {
    void handleTextureImport();
  });
  createShapeButton.addEventListener("click", handleCreateShape);
  applyTextureButton.addEventListener("click", handleApplyTexture);
  saveProjectButton.addEventListener("click", () => {
    void handleSaveProject();
  });
}

function initializeApplication(): void {
  resizeRenderer();
  installWindowHandlers();
  installInputHandlers();
  renderCameraWorkflow();
  ensureArchive();
  animate();
  setStatusMessage("Choose an .a3p file to begin.");
  setCameraStatusMessage("Camera ready.");
}

initializeApplication();
