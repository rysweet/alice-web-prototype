export interface AliceHowToInventoryEntry {
  readonly id: string;
  readonly title: string;
  readonly sourceLabel: "Alice.org HowTo";
  readonly coverageArea: string;
  readonly category: string;
  readonly url: string;
}

export interface AliceHowToCoverageRecord {
  readonly path: string;
  readonly evidenceToken: string;
}

export interface AliceHowToExecutableScenario {
  readonly scenarioId: string;
  readonly command: string;
  readonly userSteps: readonly string[];
  readonly expectedOutput: string;
  readonly evidence: readonly AliceHowToCoverageRecord[];
}

export interface AliceHowToWordingRules {
  readonly allowedBaseline: string;
  readonly forbiddenTerms: readonly string[];
  readonly forbiddenJargon: readonly string[];
}

type InventorySeed = readonly [id: string, title: string, category: string, slug: string];

const INVENTORY_SEEDS: readonly InventorySeed[] = [
  ["scene-editor-scene-editor-overview", "Scene Editor Overview", "Scene Editor", "scene-editor-overview"],
  ["scene-editor-adding-objects", "Adding Objects", "Scene Editor", "adding-objects"],
  ["scene-editor-positioning-objects", "Positioning Objects", "Scene Editor", "positioning-objects"],
  ["scene-editor-rotating-objects", "Rotating Objects", "Scene Editor", "rotating-objects"],
  ["scene-editor-resizing-objects", "Resizing Objects", "Scene Editor", "resizing-objects"],
  ["scene-editor-manipulating-object-joints", "Manipulating Object Joints", "Scene Editor", "manipulating-object-joints"],
  ["scene-editor-using-one-shots", "Using One Shots", "Scene Editor", "using-one-shots"],
  ["scene-editor-moving-the-camera", "Moving The Camera", "Scene Editor", "moving-the-camera"],
  ["scene-editor-using-camera-views", "Using Camera Views", "Scene Editor", "using-camera-views"],
  ["scene-editor-using-camera-markers", "Using Camera Markers", "Scene Editor", "using-camera-markers"],
  ["code-editor-code-editor-overview", "Code Editor Overview", "Code Editor", "code-editor-overview"],
  ["code-editor-using-procedures-overview", "Using Procedures Overview", "Code Editor", "using-procedures-overview"],
  ["code-editor-manipulating-object-joints", "Manipulating Object Joints", "Code Editor", "manipulating-object-joints"],
  ["code-editor-creating-custom-procedures", "Creating Custom Procedures", "Code Editor", "creating-custom-procedures"],
  ["code-editor-adding-and-using-parameters", "Adding and Using Parameters", "Code Editor", "adding-and-using-parameters"],
  ["code-editor-using-camera-markers", "Using Camera Markers", "Code Editor", "using-camera-markers"],
  [
    "code-editor-exporting-and-importing-modified-classes",
    "Exporting and Importing Modified Classes",
    "Code Editor",
    "exporting-and-importing-modified-classes",
  ],
  ["code-editor-using-do-together", "Using Do Together", "Code Editor", "using-do-together"],
  ["code-editor-using-functions-overview", "Using Functions Overview", "Code Editor", "using-functions-overview"],
  ["code-editor-using-events-overview", "Using Events Overview", "Code Editor", "using-events-overview"],
  [
    "animation-understanding-using-move-turn-or-roll",
    "Understanding Using Move, Turn, Or Roll",
    "Animation",
    "understanding-using-move-turn-or-roll",
  ],
  ["animation-manipulating-object-joints", "Manipulating Object Joints", "Animation", "manipulating-object-joints"],
  ["animation-using-joint-arrays", "Using Joint Arrays", "Animation", "using-joint-arrays"],
  ["animation-manipulating-biped-joints", "Manipulating Biped Joints", "Animation", "manipulating-biped-joints"],
  ["animation-biped-walk-cycle", "Biped Walk Cycle", "Animation", "biped-walk-cycle"],
  ["interactivity-first-person-camera", "First Person Camera", "Interactivity", "first-person-camera"],
  ["interactivity-setting-up-a-timekeeper", "Setting Up a Timekeeper", "Interactivity", "setting-up-a-timekeeper"],
  ["interactivity-setting-up-a-scorekeeper", "Setting Up a ScoreKeeper", "Interactivity", "setting-up-a-scorekeeper"],
  [
    "interactivity-setting-up-proximity-detection",
    "Setting Up Proximity Detection",
    "Interactivity",
    "setting-up-proximity-detection",
  ],
  [
    "interactivity-setting-up-collision-detection",
    "Setting Up Collision Detection",
    "Interactivity",
    "setting-up-collision-detection",
  ],
  ["audio-the-basics-of-using-audio", "The Basics of Using Audio", "Audio", "the-basics-of-using-audio"],
  ["audio-adding-background-music", "Adding Background Music", "Audio", "adding-background-music"],
  ["audio-matching-sound-to-animation", "Matching Sound to Animation", "Audio", "matching-sound-to-animation"],
  ["audio-creating-custom-audio-in-audacity", "Creating Custom Audio in Audacity", "Audio", "creating-custom-audio-in-audacity"],
  ["audio-changing-file-formats-in-audacity", "Changing File Formats in Audacity", "Audio", "changing-file-formats-in-audacity"],
  [
    "vr-programming-overview-of-vr-input-mapping",
    "Overview of VR Input Mapping",
    "VR Programming",
    "overview-of-vr-input-mapping",
  ],
  [
    "vr-programming-creating-a-vr-project-with-a-vruser",
    "Creating a VR Project with a vrUser",
    "VR Programming",
    "creating-a-vr-project-with-a-vruser",
  ],
  ["vr-programming-vr-locomotion-on-rails", "VR Locomotion On Rails", "VR Programming", "vr-locomotion-on-rails"],
  [
    "vr-programming-vr-locomotion-direct-control",
    "VR Locomotion Direct Control",
    "VR Programming",
    "vr-locomotion-direct-control",
  ],
  [
    "vr-programming-vr-locomotion-teleportation",
    "VR Locomotion Teleportation",
    "VR Programming",
    "vr-locomotion-teleportation",
  ],
  ["vr-programming-vr-locomotion-puppeteer", "VR Locomotion Puppeteer", "VR Programming", "vr-locomotion-puppeteer"],
  [
    "vr-programming-vr-object-interaction-point-and-click",
    "VR Object Interaction Point and Click",
    "VR Programming",
    "vr-object-interaction-point-and-click",
  ],
  [
    "vr-programming-vr-object-interaction-click-and-move",
    "VR Object Interaction Click and Move",
    "VR Programming",
    "vr-object-interaction-click-and-move",
  ],
  [
    "vr-programming-vr-using-controller-objects-hands",
    "VR Using Controller Objects (Hands)",
    "VR Programming",
    "vr-using-controller-objects-hands",
  ],
  [
    "models-and-textures-importing-models-overview",
    "Importing Models Overview",
    "Models and Textures",
    "importing-models-overview",
  ],
  ["models-and-textures-map-custom-images", "Map Custom Images to Shapes", "Models and Textures", "map-custom-images"],
  ["the-alice-player-using-the-alice-player", "Using The Alice Player", "The Alice Player", "using-the-alice-player"],
  [
    "the-alice-player-exporting-for-the-alice-player",
    "Exporting For The Alice Player",
    "The Alice Player",
    "exporting-for-the-alice-player",
  ],
  [
    "the-alice-player-using-the-alice-player-with-oculus-vr",
    "Using The Alice Player With Oculus VR",
    "The Alice Player",
    "using-the-alice-player-with-oculus-vr",
  ],
  [
    "the-alice-player-using-the-alice-player-with-vive-vr",
    "Using The Alice Player With Vive VR",
    "The Alice Player",
    "using-the-alice-player-with-vive-vr",
  ],
  [
    "the-alice-player-using-the-alice-player-with-oculus-quest-vr",
    "Using The Alice Player With Meta Quest VR",
    "The Alice Player",
    "using-the-alice-player-with-oculus-quest-vr",
  ],
  ["sharing-recording-and-sharing-alice-worlds", "Recording and Sharing Alice Worlds", "Sharing", "recording-and-sharing-alice-worlds"],
  ["sharing-making-an-alice-app", "Making an Alice App", "Sharing", "making-an-alice-app"],
  [
    "great-other-sources-youtube-channels-and-playlists",
    "YouTube Channels and Playlists",
    "Great Other Sources",
    "youtube-channels-and-playlists",
  ],
];

const COVERAGE_PATHS: readonly (readonly [id: string, paths: readonly string[]])[] = [
  ["scene-editor-scene-editor-overview", ["test/scene-editor.test.ts", "gadugi/03-scene-entity-manipulation.yaml"]],
  ["scene-editor-adding-objects", ["test/gallery-scene-integration.test.ts"]],
  ["scene-editor-positioning-objects", ["test/scene-graph-transforms.test.ts"]],
  ["scene-editor-rotating-objects", ["test/transform-utilities.test.ts"]],
  ["scene-editor-resizing-objects", ["test/object-properties.test.ts"]],
  ["scene-editor-manipulating-object-joints", ["test/joint-system.test.ts"]],
  ["scene-editor-using-one-shots", ["test/ide-command-operations.test.ts"]],
  ["scene-editor-moving-the-camera", ["test/camera-system.test.ts"]],
  ["scene-editor-using-camera-views", ["test/camera-workflow.test.ts"]],
  ["scene-editor-using-camera-markers", ["test/camera-routes.test.ts"]],
  ["code-editor-code-editor-overview", ["test/code-editor.test.ts"]],
  ["code-editor-using-procedures-overview", ["test/procedure-editor.test.ts"]],
  ["code-editor-manipulating-object-joints", ["test/joint-server-contract.test.ts"]],
  ["code-editor-creating-custom-procedures", ["test/create-procedure-function.test.ts"]],
  ["code-editor-adding-and-using-parameters", ["test/method-invocation.test.ts"]],
  ["code-editor-using-camera-markers", ["test/camera-workflow.test.ts"]],
  ["code-editor-exporting-and-importing-modified-classes", ["test/class-system.test.ts"]],
  ["code-editor-using-do-together", ["test/do-together-runtime-evidence.test.ts"]],
  ["code-editor-using-functions-overview", ["test/expression-evaluator.test.ts"]],
  ["code-editor-using-events-overview", ["test/events.test.ts", "gadugi/04-event-system.yaml"]],
  ["animation-understanding-using-move-turn-or-roll", ["test/movement-implementation.test.ts"]],
  ["animation-manipulating-object-joints", ["test/joint-state-store-contract.test.ts"]],
  ["animation-using-joint-arrays", ["test/joint-system.test.ts"]],
  ["animation-manipulating-biped-joints", ["test/biped-quadruped.test.ts"]],
  ["animation-biped-walk-cycle", ["test/animation-implementations.test.ts"]],
  ["interactivity-first-person-camera", ["test/input-system.test.ts"]],
  ["interactivity-setting-up-a-timekeeper", ["test/time-system.test.ts"]],
  ["interactivity-setting-up-a-scorekeeper", ["test/state-synchronization.test.ts"]],
  ["interactivity-setting-up-proximity-detection", ["test/interaction-system.test.ts"]],
  ["interactivity-setting-up-collision-detection", ["test/collision-detection.test.ts"]],
  ["audio-the-basics-of-using-audio", ["test/audio.test.ts"]],
  ["audio-adding-background-music", ["test/project-audio-contract.test.ts"]],
  ["audio-matching-sound-to-animation", ["test/say-out-loud-animation.test.ts"]],
  ["audio-creating-custom-audio-in-audacity", ["test/audio-workflow-parity.test.ts"]],
  ["audio-changing-file-formats-in-audacity", ["test/project-audio-project-io-contract.test.ts"]],
  ["vr-programming-overview-of-vr-input-mapping", ["test/webxr-input.test.ts"]],
  ["vr-programming-creating-a-vr-project-with-a-vruser", ["test/webxr-session.test.ts"]],
  ["vr-programming-vr-locomotion-on-rails", ["test/webxr-locomotion.test.ts"]],
  ["vr-programming-vr-locomotion-direct-control", ["test/webxr-locomotion.test.ts"]],
  ["vr-programming-vr-locomotion-teleportation", ["test/webxr-locomotion.test.ts"]],
  ["vr-programming-vr-locomotion-puppeteer", ["test/webxr-interaction.test.ts"]],
  ["vr-programming-vr-object-interaction-point-and-click", ["test/webxr-interaction.test.ts"]],
  ["vr-programming-vr-object-interaction-click-and-move", ["test/webxr-interaction.test.ts"]],
  ["vr-programming-vr-using-controller-objects-hands", ["test/webxr-capabilities.test.ts"]],
  ["models-and-textures-importing-models-overview", ["test/model-management.test.ts"]],
  ["models-and-textures-map-custom-images", ["test/texture-system.test.ts"]],
  ["the-alice-player-using-the-alice-player", ["test/web-runtime.test.ts"]],
  ["the-alice-player-exporting-for-the-alice-player", ["test/export-html.test.ts", "gadugi/06-web-player-export-share-parity.yaml"]],
  ["the-alice-player-using-the-alice-player-with-oculus-vr", ["test/webxr-session.test.ts"]],
  ["the-alice-player-using-the-alice-player-with-vive-vr", ["test/webxr-ui.test.ts"]],
  ["the-alice-player-using-the-alice-player-with-oculus-quest-vr", ["test/webxr-capabilities.test.ts"]],
  ["sharing-recording-and-sharing-alice-worlds", ["test/project-export.test.ts"]],
  ["sharing-making-an-alice-app", ["test/standalone-project.test.ts"]],
  ["great-other-sources-youtube-channels-and-playlists", ["test/tutorials.test.ts"]],
];

export const ALICE_ORG_HOWTO_INVENTORY: readonly AliceHowToInventoryEntry[] = INVENTORY_SEEDS.map(
  ([id, title, category, slug]) => ({
    id,
    title,
    sourceLabel: "Alice.org HowTo",
    coverageArea: `${category} Alice.org HowTo coverage`,
    category,
    url: `https://www.alice.org/resources/how-tos/${slug}/`,
  }),
);

export const ALICE_HOWTO_SCENARIO_MAP: Readonly<Record<string, AliceHowToExecutableScenario>> =
  Object.fromEntries(
    COVERAGE_PATHS.map(([id, paths]) => [
      id,
      buildExecutableScenario(id, paths),
    ]),
  );

export const ALICE_HOWTO_COVERAGE_MAP: Readonly<Record<string, readonly AliceHowToCoverageRecord[]>> =
  Object.fromEntries(Object.entries(ALICE_HOWTO_SCENARIO_MAP).map(([id, scenario]) => [id, scenario.evidence]));

export const ALICE_HOWTO_WORDING_RULES: AliceHowToWordingRules = {
  allowedBaseline: "rysweet/RabbitHole origin/develop",
  forbiddenTerms: [
    "LookingGlass",
    "alice-web-prototype",
    "launch-only",
    "launch only",
    "server parity",
    "browser parity",
    "full Alice parity",
  ],
  forbiddenJargon: ["retcon", "merge-ready", "quality-audit", "agentic", "L3", "harness", "fixture"],
};

function buildExecutableScenario(id: string, paths: readonly string[]): AliceHowToExecutableScenario {
  const entry = INVENTORY_SEEDS.find(([seedId]) => seedId === id);
  if (!entry) {
    throw new Error(`Missing inventory seed for ${id}`);
  }
  const [, title, category] = entry;
  const scenarioId = `alice-howto:${id}`;

  return {
    scenarioId,
    command: `npm test -- test/alice-howto-executable-scenarios.test.ts -t "${scenarioId}$"`,
    userSteps: [
      `Open the Alice.org HowTo "${title}".`,
      `Follow the ${category} workflow in Alice web.`,
      `Run the executable traceability command for ${scenarioId}.`,
    ],
    expectedOutput: `Alice web preserves the "${title}" workflow evidence required by the ${category} HowTo.`,
    evidence: paths.map((filePath) => ({
      path: filePath,
      evidenceToken: filePath.endsWith(".yaml") ? "scenario:" : "describe",
    })),
  };
}
