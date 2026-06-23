import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { type AliceObject, type AliceProject } from "./a3p-parser";
import {
  createAliceEvidenceArtifact,
  prepareAliceEvidenceShare,
  serializeAliceEvidenceArtifact,
  summarizeAliceEvidenceArtifact,
  validateAliceEvidenceArtifact,
  type AliceEvidenceArtifact,
  type AliceEvidenceExportMethod,
  type AliceEvidenceShareOutcome,
  type AliceEvidenceVector,
  type AliceEvidenceVisibleObject,
} from "./alice-evidence-artifact";
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
  addScorekeeper,
  addTimekeeper,
  bindVisibleWorkflowState,
  createDefaultAliceWorkflowState,
  createInitialScoreValues,
  resolveVisibleWorkflowBindings,
  type AliceWorkflowState,
  type ResolvedVisibleWorkflowBinding,
} from "./alice-workflow-state";
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
import { ProjectRunner, type RunResult } from "./project-runner";
import { buildScene } from "./scene-builder";
import { disposeSceneResources } from "./scene-disposal";
import { TweedleCompiler } from "./tweedle-compiler";
import type { LogEntry } from "./tweedle-vm-core-types";
import { detectWebXRCapabilities, type WebXREvidence } from "./webxr-capabilities";
import {
  createCameraVrComfortEvidence,
  createRuntimeParityEvidence,
} from "./runtime-parity-evidence";
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
import {
  exportClassBehaviorPackage,
  importClassBehaviorPackage,
  parseClassBehaviorPackage,
  serializeClassBehaviorPackage,
} from "./project-io/class-behavior-package";
import { executeProject } from "./tweedle-vm";

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
const moveSelectedObjectButton = requireElement("move-selected-object-button", HTMLButtonElement);
const turnSelectedObjectButton = requireElement("turn-selected-object-button", HTMLButtonElement);
const resizeSelectedObjectButton = requireElement("resize-selected-object-button", HTMLButtonElement);
const saveProjectButton = requireElement("export-a3p-button", HTMLButtonElement);
const exportWebPackageButton = requireElement("export-web-package-button", HTMLButtonElement);
const shareWebPackageButton = requireElement("share-web-package-button", HTMLButtonElement);
const classBehaviorSelect = requireElement("class-behavior-select", HTMLSelectElement);
const exportClassBehaviorButton = requireElement("export-class-behavior-button", HTMLButtonElement);
const importClassBehaviorInput = requireElement("import-class-behavior-input", HTMLInputElement);
const classBehaviorList = requireElement("class-behavior-list", HTMLUListElement);
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
const scoreTimeStatus = requireElement("score-time-status", HTMLElement);
const scorekeeperName = requireElement("scorekeeper-name", HTMLInputElement);
const scorekeeperInitialValue = requireElement("scorekeeper-initial-value", HTMLInputElement);
const addScorekeeperButton = requireElement("add-scorekeeper", HTMLButtonElement);
const timekeeperName = requireElement("timekeeper-name", HTMLInputElement);
const addTimekeeperButton = requireElement("add-timekeeper", HTMLButtonElement);
const addVisibleScoreButton = requireElement("add-visible-score", HTMLButtonElement);
const addVisibleTimeButton = requireElement("add-visible-time", HTMLButtonElement);
const visibleScoreLabel = requireElement("visible-score-label", HTMLElement);
const visibleTimeLabel = requireElement("visible-time-label", HTMLElement);
const runWorldButton = requireElement("run-world", HTMLButtonElement);
const workflowSource = requireElement("workflow-source", HTMLTextAreaElement);
const runWorkflowButton = requireElement("run-workflow-button", HTMLButtonElement);
const captureEvidenceButton = requireElement("capture-evidence-button", HTMLButtonElement);
const exportEvidenceButton = requireElement("export-evidence-button", HTMLButtonElement);
const shareEvidenceButton = requireElement("share-evidence-button", HTMLButtonElement);
const evidenceStatus = requireElement("evidence-status", HTMLElement);
const evidenceSummary = requireElement("evidence-summary", HTMLElement);
const evidenceCaptureList = requireElement("evidence-capture-list", HTMLUListElement);

interface AliceWebRunResult {
  status: "completed" | "error";
  success: boolean;
  completionReason: RunResult["completionReason"] | "error";
  execution_log: LogEntry[];
  log: RunResult["log"];
  output: string[];
  error: string | null;
}

interface AliceWebRuntimeState {
  latestRunResult: AliceWebRunResult | null;
}

type AliceEvidenceStatusState = "empty" | "ready" | "exported" | "shared" | "share-unavailable" | "invalid";

declare global {
  interface Window {
    aliceWeb: AliceWebRuntimeState;
  }
}

window.aliceWeb = window.aliceWeb ?? { latestRunResult: null };

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
let lastWebXRCapabilityReport: Awaited<ReturnType<typeof detectWebXRCapabilities>> | null = null;
let webXRInvalidTargetMessage: string | undefined;
let lastAnimationTime = 0;
let cameraWorkflow: CameraWorkflowState = createDefaultCameraWorkflowState();
let aliceWorkflow: AliceWorkflowState = createDefaultAliceWorkflowState();
let workflowScoreValues = createInitialScoreValues(aliceWorkflow);
let workflowElapsedSeconds = 0;
let lastArchive: AliceProjectArchive | null = null;
let selectedObjectName: string | null = null;
let selectedTextureResourceId: string | null = null;
let selectedClassBehaviorName: string | null = null;
let lastWebPackageBase64: string | null = null;
let lastEvidenceArtifact: AliceEvidenceArtifact | null = null;
const jointState = new JointSystem.JointStateStore();
const MOVE_SELECTED_OBJECT_DELTA = { x: 1, y: 0, z: 0 } as const;
const TURN_SELECTED_OBJECT_RADIANS = Math.PI / 12;
const RESIZE_SELECTED_OBJECT_SCALE = 1.2;

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

function markWebPackageStale(): void {
  lastWebPackageBase64 = null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function describeObject(obj: AliceObject): string {
  const shortType = obj.typeName.split(".").pop() ?? obj.typeName;
  const resource = obj.resourceType ? ` [${obj.resourceType.split(".").pop()}]` : "";
  const model = obj.modelResourceId ? " model: imported" : "";
  const surfaceTexture = obj.materialBindings
    ?.find((binding) => binding.target === "surface")?.textureResourceId;
  const texture = surfaceTexture ? ` surface: ${surfaceTexture}` : "";
  return `${obj.name} (${shortType})${resource}${model}${texture}${describeObjectTransform(obj)}`;
}

function describeObjectTransform(obj: AliceObject): string {
  const parts: string[] = [];
  if (obj.position) {
    parts.push(`position: ${formatTransformNumber(obj.position.x)}, ${formatTransformNumber(obj.position.y)}, ${formatTransformNumber(obj.position.z)}`);
  }
  if (obj.orientation) {
    parts.push(`orientation: ${formatTransformNumber(obj.orientation.x)}, ${formatTransformNumber(obj.orientation.y)}, ${formatTransformNumber(obj.orientation.z)}, ${formatTransformNumber(obj.orientation.w)}`);
  }
  if (obj.size) {
    parts.push(`size: ${formatTransformNumber(obj.size.width)}, ${formatTransformNumber(obj.size.height)}, ${formatTransformNumber(obj.size.depth)}`);
  }
  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function formatTransformNumber(value: number): string {
  return Number(value.toFixed(12)).toString();
}

function describeProject(project: AliceProject): string {
  return `Loaded "${project.projectName}" (v${project.version}) – ${project.sceneObjects.length} objects.`;
}

function setStatusMessage(message: string): void {
  status.textContent = message;
  status.dataset.state = "ready";
}

function setLoadingMessage(message: string): void {
  status.textContent = message;
  status.dataset.state = "loading";
}

function setErrorMessage(error: unknown): void {
  status.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
  status.dataset.state = "error";
}

function setCameraStatusMessage(message: string): void {
  cameraStatus.textContent = message;
}

function setEvidenceStatusMessage(message: string, state: AliceEvidenceStatusState): void {
  evidenceStatus.textContent = message;
  evidenceStatus.dataset.aliceEvidenceStatus = state;
  evidenceStatus.dataset.state = state === "invalid" ? "error" : state;
}

function resetEvidenceWorkflow(message: string): void {
  lastEvidenceArtifact = null;
  exportEvidenceButton.disabled = true;
  shareEvidenceButton.disabled = true;
  setEvidenceStatusMessage(message, "empty");
  evidenceSummary.textContent = "No evidence captured.";
  evidenceCaptureList.replaceChildren();
}

function canShareEvidenceFiles(): boolean {
  return typeof navigator.share === "function"
    && typeof File === "function"
    && typeof navigator.canShare === "function";
}

function enableEvidenceActions(): boolean {
  const shareAvailable = canShareEvidenceFiles();
  exportEvidenceButton.disabled = false;
  shareEvidenceButton.disabled = !shareAvailable;
  return shareAvailable;
}

function renderEvidenceArtifactSummary(artifact: AliceEvidenceArtifact, actionLabel: string): void {
  const summary = summarizeAliceEvidenceArtifact(artifact);
  evidenceSummary.textContent = summary.statusText;
  evidenceCaptureList.replaceChildren();
  const item = document.createElement("li");
  item.textContent = `${actionLabel}: ${summary.objectCount} ${summary.objectCount === 1 ? "object" : "objects"} captured.`;
  evidenceCaptureList.appendChild(item);
}

function setScoreTimeStatusMessage(message: string): void {
  scoreTimeStatus.textContent = message;
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

function classBehaviorTypes(project: AliceProject): NonNullable<AliceProject["types"]> {
  return (project.types ?? []).filter((type) => !(type.superTypeName?.includes("SScene") ?? false));
}

function renderClassBehaviorControls(project: AliceProject): void {
  const types = classBehaviorTypes(project);
  classBehaviorSelect.replaceChildren();
  classBehaviorList.replaceChildren();

  if (!selectedClassBehaviorName || !types.some((type) => type.name === selectedClassBehaviorName)) {
    selectedClassBehaviorName = types[0]?.name ?? null;
  }

  for (const type of types) {
    const option = document.createElement("option");
    option.value = type.name;
    option.textContent = type.name;
    option.selected = type.name === selectedClassBehaviorName;
    classBehaviorSelect.appendChild(option);

    const item = document.createElement("li");
    const fields = (type.fields ?? []).map((field) => field.name).join(", ") || "no fields";
    const methods = (type.methods ?? []).map((method) => method.name).join(", ") || "no methods";
    const constructors = `${type.constructors?.length ?? 0} constructor${type.constructors?.length === 1 ? "" : "s"}`;
    item.textContent = `${type.name} extends ${type.superTypeName ?? "java.lang.Object"}; fields: ${fields}; methods: ${methods}; ${constructors}`;
    classBehaviorList.appendChild(item);
  }

  classBehaviorSelect.disabled = types.length === 0;
  exportClassBehaviorButton.disabled = types.length === 0;
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

function renderScoreTimeWorkflow(bindings = resolveVisibleWorkflowBindings(aliceWorkflow, {
  scoreValues: workflowScoreValues,
  elapsedSeconds: workflowElapsedSeconds,
})): void {
  const scoreBinding = bindings.find((binding) => binding.kind === "score");
  const timeBinding = bindings.find((binding) => binding.kind === "time");
  visibleScoreLabel.textContent = scoreBinding?.text ?? "";
  visibleTimeLabel.textContent = timeBinding?.text ?? "";
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

function updateAliceWorkflow(
  updater: () => AliceWorkflowState,
  successMessage: string,
): void {
  try {
    aliceWorkflow = updater();
    workflowScoreValues = createInitialScoreValues(aliceWorkflow);
    workflowElapsedSeconds = 0;
    if (lastArchive) {
      lastArchive.aliceWorkflow = aliceWorkflow;
    }
    renderScoreTimeWorkflow();
    setScoreTimeStatusMessage(successMessage);
  } catch (error) {
    console.error(error);
    setScoreTimeStatusMessage(`Score and time error: ${error instanceof Error ? error.message : String(error)}`);
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

  setLoadingMessage(`Loading ${file.name}...`);
  clearObjectList();
  assetList.replaceChildren();
  classBehaviorSelect.replaceChildren();
  classBehaviorList.replaceChildren();

  try {
    const archive = await loadProjectFromFile(file);
    lastArchive = archive;
    lastProject = archive.project;
    markWebPackageStale();
    aliceWorkflow = archive.aliceWorkflow ?? createDefaultAliceWorkflowState();
    workflowScoreValues = createInitialScoreValues(aliceWorkflow);
    workflowElapsedSeconds = 0;
    selectedTextureResourceId = latestTextureResourceId(archive.project);
    renderProject(archive.project);
    renderScoreTimeWorkflow();
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
      }, archive.project.importedAssets ?? [], archive.resources.keys());
      archive.project.importedAssets = [...(archive.project.importedAssets ?? []), creation.asset];
      archive.resources.set(creation.archivePath, creation.resourceBytes);
      addImportedModelObject(archive.project, creation.asset);
      markWebPackageStale();
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
      }, archive.project.importedAssets ?? [], archive.resources.keys());
      archive.project.importedAssets = [...(archive.project.importedAssets ?? []), creation.asset];
      archive.resources.set(creation.archivePath, creation.resourceBytes);
      selectedTextureResourceId = creation.asset.id;
      markWebPackageStale();
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
    markWebPackageStale();
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
    markWebPackageStale();
    renderProject(project);
    setStatusMessage(`Applied texture to ${object.name}`);
}

function selectedSceneObject(project: AliceProject): AliceObject | null {
    return selectedObjectName
      ? project.sceneObjects.find((candidate) => candidate.name === selectedObjectName) ?? null
      : null;
}

function requireSelectedSceneObject(project: AliceProject): AliceObject | null {
    const object = selectedSceneObject(project);
    if (!object) {
      setErrorMessage("Select or create an object before using selected object actions.");
      return null;
    }
    return object;
}

function requireArchiveForSelectedObjectAction(): AliceProjectArchive | null {
    if (!lastArchive) {
      setErrorMessage("Create or open an Alice project before using selected object actions.");
      return null;
    }
    return lastArchive;
}

function handleMoveSelectedObject(): void {
    const archive = requireArchiveForSelectedObjectAction();
    if (!archive) return;
    const project = archive.project;
    const object = requireSelectedSceneObject(project);
    if (!object) return;

    const position = object.position ?? { x: 0, y: 0, z: 0 };
    object.position = {
      x: position.x + MOVE_SELECTED_OBJECT_DELTA.x,
      y: position.y + MOVE_SELECTED_OBJECT_DELTA.y,
      z: position.z + MOVE_SELECTED_OBJECT_DELTA.z,
    };
    markWebPackageStale();
    renderProject(project);
    setStatusMessage(`Moved ${object.name}`);
}

function handleTurnSelectedObject(): void {
    const archive = requireArchiveForSelectedObjectAction();
    if (!archive) return;
    const project = archive.project;
    const object = requireSelectedSceneObject(project);
    if (!object) return;

    object.orientation = multiplyQuaternions(
      object.orientation ?? { x: 0, y: 0, z: 0, w: 1 },
      yawQuaternion(TURN_SELECTED_OBJECT_RADIANS),
    );
    markWebPackageStale();
    renderProject(project);
    setStatusMessage(`Turned ${object.name}`);
}

function handleResizeSelectedObject(): void {
    const archive = requireArchiveForSelectedObjectAction();
    if (!archive) return;
    const project = archive.project;
    const object = requireSelectedSceneObject(project);
    if (!object) return;

    const size = object.size ?? { width: 1, height: 1, depth: 1 };
    object.size = {
      width: size.width * RESIZE_SELECTED_OBJECT_SCALE,
      height: size.height * RESIZE_SELECTED_OBJECT_SCALE,
      depth: size.depth * RESIZE_SELECTED_OBJECT_SCALE,
    };
    markWebPackageStale();
    renderProject(project);
    setStatusMessage(`Resized ${object.name}`);
}

function yawQuaternion(radians: number): NonNullable<AliceObject["orientation"]> {
    const halfAngle = radians / 2;
    return {
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    };
}

function multiplyQuaternions(
    current: NonNullable<AliceObject["orientation"]>,
    delta: NonNullable<AliceObject["orientation"]>,
): NonNullable<AliceObject["orientation"]> {
    const next = {
      x: current.w * delta.x + current.x * delta.w + current.y * delta.z - current.z * delta.y,
      y: current.w * delta.y - current.x * delta.z + current.y * delta.w + current.z * delta.x,
      z: current.w * delta.z + current.x * delta.y - current.y * delta.x + current.z * delta.w,
      w: current.w * delta.w - current.x * delta.x - current.y * delta.y - current.z * delta.z,
    };
    return normalizeQuaternion(next);
}

function normalizeQuaternion(
    quaternion: NonNullable<AliceObject["orientation"]>,
): NonNullable<AliceObject["orientation"]> {
    const length = Math.hypot(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    if (length === 0 || !Number.isFinite(length)) {
      throw new Error("Alice object orientation must be finite.");
    }
    return {
      x: quaternion.x / length,
      y: quaternion.y / length,
      z: quaternion.z / length,
      w: quaternion.w / length,
    };
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
}

async function handleClassBehaviorExport(): Promise<void> {
    try {
      const archive = ensureArchive();
      const typeName = classBehaviorSelect.value || selectedClassBehaviorName;
      if (!typeName) {
        throw new Error("Choose a class behavior before exporting.");
      }
      const packageData = exportClassBehaviorPackage(archive.project, typeName);
      const blob = new Blob([serializeClassBehaviorPackage(packageData)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = classBehaviorFilename(packageData.type.name);
      link.click();
      URL.revokeObjectURL(url);
      setStatusMessage(`Exported ${packageData.type.name}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    }
}

async function handleClassBehaviorImport(): Promise<void> {
    const file = await readSelectedFile(importClassBehaviorInput);
    if (!file) return;

    try {
      const archive = ensureArchive();
      const packageData = parseClassBehaviorPackage(await file.text());
      const result = importClassBehaviorPackage(archive.project, packageData);
      selectedClassBehaviorName = result.importedName;
      renderProject(archive.project);
      renderClassBehaviorControls(archive.project);
      setStatusMessage(`Imported ${result.importedName}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    } finally {
      importClassBehaviorInput.value = "";
    }
}

function buildRunId(capturedAt: string): string {
  return `run-${capturedAt.replace(/[:.]/g, "-")}`;
}

function vectorFromThree(vector: THREE.Vector3): AliceEvidenceVector {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

function scenePositionForObject(object: AliceObject): AliceEvidenceVector {
  const sceneObject = currentScene?.getObjectByName(object.name);
  if (sceneObject) {
    const position = new THREE.Vector3();
    sceneObject.getWorldPosition(position);
    return vectorFromThree(position);
  }
  return object.position ?? { x: 0, y: 0, z: 0 };
}

function collectVisibleObjectEvidence(project: AliceProject): AliceEvidenceVisibleObject[] {
  return project.sceneObjects.map((object) => {
    const sceneObject = currentScene?.getObjectByName(object.name);
    return {
      name: object.name,
      typeName: object.typeName,
      visible: sceneObject?.visible ?? true,
      position: scenePositionForObject(object),
    };
  });
}

function evidenceFilenameForProject(project: AliceProject): string {
  return `${project.projectName || "Alice world"} Alice evidence.json`;
}

function createEvidenceArtifactForCurrentScene(
  method: AliceEvidenceExportMethod,
  share?: { available: boolean; outcome: AliceEvidenceShareOutcome },
): AliceEvidenceArtifact {
  const project = lastProject;
  if (!project || !currentScene || !currentCamera) {
    throw new Error("Load an Alice world before capturing evidence.");
  }
  if (project.sceneObjects.length === 0) {
    throw new Error("Add or load visible Alice world objects before capturing evidence.");
  }

  const capturedAt = new Date().toISOString();
  const requestedAt = method === "download" ? new Date().toISOString() : capturedAt;
  const artifact = createAliceEvidenceArtifact({
    world: {
      name: project.projectName || "Alice world",
      aliceVersion: project.version,
      objectCount: project.sceneObjects.length,
    },
    run: {
      id: buildRunId(capturedAt),
      capturedAt,
    },
    visibleBehavior: {
      statusText: status.textContent?.trim() || describeProject(project),
      viewport: {
        width: renderer.domElement.width || canvas.clientWidth || 1,
        height: renderer.domElement.height || canvas.clientHeight || 1,
        canvasSnapshot: {
          available: false,
          reason: "structured-scene-metadata",
          width: renderer.domElement.width || canvas.clientWidth || 1,
          height: renderer.domElement.height || canvas.clientHeight || 1,
          mimeType: "image/png",
        },
      },
      camera: {
        mode: cameraWorkflow.camera.mode,
        position: vectorFromThree(currentCamera.position),
        target: cameraWorkflow.camera.target,
      },
      objects: collectVisibleObjectEvidence(project),
    },
    runtimeReview: createRuntimeParityEvidence({
      camera: cameraWorkflow.camera,
      project,
      statusText: status.textContent?.trim() || describeProject(project),
      webxrReport: lastWebXRCapabilityReport,
    }),
    export: {
      method,
      requestedAt,
      filename: evidenceFilenameForProject(project),
      mimeType: "application/json",
      ...(share ? { share } : {}),
    },
  });

  const validation = validateAliceEvidenceArtifact(artifact);
  if (!validation.valid) {
    throw new Error(`Alice evidence artifact is incomplete: ${validation.errors.join("; ")}`);
  }
  return artifact;
}

function handleCaptureEvidence(): void {
  try {
    lastEvidenceArtifact = createEvidenceArtifactForCurrentScene("download");
    const shareAvailable = enableEvidenceActions();
    renderEvidenceArtifactSummary(lastEvidenceArtifact, "Visible behavior");
    setEvidenceStatusMessage(
      shareAvailable
        ? "Visible behavior captured."
        : "Visible behavior captured. Native sharing is unavailable; export evidence instead.",
      shareAvailable ? "ready" : "share-unavailable",
    );
  } catch (error) {
    console.error(error);
    setEvidenceStatusMessage(`Evidence error: ${error instanceof Error ? error.message : String(error)}`, "invalid");
  }
}

function downloadEvidenceArtifact(artifact: AliceEvidenceArtifact): void {
  const blob = new Blob([serializeAliceEvidenceArtifact(artifact)], { type: artifact.export.mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = artifact.export.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function handleExportEvidence(): void {
  try {
    const artifact = createEvidenceArtifactForCurrentScene("download");
    lastEvidenceArtifact = artifact;
    downloadEvidenceArtifact(artifact);
    enableEvidenceActions();
    setEvidenceStatusMessage(`Exported ${artifact.export.filename}.`, "exported");
    renderEvidenceArtifactSummary(artifact, "Exported evidence");
  } catch (error) {
    console.error(error);
    setEvidenceStatusMessage(`Evidence error: ${error instanceof Error ? error.message : String(error)}`, "invalid");
  }
}

async function handleShareEvidence(): Promise<void> {
  try {
    if (!canShareEvidenceFiles()) {
      lastEvidenceArtifact = prepareAliceEvidenceShare(createEvidenceArtifactForCurrentScene("native-share"), {
        available: false,
        outcome: "unavailable",
      });
      exportEvidenceButton.disabled = false;
      shareEvidenceButton.disabled = true;
      renderEvidenceArtifactSummary(lastEvidenceArtifact, "Visible behavior");
      setEvidenceStatusMessage("Native sharing is unavailable. Export evidence instead.", "share-unavailable");
      return;
    }

    const artifact = prepareAliceEvidenceShare(createEvidenceArtifactForCurrentScene("native-share"), {
      available: true,
      outcome: "prepared",
    });
    const file = new File([serializeAliceEvidenceArtifact(artifact)], artifact.export.filename, {
      type: artifact.export.mimeType,
    });
    const shareData: ShareData = {
      title: "Alice evidence",
      text: "Alice visible behavior evidence",
      files: [file],
    };
    if (!navigator.canShare(shareData)) {
      lastEvidenceArtifact = prepareAliceEvidenceShare(createEvidenceArtifactForCurrentScene("native-share"), {
        available: false,
        outcome: "unavailable",
      });
      exportEvidenceButton.disabled = false;
      shareEvidenceButton.disabled = true;
      renderEvidenceArtifactSummary(lastEvidenceArtifact, "Visible behavior");
      setEvidenceStatusMessage("Native sharing cannot share this evidence. Export evidence instead.", "share-unavailable");
      return;
    }

    await navigator.share(shareData);
    lastEvidenceArtifact = prepareAliceEvidenceShare(createEvidenceArtifactForCurrentScene("native-share"), {
      available: true,
      outcome: "completed",
    });
    setEvidenceStatusMessage("Evidence shared.", "shared");
    renderEvidenceArtifactSummary(lastEvidenceArtifact, "Shared evidence");
  } catch (error) {
    console.error(error);
    setEvidenceStatusMessage(`Evidence error: ${error instanceof Error ? error.message : String(error)}`, "invalid");
  }
}

async function exportWebPackage(): Promise<void> {
      try {
        const archive = ensureArchive();
        const project = archive.project;
        const archiveBytes = await ProjectIo.writeProject(archive, { generateThumbnailFromScene: false });
        const response = await fetch("/api/project/export/web-package", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: project.projectName || "Alice Project",
            archiveBase64: bytesToBase64(archiveBytes),
          }),
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

function renderProject(project: AliceProject): void {
    renderObjectList(project);
    renderAssetList(project);
    renderClassBehaviorControls(project);
    renderJointObjectOptions(project);
    applyScene(project);
    resetEvidenceWorkflow("Alice world ready for evidence capture.");
    renderScoreTimeWorkflow();
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
      markWebPackageStale();
      setStatusMessage(`Applied joint pose to ${object.name}`);
    } catch (error) {
      console.error(error);
      setErrorMessage(error);
    }
}

async function handleRunWorkflow(): Promise<void> {
    const source = workflowSource.value;
    window.aliceWeb.latestRunResult = null;
    setStatusMessage("Running Alice workflow.");

    try {
      const unit = new TweedleCompiler().compile(source, "AliceWorkflow.tweedle");
      if (!unit.success) {
        const firstError = unit.errors[0];
        throw new Error(firstError ? `Alice workflow compile error: ${firstError.message}` : "Alice workflow compile error");
      }

      const result = await new ProjectRunner({ loggingLevel: "debug", tickMs: 1 }).run(unit);
      if (!result.execution_log) {
        throw new Error("Alice workflow run did not produce a structured VM execution log.");
      }

      window.aliceWeb.latestRunResult = {
        status: result.completionReason === "completed" ? "completed" : "error",
        success: result.success,
        completionReason: result.completionReason,
        execution_log: result.execution_log,
        log: result.log,
        output: result.output,
        error: result.error,
      };
      setStatusMessage(result.success ? "Alice workflow completed." : `Alice workflow stopped: ${result.completionReason}`);
    } catch (error) {
      console.error(error);
      window.aliceWeb.latestRunResult = {
        status: "error",
        success: false,
        completionReason: "error",
        execution_log: [],
        log: [],
        output: [],
        error: error instanceof Error ? error.message : String(error),
      };
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

function classBehaviorFilename(typeName: string): string {
    const safeBase = typeName
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      || "class-behavior";
    return `${safeBase}.alice-class-behavior.json`;
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

  addScorekeeperButton.addEventListener("click", handleAddScorekeeper);
  addTimekeeperButton.addEventListener("click", handleAddTimekeeper);
  addVisibleScoreButton.addEventListener("click", handleAddVisibleScoreBinding);
  addVisibleTimeButton.addEventListener("click", handleAddVisibleTimeBinding);
  runWorldButton.addEventListener("click", handleRunWorld);

  modelInput.addEventListener("change", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.importModelAsset();
  });
  textureInput.addEventListener("change", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.importTextureAsset();
  });
  createShapeButton.addEventListener("click", handleCreateShape);
  applyTextureButton.addEventListener("click", ModelTextureCameraJointExportWorkflowBrowser.assignTextureToModel);
  classBehaviorSelect.addEventListener("change", () => {
    selectedClassBehaviorName = classBehaviorSelect.value || null;
  });
  exportClassBehaviorButton.addEventListener("click", () => {
    void handleClassBehaviorExport();
  });
  importClassBehaviorInput.addEventListener("change", () => {
    void handleClassBehaviorImport();
  });
  moveSelectedObjectButton.addEventListener("click", handleMoveSelectedObject);
  turnSelectedObjectButton.addEventListener("click", handleTurnSelectedObject);
  resizeSelectedObjectButton.addEventListener("click", handleResizeSelectedObject);
  saveProjectButton.addEventListener("click", () => {
    void handleSaveProject();
  });
  runWorkflowButton.addEventListener("click", () => {
    void handleRunWorkflow();
  });
  exportWebPackageButton.addEventListener("click", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.exportWebPackage();
  });
  shareWebPackageButton.addEventListener("click", () => {
    void ModelTextureCameraJointExportWorkflowBrowser.generateShareArtifacts();
  });
  jointApplyPose.addEventListener("click", handleJointPoseApply);
  captureEvidenceButton.addEventListener("click", handleCaptureEvidence);
  exportEvidenceButton.addEventListener("click", handleExportEvidence);
  shareEvidenceButton.addEventListener("click", () => {
    void handleShareEvidence();
  });
}

function handleAddScorekeeper(): void {
  const requestedName = scorekeeperName.value.trim();
  const parsedInitialValue = scorekeeperInitialValue.value.trim() === ""
    ? 0
    : Number(scorekeeperInitialValue.value);
  updateAliceWorkflow(
    () => addScorekeeper(aliceWorkflow, { name: requestedName, initialValue: parsedInitialValue }),
    `Scorekeeper "${requestedName}" added.`,
  );
}

function handleAddTimekeeper(): void {
  const requestedName = timekeeperName.value.trim();
  updateAliceWorkflow(
    () => addTimekeeper(aliceWorkflow, { name: requestedName }),
    `Timekeeper "${requestedName}" added.`,
  );
}

function handleAddVisibleScoreBinding(): void {
  const scorekeeper = aliceWorkflow.scorekeepers[0];
  if (!scorekeeper) {
    setScoreTimeStatusMessage("Add a scorekeeper before showing score.");
    return;
  }
  updateAliceWorkflow(
    () => bindVisibleWorkflowState(aliceWorkflow, {
      id: "score-label",
      kind: "score",
      sourceName: scorekeeper.name,
      target: "world-overlay",
      label: "Score",
      format: "integer",
    }),
    "Visible score added.",
  );
}

function handleAddVisibleTimeBinding(): void {
  const timekeeper = aliceWorkflow.timekeepers[0];
  if (!timekeeper) {
    setScoreTimeStatusMessage("Add a timekeeper before showing time.");
    return;
  }
  updateAliceWorkflow(
    () => bindVisibleWorkflowState(aliceWorkflow, {
      id: "time-label",
      kind: "time",
      sourceName: timekeeper.name,
      target: "world-overlay",
      label: "Time",
      format: "seconds-one-decimal",
    }),
    "Visible time added.",
  );
}

function handleRunWorld(): void {
  try {
    const archive = ensureArchive();
    archive.aliceWorkflow = aliceWorkflow;
    ensureScoreTimeRunMethod(archive.project);
    const execution = executeProject(archive.project, { aliceWorkflow });
    workflowScoreValues = execution.scoreValues;
    workflowElapsedSeconds = readElapsedSeconds(execution.visibleWorkflowBindings);
    renderScoreTimeWorkflow(execution.visibleWorkflowBindings);
    setScoreTimeStatusMessage("World run complete.");
  } catch (error) {
    console.error(error);
    setScoreTimeStatusMessage(`Score and time error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function ensureScoreTimeRunMethod(project: AliceProject): void {
  const scorekeeper = aliceWorkflow.scorekeepers[0];
  if (!scorekeeper) {
    throw new Error("Add a scorekeeper before running the world.");
  }
  const currentScore = workflowScoreValues.get(scorekeeper.name) ?? scorekeeper.initialValue;
  const methodName = "aliceScoreTimeRun";
  project.methods = project.methods.filter((method) => method.name !== methodName);
  project.methods.push({
    name: methodName,
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: [
      {
        kind: "VariableDeclaration",
        name: scorekeeper.name,
        varType: "WholeNumber",
        value: String(currentScore),
      },
      {
        kind: "VariableAssignment",
        name: scorekeeper.name,
        value: `${scorekeeper.name} + 10`,
      },
    ],
  });
}

function readElapsedSeconds(bindings: readonly ResolvedVisibleWorkflowBinding[]): number {
  return bindings.find((binding) => binding.kind === "time")?.value ?? 0;
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
    cameraComfort: createCameraVrComfortEvidence({
      camera: cameraWorkflow.camera,
      webxrReport: lastWebXRCapabilityReport,
    }),
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
  lastWebXRCapabilityReport = report;
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
  renderScoreTimeWorkflow();
  ensureArchive();
  renderer.setAnimationLoop(renderFrame);
  renderWebXRPanel();
  setStatusMessage("Choose an .a3p file to begin.");
  setCameraStatusMessage("Camera ready.");
  resetEvidenceWorkflow("Load an Alice world to capture evidence.");
  setScoreTimeStatusMessage("Score and time ready.");
  void refreshCapabilityStatus();
}

initializeApplication();
