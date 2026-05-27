import {
  DEFAULT_STYLE,
  PropertyAnimation as CorePropertyAnimation,
  lerpScalar,
  lerpSize,
  lerpVec3,
  nlerp,
  type AnimationObserver,
  type AnimationStyleLike,
} from "./animation";
import {
  Property as BaseProperty,
  PropertyOwnerImp,
  type BindingSyncDirection,
  type PropertyChange,
  type PropertyListener,
  type PropertyOptions,
} from "./story-api/expanded-implementation";
import {
  cloneBoundingBox,
  cloneOrientation,
  clonePosition,
  cloneSize,
  isBoundingBox,
  isOrientation,
  isPosition,
  isSize,
  positionsEqual,
  orientationsEqual,
  sizesEqual,
  type BoundingBox,
  type Orientation,
  type Position,
  type Size,
} from "./story-api/expanded-types";

export type {
  BindingSyncDirection,
  PropertyChange,
  PropertyListener,
  PropertyOptions,
};

function interpolateKnownValue<T>(from: T, to: T, portion: number): T {
  if (typeof from === "number" && typeof to === "number") {
    return lerpScalar(from, to, portion) as T;
  }
  if (isPosition(from) && isPosition(to)) {
    return lerpVec3(from, to, portion) as T;
  }
  if (isOrientation(from) && isOrientation(to)) {
    return nlerp(from, to, portion) as T;
  }
  if (isSize(from) && isSize(to)) {
    return lerpSize(from, to, portion) as T;
  }
  if (isBoundingBox(from) && isBoundingBox(to)) {
    return {
      min: lerpVec3(from.min, to.min, portion),
      max: lerpVec3(from.max, to.max, portion),
    } as T;
  }
  return (portion < 1 ? from : to) as T;
}

function cloneKnownValue<T>(value: T): T {
  if (isPosition(value)) {
    return clonePosition(value) as T;
  }
  if (isOrientation(value)) {
    return cloneOrientation(value) as T;
  }
  if (isSize(value)) {
    return cloneSize(value) as T;
  }
  if (isBoundingBox(value)) {
    return cloneBoundingBox(value) as T;
  }
  if (Array.isArray(value)) {
    return [...value] as T;
  }
  if (value && typeof value === "object") {
    return { ...(value as Record<string, unknown>) } as T;
  }
  return value;
}

function valuesEqual<T>(left: T, right: T): boolean {
  if (left === right) {
    return true;
  }
  if (isPosition(left) && isPosition(right)) {
    return positionsEqual(left, right);
  }
  if (isOrientation(left) && isOrientation(right)) {
    return orientationsEqual(left, right);
  }
  if (isSize(left) && isSize(right)) {
    return sizesEqual(left, right);
  }
  if (isBoundingBox(left) && isBoundingBox(right)) {
    return positionsEqual(left.min, right.min) && positionsEqual(left.max, right.max);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

export class Property<T> extends BaseProperty<T> {}

export class PropertyOwner extends PropertyOwnerImp {
  readonly #properties = new Map<string, Property<unknown>>();

  registerProperty<T>(property: Property<T>): Property<T> {
    if (this.#properties.has(property.name)) {
      throw new TypeError(`property \"${property.name}\" already exists`);
    }
    this.#properties.set(property.name, property as Property<unknown>);
    return property;
  }

  createProperty<T>(name: string, initialValue: T, options: PropertyOptions<T> = {}): Property<T> {
    return this.registerProperty(new Property<T>(this, name, initialValue, options));
  }

  get properties(): ReadonlyMap<string, Property<unknown>> {
    return this.#properties;
  }

  getProperty<T>(name: string): Property<T> | undefined {
    return this.#properties.get(name) as Property<T> | undefined;
  }

  listPropertyNames(): string[] {
    return [...this.#properties.keys()].sort((left, right) => left.localeCompare(right));
  }
}

export interface PropertyAnimationConfig<T> {
  readonly property: Property<T>;
  readonly from?: T;
  readonly to: T;
  readonly durationMs: number;
  readonly easing?: AnimationStyleLike;
  readonly interpolate?: (from: T, to: T, portion: number) => T;
  readonly observer?: AnimationObserver;
}

export class PropertyAnimation<T> {
  readonly #clip: CorePropertyAnimation<T>;

  constructor(config: PropertyAnimationConfig<T>) {
    const from = config.from ?? config.property.value;
    this.#clip = new CorePropertyAnimation<T>({
      from,
      to: config.to,
      durationMs: config.durationMs,
      easing: config.easing ?? DEFAULT_STYLE,
      interpolate: config.interpolate ?? interpolateKnownValue,
      setValue: (value) => {
        config.property.setValue(value);
      },
      observer: config.observer,
    });
  }

  get clip(): CorePropertyAnimation<T> {
    return this.#clip;
  }

  get value(): T {
    return this.#clip.value;
  }

  get elapsedMs(): number {
    return this.#clip.elapsedMs;
  }

  get durationMs(): number {
    return this.#clip.durationMs;
  }

  get progress(): number {
    return this.#clip.progress;
  }

  get complete(): boolean {
    return this.#clip.complete;
  }

  get isComplete(): boolean {
    return this.#clip.isComplete;
  }

  update(deltaMs: number) {
    return this.#clip.update(deltaMs);
  }

  reset(): void {
    this.#clip.reset();
  }
}

export class PropertyBinding<T> {
  #connected = false;

  constructor(
    readonly left: Property<T>,
    readonly right: Property<T>,
    readonly initialSync: BindingSyncDirection = "self",
  ) {
    this.connect();
  }

  get isConnected(): boolean {
    return this.#connected && this.left.isBoundTo(this.right) && this.right.isBoundTo(this.left);
  }

  connect(): void {
    if (this.#connected) {
      return;
    }
    this.left.bindBidirectional(this.right, this.initialSync);
    this.#connected = true;
  }

  disconnect(): void {
    if (!this.#connected) {
      return;
    }
    this.left.unbindBidirectional(this.right);
    this.#connected = false;
  }
}

export interface ComputedPropertyOptions<T> extends PropertyOptions<T> {
  readonly owner?: PropertyOwner;
}

export class ComputedProperty<T> extends Property<T> {
  readonly #dependencies: readonly Property<any>[];
  readonly #compute: () => T;
  readonly #dependencyListeners = new Map<Property<any>, PropertyListener<any>>();

  constructor(
    name: string,
    dependencies: readonly Property<any>[],
    compute: () => T,
    options: ComputedPropertyOptions<T> = {},
  ) {
    const owner = options.owner ?? new PropertyOwner();
    super(owner, name, compute(), options);
    this.#dependencies = [...dependencies];
    this.#compute = compute;
    for (const dependency of this.#dependencies) {
      const listener: PropertyListener<unknown> = () => {
        super.setValue(this.#compute());
      };
      dependency.addListener(listener);
      this.#dependencyListeners.set(dependency, listener);
    }
  }

  get dependencies(): readonly Property<any>[] {
    return this.#dependencies;
  }

  recompute(): boolean {
    return super.setValue(this.#compute());
  }

  dispose(): void {
    for (const [dependency, listener] of this.#dependencyListeners) {
      dependency.removeListener(listener);
    }
    this.#dependencyListeners.clear();
  }

  override setValue(_nextValue: T): boolean {
    throw new TypeError("computed properties are read-only");
  }

  override setValueSilently(_nextValue: T): boolean {
    throw new TypeError("computed properties are read-only");
  }

  override animateValue(
    _nextValue: T,
    _duration = 0,
    _style: AnimationStyleLike = DEFAULT_STYLE,
    _observer?: AnimationObserver,
  ): null {
    throw new TypeError("computed properties cannot be animated directly");
  }
}

export type PropertySnapshotState = Record<string, unknown>;

export class PropertySnapshot {
  readonly #values = new Map<string, unknown>();

  constructor(readonly owner: PropertyOwner) {
    for (const [name, property] of owner.properties) {
      this.#values.set(name, cloneKnownValue(property.value));
    }
  }

  static capture(owner: PropertyOwner): PropertySnapshot {
    return new PropertySnapshot(owner);
  }

  static restore(owner: PropertyOwner, snapshot: PropertySnapshot | PropertySnapshotState): void {
    if (snapshot instanceof PropertySnapshot) {
      snapshot.restore(owner);
      return;
    }
    for (const [name, value] of Object.entries(snapshot)) {
      owner.getProperty<unknown>(name)?.setValue(cloneKnownValue(value));
    }
  }

  toJSON(): PropertySnapshotState {
    return Object.fromEntries([...this.#values.entries()].map(([name, value]) => [name, cloneKnownValue(value)]));
  }

  restore(owner: PropertyOwner = this.owner): void {
    for (const [name, value] of this.#values) {
      owner.getProperty<unknown>(name)?.setValue(cloneKnownValue(value));
    }
  }

  getValue<T>(name: string): T | undefined {
    const value = this.#values.get(name);
    return value === undefined ? undefined : cloneKnownValue(value) as T;
  }

  equals(other: PropertySnapshot): boolean {
    const left = this.toJSON();
    const right = other.toJSON();
    const names = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const name of names) {
      if (!valuesEqual(left[name], right[name])) {
        return false;
      }
    }
    return true;
  }
}
