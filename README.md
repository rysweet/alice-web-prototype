# alice-web-prototype — Alice 3 for the Web

A TypeScript port of [Alice 3](https://www.alice.org), the educational
programming environment, designed to run in a web browser. This project
reimplements the core Alice subsystems — Tweedle language, AST, story API,
scene graph, renderer, and IDE — as a modern web application.

## Quick start

```bash
npm install
npm run build
npm test
```

Start the development server:

```bash
npm run dev
```

Start the REST API server (used by the eatme test suite):

```bash
npm run build:server
npm run serve
```

## What's implemented

The core language, scene, rendering, IDE, and testing subsystems are implemented
and maintained together in this repository.

### Tweedle Language

The Tweedle programming language (Alice's teaching language) is fully
implemented, including the parser, virtual machine, compiler, type system,
standard library, and debugger.

| Module | What it does |
|--------|-------------|
| `tweedle-parser` | Parse Tweedle source into AST (lambdas, enums, generics) |
| `tweedle-vm` | Execute Tweedle programs with real evaluation |
| `tweedle-compiler` | Compile Tweedle source to executable AST |
| `tweedle-type-system` | Type checking and inference |
| `tweedle-typechecker` | Validate types across compilation units |
| `tweedle-stdlib` | Built-in functions (math, string, list, boolean) |
| `tweedle-stdlib-ext` | Extended standard library |
| `tweedle-runtime` | Runtime support |
| `tweedle-codegen` | Code generation from AST |
| `tweedle-debugger` | Step-through debugging with breakpoints and variable inspection |

### AST & Code Manipulation

| Module | What it does |
|--------|-------------|
| `ast-nodes` | 80+ AST node types (statements, expressions, declarations) |
| `ast-serialization` | XML serialization matching Java's format |
| `ast-query` | Query and search AST trees |
| `ast-manipulation` | Insert, remove, move, copy, replace AST nodes |
| `ast-draganddrop` | Drag-and-drop support for code blocks |
| `ast-editor` | Editor state, cursor, selection, undo/redo |
| `code-generation` | Generate Tweedle source from AST |
| `expression-types` | Arithmetic, relational, logical, string expressions |
| `statement-system` | Statement blocks, control flow, validation |

### Story API (Entities & Animation)

| Module | What it does |
|--------|-------------|
| `entity-impls` | Box, Sphere, Cylinder, Cone, Torus, Joint, Marker, Model |
| `entity-behaviors` | Walk, turn, resize, fade, say, pointAt, moveToward |
| `entity-queries` | Distance, direction, collision, visibility, bounding box |
| `entity-lifecycle` | Create, destroy, clone, serialize entities |
| `entity-property-bindings` | Observable typed properties with change events |
| `entity-type-registry` | Registry of all entity types (Biped, Quadruped, Flyer, etc.) |
| `entity-events` | Entity-level event handling |
| `story-api-methods` | Movement, appearance, say/think, joint, property methods |
| `story-api-events` | Scene activation, mouse, key, collision, proximity listeners |
| `story-api-properties` | Paint, position, orientation, size, opacity properties |
| `story-api-animations` | Animation styles, compound animations, say/think bubbles |
| `animation` | Keyframe animation system |
| `animation-system` | Clips, mixers, controllers, crossfade, layers, retargeting |
| `animation-implementations` | Move, turn, roll, resize, setPaint, setOpacity animations |
| `movement-implementation` | Transform math for move/turn/roll/place operations |
| `biped-quadruped` | Biped, Quadruped, Flyer, Swimmer entity types |
| `joint-system` | Joint hierarchy, IK targets, bind poses, joint limits |
| `vehicle-system` | Vehicle parenting with relative transforms |
| `ik-solver` | CCD and FABRIK inverse kinematics |
| `collision-detection` | AABB and sphere intersection |

### Scene Graph & Rendering

| Module | What it does |
|--------|-------------|
| `scenegraph` | AffineMatrix4x4, transforms, geometry types |
| `scene-graph` | Scene graph hierarchy |
| `scene-builder` | Programmatic scene construction |
| `scene-management` | Scene serialization, snapshots, migration |
| `scene-setup-methods` | Scene initialization and event listener setup |
| `scene-transition` | Fade, dissolve, cut between scenes |
| `world-setup` | Ground, sky, lighting, atmosphere |
| `renderer` | Render targets, context, resource cache |
| `renderer-adapters` | Bridge scene graph to Three.js |
| `render-pipeline` | Multi-pass rendering, batching, culling |
| `render-materials` | PBR materials, shader programs, material library |
| `render-shader-system` | Shader compilation, uniforms, variants |
| `render-effects` | Fog, bloom, outline, silhouette |
| `render-text` | Text measurement, layout, speech bubbles |
| `render-mesh` | Mesh building, primitives, normals |
| `render-animation` | Skeletal animation, morph targets, skinning |
| `render-picking` | Ray-mesh, ray-sphere, ray-box intersection |
| `render-scene-manager` | Scene rendering coordination, shadows |
| `texture-system` | 2D textures, cubemaps, render textures, atlases |
| `paint-system` | Colors, gradients, textures, palettes |
| `geometry-operations` | Point3, Vector3, Quaternion, Matrix4, Ray, Plane, AABB |
| `materials` | Material definitions |

### IDE Features

| Module | What it does |
|--------|-------------|
| `code-editor` | Code editing with statement insertion |
| `procedure-editor` | Edit method bodies |
| `declaration-editor` | Edit type declarations |
| `type-browser` | Browse and search types |
| `type-hierarchy` | Type inheritance tree |
| `gallery-browser` | Browse model gallery by category |
| `cascade-menus` | Cascading context menus |
| `code-completion` | Context-aware code suggestions |
| `dialog-system` | Modal/modeless dialogs, file pickers, color picker |
| `debugging` | Debug panel and controls |
| `menubar` | Application menu bar |
| `workspace` | IDE workspace layout |
| `layout-system` | Split panes, tabs, docking |
| `drag-drop-system` | Drag sources, drop targets, visual feedback |
| `search` | Search across code and types |
| `run-system` | Run/stop program execution |
| `program-execution` | Program runner, breakpoints, step controller |
| `alice-ide-state` | Centralized IDE state management |
| `ide-perspectives` | Code/Scene/Run perspective switching |
| `ide-command-operations` | Undoable IDE commands (move, resize, rename, group, align, etc.) |
| `keyboard-event-bridge` | AWT KeyEvent → DOM keyboard event mapping with platform-aware modifiers |
| `drag-drop-bridge` | Typed drag payloads with schema validation for IDE drag-and-drop |
| `accessibility-bridge` | ARIA roles, live regions, screen reader announcements for IDE panels |
| `event-system-bridge` | AWT/Swing → DOM event adapter with InputMap/ActionMap binding translation |
| `layout-bridge` | Java layout manager → CSS translation (migration utility) |
| `component-abstraction` | Swing component → framework-neutral descriptor (migration utility) |
| `keyboard-shortcuts` | Shortcut management with conflict detection |
| `notification-system` | Toast/banner notifications |
| `object-properties` | Property editor panel |
| `theme-system` | Light/dark theme switching |
| `performance-monitor` | FPS, memory, render profiling |

### Infrastructure

| Module | What it does |
|--------|-------------|
| `a3p-parser` / `a3p-writer` | Read/write Alice .a3p project files |
| `project-system` | Create, save, restore, diff, auto-save projects |
| `project-templates` | Blank, Snow, SeaFloor, Moon, custom templates |
| `project-export` | Export to .a3p, standalone HTML, video |
| `project-runner` | Load and run Alice projects end-to-end |
| `persistence` | Save/load state |
| `collaboration` | Real-time collaborative editing |
| `state-synchronization` | Centralized state with change tracking |
| `network-layer` | HTTP/WebSocket client, offline queue, retry |
| `web-runtime` | Browser adapter, canvas, WebGL, fullscreen, touch |
| `plugin-system` | Plugin loading and lifecycle |
| `analytics` | Usage tracking |
| `localization` | Multi-language support |
| `accessibility` | Screen reader, keyboard navigation, high contrast |
| `error-recovery` | Error boundaries, crash reporting, safe mode |
| `testing-framework` | Test utilities |
| `documentation-generator` | Generate API docs from type system |
| `resource-system` | Model, audio, image resource loading and caching |

## REST API

The server exposes endpoints used by the [eatme](https://github.com/rysweet/eatme)
test suite for automated end-to-end testing. See the
[API reference](./docs/api-reference.md) for request and response details.

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Server health check |
| `/api/launch` | POST | Launch project from template |
| `/api/project/templates` | GET | List available project templates |
| `/api/project/new` | POST | Create a project from a template |
| `/api/scene/add-object` | POST | Add entity to scene |
| `/api/code/edit-procedure` | POST | Edit a method body |
| `/api/code/create-procedure` | POST | Create a procedure |
| `/api/code/create-function` | POST | Create a function |
| `/api/world/run` | POST | Run the world |
| `/api/project/save` | POST | Save the project |
| `/api/screenshot` | GET | Capture current render |
| `/api/events/register` | POST | Register event handler |
| `/api/events/fire` | POST | Fire an event |

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
```

The Gadugi scenario set uses the runner-compatible `action: execute` contract.
After required A3P fixtures are available, run the outside-in scenarios against
the built REST API server:

```bash
npm run build:server
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test list -d gadugi
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test validate -d gadugi
rg 'cleanup:|action:\s*(launch|http_request|verify_response|verify_output|send_input|verify_exit_code|stop_application|shell)|retry:' gadugi

NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi -s "Scene Entity Manipulation"
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi -s "Event System"
NODE_OPTIONS=--max-old-space-size=32768 gadugi-test run -d gadugi -s "Save / Export Round-Trip"
```

See [Gadugi test scenarios](./docs/gadugi-test-scenarios.md) for scenario
configuration, A3P fixture runs, full-suite usage, and the runner-compatible
YAML pattern.

## Building

```bash
npm run build          # Build web client (Vite + TypeScript)
npm run build:server   # Build REST API server
```

## Relationship to Java Alice 3

This is a web port of [Alice 3](https://github.com/rysweet/RabbitHole)
(originally [TheAliceProject/alice3](https://github.com/TheAliceProject/alice3)).
The Java version is a ~300K-line Swing desktop application. This TypeScript
port reimplements the same functionality for the browser, with additional
web-specific features (collaboration, state sync, plugin system).

The [eatme](https://github.com/rysweet/eatme) test suite runs the same
curriculum scenarios against both the Java desktop and this web port to
verify behavioral parity.
