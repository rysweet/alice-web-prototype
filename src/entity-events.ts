import { aabbFromEntity, aabbIntersects } from "./collision-detection.js";
import { EventSystem, type EventFireResult, type EventRegistration, type EventTriggerPayload } from "./events.js";
import { SModel, SMovableTurnable, SThing, STurnable } from "./story-api/entities.js";
import type { MoveDirection, Position, TurnDirection } from "./story-api/expanded-types.js";

export interface KeyPressedEvent extends Omit<EventTriggerPayload, "key"> {
  readonly type: "keyPressed";
  readonly key: string;
}

export interface MouseClickEvent extends EventTriggerPayload {
  readonly type: "mouseClicked";
}

export interface SceneActivatedEvent {
  readonly type: "sceneActivated";
}

export interface CollisionEvent {
  readonly type: "collision";
  readonly source: string;
  readonly target: string;
}

export interface ProximityEvent extends EventTriggerPayload {
  readonly type: "proximity";
  readonly sourceObject?: string;
}

export interface MoveEntityAction {
  readonly kind: "move";
  readonly direction: MoveDirection;
  readonly amount: number;
  readonly duration?: number;
}

export interface TurnEntityAction {
  readonly kind: "turn";
  readonly direction: TurnDirection;
  readonly amount: number;
  readonly duration?: number;
}

export interface SayEntityAction {
  readonly kind: "say";
  readonly text: string;
  readonly duration?: number;
}

export interface ThinkEntityAction {
  readonly kind: "think";
  readonly text: string;
  readonly duration?: number;
}

export type EntityAction =
  | MoveEntityAction
  | TurnEntityAction
  | SayEntityAction
  | ThinkEntityAction;

export interface SceneActivationStep {
  readonly entity: string;
  readonly action: EntityAction;
}

export interface EntityPairActionStep {
  readonly entity: "source" | "target";
  readonly action: EntityAction;
}

export interface CollisionBinding {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly response: readonly EntityPairActionStep[];
}

export interface CollisionDispatchResult {
  readonly triggered: CollisionEvent[];
  readonly executedBindings: string[];
}

export class EntityEventSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EntityEventSystemError";
  }
}

interface StandardBindingRequest {
  readonly eventType: "sceneActivated" | "keyPressed" | "mouseClicked" | "proximity";
  readonly key?: string;
  readonly target?: string;
  readonly targetObjects?: [string, string];
  readonly threshold?: number;
}

export class EntityEventSystem {
  readonly events: EventSystem;

  private readonly entities = new Map<string, SThing>();
  private readonly parents = new Map<string, string | null>();
  private readonly executors = new Map<string, () => void>();
  private readonly collisionBindings: CollisionBinding[] = [];
  private readonly activeCollisions = new Set<string>();
  private nextBindingId = 1;

  constructor(
    entities: Record<string, SThing> = {},
    parents: Record<string, string | null | undefined> = {},
  ) {
    this.events = new EventSystem({
      hasObject: (name) => this.entities.has(name),
      getObjectPosition: (name) => this.getObjectPosition(name),
      getParentObject: (name) => this.parents.get(name) ?? null,
    });

    for (const [name, entity] of Object.entries(entities)) {
      this.registerEntity(name, entity, parents[name] ?? null);
    }
  }

  get totalBindings(): number {
    return this.events.totalRegistrations + this.collisionBindings.length;
  }

  registerEntity(name: string, entity: SThing, parentName: string | null = null): void {
    entity.setName(name);
    this.entities.set(name, entity);
    this.parents.set(name, parentName);
  }

  setParent(name: string, parentName: string | null): void {
    this.requireEntity(name);
    this.parents.set(name, parentName);
  }

  getEntity(name: string): SThing {
    return this.requireEntity(name);
  }

  bindKeyPressedMove(
    entityName: string,
    key: string,
    direction: MoveDirection,
    amount: number,
    duration = 0,
  ): EventRegistration {
    const entity = this.requireMovable(entityName);
    return this.registerStandardBinding({ eventType: "keyPressed", key }, () => {
      entity.move(direction, amount, duration);
    });
  }

  bindKeyPressedTurn(
    entityName: string,
    key: string,
    direction: TurnDirection,
    amount: number,
    duration = 0,
  ): EventRegistration {
    const entity = this.requireTurnable(entityName);
    return this.registerStandardBinding({ eventType: "keyPressed", key }, () => {
      entity.turn(direction, amount, duration);
    });
  }

  bindMouseClickSay(
    entityName: string,
    text: string,
    options: { target?: string; duration?: number } = {},
  ): EventRegistration {
    const entity = this.requireModel(entityName);
    return this.registerStandardBinding(
      { eventType: "mouseClicked", target: options.target },
      () => {
        entity.say(text, options.duration ?? 0);
      },
    );
  }

  bindMouseClickThink(
    entityName: string,
    text: string,
    options: { target?: string; duration?: number } = {},
  ): EventRegistration {
    const entity = this.requireModel(entityName);
    return this.registerStandardBinding(
      { eventType: "mouseClicked", target: options.target },
      () => {
        entity.think(text, options.duration ?? 0);
      },
    );
  }

  bindSceneActivatedSequence(steps: readonly SceneActivationStep[]): EventRegistration {
    const sequence = steps.map((step) => ({ entity: step.entity, action: step.action }));
    return this.registerStandardBinding({ eventType: "sceneActivated" }, () => {
      for (const step of sequence) {
        this.executeAction(step.entity, this.requireEntity(step.entity), step.action);
      }
    });
  }

  bindCollisionResponse(
    sourceName: string,
    targetName: string,
    response: readonly EntityPairActionStep[],
  ): CollisionBinding {
    this.requireModel(sourceName);
    this.requireModel(targetName);
    const binding: CollisionBinding = {
      id: `collision-${this.nextBindingId++}`,
      source: sourceName,
      target: targetName,
      response: [...response],
    };
    this.collisionBindings.push(binding);
    return binding;
  }

  bindProximityResponse(
    sourceName: string,
    targetName: string,
    threshold: number,
    response: readonly EntityPairActionStep[],
  ): EventRegistration {
    this.requireMovable(sourceName);
    this.requireMovable(targetName);
    const steps = [...response];
    return this.registerStandardBinding(
      {
        eventType: "proximity",
        targetObjects: [sourceName, targetName],
        threshold,
      },
      () => {
        this.executePairResponse(sourceName, targetName, steps);
      },
    );
  }

  fireKeyPressed(event: KeyPressedEvent): EventFireResult {
    const { type: _type, ...payload } = event;
    return this.fireAndExecute("keyPressed", payload);
  }

  fireMouseClick(event: MouseClickEvent): EventFireResult {
    const { type: _type, ...payload } = event;
    return this.fireAndExecute("mouseClicked", payload);
  }

  fireSceneActivated(_event: SceneActivatedEvent = { type: "sceneActivated" }): EventFireResult {
    return this.fireAndExecute("sceneActivated");
  }

  fireProximity(event: ProximityEvent): EventFireResult {
    const { type: _type, ...payload } = event;
    return this.fireAndExecute("proximity", payload);
  }

  checkCollisions(): CollisionDispatchResult {
    const triggered: CollisionEvent[] = [];
    const executedBindings: string[] = [];

    for (const binding of this.collisionBindings) {
      const source = this.requireModel(binding.source);
      const target = this.requireModel(binding.target);
      const isColliding = aabbIntersects(aabbFromEntity(source), aabbFromEntity(target));
      if (isColliding) {
        if (!this.activeCollisions.has(binding.id)) {
          this.activeCollisions.add(binding.id);
          this.executePairResponse(binding.source, binding.target, binding.response);
          triggered.push({ type: "collision", source: binding.source, target: binding.target });
          executedBindings.push(binding.id);
        }
      } else {
        this.activeCollisions.delete(binding.id);
      }
    }

    return {
      triggered,
      executedBindings,
    };
  }

  private fireAndExecute(
    eventType: StandardBindingRequest["eventType"],
    payload: EventTriggerPayload = {},
  ): EventFireResult {
    const result = this.events.fire(eventType, payload);
    for (const triggered of result.triggered) {
      this.executors.get(triggered.handlerName)?.();
    }
    return result;
  }

  private registerStandardBinding(
    request: StandardBindingRequest,
    executor: () => void,
  ): EventRegistration {
    const handlerName = `entity-handler-${this.nextBindingId++}`;
    this.executors.set(handlerName, executor);
    return this.events.register({ ...request, handlerName });
  }

  private executePairResponse(
    sourceName: string,
    targetName: string,
    steps: readonly EntityPairActionStep[],
  ): void {
    const source = this.requireEntity(sourceName);
    const target = this.requireEntity(targetName);
    for (const step of steps) {
      const resolvedName = step.entity === "source" ? sourceName : targetName;
      const resolvedEntity = step.entity === "source" ? source : target;
      this.executeAction(resolvedName, resolvedEntity, step.action);
    }
  }

  private executeAction(entityName: string, entity: SThing, action: EntityAction): void {
    switch (action.kind) {
      case "move": {
        if (!(entity instanceof SMovableTurnable)) {
          throw new EntityEventSystemError(`${entityName} cannot move`);
        }
        entity.move(action.direction, action.amount, action.duration ?? 0);
        return;
      }
      case "turn": {
        if (!(entity instanceof STurnable)) {
          throw new EntityEventSystemError(`${entityName} cannot turn`);
        }
        entity.turn(action.direction, action.amount, action.duration ?? 0);
        return;
      }
      case "say": {
        if (!(entity instanceof SModel)) {
          throw new EntityEventSystemError(`${entityName} cannot say text`);
        }
        entity.say(action.text, action.duration ?? 0);
        return;
      }
      case "think": {
        if (!(entity instanceof SModel)) {
          throw new EntityEventSystemError(`${entityName} cannot think text`);
        }
        entity.think(action.text, action.duration ?? 0);
        return;
      }
    }
  }

  private getObjectPosition(name: string): Position | null {
    const entity = this.entities.get(name);
    return entity instanceof SMovableTurnable ? entity.position : null;
  }

  private requireEntity(name: string): SThing {
    const entity = this.entities.get(name);
    if (!entity) {
      throw new EntityEventSystemError(`unknown entity: ${name}`);
    }
    return entity;
  }

  private requireMovable(name: string): SMovableTurnable {
    const entity = this.requireEntity(name);
    if (!(entity instanceof SMovableTurnable)) {
      throw new EntityEventSystemError(`${name} does not support move actions`);
    }
    return entity;
  }

  private requireTurnable(name: string): STurnable {
    const entity = this.requireEntity(name);
    if (!(entity instanceof STurnable)) {
      throw new EntityEventSystemError(`${name} does not support turn actions`);
    }
    return entity;
  }

  private requireModel(name: string): SModel {
    const entity = this.requireEntity(name);
    if (!(entity instanceof SModel)) {
      throw new EntityEventSystemError(`${name} does not support model actions`);
    }
    return entity;
  }
}
