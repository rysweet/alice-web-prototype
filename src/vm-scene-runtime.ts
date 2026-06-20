import type { AliceProject } from "./a3p-parser.js";
import { AnimationLoop, AnimationQueue } from "./animation-loop.js";
import type { SceneGraph, SceneGraphNode } from "./scene-graph.js";
import type { EntryPointExecutionOptions } from "./virtual-machine.js";
import type { ExecutionResult, VMExecutionOptions } from "./tweedle-vm-core-types.js";
import { executeProject, virtualMachine } from "./tweedle-vm-core-setup.js";
import { VmSceneBridge } from "./vm-scene-bridge-core.js";
import { createSceneGraphForProject } from "./vm-scene-bridge-registration.js";
import type { VmSceneRuntimeOptions } from "./vm-scene-bridge-types.js";

export class VmSceneRuntime {
  readonly sceneGraph: SceneGraph;
  readonly bridge: VmSceneBridge;
  readonly animationLoop: AnimationLoop;
  readonly entityNodes: ReadonlyMap<string, SceneGraphNode>;

  constructor(readonly project: AliceProject, options: VmSceneRuntimeOptions = {}) {
    const registration = createSceneGraphForProject(project, options.sceneGraph);
    const queue = options.animationQueue ?? new AnimationQueue();
    this.sceneGraph = registration.sceneGraph;
    this.animationLoop = new AnimationLoop({
      queue,
      render: (simulationTimeMs) => {
        this.bridge.updateSpeechBubblePositions();
        options.render?.(simulationTimeMs);
      },
    });
    this.bridge = new VmSceneBridge({
      animationQueue: queue,
      overlayContainer: options.overlayContainer,
      projectWorldToScreen: options.projectWorldToScreen,
      defaultBubbleDurationMs: options.defaultBubbleDurationMs,
    });
    for (const [entityId, node] of registration.entityNodes.entries()) {
      this.bridge.registerEntity(entityId, node);
    }
    this.entityNodes = registration.entityNodes;
    this.bridge.updateSpeechBubblePositions();
  }

  executeProject(options: VMExecutionOptions = {}): ExecutionResult {
    return executeProject(this.project, { ...options, sceneBridge: options.sceneBridge ?? this.bridge });
  }

  executeEntryPoint(options: EntryPointExecutionOptions, executionOptions: VMExecutionOptions = {}): ExecutionResult {
    return virtualMachine.executeEntryPoint(
      this.project,
      options,
      { ...executionOptions, sceneBridge: executionOptions.sceneBridge ?? this.bridge },
    ).result;
  }

  runWorld(options: Partial<EntryPointExecutionOptions> = {}, executionOptions: VMExecutionOptions = {}): ExecutionResult {
    this.animationLoop.play();
    const receiverName = options.receiverName ?? this.project.sceneObjects[0]?.name ?? "";
    const entryMethod = options.entryMethod ?? this.project.methods[0]?.name ?? "";
    return this.executeEntryPoint({ receiverName, entryMethod, args: options.args, debugRuntime: options.debugRuntime }, executionOptions);
  }

  stop(): void {
    this.animationLoop.pause();
  }
}

export function createVmSceneRuntime(project: AliceProject, options: VmSceneRuntimeOptions = {}): VmSceneRuntime {
  return new VmSceneRuntime(project, options);
}
