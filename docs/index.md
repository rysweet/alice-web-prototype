# Alice Web Prototype

This project is a TypeScript web port of Alice 3. It keeps the same teaching
goals as the desktop app, but runs in a browser and exposes a small REST API
so the `eatme` test suite can drive real curriculum workflows.

## Current status

- **336 files** of project code
- **73K lines** of TypeScript and support code
- **84.5% coverage**
- Browser UI, REST API, and curriculum testing in one repository

## Start here

- [Getting started](./getting-started.md)
- [Architecture](./architecture.md)
- [API reference](./api-reference.md)
- [Testing](./testing.md)

## Subsystem overview

| Subsystem | What it does | Start here |
| --- | --- | --- |
| Tweedle | Parses, checks, and runs Alice code | [Tweedle parser](./tweedle-parser.md), [Tweedle type system](./tweedle-type-system.md), [Tweedle typechecker](./tweedle-typechecker.md), [VM scoping and functions](./vm-scoping-and-functions.md) |
| AST and serialization | Stores program structure and converts it to and from files | [Serialization](./serialization.md), [Tweedle code generation](./tweedle-codegen.md) |
| Story API and scene model | Represents scenes, entities, events, and runtime behavior | [Story API](./story-api.md), [Event system](./event-system.md), [Collision detection](./collision-detection.md) |
| Rendering | Builds and draws 3D scenes in the browser | [Scene graph](./scene-graph.md), [Scene rendering](./scene-rendering.md), [Scene manager](./scene-manager.md) |
| IDE workflows | Supports editing, running, and curriculum tasks | [IDE operations](./ide-operations.md), [Grading pipeline](./grading-pipeline.md) |
| Assets and resources | Loads models, images, audio, and project files | [Model resources](./model-resources.md), [Resource manager](./resource-manager.md), [Project IO](./project-io.md), [Image editor](./image-editor.md), [Audio](./audio.md) |
| eatme integration | Exposes HTTP endpoints and scenario-friendly workflows | [API reference](./api-reference.md), [Gadugi test scenarios](./gadugi-test-scenarios.md) |

## Documentation map

### Tutorials

- [Getting started](./getting-started.md)

### How-to guides and workflows

- [Testing](./testing.md)
- [IDE operations](./ide-operations.md)
- [Gadugi test scenarios](./gadugi-test-scenarios.md)

### Reference

- [API reference](./api-reference.md)
- [Animation system](./animation.md)
- [Audio](./audio.md)
- [Collision detection](./collision-detection.md)
- [Event system](./event-system.md)
- [Grading pipeline](./grading-pipeline.md)
- [Image editor](./image-editor.md)
- [Model resources](./model-resources.md)
- [Project IO](./project-io.md)
- [Resource manager](./resource-manager.md)
- [Scene graph](./scene-graph.md)
- [Scene manager](./scene-manager.md)
- [Scene rendering](./scene-rendering.md)
- [Serialization](./serialization.md)
- [Statement execution](./statement-execution.md)
- [Story API](./story-api.md)
- [Tweedle code generation](./tweedle-codegen.md)
- [Tweedle parser](./tweedle-parser.md)
- [Tweedle standard library](./tweedle-stdlib.md)
- [Tweedle type system](./tweedle-type-system.md)
- [Tweedle typechecker](./tweedle-typechecker.md)
- [VM scoping and functions](./vm-scoping-and-functions.md)

### Explanation

- [Architecture](./architecture.md)
- [TypeScript parity](./typescript-parity.md)
- [Parity gaps #71–#75](./parity-gaps-71-75.md)
- [Parity gaps #76–#77](./parity-gaps-76-77.md)
