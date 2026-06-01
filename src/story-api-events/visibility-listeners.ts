import type { PropertyChange } from "../story-api";
import {
  cloneTransformValue,
  entityKey,
  findOccluder,
  transformProperty,
  type OcclusionEvent,
  type TransformationEvent,
  type ViewEvent,
  SCamera,
  SThing,
} from "./shared.js";
import type { Orientation, Position, Size } from "../story-api";
import { VisibilityQuery } from "../entity-queries";

const visibilityQuery = new VisibilityQuery();

export class OcclusionListener {
  readonly events: OcclusionEvent[] = [];
  readonly #occluded = new Map<string, SThing | null>();
  readonly #onEvent?: (event: OcclusionEvent) => void;

  constructor(onEvent?: (event: OcclusionEvent) => void) { this.#onEvent = onEvent; }

  update(camera: SCamera, targets: readonly SThing[], occluders: readonly SThing[]): OcclusionEvent[] {
    const events: OcclusionEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      const previous = this.#occluded.get(key) ?? null;
      const current = findOccluder(camera, target, occluders);
      if (!previous && current) {
        const event: OcclusionEvent = { type: "occluded", camera, target, occluder: current };
        this.events.push(event); this.#onEvent?.(event); events.push(event);
      } else if (previous && !current) {
        const event: OcclusionEvent = { type: "revealed", camera, target, occluder: null };
        this.events.push(event); this.#onEvent?.(event); events.push(event);
      }
      this.#occluded.set(key, current);
    }
    return events;
  }
}

export class TransformationListener {
  readonly events: TransformationEvent[] = [];
  readonly #onEvent?: (event: TransformationEvent) => void;
  readonly #subscriptions = new Map<SThing, Array<{ property: { removeListener(listener: (change: PropertyChange<unknown>) => void): void }; listener: (change: PropertyChange<unknown>) => void }>>();

  constructor(onEvent?: (event: TransformationEvent) => void) { this.#onEvent = onEvent; }

  attach(entity: SThing): void {
    this.detach(entity);
    const subscriptions: Array<{ property: { removeListener(listener: (change: PropertyChange<unknown>) => void): void }; listener: (change: PropertyChange<unknown>) => void }> = [];
    for (const propertyName of ["position", "orientation", "size"] as const) {
      const property = transformProperty<unknown>(entity, propertyName);
      if (!property) continue;
      const listener = (change: PropertyChange<unknown>): void => {
        const event: TransformationEvent = {
          type: "transformation",
          entity,
          property: propertyName,
          previousValue: cloneTransformValue(change.previousValue as Position | Orientation | Size),
          value: cloneTransformValue(change.value as Position | Orientation | Size),
        };
        this.events.push(event);
        this.#onEvent?.(event);
      };
      property.addListener(listener);
      subscriptions.push({ property, listener });
    }
    if (subscriptions.length > 0) this.#subscriptions.set(entity, subscriptions);
  }

  detach(entity: SThing): void {
    const subscriptions = this.#subscriptions.get(entity);
    if (!subscriptions) return;
    for (const { property, listener } of subscriptions) {
      property.removeListener(listener);
    }
    this.#subscriptions.delete(entity);
  }
}

abstract class ViewListenerBase {
  readonly events: ViewEvent[] = [];
  protected readonly visible = new Set<string>();
  constructor(protected readonly onEvent?: (event: ViewEvent) => void) {}
}

export class ViewEnterListener extends ViewListenerBase {
  update(camera: SCamera, targets: readonly SThing[]): ViewEvent[] {
    const currentVisible = new Set<string>();
    const events: ViewEvent[] = [];
    for (const target of targets) {
      if (!visibilityQuery.visibleFrom(camera, target)) continue;
      const key = entityKey(target);
      currentVisible.add(key);
      if (this.visible.has(key)) continue;
      const event: ViewEvent = { type: "view-enter", camera, target };
      this.events.push(event); this.onEvent?.(event); events.push(event);
    }
    this.visible.clear();
    currentVisible.forEach((key) => this.visible.add(key));
    return events;
  }
}

export class ViewExitListener extends ViewListenerBase {
  update(camera: SCamera, targets: readonly SThing[]): ViewEvent[] {
    const currentVisible = new Set<string>();
    for (const target of targets) {
      if (visibilityQuery.visibleFrom(camera, target)) {
        currentVisible.add(entityKey(target));
      }
    }
    const events: ViewEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      if (!this.visible.has(key) || currentVisible.has(key)) continue;
      const event: ViewEvent = { type: "view-exit", camera, target };
      this.events.push(event); this.onEvent?.(event); events.push(event);
    }
    this.visible.clear();
    currentVisible.forEach((key) => this.visible.add(key));
    return events;
  }
}

export class WhileInViewListener extends ViewListenerBase {
  update(camera: SCamera, targets: readonly SThing[]): ViewEvent[] {
    const currentVisible = new Set<string>();
    for (const target of targets) {
      if (visibilityQuery.visibleFrom(camera, target)) {
        currentVisible.add(entityKey(target));
      }
    }
    const events: ViewEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      if (this.visible.has(key) && currentVisible.has(key)) {
        const event: ViewEvent = { type: "while-in-view", camera, target };
        this.events.push(event); this.onEvent?.(event); events.push(event);
      }
    }
    this.visible.clear();
    currentVisible.forEach((key) => this.visible.add(key));
    return events;
  }
}

export class OcclusionStartListener {
  readonly events: OcclusionEvent[] = [];
  readonly #occluded = new Map<string, SThing | null>();
  readonly #onEvent?: (event: OcclusionEvent) => void;

  constructor(onEvent?: (event: OcclusionEvent) => void) { this.#onEvent = onEvent; }

  update(camera: SCamera, targets: readonly SThing[], occluders: readonly SThing[]): OcclusionEvent[] {
    const events: OcclusionEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      const previous = this.#occluded.get(key) ?? null;
      const current = findOccluder(camera, target, occluders);
      if (!previous && current) {
        const event: OcclusionEvent = { type: "occlusion-start", camera, target, occluder: current };
        this.events.push(event); this.#onEvent?.(event); events.push(event);
      }
      this.#occluded.set(key, current);
    }
    return events;
  }
}

export class OcclusionEndListener {
  readonly events: OcclusionEvent[] = [];
  readonly #occluded = new Map<string, SThing | null>();
  readonly #onEvent?: (event: OcclusionEvent) => void;

  constructor(onEvent?: (event: OcclusionEvent) => void) { this.#onEvent = onEvent; }

  update(camera: SCamera, targets: readonly SThing[], occluders: readonly SThing[]): OcclusionEvent[] {
    const events: OcclusionEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      const previous = this.#occluded.get(key) ?? null;
      const current = findOccluder(camera, target, occluders);
      if (previous && !current) {
        const event: OcclusionEvent = { type: "occlusion-end", camera, target, occluder: null };
        this.events.push(event); this.#onEvent?.(event); events.push(event);
      }
      this.#occluded.set(key, current);
    }
    return events;
  }
}

export class WhileOcclusionListener {
  readonly events: OcclusionEvent[] = [];
  readonly #occluded = new Map<string, SThing | null>();
  readonly #onEvent?: (event: OcclusionEvent) => void;

  constructor(onEvent?: (event: OcclusionEvent) => void) { this.#onEvent = onEvent; }

  update(camera: SCamera, targets: readonly SThing[], occluders: readonly SThing[]): OcclusionEvent[] {
    const events: OcclusionEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      const previous = this.#occluded.get(key) ?? null;
      const current = findOccluder(camera, target, occluders);
      if (previous && current) {
        const event: OcclusionEvent = { type: "while-occlusion", camera, target, occluder: current };
        this.events.push(event); this.#onEvent?.(event); events.push(event);
      }
      this.#occluded.set(key, current);
    }
    return events;
  }
}
