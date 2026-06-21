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
- [Architecture](./architecture.md)
- [API reference](./api-reference.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Camera workflow usage](./camera-workflow-usage.md)
- [Server API](./server-api.md)
- [Export, play, share, and validate a web package](./project-io-usage.md#export-play-share-and-validate-a-web-package)
- [Testing](./testing.md)

## Subsystem overview

| Subsystem | What it does | Start here |
| --- | --- | --- |
| Tweedle | Parses, checks, and runs Alice code | [Tweedle parser](./tweedle-parser.md), [Tweedle type system](./tweedle-type-system.md), [Tweedle typechecker](./tweedle-typechecker.md), [VM scoping and functions](./vm-scoping-and-functions.md) |
| AST and serialization | Stores program structure and converts it to and from files | [Serialization](./serialization.md), [A3P statement round-trip coverage](./a3p-statement-round-trip.md), [Tweedle code generation](./tweedle-codegen.md) |
| Story API and scene model | Represents scenes, entities, joints, events, and runtime behavior | [Story API](./story-api.md), [Joint manipulation](./joint-manipulation.md), [Story API public barrel topology](./story-api-public-barrels.md), [SScene listener methods](./sscene-listener-methods.md), [Event system](./event-system.md), [Collision detection](./collision-detection.md) |
| Rendering | Builds and draws 3D scenes in the browser | [Scene graph](./scene-graph.md), [Scene rendering](./scene-rendering.md), [Scene manager](./scene-manager.md), [WebXR and VR interactions](./webxr-vr.md), [camera workflow usage](./camera-workflow-usage.md), [camera workflow API](./camera-workflow-api.md) |
| IDE workflows | Supports editing, running, and curriculum tasks | [IDE operations](./ide-operations.md), [Grading pipeline](./grading-pipeline.md) |
| Assets and resources | Loads models, images, audio, project files, and runnable web packages | [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md), [Model resources](./model-resources.md), [Open-asset pipeline](./open-asset-pipeline.md), [Resource manager](./resource-manager.md), [Project IO](./project-io.md), [Project IO usage guide](./project-io-usage.md), [Image editor](./image-editor.md), [Audio](./audio.md) |
| eatme integration | Exposes HTTP endpoints and scenario-friendly workflows | [API reference](./api-reference.md), [Server API](./server-api.md), [camera workflow API](./camera-workflow-api.md), [Gadugi test scenarios](./gadugi-test-scenarios.md) |
| External service integration | Wraps outbound HTTP and WebSocket calls behind retryable adapters | [External service integration](./external-service-integration.md) |

## Documentation map

### Tutorials

- [Getting started](./getting-started.md)
- [Verify a local Alice server](./tutorial-alice-server-workflow.md)
- [Building your first Alice application](./tutorial-building-your-first-alice-app.md)
- [Adding open-source 3D models](./tutorial-adding-3d-models.md)
- [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md)
- [Round-trip an `.a3p` project with Project IO](./tutorial-project-io-round-trip.md)
- [Tutorial: manipulate and verify joints](./tutorial-joint-manipulation.md)
- [Camera workflow parity](./tutorial-camera-workflow.md)

### How-to guides and workflows

- [Testing](./testing.md)
- [IDE operations](./ide-operations.md)
- [Gadugi test scenarios](./gadugi-test-scenarios.md)
- [Project IO usage guide](./project-io-usage.md)
- [Camera workflow usage](./camera-workflow-usage.md)
- [Export, play, share, and validate a web package](./project-io-usage.md#export-play-share-and-validate-a-web-package)

### Reference

- [API reference](./api-reference.md)
- [Root TypeScript API barrel](./architecture.md#barrel-re-exports) -
  `src/index.ts` is the public root export surface. It includes namespace
  exports such as `StoryApi`, `TweedleParser`, `SceneRenderer`,
  `PluginSystem`, `PrintSystem`, and `VersionManagement`.
- [A3P statement round-trip coverage](./a3p-statement-round-trip.md)
- [Animation system](./animation.md)
- [Audio](./audio.md)
- [Camera workflow API](./camera-workflow-api.md)
- [Camera workflow configuration](./camera-workflow-configuration.md)
- [Collision detection](./collision-detection.md)
- [Event system](./event-system.md)
- [External service integration](./external-service-integration.md)
- [Grading pipeline](./grading-pipeline.md)
- [Image editor](./image-editor.md)
- [Alice identity boundary](./alice-identity-boundary.md)
- [Joint manipulation](./joint-manipulation.md)
- [Creating, using, and testing 3D character assets](./creating-using-testing-3d-character-assets.md)
- [Model resources](./model-resources.md)
- [Open-asset pipeline](./open-asset-pipeline.md)
- [Project IO](./project-io.md)
- [Project IO API reference](./project-io-api.md)
- [Project IO configuration](./project-io-configuration.md)
- [Web package API routes](./api-reference.md#post-apiprojectexportweb-package)
- [TypeScript source export](./typescript-source-export.md) - source handoff reference
- [Resource manager](./resource-manager.md)
- [Scene graph](./scene-graph.md)
- [Scene manager](./scene-manager.md)
- [Scene rendering](./scene-rendering.md)
- [WebXR and VR interactions](./webxr-vr.md)
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
