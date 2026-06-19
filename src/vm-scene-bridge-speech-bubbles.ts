import type { SceneGraphNode } from "./scene-graph.js";
import type { Vec3 } from "./story-api/types.js";
import { finiteScreenPosition, screenPositionOf, type ScreenPosition } from "./vm-scene-bridge-mapping.js";
import type { SpeechBubbleOverlay } from "./vm-scene-bridge-types.js";

export const DEFAULT_BUBBLE_DURATION_MS = 2000;

type ProjectWorldToScreen = (worldPosition: Vec3, entityId: string, node: SceneGraphNode) => ScreenPosition;

export interface SpeechBubbleManagerOptions {
  readonly overlayContainer?: HTMLElement | null;
  readonly projectWorldToScreen?: ProjectWorldToScreen;
  readonly getNodeForEntity: (entityId: string) => SceneGraphNode | null;
}

export class SpeechBubbleManager {
  readonly #getNodeForEntity: (entityId: string) => SceneGraphNode | null;
  readonly #overlayContainer: HTMLElement | null;
  readonly #projectWorldToScreen: ProjectWorldToScreen;
  readonly #speechBubbles = new Map<string, SpeechBubbleOverlay>();

  constructor(options: SpeechBubbleManagerOptions) {
    this.#getNodeForEntity = options.getNodeForEntity;
    this.#overlayContainer = options.overlayContainer
      ?? (typeof document !== "undefined" ? document.body : null);
    this.#projectWorldToScreen = options.projectWorldToScreen ?? screenPositionOf;
  }

  getElement(entityId: string): HTMLElement | null {
    return this.#speechBubbles.get(entityId)?.element ?? null;
  }

  updatePositions(): void {
    if (this.#speechBubbles.size === 0) {
      return;
    }

    for (const [entityId, overlay] of this.#speechBubbles.entries()) {
      if (!overlay.element) {
        continue;
      }
      const node = this.#getNodeForEntity(entityId);
      if (!node) {
        continue;
      }
      const world = node.worldTransform;
      const offset = Math.max(0.5, world.scale.y);
      const projected = finiteScreenPosition(this.#projectWorldToScreen(
        { x: world.position.x, y: world.position.y + offset, z: world.position.z },
        entityId,
        node,
      ));
      const style = overlay.element.style;
      const left = `${projected.x}px`;
      const top = `${projected.y}px`;
      const display = projected.visible === false ? "none" : "block";
      if (style.left !== left) {
        style.left = left;
      }
      if (style.top !== top) {
        style.top = top;
      }
      if (style.display !== display) {
        style.display = display;
      }
    }
  }

  show(entityId: string, kind: "say" | "think", text: string, persistent: boolean): void {
    const existing = this.#speechBubbles.get(entityId);
    existing?.element?.remove();

    const element = this.#overlayContainer && typeof document !== "undefined"
      ? document.createElement("div")
      : null;

    if (element && this.#overlayContainer) {
      element.textContent = text;
      element.dataset.entityId = entityId;
      element.dataset.kind = kind;
      element.style.position = "absolute";
      element.style.pointerEvents = "none";
      element.style.transform = "translate(-50%, -100%)";
      element.style.padding = "4px 8px";
      element.style.borderRadius = kind === "think" ? "18px" : "12px";
      element.style.border = "1px solid #333";
      element.style.background = "rgba(255, 255, 255, 0.95)";
      element.style.fontFamily = "sans-serif";
      element.style.fontSize = "12px";
      if (kind === "think") {
        element.style.fontStyle = "italic";
      }
      this.#overlayContainer.appendChild(element);
    }

    this.#speechBubbles.set(entityId, {
      entityId,
      kind,
      text,
      element,
      persistent,
    });
    this.updatePositions();
  }

  hide(entityId: string): void {
    const overlay = this.#speechBubbles.get(entityId);
    overlay?.element?.remove();
    this.#speechBubbles.delete(entityId);
  }
}
