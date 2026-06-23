# Alice

Alice is a TypeScript web port of Alice 3. It keeps the same teaching goals as
the desktop app, runs in a browser, and exposes a small REST API so the `eatme`
test suite can drive real curriculum workflows.

The repository/project nickname is **LookingGlass**. Use that nickname only for
the GitHub repository, project wrapper, or migration context. The product,
runtime, package, API, generated metadata, and user-facing app are Alice /
`alice-web`.

## Current status

- Core TypeScript project code and support tooling live in this repository
- Browser UI, REST API, and curriculum testing are maintained together

## Start here

- [Getting started](./getting-started.md)
- [Verify a local Alice server](./tutorial-alice-server-workflow.md)
- [Audio workflow tutorial](./tutorial-audio-workflow.md)
- [Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md)
- [Architecture](./architecture.md)
- [API reference](./api-reference.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Alice HowTo parity audit](./alice-howto-parity-audit.md)
- [Alice evidence export workflow](./alice-evidence-workflow.md)
- [Alice do-together workflow](./do-together-workflow.md)
- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Camera workflow usage](./camera-workflow-usage.md)
- [Selected object transform controls](./selected-object-transform-controls.md)
- [Score and time workflow usage](./score-time-workflow-usage.md)
- [Imported model and texture assets](./imported-models-and-textures.md)
- [Model, texture, camera, joint, and export workflow](./model-texture-camera-joint-export-workflow.md)
- [Server API](./server-api.md)
- [Export, play, share, and validate a web package](./project-io-usage.md#export-play-share-and-validate-a-web-package)
- [Testing](./testing.md)

## Subsystem overview

| Subsystem | What it does | Start here |
| --- | --- | --- |
| Tweedle | Parses, checks, and runs Alice code | [Tweedle parser](./tweedle-parser.md), [Tweedle type system](./tweedle-type-system.md), [Tweedle typechecker](./tweedle-typechecker.md), [VM scoping and functions](./vm-scoping-and-functions.md) |
| AST and serialization | Stores program structure and converts it to and from files | [Serialization](./serialization.md), [A3P statement round-trip coverage](./a3p-statement-round-trip.md), [Tweedle code generation](./tweedle-codegen.md) |
| Story API and scene model | Represents scenes, entities, joints, events, and runtime behavior | [Story API](./story-api.md), [Joint manipulation](./joint-manipulation.md), [Story API public barrel topology](./story-api-public-barrels.md), [SScene listener methods](./sscene-listener-methods.md), [Event system](./event-system.md), [Collision detection](./collision-detection.md) |
| Rendering | Builds and draws 3D scenes in the browser | [Scene graph](./scene-graph.md), [Scene rendering](./scene-rendering.md), [Scene manager](./scene-manager.md), [WebXR and camera comfort evidence](./webxr-vr.md), [camera workflow usage](./camera-workflow-usage.md), [camera workflow API](./camera-workflow-api.md) |
| IDE workflows | Supports editing, running, and curriculum tasks | [IDE operations](./ide-operations.md), [Grading pipeline](./grading-pipeline.md), [Alice do-together workflow](./do-together-workflow.md), [Score and time workflow usage](./score-time-workflow-usage.md), [Score and time workflow API](./score-time-workflow-api.md) |
| Assets and resources | Loads models, images, audio, textures, project files, and runnable web packages | [Model, texture, camera, joint, and export workflow](./model-texture-camera-joint-export-workflow.md), [Import a model and apply a custom texture](./tutorial-import-model-and-apply-texture.md), [Imported model and texture assets](./imported-models-and-textures.md), [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md), [Model resources](./model-resources.md), [Open-asset pipeline](./open-asset-pipeline.md), [Resource manager](./resource-manager.md), [Project IO](./project-io.md), [Project IO usage guide](./project-io-usage.md), [Image editor](./image-editor.md), [Audio](./audio.md), [Audio workflow usage](./audio-workflow-usage.md), [Audio workflow configuration](./audio-workflow-configuration.md) |
| Evidence | Captures visible Alice behavior, camera/WebXR comfort, accessibility/caption, and static gallery/rubric review prompts into exportable browser evidence | [Alice evidence workflow usage](./alice-evidence-workflow-usage.md), [Alice evidence artifact API](./alice-evidence-artifact-api.md), [Alice evidence workflow configuration](./alice-evidence-workflow-configuration.md), [Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md) |
| eatme integration | Exposes HTTP endpoints and scenario-friendly workflows | [API reference](./api-reference.md), [Server API](./server-api.md), [Audio workflow](./audio.md), [camera workflow API](./camera-workflow-api.md), [Gadugi test scenarios](./gadugi-test-scenarios.md), [Alice HowTo parity audit](./alice-howto-parity-audit.md) |
| External service integration | Wraps outbound HTTP and WebSocket calls behind retryable adapters | [External service integration](./external-service-integration.md) |

## Documentation map

### Tutorials

- [Getting started](./getting-started.md)
- [Verify a local Alice server](./tutorial-alice-server-workflow.md)
- [Building your first Alice application](./tutorial-building-your-first-alice-app.md)
- [Import a model and apply a custom texture](./tutorial-import-model-and-apply-texture.md)
- [Adding open-source 3D models](./tutorial-adding-3d-models.md)
- [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md)
- [Audio workflow tutorial](./tutorial-audio-workflow.md)
- [Capture and export Alice evidence](./tutorial-alice-evidence-workflow.md)
- [Round-trip an `.a3p` project with Project IO](./tutorial-project-io-round-trip.md)
- [Tutorial: manipulate and verify joints](./tutorial-joint-manipulation.md)
- [Camera workflow parity](./tutorial-camera-workflow.md)
- [Round-trip selected object transforms](./tutorial-selected-object-transform-round-trip.md)
- [Tutorial: add score and time to an Alice world](./tutorial-score-time-workflow.md)
- [Alice audio workflow](./tutorial-audio-workflow.md)
- [Reuse class behavior between Alice projects](./tutorial-reuse-class-behavior-between-projects.md)

### How-to guides and workflows

- [Testing](./testing.md)
- [IDE operations](./ide-operations.md)
- [Gadugi test scenarios](./gadugi-test-scenarios.md)
- [Alice HowTo parity audit](./alice-howto-parity-audit.md)
- [Project IO usage guide](./project-io-usage.md)
- [Reusable class behavior workflow](./class-behavior-workflow.md)
- [Audio workflow usage](./audio-workflow-usage.md)
- [Alice evidence workflow usage](./alice-evidence-workflow-usage.md)
- [Camera workflow usage](./camera-workflow-usage.md)
- [Selected object transform controls](./selected-object-transform-controls.md)
- [Alice do-together workflow](./do-together-workflow.md)
- [Alice evidence export workflow](./alice-evidence-workflow.md)
- [Score and time workflow usage](./score-time-workflow-usage.md)
- [Export, play, share, and validate a web package](./project-io-usage.md#export-play-share-and-validate-a-web-package)

### Reference

- [API reference](./api-reference.md)
- [Alice HowTo parity audit reference](./alice-howto-parity-audit-reference.md)
- [Alice evidence artifact API](./alice-evidence-artifact-api.md)
- [Alice evidence workflow configuration](./alice-evidence-workflow-configuration.md)
- [Root TypeScript API barrel](./architecture.md#barrel-re-exports) -
  `src/index.ts` is the public root export surface. It includes namespace
  exports such as `StoryApi`, `TweedleParser`, `SceneRenderer`,
  `PluginSystem`, `PrintSystem`, and `VersionManagement`.
- [A3P statement round-trip coverage](./a3p-statement-round-trip.md)
- [Animation system](./animation.md)
- [Audio workflow](./audio.md)
- [Audio workflow configuration](./audio-workflow-configuration.md)
- [Camera workflow API](./camera-workflow-api.md)
- [Camera workflow configuration](./camera-workflow-configuration.md)
- [Selected object transform API](./selected-object-transform-api.md)
- [Score and time workflow API](./score-time-workflow-api.md)
- [Score and time workflow configuration](./score-time-workflow-configuration.md)
- [Collision detection](./collision-detection.md)
- [Event system](./event-system.md)
- [External service integration](./external-service-integration.md)
- [Grading pipeline](./grading-pipeline.md)
- [Image editor](./image-editor.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Alice evidence API](./alice-evidence-api.md)
- [Do-together runtime evidence](./do-together-runtime-evidence.md)
- [Joint manipulation](./joint-manipulation.md)
- [Imported model and texture assets](./imported-models-and-textures.md)
- [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md)
- [Model resources](./model-resources.md)
- [Open-asset pipeline](./open-asset-pipeline.md)
- [Project IO](./project-io.md)
- [Project IO API reference](./project-io-api.md)
- [Project IO configuration](./project-io-configuration.md)
- [Class behavior package API](./class-behavior-package-api.md)
- [Class behavior package configuration](./class-behavior-package-configuration.md)
- [Model, texture, camera, joint, and export workflow](./model-texture-camera-joint-export-workflow.md)
- [Web package API routes](./api-reference.md#post-apiprojectexportweb-package)
- [TypeScript source export](./typescript-source-export.md) - source handoff reference
- [Resource manager](./resource-manager.md)
- [Scene graph](./scene-graph.md)
- [Scene manager](./scene-manager.md)
- [Scene rendering](./scene-rendering.md)
- [WebXR and camera comfort evidence](./webxr-vr.md)
- [Serialization](./serialization.md)
- [Server API](./server-api.md)
- [Statement execution](./statement-execution.md)
- [SScene listener methods](./sscene-listener-methods.md)
- [Story API](./story-api.md)
- [Story API public barrel topology](./story-api-public-barrels.md)
- [Tweedle code generation](./tweedle-codegen.md)
- [Tweedle parser](./tweedle-parser.md)
- [Tweedle standard library](./tweedle-stdlib.md)
- [Tweedle type system](./tweedle-type-system.md)
- [Tweedle typechecker](./tweedle-typechecker.md)
- [VM Scene Bridge](./vm-scene-bridge.md)
- [VM scoping and functions](./vm-scoping-and-functions.md)

### Explanation

- [Architecture](./architecture.md)
- [Open-source 3D alternatives](./open-source-3d-alternatives.md)
- [TypeScript parity](./typescript-parity.md)
- [Parity gaps #71–#75](./parity-gaps-71-75.md)
- [Parity gaps #76–#77](./parity-gaps-76-77.md)
- [Parity gaps #80–#82](./parity-gaps-80-82.md)
