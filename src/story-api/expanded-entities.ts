import type { Scene } from "./expanded-scene";
import {
  IDENTITY_ORIENTATION,
  UNIT_SCALE,
  UNIT_SIZE,
  ZERO_POSITION,
} from "./expanded-math";
import {
  AxesImp,
  BillboardImp,
  BoxImp,
  CameraImp,
  CameraMarkerImp,
  ConeImp,
  CylinderImp,
  DiscImp,
  EntityImp,
  GroundImp,
  JointImp,
  JointedModelImp,
  MarkerImp,
  ModelImp,
  ObjectMarkerImp,
  ProgramImp,
  SceneImp,
  SphereImp,
  SunImp,
  TargetImp,
  TextModelImp,
  TorusImp,
  TransformableImp,
  type ImplementableEntity,
} from "./expanded-implementation";
import type {
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

const nonEmptyString = (value: string): boolean => typeof value === "string" && value.trim().length > 0;

type EntityImpFactory<T extends EntityImp = EntityImp> = (owner: ImplementableEntity) => T;

function joint(name: string, parentName: string | null, children: JointNode[] = []): JointNode {
  return {
    name,
    parentName,
    children,
    localTransform: {
      position: ZERO_POSITION,
      orientation: IDENTITY_ORIENTATION,
    },
  };
}

const GENERIC_JOINTS: JointNode[] = [joint("ROOT", null)];
const BIPED_JOINTS: JointNode[] = [
  joint("ROOT", null, [
    joint("PELVIS", "ROOT", [
      joint("SPINE", "PELVIS", [
        joint("CHEST", "SPINE", [
          joint("NECK", "CHEST", [joint("HEAD", "NECK")]),
          joint("LEFT_SHOULDER", "CHEST", [joint("LEFT_ELBOW", "LEFT_SHOULDER", [joint("LEFT_HAND", "LEFT_ELBOW")])]),
          joint("RIGHT_SHOULDER", "CHEST", [joint("RIGHT_ELBOW", "RIGHT_SHOULDER", [joint("RIGHT_HAND", "RIGHT_ELBOW")])]),
        ]),
      ]),
      joint("LEFT_HIP", "PELVIS", [joint("LEFT_KNEE", "LEFT_HIP", [joint("LEFT_FOOT", "LEFT_KNEE")])]),
      joint("RIGHT_HIP", "PELVIS", [joint("RIGHT_KNEE", "RIGHT_HIP", [joint("RIGHT_FOOT", "RIGHT_KNEE")])]),
    ]),
  ]),
];
const FLYER_JOINTS: JointNode[] = [joint("ROOT", null, [joint("BODY", "ROOT", [joint("HEAD", "BODY"), joint("LEFT_WING", "BODY"), joint("RIGHT_WING", "BODY"), joint("TAIL", "BODY"), joint("LEFT_LEG", "BODY"), joint("RIGHT_LEG", "BODY")])])];
const QUADRUPED_JOINTS: JointNode[] = [joint("ROOT", null, [joint("SPINE", "ROOT", [joint("NECK", "SPINE", [joint("HEAD", "NECK")]), joint("FRONT_LEFT_HIP", "SPINE", [joint("FRONT_LEFT_KNEE", "FRONT_LEFT_HIP")]), joint("FRONT_RIGHT_HIP", "SPINE", [joint("FRONT_RIGHT_KNEE", "FRONT_RIGHT_HIP")]), joint("BACK_LEFT_HIP", "SPINE", [joint("BACK_LEFT_KNEE", "BACK_LEFT_HIP")]), joint("BACK_RIGHT_HIP", "SPINE", [joint("BACK_RIGHT_KNEE", "BACK_RIGHT_HIP")]), joint("TAIL", "SPINE")])])];
const PROP_JOINTS: JointNode[] = [joint("ROOT", null, [joint("BODY", "ROOT"), joint("HANDLE", "ROOT"), joint("MARKER", "ROOT")])];
const SLITHERER_JOINTS: JointNode[] = [joint("ROOT", null, [joint("NECK", "ROOT", [joint("HEAD", "NECK", [joint("MOUTH", "HEAD"), joint("LEFT_EYE", "HEAD", [joint("LEFT_EYELID", "LEFT_EYE")]), joint("RIGHT_EYE", "HEAD", [joint("RIGHT_EYELID", "RIGHT_EYE")])])]), joint("SPINE_BASE", "ROOT", [joint("SPINE_MIDDLE", "SPINE_BASE", [joint("SPINE_UPPER", "SPINE_MIDDLE", [joint("TAIL", "SPINE_UPPER")])])])])];
const SWIMMER_JOINTS: JointNode[] = [joint("ROOT", null, [joint("NECK", "ROOT", [joint("HEAD", "NECK", [joint("MOUTH", "HEAD"), joint("LEFT_EYE", "HEAD", [joint("LEFT_EYELID", "LEFT_EYE")]), joint("RIGHT_EYE", "HEAD", [joint("RIGHT_EYELID", "RIGHT_EYE")])])]), joint("FRONT_LEFT_FIN", "ROOT"), joint("FRONT_RIGHT_FIN", "ROOT"), joint("SPINE_BASE", "ROOT", [joint("SPINE_MIDDLE", "SPINE_BASE", [joint("TAIL", "SPINE_MIDDLE")])])])];

export class SThing implements ImplementableEntity {
  #imp: EntityImp;

  constructor(impFactory: EntityImpFactory = (owner) => new EntityImp(owner)) {
    this.#imp = impFactory(this);
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
}

export class SScene extends SThing {
  constructor() {
    super((owner) => new SceneImp(owner));
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

  addSceneActivationListener(listener: (isActive: boolean, activationCount: number) => void): void {
    this.sceneImp.addSceneActivationListener(listener);
  }

  removeSceneActivationListener(listener: (isActive: boolean, activationCount: number) => void): void {
    this.sceneImp.removeSceneActivationListener(listener);
  }
}

export class STurnable extends SThing {
  constructor(impFactory: EntityImpFactory<TransformableImp> = (owner) => new TransformableImp(owner)) {
    super(impFactory);
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

  turn(direction: TurnDirection, amount: number): void {
    this.transformableImp.turn(direction, amount);
  }

  roll(direction: RollDirection, amount: number): void {
    this.transformableImp.roll(direction, amount);
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
  constructor(impFactory: EntityImpFactory<TransformableImp> = (owner) => new TransformableImp(owner)) {
    super(impFactory);
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

  move(direction: MoveDirection | Vec3, amount: number): void {
    this.transformableImp.move(direction, amount);
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

export class SCamera extends SMovableTurnable {
  constructor() {
    super((owner) => new CameraImp(owner));
  }

  protected get cameraImp(): CameraImp {
    return this.imp as CameraImp;
  }

  moveAndOrientToAGoodVantagePointOf(target: SThing, distance = 8): void {
    this.cameraImp.moveAndOrientToAGoodVantagePointOf(target.imp, distance);
  }

  get nearClippingPlaneDistance(): number {
    return this.cameraImp.nearClippingPlaneDistance.value;
  }

  set nearClippingPlaneDistance(value: number) {
    this.cameraImp.nearClippingPlaneDistance.value = value;
  }

  get farClippingPlaneDistance(): number {
    return this.cameraImp.farClippingPlaneDistance.value;
  }

  set farClippingPlaneDistance(value: number) {
    this.cameraImp.farClippingPlaneDistance.value = value;
  }

  get horizontalViewingAngle(): number {
    return this.cameraImp.horizontalViewingAngle.value;
  }

  set horizontalViewingAngle(value: number) {
    this.cameraImp.horizontalViewingAngle.value = value;
  }

  get verticalViewingAngle(): number {
    return this.cameraImp.verticalViewingAngle.value;
  }

  set verticalViewingAngle(value: number) {
    this.cameraImp.verticalViewingAngle.value = value;
  }
}

export class SModel extends SMovableTurnable {
  constructor(impFactory: EntityImpFactory<ModelImp> = (owner) => new ModelImp(owner)) {
    super(impFactory);
  }

  protected get modelImp(): ModelImp {
    return this.imp as ModelImp;
  }

  get size(): Size {
    return this.modelImp.size.value;
  }

  set size(value: Size) {
    this.modelImp.size.value = value;
  }

  get scale(): Size {
    return this.modelImp.scale.value;
  }

  set scale(value: Size) {
    this.modelImp.setScale(value);
  }

  get vehicle(): SThing | null {
    return (this.imp.vehicle?.owner as SThing | undefined) ?? null;
  }

  set vehicle(value: SThing | null) {
    if (value === null || value instanceof SThing) {
      this.imp.setVehicle(value?.imp ?? null);
    }
  }

  get color(): string {
    return this.modelImp.color.value;
  }

  set color(value: string) {
    if (nonEmptyString(value)) {
      this.modelImp.color.value = value;
    }
  }

  get opacity(): number {
    return this.modelImp.opacity.value;
  }

  set opacity(value: number) {
    this.modelImp.opacity.value = value;
  }

  get width(): number {
    return this.size.width;
  }

  set width(value: number) {
    this.modelImp.setWidth(value);
  }

  get height(): number {
    return this.size.height;
  }

  set height(value: number) {
    this.modelImp.setHeight(value);
  }

  get depth(): number {
    return this.size.depth;
  }

  set depth(value: number) {
    this.modelImp.setDepth(value);
  }

  resize(factor: number): void {
    this.modelImp.resize(factor);
  }

  resizeWidth(factor: number): void {
    this.modelImp.resizeWidth(factor);
  }

  resizeHeight(factor: number): void {
    this.modelImp.resizeHeight(factor);
  }

  resizeDepth(factor: number): void {
    this.modelImp.resizeDepth(factor);
  }

  say(text: string, duration = 0): void {
    this.modelImp.say(text, duration);
  }

  think(text: string, duration = 0): void {
    this.modelImp.think(text, duration);
  }

  get speechBubble(): SpeechBubbleState | null {
    return this.modelImp.speechBubble.value;
  }

  get lastSpokenText(): string | null {
    return this.modelImp.lastSpokenText.value;
  }

  get lastThoughtText(): string | null {
    return this.modelImp.lastThoughtText.value;
  }
}

export abstract class SShape extends SModel {}
export class SBox extends SShape { constructor() { super((owner) => new BoxImp(owner)); } }
export class SSphere extends SShape { constructor() { super((owner) => new SphereImp(owner)); } protected get sphereImp(): SphereImp { return this.imp as SphereImp; } get radius(): number { return this.sphereImp.radius.value; } set radius(value: number) { this.sphereImp.radius.value = value; } }
export class SDisc extends SShape { constructor() { super((owner) => new DiscImp(owner)); } protected get discImp(): DiscImp { return this.imp as DiscImp; } get radius(): number { return this.discImp.outerRadius.value; } set radius(value: number) { this.discImp.outerRadius.value = value; } }
export class SCone extends SShape { constructor() { super((owner) => new ConeImp(owner)); } protected get coneImp(): ConeImp { return this.imp as ConeImp; } get baseRadius(): number { return this.coneImp.baseRadius.value; } set baseRadius(value: number) { this.coneImp.baseRadius.value = value; } get length(): number { return this.coneImp.length.value; } set length(value: number) { this.coneImp.length.value = value; } }
export class SCylinder extends SShape { constructor() { super((owner) => new CylinderImp(owner)); } protected get cylinderImp(): CylinderImp { return this.imp as CylinderImp; } get radius(): number { return this.cylinderImp.radius.value; } set radius(value: number) { this.cylinderImp.radius.value = value; } get length(): number { return this.cylinderImp.length.value; } set length(value: number) { this.cylinderImp.length.value = value; } }
export class STorus extends SShape { constructor() { super((owner) => new TorusImp(owner)); } protected get torusImp(): TorusImp { return this.imp as TorusImp; } get innerRadius(): number { return this.torusImp.innerRadius.value; } set innerRadius(value: number) { this.torusImp.innerRadius.value = value; } get outerRadius(): number { return this.torusImp.outerRadius.value; } set outerRadius(value: number) { this.torusImp.outerRadius.value = value; } }
export class SAxes extends SShape { constructor() { super((owner) => new AxesImp(owner)); } }
export class SBillboard extends SModel { constructor() { super((owner) => new BillboardImp(owner)); } protected get billboardImp(): BillboardImp { return this.imp as BillboardImp; } get backPaint(): string { return this.billboardImp.backPaint.value; } set backPaint(value: string) { if (nonEmptyString(value)) { this.billboardImp.backPaint.value = value; } } }
export class STextModel extends SModel { constructor() { super((owner) => new TextModelImp(owner)); } protected get textModelImp(): TextModelImp { return this.imp as TextModelImp; } get value(): string { return this.textModelImp.value; } set value(text: string) { this.textModelImp.value = text; } append(value: unknown): void { this.textModelImp.append(value); } charAt(index: number): string { return this.textModelImp.charAt(index); } delete(start: number, end: number): void { this.textModelImp.delete(start, end); } deleteCharAt(index: number): void { this.textModelImp.deleteCharAt(index); } indexOf(value: string, fromIndex?: number): number { return this.textModelImp.indexOf(value, fromIndex); } lastIndexOf(value: string, fromIndex?: number): number { return this.textModelImp.lastIndexOf(value, fromIndex); } insert(offset: number, value: unknown): void { this.textModelImp.insert(offset, value); } get length(): number { return this.textModelImp.getLength(); } replace(start: number, end: number, value: string): void { this.textModelImp.replace(start, end, value); } setCharAt(index: number, value: string): void { this.textModelImp.setCharAt(index, value); } }

export class SMarker extends SMovableTurnable {
  constructor(impFactory: EntityImpFactory<MarkerImp> = (owner) => new MarkerImp(owner)) {
    super(impFactory);
  }

  protected get markerImp(): MarkerImp {
    return this.imp as MarkerImp;
  }

  get size(): Size {
    return this.markerImp.size.value;
  }

  set size(value: Size) {
    this.markerImp.size.value = value;
  }

  get colorId(): string {
    return this.markerImp.color.value;
  }

  set colorId(value: string) {
    if (nonEmptyString(value)) {
      this.markerImp.color.value = value;
    }
  }

  get opacity(): number {
    return this.markerImp.opacity.value;
  }

  set opacity(value: number) {
    this.markerImp.opacity.value = value;
  }
}

export class SThingMarker extends SMarker { constructor() { super((owner) => new ObjectMarkerImp(owner)); } }
export class SCameraMarker extends SMarker { constructor() { super((owner) => new CameraMarkerImp(owner)); } }
export class STarget extends SMovableTurnable { constructor() { super((owner) => new TargetImp(owner)); } }
export class SSun extends STurnable { constructor() { super((owner) => new SunImp(owner)); } }

export class SJoint extends SMovableTurnable {
  readonly name: string;
  readonly parent?: string;

  constructor(jointImp: JointImp) {
    super(() => jointImp);
    const jointId = jointImp.getJointId();
    this.name = jointId.name;
    this.parent = jointId.parent;
  }

  protected get jointImp(): JointImp {
    return this.imp as JointImp;
  }

  get isPivotVisible(): boolean {
    return this.jointImp.pivotVisible.value;
  }

  set isPivotVisible(value: boolean) {
    this.jointImp.pivotVisible.value = value;
  }

  get width(): number { return this.jointImp.size.value.width; }
  get height(): number { return this.jointImp.size.value.height; }
  get depth(): number { return this.jointImp.size.value.depth; }
}

export class SJointedModel extends SModel {
  readonly #jointCache = new Map<string, SJoint>();

  constructor(jointHierarchy: JointNode[] = GENERIC_JOINTS) {
    super((owner) => new JointedModelImp(owner, jointHierarchy));
  }

  protected get jointedModelImp(): JointedModelImp {
    return this.imp as JointedModelImp;
  }

  getJoint(name: string): JointId | undefined {
    return this.jointedModelImp.getJoint(name);
  }

  getJointEntity(name: string): SJoint | undefined {
    const key = name.toUpperCase();
    const cached = this.#jointCache.get(key);
    if (cached) return cached;
    const jointImp = this.jointedModelImp.getJointImplementation(name);
    if (!jointImp) return undefined;
    const jointEntity = new SJoint(jointImp);
    this.#jointCache.set(key, jointEntity);
    return jointEntity;
  }

  getJoints(): readonly SJoint[] {
    return this.jointedModelImp.getJoints().map((jointImp) => this.getJointEntity(jointImp.getJointId().name)!);
  }

  getJointHierarchy(): JointNode[] {
    return this.jointedModelImp.jointHierarchy;
  }

  straightenOutJoints(): void {
    this.jointedModelImp.straightenOutJoints();
  }

  strikePose(pose: Record<string, Partial<{ position: Position; orientation: Orientation }>>): void {
    this.jointedModelImp.strikePose(pose);
  }
}

export class SBiped extends SJointedModel { constructor() { super(BIPED_JOINTS); } }
export class SFlyer extends SJointedModel { constructor() { super(FLYER_JOINTS); } }
export class SQuadruped extends SJointedModel { constructor() { super(QUADRUPED_JOINTS); } }
export class SProp extends SJointedModel { constructor() { super(PROP_JOINTS); } }
export class SSlitherer extends SJointedModel { constructor() { super(SLITHERER_JOINTS); } get head(): SJoint | undefined { return this.getJointEntity("HEAD"); } get tail(): SJoint | undefined { return this.getJointEntity("TAIL"); } }
export class SSwimmer extends SJointedModel { constructor() { super(SWIMMER_JOINTS); } swimTo(entity: SThing): void { this.moveAndOrientTo(entity); } get tail(): SJoint | undefined { return this.getJointEntity("TAIL"); } }

export class SProgram {
  #imp = new ProgramImp();

  get imp(): ProgramImp {
    return this.#imp;
  }

  get activeScene(): Scene | null {
    return this.#imp.activeScene as Scene | null;
  }

  setActiveScene(scene: Scene | null): void {
    this.#imp.setActiveScene(scene);
  }

  get simulationSpeedFactor(): number {
    return this.#imp.simulationSpeedFactor;
  }

  set simulationSpeedFactor(value: number) {
    this.#imp.simulationSpeedFactor = value;
  }
}

export const STORY_API_DEFAULTS = {
  position: ZERO_POSITION,
  orientation: IDENTITY_ORIENTATION,
  size: UNIT_SIZE,
  scale: UNIT_SCALE,
};
