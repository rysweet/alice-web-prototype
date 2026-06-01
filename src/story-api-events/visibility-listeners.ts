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

abstract class OcclusionListenerBase {
  readonly events: OcclusionEvent[] = [];
  private readonly occluded = new Map<string, SThing | null>();
  protected readonly onEventCb?: (event: OcclusionEvent) => void;

  constructor(onEvent?: (event: OcclusionEvent) => void) { this.onEventCb = onEvent; }

  protected abstract check(
    previous: SThing | null, current: SThing | null,
    camera: SCamera, target: SThing,
  ): OcclusionEvent[];

  update(camera: SCamera, targets: readonly SThing[], occluders: readonly SThing[]): OcclusionEvent[] {
    const events: OcclusionEvent[] = [];
    for (const target of targets) {
      const key = entityKey(target);
      const previous = this.occluded.get(key) ?? null;
      const current = findOccluder(camera, target, occluders);
      for (const event of this.check(previous, current, camera, target)) {
        this.events.push(event); this.onEventCb?.(event); events.push(event);
      }
      this.occluded.set(key, current);
    }
    return events;
  }
}

export class OcclusionListener extends OcclusionListenerBase {
  protected check(previous: SThing | null, current: SThing | null, camera: SCamera, target: SThing): OcclusionEvent[] {
    if (!previous && current) return [{ type: "occluded", camera, target, occluder: current }];
    if (previous && !current) return [{ type: "revealed", camera, target, occluder: null }];
    return [];
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
  protected visible = new Set<string>();
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
    this.visible = currentVisible;
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
    this.visible = currentVisible;
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
    this.visible = currentVisible;
    return events;
  }
}

export class OcclusionStartListener extends OcclusionListenerBase {
  protected check(previous: SThing | null, current: SThing | null, camera: SCamera, target: SThing): OcclusionEvent[] {
    if (!previous && current) return [{ type: "occlusion-start", camera, target, occluder: current }];
    return [];
  }
}

export class OcclusionEndListener extends OcclusionListenerBase {
  protected check(previous: SThing | null, current: SThing | null, camera: SCamera, target: SThing): OcclusionEvent[] {
    if (previous && !current) return [{ type: "occlusion-end", camera, target, occluder: null }];
    return [];
  }
}

export class WhileOcclusionListener extends OcclusionListenerBase {
  protected check(previous: SThing | null, current: SThing | null, camera: SCamera, target: SThing): OcclusionEvent[] {
    if (previous && current) return [{ type: "while-occlusion", camera, target, occluder: current }];
    return [];
  }
}
