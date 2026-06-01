import type { AnimationClip, AnimationObserver, AnimationStyleLike } from "../animation";
import {
  EntityImp,
  GroundImp,
  SceneImp,
  TransformableImp,
  type ImplementableEntity,
} from "./expanded-implementation";
import type {
  MoveDirection,
  Orientation,
  Position,
  RollDirection,
  SpatialRelation,
  TurnDirection,
  Vec3,
  BoundingBox,
} from "./expanded-types";
import type {
  MouseClickOnScreenEvent,
  MouseClickOnObjectEvent,
  KeyListenerEvent,
  ArrowKeyEvent,
  NumberKeyEvent,
  PointOfViewChangeEvent,
  CollisionTransitionEvent,
  ProximityTransitionEvent,
  OcclusionEvent,
  ViewEvent,
} from "../story-api-events/shared";

const nonEmptyString = (value: string): boolean => typeof value === "string" && value.trim().length > 0;

export type EntityImpFactory<T extends EntityImp = EntityImp> = (owner: ImplementableEntity) => T;
export type NamedEntityImpFactory<T extends EntityImp = EntityImp> = string | null | EntityImpFactory<T>;

function isEntityImpFactory<T extends EntityImp>(value: NamedEntityImpFactory<T> | undefined): value is EntityImpFactory<T> {
  return typeof value === "function";
}

export class SThing implements ImplementableEntity {
  #imp: EntityImp;

  constructor(
    nameOrImpFactory: NamedEntityImpFactory = (owner) => new EntityImp(owner),
    impFactory?: EntityImpFactory,
  ) {
    const factory = isEntityImpFactory(nameOrImpFactory)
      ? nameOrImpFactory
      : impFactory ?? ((owner: ImplementableEntity) => new EntityImp(owner));
    this.#imp = factory(this);
    if (!isEntityImpFactory(nameOrImpFactory) && nameOrImpFactory !== undefined) {
      this.setName(nameOrImpFactory);
    }
  }

  get imp(): EntityImp {
    return this.#imp;
  }

  get name(): string | null {
    return this.imp.name;
  }

  set name(value: string | null) {
    this.imp.name = value;
  }

  getName(): string | null {
    return this.name;
  }

  setName(value: string | null): void {
    this.name = value;
  }

  getProperty<T>(name: string): T | undefined {
    return this.imp.getProperty<T>(name)?.value;
  }

  get isShowing(): boolean {
    return this.imp.isShowingProperty.value;
  }

  set isShowing(value: boolean) {
    this.imp.isShowingProperty.value = value;
  }

  delay(duration: number): void {
    this.imp.delay(duration);
  }

  playAudio(audioSource: string): void {
    this.imp.playAudio(audioSource);
  }

  isCollidingWith(other: SThing): boolean {
    return this.imp.isCollidingWith(other.imp);
  }

  getBooleanFromUser(message: string): boolean {
    return this.imp.getBooleanFromUser(message);
  }

  getStringFromUser(message: string): string {
    return this.imp.getStringFromUser(message);
  }

  getDoubleFromUser(message: string): number {
    return this.imp.getDoubleFromUser(message);
  }

  getIntegerFromUser(message: string): number {
    return this.imp.getIntegerFromUser(message);
  }

  toString(): string {
    return this.name ?? `unnamed ${this.constructor.name}`;
  }

  getVehicle(): SThing | null {
    return (this.imp.vehicle?.owner as SThing | undefined) ?? null;
  }

  getVantagePoint(): Position {
    return this.imp.getAbsolutePosition();
  }

  getCollisionHull(): BoundingBox | null {
    return this.imp.getBoundingBox();
  }
}

export class SGround extends SThing {
  constructor() {
    super((owner) => new GroundImp(owner));
  }

  protected get groundImp(): GroundImp {
    return this.imp as GroundImp;
  }

  get opacity(): number {
    return this.groundImp.opacity.value;
  }

  set opacity(value: number) {
    this.groundImp.opacity.value = value;
  }

  setVehicle(vehicle: SThing | null): void {
    this.imp.setVehicle(vehicle?.imp ?? null);
  }
}

export class SScene extends SThing {
  constructor(name?: string | null) {
    super(name ?? null, (owner) => new SceneImp(owner));
  }

  protected get sceneImp(): SceneImp {
    return this.imp as SceneImp;
  }

  get atmosphereColor(): string | null {
    return this.sceneImp.atmosphereColor.value;
  }

  set atmosphereColor(value: string | null) {
    if (value === null || nonEmptyString(value)) {
      this.sceneImp.atmosphereColor.value = value;
    }
  }

  get ambientLightColor(): string | null {
    return this.sceneImp.fromAboveLightColor.value;
  }

  set ambientLightColor(value: string | null) {
    if (value === null || nonEmptyString(value)) {
      this.sceneImp.fromAboveLightColor.value = value;
    }
  }

  get fromAboveLightColor(): string | null {
    return this.sceneImp.fromAboveLightColor.value;
  }

  set fromAboveLightColor(value: string | null) {
    if (value === null || nonEmptyString(value)) {
      this.sceneImp.fromAboveLightColor.value = value;
    }
  }

  get fromBelowLightColor(): string | null {
    return this.sceneImp.fromBelowLightColor.value;
  }

  set fromBelowLightColor(value: string | null) {
    if (value === null || nonEmptyString(value)) {
      this.sceneImp.fromBelowLightColor.value = value;
    }
  }

  get fogDensity(): number {
    return this.sceneImp.fogDensity.value;
  }

  set fogDensity(value: number) {
    this.sceneImp.fogDensity.value = value;
  }

  getAtmosphereColor(): string | null {
    return this.atmosphereColor;
  }

  setAtmosphereColor(value: string | null): void {
    this.atmosphereColor = value;
  }

  getAmbientLightColor(): string | null {
    return this.ambientLightColor;
  }

  setAmbientLightColor(value: string | null): void {
    this.ambientLightColor = value;
  }

  getFromAboveLightColor(): string | null {
    return this.fromAboveLightColor;
  }

  setFromAboveLightColor(value: string | null): void {
    this.fromAboveLightColor = value;
  }

  getFromBelowLightColor(): string | null {
    return this.fromBelowLightColor;
  }

  setFromBelowLightColor(value: string | null): void {
    this.fromBelowLightColor = value;
  }

  getFogDensity(): number {
    return this.fogDensity;
  }

  setFogDensity(value: number): void {
    this.fogDensity = value;
  }

  addSceneActivationListener(listener: (isActive: boolean, activationCount: number) => void): void {
    this.sceneImp.addSceneActivationListener(listener);
  }

  removeSceneActivationListener(listener: (isActive: boolean, activationCount: number) => void): void {
    this.sceneImp.removeSceneActivationListener(listener);
  }

  readonly #objectAdditionListeners = new Set<(entity: SThing) => void>();
  readonly #timeListeners = new Set<(time: number) => void>();

  addObjectAdditionListener(listener: (entity: SThing) => void): void {
    this.#objectAdditionListeners.add(listener);
  }

  removeObjectAdditionListener(listener: (entity: SThing) => void): void {
    this.#objectAdditionListeners.delete(listener);
  }

  addTimeListener(listener: (time: number) => void): void {
    this.#timeListeners.add(listener);
  }

  removeTimeListener(listener: (time: number) => void): void {
    this.#timeListeners.delete(listener);
  }

  // ── Simple listeners (scene-level, Set<callback>) ──

  readonly #mouseClickOnScreenListeners = new Set<(event: MouseClickOnScreenEvent) => void>();
  readonly #mouseClickOnObjectListeners = new Set<(event: MouseClickOnObjectEvent) => void>();
  readonly #keyPressListeners = new Set<(event: KeyListenerEvent) => void>();
  readonly #arrowKeyPressListeners = new Set<(event: ArrowKeyEvent) => void>();
  readonly #numberKeyPressListeners = new Set<(event: NumberKeyEvent) => void>();
  readonly #pointOfViewChangeListeners = new Set<(event: PointOfViewChangeEvent) => void>();

  addMouseClickOnScreenListener(listener: (event: MouseClickOnScreenEvent) => void): void {
    this.#mouseClickOnScreenListeners.add(listener);
  }

  removeMouseClickOnScreenListener(listener: (event: MouseClickOnScreenEvent) => void): void {
    this.#mouseClickOnScreenListeners.delete(listener);
  }

  addMouseClickOnObjectListener(listener: (event: MouseClickOnObjectEvent) => void): void {
    this.#mouseClickOnObjectListeners.add(listener);
  }

  removeMouseClickOnObjectListener(listener: (event: MouseClickOnObjectEvent) => void): void {
    this.#mouseClickOnObjectListeners.delete(listener);
  }

  addKeyPressListener(listener: (event: KeyListenerEvent) => void): void {
    this.#keyPressListeners.add(listener);
  }

  removeKeyPressListener(listener: (event: KeyListenerEvent) => void): void {
    this.#keyPressListeners.delete(listener);
  }

  addArrowKeyPressListener(listener: (event: ArrowKeyEvent) => void): void {
    this.#arrowKeyPressListeners.add(listener);
  }

  removeArrowKeyPressListener(listener: (event: ArrowKeyEvent) => void): void {
    this.#arrowKeyPressListeners.delete(listener);
  }

  addNumberKeyPressListener(listener: (event: NumberKeyEvent) => void): void {
    this.#numberKeyPressListeners.add(listener);
  }

  removeNumberKeyPressListener(listener: (event: NumberKeyEvent) => void): void {
    this.#numberKeyPressListeners.delete(listener);
  }

  addPointOfViewChangeListener(listener: (event: PointOfViewChangeEvent) => void): void {
    this.#pointOfViewChangeListeners.add(listener);
  }

  removePointOfViewChangeListener(listener: (event: PointOfViewChangeEvent) => void): void {
    this.#pointOfViewChangeListeners.delete(listener);
  }

  // ── Entity-bound listeners (Map<SThing, Set<callback>>) ──

  readonly #collisionStartListeners = new Map<SThing, Set<(event: CollisionTransitionEvent) => void>>();
  readonly #collisionEndListeners = new Map<SThing, Set<(event: CollisionTransitionEvent) => void>>();
  readonly #occlusionStartListeners = new Map<SThing, Set<(event: OcclusionEvent) => void>>();
  readonly #occlusionEndListeners = new Map<SThing, Set<(event: OcclusionEvent) => void>>();
  readonly #whileInViewListeners = new Map<SThing, Set<(event: ViewEvent) => void>>();
  readonly #whileOcclusionListeners = new Map<SThing, Set<(event: OcclusionEvent) => void>>();

  #addEntityListener<E>(store: Map<SThing, Set<(event: E) => void>>, entity: SThing, listener: (event: E) => void): void {
    let listeners = store.get(entity);
    if (!listeners) {
      listeners = new Set();
      store.set(entity, listeners);
    }
    listeners.add(listener);
  }

  #removeEntityListener<E>(store: Map<SThing, Set<(event: E) => void>>, entity: SThing, listener: (event: E) => void): void {
    const listeners = store.get(entity);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) store.delete(entity);
  }

  addCollisionStartListener(entity: SThing, listener: (event: CollisionTransitionEvent) => void): void {
    this.#addEntityListener(this.#collisionStartListeners, entity, listener);
  }

  removeCollisionStartListener(entity: SThing, listener: (event: CollisionTransitionEvent) => void): void {
    this.#removeEntityListener(this.#collisionStartListeners, entity, listener);
  }

  addCollisionEndListener(entity: SThing, listener: (event: CollisionTransitionEvent) => void): void {
    this.#addEntityListener(this.#collisionEndListeners, entity, listener);
  }

  removeCollisionEndListener(entity: SThing, listener: (event: CollisionTransitionEvent) => void): void {
    this.#removeEntityListener(this.#collisionEndListeners, entity, listener);
  }

  addOcclusionStartListener(entity: SThing, listener: (event: OcclusionEvent) => void): void {
    this.#addEntityListener(this.#occlusionStartListeners, entity, listener);
  }

  removeOcclusionStartListener(entity: SThing, listener: (event: OcclusionEvent) => void): void {
    this.#removeEntityListener(this.#occlusionStartListeners, entity, listener);
  }

  addOcclusionEndListener(entity: SThing, listener: (event: OcclusionEvent) => void): void {
    this.#addEntityListener(this.#occlusionEndListeners, entity, listener);
  }

  removeOcclusionEndListener(entity: SThing, listener: (event: OcclusionEvent) => void): void {
    this.#removeEntityListener(this.#occlusionEndListeners, entity, listener);
  }

  addWhileInViewListener(entity: SThing, listener: (event: ViewEvent) => void): void {
    this.#addEntityListener(this.#whileInViewListeners, entity, listener);
  }

  removeWhileInViewListener(entity: SThing, listener: (event: ViewEvent) => void): void {
    this.#removeEntityListener(this.#whileInViewListeners, entity, listener);
  }

  addWhileOcclusionListener(entity: SThing, listener: (event: OcclusionEvent) => void): void {
    this.#addEntityListener(this.#whileOcclusionListeners, entity, listener);
  }

  removeWhileOcclusionListener(entity: SThing, listener: (event: OcclusionEvent) => void): void {
    this.#removeEntityListener(this.#whileOcclusionListeners, entity, listener);
  }

  // ── Proximity listeners (Map<SThing, Map<callback, distance>>) ──

  readonly #proximityEnterListeners = new Map<SThing, Map<(event: ProximityTransitionEvent) => void, number>>();
  readonly #proximityExitListeners = new Map<SThing, Map<(event: ProximityTransitionEvent) => void, number>>();

  #addProximityListener(
    store: Map<SThing, Map<(event: ProximityTransitionEvent) => void, number>>,
    entity: SThing,
    distance: number,
    listener: (event: ProximityTransitionEvent) => void,
  ): void {
    let listeners = store.get(entity);
    if (!listeners) {
      listeners = new Map();
      store.set(entity, listeners);
    }
    listeners.set(listener, distance);
  }

  #removeProximityListener(
    store: Map<SThing, Map<(event: ProximityTransitionEvent) => void, number>>,
    entity: SThing,
    listener: (event: ProximityTransitionEvent) => void,
  ): void {
    const listeners = store.get(entity);
    if (!listeners) return;
    listeners.delete(listener);
    if (listeners.size === 0) store.delete(entity);
  }

  addProximityEnterListener(entity: SThing, distance: number, listener: (event: ProximityTransitionEvent) => void): void {
    this.#addProximityListener(this.#proximityEnterListeners, entity, distance, listener);
  }

  removeProximityEnterListener(entity: SThing, listener: (event: ProximityTransitionEvent) => void): void {
    this.#removeProximityListener(this.#proximityEnterListeners, entity, listener);
  }

  addProximityExitListener(entity: SThing, distance: number, listener: (event: ProximityTransitionEvent) => void): void {
    this.#addProximityListener(this.#proximityExitListeners, entity, distance, listener);
  }

  removeProximityExitListener(entity: SThing, listener: (event: ProximityTransitionEvent) => void): void {
    this.#removeProximityListener(this.#proximityExitListeners, entity, listener);
  }
}

export class STurnable extends SThing {
  constructor(
    nameOrImpFactory: NamedEntityImpFactory<TransformableImp> = (owner) => new TransformableImp(owner),
    impFactory?: EntityImpFactory<TransformableImp>,
  ) {
    super(
      nameOrImpFactory as NamedEntityImpFactory,
      impFactory ?? ((owner) => new TransformableImp(owner)),
    );
  }

  protected get transformableImp(): TransformableImp {
    return this.imp as TransformableImp;
  }

  get orientation(): Orientation {
    return this.transformableImp.orientation.value;
  }

  set orientation(value: Orientation) {
    this.transformableImp.orientation.value = value;
  }

  getOrientation(): Orientation {
    return this.orientation;
  }

  setOrientation(value: Orientation): void {
    this.orientation = value;
  }

  turn(
    direction: TurnDirection,
    amount: number,
    duration = 0,
    style?: AnimationStyleLike,
    observer?: AnimationObserver,
  ): AnimationClip | null {
    return this.transformableImp.turn(direction, amount, duration, style, observer);
  }

  roll(
    direction: RollDirection,
    amount: number,
    duration = 0,
    style?: AnimationStyleLike,
    observer?: AnimationObserver,
  ): AnimationClip | null {
    return this.transformableImp.roll(direction, amount, duration, style, observer);
  }

  turnToFace(target: SThing): void {
    this.transformableImp.turnToFace(target.imp);
  }

  pointAt(target: SThing): void {
    this.transformableImp.pointAt(target.imp);
  }

  orientTo(target: SThing): void {
    this.transformableImp.orientTo(target.imp);
  }

  orientToUpright(): void {
    this.transformableImp.orientToUpright();
  }

  get orientationRelativeToVehicle(): Orientation {
    return this.orientation;
  }

  set orientationRelativeToVehicle(value: Orientation) {
    this.orientation = value;
  }

  isFacing(other: SThing): boolean {
    return this.transformableImp.isFacing(other.imp);
  }

  getDistanceTo(other: SThing): number {
    return this.imp.getDistanceTo(other.imp);
  }

  getDistanceAbove(other: SThing): number {
    return this.imp.getDistanceAbove(other.imp);
  }

  isAbove(other: SThing): boolean {
    return this.getDistanceAbove(other) > 0;
  }

  getDistanceBelow(other: SThing): number {
    return this.imp.getDistanceBelow(other.imp);
  }

  isBelow(other: SThing): boolean {
    return this.getDistanceBelow(other) > 0;
  }

  getDistanceToTheRightOf(other: SThing): number {
    return this.imp.getDistanceToTheRightOf(other.imp);
  }

  isToTheRightOf(other: SThing): boolean {
    return this.getDistanceToTheRightOf(other) > 0;
  }

  getDistanceToTheLeftOf(other: SThing): number {
    return this.imp.getDistanceToTheLeftOf(other.imp);
  }

  isToTheLeftOf(other: SThing): boolean {
    return this.getDistanceToTheLeftOf(other) > 0;
  }

  getDistanceInFrontOf(other: SThing): number {
    return this.imp.getDistanceInFrontOf(other.imp);
  }

  isInFrontOf(other: SThing): boolean {
    return this.getDistanceInFrontOf(other) > 0;
  }

  getDistanceBehind(other: SThing): number {
    return this.imp.getDistanceBehind(other.imp);
  }

  isBehind(other: SThing): boolean {
    return this.getDistanceBehind(other) > 0;
  }
}

export class SMovableTurnable extends STurnable {
  constructor(
    nameOrImpFactory: NamedEntityImpFactory<TransformableImp> = (owner) => new TransformableImp(owner),
    impFactory?: EntityImpFactory<TransformableImp>,
  ) {
    super(
      nameOrImpFactory as NamedEntityImpFactory<TransformableImp>,
      impFactory ?? ((owner) => new TransformableImp(owner)),
    );
  }

  get paint(): string {
    return this.transformableImp.paint.value;
  }

  set paint(value: string) {
    if (nonEmptyString(value)) {
      this.transformableImp.paint.value = value;
    }
  }

  get position(): Position {
    return this.transformableImp.position.value;
  }

  set position(value: Position) {
    this.transformableImp.position.value = value;
  }

  getPosition(): Position {
    return this.position;
  }

  setPosition(value: Position): void {
    this.position = value;
  }

  move(
    direction: MoveDirection | Vec3,
    amount: number,
    duration = 0,
    style?: AnimationStyleLike,
    observer?: AnimationObserver,
  ): AnimationClip | null {
    return this.transformableImp.move(direction, amount, duration, style, observer);
  }

  moveToward(target: SThing, amount: number): void {
    this.transformableImp.moveToward(target.imp, amount);
  }

  moveAwayFrom(target: SThing, amount: number): void {
    this.transformableImp.moveAwayFrom(target.imp, amount);
  }

  moveTo(target: SThing): void {
    this.transformableImp.moveTo(target.imp);
  }

  moveAndOrientTo(target: SThing): void {
    this.transformableImp.moveAndOrientTo(target.imp);
  }

  place(spatialRelation: SpatialRelation, target: SThing, offset = 0): void {
    this.transformableImp.place(spatialRelation, target.imp, offset);
  }

  get positionRelativeToVehicle(): Position {
    return this.position;
  }

  set positionRelativeToVehicle(value: Position) {
    this.position = value;
  }
}
