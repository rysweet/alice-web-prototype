import type { AnimationQueue } from "./animation-loop.js";
import type { SceneGraphNode } from "./scene-graph.js";
import type { AliceMethodBridge, RuntimeObject, VMState } from "./tweedle-vm-core-types.js";
import { VmSceneMethodDispatcher } from "./vm-scene-bridge-method-dispatch.js";
import { SpeechBubbleManager } from "./vm-scene-bridge-speech-bubbles.js";
import { TransformAnimationController } from "./vm-scene-bridge-transform-animation.js";
import type { VmSceneBridgeOptions } from "./vm-scene-bridge-types.js";

export class VmSceneBridge implements AliceMethodBridge {
  readonly #transforms: TransformAnimationController;
  readonly #speechBubbles: SpeechBubbleManager;
  readonly #dispatcher: VmSceneMethodDispatcher;

  constructor(options: VmSceneBridgeOptions = {}) {
    this.#transforms = new TransformAnimationController(options.animationQueue, () => {
      this.#speechBubbles.updatePositions();
    });
    this.#speechBubbles = new SpeechBubbleManager({
      overlayContainer: options.overlayContainer,
      projectWorldToScreen: options.projectWorldToScreen,
      getNodeForEntity: (entityId) => this.#transforms.getNodeForEntity(entityId),
    });
    this.#dispatcher = new VmSceneMethodDispatcher({
      transforms: this.#transforms,
      speechBubbles: this.#speechBubbles,
      getAnimationQueue: () => this.#transforms.animationQueue,
      defaultBubbleDurationMs: options.defaultBubbleDurationMs,
    });
  }

  setAnimationQueue(animationQueue: AnimationQueue | null): void {
    this.#transforms.setAnimationQueue(animationQueue);
  }

  get animationQueue(): AnimationQueue | null {
    return this.#transforms.animationQueue;
  }

  registerEntity(entityId: string, sceneNode: SceneGraphNode): void {
    this.#transforms.registerEntity(entityId, sceneNode);
  }

  getNodeForEntity(entityId: string): SceneGraphNode | null {
    return this.#transforms.getNodeForEntity(entityId);
  }

  getSpeechBubbleElement(entityId: string): HTMLElement | null {
    return this.#speechBubbles.getElement(entityId);
  }

  handleMethodCall(target: RuntimeObject, methodName: string, args: readonly unknown[], state: VMState): boolean {
    return this.#dispatcher.handleMethodCall(target, methodName, args, state);
  }

  updateSpeechBubblePositions(): void {
    this.#speechBubbles.updatePositions();
  }
}
