import type { Position } from "./story-api/types.js";

export const VALID_EVENT_TYPES = [
  "sceneActivated",
  "keyPress",
  "keyPressed",
  "keyReleased",
  "keyTyped",
  "mouseClicked",
  "mousePressed",
  "mouseReleased",
  "mouseEntered",
  "mouseExited",
  "mouseMoved",
  "mouseDragged",
  "mouseWheel",
  "proximity",
] as const;
export type EventType = (typeof VALID_EVENT_TYPES)[number];
type InternalEventType = Exclude<EventType, "keyPress">;
export type EventPhase = "capture" | "target" | "bubble";

export interface EventRegistration {
  id: string;
  eventType: EventType;
  handlerName: string;
  key?: string;
  target?: string;
  useCapture?: boolean;
  targetObjects?: [string, string];
  threshold?: number;
}

export interface EventRegistrationRequest {
  eventType?: string;
  handlerName?: string;
  key?: string;
  target?: string;
  useCapture?: boolean;
  targetObjects?: string[];
  threshold?: number;
}

export interface EventTriggerPayload {
  key?: string;
  code?: string;
  target?: string;
  path?: string[];
  sourceObject?: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  button?: number;
  x?: number;
  y?: number;
  wheelRotation?: number;
}

export interface TriggeredEventHandler {
  id: string;
  eventType: EventType;
  handlerName: string;
  phase?: EventPhase;
  currentTarget?: string;
  target?: string;
}

export interface EventFireResult {
  registrationsEvaluated: number;
  triggered: TriggeredEventHandler[];
}

export interface QueuedEvent {
  id: string;
  eventType: EventType;
  payload: EventTriggerPayload;
}

export interface QueuedEventResult extends EventFireResult {
  queuedEventId: string;
}

export interface EventSystemBindings {
  hasObject?: (name: string) => boolean;
  getObjectPosition?: (name: string) => Position | null | undefined;
  getParentObject?: (name: string) => string | null | undefined;
}

export class EventSystemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventSystemError";
  }
}

const MAX_REGISTRATIONS = 1000;
const DEFAULT_THRESHOLD = 2.0;
const EVENT_TYPE_ALIASES: Partial<Record<EventType, InternalEventType>> = {
  keyPress: "keyPressed",
};
const KEYBOARD_EVENT_TYPES = new Set<InternalEventType>([
  "keyPressed",
  "keyReleased",
  "keyTyped",
]);
const MOUSE_EVENT_TYPES = new Set<InternalEventType>([
  "mouseClicked",
  "mousePressed",
  "mouseReleased",
  "mouseEntered",
  "mouseExited",
  "mouseMoved",
  "mouseDragged",
  "mouseWheel",
]);
const BUBBLING_EVENT_TYPES = new Set<InternalEventType>([
  ...KEYBOARD_EVENT_TYPES,
  ...MOUSE_EVENT_TYPES,
]);

interface ParsedEventType {
  requested: EventType;
  internal: InternalEventType;
}

interface StoredEventRegistration extends EventRegistration {
  internalEventType: InternalEventType;
}

export class EventSystem {
  private readonly registrationsByType = new Map<InternalEventType, StoredEventRegistration[]>();
  private readonly eventQueue: QueuedEvent[] = [];
  private registrationCount = 0;
  private nextEventId = 1;
  private nextQueuedEventId = 1;

  constructor(private readonly bindings: EventSystemBindings = {}) {}

  get totalRegistrations(): number {
    return this.registrationCount;
  }

  get queueSize(): number {
    return this.eventQueue.length;
  }

  reset(): void {
    this.registrationsByType.clear();
    this.eventQueue.length = 0;
    this.registrationCount = 0;
    this.nextEventId = 1;
    this.nextQueuedEventId = 1;
  }

  register(request: EventRegistrationRequest): EventRegistration {
    const parsedType = this.parseEventType(request.eventType);
    const handlerName = request.handlerName ?? "handler";

    if (KEYBOARD_EVENT_TYPES.has(parsedType.internal) && !request.key) {
      throw new EventSystemError(`key is required for ${parsedType.requested} events`);
    }
    if (request.useCapture && !BUBBLING_EVENT_TYPES.has(parsedType.internal)) {
      throw new EventSystemError(`${parsedType.requested} does not support capture listeners`);
    }
    if (request.target) {
      this.assertKnownObject(request.target);
    }

    let resolvedThreshold = DEFAULT_THRESHOLD;
    if (parsedType.internal === "proximity") {
      if (!Array.isArray(request.targetObjects) || request.targetObjects.length !== 2) {
        throw new EventSystemError("proximity requires targetObjects with exactly 2 entries");
      }
      for (const objectName of request.targetObjects) {
        this.assertKnownObject(objectName);
      }
      if (request.threshold !== undefined) {
        if (request.threshold <= 0 || request.threshold > 1000) {
          throw new EventSystemError("threshold must be > 0 and <= 1000");
        }
        resolvedThreshold = request.threshold;
      }
    }

    if (this.registrationCount >= MAX_REGISTRATIONS) {
      throw new EventSystemError(`registration limit reached (${MAX_REGISTRATIONS})`);
    }

    const registration: StoredEventRegistration = {
      id: `evt-${this.nextEventId++}`,
      eventType: parsedType.requested,
      internalEventType: parsedType.internal,
      handlerName,
      ...(KEYBOARD_EVENT_TYPES.has(parsedType.internal) ? { key: request.key } : {}),
      ...(request.target ? { target: request.target } : {}),
      ...(request.useCapture ? { useCapture: true } : {}),
      ...(parsedType.internal === "proximity"
        ? {
            targetObjects: request.targetObjects as [string, string],
            threshold: resolvedThreshold,
          }
        : {}),
    };

    const registrations = this.registrationsByType.get(parsedType.internal);
    if (registrations) {
      registrations.push(registration);
    } else {
      this.registrationsByType.set(parsedType.internal, [registration]);
    }
    this.registrationCount++;

    return this.cloneRegistration(registration);
  }

  enqueue(eventTypeInput?: string, payload: EventTriggerPayload = {}): QueuedEvent {
    const parsedType = this.parseEventType(eventTypeInput);
    const queuedEvent: QueuedEvent = {
      id: `qevt-${this.nextQueuedEventId++}`,
      eventType: parsedType.requested,
      payload: structuredClone(payload),
    };
    this.eventQueue.push(queuedEvent);
    return structuredClone(queuedEvent);
  }

  processNext(): QueuedEventResult | null {
    const queuedEvent = this.eventQueue.shift();
    if (!queuedEvent) {
      return null;
    }
    return {
      queuedEventId: queuedEvent.id,
      ...this.fire(queuedEvent.eventType, queuedEvent.payload),
    };
  }

  drainQueue(): QueuedEventResult[] {
    const results: QueuedEventResult[] = [];
    while (this.eventQueue.length > 0) {
      const result = this.processNext();
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  fire(eventTypeInput?: string, payload: EventTriggerPayload = {}): EventFireResult {
    const parsedType = this.parseEventType(eventTypeInput);
    const candidates = this.registrationsByType.get(parsedType.internal) ?? [];

    return {
      registrationsEvaluated: candidates.length,
      triggered:
        parsedType.internal === "proximity"
          ? this.fireProximity(candidates, payload)
          : this.fireStandardEvent(parsedType.internal, candidates, payload),
    };
  }

  private fireStandardEvent(
    eventType: InternalEventType,
    candidates: StoredEventRegistration[],
    payload: EventTriggerPayload,
  ): TriggeredEventHandler[] {
    const filtered = candidates.filter((registration) =>
      this.matchesRegistration(eventType, registration, payload),
    );
    const path = this.resolveEventPath(payload);
    if (path.length === 0) {
      return filtered
        .filter((registration) => !registration.target || registration.target === payload.target)
        .map((registration) => this.createTriggeredHandler(registration));
    }

    const target = path[path.length - 1];
    const triggered: TriggeredEventHandler[] = [];
    const ancestors = path.slice(0, -1);

    for (const currentTarget of ancestors) {
      triggered.push(
        ...this.collectPhaseHandlers(filtered, currentTarget, target, "capture", true),
      );
    }

    triggered.push(...this.collectTargetHandlers(filtered, target));

    if (BUBBLING_EVENT_TYPES.has(eventType)) {
      for (const currentTarget of [...ancestors].reverse()) {
        triggered.push(
          ...this.collectPhaseHandlers(filtered, currentTarget, target, "bubble", false),
        );
      }
    }

    return triggered;
  }

  private fireProximity(
    candidates: StoredEventRegistration[],
    payload: EventTriggerPayload,
  ): TriggeredEventHandler[] {
    return candidates
      .filter((registration) => {
        const targets = registration.targetObjects;
        if (!targets) {
          return false;
        }
        if (payload.sourceObject && !targets.includes(payload.sourceObject)) {
          return false;
        }
        const left = this.bindings.getObjectPosition?.(targets[0]) ?? null;
        const right = this.bindings.getObjectPosition?.(targets[1]) ?? null;
        return (
          left !== null &&
          right !== null &&
          euclideanDistance(left, right) <= (registration.threshold ?? DEFAULT_THRESHOLD)
        );
      })
      .map((registration) => this.createTriggeredHandler(registration));
  }

  private collectPhaseHandlers(
    candidates: StoredEventRegistration[],
    currentTarget: string,
    target: string,
    phase: Exclude<EventPhase, "target">,
    useCapture: boolean,
  ): TriggeredEventHandler[] {
    return candidates
      .filter(
        (registration) => registration.target === currentTarget && Boolean(registration.useCapture) === useCapture,
      )
      .map((registration) =>
        this.createTriggeredHandler(registration, {
          phase,
          currentTarget,
          target,
        }),
      );
  }

  private collectTargetHandlers(
    candidates: StoredEventRegistration[],
    target: string,
  ): TriggeredEventHandler[] {
    const targetScoped = candidates.filter((registration) => registration.target === target);
    const untargeted = candidates.filter((registration) => !registration.target);
    return [
      ...targetScoped
        .filter((registration) => registration.useCapture)
        .map((registration) =>
          this.createTriggeredHandler(registration, { phase: "target", currentTarget: target, target }),
        ),
      ...targetScoped
        .filter((registration) => !registration.useCapture)
        .map((registration) =>
          this.createTriggeredHandler(registration, { phase: "target", currentTarget: target, target }),
        ),
      ...untargeted.map((registration) => this.createTriggeredHandler(registration)),
    ];
  }

  private matchesRegistration(
    eventType: InternalEventType,
    registration: StoredEventRegistration,
    payload: EventTriggerPayload,
  ): boolean {
    if (KEYBOARD_EVENT_TYPES.has(eventType)) {
      const eventKey = payload.key ?? payload.code;
      return Boolean(eventKey) && registration.key === eventKey;
    }
    if (MOUSE_EVENT_TYPES.has(eventType)) {
      return true;
    }
    return true;
  }

  private resolveEventPath(payload: EventTriggerPayload): string[] {
    if (Array.isArray(payload.path) && payload.path.length > 0) {
      return payload.path.filter((entry) => typeof entry === "string" && entry.trim().length > 0);
    }

    const target = payload.target ?? payload.sourceObject;
    if (!target) {
      return [];
    }
    if (!this.bindings.getParentObject) {
      return [target];
    }

    const reversedPath = new Set<string>();
    let current: string | null = target;
    while (current) {
      reversedPath.add(current);
      const parent: string | null = this.bindings.getParentObject?.(current) ?? null;
      if (!parent || reversedPath.has(parent)) {
        break;
      }
      current = parent;
    }
    return [...reversedPath].reverse();
  }

  private createTriggeredHandler(
    registration: StoredEventRegistration,
    details: Partial<Pick<TriggeredEventHandler, "phase" | "currentTarget" | "target">> = {},
  ): TriggeredEventHandler {
    return {
      id: registration.id,
      eventType: registration.eventType,
      handlerName: registration.handlerName,
      ...(details.phase ? { phase: details.phase } : {}),
      ...(details.currentTarget ? { currentTarget: details.currentTarget } : {}),
      ...(details.target ? { target: details.target } : {}),
    };
  }

  private cloneRegistration(registration: StoredEventRegistration): EventRegistration {
    return {
      id: registration.id,
      eventType: registration.eventType,
      handlerName: registration.handlerName,
      ...(registration.key ? { key: registration.key } : {}),
      ...(registration.target ? { target: registration.target } : {}),
      ...(registration.useCapture ? { useCapture: true } : {}),
      ...(registration.targetObjects ? { targetObjects: [...registration.targetObjects] as [string, string] } : {}),
      ...(registration.threshold !== undefined ? { threshold: registration.threshold } : {}),
    };
  }

  private assertKnownObject(name: string): void {
    if (this.bindings.hasObject && !this.bindings.hasObject(name)) {
      throw new EventSystemError(`unknown object: ${name}`);
    }
  }

  private parseEventType(eventType?: string): ParsedEventType {
    if (!eventType) {
      throw new EventSystemError("eventType is required");
    }
    if (!VALID_EVENT_TYPES.includes(eventType as EventType)) {
      throw new EventSystemError(`unknown eventType: ${eventType}`);
    }
    const requested = eventType as EventType;
    return {
      requested,
      internal: EVENT_TYPE_ALIASES[requested] ?? (requested as InternalEventType),
    };
  }
}

function euclideanDistance(left: Position, right: Position): number {
  return Math.sqrt(
    (left.x - right.x) ** 2 +
      (left.y - right.y) ** 2 +
      (left.z - right.z) ** 2,
  );
}
