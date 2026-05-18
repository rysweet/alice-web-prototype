# Scene Manager — Multi-Scene Support

The scene manager (`src/scene-manager.ts`) orchestrates multiple Three.js scenes
within a single Alice project session. It tracks the active scene, supports
named scene registration, and provides transition callbacks for scene switching.

## Overview

| Export | Kind | Purpose |
|---|---|---|
| `SceneManager` | class | Multi-scene container with active-scene tracking |
| `SceneTransition` | type | Callback signature for scene transition hooks |
| `SceneManagerEvent` | type | Union of event names emitted by the manager |

The scene manager wraps the existing `buildScene()` function from
`scene-builder.ts`. Each scene is built from a parsed `AliceProject` with
optional `SceneBuildOptions`, then stored by name in an internal `Map`. The
first scene added automatically becomes the active scene.

## Quick Start

```typescript
import { parseA3P } from './a3p-parser';
import { SceneManager } from './scene-manager';

const project = await parseA3P(buffer);

const manager = new SceneManager();

// Add scenes — first one becomes active automatically
manager.addScene('intro', project);
manager.addScene('chapter1', project, {
  showGroundGrid: true,
  lights: [
    { type: 'ambient', color: 0xffffff, intensity: 0.6 },
  ],
});

// Query active scene
console.log(manager.activeSceneName); // "intro"
const { scene, camera } = manager.activeScene;

// Switch scenes
manager.setActiveScene('chapter1');
console.log(manager.activeSceneName); // "chapter1"
```

### With Transition Callbacks

```typescript
manager.onTransition((from, to) => {
  console.log(`Transitioning from "${from}" to "${to}"`);
  // Fade out / fade in, update UI, etc.
});

manager.setActiveScene('chapter1');
// logs: Transitioning from "intro" to "chapter1"
```

## API Reference

### `new SceneManager()`

Creates an empty scene manager with no scenes.

### `manager.addScene(name: string, project: AliceProject, options?: SceneBuildOptions): SceneBuildResult`

Build and register a scene from an Alice project. Calls `buildScene(project, options)`
internally, stores the result keyed by `name`.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Unique name for this scene |
| `project` | `AliceProject` | Parsed `.a3p` project data |
| `options` | `SceneBuildOptions` | Optional build configuration (lights, grid, etc.) |

**Returns:** The `SceneBuildResult` from `buildScene()`.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | A scene with the given name already exists |

**Behavior:**

- The first scene added becomes the active scene automatically.
- Subsequent scenes are stored but not active until `setActiveScene()` is called.

### `manager.removeScene(name: string): boolean`

Remove a scene by name.

**Returns:** `true` if the scene existed and was removed, `false` otherwise.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | Cannot remove the active scene — switch first |

### `manager.setActiveScene(name: string): void`

Switch the active scene.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | No scene with the given name exists |

**Behavior:**

- If `name` equals the current active scene, this is a no-op.
- Fires registered transition callbacks with `(fromName, toName)`.

### `manager.activeScene: SceneBuildResult`

Read-only property returning the active scene's build result.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | No scenes have been added |

### `manager.activeSceneName: string`

Read-only property returning the name of the active scene.

**Throws:**

| Error | Condition |
|-------|-----------|
| `Error` | No scenes have been added |

### `manager.getScene(name: string): SceneBuildResult | undefined`

Retrieve a scene by name without switching to it.

### `manager.sceneNames: string[]`

Read-only property returning all registered scene names in insertion order.

### `manager.sceneCount: number`

Read-only property returning the number of registered scenes.

### `manager.hasScene(name: string): boolean`

Check whether a scene with the given name is registered.

### `manager.onTransition(callback: SceneTransition): () => void`

Register a transition callback. Returns an unsubscribe function.

**Callback signature:**

```typescript
type SceneTransition = (fromName: string, toName: string) => void;
```

The callback fires synchronously during `setActiveScene()`, before the active
scene reference is updated.

### `manager.clear(): void`

Remove all scenes and reset state. After calling `clear()`, the manager is
empty — `sceneCount` is 0 and `activeScene` throws.

## Types

```typescript
/** Callback invoked during scene transitions. */
type SceneTransition = (fromName: string, toName: string) => void;

/** Events emitted by the SceneManager. */
type SceneManagerEvent = 'transition';
```

## Integration with Existing Code

The `SceneManager` builds on top of the existing `buildScene()` pipeline:

```
.a3p ZIP  →  a3p-parser.ts  →  AliceProject
                                    ↓
                            SceneManager.addScene()
                                    ↓
                            buildScene(project, options)
                                    ↓
                            SceneBuildResult stored by name
```

Existing code that calls `buildScene()` directly continues to work. The
`SceneManager` is an optional orchestration layer for multi-scene workflows.

### Usage with the Animation System

```typescript
import { SceneManager } from './scene-manager';
import { Tween, easeInOut, lerpScalar } from './animation';

const manager = new SceneManager();
manager.addScene('scene1', project1);
manager.addScene('scene2', project2);

// Cross-fade between scenes using opacity tween
manager.onTransition((from, to) => {
  const fadeOut = new Tween({
    from: 1, to: 0, durationMs: 500,
    easing: easeInOut, interpolate: lerpScalar,
  });
  // Apply fadeOut to the outgoing scene's materials...
});

manager.setActiveScene('scene2');
```

### Usage with the Story API

```typescript
import { Scene } from './story-api';
import { SceneManager } from './scene-manager';

const manager = new SceneManager();
manager.addScene('main', project);

// Access the THREE.Scene from the active scene
const threeScene = manager.activeScene.scene;

// Use Story API independently for entity queries
const storyScene = Scene.fromProject(project);
```

## Error Handling

All errors are standard `Error` instances with descriptive messages:

- `"Scene 'x' already exists"` — duplicate name in `addScene()`
- `"Scene 'x' not found"` — invalid name in `setActiveScene()`
- `"Cannot remove active scene 'x'"` — must switch before removing
- `"No scenes added"` — accessing `activeScene` or `activeSceneName` when empty

## Testing

```bash
npx vitest run test/scene-manager.test.ts
```

Tests use jsdom for DOM simulation (Three.js requires it) and cover:

- Adding first scene sets it as active
- Adding multiple scenes preserves insertion order
- Switching active scene
- Transition callbacks fire with correct arguments
- Removing non-active scene
- Removing active scene throws
- Duplicate scene name throws
- Setting active to unknown name throws
- `clear()` resets all state
- `sceneCount` and `sceneNames` reflect mutations
- `hasScene()` positive and negative
- `getScene()` returns undefined for missing names
- Unsubscribe function from `onTransition` works
