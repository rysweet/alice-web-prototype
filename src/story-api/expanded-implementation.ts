import {
  IDENTITY_ORIENTATION,
  UNIT_SCALE,
  UNIT_SIZE,
  ZERO_POSITION,
  addVec3,
  cloneOrientation,
  clonePosition,
  cloneSize,
  distanceBetween,
  interpolateNumber,
  interpolatePosition,
  interpolateSize,
  isFiniteOrientation,
  isFinitePosition,
  isFiniteSize,
  magnitudeVec3,
  normalizeQuaternion,
  normalizeVec3,
  orientationFromLookDirection,
  quaternionConjugate,
  quaternionFromAxisAngle,
  quaternionMultiply,
  relationOffset,
  rotateVector,
  sameOrientation,
  samePosition,
  sameSize,
  scaleVec3,
  subtractVec3,
  vectorFromMoveDirection,
} from "./expanded-math";
import type {
  BoundingBox,
  JointId,
  JointNode,
  MoveDirection,
  Orientation,
  Position,
  RollDirection,
  Size,
  SpatialRelation,
  SpeechBubbleState,
  TurnDirection,
  Vec3,
} from "./expanded-types";

export interface ImplementableEntity {
  readonly imp: EntityImp;
}

export interface SceneLifecycleHost {
  readonly isActive: boolean;
  readonly program: ProgramImp | null;
}

export interface SceneActivationController extends SceneLifecycleHost {
  activate(): void;
  deactivate(): void;
  bindProgram(program: ProgramImp | null): void;
}

export interface EntityMarker {
  readonly position?: Position;
  readonly orientation?: Orientation;
  readonly size?: Size;
  readonly scale?: Size;
  readonly paint?: string;
  readonly color?: string;
  readonly opacity?: number;
}

export interface PropertyChange<T> {
  readonly property: Property<T>;
  readonly previousValue: T;
  readonly value: T;
}

export type PropertyListener<T> = (change: PropertyChange<T>) => void;
export type ActivationListener = (imp: EntityImp, isActive: boolean) => void;
export type BindingSyncDirection = "self" | "other" | "none";
export type SceneActivationListener = (isActive: boolean, activationCount: number) => void;

export interface PropertyOptions<T> {
  validate?: (value: T) => boolean;
  clone?: (value: T) => T;
  equals?: (left: T, right: T) => boolean;
  interpolate?: (left: T, right: T, portion: number) => T;
}

const identityClone = <T>(value: T): T => value;
const nonEmptyString = (value: string): boolean => typeof value === "string" && value.trim().length > 0;

export abstract class PropertyOwnerImp {
  get program(): ProgramImp | null {
    return null;
  }

  protected adjustDurationIfNecessary(duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) {
      return 0;
    }
    const simulationSpeedFactor = this.program?.simulationSpeedFactor ?? Number.NaN;
    return Number.isFinite(simulationSpeedFactor) && simulationSpeedFactor > 0
      ? duration / simulationSpeedFactor
      : duration;
  }
}

export class Property<T> {
  readonly #listeners = new Set<PropertyListener<T>>();
  readonly #bindings = new Set<Property<T>>();
  readonly #validate: (value: T) => boolean;
  readonly #clone: (value: T) => T;
  readonly #equals: (left: T, right: T) => boolean;
  readonly #interpolate?: (left: T, right: T, portion: number) => T;
  #value: T;

  constructor(
    readonly owner: PropertyOwnerImp,
    readonly name: string,
    initialValue: T,
    options: PropertyOptions<T> = {},
  ) {
    this.#validate = options.validate ?? (() => true);
    this.#clone = options.clone ?? identityClone;
    this.#equals = options.equals ?? Object.is;
    this.#interpolate = options.interpolate;
    this.#value = this.#clone(initialValue);
  }

  get value(): T {
    return this.#clone(this.#value);
  }

  set value(nextValue: T) {
    this.setValue(nextValue);
  }

  addListener(listener: PropertyListener<T>): void {
    this.#listeners.add(listener);
  }

  removeListener(listener: PropertyListener<T>): void {
    this.#listeners.delete(listener);
  }

  isBoundTo(other: Property<T>): boolean {
    return this.#bindings.has(other);
  }

  bindBidirectional(other: Property<T>, initialSync: BindingSyncDirection = "self"): void {
    if (other === this || this.#bindings.has(other)) {
      return;
    }
    this.#bindings.add(other);
    other.#bindings.add(this);
    if (initialSync === "self") {
      other.#commit(this.#clone(this.#value), true, new Set([this]));
    } else if (initialSync === "other") {
      this.#commit(other.value, true, new Set([other]));
    }
  }

  unbindBidirectional(other: Property<T>): void {
    this.#bindings.delete(other);
    other.#bindings.delete(this);
  }

  animateValue(nextValue: T, duration = 0): boolean {
    const adjustedDuration = this.owner.adjustDurationIfNecessary(duration);
    if (adjustedDuration <= 0 || !this.#interpolate) {
      return this.setValue(nextValue);
    }
    return this.setValue(this.#interpolate(this.value, nextValue, 1));
  }

  setValue(nextValue: T): boolean {
    return this.#commit(nextValue, true, new Set());
  }

  setValueSilently(nextValue: T): boolean {
    return this.#commit(nextValue, false, new Set());
  }

  #commit(nextValue: T, notify: boolean, visited: Set<Property<unknown>>): boolean {
    if (visited.has(this)) {
      return false;
    }
    visited.add(this);

    if (!this.#validate(nextValue)) {
      return false;
    }

    const normalizedNextValue = this.#clone(nextValue);
    const previousValue = this.#clone(this.#value);
    const changed = !this.#equals(this.#value, normalizedNextValue);

    if (changed) {
      this.#value = normalizedNextValue;
      if (notify) {
        const change: PropertyChange<T> = {
          property: this,
          previousValue,
          value: this.#clone(normalizedNextValue),
        };
        for (const listener of this.#listeners) {
          listener(change);
        }
      }
    }

    let propagated = false;
    for (const binding of this.#bindings) {
      propagated = binding.#commit(this.#clone(normalizedNextValue), notify, visited) || propagated;
    }

    return changed || propagated;
  }
}

export class BooleanProperty extends Property<boolean> {
  constructor(owner: PropertyOwnerImp, name: string, initialValue = false) {
    super(owner, name, initialValue, { validate: (value) => typeof value === "boolean" });
  }
}

export class NumberProperty extends Property<number> {
  readonly #min: number | null;
  readonly #max: number | null;

  constructor(
    owner: PropertyOwnerImp,
    name: string,
    initialValue: number,
    bounds: { min?: number; max?: number } = {},
  ) {
    super(owner, name, initialValue, {
      validate: Number.isFinite,
      interpolate: interpolateNumber,
    });
    this.#min = Number.isFinite(bounds.min) ? bounds.min! : null;
    this.#max = Number.isFinite(bounds.max) ? bounds.max! : null;
  }

  override setValue(nextValue: number): boolean {
    return super.setValue(this.#clamp(nextValue));
  }

  override setValueSilently(nextValue: number): boolean {
    return super.setValueSilently(this.#clamp(nextValue));
  }

  override animateValue(nextValue: number, duration = 0): boolean {
    return super.animateValue(this.#clamp(nextValue), duration);
  }

  #clamp(value: number): number {
    let nextValue = value;
    if (this.#min !== null) {
      nextValue = Math.max(this.#min, nextValue);
    }
    if (this.#max !== null) {
      nextValue = Math.min(this.#max, nextValue);
    }
    return nextValue;
  }
}

export class StringProperty<T extends string | null = string> extends Property<T> {
  constructor(owner: PropertyOwnerImp, name: string, initialValue: T, allowNull = false) {
    super(owner, name, initialValue, {
      validate: (value) => (allowNull && value === null) || typeof value === "string",
    });
  }
}

export class PositionProperty extends Property<Position> {
  constructor(owner: PropertyOwnerImp, name: string, initialValue = ZERO_POSITION) {
    super(owner, name, initialValue, {
      validate: isFinitePosition,
      clone: clonePosition,
      equals: samePosition,
      interpolate: interpolatePosition,
    });
  }
}

export class OrientationProperty extends Property<Orientation> {
  constructor(owner: PropertyOwnerImp, name: string, initialValue = IDENTITY_ORIENTATION) {
    super(owner, name, initialValue, {
      validate: isFiniteOrientation,
      clone: cloneOrientation,
      equals: sameOrientation,
      interpolate: (left, right, portion) => normalizeQuaternion({
        x: interpolateNumber(left.x, right.x, portion),
        y: interpolateNumber(left.y, right.y, portion),
        z: interpolateNumber(left.z, right.z, portion),
        w: interpolateNumber(left.w, right.w, portion),
      }),
    });
  }
}

export class SizeProperty extends Property<Size> {
  constructor(owner: PropertyOwnerImp, name: string, initialValue = UNIT_SIZE) {
    super(owner, name, initialValue, {
      validate: isFiniteSize,
      clone: cloneSize,
      equals: sameSize,
      interpolate: interpolateSize,
    });
  }
}

export class ReferenceProperty<T> extends Property<T> {
  constructor(owner: PropertyOwnerImp, name: string, initialValue: T) {
    super(owner, name, initialValue, {
      clone: identityClone,
      equals: (left, right) => left === right,
    });
  }
}

export class EntityImp extends PropertyOwnerImp {
  readonly #properties = new Map<string, Property<unknown>>();
  readonly #activationListeners = new Set<ActivationListener>();
  readonly #children = new Set<EntityImp>();
  #scene: SceneLifecycleHost | null = null;
  #vehicle: EntityImp | null = null;
  #isActive = false;

  readonly nameProperty = this.registerProperty(new StringProperty<string | null>(this, "name", null, true));
  readonly isShowingProperty = this.registerProperty(new BooleanProperty(this, "isShowing", true));
  readonly vehicleProperty = this.registerProperty(new ReferenceProperty<EntityImp | null>(this, "vehicle", null));

  constructor(readonly owner: ImplementableEntity) {
    super();
  }

  protected registerProperty<T>(property: Property<T>): Property<T> {
    if (this.#properties.has(property.name)) {
      throw new TypeError(`property "${property.name}" already exists`);
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

  get scene(): SceneLifecycleHost | null {
    return this.#scene ?? this.#vehicle?.scene ?? null;
  }

  override get program(): ProgramImp | null {
    return this.scene?.program ?? this.#vehicle?.program ?? null;
  }

  get isActive(): boolean {
    return this.#isActive;
  }

  get vehicle(): EntityImp | null {
    return this.#vehicle;
  }

  get name(): string | null {
    return this.nameProperty.value;
  }

  set name(value: string | null) {
    if (value === null || nonEmptyString(value)) {
      this.nameProperty.setValue(value);
    }
  }

  addActivationListener(listener: ActivationListener): void {
    this.#activationListeners.add(listener);
  }

  removeActivationListener(listener: ActivationListener): void {
    this.#activationListeners.delete(listener);
  }

  bindProperty<T>(name: string, other: EntityImp, otherName: string, initialSync: BindingSyncDirection = "self"): boolean {
    const property = this.getProperty<T>(name);
    const otherProperty = other.getProperty<T>(otherName);
    if (!property || !otherProperty) {
      return false;
    }
    property.bindBidirectional(otherProperty, initialSync);
    return true;
  }

  unbindProperty<T>(name: string, other: EntityImp, otherName: string): boolean {
    const property = this.getProperty<T>(name);
    const otherProperty = other.getProperty<T>(otherName);
    if (!property || !otherProperty) {
      return false;
    }
    property.unbindBidirectional(otherProperty);
    return true;
  }

  attachToScene(scene: SceneLifecycleHost): void {
    this.#scene = scene;
    if (scene.isActive) {
      this.activate();
    }
  }

  detachFromScene(): void {
    this.deactivate();
    this.#scene = null;
  }

  activate(): void {
    if (this.#isActive) {
      return;
    }
    this.#isActive = true;
    this.#fireActivationChanged();
    for (const child of this.#children) {
      child.activate();
    }
  }

  deactivate(): void {
    if (!this.#isActive) {
      return;
    }
    for (const child of this.#children) {
      child.deactivate();
    }
    this.#isActive = false;
    this.#fireActivationChanged();
  }

  setVehicle(vehicle: EntityImp | null): void {
    if (vehicle === this) {
      throw new TypeError("entity cannot be its own vehicle");
    }
    if (vehicle && vehicle.isDescendantOf(this)) {
      throw new TypeError("vehicle assignment would create a cycle");
    }
    if (this.#vehicle === vehicle) {
      return;
    }

    if (this.#vehicle) {
      this.#vehicle.#children.delete(this);
    }
    this.#vehicle = vehicle;
    this.vehicleProperty.setValueSilently(vehicle);
    if (vehicle) {
      vehicle.#children.add(this);
    }

    if (vehicle?.scene) {
      this.#scene = vehicle.scene;
    }

    const shouldBeActive = Boolean(vehicle?.isActive || this.#scene?.isActive);
    if (shouldBeActive) {
      this.activate();
    } else {
      this.deactivate();
    }
  }

  isDescendantOf(candidateAncestor: EntityImp): boolean {
    let current = this.#vehicle;
    while (current) {
      if (current === candidateAncestor) {
        return true;
      }
      current = current.#vehicle;
    }
    return false;
  }

  getAbsolutePosition(): Position {
    const localPosition = this.getProperty<Position>("position")?.value ?? ZERO_POSITION;
    if (!this.#vehicle) {
      return localPosition;
    }
    return addVec3(this.#vehicle.getAbsolutePosition(), localPosition);
  }

  getAbsoluteOrientation(): Orientation {
    const localOrientation = this.getProperty<Orientation>("orientation")?.value ?? IDENTITY_ORIENTATION;
    if (!this.#vehicle) {
      return localOrientation;
    }
    return quaternionMultiply(this.#vehicle.getAbsoluteOrientation(), localOrientation);
  }

  setAbsolutePosition(position: Position): boolean {
    const base = this.#vehicle?.getAbsolutePosition() ?? ZERO_POSITION;
    return this.getProperty<Position>("position")?.setValue(subtractVec3(position, base)) ?? false;
  }

  setAbsoluteOrientation(orientation: Orientation): boolean {
    const parentOrientation = this.#vehicle?.getAbsoluteOrientation();
    const localOrientation = parentOrientation
      ? quaternionMultiply(quaternionConjugate(parentOrientation), orientation)
      : orientation;
    return this.getProperty<Orientation>("orientation")?.setValue(localOrientation) ?? false;
  }

  getBoundingBox(): BoundingBox | null {
    const size = this.getProperty<Size>("size")?.value;
    if (!size) {
      return null;
    }
    const center = this.getAbsolutePosition();
    return {
      min: {
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
        z: center.z - size.depth / 2,
      },
      max: {
        x: center.x + size.width / 2,
        y: center.y + size.height / 2,
        z: center.z + size.depth / 2,
      },
    };
  }

  isCollidingWith(other: EntityImp): boolean {
    const left = this.getBoundingBox();
    const right = other.getBoundingBox();
    if (!left || !right) {
      return false;
    }
    return !(
      left.max.x < right.min.x ||
      left.min.x > right.max.x ||
      left.max.y < right.min.y ||
      left.min.y > right.max.y ||
      left.max.z < right.min.z ||
      left.min.z > right.max.z
    );
  }

  getDistanceTo(other: EntityImp): number {
    return distanceBetween(this.getAbsolutePosition(), other.getAbsolutePosition());
  }

  getDistanceAbove(other: EntityImp): number {
    return this.getAbsolutePosition().y - other.getAbsolutePosition().y;
  }

  getDistanceBelow(other: EntityImp): number {
    return other.getAbsolutePosition().y - this.getAbsolutePosition().y;
  }

  getDistanceToTheRightOf(other: EntityImp): number {
    return this.getAbsolutePosition().x - other.getAbsolutePosition().x;
  }

  getDistanceToTheLeftOf(other: EntityImp): number {
    return other.getAbsolutePosition().x - this.getAbsolutePosition().x;
  }

  getDistanceInFrontOf(other: EntityImp): number {
    return other.getAbsolutePosition().z - this.getAbsolutePosition().z;
  }

  getDistanceBehind(other: EntityImp): number {
    return this.getAbsolutePosition().z - other.getAbsolutePosition().z;
  }

  createMarker(): EntityMarker {
    const position = this.getProperty<Position>("position")?.value;
    const orientation = this.getProperty<Orientation>("orientation")?.value;
    const size = this.getProperty<Size>("size")?.value;
    const scale = this.getProperty<Size>("scale")?.value;
    const paint = this.getProperty<string>("paint")?.value;
    const color = this.getProperty<string>("color")?.value;
    const opacity = this.getProperty<number>("opacity")?.value;
    return {
      ...(position ? { position } : {}),
      ...(orientation ? { orientation } : {}),
      ...(size ? { size } : {}),
      ...(scale ? { scale } : {}),
      ...(paint ? { paint } : {}),
      ...(color ? { color } : {}),
      ...(opacity !== undefined ? { opacity } : {}),
    };
  }

  applyMarker(marker: EntityMarker): void {
    if (marker.position) {
      this.getProperty<Position>("position")?.setValue(marker.position);
    }
    if (marker.orientation) {
      this.getProperty<Orientation>("orientation")?.setValue(marker.orientation);
    }
    if (marker.size) {
      this.getProperty<Size>("size")?.setValue(marker.size);
    }
    if (marker.scale) {
      this.getProperty<Size>("scale")?.setValue(marker.scale);
    }
    if (marker.paint) {
      this.getProperty<string>("paint")?.setValue(marker.paint);
    }
    if (marker.color) {
      this.getProperty<string>("color")?.setValue(marker.color);
    }
    if (marker.opacity !== undefined) {
      this.getProperty<number>("opacity")?.setValue(marker.opacity);
    }
  }

  delay(duration: number): void {
    if (!Number.isFinite(duration) || duration < 0) {
      throw new TypeError("duration must be a non-negative finite number");
    }
  }

  playAudio(audioSource: string): void {
    if (!nonEmptyString(audioSource)) {
      throw new TypeError("audio source must be a non-empty string");
    }
    const property = this.getProperty<string>("lastAudioSource") ?? this.createProperty<string>("lastAudioSource", audioSource);
    property.setValue(audioSource);
  }

  getBooleanFromUser(_message: string): boolean {
    return false;
  }

  getStringFromUser(_message: string): string {
    return "";
  }

  getDoubleFromUser(_message: string): number {
    return 0;
  }

  getIntegerFromUser(_message: string): number {
    return 0;
  }

  #fireActivationChanged(): void {
    for (const listener of this.#activationListeners) {
      listener(this, this.#isActive);
    }
  }
}

export class TransformableImp extends EntityImp {
  readonly position = this.registerProperty(new PositionProperty(this, "position", ZERO_POSITION));
  readonly orientation = this.registerProperty(new OrientationProperty(this, "orientation", IDENTITY_ORIENTATION));
  readonly paint = this.registerProperty(new StringProperty(this, "paint", "WHITE"));

  move(direction: MoveDirection | Vec3, amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const offset = scaleVec3(vectorFromMoveDirection(direction), amount);
    this.position.setValue(addVec3(this.position.value, offset));
  }

  moveToward(target: EntityImp, amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const delta = subtractVec3(target.getAbsolutePosition(), this.getAbsolutePosition());
    const movement = scaleVec3(normalizeVec3(delta), amount);
    this.setAbsolutePosition(addVec3(this.getAbsolutePosition(), movement));
  }

  moveAwayFrom(target: EntityImp, amount: number): void {
    this.moveToward(target, -amount);
  }

  moveTo(target: EntityImp): void {
    this.setAbsolutePosition(target.getAbsolutePosition());
  }

  moveAndOrientTo(target: EntityImp): void {
    this.moveTo(target);
    this.setAbsoluteOrientation(target.getAbsoluteOrientation());
  }

  place(relation: SpatialRelation, target: EntityImp, offset = 0): void {
    const targetPosition = target.getAbsolutePosition();
    const targetSize = target.getProperty<Size>("size")?.value ?? UNIT_SIZE;
    const selfSize = this.getProperty<Size>("size")?.value ?? UNIT_SIZE;
    const relationDistance = (() => {
      switch (relation) {
        case "ABOVE":
        case "BELOW":
          return (targetSize.height + selfSize.height) / 2 + offset;
        case "LEFT_OF":
        case "RIGHT_OF":
          return (targetSize.width + selfSize.width) / 2 + offset;
        case "IN_FRONT_OF":
        case "BEHIND":
          return (targetSize.depth + selfSize.depth) / 2 + offset;
      }
    })();
    this.setAbsolutePosition(addVec3(targetPosition, relationOffset(relation, relationDistance)));
  }

  turn(direction: TurnDirection, amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const signed = direction === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 1, 0, signed);
    this.orientation.setValue(quaternionMultiply(delta, this.orientation.value));
  }

  roll(direction: RollDirection, amount: number): void {
    if (!Number.isFinite(amount)) {
      throw new TypeError("amount must be a finite number");
    }
    const signed = direction === "LEFT" ? amount : -amount;
    const delta = quaternionFromAxisAngle(0, 0, 1, signed);
    this.orientation.setValue(quaternionMultiply(delta, this.orientation.value));
  }

  orientTo(target: EntityImp): void {
    this.setAbsoluteOrientation(target.getAbsoluteOrientation());
  }

  orientToUpright(): void {
    const forward = rotateVector(this.getAbsoluteOrientation(), { x: 0, y: 0, z: -1 });
    const planarForward = { x: forward.x, y: 0, z: forward.z };
    this.setAbsoluteOrientation(orientationFromLookDirection(planarForward));
  }

  pointAt(target: EntityImp): void {
    const direction = subtractVec3(target.getAbsolutePosition(), this.getAbsolutePosition());
    this.setAbsoluteOrientation(orientationFromLookDirection(direction));
  }

  turnToFace(target: EntityImp): void {
    this.pointAt(target);
  }

  isFacing(target: EntityImp): boolean {
    const forward = rotateVector(this.getAbsoluteOrientation(), { x: 0, y: 0, z: -1 });
    const towardTarget = normalizeVec3(subtractVec3(target.getAbsolutePosition(), this.getAbsolutePosition()));
    return magnitudeVec3(towardTarget) === 0 || (forward.x * towardTarget.x + forward.y * towardTarget.y + forward.z * towardTarget.z) > 0;
  }
}

export class ModelImp extends TransformableImp {
  readonly size = this.registerProperty(new SizeProperty(this, "size", UNIT_SIZE));
  readonly scale = this.registerProperty(new SizeProperty(this, "scale", UNIT_SCALE));
  readonly color = this.registerProperty(new StringProperty(this, "color", "WHITE"));
  readonly opacity = this.registerProperty(new NumberProperty(this, "opacity", 1));
  readonly speechBubble = this.registerProperty(
    new Property<SpeechBubbleState | null>(this, "speechBubble", null, {
      clone: (value) => (value ? { ...value } : null),
      equals: (left, right) => JSON.stringify(left) === JSON.stringify(right),
    }),
  );
  readonly lastSpokenText = this.registerProperty(new StringProperty<string | null>(this, "lastSpokenText", null, true));
  readonly lastThoughtText = this.registerProperty(new StringProperty<string | null>(this, "lastThoughtText", null, true));

  constructor(owner: ImplementableEntity) {
    super(owner);
    this.paint.bindBidirectional(this.color, "self");
  }

  setWidth(width: number): void {
    if (!Number.isFinite(width) || width <= 0) {
      throw new TypeError("width must be a positive finite number");
    }
    const size = this.size.value;
    this.size.setValue({ ...size, width });
  }

  setHeight(height: number): void {
    if (!Number.isFinite(height) || height <= 0) {
      throw new TypeError("height must be a positive finite number");
    }
    const size = this.size.value;
    this.size.setValue({ ...size, height });
  }

  setDepth(depth: number): void {
    if (!Number.isFinite(depth) || depth <= 0) {
      throw new TypeError("depth must be a positive finite number");
    }
    const size = this.size.value;
    this.size.setValue({ ...size, depth });
  }

  setScale(scale: Size): void {
    this.scale.setValue(scale);
    this.size.setValue(scale);
  }

  resize(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) {
      throw new TypeError("factor must be a positive finite number");
    }
    const nextSize = {
      width: this.size.value.width * factor,
      height: this.size.value.height * factor,
      depth: this.size.value.depth * factor,
    };
    this.size.setValue(nextSize);
    this.scale.setValue({
      width: this.scale.value.width * factor,
      height: this.scale.value.height * factor,
      depth: this.scale.value.depth * factor,
    });
  }

  resizeWidth(factor: number): void {
    this.setWidth(this.size.value.width * factor);
  }

  resizeHeight(factor: number): void {
    this.setHeight(this.size.value.height * factor);
  }

  resizeDepth(factor: number): void {
    this.setDepth(this.size.value.depth * factor);
  }

  say(text: string, duration = 0): void {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    this.lastSpokenText.setValue(text);
    this.speechBubble.setValue({ kind: "say", text, duration });
  }

  think(text: string, duration = 0): void {
    if (typeof text !== "string") {
      throw new TypeError("text must be a string");
    }
    this.lastThoughtText.setValue(text);
    this.speechBubble.setValue({ kind: "think", text, duration });
  }
}

export class GroundImp extends EntityImp {
  readonly paint = this.registerProperty(new StringProperty(this, "paint", "GRASS"));
  readonly opacity = this.registerProperty(new NumberProperty(this, "opacity", 1));
}

export class MarkerImp extends TransformableImp {
  readonly size = this.registerProperty(new SizeProperty(this, "size", UNIT_SIZE));
  readonly color = this.registerProperty(new StringProperty(this, "color", "YELLOW"));
  readonly opacity = this.registerProperty(new NumberProperty(this, "opacity", 1));

  constructor(owner: ImplementableEntity) {
    super(owner);
    this.paint.setValueSilently("YELLOW");
    this.color.bindBidirectional(this.paint, "self");
  }
}

export class ObjectMarkerImp extends MarkerImp {}
export class CameraMarkerImp extends MarkerImp {}
export class TargetImp extends TransformableImp {}
export class SunImp extends TransformableImp {}

export class CameraImp extends TransformableImp {
  readonly nearClippingPlaneDistance = this.registerProperty(new NumberProperty(this, "nearClippingPlaneDistance", 0.1, { min: 0.0001 }));
  readonly farClippingPlaneDistance = this.registerProperty(new NumberProperty(this, "farClippingPlaneDistance", 1000, { min: 0.0001 }));
  readonly horizontalViewingAngle = this.registerProperty(new NumberProperty(this, "horizontalViewingAngle", Math.PI / 3, { min: 0.0001 }));
  readonly verticalViewingAngle = this.registerProperty(new NumberProperty(this, "verticalViewingAngle", Math.PI / 3, { min: 0.0001 }));

  moveAndOrientToAGoodVantagePointOf(target: EntityImp, distance = 8): void {
    const targetPosition = target.getAbsolutePosition();
    this.setAbsolutePosition({ x: targetPosition.x, y: targetPosition.y + distance / 4, z: targetPosition.z + distance });
    this.pointAt(target);
  }
}

export class SceneImp extends EntityImp {
  readonly atmosphereColor = this.registerProperty(new StringProperty<string | null>(this, "atmosphereColor", null, true));
  readonly fromAboveLightColor = this.registerProperty(new StringProperty<string | null>(this, "fromAboveLightColor", null, true));
  readonly fromBelowLightColor = this.registerProperty(new StringProperty<string | null>(this, "fromBelowLightColor", null, true));
  readonly fogDensity = this.registerProperty(new NumberProperty(this, "fogDensity", 0, { min: 0 }));
  readonly #sceneActivationListeners = new Set<SceneActivationListener>();
  #activationCount = 0;

  addSceneActivationListener(listener: SceneActivationListener): void {
    this.#sceneActivationListeners.add(listener);
  }

  removeSceneActivationListener(listener: SceneActivationListener): void {
    this.#sceneActivationListeners.delete(listener);
  }

  get activationCount(): number {
    return this.#activationCount;
  }

  override activate(): void {
    const wasActive = this.isActive;
    super.activate();
    if (!wasActive && this.isActive) {
      this.#activationCount += 1;
      this.#notifySceneActivation(true);
    }
  }

  override deactivate(): void {
    const wasActive = this.isActive;
    super.deactivate();
    if (wasActive && !this.isActive) {
      this.#notifySceneActivation(false);
    }
  }

  #notifySceneActivation(isActive: boolean): void {
    for (const listener of this.#sceneActivationListeners) {
      listener(isActive, this.#activationCount);
    }
  }
}

export class ProgramImp extends PropertyOwnerImp {
  readonly simulationSpeedFactorProperty = new NumberProperty(this, "simulationSpeedFactor", 1, { min: 0.0001 });
  #activeScene: SceneActivationController | null = null;

  override get program(): ProgramImp {
    return this;
  }

  get simulationSpeedFactor(): number {
    return this.simulationSpeedFactorProperty.value;
  }

  set simulationSpeedFactor(value: number) {
    this.simulationSpeedFactorProperty.setValue(value);
  }

  get activeScene(): SceneActivationController | null {
    return this.#activeScene;
  }

  setActiveScene(scene: SceneActivationController | null): void {
    if (this.#activeScene === scene) {
      return;
    }
    if (this.#activeScene) {
      this.#activeScene.deactivate();
      this.#activeScene.bindProgram(null);
    }
    this.#activeScene = scene;
    if (scene) {
      scene.bindProgram(this);
      scene.activate();
    }
  }
}

export class JointImp extends TransformableImp {
  readonly #jointId: JointId;
  readonly #originalTransform: { position: Position; orientation: Orientation };
  readonly size = this.registerProperty(new SizeProperty(this, "size", UNIT_SIZE));
  readonly pivotVisible = this.registerProperty(new BooleanProperty(this, "pivotVisible", false));

  constructor(owner: ImplementableEntity, jointId: JointId, localTransform: { position: Position; orientation: Orientation }) {
    super(owner);
    this.#jointId = { ...jointId };
    this.#originalTransform = {
      position: clonePosition(localTransform.position),
      orientation: cloneOrientation(localTransform.orientation),
    };
    this.position.setValue(localTransform.position);
    this.orientation.setValue(localTransform.orientation);
  }

  getJointId(): JointId {
    return { ...this.#jointId };
  }

  straighten(): void {
    this.position.setValue(this.#originalTransform.position);
    this.orientation.setValue(this.#originalTransform.orientation);
  }
}

export class JointedModelImp extends ModelImp {
  readonly #jointIds = new Map<string, JointId>();
  readonly #jointImps = new Map<string, JointImp>();
  #jointHierarchy: JointNode[] = [];

  constructor(owner: ImplementableEntity, jointHierarchy: JointNode[] = []) {
    super(owner);
    if (jointHierarchy.length > 0) {
      this.setJointHierarchy(jointHierarchy);
    }
  }

  setJointHierarchy(jointHierarchy: JointNode[]): void {
    this.#jointIds.clear();
    this.#jointImps.clear();
    this.#jointHierarchy = cloneJointHierarchy(jointHierarchy);

    const visit = (node: JointNode, parentImp: JointImp | null): void => {
      const jointId: JointId = node.parentName ? { name: node.name, parent: node.parentName } : { name: node.name };
      this.#jointIds.set(node.name.toUpperCase(), jointId);
      const jointImp = new JointImp(this.owner, jointId, node.localTransform);
      jointImp.setVehicle(parentImp ?? this);
      this.#jointImps.set(node.name.toUpperCase(), jointImp);
      for (const child of node.children) {
        visit(child, jointImp);
      }
    };

    for (const root of this.#jointHierarchy) {
      visit(root, null);
    }
  }

  getJoint(name: string): JointId | undefined {
    const joint = this.#jointIds.get(name.toUpperCase());
    return joint ? { ...joint } : undefined;
  }

  getJointImplementation(name: string): JointImp | undefined {
    return this.#jointImps.get(name.toUpperCase());
  }

  get jointHierarchy(): JointNode[] {
    return cloneJointHierarchy(this.#jointHierarchy);
  }

  getJoints(): JointImp[] {
    return [...this.#jointImps.values()];
  }

  straightenOutJoints(): void {
    for (const joint of this.#jointImps.values()) {
      joint.straighten();
    }
  }

  strikePose(pose: Record<string, Partial<{ position: Position; orientation: Orientation }>>): void {
    for (const [name, transform] of Object.entries(pose)) {
      const joint = this.getJointImplementation(name);
      if (!joint) {
        continue;
      }
      if (transform.position) {
        joint.position.setValue(transform.position);
      }
      if (transform.orientation) {
        joint.orientation.setValue(transform.orientation);
      }
    }
  }
}

export class ShapeImp extends ModelImp {}

export class SphereImp extends ShapeImp {
  readonly radius = this.registerProperty(new NumberProperty(this, "radius", 0.5, { min: 0 }));
  #synchronizing = false;

  constructor(owner: ImplementableEntity) {
    super(owner);
    this.radius.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      const diameter = value * 2;
      this.size.setValue({ width: diameter, height: diameter, depth: diameter });
      this.#synchronizing = false;
    });
    this.size.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      this.radius.setValueSilently((value.width + value.height + value.depth) / 6);
      this.#synchronizing = false;
    });
  }
}

export class DiscImp extends ShapeImp {
  readonly outerRadius = this.registerProperty(new NumberProperty(this, "outerRadius", 0.5, { min: 0 }));
  #synchronizing = false;

  constructor(owner: ImplementableEntity) {
    super(owner);
    this.outerRadius.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      this.size.setValue({ width: value * 2, height: this.size.value.height, depth: value * 2 });
      this.#synchronizing = false;
    });
    this.size.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      this.outerRadius.setValueSilently(Math.max(value.width, value.depth) / 2);
      this.#synchronizing = false;
    });
  }
}

export class BoxImp extends ShapeImp {}

export class ConeImp extends ShapeImp {
  readonly baseRadius = this.registerProperty(new NumberProperty(this, "baseRadius", 0.5, { min: 0 }));
  readonly length = this.registerProperty(new NumberProperty(this, "length", 1, { min: 0 }));
  #synchronizing = false;

  constructor(owner: ImplementableEntity) {
    super(owner);
    const syncFromProperties = (): void => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      const diameter = this.baseRadius.value * 2;
      this.size.setValue({ width: diameter, height: this.length.value, depth: diameter });
      this.#synchronizing = false;
    };
    this.baseRadius.addListener(syncFromProperties);
    this.length.addListener(syncFromProperties);
    this.size.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      this.baseRadius.setValueSilently(Math.max(value.width, value.depth) / 2);
      this.length.setValueSilently(value.height);
      this.#synchronizing = false;
    });
  }
}

export class CylinderImp extends ShapeImp {
  readonly radius = this.registerProperty(new NumberProperty(this, "radius", 0.5, { min: 0 }));
  readonly length = this.registerProperty(new NumberProperty(this, "length", 1, { min: 0 }));
  #synchronizing = false;

  constructor(owner: ImplementableEntity) {
    super(owner);
    const syncFromProperties = (): void => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      const diameter = this.radius.value * 2;
      this.size.setValue({ width: diameter, height: this.length.value, depth: diameter });
      this.#synchronizing = false;
    };
    this.radius.addListener(syncFromProperties);
    this.length.addListener(syncFromProperties);
    this.size.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      this.radius.setValueSilently(Math.max(value.width, value.depth) / 2);
      this.length.setValueSilently(value.height);
      this.#synchronizing = false;
    });
  }
}

export class TorusImp extends ShapeImp {
  readonly innerRadius = this.registerProperty(new NumberProperty(this, "innerRadius", 0.25, { min: 0 }));
  readonly outerRadius = this.registerProperty(new NumberProperty(this, "outerRadius", 0.5, { min: 0 }));
  #synchronizing = false;

  constructor(owner: ImplementableEntity) {
    super(owner);
    const syncFromProperties = (): void => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      const diameter = this.outerRadius.value * 2;
      this.size.setValue({ width: diameter, height: Math.max(this.innerRadius.value * 2, 0.1), depth: diameter });
      this.#synchronizing = false;
    };
    this.innerRadius.addListener(syncFromProperties);
    this.outerRadius.addListener(syncFromProperties);
    this.size.addListener(({ value }) => {
      if (this.#synchronizing) return;
      this.#synchronizing = true;
      this.outerRadius.setValueSilently(Math.max(value.width, value.depth) / 2);
      this.#synchronizing = false;
    });
  }
}

export class BillboardImp extends ShapeImp {
  readonly backPaint = this.registerProperty(new StringProperty(this, "backPaint", "WHITE"));
}

export class AxesImp extends ShapeImp {}

export class TextModelImp extends ModelImp {
  readonly valueProperty = this.registerProperty(new StringProperty(this, "value", ""));

  get value(): string {
    return this.valueProperty.value;
  }

  set value(nextValue: string) {
    this.valueProperty.setValue(nextValue);
  }

  append(value: unknown): void {
    this.value = `${this.value}${String(value)}`;
  }

  charAt(index: number): string {
    return this.value.charAt(index);
  }

  delete(start: number, end: number): void {
    this.value = `${this.value.slice(0, start)}${this.value.slice(end)}`;
  }

  deleteCharAt(index: number): void {
    this.delete(index, index + 1);
  }

  indexOf(value: string, fromIndex?: number): number {
    return this.value.indexOf(value, fromIndex);
  }

  lastIndexOf(value: string, fromIndex?: number): number {
    return this.value.lastIndexOf(value, fromIndex);
  }

  insert(offset: number, value: unknown): void {
    this.value = `${this.value.slice(0, offset)}${String(value)}${this.value.slice(offset)}`;
  }

  getLength(): number {
    return this.value.length;
  }

  replace(start: number, end: number, value: string): void {
    this.value = `${this.value.slice(0, start)}${value}${this.value.slice(end)}`;
  }

  setCharAt(index: number, value: string): void {
    this.value = `${this.value.slice(0, index)}${value.charAt(0)}${this.value.slice(index + 1)}`;
  }
}

export function cloneJointHierarchy(joints: JointNode[]): JointNode[] {
  return joints.map((joint) => ({
    name: joint.name,
    parentName: joint.parentName,
    children: cloneJointHierarchy(joint.children),
    localTransform: {
      position: clonePosition(joint.localTransform.position),
      orientation: cloneOrientation(joint.localTransform.orientation),
    },
  }));
}
