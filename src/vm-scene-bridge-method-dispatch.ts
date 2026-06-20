import { type AnimationQueue, easeInOut } from "./animation-loop.js";
import { VisualNode } from "./scene-graph.js";
import {
  addVec3,
  magnitudeVec3,
  normalizeVec3,
  orientationFromLookDirection,
  quaternionFromAxisAngle,
  quaternionMultiply as multiplyOrientation,
  relationOffset,
  revolutionsToRadians,
  rotateVector,
  scaleVec3,
  subtractVec3,
  vectorFromMoveDirection,
} from "./story-api/expanded-math.js";
import {
  parseMoveDirection,
  parseRollDirection,
  parseSpatialRelation,
  parseTurnDirection,
  type SpatialRelation,
} from "./story-api/types.js";
import type { RuntimeObject, VMState } from "./tweedle-vm-core-types.js";
import { durationMs, easeFor, finiteVec3, numericValue, toColor3 } from "./vm-scene-bridge-mapping.js";
import { DEFAULT_BUBBLE_DURATION_MS, SpeechBubbleManager } from "./vm-scene-bridge-speech-bubbles.js";
import { TransformAnimationController } from "./vm-scene-bridge-transform-animation.js";

export interface VmSceneMethodDispatcherOptions {
  readonly transforms: TransformAnimationController;
  readonly speechBubbles: SpeechBubbleManager;
  readonly getAnimationQueue: () => AnimationQueue | null;
  readonly defaultBubbleDurationMs?: number;
}

export class VmSceneMethodDispatcher {
  readonly #transforms: TransformAnimationController;
  readonly #speechBubbles: SpeechBubbleManager;
  readonly #getAnimationQueue: () => AnimationQueue | null;
  readonly #defaultBubbleDurationMs: number;

  constructor(options: VmSceneMethodDispatcherOptions) {
    this.#transforms = options.transforms;
    this.#speechBubbles = options.speechBubbles;
    this.#getAnimationQueue = options.getAnimationQueue;
    this.#defaultBubbleDurationMs = options.defaultBubbleDurationMs ?? DEFAULT_BUBBLE_DURATION_MS;
  }

  handleMethodCall(target: RuntimeObject, methodName: string, args: readonly unknown[], _state: VMState): boolean {
    const entityId = target.name;
    const node = this.#transforms.getNodeForEntity(entityId);
    if (!node) {
      return false;
    }

    switch (methodName) {
      case "move":
        this.#move(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "turn":
        this.#turn(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "roll":
        this.#roll(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "resize":
        this.#resize(entityId, args[0], args[1], args[2]);
        return true;
      case "say":
        this.#speak(entityId, "say", args[0], args[1]);
        return true;
      case "think":
        this.#speak(entityId, "think", args[0], args[1]);
        return true;
      case "setColor":
        this.#setColor(entityId, args[0]);
        return true;
      case "setOpacity":
        this.#setOpacity(entityId, args[0]);
        return true;
      case "setVehicle":
        this.#transforms.setVehicle(entityId, args[0]);
        return true;
      case "place":
        this.#place(entityId, args[0], args[1], args[2]);
        return true;
      case "pointAt":
        this.#pointAt(entityId, args[0]);
        return true;
      case "orientTo":
        this.#orientTo(entityId, args[0]);
        return true;
      case "moveToward":
        this.#moveToward(entityId, args[0], args[1], args[2], args[3]);
        return true;
      case "turnToFace":
        this.#turnToFace(entityId, args[0], args[1], args[2]);
        return true;
      default:
        return false;
    }
  }

  #move(entityId: string, directionValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const world = this.#transforms.worldFor(entityId);
    const amount = numericValue(amountValue, 0);
    const basis = typeof directionValue === "string"
      ? rotateVector(world.orientation, vectorFromMoveDirection(parseMoveDirection(directionValue)))
      : directionValue == null
        ? vectorFromMoveDirection("FORWARD")
        : finiteVec3(directionValue, { x: 0, y: 0, z: 0 });
    const delta = scaleVec3(normalizeVec3(basis), amount);
    return this.#transforms.animateWorldPosition(entityId, addVec3(world.position, delta), durationMs(durationValue), easeFor(styleValue));
  }

  #turn(entityId: string, directionValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const local = this.#transforms.localFor(entityId);
    const amount = numericValue(amountValue, 0);
    const signed = parseTurnDirection(String(directionValue ?? "LEFT")) === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 1, 0, revolutionsToRadians(signed));
    return this.#transforms.animateLocalOrientation(entityId, multiplyOrientation(delta, local.orientation), durationMs(durationValue), easeFor(styleValue));
  }

  #roll(entityId: string, directionValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const local = this.#transforms.localFor(entityId);
    const amount = numericValue(amountValue, 0);
    const signed = parseRollDirection(String(directionValue ?? "LEFT")) === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 0, 1, revolutionsToRadians(signed));
    return this.#transforms.animateLocalOrientation(entityId, multiplyOrientation(delta, local.orientation), durationMs(durationValue), easeFor(styleValue));
  }

  #resize(entityId: string, factorValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const local = this.#transforms.localFor(entityId);
    const factor = Math.max(0, numericValue(factorValue, 1));
    return this.#transforms.animateLocalScale(entityId, scaleVec3(local.scale, factor), durationMs(durationValue), easeFor(styleValue));
  }

  #setColor(entityId: string, colorValue: unknown): void {
    const node = this.#transforms.getNodeForEntity(entityId);
    if (!(node instanceof VisualNode)) {
      return;
    }
    const color = toColor3(colorValue);
    if (color) {
      node.color = color;
    }
  }

  #setOpacity(entityId: string, opacityValue: unknown): void {
    const node = this.#transforms.getNodeForEntity(entityId);
    if (!(node instanceof VisualNode)) {
      return;
    }
    node.opacity = numericValue(opacityValue, node.opacity);
  }

  #place(entityId: string, relationValue: unknown, targetValue: unknown, offsetValue?: unknown): Promise<void> {
    const target = this.#transforms.targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const selfWorld = this.#transforms.worldFor(entityId);
    const targetWorld = this.#transforms.projectedWorldForNode(target);
    const relation = parseSpatialRelation(String(relationValue ?? "ABOVE")) as SpatialRelation;
    const offset = numericValue(offsetValue, 0);
    const relationDistance = (() => {
      switch (relation) {
        case "ABOVE":
        case "BELOW":
          return ((targetWorld.scale.y + selfWorld.scale.y) / 2) + offset;
        case "LEFT_OF":
        case "RIGHT_OF":
          return ((targetWorld.scale.x + selfWorld.scale.x) / 2) + offset;
        case "IN_FRONT_OF":
        case "BEHIND":
          return ((targetWorld.scale.z + selfWorld.scale.z) / 2) + offset;
      }
    })();
    return this.#transforms.animateWorldPosition(entityId, addVec3(targetWorld.position, relationOffset(relation, relationDistance)), 0, "linear");
  }

  #pointAt(entityId: string, targetValue: unknown): Promise<void> {
    const target = this.#transforms.targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const world = this.#transforms.worldFor(entityId);
    const targetWorld = this.#transforms.projectedWorldForNode(target);
    const direction = subtractVec3(targetWorld.position, world.position);
    if (magnitudeVec3(direction) === 0) {
      return Promise.resolve();
    }
    return this.#transforms.animateWorldOrientation(entityId, orientationFromLookDirection(direction), 0, "linear");
  }

  #orientTo(entityId: string, targetValue: unknown): Promise<void> {
    const target = this.#transforms.targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    return this.#transforms.animateWorldOrientation(entityId, this.#transforms.projectedWorldForNode(target).orientation, 0, "linear");
  }

  #moveToward(entityId: string, targetValue: unknown, amountValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const target = this.#transforms.targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const world = this.#transforms.worldFor(entityId);
    const targetWorld = this.#transforms.projectedWorldForNode(target);
    const direction = subtractVec3(targetWorld.position, world.position);
    const distance = magnitudeVec3(direction);
    const amount = numericValue(amountValue, 0);
    const movement = distance > 0
      ? {
        x: (direction.x / distance) * amount,
        y: (direction.y / distance) * amount,
        z: (direction.z / distance) * amount,
      }
      : { x: 0, y: 0, z: amount };
    return this.#transforms.animateWorldPosition(entityId, addVec3(world.position, movement), durationMs(durationValue), easeFor(styleValue));
  }

  #turnToFace(entityId: string, targetValue: unknown, durationValue?: unknown, styleValue?: unknown): Promise<void> {
    const target = this.#transforms.targetNodeFor(targetValue);
    if (!target) {
      return Promise.resolve();
    }
    const world = this.#transforms.worldFor(entityId);
    const targetWorld = this.#transforms.projectedWorldForNode(target);
    const planar = {
      x: targetWorld.position.x - world.position.x,
      y: 0,
      z: targetWorld.position.z - world.position.z,
    };
    if (magnitudeVec3(planar) === 0) {
      return Promise.resolve();
    }
    return this.#transforms.animateWorldOrientation(entityId, orientationFromLookDirection(planar), durationMs(durationValue), easeFor(styleValue));
  }

  #speak(entityId: string, kind: "say" | "think", textValue: unknown, durationValue?: unknown): Promise<void> {
    const text = typeof textValue === "string" ? textValue : String(textValue ?? "");
    const duration = durationMs(durationValue);
    const persistent = duration <= 0;
    const actualDuration = duration > 0 ? duration : this.#defaultBubbleDurationMs;
    const animationQueue = this.#getAnimationQueue();

    if (!animationQueue || persistent) {
      this.#speechBubbles.show(entityId, kind, text, true);
      return Promise.resolve();
    }

    return animationQueue.enqueue({
      entityId,
      durationMs: actualDuration,
      from: 0,
      to: 1,
      interpolate: (from, to, portion) => from + ((to - from) * portion),
      apply: () => {
        this.#speechBubbles.updatePositions();
      },
      easing: easeInOut,
      onStart: () => {
        this.#speechBubbles.show(entityId, kind, text, false);
      },
      onComplete: () => {
        this.#speechBubbles.hide(entityId);
      },
    });
  }
}
