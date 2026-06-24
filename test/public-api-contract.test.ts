import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import { mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as PublicApi from "../src/index.js";

const TEST_ARTIFACT_ROOT = fileURLToPath(new URL("../target/test-artifacts/public-api-contract/", import.meta.url));
const SERVER_EVIDENCE_DIR = `${TEST_ARTIFACT_ROOT}server-evidence`;

type NamespaceModule = Record<string, unknown>;
type FactoryCase = () => unknown | Promise<unknown>;

function isConstructable(value: unknown): value is new (...args: unknown[]) => unknown {
  if (typeof value !== "function") {
    return false;
  }
  try {
    Reflect.construct(String, [], value);
    return true;
  } catch {
    return false;
  }
}

function expectKeys(value: unknown, keys: string[]): void {
  expect(value).toBeTruthy();
  for (const key of keys) {
    expect(value).toHaveProperty(key);
  }
}

function createContractProject() {
  const project = PublicApi.ProjectTemplate.createEmptyWorldProject({ projectName: "ContractWorld" });
  project.sceneObjects.push({
    name: "hero",
    typeName: "org.lgna.story.SBiped",
    resourceType: null,
    position: PublicApi.StoryApi.createPosition(0, 0, 0),
    orientation: PublicApi.StoryApi.createOrientation(),
    size: PublicApi.StoryApi.createSize(1, 1, 1),
  });
  project.methods.push({
    name: "wave",
    isFunction: false,
    returnType: "void",
    parameters: [],
    statements: [],
  });
  return project;
}

function createContractBounds() {
  return PublicApi.StoryApi.createBoundingBox(
    PublicApi.StoryApi.createPosition(-1, 0, -2),
    PublicApi.StoryApi.createPosition(1, 2, 2),
  );
}

function createSpeechSynthesisRuntime() {
  class TestSpeechSynthesisUtterance {
    rate = 1;
    pitch = 1;
    volume = 1;

    constructor(readonly text: string) {}
  }

  return {
    speechSynthesis: {
      speak: () => undefined,
      cancel: () => undefined,
    } as unknown as SpeechSynthesis,
    SpeechSynthesisUtterance: TestSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance,
  };
}

function buildFactoryCases() {
  const contractProject = createContractProject();
  const contractBounds = createContractBounds();
  const currentCamera = PublicApi.StoryApi.createPosition(0, 3, 6);
  const parsedScript = PublicApi.TweedleParser.parseTweedle(`class Demo {
    WholeNumber answer() {
      return 42;
    }
  }`);
  const contractArchive = PublicApi.ProjectTemplate.createProjectFromTemplate("empty-world", {
    projectName: "ArchiveContract",
  });

  return new Map<string, FactoryCase>([
    ["Accessibility.createHighContrastStyle", () => PublicApi.Accessibility.createHighContrastStyle()],
    ["AliceEvidenceArtifact.createAliceEvidenceArtifact", () => PublicApi.AliceEvidenceArtifact.createAliceEvidenceArtifact({
      world: {
        name: "ContractWorld",
        aliceVersion: "3.10.0.0",
        objectCount: 1,
      },
      run: {
        id: "run-contract",
        capturedAt: "2026-06-22T05:19:37.228Z",
      },
      visibleBehavior: {
        statusText: "Loaded ContractWorld.",
        viewport: {
          width: 640,
          height: 480,
          canvasSnapshot: {
            available: false,
            reason: "structured-scene-metadata",
          },
        },
        camera: {
          mode: "orbit",
          position: { x: 0, y: 1, z: 6 },
          target: { x: 0, y: 1, z: 0 },
        },
        objects: [{
          name: "alice",
          typeName: "org.lgna.story.SBiped",
          visible: true,
          position: { x: 0, y: 0, z: 0 },
        }],
      },
      export: {
        method: "download",
        requestedAt: "2026-06-22T05:19:38.000Z",
        filename: "ContractWorld Alice evidence.json",
        mimeType: "application/json",
      },
    })],
    ["Analytics.createAnalyticsSnapshot", () => PublicApi.Analytics.createAnalyticsSnapshot()],
    ["AliceWorkflowState.createDefaultAliceWorkflowState", () => PublicApi.AliceWorkflowState.createDefaultAliceWorkflowState()],
    ["AliceWorkflowState.createInitialScoreValues", () => PublicApi.AliceWorkflowState.createInitialScoreValues(
      PublicApi.AliceWorkflowState.createDefaultAliceWorkflowState(),
    )],
    ["CameraWorkflow.createDefaultCameraWorkflowState", () => PublicApi.CameraWorkflow.createDefaultCameraWorkflowState()],
    ["RuntimeParityEvidence.createCameraVrComfortEvidence", () => PublicApi.RuntimeParityEvidence.createCameraVrComfortEvidence({
      camera: PublicApi.CameraWorkflow.createDefaultCameraWorkflowState().camera,
    })],
    ["RuntimeParityEvidence.createPlayerComfortSessionEvidence", () => PublicApi.RuntimeParityEvidence.createPlayerComfortSessionEvidence({
      mode: "headset",
      sessionLabel: "Contract headset session",
      playerAlias: "student player",
      observerAlias: "teacher observer",
      headsetEvidenceArtifact: "recordings/contract-session.mp4",
      comfort: {
        orientationObservation: "Player found the intended path from the arrow cue.",
        locomotionComfort: "Player preferred point-click movement over smooth turning.",
        discoverabilityCue: "Player noticed the highlighted gate without verbal help.",
        stopOrContinueDecision: "Observer stopped after one discomfort note.",
      },
      revisionLoop: {
        beforeObservation: "Before revision, the player missed the highlighted gate.",
        revisionChange: "Author brightened the gate cue and slowed camera motion.",
        afterObservation: "After revision, the player found the gate without prompt.",
      },
    })],
    ["RuntimeParityEvidence.createAccessibilityRescueCaptionEvidence", () => PublicApi.RuntimeParityEvidence.createAccessibilityRescueCaptionEvidence({
      camera: PublicApi.CameraWorkflow.createDefaultCameraWorkflowState().camera,
      project: contractProject,
      statusText: "Loaded ContractWorld.",
    })],
    ["RuntimeParityEvidence.createGalleryWalkRubricEvidence", () => PublicApi.RuntimeParityEvidence.createGalleryWalkRubricEvidence({
      project: contractProject,
    })],
    ["RuntimeParityEvidence.createRuntimeParityEvidence", () => PublicApi.RuntimeParityEvidence.createRuntimeParityEvidence({
      camera: PublicApi.CameraWorkflow.createDefaultCameraWorkflowState().camera,
      project: contractProject,
      statusText: "Loaded ContractWorld.",
    })],
    ["CodeGeneration.createTweedleSource", () => PublicApi.CodeGeneration.createTweedleSource("Demo", [])],
    ["Curriculum.createCurriculumMetadata", () => PublicApi.Curriculum.createCurriculumMetadata()],
    ["Curriculum.createCurriculumProgress", () => PublicApi.Curriculum.createCurriculumProgress()],
    ["ErrorHandling.createStructuredErrorReport", () => PublicApi.ErrorHandling.createStructuredErrorReport(new Error("boom"))],
    ["EntityAnimation.createBrowserSpeechSynthesisAdapter", () => PublicApi.EntityAnimation.createBrowserSpeechSynthesisAdapter(createSpeechSynthesisRuntime())],
    ["ExportHtml.createHtmlExportDocument", () => PublicApi.ExportHtml.createHtmlExportDocument(contractProject)],
    ["Formatters.createDefaultFormatterRegistry", () => PublicApi.Formatters.createDefaultFormatterRegistry()],
    ["ImageEditor.createImage", () => PublicApi.ImageEditor.createImage(2, 3)],
    ["InstanceFactory.createFactoryFromTypeSelection", () => PublicApi.InstanceFactory.createFactoryFromTypeSelection("Object")],
    ["JointSystem.createJointedModelResource", () => PublicApi.JointSystem.createJointedModelResource("ContractRig", [{
      name: "ROOT",
      parentName: null,
      localTransform: { position: PublicApi.StoryApi.createPosition(), orientation: PublicApi.StoryApi.createOrientation() },
      children: [],
    }])],
    ["JointSystem.createJointedModelResourceFromModel", () => PublicApi.JointSystem.createJointedModelResourceFromModel("HeroRig", new PublicApi.BipedQuadruped.SBiped("Hero"))],
    ["Localization.createFormatter", () => PublicApi.Localization.createFormatter("en")],
    ["Materials.createMaterialDefinition", () => PublicApi.Materials.createMaterialDefinition({ opacity: 2 })],
    ["Materials.createAppearanceFromMaterial", () => PublicApi.Materials.createAppearanceFromMaterial(PublicApi.Materials.createMaterialDefinition())],
    ["ModelTextureCameraJointExportWorkflow.createWorkflowState", () => PublicApi.ModelTextureCameraJointExportWorkflow.createWorkflowState({ project: contractProject })],
    ["NetworkLayer.createHttpServiceAdapter", () => PublicApi.NetworkLayer.createHttpServiceAdapter({ serviceName: "contract-api" })],
    ["PrintSystem.createPrintableDocument", () => PublicApi.PrintSystem.createPrintableDocument(parsedScript)],
    ["ProjectAudio.createEmptyProjectAudioState", () => PublicApi.ProjectAudio.createEmptyProjectAudioState()],
    ["ProjectAudio.createDefaultProjectAudioState", () => PublicApi.ProjectAudio.createDefaultProjectAudioState()],
    ["ProjectAudio.createProjectAudioPlaybackBridge", () => PublicApi.ProjectAudio.createProjectAudioPlaybackBridge(
      PublicApi.ProjectAudio.createEmptyProjectAudioState(),
      {
        createOutput: () => ({
          play: () => undefined,
          stop: () => undefined,
        }),
      },
    )],
    ["ProjectAudio.createWebAudioProjectOutputFactory", () => PublicApi.ProjectAudio.createWebAudioProjectOutputFactory({
      resources: new Map(),
      runtimeMode: "simulation",
    })],
    ["ProjectTemplate.createEmptyWorldProject", () => PublicApi.ProjectTemplate.createEmptyWorldProject({ projectName: "FactoryWorld" })],
    ["ProjectTemplate.createProjectFromTemplate", () => contractArchive],
    ["RenderAnimation.createAnimationTransform", () => PublicApi.RenderAnimation.createAnimationTransform()],
    ["RenderMesh.createBoxMesh", () => PublicApi.RenderMesh.createBoxMesh({ width: 2, height: 4, depth: 6 })],
    ["RenderMesh.createSphereMesh", () => PublicApi.RenderMesh.createSphereMesh({ radius: 2, widthSegments: 8, heightSegments: 4 })],
    ["RenderMesh.createCylinderMesh", () => PublicApi.RenderMesh.createCylinderMesh({ radiusTop: 1, radiusBottom: 0.5, height: 4, radialSegments: 8 })],
    ["ResourceManager.createResourceManager", () => PublicApi.ResourceManager.createResourceManager(() => new Uint8Array([1, 2, 3]))],
    ["SceneLayout.createViewingPerspective", () => PublicApi.SceneLayout.createViewingPerspective(contractBounds, currentCamera)],
    ["SceneLayout.createTopCamera", () => PublicApi.SceneLayout.createTopCamera(contractBounds)],
    ["SceneLayout.createSideCamera", () => PublicApi.SceneLayout.createSideCamera(contractBounds)],
    ["SceneLayout.createFrontCamera", () => PublicApi.SceneLayout.createFrontCamera(contractBounds)],
    ["SceneLayout.createObjectOutline", () => PublicApi.SceneLayout.createObjectOutline(contractBounds)],
    ["SceneLayout.createTransformHandles", () => PublicApi.SceneLayout.createTransformHandles(contractBounds)],
    ["SceneLayout.createSceneEditorLayout", () => PublicApi.SceneLayout.createSceneEditorLayout(contractBounds, currentCamera)],
    ["SceneSetupMethods.createDefaultScene", () => PublicApi.SceneSetupMethods.createDefaultScene()],
    ["Scenegraph.createModel", () => PublicApi.Scenegraph.createModel({
      name: "contract-model",
      geometry: new PublicApi.Scenegraph.Box(1, 2, 3),
      color: 0xff00ff,
      position: { x: 1, y: 2, z: 3 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    })],
    ["StoryApi.createDefaultStoryTransform", () => PublicApi.StoryApi.createDefaultStoryTransform()],
    ["StoryApi.createEntityForType", () => PublicApi.StoryApi.createEntityForType("org.lgna.story.SBox")],
    ["StoryApi.createJointId", () => PublicApi.StoryApi.createJointId("leftArm", "torso")],
    ["StoryApi.createPropertyChangeTimeline", () => PublicApi.StoryApi.createPropertyChangeTimeline([
      { property: {} as PublicApi.StoryApi.Property<number>, previousValue: 0, value: 1 },
      { property: {} as PublicApi.StoryApi.Property<number>, previousValue: 1, value: 2 },
    ])],
    ["StoryApi.createStorySceneSnapshot", () => PublicApi.StoryApi.createStorySceneSnapshot(contractProject)],
    ["StoryApi.createSceneFromProject", () => PublicApi.StoryApi.createSceneFromProject(contractProject)],
    ["StoryApi.createPosition", () => PublicApi.StoryApi.createPosition()],
    ["StoryApi.createOrientation", () => PublicApi.StoryApi.createOrientation()],
    ["StoryApi.createSize", () => PublicApi.StoryApi.createSize()],
    ["StoryApi.createBoundingBox", () => PublicApi.StoryApi.createBoundingBox()],
    ["StoryApi.createSpeechBubbleState", () => PublicApi.StoryApi.createSpeechBubbleState("say", "Hello")],
    ["StoryApi.createTextBubbleEntity", () => PublicApi.StoryApi.createTextBubbleEntity("bubble-1", "think", "Hmm")],
    ["StoryApi.createDefaultTransform", () => PublicApi.StoryApi.createDefaultTransform()],
    ["StoryApiProperties.createColorPaint", () => PublicApi.StoryApiProperties.createColorPaint("#336699")],
    ["StoryApiProperties.createTexturePaint", () => PublicApi.StoryApiProperties.createTexturePaint("brick", 0.5, "#ffffff")],
    ["StoryApiProperties.createTextValue", () => PublicApi.StoryApiProperties.createTextValue("Hello", "Arial", 18, "#112233")],
    ["StoryResources.createResourceAssetPaths", () => PublicApi.StoryResources.createResourceAssetPaths("Bunny")],
    ["VmSceneBridge.createSceneGraphForProject", () => PublicApi.VmSceneBridge.createSceneGraphForProject(contractProject)],
    ["VmSceneBridge.createVmSceneRuntime", () => PublicApi.VmSceneBridge.createVmSceneRuntime(contractProject)],
    ["TweedleRuntime.createClassRegistry", () => PublicApi.TweedleRuntime.createClassRegistry()],
    ["TweedleRuntime.createMethodTable", () => PublicApi.TweedleRuntime.createMethodTable(contractProject.methods)],
    ["TweedleRuntime.createTweedleRuntimeEnvironment", () => PublicApi.TweedleRuntime.createTweedleRuntimeEnvironment(contractProject)],
    ["TweedleTypeSystem.createTypeHierarchy", () => PublicApi.TweedleTypeSystem.createTypeHierarchy([])],
    ["TweedleTypechecker.createTypeEnvironment", () => PublicApi.TweedleTypechecker.createTypeEnvironment([])],
    ["TypeBrowser.createUniqueName", () => PublicApi.TypeBrowser.createUniqueName("Actor", ["Actor", "Actor2"])],
    ["TypeBrowser.createDefaultClassDeclaration", () => PublicApi.TypeBrowser.createDefaultClassDeclaration("Actor")],
    ["TypeSystem.createTweedleTypeAuthority", () => PublicApi.TypeSystem.createTweedleTypeAuthority([])],
    ["Server.createServer", () => PublicApi.Server.createServer({ port: 0, evidenceDir: SERVER_EVIDENCE_DIR })],
    ["WebXRCapabilities.createWebXREvidence", () => PublicApi.WebXRCapabilities.createWebXREvidence("webxr-unavailable", "unsupported", "WebXR unavailable")],
    ["WebXRInput.createWebXRInputTracker", () => PublicApi.WebXRInput.createWebXRInputTracker()],
    ["WebXRLocomotion.createWebXRLocomotion", () => PublicApi.WebXRLocomotion.createWebXRLocomotion()],
    ["WebXRSession.createWebXRSessionController", () => PublicApi.WebXRSession.createWebXRSessionController({
      renderer: { xr: { enabled: false, setSession: () => undefined } },
      scene: { add: () => undefined, remove: () => undefined },
      camera: {},
      userRig: { add: () => undefined, remove: () => undefined },
      orbitControls: { enabled: true },
      navigator: {
        xr: {
          isSessionSupported: async () => true,
          requestSession: async () => ({
            inputSources: [],
            requestReferenceSpace: async () => ({}),
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            end: async () => undefined,
          }),
        },
      },
    })],
    ["ComponentAbstraction.createButton", () => PublicApi.ComponentAbstraction.createButton("b1", "OK")],
    ["ComponentAbstraction.createLabel", () => PublicApi.ComponentAbstraction.createLabel("l1", "Hello")],
    ["ComponentAbstraction.createTextField", () => PublicApi.ComponentAbstraction.createTextField("tf1")],
    ["ComponentAbstraction.createCheckbox", () => PublicApi.ComponentAbstraction.createCheckbox("cb1", "Check", false)],
    ["ComponentAbstraction.createComboBox", () => PublicApi.ComponentAbstraction.createComboBox("cmb1", { items: ["A", "B"] })],
    ["ComponentAbstraction.createSlider", () => PublicApi.ComponentAbstraction.createSlider("sl1")],
    ["ComponentAbstraction.createPanel", () => PublicApi.ComponentAbstraction.createPanel("p1")],
    ["ComponentAbstraction.createToolbar", () => PublicApi.ComponentAbstraction.createToolbar("tb1", [])],
    ["ComponentAbstraction.createSeparator", () => PublicApi.ComponentAbstraction.createSeparator("sep1")],
    ["ComponentAbstraction.createProgressBar", () => PublicApi.ComponentAbstraction.createProgressBar("pb1")],
  ]);
}

function assertFactoryResult(key: string, value: unknown): void {
  switch (key) {
    case "Accessibility.createHighContrastStyle":
      expectKeys(value, ["background", "color", "borderColor", "focusRing"]);
      return;
    case "AliceEvidenceArtifact.createAliceEvidenceArtifact":
      expectKeys(value, ["format", "version", "application", "world", "run", "visibleBehavior", "export"]);
      expect((value as { application: { name: string; runtime: string } }).application).toEqual({
        name: "Alice",
        runtime: "alice-web",
      });
      return;
    case "Analytics.createAnalyticsSnapshot":
      expectKeys(value, ["sessionId", "startedAt", "engagement"]);
      expect((value as { engagement: { activeDurationMs: number } }).engagement.activeDurationMs).toBeTypeOf("number");
      return;
    case "AliceWorkflowState.createDefaultAliceWorkflowState":
      expect(value).toEqual({
        schemaVersion: "alice-web.workflow-state/v1",
        scorekeepers: [],
        timekeepers: [],
        visibleBindings: [],
      });
      return;
    case "AliceWorkflowState.createInitialScoreValues":
      expect(value).toBeInstanceOf(Map);
      return;
    case "CameraWorkflow.createDefaultCameraWorkflowState":
      expectKeys(value, ["camera", "markers", "activeMarkerId"]);
      expect((value as { camera: { mode: string; activePreset: string } }).camera).toMatchObject({
        mode: "orbit",
        activePreset: "home",
      });
      return;
    case "CodeGeneration.createTweedleSource":
      expect(typeof value).toBe("string");
      expect(value).toContain("class Demo");
      return;
    case "Curriculum.createCurriculumMetadata":
      expectKeys(value, ["concepts", "lessons"]);
      return;
    case "Curriculum.createCurriculumProgress":
      expect(value).toEqual({ demonstratedConcepts: [] });
      return;
    case "EntityAnimation.createBrowserSpeechSynthesisAdapter":
      expectKeys(value, ["available", "speak", "cancel"]);
      expect((value as { available: boolean }).available).toBe(true);
      return;
    case "ErrorHandling.createStructuredErrorReport":
      expectKeys(value, ["message", "name", "rawStack", "stackFrames"]);
      return;
    case "ExportHtml.createHtmlExportDocument":
      expectKeys(value, ["title", "previewMode", "tweedleSource", "html"]);
      expect((value as { html: string }).html).toContain("<!DOCTYPE html>");
      return;
    case "Formatters.createDefaultFormatterRegistry":
      expect(value).toBeInstanceOf(PublicApi.Formatters.FormatterRegistry);
      return;
    case "ImageEditor.createImage":
      expectKeys(value, ["width", "height", "data"]);
      expect((value as { data: Uint8ClampedArray }).data).toBeInstanceOf(Uint8ClampedArray);
      return;
    case "InstanceFactory.createFactoryFromTypeSelection":
      expectKeys(value, ["createExpression", "createTransientExpression"]);
      return;
    case "JointSystem.createJointedModelResource":
    case "JointSystem.createJointedModelResourceFromModel":
      expect(value).toBeInstanceOf(PublicApi.JointSystem.JointedModelResource);
      expect((value as { listJointIds: () => unknown[] }).listJointIds().length).toBeGreaterThan(0);
      return;
    case "Localization.createFormatter":
      expect(value).toBeInstanceOf(PublicApi.Localization.LocalizedFormatter);
      return;
    case "Materials.createMaterialDefinition":
      expectKeys(value, ["diffuseColor", "opacity", "visible"]);
      expect((value as { opacity: number }).opacity).toBe(1);
      return;
    case "Materials.createAppearanceFromMaterial":
      expect(
        value instanceof PublicApi.Scenegraph.SingleAppearance
          || value instanceof PublicApi.Scenegraph.TexturedAppearance,
      ).toBe(true);
      return;
    case "ModelTextureCameraJointExportWorkflow.createWorkflowState":
      expectKeys(value, ["project", "resources", "textureAssignments", "cameraWorkflow"]);
      return;
    case "NetworkLayer.createHttpServiceAdapter":
      expectKeys(value, ["serviceName", "status", "get", "post", "request"]);
      expect((value as { serviceName: string }).serviceName).toBe("contract-api");
      return;
    case "PrintSystem.createPrintableDocument":
      expectKeys(value, ["title", "text", "html", "standalonePage"]);
      return;
    case "ProjectAudio.createEmptyProjectAudioState":
      expect(value).toEqual({
        assets: [],
        backgroundMusic: null,
        cues: [],
        nextAssetNumber: 1,
      });
      return;
    case "ProjectAudio.createDefaultProjectAudioState":
      expect(value).toEqual({
        manifestVersion: "alice-web.audio-manifest/v1",
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
      return;
    case "ProjectAudio.createProjectAudioPlaybackBridge":
      expectKeys(value, [
        "startBackgroundMusic",
        "updateAnimationPlayback",
        "resetAnimationPlayback",
        "stopAll",
        "getTriggeredCueIds",
      ]);
      return;
    case "ProjectAudio.createWebAudioProjectOutputFactory":
      expect(value).toBeTypeOf("function");
      return;
    case "ProjectTemplate.createEmptyWorldProject":
      expectKeys(value, ["projectName", "sceneObjects", "methods", "types"]);
      return;
    case "ProjectTemplate.createProjectFromTemplate":
      expectKeys(value, ["project", "resources", "resourceEntries", "versionInfo"]);
      return;
    case "RenderAnimation.createAnimationTransform":
      expectKeys(value, ["translation", "rotation", "scale"]);
      return;
    case "RenderMesh.createBoxMesh":
      expectKeys(value, ["vertices", "normals", "uvs", "indices", "bounds"]);
      expect((value as { vertices: unknown[] }).vertices).toHaveLength(24);
      expect((value as { indices: unknown[] }).indices).toHaveLength(36);
      return;
    case "RenderMesh.createSphereMesh":
      expectKeys(value, ["vertices", "normals", "uvs", "indices", "bounds"]);
      expect((value as { vertices: unknown[] }).vertices.length).toBeGreaterThan(0);
      expect((value as { normals: unknown[] }).normals.length).toBe((value as { vertices: unknown[] }).vertices.length);
      return;
    case "RenderMesh.createCylinderMesh":
      expectKeys(value, ["vertices", "normals", "uvs", "indices", "bounds"]);
      expect((value as { vertices: unknown[] }).vertices.length).toBeGreaterThan(0);
      expect((value as { indices: unknown[] }).indices.length).toBeGreaterThan(0);
      return;
    case "ResourceManager.createResourceManager":
      expectKeys(value, ["register", "get", "acquire", "stats"]);
      return;
    case "RuntimeParityEvidence.createCameraVrComfortEvidence":
      expect(value).toMatchObject({
        schema_version: "alice.camera-vr-comfort-evidence/v1",
        status: "partial",
        trueHeadsetVrSupported: false,
        nativeVrSupported: false,
      });
      return;
    case "RuntimeParityEvidence.createPlayerComfortSessionEvidence":
      expect(value).toMatchObject({
        schema_version: "alice.player-comfort-session-evidence/v1",
        status: "evidence-recorded",
        mode: "headset",
      });
      expectKeys(value, ["comfort", "revisionLoop", "evidenceBoundary"]);
      return;
    case "RuntimeParityEvidence.createAccessibilityRescueCaptionEvidence":
      expectKeys(value, ["schema_version", "ariaLiveCaption", "cameraCaption", "objectCaption", "captionChecks"]);
      return;
    case "RuntimeParityEvidence.createGalleryWalkRubricEvidence":
      expect(value).toMatchObject({
        schema_version: "alice.gallery-walk-rubric-evidence/v1",
        reviewWorkflowSupported: true,
        rubricRecordingSupported: false,
        liveStudioSupported: true,
      });
      return;
    case "RuntimeParityEvidence.createRuntimeParityEvidence":
      expectKeys(value, ["cameraVrComfort", "accessibilityRescueCaptions", "galleryWalkRubric"]);
      return;
    case "SceneLayout.createViewingPerspective":
    case "SceneLayout.createTopCamera":
    case "SceneLayout.createSideCamera":
    case "SceneLayout.createFrontCamera":
      expectKeys(value, ["option", "position", "target", "forward", "up"]);
      return;
    case "SceneLayout.createObjectOutline":
      expectKeys(value, ["bounds", "corners", "edges"]);
      return;
    case "SceneLayout.createTransformHandles":
      expect(Array.isArray(value)).toBe(true);
      expect((value as unknown[]).length).toBeGreaterThan(0);
      return;
    case "SceneLayout.createSceneEditorLayout":
      expectKeys(value, ["cameras", "handles", "outline"]);
      return;
    case "SceneSetupMethods.createDefaultScene":
      expectKeys(value, ["scene", "ground", "camera", "sun", "propertyManager"]);
      return;
    case "Scenegraph.createModel":
      expect(value).toBeInstanceOf(PublicApi.Scenegraph.Model);
      return;
    case "StoryApi.createDefaultStoryTransform":
      expectKeys(value, ["position", "size"]);
      return;
    case "StoryApi.createStorySceneSnapshot":
      expectKeys(value, ["entityNames", "isActive"]);
      return;
    case "StoryApi.createSceneFromProject":
      expect(value).toBeInstanceOf(PublicApi.StoryApi.Scene);
      return;
    case "StoryApi.createPosition":
      expect(value).toEqual({ x: 0, y: 0, z: 0 });
      return;
    case "StoryApi.createOrientation":
      expect(value).toEqual({ x: 0, y: 0, z: 0, w: 1 });
      return;
    case "StoryApi.createSize":
      expect(value).toEqual({ width: 1, height: 1, depth: 1 });
      return;
    case "StoryApi.createBoundingBox":
      expectKeys(value, ["min", "max"]);
      return;
    case "StoryApi.createSpeechBubbleState":
      expect(value).toEqual({ kind: "say", text: "Hello", duration: 0 });
      return;
    case "StoryApi.createTextBubbleEntity":
      expectKeys(value, ["id", "kind", "text", "anchor", "size"]);
      return;
    case "StoryApi.createDefaultTransform":
      expectKeys(value, ["position", "orientation", "size"]);
      return;
    case "StoryApiProperties.createColorPaint":
      expect(value).toEqual({ kind: "color", color: "#336699" });
      return;
    case "StoryApiProperties.createTexturePaint":
      expect(value).toEqual({ kind: "texture", texture: "brick", mix: 0.5, tint: "#ffffff" });
      return;
    case "StoryApiProperties.createTextValue":
      expect(value).toEqual({ text: "Hello", fontFamily: "Arial", fontSize: 18, color: "#112233" });
      return;
    case "StoryApi.createEntityForType":
      expect(value).toBeInstanceOf(PublicApi.StoryApi.SThing);
      return;
    case "StoryApi.createJointId":
      expect(value).toEqual({ name: "leftArm", parent: "torso" });
      return;
    case "StoryApi.createPropertyChangeTimeline":
      expect(value).toEqual([
        { index: 0, previousValue: 0, value: 1 },
        { index: 1, previousValue: 1, value: 2 },
      ]);
      return;
    case "StoryResources.createResourceAssetPaths":
      expectKeys(value, ["visual", "texture", "thumbnail"]);
      return;
    case "VmSceneBridge.createSceneGraphForProject":
      expectKeys(value, ["sceneGraph", "entityNodes"]);
      return;
    case "VmSceneBridge.createVmSceneRuntime":
      expect(value).toBeInstanceOf(PublicApi.VmSceneBridge.VmSceneRuntime);
      expectKeys(value, ["sceneGraph", "bridge", "animationLoop", "entityNodes"]);
      return;
    case "TweedleRuntime.createClassRegistry":
    case "TweedleRuntime.createMethodTable":
      expect(value).toBeInstanceOf(Map);
      return;
    case "TweedleRuntime.createTweedleRuntimeEnvironment":
      expectKeys(value, ["globalScope", "classRegistry", "methodTable", "objectTable"]);
      expect((value as { classRegistry: Map<string, unknown> }).classRegistry).toBeInstanceOf(Map);
      return;
    case "TweedleTypeSystem.createTypeHierarchy":
      expectKeys(value, ["resolve", "allTypes", "isAssignableTo", "supertypesOf", "resolveMethod"]);
      return;
    case "TweedleTypechecker.createTypeEnvironment":
      expectKeys(value, ["resolveType", "isAssignableTo", "checkMethodCall"]);
      return;
    case "TypeBrowser.createUniqueName":
      expect(value).toBe("Actor3");
      return;
    case "TypeBrowser.createDefaultClassDeclaration":
      expect(value).toBeInstanceOf(PublicApi.AstNodes.ClassDeclaration);
      return;
    case "TypeSystem.createTweedleTypeAuthority":
      expectKeys(value, ["resolveType", "isAssignable", "hasMethodNamed", "resolveMethodDispatch"]);
      return;
    case "Server.createServer":
      expectKeys(value, ["get", "post", "listen"]);
      return;
    case "WebXRCapabilities.createWebXREvidence":
      expect(value).toEqual({
        code: "webxr-unavailable",
        severity: "unsupported",
        message: "WebXR unavailable",
      });
      return;
    case "WebXRInput.createWebXRInputTracker":
      expectKeys(value, ["handleSelectStart", "handleSelectEnd", "handleSqueezeStart", "handleSqueezeEnd", "snapshot", "clear"]);
      return;
    case "WebXRLocomotion.createWebXRLocomotion":
      expectKeys(value, ["mode", "config", "update"]);
      return;
    case "WebXRSession.createWebXRSessionController":
      expectKeys(value, ["state", "input", "session", "referenceSpace", "start", "end", "updateInput", "onStateChange"]);
      return;
    case "ComponentAbstraction.createButton":
    case "ComponentAbstraction.createLabel":
    case "ComponentAbstraction.createTextField":
    case "ComponentAbstraction.createCheckbox":
    case "ComponentAbstraction.createComboBox":
    case "ComponentAbstraction.createSlider":
    case "ComponentAbstraction.createPanel":
    case "ComponentAbstraction.createToolbar":
    case "ComponentAbstraction.createSeparator":
    case "ComponentAbstraction.createProgressBar":
      expectKeys(value, ["id", "type"]);
      return;
    default:
      throw new Error(`Unhandled factory contract case: ${key}`);
  }
}

beforeAll(() => {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    DOMParser: dom.window.DOMParser,
    HTMLElement: dom.window.HTMLElement,
    HTMLCanvasElement: dom.window.HTMLCanvasElement,
    HTMLImageElement: dom.window.HTMLImageElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLUListElement: dom.window.HTMLUListElement,
    Image: dom.window.Image,
  });
  if (!("requestAnimationFrame" in globalThis)) {
    Object.assign(globalThis, {
      requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0),
      cancelAnimationFrame: (handle: number) => clearTimeout(handle),
    });
  }
  mkdirSync(TEST_ARTIFACT_ROOT, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_ARTIFACT_ROOT, { recursive: true, force: true });
});

describe("public API contract", () => {
  it("imports src/index without runtime errors and exposes stable namespaces", async () => {
    const loaded = await import("../src/index.js");
    expect(loaded).toHaveProperty("ProjectTemplate");
    expect(loaded).toHaveProperty("StoryApi");
    expect(Object.keys(loaded).length).toBeGreaterThanOrEqual(80);
  });

  it("keeps exported runtime types constructable and helpers callable", () => {
    let constructableCount = 0;
    let callableCount = 0;

    for (const namespace of Object.values(PublicApi) as NamespaceModule[]) {
      for (const [name, value] of Object.entries(namespace)) {
        if (typeof value !== "function") {
          continue;
        }
        if (/^[A-Z]/.test(name)) {
          constructableCount += 1;
          expect(isConstructable(value)).toBe(true);
        } else {
          callableCount += 1;
          expect(typeof value).toBe("function");
        }
      }
    }

    expect(constructableCount).toBeGreaterThan(150);
    expect(callableCount).toBeGreaterThan(250);
  });

  it("keeps public factory functions returning their expected result types", async () => {
    const factoryCases = buildFactoryCases();
    const discoveredFactories = new Map<string, FactoryCase>();

    for (const [namespaceName, namespace] of Object.entries(PublicApi) as Array<[string, NamespaceModule]>) {
      for (const [name, value] of Object.entries(namespace)) {
        if (name.startsWith("create") && typeof value === "function") {
          discoveredFactories.set(`${namespaceName}.${name}`, value as FactoryCase);
        }
      }
    }

    expect(discoveredFactories.size).toBeGreaterThanOrEqual(35);

    for (const key of discoveredFactories.keys()) {
      expect(factoryCases.has(key)).toBe(true);
      const value = await factoryCases.get(key)!();
      assertFactoryResult(key, value);
    }
  });
});
